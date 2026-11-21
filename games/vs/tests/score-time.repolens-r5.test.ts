// Repo Lens 5, #40 (VS-1): a VS score time must lie in the vault week [start, results deadline) (kit/recorder/runtime.ts:582, NK-19).
// A Monday pick can only be made BEFORE Monday 00:00 UTC (it locks 5 min before the day), so its time is before the week.
import { test } from "node:test";
import assert from "node:assert/strict";
import { game } from "../recorder.ts";
import * as V from "../math.js";

const POOL = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", W = "1WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
const MON = Date.UTC(2026, 10, 30);                          // week 6 starts Mon 30 Nov 2026 00:00 UTC

test("VS: every scored pick's score time is inside the week, even for Monday and Tuesday rounds picked before the week", () => {
  const rosters: Record<string, any> = {};
  for (let d = MON; d < MON + 7 * V.DAY; d += V.DAY) rosters[String(d)] = V.makeRoster({ week: 6, day: d, pool: POOL, producers: [A, B], madeAt: MON - 2 * V.DAY });
  const inputs: any = { week: 6, rosters };
  const result: any = { round: "x", node: "5", rows: { [A]: "9", [B]: "1" } };   // A beats the node, B loses: number 1 (tick A) scores 2
  for (const k of [0, 1, 2, 6]) {
    const day = MON + k * V.DAY;
    const round: any = { id: `d${k}`, day, locksAt: day + V.DAY, resolvesAt: day + V.DAY, pickRound: day / V.DAY };
    const pickedAt = day - 2 * V.DAY + 3600000;               // the earliest the contract allows: 2 days ahead, plus an hour
    const s = game.scoreRound(round, [{ wallet: W, round: String(round.pickRound), pick: { number: "1" } as any, at: pickedAt }], result, inputs);
    const row = s.get(W)!;
    assert.equal(row.points, 2);
    assert.ok(row.at >= MON && row.at < MON + 10 * V.DAY, `round ${k}: score time ${new Date(row.at).toISOString()} is before the week starts: the kit stops the whole run (runtime.ts:582)`);
  }
});
