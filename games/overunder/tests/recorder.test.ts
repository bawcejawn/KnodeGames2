// Over Under recorder (games/overunder/recorder.ts): the schedule file (who plays, the line), the queue it carries, and the
// line re-check on the scored card. A fake ruler and a fake chain (one block every 3 s), so each test runs in milliseconds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { game, markOf } from "../recorder.ts";
import { VOID, NotYet } from "../../../kit/recorder/types.ts";
import * as R from "../math.js";

const require = createRequire(import.meta.url);
require("../../../ruler/vhp-ruler.js");
const KR = (globalThis as any).KRuler;

const POOL = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
const A = (i: number) => "1" + "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[i].repeat(33);
const T0 = R.WEEK0 + 6 * R.WEEK_MS + 2 * 86400000;                // Wed 2 Dec 2026 00:00 UTC
const H0 = 1_000_000, blockAt = async (t: number) => H0 + Math.floor((t - R.WEEK0) / 3000);

/** A fake ruler: every card lists `rows` (k, form in millionths; entry true unless said); it records the settings asked for. */
function fakeCtx(rows: Record<string, { k: number; form: number; entry?: boolean; credited?: number | null }>, schedules = new Map<string, any>(), now = 0) {
  const asked: any[] = [];
  const vhp = {
    card(s: any) {
      asked.push(s);
      return { producers: Object.entries(rows).map(([a, r]) => ({ a, k: String(r.k), form: String(r.form), entry: r.entry !== false, credited: r.credited === undefined ? null : r.credited === null ? null : String(r.credited), void: false })) };
    },
  };
  return { ctx: { now, read: {}, vhp, blockAt, schedules } as any, asked };
}
const roundId = (start: number) => "r" + String(Math.round((start - R.WEEK0) / R.SLOT)).padStart(5, "0");
const nOf = (start: number) => Math.round((start - R.WEEK0) / R.SLOT);

/** Runs scheduleFor for `count` starts in a row (each sees the files before it), skipping the starts in `cancel`. */
async function chain(rows: any, count: number, cancel = new Set<number>()) {
  const sched = new Map<string, any>(), who: (string | null)[] = [];
  for (let i = 0; i < count; i++) {
    const start = T0 + i * R.SLOT;
    if (cancel.has(i)) { who.push(null); continue; }
    try {
      const { ctx } = fakeCtx(rows, new Map(sched), start - R.SCHEDULE_FROM_MIN * R.MIN);
      const body = JSON.parse(JSON.stringify(await game.scheduleFor!(nOf(start), start, ctx)));
      sched.set(roundId(start), body); who.push(body.entry.producer);
    } catch (e) { if (e instanceof NotYet) { who.push(null); continue; } throw e; }
  }
  return { sched, who };
}
const rowsOf = (n: number, k = 900_000_000, form = 990_000) => Object.fromEntries(Array.from({ length: n }, (_, i) => [A(i), { k, form }]));

test("the schedule card sits wholly in the past when the file is made (the ruler can make it), on a 6-hour mark", async () => {
  const start = T0 + 13 * R.SLOT, { ctx, asked } = fakeCtx(rowsOf(3));
  await game.scheduleFor!(nOf(start), start, ctx);
  const w = asked[0].window, opensAt = await blockAt(start - R.SCHEDULE_FROM_MIN * R.MIN);
  assert.ok(w.S1 + KR.DELAY <= opensAt - 500, "scored range ends well before the window opens");
  assert.equal(w.S1 - w.S0 + 1, R.GAME_BLOCKS, "same size as a game, so k is a game's k");
  assert.ok(w.W0 <= w.W1 && w.W1 === w.L && w.L === w.S0 - 1 && w.W1 - w.W0 + 1 === 7200);
  assert.equal(markOf(start) % (6 * 3600000), 0);
  assert.equal(asked[0].round, markOf(start) / (6 * 3600000));
  // every start with the same mark asks for the very same card
  const other = start + R.SLOT, b = fakeCtx(rowsOf(3));
  if (markOf(other) === markOf(start)) { await game.scheduleFor!(nOf(other), other, b.ctx); assert.deepEqual(b.asked[0], asked[0]); }
});

test("the card settings are the Ruler's for game 16 (with the Vault pooled)", async () => {
  const { ctx, asked } = fakeCtx(rowsOf(3));
  await game.scheduleFor!(nOf(T0), T0, ctx);
  const s = asked[0];
  assert.deepEqual(Object.keys(s), ["game", "round", "window", "c", "minK", "poolRule", "ownRule", "paying", "pooled"]);
  assert.deepEqual({ ...s, round: 0, window: 0 }, { game: 16, round: 0, window: 0, c: "500000", minK: 10, poolRule: "min", ownRule: "spot", paying: true, pooled: [POOL] });
});

test("KR-1: a missing schedule file (a cancelled start) leaves the queue exactly as if that start never happened", async () => {
  const rows = rowsOf(6);
  const full = await chain(rows, 12);
  const cut = await chain(rows, 12, new Set([4]));
  // the start after the cancelled one takes the producer the cancelled start would have had
  assert.equal(cut.who[5], full.who[4]);
  // and re-running a later start with an earlier file deleted from the map gives the same answer as the cancelled chain
  const m = new Map(full.sched); for (const id of [...m.keys()]) if (id >= roundId(T0 + 4 * R.SLOT)) m.delete(id);
  const start = T0 + 4 * R.SLOT + R.SLOT, { ctx } = fakeCtx(rows, m, start - R.SCHEDULE_FROM_MIN * R.MIN);
  const body = await game.scheduleFor!(nOf(start), start, ctx);
  assert.equal((body as any).entry.producer, cut.who[5]);
});

