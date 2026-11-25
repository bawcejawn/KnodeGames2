// Shared game page look (UI lead PR C, GAME-PAGE-STANDARD.md): closed fold-out rows and the game's colour on its hero.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const APP = process.env.APP || ".";
const read = (p) => fs.readFileSync(`${APP}/web/${p}`, "utf8");

test("game-page.css: one-row fold-outs (52 px), a 44+ px tap area, closed look, and no script or data", () => {
  const css = read("game-page.css");
  assert.match(css, /\.fold > summary \{ min-height: 52px;/);
  assert.match(css, /\.fold\[open\] > summary::after \{ transform: rotate\(90deg\); \}/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /url\(|@import|expression\(/, "style only");
});

test("game-page.css: every games.json accent has a hero colour, the same gradient as its icon badge", () => {
  const css = read("game-page.css"), accents = new Set(JSON.parse(read("games.json")).games.map((g) => g.accent).filter(Boolean));
  assert.ok(accents.size >= 5);
  for (const a of accents) assert.match(css, new RegExp(`\\.game-hero\\[data-accent="${a}"\\] \\{ --hero-acc: var\\(--tile-${a}\\); \\}`), a);
  for (const a of accents) assert.match(read("styles.css"), new RegExp(`--tile-${a}:`), `styles.css defines --tile-${a}`);
});

test("no game page ships a fold that is open on load", () => {
  for (const f of fs.readdirSync(`${APP}/web`).filter((x) => x.endsWith(".html"))) {
    assert.doesNotMatch(read(f), /<details class="fold"[^>]*\sopen[\s>]/, `${f}: fold rows start closed`);
  }
});
