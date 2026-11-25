// Over Under, rolling (game 16): every rule of the queue, the schedule files and the score, as pure functions.
// No network, no clock, no randomness, no files; whole numbers only. The recorder and the page use this one file.
//
// RULES (owner decisions D-325 to D-357, D-370, D-383, D-392 to D-398; design note claude/newgames/REPLY-NEWGAMES-M73-2026-11-19.md)
// - A new game starts every 30 minutes (on :00 and :30 UTC). One game = one producer = one Picks round (round r starts at
//   r x 1,800,000 ms). A game is exactly 14,400 blocks (about 12 hours). Up to 24 run at once; 3 or 4 are open for picks.
// - Picks (kind 3): 1 = Over, 2 = Under. Open 2 hours before the start, lock 5 minutes before. No changes (max_changes 0).
// - The queue: the producer whose last start is longest ago plays next. A producer goes to the bottom at the START of its
//   game (D-342). A producer off the list at its turn is skipped and keeps its place (D-343). A producer with 2 games
//   already running is skipped the same way. A new entrant goes to the bottom. A cancelled start leaves the queue unchanged.
// - Each start gets ONE write-once schedule file, written 3 h 33 min to 2 h 20 min before the start (D-370 as changed by D-732:
//   2 or 3 tries per game, so one late data read or one missed run no longer cancels it).
//   A file made later than 2 h 15 min before the start is invalid: that game is cancelled for everyone (D-344).
// - 1 point per right pick (D-275). A count exactly on the line, and a void game, are skipped (D-287).
// - A game belongs to the week it STARTS in (week changes Sun 7 PM ET = Mon 00:00 UTC).
/** FNV-1a (64 bit) of a string, as 16 hex digits: a checksum that a schedule file is the one that was published (not a secret). */
export function fnv64(s) {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(s)) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, "0");
}

export const GAME = 16;
export const SLOT = 1800000;                       // Picks round_size: 30 minutes
export const GAME_MS = 12 * 3600000;               // a game runs about 12 hours
export const GAME_BLOCKS = 14400;                  // exactly this many blocks, from blockAt(start)
export const AHEAD = 7200000;                      // picks open 2 hours before the start
export const LEAD = 300000;                        // and lock 5 minutes before it
export const MAX_CHANGES = 0;
export const MAX_RUNNING_PER_PRODUCER = 2;
export const MIN = 60000;
// The kit's manifest settings (Architecture's rolling-rounds draft); the recorder passes the manifest's numbers in.
export const SCHEDULE_FROM_MIN = 213;              // 3 h 33 min before the start
export const SCHEDULE_TO_MIN = 140;                // 2 h 20 min before the start (D-732; was 183)
export const CANCEL_AFTER_MIN = 135;               // later than 2 h 15 min before the start = cancelled
export const SCHEDULE_VERSION = 1;
export const WEEK_MS = 604800000;
export const WEEK0 = 1792368000000;                // Mon 19 Oct 2026 00:00 UTC = week 0 (the Ruler's weekOfStart)
export const MILLION = 1000000n;
export const OVER = 1, UNDER = 2;

export const isAddr = (a) => typeof a === "string" && /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a);

// ── rounds and times ──
export function roundOfStart(startMs) {
  if (!Number.isSafeInteger(startMs) || startMs < 0 || startMs % SLOT !== 0) throw new Error(`a start must be a whole 30-minute slot (:00 or :30 UTC): ${startMs}`);
  return startMs / SLOT;
}
export const startOfRound = (r) => { if (!Number.isSafeInteger(r) || r < 0) throw new Error(`bad round ${r}`); return r * SLOT; };
export const opensAt = (start) => start - AHEAD;
export const locksAt = (start) => start - LEAD;
export const endsAt = (start) => start + GAME_MS;
/** The window in which a start's schedule file must be written (first run inside it writes it). */
export const writeWindow = (start, fromMin = SCHEDULE_FROM_MIN, toMin = SCHEDULE_TO_MIN) => [start - fromMin * MIN, start - toMin * MIN];
export const weekOfStart = (startMs) => Math.floor((startMs - WEEK0) / WEEK_MS);
/** Starts whose picks are open at time t: 3 or 4, never more than 4 (the page says "3 or 4 open"). */
export function openStarts(t) {
  const first = Math.floor((t + LEAD) / SLOT) * SLOT + (((t + LEAD) % SLOT) === 0 ? 0 : SLOT);
  const out = [];
  for (let s = first; s - AHEAD <= t; s += SLOT) if (t >= opensAt(s) && t < locksAt(s)) out.push(s);
  return out;
}

