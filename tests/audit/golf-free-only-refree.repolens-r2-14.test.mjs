// Repo Lens 2 (#68): pins the two refree guards the PR's tests left unpinned (wasFinal, prevCheck).
// Helpers copied from golf-free-only.test.mjs. D-586 (owner, Sat 21 Nov 2026): Block Golf is free to play only. From vault
// week 5 (FREE_FROM_WEEK) every week is a free week, whatever GOLF_STAKED_FROM_WEEK says (it stays 5 in index.json: the publish job can't change it). A free week
// uses the practice rule: everyone who scored is in the field, 3 make a hole, one board, nobody is "staked", nobody is
// kept off the free list, and NO vault file is written (Vault, M-331: game 6 is stopped and its files are never read).
// A week from 5 that was recorded as staked but isn't final yet is scored again as free. Final weeks never change.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = process.env.APP || ".";
const { run } = await import(path.resolve(APP, "bot/games/golf.ts"));
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
const base = (o) => ({ sources: SRC, questionsOf: async () => ({ closed: true, questions: 0, resolved: 0, rows: [] }), p: "main", check: "check", stakedFromWeek: 5, fresh: false,
  golfStakersOf: async (_n, who) => { return new Map(who.slice(0, 1).map((a) => [a, 2])); }, ...o });
const stakedRec = (w, status, check = null) => ({ v: 1, week: w, start: M.weekStart(w), end: M.weekStart(w + 1), final: false, practice: false,
  holes: ["blockx", "fantasy"].map((id) => ({ id, name: id, status, why: status === "final" ? "" : "x", field: 0, rows: P.map((a, i) => [a, 1000 - 100 * i, 1, 0]) })),
  cards: [], notFree: [P[0]], check });

test("refree after week 5 ended: a hole final in the staked reading is scored again, never kept as it was (wasFinal)", async () => {
  const w = 5, END = M.weekStart(w + 1), out = tmp("golf-");
  process.env.CHECK_NOW_MS = String(END + 7 * DAY);
  // The boards have moved on to week 6, so week 5 can only come from the standings kept in the file.
  await run(base({ now: END + 20 * H, prev: prevWith(w, { [wn(w)]: stakedRec(w, "final") }), out, gamesDir: games(w + 1) }));
  const wk = read(out, wn(w));
  assert.equal(wk.practice, true);
  for (const id of ["blockx", "fantasy"]) {
    const h = wk.holes.find((x) => x.id === id);
    assert.equal(h.field, P.length, `${id}: scored again as free (everyone who scored is in the field)`);
    assert.ok(h.rows.every((r) => r[3] !== 0), `${id}: no staked weight 0 carried`);
  }
  assert.equal(wk.cards.length, P.length);
});

test("refree: the staked reading's two-run check is never carried, even when its fingerprint matches (prevCheck)", async () => {
  const w = 5, END = M.weekStart(w + 1);
  process.env.CHECK_NOW_MS = String(END + 7 * DAY);
  // A free run gives the fingerprint this week will have.
  const a = tmp("golf-");
  await run(base({ now: END + 20 * H, prev: prevWith(w), out: a, gamesDir: games(w) }));
  const sig = read(a, wn(w)).check.sig;
  assert.equal(typeof sig, "string");
  // The same fingerprint stamped on a staked record: one free run must NOT make the week final from it.
  const out = tmp("golf-");
  await run(base({ now: END + 21 * H, prev: prevWith(w, { [wn(w)]: stakedRec(w, "live", { sig, at: END + 19 * H }) }), out, gamesDir: games(w) }));
  const wk = read(out, wn(w));
  assert.equal(wk.practice, true);
  assert.equal(wk.final, false, "a fresh two-run check starts");
});
