// B2 (1): per-part size caps for parts games. A parts game's week is published as W<NNN>/ (each part under kit/parts'
// 2 MB cap), so the recorder's one-file limit (1.9 MB) and the publish check's 2 MB rule on the rebuilt week no longer
// stop it; the whole week has its own, larger limit (MAX_PARTS_WEEK_BYTES). A one-file game keeps the old limits, and a
// real incoming file over 2 MB is still held. Acceptance on Fantasy's own sim: 5,000, 9,000 and 10,000 players write
// and publish every file (B2 notes).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exampleGame, exampleCfg } from "../testing/example/index.ts";
import { Replay } from "../testing/replay.ts";
import { fakeNode, world } from "../testing/fake-nodes.ts";
import { at, DAY, HOUR as H } from "../testing/fake-clock.ts";
import { partsViews, useKitParts, MAX_FILE_BYTES, MAX_PARTS_WEEK_BYTES } from "../publish/check.inline.mjs";
import { MAX_WRITE_BYTES, MAX_PARTS_WEEK_WRITE_BYTES } from "../recorder/store.ts";
import * as KP from "../parts/parts.inline.mjs";
useKitParts(KP);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (k: number) => { let s = "", n = k; for (let i = 0; i < 12; i++) { s += B58[n % 58]; n = Math.floor(n / 58); } return ("1W" + s).padEnd(34, "z").slice(0, 34); };

/** The example game's world with N staked players, each answering the week's four questions. */
function bigWorld(N: number) {
  const wd = world(at(5, 0, 2));
  wd.questions[200] = { week: "3", outcome: 1, lock_time: String(at(4) - DAY) };
  for (let i = 0; i < 4; i++) wd.questions[201 + i] = { week: "4", outcome: 1 + (i % 2), lock_time: String(at(4) + (i + 1) * DAY) };
  wd.next = 205;
  wd.players = Array.from({ length: N }, (_, k) => ({ address: addr(k), entry: { stake: "500000000", peak_stake: "500000000", voided: false, answers: [0, 1, 2, 3].map((i) => ({ question_id: 201 + i, option: (k >> i) & 1 })) } }));
  return wd;
}
const nodes = (wd: any): [any, any] => [fakeNode("a", () => wd), fakeNode("b", () => wd)];

test("B2 (1): the limits: a parts week may hold more than one file, every real file keeps 2 MB", () => {
  assert.equal(MAX_FILE_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_PARTS_WEEK_BYTES, 16 * 1024 * 1024);
  assert.ok(MAX_WRITE_BYTES < MAX_FILE_BYTES && MAX_PARTS_WEEK_WRITE_BYTES < MAX_PARTS_WEEK_BYTES && MAX_PARTS_WEEK_WRITE_BYTES > MAX_WRITE_BYTES);
  assert.equal(KP.MAX_PART_BYTES, MAX_FILE_BYTES, "each part keeps the publish job's 2 MB cap");
});

test("B2 (1): a week over 1.9 MB stops a one-file game but goes final as parts, and the publish check passes it", async () => {
  const N = 19000;
  // One-file game: the recorder stops with the old message (nothing published for the week).
  const plain = new Replay(exampleGame, exampleCfg()), wdA = bigWorld(N);
  const a = await plain.hour(nodes(wdA), wdA.time + 5 * 60000);
  assert.match(String(a.error), /over the 1855 KB the kit writes: this game has outgrown one week file/);
  // Parts game, same world: final after the week, and every published file is under 2 MB.
  const parts = new Replay(exampleGame, { ...exampleCfg(), parts: "d" }), wdB = bigWorld(N);
  let h: any;
  for (let i = 0; i < 3; i++) { h = await parts.hour(nodes(wdB), wdB.time + 5 * 60000); assert.equal(h.error, undefined, h.error); assert.deepEqual(h.held ?? [], [], JSON.stringify(h.held)); wdB.time += H; }
  const wk = parts.read("W004.json");
  assert.equal(wk.state, "final");
  assert.ok(Buffer.byteLength(JSON.stringify(wk)) > MAX_FILE_BYTES, "the test week really is over 2 MB (the check's one-file rule)");
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk((parts as any).pub)) assert.ok(fs.statSync(f).size <= MAX_FILE_BYTES, `${f} is over 2 MB`);
  assert.ok(parts.read("vault/W4.json"), "its vault file is published");
});

test("B2 (1): in a parts game, a real incoming file over 2 MB is still held (only rebuilt weeks get the parts limit)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "b2-caps-")), inDir = path.join(root, "in"), pubDir = path.join(root, "pub");
  fs.mkdirSync(inDir); fs.mkdirSync(pubDir);
  fs.writeFileSync(path.join(inDir, "W009.json"), "x".repeat(MAX_FILE_BYTES + 1));
  fs.writeFileSync(path.join(inDir, "W010.json"), "{}");
  const v = partsViews({ ...exampleCfg(), slug: "example", parts: "d" }, inDir, pubDir, root);
  assert.deepEqual(v.held, [{ name: "W009.json", why: "over 2 MB" }]);
  assert.ok(!fs.existsSync(path.join(v.inDir, "W009.json")), "not passed on to the week check");
  assert.ok(fs.existsSync(path.join(v.inDir, "W010.json")), "a small file is passed on as before");
  fs.rmSync(root, { recursive: true, force: true });
});