// ── the queue ──
// state = { launched: bool, initial: [addr], last: { addr: startMs } }  (rebuilt from the valid schedule files, in start order)
export const emptyState = () => ({ launched: false, initial: [], last: {} });

/** Who plays the start at T. games = every earlier valid game {producer, start}. Returns { producer|null, state }. The input state is not changed. */
export function step(state, listed, T, games = []) {
  const addrs = [...new Set(listed)].filter(isAddr).sort();
  const st = { launched: state.launched, initial: state.initial.slice(), last: { ...state.last } };
  if (!st.launched) st.initial = addrs.slice();
  for (const a of addrs) {
    if (st.last[a] === undefined && st.launched && !st.initial.includes(a)) st.last[a] = T;   // a new entrant goes to the bottom
  }
  const running = (a) => games.filter((g) => g.producer === a && g.start < T && T < endsAt(g.start)).length;
  const order = addrs.slice().sort((x, y) => {
    const lx = st.last[x], ly = st.last[y];
    if (lx === undefined && ly === undefined) return x < y ? -1 : x > y ? 1 : 0;   // never played: by address
    if (lx === undefined) return -1;
    if (ly === undefined) return 1;
    return lx - ly || (x < y ? -1 : x > y ? 1 : 0);
  });
  const who = order.find((a) => running(a) < MAX_RUNNING_PER_PRODUCER) ?? null;
  if (who === null) return { producer: null, state: st };   // no game at this start
  st.launched = true;
  st.last[who] = T;                                          // to the bottom at the START of its game
  return { producer: who, state: st };
}

/** The queue state read back from a schedule file: refused loudly unless it is exactly the shape step() returns. */
export function checkState(st) {
  const bad = (why) => { throw new Error(`Over Under: a schedule file's queue state is not valid (${why})`); };
  if (st === null || typeof st !== "object" || Array.isArray(st)) bad("not an object");
  if (Object.keys(st).sort().join() !== "initial,last,launched") bad("keys");
  if (typeof st.launched !== "boolean") bad("launched");
  if (!Array.isArray(st.initial) || !st.initial.every(isAddr)) bad("initial");
  if (st.last === null || typeof st.last !== "object" || Array.isArray(st.last)) bad("last");
  for (const [a, t] of Object.entries(st.last)) if (!isAddr(a) || !Number.isSafeInteger(t) || t < 0) bad("last " + a);
  return { launched: st.launched, initial: st.initial.slice(), last: { ...st.last } };
}

