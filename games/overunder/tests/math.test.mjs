import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../math.js";

const A = (i) => "1" + "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".repeat(2).slice(i, i + 30);
const T0 = Date.UTC(2026, 10, 25, 0, 0, 0);               // Wed 25 Nov 2026 00:00 UTC

test("rounds: start = r x 30 min, whole slots only", () => {
  assert.equal(R.roundOfStart(T0), T0 / R.SLOT);
  assert.equal(R.startOfRound(R.roundOfStart(T0 + R.SLOT)), T0 + R.SLOT);
  assert.throws(() => R.roundOfStart(T0 + 1));
  assert.equal(R.opensAt(T0), T0 - 2 * 3600000);
  assert.equal(R.locksAt(T0), T0 - 300000);
  assert.equal(R.endsAt(T0), T0 + 12 * 3600000);
});

test("week of start: Mon 00:00 UTC is the new week (Ruler boundary tests)", () => {
  assert.equal(R.weekOfStart(Date.UTC(2026, 10, 23, 0, 0)), 5);        // Sun 22 7 PM ET
  assert.equal(R.weekOfStart(Date.UTC(2026, 10, 22, 23, 30)), 4);
  assert.equal(R.weekOfStart(Date.UTC(2026, 10, 22, 23, 59)), 4);
  assert.equal(R.weekOfStart(Date.UTC(2026, 9, 19, 0, 0)), 0);
});

test("3 or 4 games open for picks at any minute, never more than 4", () => {
  let min = 9, max = 0;
  for (let t = T0; t < T0 + 24 * 3600000; t += 60000) { const n = R.openStarts(t).length; min = Math.min(min, n); max = Math.max(max, n); }
  assert.ok(min >= 3 && max <= 4, `open games ${min}..${max}`);
});

test("write window: 3 h 33 min to 2 h 20 min before the start (D-732)", () => {
  const [a, b] = R.writeWindow(T0);
  assert.equal(T0 - a, (3 * 60 + 33) * 60000);
  assert.equal(T0 - b, (2 * 60 + 20) * 60000);
  // still before picks open (2 h) and before the cancel time (2 h 15 min)
  assert.ok(R.SCHEDULE_TO_MIN > R.CANCEL_AFTER_MIN && R.CANCEL_AFTER_MIN > 120);
});

test("every game gets at least 2 tries: two runs of the half-hourly kit fall in its window, whatever the run minute (M-468)", () => {
  for (let runMin = 0; runMin < 30; runMin++)
    for (let k = 0; k < 48; k++) {
      const start = T0 + k * 30 * 60000, [a, b] = R.writeWindow(start);
      let tries = 0;
      for (let t = Math.ceil((a - runMin * 60000) / 1800000) * 1800000 + runMin * 60000; t < b; t += 1800000) if (t >= a) tries++;
      assert.ok(tries >= 2, `start +${k * 30} min, runs at :${runMin}: ${tries} tries`);
    }
});

function run(listedFor, n, from = T0, state = R.emptyState()) {
  const games = []; let st = state;
  for (let i = 0; i < n; i++) {
    const T = from + i * R.SLOT;
    const r = R.step(st, listedFor(T), T, games);
    st = r.state;
    if (r.producer) games.push({ producer: r.producer, start: T });
  }
  return { games, st };
}
const P = (n) => Array.from({ length: n }, (_, i) => A(i));

test("queue: 22 producers each play once in 22 starts, in a fixed order; the order repeats", () => {
  const list = P(22), { games } = run(() => list, 44);
  assert.equal(new Set(games.slice(0, 22).map((g) => g.producer)).size, 22);
  for (let i = 0; i < 22; i++) assert.equal(games[i].producer, games[i + 22].producer);
  assert.deepEqual(games.slice(0, 22).map((g) => g.producer), list.slice().sort());
});

test("queue: a producer goes to the bottom at the START of its game, so it can have 2 running (22 producers, 12 h games)", () => {
  const list = P(22), { games } = run(() => list, 120);
  let most = 0;
  for (const g of games) most = Math.max(most, games.filter((h) => h.producer === g.producer && h.start <= g.start && g.start < R.endsAt(h.start)).length);
  assert.equal(most, 2);
});

test("queue: never more than 2 running per producer; with 5 producers some starts have no game", () => {
  const list = P(5), { games } = run(() => list, 96);
  for (const g of games) assert.ok(games.filter((h) => h.producer === g.producer && h.start <= g.start && g.start < R.endsAt(h.start)).length <= 2);
  assert.ok(games.length < 96, "some starts must have no game");
});

test("queue: off the list at its turn = skipped, keeps its place", () => {
  const list = P(4), off = list.slice().sort()[1];
  const st0 = run(() => list, 1);                                    // sorted[0] plays the first start
  const r = R.step(st0.st, list.filter((a) => a !== off), T0 + R.SLOT, st0.games);
  assert.equal(r.producer, list.slice().sort()[2]);                  // the next on the list after the skipped one
  const r2 = R.step(r.state, list, T0 + 2 * R.SLOT, [...st0.games, { producer: r.producer, start: T0 + R.SLOT }]);
  assert.equal(r2.producer, off);                                    // back on the list: it plays next, it kept its place
});

