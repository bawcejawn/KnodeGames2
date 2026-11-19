// Over/Under: the rules in math.js, one test per rule in docs/games/OverUnder.md.
import test from "node:test";
import assert from "node:assert/strict";
import * as F from "../math.js";

const CH = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (i) => "1" + CH[i % CH.length].repeat(33 - Math.floor(i / CH.length)) + (i >= CH.length ? "Z".repeat(Math.floor(i / CH.length)) : "");
const MON = Date.UTC(2026, 10, 16);
const row = (i, expected, extra = {}) => ({ a: addr(i), expected: String(expected), entry: true, void: false, ...extra });
const mk = (rows) => F.makeRoster(MON, "20261113", rows);

test("lineOf: the half block at or just above the whole blocks (floor + 0.5), an odd number of half blocks", () => {
  assert.equal(F.lineOf("28400000"), 57);        // 28.4 → 28.5
  assert.equal(F.lineOf("28999999"), 57);
  assert.equal(F.lineOf("29000000"), 59);        // exactly 29.0 → 29.5
  assert.equal(F.lineOf("0"), 1);
  assert.equal(F.lineOf(123456789n), 247);       // 123.456789 → 123.5
  for (const e of ["1", "999999", "1000000", "57123456", "99999999999"]) assert.equal(F.lineOf(e) % 2, 1);
  assert.throws(() => F.lineOf("-5"));
  assert.throws(() => F.lineOf("1.5"));
});

test("outcomeOf: above the line is over, below is under, on the line or void is skipped (never a win or a loss)", () => {
  assert.equal(F.outcomeOf("29000000", 57, false), "over");
  assert.equal(F.outcomeOf("28000000", 57, false), "under");
  assert.equal(F.outcomeOf("28500000", 57, false), "skip", "exactly 28.5");
  assert.equal(F.outcomeOf("28500001", 57, false), "over");
  assert.equal(F.outcomeOf("28499999", 57, false), "under");
  assert.equal(F.outcomeOf("99000000", 57, true), "skip", "void (D-287)");
  assert.equal(F.outcomeOf(0, 1, false), "under");
});

test("pick numbers: 2 bits a row in roster order; number A holds rows 0 to 31, B rows 32 to 63; encode and decode agree for all 64 rows", () => {
  const r = mk(Array.from({ length: 64 }, (_, i) => row(i, 20000000 + i)));
  assert.equal(r.rows.length, 64);
  const ch = {};
  r.rows.forEach((x, i) => { ch[x.a] = i % 2 ? "under" : "over"; });
  const [na, nb] = F.encodePicks(r, ch);
  assert.deepEqual({ ...F.decodePick(r, na, 0), ...F.decodePick(r, nb, 1) }, ch);
  assert.equal(Object.keys(F.decodePick(r, na, 0)).length, 32);
  assert.ok(Object.keys(F.decodePick(r, na, 0)).every((a) => r.rows.findIndex((x) => x.a === a) < 32), "A reads only rows 0 to 31");
  assert.ok(Object.keys(F.decodePick(r, nb, 1)).every((a) => r.rows.findIndex((x) => x.a === a) >= 32), "B reads only rows 32 to 63");
  assert.equal(F.encodePick(r, { [r.rows[0].a]: "over" }), "1");
  assert.equal(F.encodePick(r, { [r.rows[0].a]: "under" }), "2");
  assert.equal(F.encodePick(r, { [r.rows[1].a]: "over" }), "4");
  assert.equal(F.encodePick(r, { [r.rows[31].a]: "under" }), (2n << 62n).toString());
  assert.equal(F.encodePick(r, { [r.rows[32].a]: "over" }, 1), "1", "row 32 is the lowest bits of B");
  assert.equal(F.encodePick(r, { [r.rows[63].a]: "under" }, 1), (2n << 62n).toString());
  assert.equal(F.encodePick(r, { [r.rows[32].a]: "over" }, 0), "0", "a B row is not in A");
  assert.deepEqual(F.encodePicks(r, {}), ["0", "0"]);
  assert.deepEqual(F.decodePick(r, "0"), {});
  assert.throws(() => F.encodePick(r, { [addr(500)]: "over" }), /not on the roster/);
  assert.throws(() => F.encodePick(r, { [r.rows[0].a]: "maybe" }));
  assert.throws(() => F.encodePick(r, {}, 2));
  assert.throws(() => F.decodePick(r, "1", 2));
});

