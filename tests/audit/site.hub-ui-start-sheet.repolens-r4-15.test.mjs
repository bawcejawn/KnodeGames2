// Repo Lens 4 #R4-15 (Hub PRs #72 / #73): the home "Play free" start sheet never gates free play, closes cleanly,
// and the bolder menu stylesheet is linked on every page with menus except the held Race and Golf pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");

function home() {
  const dom = new JSDOM(read("web/index.html"), { runScripts: "outside-only", url: "https://knodegames.com/" });
  dom.window.eval(read("web/start-sheet.js"));
  return dom.window;
}
const click = (w, n, opts = {}) => { const e = new w.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...opts }); n.dispatchEvent(e); return e; };

test("without the script, Play free is a plain link to the Race picks (free play never gated)", () => {
  const d = new JSDOM(read("web/index.html")).window.document;
  const go = d.getElementById("welcome-go");
  assert.equal(go.tagName, "A");
  assert.equal(go.getAttribute("href"), "race.html#pick-zone");
  assert.ok(d.querySelector('script[src="start-sheet.js"]'), "index.html loads start-sheet.js");
});

test("the sheet offers a guest link to the same place, a wallet button and Close; Esc and Close shut it", () => {
  const w = home(), d = w.document, go = d.getElementById("welcome-go");
  go.focus();
  const ev = click(w, go);
  assert.equal(ev.defaultPrevented, true);
  const card = d.querySelector(".ss-card[role=dialog][aria-modal=true]");
  assert.ok(card, "sheet open");
  assert.equal(d.querySelector(".ss-go").getAttribute("href"), "race.html#pick-zone");
  assert.equal(d.activeElement, d.querySelector(".ss-go"));
  assert.ok(d.documentElement.classList.contains("sheet-open"));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(d.querySelector(".ss-back"), null, "Esc closes");
  assert.ok(!d.documentElement.classList.contains("sheet-open"));
  assert.equal(d.activeElement, go, "focus returns to Play free");
  click(w, go); click(w, d.querySelector(".ss-close"));
  assert.equal(d.querySelector(".ss-back"), null, "Close closes");
});

test("Connect a wallet only presses the page's own Connect button", () => {
  const w = home(), d = w.document;
  let pressed = 0; d.getElementById("connect").addEventListener("click", () => { pressed++; });
  click(w, d.getElementById("welcome-go")); click(w, d.querySelector(".ss-wallet"));
  assert.equal(pressed, 1);
  assert.equal(d.querySelector(".ss-back"), null);
});

test("a modified click (new tab) still follows the plain link", () => {
  const w = home(), d = w.document;
  const ev = click(w, d.getElementById("welcome-go"), { ctrlKey: true });
  assert.equal(ev.defaultPrevented, false);
  assert.equal(d.querySelector(".ss-back"), null);
});

test("start-sheet.js uses no network, storage or innerHTML", () => {
  assert.doesNotMatch(read("web/start-sheet.js"), /fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|insertAdjacentHTML|eval\(/);
});

test("hub-ui.css is linked once, last before </head>, on every page with menus except race.html and golf.html", () => {
  const pages = fs.readdirSync(path.join(APP, "web")).filter((f) => f.endsWith(".html"));
  let n = 0;
  for (const f of pages) {
    const s = read(`web/${f}`), menus = /<nav class="tabs"|<nav class="tabbar"/.test(s), links = s.split('href="hub-ui.css"').length - 1;
    if (!menus || f === "race.html" || f === "golf.html") { assert.equal(links, 0, f); continue; }
    assert.equal(links, 1, f); n++;
    assert.match(s, /<link rel="stylesheet" href="hub-ui.css">\s*<\/head>/, `${f}: last before </head>`);
  }
  assert.ok(n >= 24, `pages with the link: ${n}`);
});