test("queue: a new entrant goes to the bottom", () => {
  const first = P(3), st0 = run(() => first, 1);
  const newbie = A(10);
  const r = R.step(st0.st, [...first, newbie], T0 + R.SLOT, st0.games);
  assert.notEqual(r.producer, newbie);
  const r2 = R.step(r.state, [...first, newbie], T0 + 2 * R.SLOT, [...st0.games, { producer: r.producer, start: T0 + R.SLOT }]);
  assert.notEqual(r2.producer, newbie);
});

test("queue: a cancelled start leaves the state unchanged (the next start takes the same producer)", () => {
  const list = P(4), a = R.step(R.emptyState(), list, T0, []);
  const b = R.step(a.state, list, T0 + R.SLOT, [{ producer: a.producer, start: T0 }]);        // normal: next producer
  const cancelled = a.state;                                                                 // the cancelled start is simply not stepped
  const c = R.step(cancelled, list, T0 + 2 * R.SLOT, [{ producer: a.producer, start: T0 }]);
  assert.equal(c.producer, b.producer);
});

test("step does not change its input state", () => {
  const st = R.emptyState(), before = JSON.stringify(st);
  R.step(st, P(3), T0, []);
  assert.equal(JSON.stringify(st), before);
});

const entry = (over = {}) => R.makeEntry({ start: T0, producer: A(0), w0: 100, w1: 700, l: 800, line: 611, form: 985000, madeAt: T0 - 3 * 3600000 - 10 * 60000, ...over });

test("schedule file: valid when made 3 h 10 min ahead; valid up to exactly 2 h 15 min; cancelled after", () => {
  assert.equal(R.checkEntry(entry()).ok, true);
  assert.equal(R.checkEntry(entry({ madeAt: T0 - 135 * 60000 })).ok, true);
  const late = R.checkEntry(entry({ madeAt: T0 - 135 * 60000 + 1 }));
  assert.equal(late.ok, false); assert.match(late.why, /cancelled/);
});

test("schedule file: a changed byte, a wrong card key or round, and an even line are refused", () => {
  const e = entry();
  assert.equal(R.checkEntry({ ...e, line: 613 }).ok, false);
  assert.equal(R.checkEntry({ ...e, producer: A(1) }).ok, false);
  assert.equal(R.checkEntry({ ...e, cardKey: "16|1|2|3|4" }).ok, false);
  assert.equal(R.checkEntry({ ...e, round: e.round + 1 }).ok, false);
  assert.throws(() => entry({ line: 612 }));
  assert.equal(e.cardKey, `16|${T0 / R.SLOT}|100|700|800`);
});

test("line timing A: the line is public before picks open, with about an hour to spare", () => {
  assert.equal(R.publicBeforeOpen(entry(), 60), true);          // made 3 h 10 min ahead; picks open 2 h ahead
  assert.equal(R.publicBeforeOpen(entry({ madeAt: T0 - R.AHEAD + 1 }), 0), false);
});

test("the recorded line must equal the helper's value from the scored card", () => {
  assert.equal(R.lineMatches(entry(), 611), true);
  assert.equal(R.lineMatches(entry(), 613), false);
});

test("score: over, under, a tie is skipped, a void is skipped, 1 point per right pick, none for no pick", () => {
  assert.equal(R.outcomeOf(306_000_000, 611, false), "over");        // 612 > 305.5
  assert.equal(R.outcomeOf(305_500_000, 611, false), "skip");        // exactly on the line
  assert.equal(R.outcomeOf(300_000_000, 611, false), "under");
  assert.equal(R.outcomeOf(999_000_000, 611, true), "skip");
  assert.equal(R.pointOf(R.OVER, "over"), 1);
  assert.equal(R.pointOf(R.UNDER, "over"), 0);
  assert.equal(R.pointOf(undefined, "over"), 0);
  assert.equal(R.pointOf(R.OVER, "skip"), 0);
});

test("form labels: the Ruler's four labels at their edges", () => {
  assert.equal(R.formLabel(1_000_000), "On form");
  assert.equal(R.formLabel(970_000), "On form");
  assert.equal(R.formLabel(969_999), "A little behind");
  assert.equal(R.formLabel(900_000), "A little behind");
  assert.equal(R.formLabel(899_999), "Behind");
  assert.equal(R.formLabel(800_000), "Behind");
  assert.equal(R.formLabel(799_999), "Unreliable");
  assert.throws(() => R.formLabel(-1));
});

test("the line stand-ins: form scales k, counted up to 104%; no block cap (D-584, D-588); refuses text", () => {
  const f = (k, form) => R.forecastExpected({ k, form });
  assert.equal(f(4000000n, 1000000n), 4000000n);
  assert.equal(f(4000000n, 500000n), 2000000n);
  assert.equal(f(4000000n, 1040000n), 4160000n);
  assert.equal(f(4000000n, 1500000n), 4160000n);
  assert.equal(f(5000n * 1000000n, 1000000n), 5000n * 1000000n);
  assert.throws(() => R.forecastExpected({ k: "4000000", form: 1000000 }));
  assert.equal(R.medianLineHalves(100000n), 1n);
  assert.equal(R.medianLineHalves(150000n), 1n);
  assert.equal(R.medianLineHalves(4150000n), 9n);
});
