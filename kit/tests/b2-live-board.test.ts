// B2 (2): liveBoard, a display-only live ranking for a staked weekly game (Fantasy agreed: a new file, not a board.json
// change). With game.json "liveBoard": true (and no liveWeek), every run also writes live.json: this week's board rows
// from the rounds decided so far. No week file for the open week, no vault file, nothing in the all-time board; the
// publish check publishes it only for a liveBoard game and only for this week by its own clock. Not payout-deciding,
// so the vault's kit pin doesn't change.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exampleGame, exampleCfg } from "../testing/example/index.ts";
import { Replay } from "../testing/replay.ts";
import { fakeNode, world } from "../testing/fake-nodes.ts";
import { at, DAY } from "../testing/fake-clock.ts";
import { checkGame, canon } from "../publish/check.inline.mjs";
import { validateManifest, KIT_FIELDS } from "../../tools/game-manifest.mjs";
import { payoutPin } from "../recorder/manifest.ts";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
function qworld(t: number) {
  const s4 = at(4), s5 = at(5), wd = world(t);
  wd.questions[200] = { week: "3", outcome: 1, lock_time: String(s4 - DAY) };
  for (let i = 0; i < 3; i++) wd.questions[201 + i] = { week: "4", outcome: 1, lock_time: String(s4 + (i + 1) * DAY) };
  for (let i = 0; i < 4; i++) wd.questions[204 + i] = { week: "5", outcome: i < 2 ? 1 : 0, lock_time: String(s5 + (i + 1) * DAY) };
  wd.next = 208;
  const ans = (ids: number[]) => ids.map((q) => ({ question_id: q, option: 0 }));
  const p = (a: number[], b: number[]) => [
    { address: A, entry: { stake: "500000000", peak_stake: "500000000", voided: false, answers: ans(a) } },
    { address: B, entry: { stake: "0", peak_stake: "0", voided: false, answers: ans(b) } },
  ];
  wd.players = p([201, 202], [201]);
  wd.playersByWeek = { 5: p([204, 205, 206], [204]) };
  return wd;
}
const nodes = (wd: any): [any, any] => [fakeNode("a", () => wd), fakeNode("b", () => wd)];

test("B2 (2): liveBoard writes live.json for this week (rows so far); no open week file, no vault file; last week as before", async () => {
  const wd = qworld(at(5, 2, 1));          // Wednesday of week 5: two week-5 rounds decided
  const rp = new Replay(exampleGame, { ...exampleCfg(), liveBoard: true });
  const h = await rp.hour(nodes(wd), wd.time + 5 * 60000);
  assert.equal(h.error, undefined, h.error);
  assert.deepEqual(h.held ?? [], [], JSON.stringify(h.held));
  const lj = rp.read("live.json");
  assert.ok(lj, "live.json is published");
  assert.deepEqual(Object.keys(lj), ["v", "updated", "live"]);
  assert.equal(lj.live.week, 5);
  assert.equal(lj.live.final, false);
  assert.ok(lj.live.rows.some((r: any) => r.a === A), "the players so far are on it");
  assert.equal(rp.read("W005.json"), null, "no open week file");
  assert.equal(rp.read("vault/W5.json"), null, "no vault file");
  assert.ok(rp.read("W004.json"), "last week is recorded as before");
  assert.equal(rp.read("board.json").lastWeek.week, 4, "board.json is still last week's");
  const all = rp.read("alltime.json");
  assert.ok(!all || !JSON.stringify(all).includes('"week":5'), "nothing of week 5 in the all-time board");
  // next day: updated, still this week
  wd.time += DAY;
  const h2 = await rp.hour(nodes(wd), wd.time + 5 * 60000);
  assert.equal(h2.error, undefined, h2.error);
  assert.equal(rp.read("live.json").live.week, 5);
});

test("B2 (2): without liveBoard there is no live.json (unchanged)", async () => {
  const wd = qworld(at(5, 2, 1));
  const rp = new Replay(exampleGame, exampleCfg());
  await rp.hour(nodes(wd), wd.time + 5 * 60000);
  assert.equal(rp.read("live.json"), null);
});

test("B2 (2): the publish check holds live.json for a game without liveBoard, for another week, or in the wrong shape", () => {
  const cfg = { ...exampleCfg(), liveBoard: true }, now = at(5, 2, 1);
  const good = { v: 1, updated: new Date(now - 60000).toISOString(), live: { week: 5, start: at(5), final: false, complete: false, rows: [{ a: A, pts: 2 }], prizes: [] } };
  const judge = (c: any, j: any) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "b2-live-")), inDir = path.join(root, "in"), pubDir = path.join(root, "pub");
    fs.mkdirSync(inDir); fs.mkdirSync(pubDir);
    fs.writeFileSync(path.join(inDir, "live.json"), canon(j));
    const r = checkGame(c, inDir, pubDir, now);
    fs.rmSync(root, { recursive: true, force: true });
    return r;
  };
  assert.deepEqual(judge(cfg, good).publish, ["live.json"]);
  const why = (c: any, j: any) => judge(c, j).held.find((x: any) => x.name === "live.json")?.why;
  assert.match(String(why(exampleCfg(), good)), /no live ranking/);
  assert.match(String(why(cfg, { ...good, live: { ...good.live, week: 4, start: at(4) } })), /not this week's/);
  assert.match(String(why(cfg, { ...good, live: { ...good.live, final: true } })), /open week/);
  assert.match(String(why(cfg, { ...good, extra: 1 })), /shape/);
  assert.match(String(why(cfg, { ...good, updated: new Date(now + 3 * DAY).toISOString() })), /future/);
  assert.match(String(why(cfg, { ...good, live: { ...good.live, rows: [{ a: "nope" }] } })), /board rows/);
});

test("B2 (2): game.json liveBoard is a kit field, true or false, never with liveWeek, and not in the vault pin", () => {
  assert.ok(KIT_FIELDS.includes("liveBoard"));
  const src = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../games/fantasy/game.json"), "utf8"));
  const errs = (m: any) => { try { const r: any = validateManifest(m); return Array.isArray(r) ? r.join("; ") : String(r ?? ""); } catch (e) { return String((e as Error).message); } };
  assert.equal(errs({ ...src, liveBoard: true }).includes("liveBoard"), false, errs({ ...src, liveBoard: true }));
  assert.match(errs({ ...src, liveBoard: "yes" }), /liveBoard: true or false/);
  assert.match(errs({ ...src, liveBoard: true, liveWeek: true }), /liveBoard: only for a game without liveWeek/);
  assert.equal(JSON.stringify(payoutPin({ ...src, liveBoard: true })), JSON.stringify(payoutPin(src)), "the vault pin is the same");
});
