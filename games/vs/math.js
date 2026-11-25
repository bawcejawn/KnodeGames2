// Knode Games VS (game 17): every rule, as pure functions. The recorder (on the Shared Game Kit) and the page use this one
// file, so a score shown in the browser and a score recorded always agree. No network, no clock, no randomness, no files.
//
// RULES (owner decisions D-267, D-271, D-275 to D-277, D-295, D-297, D-309, D-317, D-327, D-334, D-345)
// - One 24-hour round a day (UTC). The Knode Games pool node plays EVERY producer on the roster that day. In each matchup
//   the one with the higher `fpct` for the day wins; exactly equal is a tie and scores nothing for players (D-295, D-276).
// - A pick is ONE number (Picks kind 3). Bit i set = "producer i beats the pool node"; every unticked producer counts as
//   "the pool node beats it". Number 0 = "Knode Games vs All" (the pool node beats everyone). No pick changes (D-345).
// - The roster (the pool node's matchups: up to 64 producers, sorted by address, the pool node never in it) is published
//   once, write-once, before picks open. Over 64 is a loud stop, never a silent cut (D-296).
// - 1 point per matchup called right (D-277). A matchup with no measure for one side is skipped for everyone.
// - No producer voids (D-317); the pool node's fpct comes from the Ruler's own scoring, never from here.
// - Node standings are W-L-T of the POOL NODE: monthly (reset each month) and all-time, only from final day files.

/** FNV-1a (64 bit) of a string, as 16 hex digits: a checksum that the roster is the one that was published (not a secret). */
export function fnv64(s) {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(s)) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, "0");
}

export const GAME = 17;
export const DAY = 86400000;
export const LEAD = 300000;
export const AHEAD = 2 * DAY;
export const MAX_CHANGES = 0;
export const MAX_ROWS = 64;
/** Repo Lens 1 red-team (M-429): fewer producers than this is a broken list, not a thin day (today's list has about 16;
 *  week 5's write-once file was published EMPTY, VS-9). makeRoster throws, so the kit holds the file, alerts and retries
 *  every run instead of locking an empty week. checkRoster does not use it: week 5's published file must still read. */
export const MIN_ROWS = 2;
export const MAX_NUMBER = 18446744073709551615n;
export const ROSTER_VERSION = 1;

export const isAddr = (a) => typeof a === "string" && /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a);

/** The roster of one day: sorted distinct producers, never the pool node. */
export function makeRoster({ week, day, pool, producers, madeAt }) {
  if (!isAddr(pool)) throw new Error("roster: bad pool node address");
  const rows = [...new Set(producers)].filter((a) => a !== pool).sort();
  for (const a of rows) if (!isAddr(a)) throw new Error(`roster: bad producer address ${a}`);
  if (rows.length > MAX_ROWS) throw new Error(`roster: ${rows.length} producers qualify, the limit is ${MAX_ROWS}: stopping, nothing is cut (D-296)`);
  if (rows.length < MIN_ROWS) throw new Error(`roster: only ${rows.length} producer(s) qualify, at least ${MIN_ROWS} are needed: not publishing a broken list (it is retried next run)`);
  if (!Number.isSafeInteger(day) || day % DAY !== 0) throw new Error("roster: a day is a whole UTC day");
  const r = { v: ROSTER_VERSION, game: GAME, week, day, pool, rows, madeAt };
  return { ...r, sum: fnv64([r.v, r.game, r.week, r.day, r.pool, r.rows.join(","), r.madeAt].join("|")) };
}
export function checkRoster(r) {
  if (r === null || typeof r !== "object" || r.v !== ROSTER_VERSION || r.game !== GAME || !Array.isArray(r.rows)) return { ok: false, why: "shape" };
  if (r.rows.length > MAX_ROWS) return { ok: false, why: "over 64 rows" };
  if (r.rows.some((a, i) => !isAddr(a) || a === r.pool || (i > 0 && r.rows[i - 1] >= a))) return { ok: false, why: "rows must be sorted distinct producers, not the pool node" };
  if (r.sum !== fnv64([r.v, r.game, r.week, r.day, r.pool, r.rows.join(","), r.madeAt].join("|"))) return { ok: false, why: "checksum" };
  return { ok: true, why: "" };
}
/** Picks open 2 days ahead and lock 5 minutes before the day starts. */
export const opensAt = (day) => day - AHEAD;
export const locksAt = (day) => day - LEAD;
/** The roster is public before picks open, with `marginMs` to spare. */
export const publicBeforeOpen = (r, marginMs = 0) => r.madeAt + marginMs <= opensAt(r.day);

