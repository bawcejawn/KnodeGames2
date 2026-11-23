// Week labels show the platform week (the vault week; weeks.js), never "vault week + 1" (Ruler M-392, owner 23 Nov: the games tile showed 6 in week 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");

test("app.js: the claim label, the share card, its text and its file name use the week helpers", () => {
  const js = read("web/app.js");
  assert.match(js, /`collect \$\{WL\(week\)\} reward`/);
  assert.match(js, /week: WS\(week\), pts: me/);
  assert.match(js, /in \$\{WL\(SH\.week\)\}/);
  assert.equal([...js.matchAll(/knode-week-\$\{fileWeek\(SH\.week\)\}\.png/g)].length, 2);
  assert.doesNotMatch(js, /SH\.week \+ 1|week: week \+ 1|collect week \$\{week \+ 1\}/);
});
test("blockx.js and blockx.html: the prizes line uses KWeeks, and weeks.js loads before blockx.js", () => {
  const js = read("web/blockx.js"), h = read("web/blockx.html");
  assert.match(js, /for week \$\{window\.KWeeks \? window\.KWeeks\.short\(lw\.week\) : lw\.week \+ 1\}:/);
  const a = h.indexOf('<script src="weeks.js"></script>'), b = h.indexOf('<script src="blockx.js"></script>');
  assert.ok(a > 0 && b > a);
});
