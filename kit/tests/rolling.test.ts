// Rolling rounds (Over/Under, D-342 to D-370; Architecture's kit draft): a new round every 30 minutes on the vault's
// grid, each round's write-once schedule file made 213 to 183 minutes before its start, cancelled for everyone without
// one by 135 minutes before it (queue unchanged, D-344), and every round counted for the week it STARTS in. Hour by
// hour through the real publish check (Replay), plus the check's own rules on hand-made files.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rollingRounds, rollingRoundWhy, type KitGameCfg } from "../recorder/runtime.ts";
import { Replay } from "../testing/replay.ts";
import { fakeNode, world, type World } from "../testing/fake-nodes.ts";
import { at, DAY, GENESIS, HOUR as H, WEEK } from "../testing/fake-clock.ts";
import { type GameModule } from "../recorder/types.ts";
import { checkGame, canon, rollingClock, rollingId, rollingNo, rollingProblem, scheduleName, scheduleShape, startDay } from "../publish/check.inline.mjs";
import { validateManifest } from "../../tools/game-manifest.mjs";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const PICKS = 16, MIN = 60000;
/** Over/Under's settings (D-342ff): 30-minute grid, 12-hour games, picks lock 5 min before, schedule 213–183 min, cancel 135. */
const OU = { roundMin: 30, gameMin: 720, leadMin: 5, scheduleFromMin: 213, scheduleToMin: 183, cancelAfterMin: 135 };

const cfg: KitGameCfg = {
  slug: "rolling-test", game: 241, genesis: GENESIS, weekMs: WEEK, sundayFunRound: false, payoutRule: "d152", vaultValues: "dense255",
  entry: { minRounds: 1, minPoints: 1 }, minPts: 0, rowCap: 0, liveWeek: false, roundsCorrectable: false, rolling: OU,
};
const C = rollingClock(cfg);

/** A rolling game: the schedule's body is its queue position (how many schedules came before) and a line; the result is
 *  1 (Over) on even rounds and 2 (Under) on odd ones, decided from the round's own schedule. */
const seenCtx: any[] = [];
const game: GameModule<{ n?: number }, number, unknown> = {
  slug: "rolling-test",
  picks: { source: "picks-contract", gameId: PICKS },
  roundsFor(week) { return rollingRounds(week, cfg, (n) => n); },
  async scheduleFor(n, start, ctx) {
    await ctx.read.read("get_state", {});
    return { n, start, queue: ctx.schedules!.size, line: 100 + (n % 7) };
  },
  async resultOf(round, _read, _inputs, ctx) {
    seenCtx.push(ctx?.schedule);
    if (!ctx?.schedule) throw new Error(`round ${round.id} asked for a result without its schedule`);
    return rollingNo(round.id)! % 2 === 0 ? 1 : 2;
  },
  scoreRound(round, picks, result) {
    return new Map(picks.map((p) => [p.wallet, Number(p.pick.n) === result ? { points: 1, at: round.locksAt } : { points: 0, at: 0 }]));
  },
};

const N0 = 5 * 336 + 2 * 48 + 20;   // Wed of vault week 5, 10:00 UTC
const nodes = (wd: World): [any, any] => [fakeNode("a", () => wd), fakeNode("b", () => wd)];
const run = (rp: Replay, wd: World, t: number) => { wd.time = t; return rp.hour(nodes(wd), t + 5 * MIN); };
function rworld(): World {
  const wd = world(at(5));
  wd.gamePlayers = { [A]: { week_stake: "500000000", peak_stake: "500000000" }, [B]: { week_stake: "0", peak_stake: "0" } };
  wd.picks = {
    [`${PICKS}:${N0}`]: [{ player: A, pick: { n: 1, time: String(C.locksAt(N0) - 600000) } }],
    [`${PICKS}:${N0 + 1}`]: [{ player: B, pick: { n: 2, time: String(C.locksAt(N0 + 1) - 600000) } }],
    [`${PICKS}:${N0 + 2}`]: [{ player: A, pick: { n: 1, time: String(C.locksAt(N0 + 2) - 600000) } }],
  };
  return wd;
}

