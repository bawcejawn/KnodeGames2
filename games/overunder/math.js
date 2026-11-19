// Over/Under (game 16): every rule, as pure functions. The recorder (recorder.ts, on the Shared Game Kit) and the page use
// this one file, so a score shown in the browser and a score recorded always agree. No network, no clock, no randomness,
// no files. Whole numbers only (BigInt where numbers are large), so JavaScript and Python-side checks give the same bytes.
//
// RULES (owner decisions D-266, D-267, D-277, D-284 to D-290; design note claude/newgames/DESIGN-OVERUNDER-VS-2026-11-19.md)
// - Each UTC day, every producer on the week's roster has a row with a LINE set at half a block. A player picks OVER or
//   UNDER on any rows; a blank row is no pick. A row is right if the producer's credited blocks that day are above the
//   line (Over) or below it (Under). 1 point per right row (D-277). Weekly board and prizes (D-272).
// - The line comes from the VHP Ruler (the expected blocks on the roster's card, rounded to the nearest half block), never
//   from a number an operator types. Credited blocks are the ruler's, not raw blocks.
// - A producer that is void that day is SKIPPED: no win, no loss (D-287). A credited count exactly on the line (possible
//   only when the ruler's credit is a whole half block) is skipped too: a tie is never a win or a loss.
// - The roster (up to 64 producers, sorted by address) and the lines are published once, write-once, before picks open
//   (D-284). A day's picks are TWO numbers (Picks kind 3, D-296): number A holds rows 0 to 31, number B rows 32 to 63;
//   2 bits a row, in roster order, the first row of each number in the lowest bits: 00 blank, 01 over, 10 under,
//   11 invalid (read as blank). Over 64 producers is a loud error that stops the roster: never a silent cut (D-296).
//   The two numbers are two Picks rounds (round size 12 hours): A is the round that ends at the day's start, B the one
//   12 hours before it, so B closes 12 hours earlier than A. Both close before the day starts.

export const GAME = 16;
export const DAY = 86400000;
export const LEAD = 300000;                   // Picks game 16 locks each number 5 minutes before its round's target (D-285)
export const AHEAD = 2 * DAY;                 // and opens 2 days before it (D-285)
export const MAX_CHANGES = 2;                 // a pick, then up to 2 changes (D-286)
export const HALF = 32;                       // rows in one number: 2 bits a row in a 64-bit number
export const MAX_ROWS = 64;                   // two numbers a day (D-296)
export const PICK_ROUND = DAY / 2;            // Picks game 16's round size: 12 hours
export const MAX_NUMBER = 18446744073709551615n;
export const ROSTER_VERSION = 1;
export const PLAY_DAYS = 7;                   // Monday to Sunday; Sunday is the fun round (counts on Today and All time only)
export const MILLION = 1000000n;
export const OVER = 1, UNDER = 2;

export const isAddr = (a) => typeof a === "string" && /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a);
const big = (x) => { if (typeof x === "bigint" && x >= 0n) return x; if (typeof x === "number" && Number.isSafeInteger(x) && x >= 0) return BigInt(x); if (typeof x === "string" && /^[0-9]+$/.test(x)) return BigInt(x); throw new Error(`not a whole number ≥ 0: ${x}`); };
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ── days ──
/** yyyymmdd of a UTC day (ms at 00:00), with no Date: days since 1970-01-01 → civil date (H. Hinnant's algorithm). */
export function ymd(dayMs) {
  if (!Number.isSafeInteger(dayMs) || dayMs % DAY !== 0) throw new Error("ymd: not the start of a UTC day");
  const z = dayMs / DAY + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp < 10 ? mp + 3 : mp - 9, y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return String(y * 10000 + m * 100 + d);
}
/** The week's 7 rounds, Monday to Sunday. */
export const weekDays = (start) => Array.from({ length: PLAY_DAYS }, (_, i) => start + i * DAY);
/** The days whose ruler cards the roster may come from, newest first: Thursday back to Friday before the week (all at
 *  least 3 days old when the roster is made, Friday 00:00 UTC). The newest card that isn't flagged is used. */
export const rosterDays = (start) => Array.from({ length: 7 }, (_, i) => start - (4 + i) * DAY);
/** When a still-flagged day of the week starting at `start` is decided anyway (every row skipped): Tuesday 00:00 UTC
 *  after the week (the same rule as Fantasy: owner, 12 Nov). */
export const flaggedCutoff = (start) => start + 8 * DAY;
/** A day with no ruler card at all waits 48 hours after the day ends, then counts as skipped for every row (owner, 13 Nov). */
export const NO_CARD_GRACE = 2 * DAY;

