// Speed chat (Tue 24 Nov 2026, M-578): request budget for the home page (index.html: Play, Leaderboard, Results).
// Measured on a slow phone (Fast 3G, 4x CPU): the CSP <meta> stops Chrome looking ahead, so the scripts at the end of the
// page downloaded one after another (~15 s to the first leaderboard row). One preload hint per script in <head> brings
// that to ~5.5 s. These tests keep the hints in step with the scripts and pin the budget.
// Run: node --test tests/audit/site.speed-budget.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const WEB = new URL("../../web/", import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, WEB), "utf8");
const html = read("index.html");
const head = html.slice(0, html.indexOf("</head>"));
const body = html.slice(html.indexOf("</head>"));
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const scripts = [...body.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g)].map((m) => m[0]);
const preloads = [...head.matchAll(/<link rel="preload" as="script"[^>]*>/g)].map((m) => m[0]);
const RAW = "https://raw.githubusercontent.com/bawcejawn/KnodeGames2/";

test("every script at the end of the page has exactly one matching preload hint in <head>, and no hint is left over", () => {
  assert.ok(scripts.length > 0);
  const hrefs = preloads.map((p) => attr(p, "href"));
  assert.equal(new Set(hrefs).size, hrefs.length, "no duplicate hints");
  for (const s of scripts) {
    const src = attr(s, "src");
    const p = preloads.find((x) => attr(x, "href") === src);
    assert.ok(p, `missing preload for ${src}`);
    // A different integrity or crossorigin makes the browser download the file twice (the page still works).
    assert.equal(attr(p, "integrity"), attr(s, "integrity"), `${src}: same integrity`);
    assert.equal(attr(p, "crossorigin"), attr(s, "crossorigin"), `${src}: same crossorigin`);
  }
  assert.equal(preloads.length, scripts.length, "one hint per script, nothing extra");
});

test("the hints are only hints: the <script> tags still load every file, and the CSP tag stays first and allows each one", () => {
  // Fallback: if a hint is missing, wrong or blocked, the <script> tag below still fetches and runs the file in order.
  assert.ok(head.indexOf('http-equiv="Content-Security-Policy"') < head.indexOf('rel="preload"'), "CSP tag before the hints");
  const csp = (head.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  const scriptSrc = (csp.match(/script-src ([^;]+)/) || [])[1] || "";
  for (const p of preloads) {
    const href = attr(p, "href");
    if (/^https:/.test(href)) assert.ok(scriptSrc.split(/\s+/).includes(href), `${href}: allowed by script-src`);
    else assert.ok(fs.existsSync(new URL(href, WEB)), `${href}: file exists`);
  }
});

test("budget: at most 25 script tags on the home page", () => {
  const all = [...html.matchAll(/<script\b[^>]*\bsrc=/g)].length;
  assert.ok(all <= 25, `${all} script tags`);
});

test("PostHog runs after the page: deferred, last, its hint at low priority; every other script keeps its order", () => {
  const last = scripts.slice(-2);
  assert.match(last[0], /^<script src="vendor\/posthog-1\.438\.13\.js" defer><\/script>$/);
  assert.match(last[1], /^<script src="analytics\.js" defer><\/script>$/);
  for (const s of scripts.slice(0, -2)) assert.doesNotMatch(s, /\s(defer|async)\b/, `${attr(s, "src")}: runs in order`);
  const ph = preloads.find((p) => attr(p, "href") === "vendor/posthog-1.438.13.js");
  assert.equal(attr(ph, "fetchpriority"), "low");
});

test("budget: a game leaderboard view fetches at most 3 data files (its board + names + stats)", async () => {
  // names.js and stats.js each read one file per page.
  for (const [f, branch] of [["names.js", "names-data"], ["stats.js", "stats-data"]]) {
    const urls = new Set(read(f).match(/https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/[a-z-]+\/[A-Za-z0-9/_.-]+/g) || []);
    assert.deepEqual([...urls].map((u) => u.slice(RAW.length).split("/")[0]), [branch], `${f}: one data file`);
  }
  const games = JSON.parse(read("games.json")).games.filter((g) => g.status === "live" && g.board && g.board.data);
  assert.ok(games.length >= 3, "several game boards");
  for (const g of games) {
    const dom = new JSDOM(`<div id="lb-games"></div><h2 id="lb-title"></h2><div id="lb-q"></div><div id="lb-game" hidden></div>`,
      { url: `https://knodegames.com/index.html#leaderboard/${g.id}`, runScripts: "outside-only" });
    const w = dom.window, data = [];
    w.fetch = async (url) => {
      if (url === "games.json") return { ok: true, json: async () => JSON.parse(read("games.json")) };
      if (String(url).startsWith(RAW)) data.push(url);
      return { ok: true, json: async () => ({ v: 1 }) };
    };
    w.KBoard = { create: () => ({ set() {}, setMe() {} }), LABELS: { staked: "Staked", free: "Free play" } };
    w.eval(read("leaders.js"));
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(data.length >= 1, `${g.id}: loads its board`);
    assert.ok(data.length + 2 <= 3, `${g.id}: ${data.length} board files + names + stats`);
    w.close();
  }
});
