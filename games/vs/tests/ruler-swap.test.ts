// Knode Games VS: what the Ruler told us to use (claude/ruler/REPLY-M180, section 5), the pool node row rule (VS-2), whole-number
// fpct (VS-3), and the page's draft rule (VS-4).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { game } from "../recorder.ts";
import * as V from "../math.js";
import { PENDING } from "../../../kit/recorder/types.ts";

const VAULT = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const MON = Date.UTC(2026, 10, 30);
const rosters: any = {};
for (let d = MON; d < MON + 7 * V.DAY; d += V.DAY) rosters[String(d)] = V.makeRoster({ week: 6, day: d, pool: VAULT, producers: [A, B], madeAt: MON - 2 * V.DAY });
const round: any = { id: "d20261130", day: MON, locksAt: MON + V.DAY, resolvesAt: MON + V.DAY, pickRound: MON / V.DAY };
const ctxFor = (producers: any[], seen: any[] = []): any => ({
  blockAt: async (ms: number) => 1000 + Math.floor((ms - MON) / 3000),
  vhp: { loaded: true, card: (s: any) => { seen.push(s); return { producers }; } },
});

test("the card settings are the Ruler's list for game 17: paying true, the Vault is the pool node, nothing else", async () => {
  const seen: any[] = [];
  await game.resultOf(round, null as any, { week: 6, rosters } as any, ctxFor([{ a: VAULT, fpct: 5 }, { a: A, fpct: 9 }], seen));
  const s = seen[0];
  assert.deepEqual({ ...s, window: undefined, round: undefined }, { game: 17, c: "500000", minK: 10, poolRule: "min", ownRule: "spot", paying: true, pooled: [VAULT], window: undefined, round: undefined });
  assert.deepEqual(Object.keys(s), ["game", "round", "window", "c", "minK", "poolRule", "ownRule", "paying", "pooled"], "no mode, version or noVoid key (the kit's key sets don't allow noVoid yet)");
  assert.equal(typeof s.round, "number");
});

test("VS-2: a card without the pool node's row is PENDING, not 'everyone scores 0'", async () => {
  const r = await game.resultOf(round, null as any, { week: 6, rosters } as any, ctxFor([{ a: A, fpct: 9 }]));
  assert.equal(r, PENDING);
});

test("VS-3: fpct values from Numbers or BigInts become whole-number text; a large value is not 1e+21; a fraction stops loudly", async () => {
  const ok: any = await game.resultOf(round, null as any, { week: 6, rosters } as any, ctxFor([{ a: VAULT, fpct: 10n ** 21n }, { a: A, fpct: 1e21 }, { a: B, fpct: 7 }]));
  assert.equal(ok.node, "1000000000000000000000");
  assert.deepEqual(ok.rows, { [A]: "1000000000000000000000", [B]: "7" });
  assert.equal(V.matchupOf(ok.rows[A], ok.node), "tie");
  await assert.rejects(game.resultOf(round, null as any, { week: 6, rosters } as any, ctxFor([{ a: VAULT, fpct: 12.5 }, { a: A, fpct: 9 }])));
});

test("VS-4: unticking the last producer drops the day's draft (only the 'vs All' button makes an empty one)", () => {
  const js = fs.readFileSync("web/vs.js", "utf8");
  assert.match(js, /if \(s\.size === 0\) draft\.delete\(d\); else draft\.set\(d, s\)/);
  assert.match(js, /onclick: \(\) => \{ draft\.set\(d, new Set\(\)\); render\(\); \}/);
});

test("roster list stand-in vs the Ruler's listAt on the kit's fixture chain: the stand-in (card entry) is a SUBSET of listAt, never wider", async () => {
  const { rulerLedger, FROM } = await import("../../../kit/testing/ruler-fixture.ts");
  const R: any = (globalThis as any).KRuler;
  const L = rulerLedger(8 * 28800), H = FROM + 15 * 28800 + 2000;
  const list: string[] = R.listAt(L, H);
  const card = R.makeCard(L, { game: 17, round: 1, window: { W0: H - 7200, W1: H - 1, L: H - 1, S0: H, S1: H + 100 }, c: 500000n, minK: 10, poolRule: "min", ownRule: "spot", paying: true, pooled: [VAULT] });
  const entry: string[] = card.producers.filter((p: any) => p.entry && p.a !== VAULT).map((p: any) => p.a);
  assert.ok(entry.every((a) => list.includes(a)), "the card's field never lists a producer that listAt would not");
  // Known difference (reported to Architecture): listAt also lists a tiny producer that the card's field leaves out. Until the kit hands
  // games ctx.vhp.list (listAt), the TEST roster can be shorter than the Ruler's list.
  assert.ok(list.length >= entry.length);
});
