import test from "node:test";
import assert from "node:assert/strict";
import * as V from "../math.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const A = (i) => "1" + B58[Math.floor(i / 58)] + B58[i % 58] + "x".repeat(27);
const POOL = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
const DAY0 = Date.UTC(2026, 10, 26);
const mk = (n, extra = {}) => V.makeRoster({ week: 5, day: DAY0, pool: POOL, producers: Array.from({ length: n }, (_, i) => A(i)), madeAt: DAY0 - 3 * 86400000, ...extra });

test("roster: sorted, distinct, the pool node never in it, checksummed", () => {
  const r = V.makeRoster({ week: 5, day: DAY0, pool: POOL, producers: [A(3), A(1), A(1), POOL, A(2)], madeAt: 1 });
  assert.deepEqual(r.rows, [A(1), A(2), A(3)].sort());
  assert.equal(V.checkRoster(r).ok, true);
  assert.equal(V.checkRoster({ ...r, rows: [A(4), ...r.rows] }).ok, false);
});

test("roster: 64 producers fit, 65 is a loud stop and nothing is cut (D-296)", () => {
  assert.equal(mk(64).rows.length, 64);
  assert.throws(() => mk(65), /stopping, nothing is cut/);
});

test("roster is public before picks open (2 days ahead) with a margin", () => {
  assert.equal(V.publicBeforeOpen(mk(3), 12 * 3600000), true);
  assert.equal(V.publicBeforeOpen(mk(3, { madeAt: DAY0 - 2 * V.DAY + 1 }), 0), false);
  assert.equal(V.locksAt(DAY0), DAY0 - 300000);
});

test("pick: one number, 1 bit a matchup; 0 = Knode Games vs All; round-trips at 64 rows including 2^64-1", () => {
  const r = mk(64);
  assert.equal(V.encodePick(r, []), 0n);
  const all = V.encodePick(r, r.rows);
  assert.equal(all, V.MAX_NUMBER);
  assert.equal(V.decodePick(r, all).size, 64);
  const some = V.encodePick(r, [r.rows[0], r.rows[63], r.rows[40]]);
  assert.deepEqual([...V.decodePick(r, some)].sort(), [r.rows[0], r.rows[40], r.rows[63]].sort());
  assert.equal(V.decodePick(r, 0n).size, 0);
  assert.equal(V.decodePick(r, "18446744073709551615").size, 64);
});

test("pick: a bit beyond the roster, or above 2^64-1, is invalid and scores nothing", () => {
  const r = mk(5);
  assert.equal(V.decodePick(r, 1n << 5n), null);
  assert.equal(V.decodePick(r, V.MAX_NUMBER + 1n), null);
  assert.equal(V.decodePick(r, "abc"), null);
  assert.equal(V.scorePick(r, 1n << 5n, { node: 5, rows: {} }), 0);
  assert.throws(() => V.encodePick(r, [A(40)]));
});

test("matchup: higher fpct wins, equal is a tie, a missing side is skipped", () => {
  assert.equal(V.matchupOf(10, 9), "producer");
  assert.equal(V.matchupOf(9, 10), "node");
  assert.equal(V.matchupOf(10, 10), "tie");
  assert.equal(V.matchupOf("12345678901234567890", "12345678901234567891"), "node");
  assert.equal(V.matchupOf(null, 10), "skip");
  assert.equal(V.matchupOf(10, null), "skip");
});

const R4 = V.makeRoster({ week: 5, day: DAY0, pool: POOL, producers: [A(0), A(1), A(2), A(3)], madeAt: 1 });
const res = { node: 50, rows: { [R4.rows[0]]: 60, [R4.rows[1]]: 40, [R4.rows[2]]: 50, [R4.rows[3]]: null } };

test("score: 1 point per matchup called right; a tie and a skipped matchup score nothing", () => {
  // rows[0] beats the node, rows[1] loses, rows[2] ties, rows[3] has no measure
  assert.equal(V.scorePick(R4, V.encodePick(R4, [R4.rows[0]]), res), 2);        // right on 0 (ticked), right on 1 (unticked)
  assert.equal(V.scorePick(R4, V.KNODE_VS_ALL, res), 1);                          // only rows[1] is a node win
  assert.equal(V.scorePick(R4, V.encodePick(R4, R4.rows), res), 1);               // only rows[0]
  assert.equal(V.scorePick(R4, V.encodePick(R4, [R4.rows[1]]), res), 0);
});

test("baselines: the two no-skill scores for the page", () => {
  assert.deepEqual(V.baselines(R4, res), { nodeBeatsAll: 1, producersBeatNode: 1 });
});

test("standings: W-L-T of the pool node, monthly resets, all-time and per producer; append-only", () => {
  let t = V.addDay(V.emptyTables(), R4, res);
  assert.deepEqual(t.alltime, { w: 1, l: 1, t: 1 });
  assert.deepEqual(t.monthly["2026-11"], { w: 1, l: 1, t: 1 });
  assert.deepEqual(t.byProducer[R4.rows[0]], { w: 0, l: 1, t: 0 });
  assert.equal(t.byProducer[R4.rows[3]], undefined);                               // a skipped matchup is not counted
  const dec = V.makeRoster({ week: 9, day: Date.UTC(2026, 11, 1), pool: POOL, producers: R4.rows, madeAt: 1 });
  t = V.addDay(t, dec, res);
  assert.deepEqual(t.monthly["2026-12"], { w: 1, l: 1, t: 1 });
  assert.deepEqual(t.monthly["2026-11"], { w: 1, l: 1, t: 1 });                    // November is not touched
  assert.deepEqual(t.alltime, { w: 2, l: 2, t: 2 });
  assert.throws(() => V.addDay(t, R4, res), /append-only/);
});

test("addDay does not change its input", () => {
  const t0 = V.emptyTables(), s = JSON.stringify(t0);
  V.addDay(t0, R4, res);
  assert.equal(JSON.stringify(t0), s);
});
