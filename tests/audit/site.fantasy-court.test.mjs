// Fantasy page: the team sheet is a basketball court (owner's pick, Nov 2026), page only. The court is drawn in CSS
// behind the same five slots; ids, words and the save path are unchanged. Light and dark themes each get their wood.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const h = fs.readFileSync(`${APP}/web/fantasy.html`, "utf8");
const css = fs.readFileSync(`${APP}/web/fantasy.css`, "utf8");
const js = fs.readFileSync(`${APP}/web/fantasy.js`, "utf8");

test("court markup: the lines of a half court behind the same five slots", () => {
  assert.match(h, /<div class="fx-pitch fx-court">\s*<div class="fx-lines" aria-hidden="true"><i class="box"><\/i><i class="three"><\/i><i class="arc"><\/i><i class="backboard"><\/i><i class="rim"><\/i><i class="half"><\/i><i class="circle"><\/i><\/div>\s*<div class="fx-slots" id="fx-slots"><\/div>/);
  // ".board" is the site's leaderboard table class (styles.css): never reuse it for a court line.
  assert.doesNotMatch(h.slice(h.indexOf('class="fx-lines"'), h.indexOf('id="fx-slots"')), /class="board"/);
  for (const id of ["fx-slots", "fx-spent", "fx-budget", "fx-left", "fx-bar", "fx-save", "fx-reset", "fx-check"]) assert.ok(h.includes(`id="${id}"`), id);
  for (const w of ["Salary cap", "Save team", "Undo changes"]) assert.ok(h.includes(w), w);
});

test("court look: wood, chalk and the paint; darker wood in the dark theme (both ways the site sets it)", () => {
  assert.match(css, /--wood: #C98B4E; --wood-2: #B97A40; --wood-3: #D69B5F;/);
  assert.match(css, /\.fx-pitch \{[^}]*repeating-linear-gradient\(90deg, var\(--wood\)/);
  for (const c of ["backboard", "rim", "box", "arc", "three", "half", "circle"]) assert.match(css, new RegExp(`\\.fx-lines \\.${c} \\{`), c);
  assert.doesNotMatch(css, /\.fx-lines \.board\b/);
  assert.match(css, /:root\[data-theme="dark"\] \.fx \{ --wood: #8A5A2F;/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \.fx \{ --wood: #8A5A2F;/);
  assert.doesNotMatch(css, /#2F6B4F|#2A6147/, "the old grass is gone");
  assert.match(css, /\.fx-capt \{[^}]*background:/, "the gold Captain ×2 line sits on a dark chip (Repo Lens 4, L-1)");
});

test("players wear sleeveless jerseys; the kit is still built node by node with the same parts", () => {
  assert.match(js, /a basketball jersey \(sleeveless\)/);
  assert.match(js, /class: "body", d: "M19 2h6c1 6 4 9 7 9s6-3 7-9h6c0 7 2 11 6 14v41H13V16c4-3 6-7 6-14Z"/);
  assert.doesNotMatch(js, /M21 3 9 9 2 24l10 5/, "the football shirt is gone");
  const k = js.slice(js.indexOf("function kit("), js.indexOf("const nameCell"));
  assert.doesNotMatch(k, /innerHTML/);
  assert.match(k, /class: "trim"/); assert.match(k, /class: "sleeve"/);
});
