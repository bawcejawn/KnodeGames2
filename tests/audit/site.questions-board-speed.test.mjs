// Speed PR 2 (Wed 25 Nov): the Daily Questions board shows after this week's questions only, and reads each question
// from the node once. Before: all 42 question files were checked on chain (~160 reads, 4 at a time) and the board
// then read every answered question again, ~200 node reads before the first row (15 s with a 300 ms node, measured).
// Loads the real home page (index.html and its scripts) in jsdom with a fake node; nothing leaves this machine.
// Run: node --test tests/audit/site.questions-board-speed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SITE = fs.mkdtempSync(path.join(os.tmpdir(), "kg-qboard-"));
const built = spawnSync(process.execPath, [path.join(ROOT, "tools/ci/assemble-site.mjs"), SITE], { cwd: ROOT, encoding: "utf8" });

// Two weeks of question files: week 3 (six days, older) and week 4 (two days so far, this week). 4 questions a file.
const WEEK = 4, WL = 604800000, HEIGHT = 5_000_000;
const files = [], byWeek = { 3: [], 4: [] };
let id = 100;
for (const [w, days] of [[3, 6], [4, 2]]) for (let d = 1; d <= days; d++) {
  const name = `questions/W${String(w).padStart(3, "0")}-D${d}.json`;
  const questions = Array.from({ length: 4 }, (_, i) => {
    const q = { id: `W${w}-D${d}-${i}`, week: w, day: d, chainId: id++, title: `Q ${w}.${d}.${i}`, lockTime: Date.now() - 86400000,
      windowStart: HEIGHT - 900, windowEnd: HEIGHT - 100, options: ["A", "B", "C", "D"] };
    byWeek[w].push(q.chainId);
    return q;
  });
  files.push(name);
  fs.mkdirSync(path.join(SITE, "game-data/questions"), { recursive: true });
  fs.writeFileSync(path.join(SITE, "game-data", name), JSON.stringify({ date: `W${w}-D${d}`, week: w, day: d, questions }));
}
fs.writeFileSync(path.join(SITE, "game-data/index.json"), JSON.stringify({ days: files }));

async function openPage() {
  const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const reads = [];   // get_question ids, in order
  const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""), { url: "https://knodegames.com/index.html#leaderboard", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const g = Date.now() - (WEEK * WL + 2 * 86400000);
  const players = Array.from({ length: 5 }, (_, i) => ({ address: `1Player${i}`.padEnd(34, "x"), entry: { stake: "100000000000", answers: byWeek[WEEK].map((q) => ({ question_id: String(q), option: i % 2 })) } }));
  class Provider {
    async call(method) {
      await new Promise((r) => setTimeout(r, 5));
      if (method === "chain.get_head_info") return { head_topology: { height: String(HEIGHT), id: "0x01" }, head_block_time: String(Date.now()), last_irreversible_block: String(HEIGHT - 60) };
      if (method === "block_store.get_blocks_by_height") return { block_items: [] };
      return {};
    }
    async getHeadInfo() { return this.call("chain.get_head_info"); }
  }
  class Contract {
    constructor(o) {
      this.functions = new Proxy({}, { get: (_, name) => async (a = {}) => {
        await o.provider.call("chain.read_contract");
        if (name === "get_state") return { result: { time: String(Date.now()), config: { genesis_time: String(g), week_length: String(WL), close_delay: "43200000" }, totals: { weeks_finalized: String(WEEK - 1) } } };
        if (name === "list_players") return { result: { rows: a.start ? [] : players } };
        if (name === "get_question") {
          reads.push(Number(a.id));
          return { result: { question: { params_hash: "0x" + "11".repeat(32), outcome: String(1 + (Number(a.id) % 3)), lock_time: String(Date.now() - 86400000), window_start: "1", window_end: String(HEIGHT), k: "4", data_hash: "" } } };
        }
        return { result: {} };
      } });
    }
  }
  w.koinos = w.koilib = { Provider, Contract, Signer: class {}, utils: { formatUnits: (x) => String(x), parseUnits: (x) => String(x) } };
  w.Response = Response;
  w.fetch = async (u) => {
    const url = new URL(String(u), "https://knodegames.com/");
    let local = url.host === "knodegames.com" ? path.join(SITE, decodeURIComponent(url.pathname)) : null;
    if (/raw\.githubusercontent\.com|data\.knodegames\.com/.test(url.host)) local = path.join(SITE, url.pathname.replace(/^\/(?:bawcejawn\/KnodeGames2\/)?[a-z-]+\//, ""));
    if (local && local.startsWith(SITE) && fs.existsSync(local) && fs.statSync(local).isFile()) return new Response(fs.readFileSync(local), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)) {
    if (/^https?:/.test(m[1]) || /posthog|analytics/.test(m[1])) continue;
    try { w.eval(fs.readFileSync(path.join(SITE, m[1]), "utf8")); } catch { /* a page part this stub doesn't need */ }
  }
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  return { w, reads };
}
const boardDrawn = (w) => { const tb = w.document.querySelector("#board tbody"); return !!tb && tb.children.length > 0 && !/Loading/.test(tb.textContent); };
const until = async (ok, ms) => { const t = Date.now(); while (!ok() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 20)); return ok(); };

test("the site builds", () => assert.equal(built.status, 0, built.stderr));

test("the board shows after this week's questions only, each read once; older weeks are checked after it", async () => {
  const { w, reads } = await openPage();
  try {
    assert.ok(await until(() => boardDrawn(w), 20000), "board drawn");
    const before = [...reads];
    // Before the first row: only this week's questions, each once (the board reuses those reads).
    assert.deepEqual([...new Set(before)].sort((a, b) => a - b), [...byWeek[WEEK]].sort((a, b) => a - b), "only this week's questions before the board");
    assert.equal(before.length, byWeek[WEEK].length, "no question read twice before the board");
    // Then the older weeks follow in the background, as before (every file of the last 42 is still checked).
    assert.ok(await until(() => byWeek[3].every((q) => reads.includes(q)), 20000), "older weeks checked after the board");
    // The board shows each player's points from the chain's outcomes: answers option i%2, outcome 1+(id%3) → option index id%3.
    const pts = (i) => byWeek[WEEK].filter((q) => q % 3 === i % 2).length;
    const text = w.document.querySelector("#board tbody").textContent;
    for (let i = 0; i < 5; i++) assert.ok(text.includes(String(pts(i))), `player ${i}: ${pts(i)} points shown`);
  } finally { w.close(); }
});