/** The Picks rounds (12 hours each) of a day's two numbers: A (rows 0 to 31) is the round whose target is the day's start,
 *  B (rows 32 to 63) the round 12 hours before. Both lock 5 minutes before their target, so before the day starts. */
export const pickRoundOf = (dayMs, half) => dayMs / PICK_ROUND - (half === 1 ? 1 : 0);
/** When a number stops taking picks (chain ms): its round's target minus the lead. */
export const lockOf = (dayMs, half) => pickRoundOf(dayMs, half) * PICK_ROUND - LEAD;
/** Which number a kit round holds: the round id of half B ends in "b" (d20261123b), half A is plain (d20261123). */
export const halfOfId = (id) => (/^d[0-9]{8}b$/.test(id) ? 1 : /^d[0-9]{8}$/.test(id) ? 0 : (() => { throw new Error(`not an Over/Under round id: ${id}`); })());
export const roundIdOf = (dayMs, half) => `d${ymd(dayMs)}${half === 1 ? "b" : ""}`;

// ── lines ──
/** The line, in HALF blocks (an odd whole number: 57 means 28.5 blocks), from a producer's expected blocks (millionths
 *  of a block). The half block nearest to the expected count: floor(expected) + 0.5. An odd number can never equal a
 *  whole count, so a whole-block result is never a tie. */
export function lineOf(expectedMillionths) {
  return Number((2n * (big(expectedMillionths) / MILLION)) + 1n);
}

// ── the roster ──
/** FNV-1a (64 bit) of a string, as 16 hex digits. A checksum that the roster is the one that was published (not a
 *  secret): the page and the recorder both recompute it. */
export function fnv64(s) {
  let h = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, "0");
}
const canon = (r) => `${r.v}|${r.start}|${r.cardRound}|${r.rows.map((x) => `${x.a}:${x.line}`).join(",")}`;
/** The roster id: a checksum over the version, week, card day and rows (address:line). */
export const rosterId = (r) => fnv64(canon(r));

/** Make the week's roster from the ruler card the lines come from. `cardRows`: the card's rows
 *  [{ a, expected, entry, void, quality }] (expected in millionths, decimal strings). A producer is listed when it has the
 *  ruler's `entry` (the 80% form gate: not in ramp-up) and is not void on that card (its VHP is inside the ruler's band).
 *  More than MAX_ROWS (64) qualifying producers is an error that stops the roster (D-296): nothing is cut silently.
 *  Rows are sorted by address; each has its line in half blocks. */
export function makeRoster(start, cardRound, cardRows) {
  if (!Number.isSafeInteger(start) || start % DAY !== 0) throw new Error("roster: the week must start at 00:00 UTC");
  if (!/^[0-9]{8}$/.test(String(cardRound))) throw new Error("roster: cardRound must be yyyymmdd");
  const seen = new Set(), ok = [];
  for (const r of cardRows) {
    if (!isAddr(r.a)) throw new Error(`roster: not an address: ${r.a}`);
    if (seen.has(r.a)) throw new Error(`roster: ${r.a} twice on the card`);
    seen.add(r.a);
    if (r.entry !== true || r.void === true) continue;
    const e = big(r.expected);
    if (lineOf(e) < 1) continue;
    ok.push({ a: r.a, e });
  }
  if (ok.length > MAX_ROWS) throw new Error(`roster: ${ok.length} producers qualify, the limit is ${MAX_ROWS}: stopping, nothing is cut (D-296)`);
  ok.sort((x, y) => cmp(x.a, y.a));
  const roster = { v: ROSTER_VERSION, start, cardRound: String(cardRound), rows: ok.map((x) => ({ a: x.a, line: lineOf(x.e) })), id: "" };
  roster.id = rosterId(roster);
  return roster;
}

/** The roster, checked: shape, sorted distinct addresses, at most MAX_ROWS, odd lines, and the checksum. Returns the
 *  roster; throws a plain reason otherwise. The recorder and the page both call it before they decode any pick, so no
 *  other roster can give a pick its meaning (D-284). */