test("every file carries the queue; a bad queue in a file stops the run loudly", async () => {
  const { sched } = await chain(rowsOf(4), 3);
  for (const b of sched.values()) assert.deepEqual(Object.keys(b), ["entry", "state"]);
  const m = new Map(sched); const last = [...m.keys()].pop()!;
  m.set(last, { ...m.get(last), state: { launched: true, initial: [], last: { x: 1 } } });
  const start = T0 + 3 * R.SLOT, { ctx } = fakeCtx(rowsOf(4), m);
  await assert.rejects(game.scheduleFor!(nOf(start), start, ctx), /queue state is not valid/);
});

test("a new entrant is not left at the bottom for ever: it plays once everyone ahead of it has had a turn", async () => {
  const rows: any = rowsOf(14);
  const first = await chain(rows, 4);
  const newbie = A(20);
  rows[newbie] = { k: 900_000_000, form: 990_000 };
  const sched = new Map(first.sched), who: string[] = [];
  for (let i = 4; i < 4 + 30; i++) {
    const start = T0 + i * R.SLOT, { ctx } = fakeCtx(rows, new Map(sched));
    const body = JSON.parse(JSON.stringify(await game.scheduleFor!(nOf(start), start, ctx)));
    sched.set(roundId(start), body); who.push(body.entry.producer);
  }
  const at = who.indexOf(newbie);
  assert.ok(at >= 0 && at <= 16, `the new entrant played at start ${at}`);
});

test("Unreliable producers (form below 80%) and the pool node never play; nobody left = no game (NotYet, the kit cancels)", async () => {
  const rows = { [A(0)]: { k: 900_000_000, form: 799_999 }, [POOL]: { k: 900_000_000, form: 990_000 }, [A(1)]: { k: 900_000_000, form: 990_000, entry: false } };
  const { ctx } = fakeCtx(rows);
  await assert.rejects(game.scheduleFor!(nOf(T0), T0, ctx), (e: any) => e instanceof NotYet);
  const ok = { ...rows, [A(2)]: { k: 900_000_000, form: 800_000 } };
  const b = fakeCtx(ok);
  assert.equal(((await game.scheduleFor!(nOf(T0), T0, b.ctx)) as any).entry.producer, A(2));
});

test("the line is the Ruler's helpers on the schedule card's row", async () => {
  const { ctx } = fakeCtx({ [A(0)]: { k: 1_234_567_890, form: 950_000 } });
  const e = ((await game.scheduleFor!(nOf(T0), T0, ctx)) as any).entry;
  assert.equal(e.line, Number(KR.medianLineHalves(KR.forecastExpected({ k: 1_234_567_890n, form: 950_000n }))));
});

test("resultOf: the scored card uses the schedule card's round and size window; a line that doesn't match it cancels the game", async () => {
  const sc = fakeCtx({ [A(0)]: { k: 900_000_000, form: 990_000 } });
  const body = JSON.parse(JSON.stringify(await game.scheduleFor!(nOf(T0), T0, sc.ctx)));
  const round: any = { id: roundId(T0), day: 0, locksAt: T0 - R.LEAD, resolvesAt: T0 + R.GAME_MS, pickRound: nOf(T0) };
  const line = body.entry.line;                                    // half blocks: Over iff credited x 2 > line
  const over = fakeCtx({ [A(0)]: { k: 900_000_000, form: 990_000, credited: (line + 1) * 500_000 } });
  const r = await game.resultOf(round, {} as any, undefined, { ...over.ctx, schedule: body } as any);
  assert.deepEqual(r, { outcome: "over", producer: A(0), line });
  const w = over.asked[0];
  assert.equal(w.round, sc.asked[0].round);
  assert.deepEqual([w.window.W0, w.window.W1, w.window.L], [sc.asked[0].window.W0, sc.asked[0].window.W1, sc.asked[0].window.L]);
  assert.equal(w.window.S0, await blockAt(T0));
  assert.equal(w.window.S1 - w.window.S0 + 1, R.GAME_BLOCKS);
  const changed = fakeCtx({ [A(0)]: { k: 990_000_000, form: 990_000, credited: 0 } });
  assert.equal(await game.resultOf(round, {} as any, undefined, { ...changed.ctx, schedule: body } as any), VOID);
  assert.equal(await game.resultOf(round, {} as any, undefined, { ...over.ctx } as any), VOID, "no schedule file: cancelled");
});

test("stand-ins equal the Ruler's helpers (forecastExpected, medianLineHalves, isUnreliable)", () => {
  const ks = [0n, 1n, 149_999n, 150_000n, 1_150_000n, 7_654_321n, 999_999_999n, 1_000_000_000n, 3_000_000_000n];
  const fs = [0n, 1n, 799_999n, 800_000n, 970_000n, 1_000_000n, 1_200_000n];
  for (const k of ks) for (const form of fs) {
    assert.equal(R.forecastExpected({ k, form }), KR.forecastExpected({ k, form }));
    assert.equal(R.medianLineHalves(R.forecastExpected({ k, form })), KR.medianLineHalves(KR.forecastExpected({ k, form })));
    assert.equal(R.isUnreliable({ form }), KR.isUnreliable({ form }));
  }
  assert.equal(BigInt(R.FORM_GATE), BigInt(KR.FORM_GATE));
});

test("each round's Picks round is the contract's (round_size 30 min, offset 0): start / 30 min", () => {
  const rs = (game.roundsFor as any)({ start: T0, end: T0 + 3 * R.SLOT });
  assert.equal(rs.length, 3);
  for (const r of rs) assert.equal(r.pickRound, (r.locksAt + R.LEAD) / R.SLOT);
});
