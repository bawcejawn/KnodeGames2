// Block X start box (owner standard D-730; Marketing M-491 text; Hub's shared box #94). The page has exactly ONE box, at the
// top of <main>, with Marketing's sentence from tools/page-box.json; the page's own long intro and its three steps are gone;
// the Rules and Ruler links sit under the title; the two detail sections are folded away.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../web/blockx.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../../web/blockx.js", import.meta.url), "utf8");
const boxes = JSON.parse(fs.readFileSync(new URL("../../tools/page-box.json", import.meta.url), "utf8"));
const SENTENCE = "Pick which producer signs the next milestone block. Free to play. Correct calls climb the weekly board.";

test("Block X: Marketing's sentence is the page's line in tools/page-box.json, with the Block X accent", () => {
  assert.deepEqual(boxes["blockx.html"], ["blockx", SENTENCE]);
  assert.ok(SENTENCE.length <= 200);
});

test("Block X: exactly one box, first in <main>, with that sentence", () => {
  assert.equal((html.match(/class="page-box"/g) || []).length, 1, "exactly one box");
  assert.match(html, /<main class="bx">\s*<aside class="page-box" data-game="blockx"><p>([^<]*)<\/p><\/aside>/);
  assert.equal(html.match(/<aside class="page-box" data-game="blockx"><p>([^<]*)<\/p><\/aside>/)[1], SENTENCE);
});

test("Block X: the page's own intro paragraph and three steps are gone; the title keeps Rules and Ruler links", () => {
  assert.doesNotMatch(html, /class="bx-steps"/, "the three-step box moved out (its facts are in How it works)");
  assert.doesNotMatch(html, /Guess which producer signs it\. Smaller producers score more/, "the long intro moved out");
  assert.match(html, /<div class="bx-intro">\s*<h1>Who Signs Block X<\/h1>\s*<p class="bx-links"><a href="#how" id="rules-link">Rules<\/a> · <a href="ruler\.html">Ruler<\/a><\/p>\s*<\/div>/);
  assert.match(js, /\$\("rules-link"\)[\s\S]{0,200}\.open = true/, "the Rules link opens the How it works fold-out");
});

test("Block X: what stays on the page, in order: the live target, the targets, results and board; details are folded", () => {
  const at = (s) => { const i = html.indexOf(s); assert.ok(i > 0, `missing ${s}`); return i; };
  const order = [at('id="stage"'), at('id="targets-box"'), at('id="results-box"'), at('id="board-box"'), at('<details class="bx-how bx-more" id="more">'), at('<details class="bx-how" id="how">')];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const more = html.slice(at('id="more"'), at('id="how"'));
  assert.match(more, /id="mults"/); assert.match(more, /id="ruler-box"/);
});
