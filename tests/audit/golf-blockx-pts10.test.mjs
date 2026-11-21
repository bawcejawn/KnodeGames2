// Block Golf reads Block X's pts10 (M-205, M-263): tenths of today's pts, for the within-N picks (Block X, D-313).
// DARK: a board with no pts10 is scored on pts exactly as before. With pts10 on every row, the hole is scored on pts10,
// so two players tied on pts but apart on pts10 are no longer tied. pts10 on only some rows, or not a whole number, is a
// failed read (loud), never a hole on mixed units. Golf scores by rank, so pts10 = pts x 10 gives the same strokes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = process.env.APP || ".";
const { run, blockxScoreKey, PARTS_EXPECT } = await import(path.resolve(APP, "bot/games/golf.ts"));
const { encodePart, writeParts, shardOf } = await import(path.resolve(APP, "kit/parts/parts.inline.mjs"));
const M = globalThis.KRaceMath, G = globalThis.KGolf;
const H = 3600000, DAY = 24 * H;
const W = 3, START = M.weekStart(W), END = M.weekStart(W + 1);
process.env.CHECK_NOW_MS ??= String(END + 7 * DAY);
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const write = (dir, name, j) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), typeof j === "string" ? j : JSON.stringify(j)); };

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (i) => { let s = "1", n = i * 7919 + 13; while (s.length < 34) { s += B58[n % 58]; n = Math.floor(n / 58) + 31 * s.length + i; } return s; };
const P = Array.from({ length: 12 }, (_, i) => addr(i));
// P[0] and P[1] tie on pts (2000) but not on pts10 (20003 vs 19997: one within-N pick each side of a rounding).
const PTS = P.map((_, i) => (i < 2 ? 2000 : 1900 - 100 * i));
const PTS10 = P.map((_, i) => (i === 0 ? 20003 : i === 1 ? 19997 : PTS[i] * 10));
const BASE_COLS = [["player", "a"], ["place", "i"], ["boardPlace", "i"], ["pts", "i"], ["correct", "i"], ["picks", "i"], ["days", "i"], ["lastCorrect", "i"], ["ranked", "b"]];

/** A v 2 Block X board (lastWeek = week W, final), its parts written as the Block X writer would; with or without pts10. */
function v2(gamesDir, { pts10 = false, type = "i" } = {}) {
  const cols = pts10 ? [...BASE_COLS, ["pts10", type]] : BASE_COLS;
  const rowOf = (a, i) => { const r = [a, i + 1, i + 1, PTS[i], 10, 12, 5, 0, 1]; if (pts10) r.push(type === "i" ? PTS10[i] : String(PTS10[i])); return r; };
  const folder = (file, week, state, players) => {
    const byShard = new Map(PARTS_EXPECT.filter((p) => p !== "top").map((p) => [p, []]));
    players.forEach((a) => byShard.get(`p/${shardOf(a, 16)}`).push(rowOf(a, P.indexOf(a))));
    const enc = [...byShard].map(([part, rows]) => encodePart({ game: "blockx", file, part, cols, rows }));
    enc.push(encodePart({ game: "blockx", file, part: "top", cols, rows: players.slice(0, 100).map((a) => rowOf(a, P.indexOf(a))) }));
    return writeParts(path.join(gamesDir, "blockx", file), { game: "blockx", file, week, state, unit: "p", expect: PARTS_EXPECT, shards: 16, writtenAt: END }, enc).manifest;
  };
  const m = folder("BW003", W, "final", P), m4 = folder("BW004", W + 1, "pending", []);
  const lastWeek = { week: W, start: START, final: true, prizes: [], players: P.length, parts: "BW003", hash: m.hash, rows: [] };
  write(path.join(gamesDir, "blockx"), "board.json", { v: 2, updated: "", today: { day: "x", players: 0, parts: "BD-20261116", hash: "0".repeat(64), rows: [] },
    week: { week: W + 1, start: END, players: 0, parts: "BW004", hash: m4.hash, rows: [] }, lastWeek, allTime: { players: 0, parts: "BA", hash: "0".repeat(64), rows: [] } });
  return gamesDir;
}
/** A v 1 Block X board (rows on board.json itself), with pts10 on the rows the test chooses. */
function v1(gamesDir, withPts10 = () => false, edit = (r) => r) {
  const rows = P.map((a, i) => edit({ a, place: i + 1, pts: PTS[i], correct: 10, picks: 12, days: 5, ranked: true, ...(withPts10(i) ? { pts10: PTS10[i] } : {}) }, i));
  write(path.join(gamesDir, "blockx"), "board.json", { v: 1, updated: "", week: { week: W + 1, start: END, final: false, prizes: [], rows: [] }, lastWeek: { week: W, start: START, final: true, prizes: [], rows } });
  return gamesDir;
}
const SRC = [{ id: "blockx", name: "Who Signs Block X", reader: "blockx", live: true }];
const seeded = () => { const d = tmp("golf-prev-"); write(d, "index.json", { v: 1, updated: "", weeks: [], course: { blockx: W }, stakedFromWeek: 0 }); return d; };
const base = (o) => ({ sources: SRC, questionsOf: async () => ({ closed: true, questions: 0, resolved: 0, rows: [] }), golfStakersOf: async (_n, who) => new Map(who.map((a) => [a, 2])), p: "main", check: "check", stakedFromWeek: 0, fresh: false, ...o });
async function hole(gamesDir) {   // two runs an hour apart after the week's end: a ready hole goes final
  const mid = tmp("golf-"), out = tmp("golf-");
  const r1 = await run(base({ now: END + 20 * H, prev: seeded(), out: mid, gamesDir }));
  const r2 = await run(base({ now: END + 21 * H, prev: mid, out, gamesDir }));
  const wk = JSON.parse(fs.readFileSync(path.join(out, "W003.json"), "utf8"));
  const h = wk.holes.find((x) => x.id === "blockx");
  // The hole's place and strokes per wallet, by golf-math's own scoreHole on the rows Golf stored (what the cards use).
  const res = G.scoreHole(h.rows.map(([a, score, scored]) => ({ a, score, scored: scored === 1, ranked: true })), 3, true).results;
  const card = (a) => res[a];
  return { hole: h, card, text: JSON.stringify([r1.problems, r2.problems]) };
}
const score = (h, a) => h.rows.find((r) => r[0] === a)[1];