// ── a pick ──
/** beat = the producers the player ticked (they will beat the pool node). Returns the number as a BigInt. */
export function encodePick(roster, beat) {
  let n = 0n;
  const set = new Set(beat);
  for (const a of set) { const i = roster.rows.indexOf(a); if (i < 0) throw new Error(`pick: ${a} is not on the roster`); n |= 1n << BigInt(i); }
  return n;
}
/** The ticked producers, or null for an invalid number (a bit beyond the roster, or above 2^64-1). 0 = Knode Games vs All (empty set). */
export function decodePick(roster, number) {
  let n; try { n = BigInt(number); } catch { return null; }
  if (n < 0n || n > MAX_NUMBER) return null;
  if (n >> BigInt(roster.rows.length) !== 0n) return null;
  const out = new Set();
  for (let i = 0; i < roster.rows.length; i++) if ((n >> BigInt(i)) & 1n) out.add(roster.rows[i]);
  return out;
}
export const KNODE_VS_ALL = 0n;

// ── a matchup and a pick's score ──
/** "producer", "node" or "tie" (equal) or "skip" (no measure for one side). fpct values are whole numbers (BigInt, number or decimal text). */
export function matchupOf(producerFpct, nodeFpct) {
  if (producerFpct === null || producerFpct === undefined || nodeFpct === null || nodeFpct === undefined) return "skip";
  const p = BigInt(producerFpct), n = BigInt(nodeFpct);
  return p > n ? "producer" : p < n ? "node" : "tie";
}
/** results = { node: fpct|null, rows: { addr: fpct|null } }. */
export function matchups(roster, results) {
  return roster.rows.map((a) => ({ addr: a, who: matchupOf(results.rows[a], results.node) }));
}
/** 1 point per matchup called right. A ticked producer is right when it wins; an unticked one when the node wins. Tie and skip score nothing. null pick = no points. */
export function scorePick(roster, number, results) {
  const ticked = decodePick(roster, number);
  if (ticked === null) return 0;
  let pts = 0;
  for (const m of matchups(roster, results)) {
    if (m.who === "tie" || m.who === "skip") continue;
    if ((m.who === "producer") === ticked.has(m.addr)) pts++;
  }
  return pts;
}
/** The two no-skill scores the page shows next to every player's score: "pool node beats all" (0) and "every producer beats the pool node". */
export function baselines(roster, results) {
  let all = 0n; for (let i = 0; i < roster.rows.length; i++) all |= 1n << BigInt(i);
  return { nodeBeatsAll: scorePick(roster, KNODE_VS_ALL, results), producersBeatNode: scorePick(roster, all, results) };
}

// ── the pool node's standings (W-L-T of the NODE), from FINAL day files only, append-only ──
export const monthOf = (day) => { const d = new Date(day); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const zero = () => ({ w: 0, l: 0, t: 0 });
/** Adds one final day. Returns new tables; the input is not changed. A day already added is refused (append-only). */
export function addDay(tables, roster, results) {
  const month = monthOf(roster.day);
  if (tables.days.includes(roster.day)) throw new Error(`day ${roster.day} is already in the standings (append-only)`);
  const t = { days: [...tables.days, roster.day], alltime: { ...tables.alltime }, byProducer: { ...tables.byProducer }, monthly: { ...tables.monthly } };
  const m = (t.monthly[month] = { ...(t.monthly[month] ?? zero()) });
  const a = t.alltime;
  for (const x of matchups(roster, results)) {
    if (x.who === "skip") continue;
    const k = x.who === "node" ? "w" : x.who === "producer" ? "l" : "t";
    a[k] = (a[k] ?? 0) + 1; m[k]++;
    const p = (t.byProducer[x.addr] = { ...(t.byProducer[x.addr] ?? zero()) }); p[k]++;
  }
  return t;
}
export const emptyTables = () => ({ days: [], alltime: zero(), byProducer: {}, monthly: {} });
