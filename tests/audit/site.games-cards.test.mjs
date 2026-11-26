// All games page, PR B (UI lead): one clean card per game, tags from live data, pick status without counts, guests never
// see Stake, everything else closed or a link (D-742, D-788, D-794, owner on the card mock Tue 24 Nov, D-871).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const APP = process.env.APP || ".";
const read = (p) => fs.readFileSync(`${APP}/web/${p}`, "utf8");
const games = JSON.parse(read("games.json")).games;
const shown = games.filter((g) => g.status === "live" || g.status === "preview");

/** Runs games.js on games.html with stubbed data sources; returns the window once the cards are drawn. */
async function run({ wallet = null, picked = {}, stakeable = [7, 3] } = {}) {
  const dom = new JSDOM(read("games.html"), { url: "https://knodegames.com/games.html", runScripts: "outside-only" });
  const w = dom.window;
  w.fetch = async (u) => {
    if (String(u) === "games.json") return { ok: true, json: async () => JSON.parse(read("games.json")) };
    return { ok: false, status: 404, json: async () => ({}) };   // prize switches unreachable: no "Free prizes" tag
  };
  w.KWallet = wallet ? { ...wallet, subscribe() {} } : { address: null, subscribe() {} };
  w.KPicked = { state: (id) => (id in picked ? picked[id] : null) };
  w.KStake = { stakeable: async () => stakeable, mountList(root) { root.dataset.listed = "1"; } };
  w.KWeeks = { of: () => 5, FIRST: 4, GENESIS_MS: 0, WEEK_MS: 1, short: (n) => String(n) };
  w.KRaceMath = { weekOf: () => 5, weekStart: () => Date.now() + 3600000 };
  w.setInterval = () => 0;   // the page refreshes every minute; not needed here
  w.eval(read("games.js"));
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
  return w;
}

test("games.json: every shown game has a short line (≤ 60 characters, no banned words, no dates or amounts)", () => {
  for (const g of shown) {
    assert.equal(typeof g.short, "string", `${g.id}: short`);
    assert.ok(g.short.length >= 10 && g.short.length <= 60, `${g.id}: ${g.short.length} characters`);
    assert.doesNotMatch(g.short, /\b(line|odds|bets?|earn\w*|VHP)\b/i, `${g.id}: wording rules`);
    assert.doesNotMatch(g.short, /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/, `${g.id}: no dates`);
  }
});

test("cards: fixed order with Producer Race first, preview last; each shows its icon badge and short line", async () => {
  const w = await run(), cards = [...w.document.querySelectorAll("#g-live .g")];
  assert.equal(cards.length, shown.length);
  assert.equal(cards[0].dataset.game, "race");
  assert.equal(cards.at(-1).dataset.game, "combo");
  for (const c of cards) {
    const g = games.find((x) => x.id === c.dataset.game);
    assert.equal(c.querySelector(".g-ic").textContent, g.icon);
    assert.ok(c.querySelector(".g-ic").classList.contains(`acc-${g.accent}`));
    assert.equal(c.querySelector(".g-line").textContent, g.short);
  }
});

test("tags come from data: Free play from games.json kinds, Staked from the vault list, Free prizes hidden when the switches can't be read", async () => {
  const w = await run({ stakeable: [7] });
  const tags = (id) => [...w.document.querySelectorAll(`.g[data-game="${id}"] .pill`)].filter((p) => !p.hidden).map((p) => p.textContent);
  assert.ok(tags("race").includes("Free play") && tags("race").includes("Staked"), "race: staked (vault lists 7)");
  assert.ok(!tags("fantasy").includes("Staked"), "fantasy: no Staked tag when the vault doesn't list it");
  for (const c of w.document.querySelectorAll(".g")) assert.ok(![...c.querySelectorAll(".pill")].some((p) => !p.hidden && p.textContent === "Free prizes"));
  assert.match(read("games.js"), /b\.hidden = !\(g && prizeState\(g, now\) === "on"\)/);
});

