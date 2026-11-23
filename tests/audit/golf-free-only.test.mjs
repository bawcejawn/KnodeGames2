// D-586 (owner, Sat 21 Nov 2026): Block Golf is free to play only. From vault week 5 (FREE_FROM_WEEK) every week is a
// free week, whatever GOLF_STAKED_FROM_WEEK says (it stays 5 in index.json: the publish job can't change it). A free week
// uses the practice rule: everyone who scored is in the field, 3 make a hole, one board, nobody is "staked", nobody is
// kept off the free list, and NO vault file is written (Vault, M-331: game 6 is stopped and its files are never read).
// A week from 5 that was recorded as staked but isn't final yet is scored again as free. Final weeks never change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = process.env.APP || ".";
const { run, FREE_FROM_WEEK, statusLines } = await import(path.resolve(APP, "bot/games/golf.ts"));
const M = globalThis.KRaceMath;
const H = 3600000, DAY = 24 * H;
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const write = (dir, name, j) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), typeof j === "string" ? j : JSON.stringify(j)); };
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (i) => { let s = "1", n = i * 7919 + 13; while (s.length < 34) { s += B58[n % 58]; n = Math.floor(n / 58) + 31 * s.length + i; } return s; };
const P = Array.from({ length: 8 }, (_, i) => addr(i));
// Two holes (a card needs 2 counted holes): Block X, and a game on the standard reader with the same board shape.
const SRC = [{ id: "blockx", name: "Who Signs Block X", reader: "blockx", live: true }, { id: "fantasy", name: "Fantasy", reader: "standard", live: true }];
const wn = (w) => `W${String(w).padStart(3, "0")}.json`;

/** Block X's v1 board (and the same for the standard game) with week w final (8 players, all scored). */
function games(w) {
  const d = tmp("games-");
  const rows = P.map((a, i) => ({ a, place: i + 1, pts: 1000 - 100 * i, correct: 5, picks: 6, days: 3, ranked: true }));
  for (const g of ["blockx", "fantasy"]) write(path.join(d, g), "board.json", { v: 1, updated: "", week: { week: w + 1, start: M.weekStart(w + 1), final: false, prizes: [], rows: [] }, lastWeek: { week: w, start: M.weekStart(w), final: true, prizes: [], rows } });
  return d;
}
const prevWith = (w, files = {}, stakedFromWeek = 5) => {
  const d = tmp("golf-prev-");
  write(d, "index.json", { v: 1, updated: "", weeks: Object.keys(files).map((f) => Number(f.slice(1, 4))), course: { blockx: 2, fantasy: 2 }, stakedFromWeek });
  for (const [f, j] of Object.entries(files)) write(d, f, j);
  return d;
};
let stakesRead = 0;
const base = (o) => ({ sources: SRC, questionsOf: async () => ({ closed: true, questions: 0, resolved: 0, rows: [] }), p: "main", check: "check", stakedFromWeek: 5, fresh: false,
  golfStakersOf: async (_n, who) => { stakesRead++; return new Map(who.slice(0, 1).map((a) => [a, 2])); }, ...o });
