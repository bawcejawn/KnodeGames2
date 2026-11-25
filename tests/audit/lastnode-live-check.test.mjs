// Last Node live check, 24 Nov 2026 (M-570): the Scouting report's names wrap on a phone (no sideways scroll), and a
// stale page says its results are behind instead of blaming the ruler.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
const read = (f) => fs.readFileSync(new URL(`../../web/${f}`, import.meta.url), "utf8");

test("the Scouting report's node names wrap on a phone", () => {
  const css = read("lastnode.css");
  const sm = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(sm, /\.ln \.hist td\.who \{ white-space: normal; \}/);
  assert.match(sm, /\.ln \.hist td\.who a \{ overflow-wrap: anywhere;/);
});

test("an old board.json means 'results behind', checked before the ruler-late note", () => {
  const js = read("lastnode.js");
  const a = js.indexOf("  const RULER_LATE"), b = js.indexOf("  function renderRuler(");
  const lateNote = new Function(`${js.slice(a, b)}; return lateNote;`)();
  assert.match(lateNote(6 * 3600000, 6.6 * 3600000), /results were last updated about 7 hours ago \(normally every 20 minutes\)\. Nothing is lost/);
  assert.doesNotMatch(lateNote(6 * 3600000, 6.6 * 3600000), /cancelled|ruler is running late/);
  assert.match(lateNote(45 * 60000, 10 * 60000), /running late/);
  assert.match(js, /lateNote\(now - nextCut, board && board\.updated \? now - Date\.parse\(board\.updated\) : 0\)/);
});
