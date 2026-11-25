// GAME-PAGE-STANDARD.md, Race row (M-601): the Rules book is ONE closed "Rules and how points work" row (the three
// steps open it); "Picks: coming next" lives inside My picks; a links row goes to the Leaderboard and Results pages;
// the 6-hour results table sits in "For the curious"; long lists show their first rows and ONE "Show all (N)" row
// (6 lanes per board plus the player's own pick; 3 races in Results). Page only: no send, wallet or scoring code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../web/race.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../../web/race.js", import.meta.url), "utf8");
const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));

test("one closed Rules row with the three steps and every rules topic; the Rules link opens it", () => {
  const i = main.indexOf('<details class="card fold rc-rules" id="how">');
  assert.ok(i > 0, "a <details>, closed (no open attribute)");
  assert.match(main.slice(i, i + 120), /<summary>Rules and how points work<\/summary>/);
  assert.doesNotMatch(main, /<h2>Rules book<\/h2>/);
  assert.match(main.slice(i), /<ol class="rc-steps rules-steps">/);
  assert.match(js, /const openRules = \(\) => \{ const d = \$\("how"\); if \(d\) d\.open = true; \};/);
  assert.match(js, /if \(location\.hash === "#how"\) openRules\(\);/);
});

test("'Picks: coming next' is inside My picks; no separate box", () => {
  assert.doesNotMatch(main, /id="picks-soon"[^>]*>\s*<h2>Picks: coming next/);
  const p = main.slice(main.indexOf('<section class="card" id="picks">'));
  assert.match(p.slice(0, p.indexOf("</section>")), /<p class="note" style="margin-top:0" id="picks-soon">Soon:/);
});

test("a links row to the Leaderboard and Results pages, after the Rules row; the 6-hour table is in For the curious", () => {
  assert.ok(main.includes('<nav class="card links-row" aria-label="Results and leaderboard"><a href="index.html#leaderboard/race">Leaderboard →</a><a href="index.html#results/race">Results →</a></nav>'));
  assert.ok(main.indexOf("links-row") > main.indexOf('id="how"'));
  const c = main.indexOf('id="curious"'), h = main.indexOf('id="history"'), end = main.indexOf("</details>", h);
  assert.ok(c > 0 && h > c && end > h, "the results table sits inside the closed fold");
});

test("long lists: 6 lanes per board (plus your pick) and 3 races in Results, then ONE 'Show all (N)'", () => {
  assert.match(js, /const LANE_CAP = 6, showAll = new Set\(\);/);
  assert.match(js, /if \(i >= LANE_CAP && !l\.classList\.contains\("mine"\)\) l\.hidden = true;/);
  assert.match(js, /`Show all \(\$\{lanes\.length\}\)`/);
  assert.match(js, /if \(rows\.length > 4 && !showAll\.has\(`r\$\{rtype\}`\)\) \{ rows\.forEach\(\(r, i\) => \{ if \(i >= 3\) r\.hidden = true; \}\);/);
  assert.match(html, /\.pr-lane\[hidden\], \.rl-row\[hidden\] \{ display: none !important; \}/);
});

test("M-768 (Ruler M-739): 'No handicap this hour' is explained once under the typed board, and such a producer's Pick is grey 'Sits out'", () => {
  assert.ok(js.includes('const SITS_OUT = "No handicap this hour: this producer is expected to sign fewer than 10 blocks in this race. With so few blocks one lucky block decides the race, so no handicap can make it fair, and it races without one. It can also mean the producer signed no block in the 6 hours before this hour\'s card; it gets a handicap again at the next card after it signs.";'));
  assert.match(js, /const any = order\.some\(\(a\) => !hm\.has\(a\)\); n\.hidden = !any; n\.textContent = any \? SITS_OUT : "";/);
  assert.match(js, /if \(!hm\.has\(a\) && !chosen\) return el\("button", \{ type: "button", class: "rt-pk out", disabled: "",/);
  assert.match(js, /el\("span", \{ text: "Sits out" \}\)/);
  assert.match(html, /<div class="pr-track rt-board" id="rt-track"><\/div>\n\s*<p class="note" id="rt-sitsout" hidden><\/p>/);
  assert.match(js, /: "No handicap this hour"\}/);
});