test("rolling settings: Over/Under's pass; the order and the window rules are enforced", () => {
  assert.equal(rollingProblem(OU), "");
  assert.match(rollingProblem({ ...OU, scheduleToMin: 213 }), /scheduleFromMin > scheduleToMin/);
  assert.match(rollingProblem({ ...OU, cancelAfterMin: 190 }), /scheduleToMin > cancelAfterMin/);
  assert.match(rollingProblem({ ...OU, scheduleToMin: 200 }), /at least one round/);
  assert.match(rollingProblem({ ...OU, gameMin: 725 }), /whole number of rounds/);
  assert.match(rollingProblem({ ...OU, roundMin: 7 }), /rounds a day/);
  const { leadMin: _l, ...noLead } = OU;
  assert.match(rollingProblem(noLead), /in this order/);
});

test("rolling manifest: game.json's schema takes \"rolling\" and needs the Picks contract", () => {
  const base = JSON.parse(fs.readFileSync(new URL("../../games/survivor/game.json", import.meta.url), "utf8"));
  const m = { ...base, slug: "overunder", name: "Over Under", vaultGameId: 16, rolling: OU };
  delete m.seasonWeeks; m.seasonWeeks = 1; delete m.parts;
  assert.deepEqual(validateManifest(m, { kit: true }).filter((p: string) => /rolling/.test(p)), []);
  assert.ok(validateManifest({ ...m, picks: { contract: "none" } }, { kit: true }).some((p: string) => /Picks contract/.test(p)));
  assert.ok(validateManifest({ ...m, rolling: { ...OU, cancelAfterMin: 4 } }, { kit: true }).some((p: string) => /cancelAfterMin > leadMin/.test(p)));
});

