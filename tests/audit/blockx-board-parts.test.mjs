// Block X board on KG parts (shape doc BLOCKX-BOARD-PARTS-SHAPE-2026-11-13): the writer, the reader steps, the switch. Offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const P = await import("../../bot/games/blockx-parts.ts");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (i) => { let s = "1", n = i + 1; while (s.length < 34) { s += B58[n % 58]; n = Math.floor(n / 58) + 7 * s.length; } return s; };
const row = (i, place) => ({ a: addr(i), place, boardPlace: place, pts: 1000 - i, correct: i % 7, picks: 5 + (i % 3), days: 1 + (i % 4), lastCorrect: 1000 + i, ranked: i % 5 === 0 });
const rows = (n) => Array.from({ length: n }, (_, i) => row(i, i + 1));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bxparts-"));
const board = (n = 250) => ({ v: 1, updated: "2026-11-23T05:40:01.550Z",
  today: { day: "2026-11-23", rows: rows(40) }, week: { week: 5, start: 1795392000000, rows: rows(n) },
  lastWeek: { week: 4, start: 1794787200000, final: true, prizes: [{ a: addr(0), vhp: 2 }], rows: rows(30) }, allTime: { rows: rows(n + 50) } });

test("folder names: BW + 3 digits, BD + the UTC day, BA", () => {
  assert.equal(P.weekFolder(5), "BW005"); assert.equal(P.weekFolder(123), "BW123");
  assert.equal(P.dayFolder("2026-11-23"), "BD-20261123"); assert.equal(P.ALL_TIME_FOLDER, "BA");
});

test("columns and the 17 expected parts are exactly the shape doc's", () => {
  assert.deepEqual(P.COLS, [["player","a"],["place","i"],["boardPlace","i"],["pts","i"],["correct","i"],["picks","i"],["days","i"],["lastCorrect","i"],["ranked","b"]]);
  assert.equal(P.EXPECT17.length, 17); assert.ok(P.EXPECT17.includes("top") && P.EXPECT17.includes("p/0") && P.EXPECT17.includes("p/f"));
});

test("board v2: v is 2, every list keeps its v1 fields and adds players, parts, hash; rows are the top 100", () => {
  const d = tmp(), b = board();
  const { board: v2 } = P.writeBoardV2(d, b, 1795000000000);
  assert.equal(v2.v, 2); assert.equal(v2.updated, b.updated);
  assert.equal(v2.week.week, 5); assert.equal(v2.week.start, b.week.start); assert.equal(v2.week.players, 250); assert.equal(v2.week.parts, "BW005"); assert.match(v2.week.hash, /^[0-9a-f]{64}$/);
  assert.equal(v2.week.rows.length, 100); assert.deepEqual(v2.week.rows[0], b.week.rows[0]);
  assert.equal(v2.today.parts, "BD-20261123"); assert.equal(v2.today.players, 40); assert.equal(v2.today.rows.length, 40);
  assert.equal(v2.lastWeek.parts, "BW004"); assert.equal(v2.lastWeek.final, true); assert.deepEqual(v2.lastWeek.prizes, b.lastWeek.prizes);
  assert.equal(v2.allTime.parts, "BA"); assert.equal(v2.allTime.players, 300);
});

test("each folder holds a manifest, top and all 16 shards; a final lastWeek folder is final, the others pending", () => {
  const d = tmp(); P.writeBoardV2(d, board(), 1795000000000);
  for (const [f, state, week] of [["BW005", "pending", 5], ["BW004", "final", 4], ["BD-20261123", "pending", 0], ["BA", "pending", 0]]) {
    const m = JSON.parse(fs.readFileSync(path.join(d, f, "manifest.json"), "utf8"));
    assert.equal(m.game, "blockx"); assert.equal(m.file, f); assert.equal(m.week, week); assert.equal(m.state, state); assert.equal(m.shards, 16);
    assert.deepEqual([...m.expect].sort(), [...P.EXPECT17].sort()); assert.equal(m.parts.length, 17);
  }
});

