// D-730 (owner) / PR D: the Race page's first look. The shared box carries Marketing's Race line; the hero's line is the
// short tagline; the handicap card and the block feed sit in one "For the curious" fold-out (closed); the page and the
// Rules say a pick can be changed once per race, with the player's own Mana (D-743 / D-745), never "until it starts".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../web/race.html", import.meta.url), "utf8");
const box = JSON.parse(readFileSync(new URL("../../tools/page-box.json", import.meta.url), "utf8"))["race.html"];

test("the box: Marketing's Race line, in the page", () => {
  assert.deepEqual(box, ["race", "Pick the producer you think finishes first, then watch the race run live on real blocks. Free to play."]);
  assert.ok(html.includes(`<aside class="page-box" data-game="race"><p>${box[1]}</p></aside>`));
});

test("the handicap card and the latest blocks are in one closed 'For the curious' fold-out", () => {
  const i = html.indexOf('<details class="card curious" id="curious">'), j = html.indexOf("</details>", html.indexOf('id="feed"'));
  assert.ok(i > 0 && j > i, "the fold-out wraps both");
  const inner = html.slice(i, j);
  assert.match(inner, /<summary>For the curious: the handicap card and the latest blocks<\/summary>/);
  assert.ok(inner.includes('id="card-title"') && inner.includes('id="feed"'));
  assert.doesNotMatch(html.slice(i, i + 60), /\bopen\b/, "closed by default");
});

test("one change per race, own Mana: in the picks note and in the Rules; no 'change until it starts' left", () => {
  assert.match(html, /You can change a pick once per race, with your own Mana \(about 0\.9\), until its race starts/);
  assert.match(html, /<summary>Picks and changes<\/summary><p>[^<]*You can change it once per race, and a change is paid with your own Mana/);
  assert.doesNotMatch(html, /You can change a pick until its race starts/);
});

test("R3-21: the page's tool row fits a 320 px phone: four short pills (Live race and 'a horse' hidden on phones); Results goes to the Results list", () => {
  assert.ok(html.includes('<nav class="tools" aria-label="On this page"><a href="#live" class="hide-sm">Live race</a><a href="#pick-zone" class="go-pick">Pick<span class="hide-sm"> a horse</span></a><a href="#board-box">Leaderboard</a><a href="#ruler-box">Results</a><a href="#how">Rules</a>'));
  assert.match(html, /\.tools \{ gap: 6px; padding: 8px 12px; margin: 0 -12px 14px; \}\n\s*\.tools a \{ padding: 6px 8px; font-size: 13px; \}/);
  assert.match(html, /#live, #pick-zone, #board-box, #ruler-box, #history, #how \{ scroll-margin-top: 124px; \}/);
});