test("blockxScoreKey: pts when no row has pts10 (dark); pts10 only when every row has a whole one", () => {
  assert.equal(blockxScoreKey([]), "pts");
  assert.equal(blockxScoreKey([{ pts: 1 }, { pts: 2 }]), "pts");
  assert.equal(blockxScoreKey([{ pts: 1, pts10: 10 }, { pts: 2, pts10: 21 }]), "pts10");
  assert.deepEqual(Object.keys(blockxScoreKey([{ pts: 1, pts10: 10 }, { pts: 2 }])), ["error"]);
  for (const bad of [-1, 1.5, "10", null, 1e13]) assert.deepEqual(Object.keys(blockxScoreKey([{ pts: 1, pts10: bad }])), ["error"], String(bad));
});

test("DARK: a v 2 board with no pts10 is scored on pts exactly as before (the pts tie stays a tie)", async () => {
  const { hole: h, card } = await hole(v2(tmp("games-")));
  assert.equal(h.status, "final"); assert.equal(h.rows.length, P.length);
  P.forEach((a, i) => assert.equal(score(h, a), PTS[i]));
  assert.deepEqual(card(P[0]), card(P[1]), "tied on pts: same place and strokes");
});

test("DARK: a v 1 board with no pts10 is scored on pts exactly as before", async () => {
  const { hole: h } = await hole(v1(tmp("games-")));
  assert.equal(h.status, "final");
  P.forEach((a, i) => assert.equal(score(h, a), PTS[i]));
});

test("a v 2 board with a pts10 column is scored on pts10: a tie on pts but not on pts10 is split", async () => {
  const { hole: h, card } = await hole(v2(tmp("games-"), { pts10: true }));
  assert.equal(h.status, "final"); assert.equal(h.rows.length, P.length);
  P.forEach((a, i) => assert.equal(score(h, a), PTS10[i]));
  assert.ok(card(P[0]).place < card(P[1]).place, `P[0] (20003) is ahead of P[1] (19997): places ${card(P[0]).place} vs ${card(P[1]).place}`);
});

test("pts10 = pts x 10 gives the same strokes as pts (Golf scores by rank)", async () => {
  const plain = await hole(v1(tmp("games-")));
  const tenths = await hole(v1(tmp("games-"), () => true, (r, i) => ({ ...r, pts10: PTS[i] * 10 })));
  P.forEach((a) => assert.deepEqual(tenths.card(a), plain.card(a), a));
});

test("a v 1 board with pts10 on every row is scored on it", async () => {
  const { hole: h, card } = await hole(v1(tmp("games-"), () => true));
  assert.equal(h.status, "final");
  P.forEach((a, i) => assert.equal(score(h, a), PTS10[i]));
  assert.ok(card(P[0]).place < card(P[1]).place);
});

test("pts10 on only some rows is a failed read, never a hole on mixed units", async () => {
  const r = await hole(v1(tmp("games-"), (i) => i !== 3));
  assert.notEqual(r.hole.status, "final"); assert.equal(r.hole.rows.length, 0);
  assert.match(r.text, /pts10 for some players but not all/);
});

test("a pts10 that isn't a whole number from 0 is a failed read", async () => {
  for (const bad of [-5, 12.5, "200"]) {
    const r = await hole(v1(tmp("games-"), () => true, (row, i) => (i === 2 ? { ...row, pts10: bad } : row)));
    assert.notEqual(r.hole.status, "final", String(bad)); assert.equal(r.hole.rows.length, 0);
    assert.match(r.text, /pts10 that isn't a whole number/);
  }
});

test("a v 2 pts10 column that isn't typed as whole numbers is a failed read", async () => {
  const r = await hole(v2(tmp("games-"), { pts10: true, type: "n" }));
  assert.notEqual(r.hole.status, "final"); assert.equal(r.hole.rows.length, 0);
  assert.match(r.text, /pts10 column that isn't whole numbers/);
});