test("decodePick: invalid bits (11) are blank, bits past the roster are ignored, and anything that isn't a plain 64-bit number is no pick", () => {
  const r = mk([row(0, 20000000), row(1, 21000000), row(2, 22000000)]);
  assert.deepEqual(F.decodePick(r, "3"), {}, "11 = blank");
  assert.deepEqual(F.decodePick(r, String(1n | (3n << 2n) | (2n << 4n))), { [r.rows[0].a]: "over", [r.rows[2].a]: "under" });
  assert.deepEqual(F.decodePick(r, String(1n | (1n << 40n))), { [r.rows[0].a]: "over" }, "bits past row 3 are ignored");
  for (const bad of ["0x10", "-1", "1e3", " 5", "5 ", "1.0", "", "abc", "18446744073709551616", "999999999999999999999", null, undefined, {}, [], 1.5, -3]) assert.deepEqual(F.decodePick(r, bad), {}, JSON.stringify(bad));
  assert.deepEqual(F.decodePick(r, 1), { [r.rows[0].a]: "over" });
  assert.deepEqual(F.decodePick(r, 4n), { [r.rows[1].a]: "over" });
  assert.deepEqual(F.decodePick(r, "18446744073709551615"), {}, "all bits set: every row is 11");
});

test("score: 1 point for each row called right; blank, wrong, skipped and void rows score nothing", () => {
  const r = mk([row(0, 20000000), row(1, 21000000), row(2, 22000000), row(3, 23000000), row(4, 24000000)]);
  const [a, b, c, d, e] = r.rows.map((x) => x.a);
  const res = { [a]: [String(30e6), "0", false], [b]: [String(5e6), "0", false], [c]: [String(22.5e6), "0", false], [d]: [String(99e6), "0", true], [e]: [String(1e6), "0", false] };
  // lines: a 20.5, b 21.5, c 22.5 (tie with 22.5 credited), d 23.5, e 24.5
  const out = F.dayOutcomes(r, res);
  assert.deepEqual(out, { [a]: "over", [b]: "under", [c]: "skip", [d]: "skip", [e]: "under" });
  const n = F.encodePick(r, { [a]: "over", [b]: "over", [c]: "over", [d]: "under" });   // right, wrong, tie, void; e blank
  assert.equal(F.scorePick(r, n, out), 1);
  assert.equal(F.scorePick(r, F.encodePick(r, { [a]: "over", [b]: "under", [e]: "under" }), out), 3);
  assert.equal(F.scorePick(r, "0", out), 0);
  assert.equal(F.scorePick(r, "not a number", out), 0);
  assert.throws(() => F.dayOutcomes(r, { [a]: ["1", "1", false] }), /no result row/);
});

test("roster: entry and not void, sorted by address, lines in half blocks, checksum; up to 64, over 64 stops", () => {
  const rows = [row(5, 25e6), row(1, 21e6, { entry: false }), row(2, 22e6, { void: true }), row(3, 23e6), row(0, 20e6)];
  const r = mk(rows);
  assert.deepEqual(r.rows.map((x) => x.a), [addr(0), addr(3), addr(5)].sort());
  assert.deepEqual(r.rows.map((x) => x.line).sort((x, y) => x - y), [41, 47, 51]);
  assert.equal(F.checkRoster(r, MON), r);
  assert.equal(F.rosterId(r), r.id);
  // 64 qualifying producers fit; 65 is a loud error that stops the roster, never a silent cut (D-296)
  const many = Array.from({ length: 64 }, (_, i) => row(i, (100 + i) * 1e6));
  const big = mk(many);
  assert.equal(big.rows.length, 64);
  assert.ok(big.rows.every((x, i, xs) => i === 0 || xs[i - 1].a < x.a));
  F.checkRoster(big, MON);
  assert.throws(() => mk([...many, row(64, 200e6)]), /65 producers qualify, the limit is 64: stopping, nothing is cut/);
  assert.equal(mk([...many, row(64, 200e6, { entry: false }), row(65, 200e6, { void: true })]).rows.length, 64, "those that don't qualify don't count");
  assert.throws(() => mk([row(0, 1e6), row(0, 2e6)]), /twice/);
  assert.throws(() => mk([{ a: "nope", expected: "1", entry: true, void: false }]), /not an address/);
  assert.throws(() => F.makeRoster(MON + 1, "20261113", []), /00:00 UTC/);
  assert.throws(() => F.makeRoster(MON, "2026-11-13", []), /yyyymmdd/);
});