test("rolling grid: 336 rounds a week, ids r#####, every round counted for the week and day it STARTS in (Mon 00:00 is the new week)", () => {
  const span = { start: at(5), end: at(6) };
  const rs = rollingRounds(span, cfg);
  assert.equal(rs.length, 336);
  assert.equal(rs[0].id, rollingId(5 * 336));
  assert.equal(C.start(rollingNo(rs[0].id)!), at(5), "the round starting at Mon 00:00 is the new week's first");
  assert.equal(rs[0].day, at(5), "and it counts for Monday (not dayOf(locksAt), which would be Sunday)");
  assert.equal(rs[0].locksAt, at(5) - 5 * MIN);
  assert.equal(rs[0].resolvesAt, at(5) + 12 * H);
  const last = rs[rs.length - 1];
  assert.equal(C.start(rollingNo(last.id)!), at(6) - 30 * MIN, "Sun 23:30 is the old week's last");
  assert.equal(last.day, at(6) - DAY);
  for (const r of rs) assert.equal(rollingRoundWhy(r, cfg, span), "");
  assert.match(rollingRoundWhy({ ...rs[3], day: rs[3].day - DAY }, cfg, span), /grid round/);
  assert.match(rollingRoundWhy(rs[0], cfg, { start: at(6), end: at(7) }), /outside the week/);
  assert.match(rollingRoundWhy({ ...rs[0], id: "x1" }, cfg, span), /r#####/);
  assert.equal(startDay(at(5) + 23 * H + 30 * MIN), at(5));
  assert.throws(() => rollingId(100000));
});

test("rolling: each schedule file is made once inside its window (213–183 min before), on both nodes, seeing the earlier ones; a round without one by 135 min before is cancelled for everyone", async () => {
  seenCtx.length = 0;
  const wd = rworld(), rp = new Replay(game, cfg);
  // N0's window: one run 200 min before its start makes it; a run 10 min later doesn't make it again.
  let h = await run(rp, wd, C.start(N0) - 200 * MIN);
  assert.equal(h.error, undefined, h.error);
  assert.deepEqual(h.held, []);
  assert.ok(h.published.includes(scheduleName(N0)), h.published.join());
  assert.equal(h.published.filter((f) => f.startsWith("schedule/")).length, 1, "exactly one round's window holds this run");
  const first = rp.raw(scheduleName(N0));
  h = await run(rp, wd, C.start(N0) - 190 * MIN);
  assert.deepEqual(h.published.filter((f) => f.startsWith("schedule/")), [], "made once, never again");
  assert.deepEqual(h.held, [], "and nothing was offered again (a second copy would be a changed write-once file)");
  assert.equal(rp.raw(scheduleName(N0)), first);
  // N0 + 1's window: its body sees N0's schedule (the queue so far).
  h = await run(rp, wd, C.start(N0 + 1) - 200 * MIN);
  assert.ok(h.published.includes(scheduleName(N0 + 1)));
  assert.equal(rp.read(scheduleName(N0 + 1)).body.queue, 1);
  assert.equal(rp.read(scheduleName(N0)).body.queue, 0);
  // N0 + 2: no run in its window (a missed run). It is cancelled; the queue is unchanged for N0 + 3.
  h = await run(rp, wd, C.start(N0 + 3) - 200 * MIN);
  assert.ok(h.published.includes(scheduleName(N0 + 3)));
  assert.ok(!fs.existsSync(path.join(rp.pub, scheduleName(N0 + 2))));
  assert.equal(rp.read(scheduleName(N0 + 3)).body.queue, 2, "the cancelled round didn't move the queue (D-344)");
  // After the week ends: the scheduled rounds are decided from their schedules; N0 + 2 (and every unscheduled round) is void.
  h = await run(rp, wd, at(6, 0, 13));
  assert.equal(h.error, undefined, h.error);
  assert.deepEqual(h.held, [], JSON.stringify(h.held));
  const wk = rp.read("W005.json");
  const st = new Map(wk.rounds.map((r: any) => [r[0], r[3]]));
  assert.equal(st.get(rollingId(N0)), "s");
  assert.equal(st.get(rollingId(N0 + 1)), "s");
  assert.equal(st.get(rollingId(N0 + 2)), "v", "no schedule file: cancelled");
  assert.equal(st.get(rollingId(N0 + 3)), "s");
  assert.equal([...st.values()].filter((x) => x === "s").length, 3);
  assert.equal(wk.rounds.length, 336);
  assert.ok(seenCtx.every((x) => x && typeof x.line === "number"), "resultOf always got its round's schedule");
  const row = (id: string) => wk.rounds.find((r: any) => r[0] === id)[4];
  assert.deepEqual(row(rollingId(N0)).map((x: any) => x.slice(0, 2)), [[wk.players.findIndex((p: any) => p[0] === A), 1]], "A picked Over (1) on an even round: 1 point");
  assert.deepEqual(row(rollingId(N0 + 2)).map((x: any) => x.slice(0, 2)), [[wk.players.findIndex((p: any) => p[0] === A), 0]], "a cancelled round scores nothing");
});

test("rolling publish check: a schedule file is write-once, only inside its window by the job's clock, never after its cancel time; a non-rolling game can't publish one", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-rolling-"));
  const n = N0, inn = path.join(tmp, "in"), pub = path.join(tmp, "pub");
  const put = (dir: string, rel: string, v: any) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), typeof v === "string" ? v : canon(v)); };
  const file = (written = C.scheduleFrom(n) + 5 * MIN, body: any = { line: 101 }) => ({ v: 1, game: cfg.game, round: rollingId(n), start: C.start(n), written, body });
  const check = (now: number, c: any = cfg) => checkGame(c, inn, pub, now);
  const reset = () => { fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(inn, { recursive: true }); fs.mkdirSync(pub, { recursive: true }); };

  reset(); put(inn, scheduleName(n), file());
  assert.deepEqual(check(C.scheduleFrom(n) + 6 * MIN).publish, [scheduleName(n)], "inside its window: published");
  assert.match(check(C.scheduleFrom(n) - 30 * MIN).held[0].why, /before its window/);
  assert.match(check(C.cancelAt(n) + MIN).held[0].why, /after its round's cancel time.*cancelled for everyone \(D-344\)/);
  assert.deepEqual(check(C.cancelAt(n)).publish, [scheduleName(n)], "a late publish job still makes it up to the cancel time itself");
  assert.match(check(C.scheduleFrom(n) + 6 * MIN, { ...cfg, rolling: undefined }).held[0].why, /no rolling rounds/);
  put(inn, scheduleName(n), file(C.scheduleFrom(n) - 30 * MIN));
  assert.match(check(C.scheduleFrom(n) + 6 * MIN).held[0].why, /written outside its schedule window/);
  put(inn, scheduleName(n), { ...file(), start: C.start(n) + 1 });
  assert.match(check(C.scheduleFrom(n) + 6 * MIN).held[0].why, /grid/);
  put(inn, scheduleName(n), { ...file(), body: [1] });
  assert.match(check(C.scheduleFrom(n) + 6 * MIN).held[0].why, /JSON object/);
  assert.equal(scheduleShape(file(), scheduleName(n + 1), cfg), "wrong version, game or round");

  // Write-once: an unchanged copy is fine (nothing to publish); a changed one is held, even inside the window.
  reset(); put(pub, scheduleName(n), file()); put(inn, scheduleName(n), file());
  const r = check(C.scheduleFrom(n) + 6 * MIN);
  assert.deepEqual([r.publish, r.held], [[], []]);
  put(inn, scheduleName(n), file(undefined, { line: 102 }));
  assert.match(check(C.scheduleFrom(n) + 6 * MIN).held[0].why, /changes a published schedule file \(write-once\)/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("rolling publish check: a week file that scores a round with no published schedule file is held (only a void round can lack one)", async () => {
  const wd = rworld(), rp = new Replay(game, cfg);
  await run(rp, wd, C.start(N0) - 200 * MIN);
  const h = await run(rp, wd, at(6, 0, 13));
  assert.deepEqual(h.held, []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-rolling-wk-"));
  fs.mkdirSync(path.join(tmp, "in"), { recursive: true }); fs.mkdirSync(path.join(tmp, "pub"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "in", "W005.json"), rp.raw("W005.json"));
  const r = checkGame(cfg, path.join(tmp, "in"), path.join(tmp, "pub"), at(6, 0, 13) + 5 * MIN);
  assert.equal(r.held.length, 1);
  assert.match(r.held[0].why, new RegExp(`round ${rollingId(N0)}: scored, but it has no published schedule file`));
  // With the schedule file published, the same week file passes.
  fs.mkdirSync(path.join(tmp, "pub", "schedule"));
  fs.writeFileSync(path.join(tmp, "pub", scheduleName(N0)), rp.raw(scheduleName(N0)));
  assert.deepEqual(checkGame(cfg, path.join(tmp, "in"), path.join(tmp, "pub"), at(6, 0, 13) + 5 * MIN).held, []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("rolling: a rolling game whose roundsFor leaves the grid stops the run (KC-30, rolling)", async () => {
  const wd = rworld();
  const bad: GameModule<any, any, any> = { ...game, roundsFor(week) { const rs = rollingRounds(week, cfg, (n) => n); rs[5] = { ...rs[5], resolvesAt: rs[5].resolvesAt + 1 }; return rs; } };
  const rp = new Replay(bad, cfg);
  const h = await run(rp, wd, at(6, 0, 13));
  assert.match(h.error ?? "", /grid round.*KC-30, rolling/);
});
