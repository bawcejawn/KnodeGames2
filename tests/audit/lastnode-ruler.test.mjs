// Last Node Standing on the VHP ruler (owner, 11 Nov; Library, 12 Nov: ruler-only from the first live week): the hourly
// cut rule and a player's event when several nodes go in one hour. Pure math; the recorder and publish job are tested
// in lastnode-ruler-run.test.mjs.
import "./lib/quiet.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const APP = fileURLToPath(new URL("../..", import.meta.url));
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const L = globalThis.KLastNode;
const A = (c) => "1" + c.repeat(33);
const field = (...cs) => ({ nodes: cs.map((c) => ({ a: A(c) })) });
const row = (fpct, o = {}) => ({ fpct: fpct === null ? null : String(fpct), entry: true, void: false, ...o });
const hour = (m) => ({ rows: Object.fromEntries(Object.entries(m).map(([c, r]) => [A(c), r])) });

test("ruler cut: each hour the lowest fpct among the nodes still standing is cut; the last one standing wins", () => {
  const res = L.rulerCutsFrom(field("a", "b", "c"), [hour({ a: row(500000), b: row(100000), c: row(900000) }), hour({ a: row(200000), c: row(300000) })]);
  assert.deepEqual(res.cuts.map((x) => [x.at, x.a, x.why]), [[1, A("b"), "luck"], [2, A("a"), "luck"]]);
  assert.equal(res.done, true); assert.equal(res.winner, A("c")); assert.deepEqual(res.standing, [A("c")]);
});
test("ruler cut: size doesn't enter: only fpct (equal fpct: the larger address is cut)", () => {
  const res = L.rulerCutsFrom(field("a", "b"), [hour({ a: row(400000), b: row(400000) })]);
  assert.deepEqual(res.cuts.map((x) => x.a), [A("b")]); assert.equal(res.winner, A("a"));
});
test("ruler cut: a void node and a node without entry are cut in that hour, besides the hour's lowest fpct", () => {
  const res = L.rulerCutsFrom(field("a", "b", "c", "d", "e"), [hour({ a: row(500000), b: row(100000, { void: true }), c: row(900000), d: row(50000, { entry: false }), e: row(300000) })]);
  assert.deepEqual(res.cuts.map((x) => [x.a, x.why]), [[A("b"), "void"], [A("d"), "no entry"], [A("e"), "luck"]]);
  assert.equal(res.done, false); assert.deepEqual(res.standing.sort(), [A("a"), A("c")]);
});
test("ruler cut: a node missing from the hour's card, or with no fpct, is out as 'no entry' (void only when the card says so)", () => {
  const res = L.rulerCutsFrom(field("a", "b", "c"), [hour({ a: row(500000), b: row(null) })]);
  assert.deepEqual(res.cuts.map((x) => [x.a, x.why]), [[A("b"), "no entry"], [A("c"), "no entry"]]);
  assert.equal(res.winner, A("a"));
});
test("ruler cut: voids that leave one node end the event with that winner; voids that leave none end it with no winner", () => {
  const one = L.rulerCutsFrom(field("a", "b", "c"), [hour({ a: row(1), b: row(2, { void: true }), c: row(3, { void: true }) })]);
  assert.equal(one.done, true); assert.equal(one.winner, A("a")); assert.equal(one.cuts.length, 2);
  const none = L.rulerCutsFrom(field("a", "b"), [hour({ a: row(1, { void: true }), b: row(2, { void: true }) })]);
  assert.equal(none.done, true); assert.equal(none.winner, null); assert.deepEqual(none.standing, []);
});
test("ruler cut: an event isn't done until its hours are in; hours after the end are ignored", () => {
  const part = L.rulerCutsFrom(field("a", "b", "c"), [hour({ a: row(5), b: row(1), c: row(9) })]);
  assert.equal(part.done, false); assert.equal(part.winner, null);
  const extra = L.rulerCutsFrom(field("a", "b"), [hour({ a: row(5), b: row(1) }), hour({ a: row(0, { void: true }) })]);
  assert.equal(extra.winner, A("a")); assert.equal(extra.cuts.length, 1);
});
test("ruler cut: rows of nodes not in the field (or already out) change nothing", () => {
  const res = L.rulerCutsFrom(field("a", "b", "c"), [hour({ a: row(5), b: row(1), c: row(9), z: row(0) }), hour({ a: row(5), b: row(0), c: row(1) })]);
  assert.deepEqual(res.cuts.map((x) => x.a), [A("b"), A("c")]); assert.equal(res.winner, A("a"));
});

