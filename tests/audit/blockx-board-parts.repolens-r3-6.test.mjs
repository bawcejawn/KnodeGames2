// Repo Lens #R3-6 (Block X PR #39 @ 12dc824): readList must read the bytes the manifest names, not any canonical file.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
const P = await import(path.resolve(process.env.APP || ".", "bot/games/blockx-parts.ts"));
const KP = await import(path.resolve(process.env.APP || ".", "kit/parts/parts.inline.mjs"));
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (i) => { let s = "1", n = i + 1; while (s.length < 34) { s += B58[n % 58]; n = Math.floor(n / 58) + 7 * s.length; } return s; };
const row = (i, p) => ({ a: addr(i), place: p, boardPlace: p, pts: 1000 - i, correct: i % 7, picks: 5, days: 1, lastCorrect: 1000 + i, ranked: true });
const board = () => ({ v: 1, updated: "x", today: { day: "2026-11-23", rows: [] }, week: { week: 5, start: 1, rows: Array.from({ length: 60 }, (_, i) => row(i, i + 1)) }, lastWeek: null, allTime: { rows: [] } });
function fresh() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "r36-")), v2 = P.writeBoardV2(d, board(), 1795000000000).board;
  const mf = path.join(d, "BW005", "manifest.json"), m = JSON.parse(fs.readFileSync(mf, "utf8"));
  const e = m.parts.find((p) => p.part === "p/3" || false) ?? m.parts.find((p) => p.part.startsWith("p/") && p.rows > 0);
  return { d, v2, mf, m, e, file: path.join(d, "BW005", e.name) };
}
const changed = (e, file) => {
  const dec = KP.decodePart(fs.readFileSync(file, "utf8"));
  const rows = dec.rows.map((r, i) => [r.player, r.place, r.boardPlace, i === 0 ? r.pts + 777 : r.pts, r.correct, r.picks, r.days, r.lastCorrect, r.ranked]);
  return KP.encodePart({ game: "blockx", file: "BW005", part: e.part, cols: P.COLS, rows });
};
test("R3-6.1a: a shard changed in canonical form (same file name) is refused", () => {
  const { d, v2, e, file } = fresh();
  fs.writeFileSync(file, changed(e, file).text);
  assert.throws(() => P.readList(d, v2.week, 5), /bytes are not the ones the manifest names/);
});
test("R3-6.1b: a manifest edited to match the changed shard (but not its hash) is refused", () => {
  const { d, v2, mf, m, e, file } = fresh();
  const enc = changed(e, file);
  fs.writeFileSync(path.join(d, "BW005", enc.name), enc.text); fs.rmSync(file);
  const x = m.parts.find((p) => p.part === e.part); Object.assign(x, { name: enc.name, sha256: enc.sha256, bytes: enc.bytes });
  fs.writeFileSync(mf, JSON.stringify(m));
  assert.throws(() => P.readList(d, v2.week, 5), /do not match its hash/);
});
test("R3-6.1c: a part file named differently from the manifest's name is refused", () => {
  const { d, v2, mf, m, e } = fresh();
  m.parts.find((p) => p.part === e.part).name = "p/3.000000000000.json"; fs.writeFileSync(mf, JSON.stringify(m));
  assert.throws(() => P.readList(d, v2.week, 5), /hash|file name/);
});

// R3-6.2: reader checks that no test held (each was a mutation that passed on 12dc824). They build a folder by hand with
// kit/parts so the manifest and its hash are CONSISTENT: only the rule under test is wrong.
const SH = (a) => KP.shardOf(a, 16);
const enc = (part, rows) => KP.encodePart({ game: "blockx", file: "BW005", part, cols: P.COLS, rows });
const R = (a, place) => [a, place, place, 100, 1, 1, 1, 1, 1];
function handmade(layout, state = "pending") {   // layout: { "p/3": [rows], ... }
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "r36h-")), parts = Object.entries(layout).map(([p, rows]) => enc(p, rows));
  const r = KP.writeParts(path.join(d, "BW005"), { game: "blockx", file: "BW005", week: 5, state, unit: "p", expect: P.EXPECT17, shards: 16, writtenAt: 1795000000000 }, parts);
  return { d, hash: r.manifest.hash };
}
const empty = () => Object.fromEntries([...Array.from({ length: 16 }, (_, i) => `p/${i.toString(16)}`), "top"].map((p) => [p, []]));
const find = (shard) => { for (let i = 0; i < 5000; i++) if (SH(addr(i)) === shard) return addr(i); };
test("R3-6.2a: an address in a shard that is not its own is refused", () => {
  const a = find("3"), L = empty(); L["p/4"] = [R(a, 1)];
  const { d, hash } = handmade(L);
  assert.throws(() => P.readList(d, { parts: "BW005", hash, players: 1 }, 5), /wrong shard/);
});
test("R3-6.2b: the same address twice is refused", () => {
  const a = find("3"), L = empty(); L["p/3"] = [R(a, 1), R(a, 2)];
  const { d, hash } = handmade(L);
  assert.throws(() => P.readList(d, { parts: "BW005", hash, players: 2 }, 5), /twice/);
});
test("R3-6.2c: a folder missing one of the 17 expected parts is refused", () => {
  const L = empty(); delete L.top;
  const { d, hash } = handmade(L);
  assert.throws(() => P.readList(d, { parts: "BW005", hash, players: 0 }, 5), /part top is missing/);
});
test("R3-6.2d: `top` holds the top 100 only (pages never get the whole field)", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "r36t-")), b = board(); b.week.rows = Array.from({ length: 250 }, (_, i) => row(i, i + 1));
  P.writeBoardV2(d, b, 1795000000000);
  const m = JSON.parse(fs.readFileSync(path.join(d, "BW005", "manifest.json"), "utf8"));
  assert.equal(m.parts.find((p) => p.part === "top").rows, 100);
});