test("pick status: open / done / closed chips with no counts; nothing for a game with no state", async () => {
  const w = await run({ picked: { race: "open", blockx: { state: "done", nextOpen: Date.now() + 38 * 60000 }, questions: { state: "closed", nextOpen: Date.now() + 3 * 3600000 } } });
  const c = (id) => w.document.querySelector(`.g[data-game="${id}"]`);
  assert.equal(c("race").getAttribute("data-pick"), "open");
  assert.match(c("race").querySelector(".g-st").textContent, /● OpenPicks open now/);
  assert.equal(c("blockx").getAttribute("data-pick"), "done");
  assert.match(c("blockx").querySelector(".g-st").textContent, /✓ PickedNext opens in 3\d m/);
  assert.equal(c("questions").getAttribute("data-pick"), "closed");
  assert.match(c("questions").querySelector(".g-st").textContent, /^ClosedNext opens in [23] h/);
  assert.equal(c("golf").getAttribute("data-pick"), null);
  assert.equal(c("golf").querySelector(".g-st").textContent, "");
  for (const s of w.document.querySelectorAll(".g-st")) assert.doesNotMatch(s.textContent, /\b\d+ (open|picks?|rounds?|questions?)\b/, "no counts");
});

test("buttons: a guest or a visitor without a wallet gets one Play free and no Stake; a real wallet gets Play and Stake on staked games", async () => {
  for (const wallet of [null, { address: "1Guest", kind: "guest" }]) {
    const w = await run({ wallet });
    assert.equal(w.document.querySelectorAll(".g-stake").length, 0, "no Stake button");
    assert.equal(w.document.querySelector('.g[data-game="race"] .g-play').textContent, "Play free");
  }
  const w = await run({ wallet: { address: "1Real", kind: "kondor" }, stakeable: [7] });
  assert.equal(w.document.querySelector('.g[data-game="race"] .g-play').textContent, "Play");
  assert.equal(w.document.querySelector('.g[data-game="race"] .g-stake').getAttribute("href"), "stake.html#g7");
  assert.equal(w.document.querySelector('.g[data-game="golf"] .g-stake'), null);
  assert.equal(w.document.querySelector('.g[data-game="combo"] .g-play').textContent, "Take a look");
});

test("page: no second intro, Leaderboards and Results as two links, Where to stake and the stats closed; the vault list loads only when opened", async () => {
  const h = read("games.html");
  assert.doesNotMatch(h, /class="lead lede"|id="g-boards"|id="g-results"|id="soon-box"|Weeks run Monday/);
  assert.match(h, /<a href="index\.html#leaderboard">Leaderboards →<\/a>\s*<a href="index\.html#results">Results →<\/a>/);
  for (const id of ["stake-fold", "stats-fold"]) assert.match(h, new RegExp(`<details class="fold" id="${id}">`), `${id} closed`);
  assert.doesNotMatch(h, /<details class="fold"[^>]* open/);
  const w = await run(), fold = w.document.getElementById("stake-fold");
  assert.equal(w.document.getElementById("stake-list").dataset.listed, undefined, "not read on load");
  fold.open = true; fold.dispatchEvent(new w.Event("toggle"));
  assert.equal(w.document.getElementById("stake-list").dataset.listed, "1", "read when opened");
});

test("shared styles: one icon badge size per place and pick-status styles Hub can reuse on Home (hub-ui.css)", () => {
  const css = read("hub-ui.css");
  for (const re of [/\.gtile > \.gi \{ width: 58px; height: 58px;/, /\.g > \.g-ic\.gi \{ width: 52px; height: 52px;/, /\.more-panel \.mi\.gi \{ width: 36px; height: 36px;/, /\.dd-menu \.mi\.gi \{ width: 24px; height: 24px;/]) assert.match(css, re);
  assert.match(css, /:is\(\.g, \.gtile\)\[data-pick="open"\] \{ border: 2px solid var\(--acc/);
  const rules = css.slice(css.indexOf("*/", css.indexOf("Pick status (D-742")));
  assert.doesNotMatch(rules, /box-shadow|animation|glow/i, "no glow or animation on the pick states");
});

test("the menu tool refuses a bad icon the same way games.js does", async () => {
  const nav = fs.readFileSync(`${APP}/tools/site-nav.mjs`, "utf8");
  assert.match(nav, /!\/\[<>&"'A-Za-z0-9\\s\]\/\.test\(g\.icon\)\) \|\| !ICON_ACCENTS\.has\(g\.accent\)\)/);
  assert.match(nav, /throw new Error\(`games\.json: \$\{g\.id\} has a bad icon or accent`\)/);
});