export function checkRoster(r, expectStart) {
  if (!r || typeof r !== "object") throw new Error("roster: missing");
  if (r.v !== ROSTER_VERSION) throw new Error(`roster: version ${r.v}, not ${ROSTER_VERSION}`);
  if (!Number.isSafeInteger(r.start) || r.start % DAY !== 0) throw new Error("roster: bad week start");
  if (expectStart !== undefined && r.start !== expectStart) throw new Error(`roster: for the week starting ${r.start}, not ${expectStart}`);
  if (!Array.isArray(r.rows) || r.rows.length > MAX_ROWS) throw new Error(`roster: 0 to ${MAX_ROWS} rows`);
  let prev = "";
  for (const x of r.rows) {
    if (!x || !isAddr(x.a)) throw new Error("roster: a row without an address");
    if (!(x.a > prev)) throw new Error("roster: rows must be sorted by address, no repeats");
    prev = x.a;
    if (!Number.isSafeInteger(x.line) || x.line < 1 || x.line % 2 !== 1) throw new Error(`roster: ${x.a}: the line must be an odd number of half blocks`);
  }
  if (r.id !== rosterId(r)) throw new Error("roster: its id does not match its rows (not the roster that was published)");
  return r;
}

// ── picks ──
/** One of a day's two pick numbers (a decimal string): `choices` maps a producer address on the roster to "over" or
 *  "under"; only the rows of `half` (0: rows 0 to 31, 1: rows 32 to 63) are written, the other rows are left to the
 *  other number. Rows not in `choices` stay blank. Anything not on the roster is refused. */
export function encodePick(roster, choices, half = 0) {
  if (half !== 0 && half !== 1) throw new Error("encodePick: half must be 0 or 1");
  const idx = new Map(roster.rows.map((x, i) => [x.a, i]));
  let n = 0n;
  for (const [a, c] of Object.entries(choices)) {
    if (!idx.has(a)) throw new Error(`encodePick: ${a} is not on the roster`);
    const bits = c === "over" ? BigInt(OVER) : c === "under" ? BigInt(UNDER) : null;
    if (bits === null) throw new Error(`encodePick: "${c}" is not over or under`);
    const i = idx.get(a);
    if (Math.floor(i / HALF) !== half) continue;
    n |= bits << BigInt(2 * (i - half * HALF));
  }
  return n.toString();
}
/** Both of a day's numbers: [A, B]. */
export const encodePicks = (roster, choices) => [encodePick(roster, choices, 0), encodePick(roster, choices, 1)];
/** One pick number back into choices { address: "over" | "under" } for its half of the roster. A number that is not a
 *  plain decimal, or is above 2^64 − 1, is no pick at all. A row's invalid bits (11) and bits beyond the half's rows
 *  are read as blank. */
export function decodePick(roster, number, half = 0) {
  const out = {};
  if (half !== 0 && half !== 1) throw new Error("decodePick: half must be 0 or 1");
  if (typeof number === "number") { if (!Number.isSafeInteger(number)) return out; number = String(number); }
  if (typeof number === "bigint") number = number.toString();
  if (typeof number !== "string" || !/^[0-9]{1,20}$/.test(number)) return out;
  const n = BigInt(number);
  if (n > MAX_NUMBER) return out;
  roster.rows.slice(half * HALF, half * HALF + HALF).forEach((x, i) => {
    const bits = Number((n >> BigInt(2 * i)) & 3n);
    if (bits === OVER) out[x.a] = "over"; else if (bits === UNDER) out[x.a] = "under";
  });
  return out;
}

// ── scoring ──
/** One row's outcome from the credited blocks (millionths) and the line (half blocks): "over", "under", or "skip"
 *  (void that day, or exactly on the line). credited × 2 against line × 1,000,000, so no decimals anywhere. */
export function outcomeOf(creditedMillionths, line, isVoid) {
  if (isVoid === true) return "skip";
  const c2 = 2n * big(creditedMillionths), l = BigInt(line) * MILLION;
  return c2 > l ? "over" : c2 < l ? "under" : "skip";
}
/** The day's outcomes by producer, from the roster and the day's result rows { address: [credited, expected, void] }.
 *  A producer on the roster with no row is an error: the recorder keeps the day pending instead (never a guess). */
export function dayOutcomes(roster, rows) {
  const out = {};
  for (const x of roster.rows) {
    const r = rows[x.a];
    if (!r) throw new Error(`no result row for ${x.a}`);
    out[x.a] = outcomeOf(r[0], x.line, r[2] === true);
  }
  return out;
}
/** Points for one wallet's pick number (its `half`) that day: 1 for each row where its choice equals the day's outcome. */
export function scorePick(roster, number, outcomes, half = 0) {
  const ch = decodePick(roster, number, half);
  let p = 0;
  for (const [a, c] of Object.entries(ch)) if (outcomes[a] === c) p++;
  return p;
}