test("a player's event: when several nodes go in one hour, the backup must still be standing after that hour", () => {
  const f = field("a", "b", "c", "d");
  const res = L.rulerCutsFrom(f, [hour({ a: row(5, { void: true }), b: row(1), c: row(9), d: row(7) }), hour({ c: row(2), d: row(8) })]);
  // hour 1: a (void) and b (luck) go together; hour 2: c goes; d wins.
  assert.deepEqual(res.cuts.map((x) => [x.at, x.a]), [[1, A("a")], [1, A("b")], [2, A("c")]]);
  const ridesA_backupB = L.playerResult(f, res, { start: A("a"), backup: A("b") });
  assert.equal(ridesA_backupB.jumped, false); assert.equal(ridesA_backupB.out, 1); assert.equal(ridesA_backupB.points, 0);
  const ridesA_backupD = L.playerResult(f, res, { start: A("a"), backup: A("d") });
  assert.equal(ridesA_backupD.jumped, true); assert.equal(ridesA_backupD.rode, true);
  // Survived: the other cut of hour 1 (b) and hour 2's (c); +3 for a jump to the winner.
  assert.equal(ridesA_backupD.survived, 2); assert.equal(ridesA_backupD.points, 5);
  const ridesD = L.playerResult(f, res, { start: A("d"), backup: null });
  assert.equal(ridesD.survived, 3); assert.equal(ridesD.points, 3 + 5);
  const ridesB = L.playerResult(f, res, { start: A("b"), backup: A("a") });
  assert.equal(ridesB.out, 2); assert.equal(ridesB.points, 0);
});
test("a player's event: one cut an hour gives exactly the old result (backup takes over on a void as on any cut)", () => {
  const f = field("a", "b", "c");
  const res = L.rulerCutsFrom(f, [hour({ a: row(5, { void: true }), b: row(4), c: row(9) }), hour({ b: row(1), c: row(9) })]);
  const p = L.playerResult(f, res, { start: A("a"), backup: A("c") });
  assert.equal(p.jumped, true); assert.equal(p.rode, true); assert.equal(p.survived, 1); assert.equal(p.points, 1 + 3);
});

test("capacity: reading an event's picks stops loudly past its page limit, never with a partial list in silence", async () => {
  const { pagePicks, READ_PICKS_PAGES } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
  assert.equal(READ_PICKS_PAGES, 1000, "100,000 picks an event");
  const round = L.eventOf("2026-11-17").round, t = L.lockTime(round) - 60000;
  const rowsN = (n) => Array.from({ length: n }, (_, i) => ({ player: "1" + ("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[i % 58] + "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(i / 58) % 58] + "p".repeat(40)).slice(0, 33), pick: { producers: [A("a"), A("b")], time: String(t) } }));
  // 3 full pages, then a short one: 350 picks, read in full
  let calls = 0;
  assert.equal((await pagePicks("event x", round, async () => (calls++ < 3 ? rowsN(100) : rowsN(50)), 5)).length, 350);
  // never a short page within the limit: it throws instead of returning what it has
  await assert.rejects(pagePicks("event round 42", round, async () => rowsN(100), 5), /event round 42 has more than 500 picks: the recorder won't score it from a partial list/);
});

test("capacity: rows past a list's 2,000 go to me/<char code>.json with their true place on their own board", async () => {
  const { meShards, BOARD_ROWS } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
  assert.equal(BOARD_ROWS, 2000);
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const rows = Array.from({ length: 2010 }, (_, i) => ({ a: "1" + (B58[i % 58] + B58[Math.floor(i / 58) % 58] + "q".repeat(40)).slice(0, 33), place: i + 1, pts: 3000 - i, rides: 0, jumps: 0, events: 1, ranked: i % 3 !== 0 }));
  const m = meShards({ today: { day: "2026-11-17", rows }, week: { week: 4, rows }, lastWeek: null, allTime: { rows: rows.slice(0, 5) } }, "x");
  const all = [...m.values()].flatMap((f) => f.week.rows);
  assert.equal(all.length, 10, "only the 10 rows past the cap");
  for (const [k, f] of m) { assert.equal(f.lastWeek, null); assert.equal(f.allTime.rows.length, 0); for (const r of f.week.rows) assert.equal(String(r.a.charCodeAt(1)), k); }
  // boardPlace: the place among rows of the same board (Staked = ranked, Free play = the rest), as board.js counts
  const r2005 = all.find((r) => r.place === 2006);
  const sameBoard = rows.slice(0, 2006).filter((r) => r.ranked === r2005.ranked).length;
  assert.equal(r2005.boardPlace, sameBoard);
});

test("capacity: the recorder warns about any file it writes past 60% of the 2 MB publish limit", async () => {
  const { sizeWatch, SIZE_WARN } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
  const fs = await import("node:fs"), os = await import("node:os");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ln-size-"));
  fs.writeFileSync(path.join(d, "D2026-11-17.json"), "x".repeat(SIZE_WARN + 1)); fs.writeFileSync(path.join(d, "board.json"), "{}");
  fs.mkdirSync(path.join(d, "me")); fs.writeFileSync(path.join(d, "me", "65.json"), "x".repeat(SIZE_WARN - 1));
  const w = sizeWatch(d);
  assert.equal(w.length, 1); assert.match(w[0], /^D2026-11-17\.json is 1\.2\d MB, past 60% of the 2 MB publish limit/);
});
