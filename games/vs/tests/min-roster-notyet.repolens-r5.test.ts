// Repo Lens 5, #92 (#R5-16-1): too few producers for next week's list must be NotYet (the kit warns and keeps recording the
// current week), not a plain Error (cli.ts: the whole VS run stops, "Nothing recorded this run", every run until it clears).
// Ships as games/vs/tests/min-roster-notyet.repolens-r5.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NotYet } from "../../../kit/recorder/types.ts";
import { game } from "../recorder.ts";
import * as V from "../math.js";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const ctxWith = (producers: any[]) => ({ vhp: { card: () => ({ producers }) }, blockAt: async () => 50_000_000 });
const week = { week: 7, start: Date.UTC(2026, 11, 7), end: Date.UTC(2026, 11, 14) };

// M-748: the list's minimum is now V.MIN_LIST (8); makeRoster's own backstop stays V.MIN_ROWS (2).
const addr = (i: number) => "1" + "ABCDEFGHJK"[Math.floor(i / 10)] + "ABCDEFGHJK"[i % 10] + "A".repeat(31);
const rows = (n: number, entry = true) => Array.from({ length: n }, (_, i) => ({ a: addr(i), entry }));

test("VS inputs: fewer than MIN_LIST (8) producers is NotYet, so the kit holds the file without stopping the run", async () => {
  assert.equal(V.MIN_LIST, 8);
  assert.ok(V.MIN_LIST > V.MIN_ROWS);
  for (const ps of [[], [{ a: A, entry: true }], [{ a: A, entry: true }, { a: B, entry: false }], rows(V.MIN_LIST - 1),
    [...rows(V.MIN_LIST - 1), { a: addr(50), entry: false }]])
    await assert.rejects(() => game.inputsFor!(week as any, ctxWith(ps) as any), (e: any) => e instanceof NotYet);
  const ok: any = await game.inputsFor!(week as any, ctxWith(rows(V.MIN_LIST)) as any);
  assert.equal(Object.keys(ok.rosters).length, 7);
  for (const r of Object.values(ok.rosters) as any[]) assert.equal(r.rows.length, V.MIN_LIST);
});
