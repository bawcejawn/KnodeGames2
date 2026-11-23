// Hub UI C: the "Play free" button in the top banner opens the same start sheet as the big one (owner, 23 Nov), and stays a plain link without the script.
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

test("the banner Play free is a plain link, and with the script it opens the one start sheet", () => {
  // Repo Lens 4 R4-16 L-1: the games page week tile shows the platform week (KWeeks.short), not week + 1.
  assert.match(read("web/games.js"), /\$\("wk-num"\)\.textContent = window\.KWeeks \? window\.KWeeks\.short\(w\) : String\(w\);/);
  const dom = new JSDOM(read("web/index.html"), { runScripts: "outside-only", url: "https://knodegames.com/" });
  const w = dom.window, d = w.document, b = d.querySelector(".top .btn-play-free");
  assert.equal(b.tagName, "A");
  assert.equal(b.getAttribute("href"), "race.html#pick-zone");
  w.eval(read("web/start-sheet.js"));
  const mk = (o = {}) => { const e = new w.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...o }); b.dispatchEvent(e); return e; };
  b.focus();
  assert.equal(mk().defaultPrevented, true);
  assert.equal(d.querySelectorAll(".ss-card").length, 1);
  assert.equal(d.querySelector(".ss-go").getAttribute("href"), "race.html#pick-zone");
  d.querySelector(".ss-close").click();
  assert.equal(d.activeElement, b, "focus returns to the banner button");
});
