// Vault's K-2 for the rolling-rounds kit PR: a game that does NOT use rolling rounds gets exactly the same files as
// before the PR, byte for byte. The kit-example fixture (answers from the vault) is replayed hour by hour, pending to
// final, through the real publish check; every published file's sha256 is pinned. The pins were taken on main
// 2c915cc, BEFORE any rolling-rounds change. If one differs, the PR changed a non-rolling game's output: stop.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { exampleGame as game, exampleCfg } from "../testing/example/index.ts";
import { sha256 } from "../publish/check.inline.mjs";
import { Replay } from "../testing/replay.ts";
import { fakeNode, world, type World } from "../testing/fake-nodes.ts";
import { at, DAY, HOUR as H } from "../testing/fake-clock.ts";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", C = "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

function qworld(): World {
  const s4 = at(4);
  const wd = world(at(5, 0, 2));
  wd.questions[200] = { week: "3", outcome: 1, lock_time: String(s4 - DAY) };
  for (let i = 0; i < 4; i++) wd.questions[201 + i] = { week: "4", outcome: 1 + (i % 2), lock_time: String(s4 + (i + 1) * DAY / 2) };
  wd.next = 205;
  const ans = (o: number[]) => o.map((x, i) => ({ question_id: 201 + i, option: x }));
  wd.players = [
    { address: A, entry: { stake: "500000000", peak_stake: "500000000", voided: false, answers: ans([0, 1, 0, 1]) } },
    { address: B, entry: { stake: "0", peak_stake: "0", voided: false, answers: ans([0, 1, 1]) } },
    { address: C, entry: { stake: "0", peak_stake: "0", voided: false, answers: ans([0, 0]) } },
  ];
  return wd;
}

function files(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(path.join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${f}` : f;
    if (fs.statSync(path.join(dir, r)).isDirectory()) out.push(...files(dir, r)); else out.push(r);
  }
  return out;
}

// Taken on main 2c915cc (before the rolling-rounds change).
const GOLDEN: Record<string, string> = JSON.parse(fs.readFileSync(new URL("./fixtures/rolling-golden.k2.json", import.meta.url), "utf8"));

test("K-2: a non-rolling game's published files are byte for byte what main made before rolling rounds", async () => {
  const cfg = exampleCfg();
  assert.equal((cfg as any).rolling, undefined, "the fixture is not a rolling game");
  const wd = qworld(), rp = new Replay(game, cfg);
  const nodes = (): [any, any] => [fakeNode("a", () => wd), fakeNode("b", () => wd)];
  for (const step of [0, 30, 61, 30, 60]) {
    wd.time += step * 60000;
    await rp.hour(nodes(), wd.time + 5 * 60000);
  }
  const got: Record<string, string> = {};
  for (const f of files(rp.pub)) got[f] = sha256(fs.readFileSync(path.join(rp.pub, f), "utf8"));
  if (process.env.KIT_GOLDEN_WRITE) { fs.writeFileSync(new URL("./fixtures/rolling-golden.k2.json", import.meta.url), JSON.stringify(got, null, 2) + "\n"); return; }
  assert.deepEqual(got, GOLDEN);
  assert.ok(Object.keys(GOLDEN).includes("vault/W4.json") && Object.keys(GOLDEN).includes("W004.json"), "the replay reached a final week and its vault file");
  void H;
});
