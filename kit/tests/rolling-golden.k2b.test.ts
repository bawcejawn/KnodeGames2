// Vault's K-2b for the rolling-rounds kit PR: the live kit configs' paths, byte for byte as before. The kit-example game
// (answers from the vault) is replayed pending → final with (a) Fantasy's config shape: sundayFunRound true, liveWeek
// false, with a Sunday question so the fun-round path runs; (b) Survivor's: liveWeek true, seasonWeeks 2 (the open copy
// of the current week and the season context). Every published file's sha256 is pinned; the pins were taken on main
// BEFORE the rolling-rounds change (KIT_GOLDEN_WRITE=1 writes them).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { exampleGame as game, exampleCfg } from "../testing/example/index.ts";
import { sha256 } from "../publish/check.inline.mjs";
import { Replay } from "../testing/replay.ts";
import { fakeNode, world, type World } from "../testing/fake-nodes.ts";
import { at, DAY } from "../testing/fake-clock.ts";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", C = "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const FIX = new URL("./fixtures/rolling-golden.k2b.json", import.meta.url);

/** Week 4 with five questions, the last one locking on Sunday (a fun round when sundayFunRound is on). */
function qworld(): World {
  const s4 = at(4);
  const wd = world(at(5, 0, 2));
  wd.questions[200] = { week: "3", outcome: 1, lock_time: String(s4 - DAY) };
  for (let i = 0; i < 4; i++) wd.questions[201 + i] = { week: "4", outcome: 1 + (i % 2), lock_time: String(s4 + (i + 1) * DAY / 2) };
  wd.questions[205] = { week: "4", outcome: 2, lock_time: String(s4 + 6 * DAY + DAY / 2) };
  wd.next = 206;
  const ans = (o: number[]) => o.map((x, i) => ({ question_id: 201 + i, option: x }));
  wd.players = [
    { address: A, entry: { stake: "500000000", peak_stake: "500000000", voided: false, answers: ans([0, 1, 0, 1, 1]) } },
    { address: B, entry: { stake: "0", peak_stake: "0", voided: false, answers: ans([0, 1, 1, 0, 1]) } },
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
async function replay(over: Record<string, unknown>) {
  const cfg = { ...exampleCfg(), ...over } as any;
  const wd = qworld(), rp = new Replay(game, cfg);
  const nodes = (): [any, any] => [fakeNode("a", () => wd), fakeNode("b", () => wd)];
  const errors: string[] = [];
  for (const step of [0, 30, 61, 30, 60]) {
    wd.time += step * 60000;
    const h = await rp.hour(nodes(), wd.time + 5 * 60000);
    if (h.error) errors.push(h.error);
  }
  const got: Record<string, string> = {};
  for (const f of files(rp.pub)) got[f] = sha256(fs.readFileSync(path.join(rp.pub, f), "utf8"));
  return { got, errors };
}
const CASES: Record<string, Record<string, unknown>> = {
  "fantasy-shape (sundayFunRound true, liveWeek false)": { sundayFunRound: true, liveWeek: false },
  "survivor-shape (liveWeek true, seasonWeeks 2)": { liveWeek: true, seasonWeeks: 2, sundayFunRound: false },
};

test("K-2b: the live kit configs' published files are byte for byte what main made before rolling rounds", async () => {
  const all: Record<string, Record<string, string>> = {};
  for (const [name, over] of Object.entries(CASES)) {
    const r = await replay(over);
    assert.deepEqual(r.errors, [], `${name}: ${r.errors.join("; ")}`);
    assert.ok(r.got["W004.json"] && r.got["vault/W4.json"], `${name}: the replay reached a final week and its vault file`);
    all[name] = r.got;
  }
  if (process.env.KIT_GOLDEN_WRITE) { fs.writeFileSync(FIX, JSON.stringify(all, null, 2) + "\n"); return; }
  assert.deepEqual(all, JSON.parse(fs.readFileSync(FIX, "utf8")));
});