test("a list with no rows still gets its folder (empty top and 16 empty shards) and players 0", () => {
  const d = tmp(), b = board(); b.today.rows = [];
  const { board: v2 } = P.writeBoardV2(d, b, 1795000000000);
  assert.equal(v2.today.players, 0); assert.deepEqual(v2.today.rows, []);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, "BD-20261123", "manifest.json"), "utf8")).parts.length, 17);
  assert.deepEqual(P.readList(d, v2.today, 0), []);
});

test("the reader gets every row back from the shards (not the top 100), in place order, with ranked as a boolean", () => {
  const d = tmp(), b = board(); const { board: v2 } = P.writeBoardV2(d, b, 1795000000000);
  const got = P.readList(d, v2.week, 5);
  assert.equal(got.length, 250); assert.deepEqual(got.map((x) => x.a), b.week.rows.map((x) => x.a));
  assert.deepEqual(got[3], { player: addr(3), place: 4, boardPlace: 4, pts: 997, correct: 3, picks: 5, days: 4, lastCorrect: 1003, ranked: false, a: addr(3) });
  assert.equal(got.find((x) => x.a === addr(0)).ranked, true);
});

test("the reader fails loudly: wrong hash, missing folder, a list that is final but not its folder, a changed shard, a wrong count", () => {
  const d = tmp(), b = board(); const { board: v2 } = P.writeBoardV2(d, b, 1795000000000);
  assert.throws(() => P.readList(d, { ...v2.week, hash: "0".repeat(64) }, 5), /hash/);
  assert.throws(() => P.readList(d, { ...v2.week, parts: "BW099" }, 5), /manifest/);
  assert.throws(() => P.readList(d, v2.week, 6), /another game, file or week/);
  assert.throws(() => P.readList(d, { ...v2.week, final: true }, 5), /final but its folder is not/);
  assert.throws(() => P.readList(d, { ...v2.week, players: 249 }, 5), /rows in the shards/);
  assert.throws(() => P.readList(d, { parts: "../x", hash: "" }, 5), /no parts folder/);
  const m = JSON.parse(fs.readFileSync(path.join(d, "BW005", "manifest.json"), "utf8"));
  const shard = m.parts.find((p) => p.part === "p/3").name, f = path.join(d, "BW005", shard);
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/\n$/, " \n"));
  assert.throws(() => P.readList(d, v2.week, 5), /canonical/);
});

test("a final folder is never changed: the same rows write nothing, different rows stop the run", () => {
  const d = tmp(), b = board(); P.writeBoardV2(d, b, 1795000000000);
  const r = P.writeBoardV2(d, b, 1795000099999);
  assert.equal(r.board.lastWeek.hash, P.writeBoardV2(tmp(), b, 1795000000000).board.lastWeek.hash);
  const b2 = board(); b2.lastWeek.rows[0] = { ...b2.lastWeek.rows[0], pts: 5 };
  assert.throws(() => P.writeBoardV2(d, b2, 1795000200000), /final/);
});

test("the same board gives the same bytes and hashes (deterministic)", () => {
  const a = P.writeBoardV2(tmp(), board(), 1795000000000).board, c = P.writeBoardV2(tmp(), board(), 1795000000000).board;
  assert.deepEqual(a, c);
});

test("the switch: the recorder writes v2 only when BLOCKX_PARTS=on; otherwise board.json stays v1 (source pin)", () => {
  const src = fs.readFileSync("bot/games/blockx.ts", "utf8");
  assert.match(src, /if \(E\.BLOCKX_PARTS === "on"\) \{[\s\S]{0,300}writeBoardV2\(OUT, board, head\.time\)/);
  assert.match(src, /\} else fs\.writeFileSync\(path\.join\(OUT, "board\.json"\), JSON\.stringify\(board\) \+ "\\n"\);/);
  assert.equal((src.match(/E\.BLOCKX_PARTS/g) || []).length, 1, "one switch, read in one place");
});
