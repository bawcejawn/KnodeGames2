// One icon per game everywhere (owner, D-748): web/games.json ("icon", "accent") is the only source. The Home tiles,
// the All games cards, the Games drop-down and the phone More sheet must all show that same emoji, so they cannot drift
// apart again. The Results and Leaderboards pickers join later (Speed chat, after this PR).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const APP = process.env.APP || ".";
const read = (p) => fs.readFileSync(`${APP}/web/${p}`, "utf8");
const games = JSON.parse(read("games.json")).games;
const shown = games.filter((g) => g.status === "live" || g.status === "preview");
const ACCENTS = ["blue", "violet", "mint", "sun", "hot"];
/** games.json href → the link the Home tiles and menus use. */
const link = (g) => (g.href === "index.html#play" ? "#play" : g.href);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");

test("every live or preview game has one icon and one accent in games.json, and no two games share an icon", () => {
  assert.ok(shown.length >= 10, "games checked");
  for (const g of shown) {
    assert.equal(typeof g.icon, "string", `${g.id}: icon`);
    assert.ok(g.icon.length >= 1 && g.icon.length <= 8 && !/[<>&"'A-Za-z0-9\s]/.test(g.icon), `${g.id}: icon is a short emoji`);
    assert.ok(ACCENTS.includes(g.accent), `${g.id}: accent is one of ${ACCENTS.join(", ")}`);
  }
  const icons = shown.map((g) => g.icon);
  assert.equal(new Set(icons).size, icons.length, "each game has its own icon");
});

test("Home: each game tile shows its games.json icon and colour, and names its game", () => {
  const home = read("index.html");
  for (const g of shown) {
    const re = new RegExp(`<a class="also-card gtile" href="${esc(link(g))}" data-game="${g.id}"><span class="gi acc-([a-z]+)" aria-hidden="true">([^<]*)</span>`);
    const m = home.match(re);
    assert.ok(m, `${g.id}: Home tile with data-game and an icon`);
    assert.equal(m[2], g.icon, `${g.id}: Home icon`);
    assert.equal(m[1], g.accent, `${g.id}: Home colour`);
  }
  // No game tile keeps an old icon of its own.
  const tiles = [...home.matchAll(/<a class="also-card gtile" href="([^"]+)"([^>]*)><span[^>]*>([^<]*)<\/span>/g)];
  for (const [, href, rest] of tiles) {
    const g = shown.find((x) => link(x) === href);
    if (g) assert.match(rest, new RegExp(`data-game="${g.id}"`), `${href}: tile names its game`);
  }
});

test("All games page: games.js draws the games.json icon and has no icon list of its own", () => {
  const js = read("games.js");
  assert.doesNotMatch(js, /\bICONS\b|createElementNS/, "no hard-coded drawings");
  assert.match(js, /class: `g-ic gi acc-\$\{g\.accent\}`, "aria-hidden": "true", text: g\.icon/, "icon from games.json, as text");
  assert.match(js, /ACCENTS\.has\(g\.accent\)/, "accent checked before use");
});

test("menus: every page's Games drop-down and More sheet show the games.json icon for each game", () => {
  let pages = 0;
  for (const p of fs.readdirSync(`${APP}/web`).filter((f) => f.endsWith(".html"))) {
    const h = read(p);
    const dd = h.match(/<summary>Games<\/summary>[\s\S]*?<\/div>/);
    const sheet = h.match(/<div class="more-sheet" id="more-sheet" hidden>[\s\S]*?<\/nav>/);
    if (!dd && !sheet) continue;
    pages++;
    for (const g of shown) {
      const target = p === "index.html" || !g.href.startsWith("index.html") ? link(g) : g.href;
      const icon = `<span class="mi" aria-hidden="true">${g.icon}</span>`;
      for (const [name, block] of [["Games drop-down", dd], ["More sheet", sheet]]) {
        if (!block) continue;
        const a = block[0].match(new RegExp(`<a href="${esc(target)}"[^>]*>(.*?)</a>`));
        if (!a) continue;   // a game not listed in this menu yet: game-manifests and the nav tests cover the lists
        assert.ok(a[1].startsWith(icon), `${p} ${name}: ${g.id} shows ${g.icon}`);
        assert.doesNotMatch(a[1], /<svg/, `${p} ${name}: ${g.id} has no other drawing`);
      }
    }
  }
  assert.ok(pages >= 13, "pages with menus checked");
});