/** Two runs an hour apart after week w ends: the week goes final. */
async function twoRuns(w, prev, extra = {}) {
  const END = M.weekStart(w + 1), mid = tmp("golf-"), out = tmp("golf-");
  process.env.CHECK_NOW_MS = String(END + 7 * DAY);
  const r1 = await run(base({ now: END + 20 * H, prev, out: mid, gamesDir: games(w), ...extra }));
  const r2 = await run(base({ now: END + 21 * H, prev: mid, out, gamesDir: games(w), ...extra }));
  return { mid, out, problems: [...r1.problems, ...r2.problems] };
}
function checks() {
  const y = fs.readFileSync(path.join(APP, ".github/workflows/golf.yml"), "utf8");
  return [...y.matchAll(/<<'PY'\n([\s\S]*?)\n\s*PY\n/g)].map((m) => {
    const f = path.join(tmp("chk-"), "check.py");
    fs.writeFileSync(f, m[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n"));
    return f;
  });
}
const py = (args, now) => execFileSync("python3", args, { encoding: "utf8", stdio: "pipe", env: { ...process.env, CHECK_NOW_MS: String(now) } });

test("D-586: FREE_FROM_WEEK is vault week 5", () => assert.equal(FREE_FROM_WEEK, 5));

test("week 5 with GOLF_STAKED_FROM_WEEK = 5 is a free week: one board for everyone, no stakes read, no vault file", async () => {
  stakesRead = 0;
  const { out } = await twoRuns(5, prevWith(5));
  const wk = read(out, wn(5));
  assert.equal(wk.final, true); assert.equal(wk.practice, true, "scored as free (the practice rule)");
  assert.equal(wk.holes.find((h) => h.id === "blockx").field, P.length, "everyone who scored is in the field");
  assert.equal(wk.cards.length, P.length, "every player gets a card");
  assert.ok(wk.cards.every((c) => c.ranked === false), "nobody is on a Staked board");
  assert.deepEqual(wk.notFree, []);
  assert.equal(stakesRead, 0, "Block Golf stakes aren't read");
  assert.equal(fs.existsSync(path.join(out, "vault", "W5.json")), false, "no vault file (M-331)");
  assert.equal(read(out, "index.json").stakedFromWeek, 5, "the label stays (the publish job can't change it)");
});

test("week 5 already recorded as staked (not final) is scored again as free; its staked check isn't carried", async () => {
  const w = 5, START = M.weekStart(w), END = M.weekStart(w + 1);
  const staked = { v: 1, week: w, start: START, end: END, final: false, practice: false,
    holes: ["blockx", "fantasy"].map((id) => ({ id, name: id, status: "live", why: "fewer than 5 Block Golf stakers or less than 10 VHP of Block Golf stake among the players who scored", field: 0, rows: P.map((a, i) => [a, 1000 - 100 * i, 1, 0]) })),
    cards: [], notFree: [P[0]], check: { sig: "0".repeat(64), at: START + DAY } };
  const { mid, out } = await twoRuns(w, prevWith(w, { [wn(w)]: staked }));
  const first = read(mid, wn(w));
  assert.equal(first.practice, true); assert.equal(first.final, false, "a fresh two-run check starts");
  assert.notEqual(first.check?.sig, staked.check.sig);
  const wk = read(out, wn(w));
  assert.equal(wk.final, true); assert.equal(wk.practice, true);
  assert.equal(wk.cards.length, P.length); assert.deepEqual(wk.notFree, [], "no wallet is kept off the free list");
  assert.equal(wk.holes.find((h) => h.id === "blockx").status, "final");
  assert.equal(fs.existsSync(path.join(out, "vault", "W5.json")), false);
});

test("a final week is never changed, even a staked one from week 5", async () => {
  const w = 5, START = M.weekStart(w), END = M.weekStart(w + 1);
  const fin = { v: 1, week: w, start: START, end: END, final: true, practice: false,
    holes: [{ id: "blockx", name: "Who Signs Block X", status: "skipped", why: "x", field: 0, rows: [] }], cards: [], notFree: [], check: null };
  const prev = prevWith(w, { [wn(w)]: fin });
  const out = tmp("golf-");
  process.env.CHECK_NOW_MS = String(END + 7 * DAY);
  await run(base({ now: END + 30 * H, prev, out, gamesDir: games(w) }));
  assert.deepEqual(read(out, wn(w)), fin);
});

test("weeks before 5 keep their rule: week 4 with GOLF_STAKED_FROM_WEEK = 4 is still staked", async () => {
  stakesRead = 0;
  const { mid } = await twoRuns(4, prevWith(4, {}, 4), { stakedFromWeek: 4 });
  assert.equal(read(mid, wn(4)).practice, false);
  assert.ok(stakesRead > 0, "stakes are read for a staked week");
});

test("the publish job's checks pass on free weeks (shape, history, no vault file)", async (t) => {
  try { execFileSync("python3", ["--version"]); } catch { t.skip("no python3 here"); return; }
  const [shape, history] = checks();
  const { mid, out } = await twoRuns(5, prevWith(5));
  const END = M.weekStart(6);
  assert.match(py([shape, out], END + 22 * H), /golf files ok/);
  assert.match(py([history, out, mid], END + 22 * H), /golf history ok/);
});

test("npm run golf -- status says Block Golf is free and the variable stays a label", () => {
  const lines = statusLines({ v: 1, updated: "x", course: {}, weeks: [5], stakedFromWeek: 5 }, new Map([[5, { v: 1, end: 0, holes: [], cards: [], practice: true }]]), 0).join("\n");
  assert.match(lines, /free to play from vault week 5/);
  assert.match(lines, /never change or delete it/);
  assert.match(lines, /\(vault week 5\), free:/);
});
