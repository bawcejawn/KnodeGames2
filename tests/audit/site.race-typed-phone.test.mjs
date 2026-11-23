// M-413 (owner, 23 Nov): on a phone the 1-hour, 2-hour, daily and weekly boards (#rt-track) use the same lane layout
// as the 6-hour board: name + standing on top, the full-width track, then the Pick buttons with the time on each.
// Before, the phone rule named a grid area ("who") that the typed lanes don't have, so the track landed in a ~70 px
// column off the right edge and the Pick buttons sat where the name and track should be.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../web/race.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../../web/race.js", import.meta.url), "utf8");
const phone = html.slice(html.indexOf(".rt-pk-t { display: none; }"));
const block = phone.slice(phone.indexOf("@media (max-width: 640px)"), phone.indexOf("</style>"));

test("M-413: the phone lane rules cover the typed boards (#rt-track) as well as the 6-hour board", () => {
  assert.match(block, /#track, #rt-track \{ overflow-x: visible; \}/);
  assert.match(block, /#rt-track \.pr-lane\.rt-head \{ display: none; \}|#rt-track \.pr-lane\.rt-head\s*\{\s*display: none/);
  for (const part of ["", " > .pr-who", " > .pr-gap", " > .pr-run", " > .rt-pk"])
    assert.ok(block.includes(`:is(#track, #rt-track) .pr-lane.rt-lane${part} {`), `phone rule for .rt-lane${part}`);
  assert.match(block, /:is\(#track, #rt-track\) \.pr-lane\.rt-lane > \.pr-run \{ grid-area: auto; grid-column: 1 \/ -1; grid-row: 2; \}/);
});

test("M-413: a typed Pick button carries its race time (the time header is hidden on phones)", () => {
  const i = js.indexOf("function rtBoard(");
  const body = js.slice(i, js.indexOf("function rtTabs(", i));
  assert.match(body, /el\("small", \{ class: "rt-pk-t", text: rtype >= 3 \? dayTime\(u\.start\)\.replace\(\/ UTC\$\/, ""\) : clock\(u\.start\) \}\)/);
});
