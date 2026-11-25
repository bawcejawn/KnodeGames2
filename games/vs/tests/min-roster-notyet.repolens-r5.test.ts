// Repo Lens 5, #92 (#R5-16-1): too few producers for next week's list must be NotYet (the kit warns and keeps recording the
// current week), not a plain Error (cli.ts: the whole VS run stops, "Nothing recorded this run", every run until it clears).
// Ships as games/vs/tests/min-roster-notyet.repolens-r5.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NotYet } from "../../../kit/recorder/types.ts";
import { game } from "../recorder.ts";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const ctxWith = (producers: any[]) => ({ vhp: { card: () => ({ producers }) }, blockAt: async () => 50_000_000 });
const week = { week: 7, start: Date.UTC(2026, 11, 7), end: Date.UTC(2026, 11, 14) };

test("VS inputs: fewer than 2 producers is NotYet, so the kit holds the file without stopping the run", async () => {
  for (const ps of [[], [{ a: A, entry: true }], [{ a: A, entry: true }, { a: B, entry: false }]])
    await assert.rejects(() => game.inputsFor!(week as any, ctxWith(ps) as any), (e: any) => e instanceof NotYet);
  const ok: any = await game.inputsFor!(week as any, ctxWith([{ a: A, entry: true }, { a: B, entry: true }]) as any);
  assert.equal(Object.keys(ok.rosters).length, 7);
});