// ── schedule files ──
export const cardKey = (round, w0, w1, l) => `${GAME}|${round}|${w0}|${w1}|${l}`;
const canonEntry = (e) => [e.v, e.game, e.round, e.start, e.producer, e.w0, e.w1, e.l, e.cardKey, e.line, e.form, e.madeAt].join(",");
export function makeEntry({ start, producer, w0, w1, l, line, form, madeAt }) {
  if (!isAddr(producer)) throw new Error("schedule: bad producer address");
  for (const [k, x] of Object.entries({ w0, w1, l, line, form, madeAt })) if (!Number.isSafeInteger(x) || x < 0) throw new Error(`schedule: ${k} must be a whole number >= 0`);
  if (line % 2 !== 1) throw new Error("schedule: a line is an odd number of half blocks");
  const round = roundOfStart(start);
  const e = { v: SCHEDULE_VERSION, game: GAME, round, start, producer, w0, w1, l, cardKey: cardKey(round, w0, w1, l), line, form, madeAt };
  return { ...e, sum: fnv64(canonEntry(e)) };
}
/** Is a schedule file valid? Returns { ok, why }. Late = made after start - cancelAfterMin: that game is cancelled for everyone. */
export function checkEntry(e, cancelAfterMin = CANCEL_AFTER_MIN) {
  const no = (why) => ({ ok: false, why });
  if (e === null || typeof e !== "object") return no("not an object");
  if (e.v !== SCHEDULE_VERSION || e.game !== GAME) return no("wrong version or game");
  if (!isAddr(e.producer)) return no("bad producer");
  let round; try { round = roundOfStart(e.start); } catch { return no("start is not a 30-minute slot"); }
  if (e.round !== round) return no("round does not match the start");
  if (e.cardKey !== cardKey(round, e.w0, e.w1, e.l)) return no("card key does not match");
  if (e.sum !== fnv64(canonEntry(e))) return no("checksum");
  if (!Number.isSafeInteger(e.madeAt)) return no("no made time");
  if (e.madeAt > e.start - cancelAfterMin * MIN) return no("late: made after 2 h 15 min before the start, the game is cancelled");
  return { ok: true, why: "" };
}
/** The recorded line must equal the Ruler's helper value computed from the SCORED card's row: any difference cancels the game. */
export const lineMatches = (entry, helperLine) => entry.line === helperLine;
/** The line is public before picks open: made at least `marginMin` before the open (line timing A leaves about an hour). */
export const publicBeforeOpen = (e, marginMin = 0) => e.madeAt + marginMin * MIN <= opensAt(e.start);

// ── score ──
/** over / under / skip. credited and the line: credited is the Ruler's, in millionths of a block; the line is in half blocks. */
export function outcomeOf(creditedMillionths, line, isVoid) {
  if (isVoid === true) return "skip";
  const c2 = 2n * BigInt(creditedMillionths), l = BigInt(line) * MILLION;
  return c2 > l ? "over" : c2 < l ? "under" : "skip";
}
/** 1 point for a right pick (1 = Over, 2 = Under); 0 for a wrong pick, no pick, a skipped game or a cancelled game. */
export function pointOf(pick, outcome) {
  if (outcome !== "over" && outcome !== "under") return 0;
  return (pick === OVER && outcome === "over") || (pick === UNDER && outcome === "under") ? 1 : 0;
}

// ── the form label on the page (the Ruler's labels) ──
export function formLabel(formMillionths) {
  if (!Number.isSafeInteger(formMillionths) || formMillionths < 0) throw new Error("form must be a whole number >= 0 (millionths; 1,000,000 = 100%)");
  return formMillionths >= 970000 ? "On form" : formMillionths >= 900000 ? "A little behind" : formMillionths >= 800000 ? "Behind" : "Unreliable";
}

// ── the line: STAND-INS for the Ruler's helpers (#33: forecastExpected, medianLineHalves). A test pins them equal to the Ruler's. ──
export const FORM_CAP = 1040000n;                 // D-588 (version C): form counts up to 104%; no block cap (D-584)
/** Blocks forecast in a game, millionths: the card's k (VHP share) scaled by its form, form counted up to 104%. Numbers or BigInts only. */
export function forecastExpected(row) {
  for (const x of [row.k, row.form]) if (typeof x !== "bigint" && !Number.isSafeInteger(x)) throw new Error("k and form must be whole numbers or BigInts, never text");
  const k = BigInt(row.k), form = BigInt(row.form);
  if (k < 0n || form < 0n) throw new Error("k and form can't be negative");
  return (k * (form < FORM_CAP ? form : FORM_CAP)) / MILLION;
}
/** The line in half-blocks: the Poisson median half-line for `expected` (millionths). */
/** The Ruler's 'Unreliable' label: form below the 80% gate (millionths). */
export const FORM_GATE = 800000;
export const isUnreliable = (row) => BigInt(row.form) < BigInt(FORM_GATE);
/** Unreliable producers are left out of the queue (owner, M-120: on by default). */
export const EXCLUDE_UNRELIABLE = true;
export function medianLineHalves(expected) {
  const e = BigInt(expected);
  return e < 150000n ? 1n : 2n * ((e - 150000n) / MILLION) + 1n;
}
