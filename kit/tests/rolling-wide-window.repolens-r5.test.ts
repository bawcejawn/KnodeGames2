// Repo Lens 5, #118 (#R5-17-1): with a schedule window wider than one slot (D-732: 213 to 140 min), two starts are open at
// once. If the earlier start's file fails on a run, the later start's file must NOT be made on that run: it would carry the
// queue without the earlier start, and the earlier file, made on a later run, would fork the queue.
// Ships as kit/tests/rolling-wide-window.repolens-r5.test.ts (and add it to tests/audit/kit-suite.test.ts's list).
import test from "node:test";
import assert from "node:assert/strict";
import { rollingRounds, type KitGameCfg } from "../recorder/runtime.ts";
import { Replay } from "../testing/replay.ts";
import { fakeNode, world, type World } from "../testing/fake-nodes.ts";
import { at, GENESIS, WEEK } from "../testing/fake-clock.ts";
import { NotYet, type GameModule } from "../recorder/types.ts";
import { rollingClock, rollingNo, scheduleName } from "../publish/check.inline.mjs";

const MIN = 60000, PICKS = 16;
const cfg: KitGameCfg = {
  slug: "rolling-wide", game: 242, genesis: GENESIS, weekMs: WEEK, sundayFunRound: false, payoutRule: "d152", vaultValues: "dense255",
  entry: { minRounds: 1, minPoints: 1 }, minPts: 0, rowCap: 0, liveWeek: false, roundsCorrectable: false,
  rolling: { roundMin: 30, gameMin: 720, leadMin: 5, scheduleFromMin: 213, scheduleToMin: 140, cancelAfterMin: 135 },
};
const C = rollingClock(cfg);
const N0 = 5 * 336 + 2 * 48 + 20;
let failFirst = new Set<number>();
const game: GameModule<{ n?: number }, number, unknown> = {
  slug: "rolling-wide",
  picks: { source: "picks-contract", gameId: PICKS },
  roundsFor(week) { return rollingRounds(week, cfg, (n) => n); },
  async scheduleFor(n, start, ctx) {
    if (failFirst.has(n)) { failFirst.delete(n); throw new NotYet(`round ${n}: data not in yet`); }
    const before = [...ctx.schedules!.values()].filter((b: any) => b.start < start).length;
    return { n, start, queue: before };
  },
  async resultOf() { return 1; },
  scoreRound(_r, picks) { return new Map(picks.map((p) => [p.wallet, { points: 0, at: 0 }])); },
};
const nodes = (wd: World): [any, any] => [fakeNode("a", () => wd), fakeNode("b", () => wd)];

test("wide window: a later start waits while an earlier open start has no file; the queue never forks", async () => {
  const wd = world(at(5)), rp = new Replay(game, cfg);
  const run = (t: number) => { wd.time = t; return rp.hour(nodes(wd), t + 5 * MIN); };
  failFirst = new Set([N0]);
  // 170 min before N0: N0's window (213..140) and N0 + 1's (183..110 before N0) are both open. N0 fails this run.
  let h = await run(C.start(N0) - 170 * MIN);
  assert.ok(!h.published.includes(scheduleName(N0)), "N0 failed this run");
  assert.ok(!h.published.includes(scheduleName(N0 + 1)), "N0 + 1 waits for N0 (it would carry the queue without N0)");
  // 145 min before N0: N0's window is still open; both files are made now, in order.
  h = await run(C.start(N0) - 145 * MIN);
  assert.ok(h.published.includes(scheduleName(N0)) && h.published.includes(scheduleName(N0 + 1)), h.published.join());
  assert.equal(rp.read(scheduleName(N0)).body.queue, 0);
  assert.equal(rp.read(scheduleName(N0 + 1)).body.queue, 1, "N0 + 1 continues from N0's file: no fork");
  void rollingNo;
});
