// Knode Games VS page (TEST): the page sends through the shared card, uses only the game's own math, keeps the owner's wording,
// and shows no line or multiplier before picks lock.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as V from "../math.js";

const js = fs.readFileSync("web/vs.js", "utf8"), html = fs.readFileSync("web/vs.html", "utf8");

test("the page sends through the shared card and loads Long before koilib", () => {
  assert.match(js, /from\s+["']\.\/js\/lib\/send-picks\.js["']/);
  assert.match(js, /\bSP\.send\s*\(/);
  assert.ok(html.indexOf("long@5.3.2") > 0 && html.indexOf("long@5.3.2/umd/index.js\" integrity") < html.indexOf("koilib@9.4.1/dist/koinos.min.js\" integrity"));
});
test("the page imports only the game's math and the card, and uses the game's own constants", () => {
  assert.deepEqual([...js.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]), ["./games/vs/math.js", "./js/lib/send-picks.js"]);
  assert.match(js, /V\.MAX_CHANGES/);
  assert.match(js, /V\.locksAt/);
  assert.equal(V.MAX_CHANGES, 0);
});
test("the page says picks open 2 days ahead, no changes, names only; no banned words", () => {
  assert.match(html, /Picks open 2 days before the day and lock 5 minutes before it\. No changes\./);
  assert.match(html, /Lines and multipliers stay hidden until picks lock/);
  assert.doesNotMatch(js + html.replace(/<meta[^>]*>/g, ""), /\b(bet|bets|betting|earn|earns|returns|odds|guaranteed|beta)\b/i);
  assert.doesNotMatch(js.replace(/\/\*[\s\S]*?\*\//g, ""), /fpct|multiplier/i, "the page never reads a line before lock");
});

test("an empty roster says so in plain words, instead of 'Tick the producers' over an empty list", () => {
  assert.ok(js.includes('"No producers on this day\'s list, so you can only pick the pool node against all, and nothing scores."'));
  assert.doesNotMatch(js.match(/const EMPTY_NOTE = [^\n]*/)[0], /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\d{1,2} (Nov|Dec)/, "the note names no date (R5-13-2)");
  assert.match(js, /roster\.rows\.length === 0[^?]*\?\s*el\("p", \{ class: "note vs-empty", text: EMPTY_NOTE \}\)\s*:\s*el\("p", \{ class: "note", text: "Tick the producers/);
});