test("checkRoster refuses any roster that is not exactly the published one (D-284)", () => {
  const r = mk([row(0, 20e6), row(1, 21e6), row(2, 22e6)]);
  const clone = () => JSON.parse(JSON.stringify(r));
  assert.doesNotThrow(() => F.checkRoster(clone(), MON));
  const t1 = clone(); t1.rows[1].line += 2; assert.throws(() => F.checkRoster(t1, MON), /id does not match/);
  const t2 = clone(); t2.rows.reverse(); assert.throws(() => F.checkRoster(t2, MON), /sorted/);
  const t3 = clone(); t3.rows.pop(); assert.throws(() => F.checkRoster(t3, MON), /id does not match/);
  const t4 = clone(); t4.rows[0].line = 40; assert.throws(() => F.checkRoster(t4, MON), /odd/);
  const t5 = clone(); t5.extra = 1; t5.id = "0000000000000000"; assert.throws(() => F.checkRoster(t5, MON), /id does not match/);
  const t6 = clone(); t6.cardRound = "20261112"; assert.throws(() => F.checkRoster(t6, MON), /id does not match/);
  const t7 = clone(); t7.v = 2; assert.throws(() => F.checkRoster(t7, MON), /version/);
  assert.throws(() => F.checkRoster(clone(), MON + F.DAY), /for the week starting/);
  assert.throws(() => F.checkRoster(null, MON));
  const t8 = clone(); t8.rows = Array.from({ length: 65 }, (_, i) => ({ a: addr(i), line: 1 })); assert.throws(() => F.checkRoster(t8, MON), /0 to 64/);
  // the same rows in another week are a different roster
  assert.notEqual(F.makeRoster(MON + 7 * F.DAY, "20261120", [row(0, 20e6), row(1, 21e6), row(2, 22e6)]).id, r.id);
});

test("days: ymd, the week's 7 rounds, roster cards Thursday back to Friday, flagged cutoff Tuesday 00:00, 48 h no-card grace", () => {
  assert.equal(F.ymd(MON), "20261116");
  assert.throws(() => F.ymd(MON + 1));
  const days = F.weekDays(MON);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map(F.ymd), ["20261116", "20261117", "20261118", "20261119", "20261120", "20261121", "20261122"]);
  assert.deepEqual(F.rosterDays(MON).map(F.ymd), ["20261112", "20261111", "20261110", "20261109", "20261108", "20261107", "20261106"]);
  assert.equal(F.flaggedCutoff(MON), MON + 8 * F.DAY);
  assert.equal(F.NO_CARD_GRACE, 2 * F.DAY);
});

test("Picks game 16's numbers: lead 5 minutes, ahead 2 days, 2 changes, a 64-bit number (D-285, D-286, D-290)", () => {
  assert.equal(F.GAME, 16);
  assert.equal(F.LEAD, 300000);
  assert.equal(F.AHEAD, 172800000);
  assert.equal(F.MAX_CHANGES, 2);
  assert.equal(F.MAX_NUMBER, 2n ** 64n - 1n);
  assert.equal(F.MAX_ROWS, 64);
  assert.equal(F.HALF * 2, F.MAX_ROWS);
  assert.equal(F.PICK_ROUND, 43200000, "Picks round size: 12 hours");
});

test("a day's two Picks rounds: A ends at the day's start, B 12 hours earlier; both lock before the day; round ids", () => {
  const day = MON + 2 * F.DAY;
  assert.equal(F.pickRoundOf(day, 0), (day / F.DAY) * 2);
  assert.equal(F.pickRoundOf(day, 1), (day / F.DAY) * 2 - 1);
  assert.equal(F.lockOf(day, 0), day - 300000);
  assert.equal(F.lockOf(day, 1), day - F.DAY / 2 - 300000);
  assert.ok(F.lockOf(day, 1) < F.lockOf(day, 0) && F.lockOf(day, 0) < day);
  // no two (day, half) share a Picks round, and the week's 14 rounds are consecutive
  const rs = F.weekDays(MON).flatMap((d) => [0, 1].map((h) => F.pickRoundOf(d, h)));
  assert.equal(new Set(rs).size, 14);
  assert.equal(F.roundIdOf(day, 0), "d20261118");
  assert.equal(F.roundIdOf(day, 1), "d20261118b");
  assert.equal(F.halfOfId("d20261118"), 0);
  assert.equal(F.halfOfId("d20261118b"), 1);
  for (const bad of ["d2026111", "d20261118c", "x20261118", "", "d20261118bb"]) assert.throws(() => F.halfOfId(bad));
});
