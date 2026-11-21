// Owner, Sat 21 Nov 2026: on the Fantasy page every week number players see is the platform's real (vault) week, the
// same number as the week files and the vault (this week is "Week 5", then 6, 7 ...). Before: the page's own lines said
// "Week 5" while weeks.js labels said "Week 2" for the same week. Other pages keep weeks.js (D-063) as they are.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const js = fs.readFileSync(`${APP}/web/fantasy.js`, "utf8");
const html = fs.readFileSync(`${APP}/web/fantasy.html`, "utf8");
const board = fs.readFileSync(`${APP}/web/board.js`, "utf8");

test("fantasy.js: WL is the vault week, never weeks.js's count", () => {
  assert.match(js, /\n  const WL = \(w\) => `Week \$\{w\}`;\n/);
  assert.doesNotMatch(js, /KWeeks\.label|KWeeks\.short|w - 3/);
  const WL = new Function(`${js.match(/  const WL = \(w\) => `Week \$\{w\}`;/)[0]}; return WL;`)();
  assert.equal(WL(5), "Week 5"); assert.equal(WL(6), "Week 6"); assert.equal(WL(12), "Week 12");
  assert.match(js, /label: "Fantasy Producers leaderboard", hide: \["today"\], weekLabel: WL,/, "the league board uses it too");
});

test("fantasy.html: every written week number is a vault week (4 or later); no 'Week 1/2/3' or 'Test week'", () => {
  const nums = [...html.matchAll(/\b[Ww]eeks? (\d+)(?: and (\d+))?/g)].flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number));
  assert.ok(nums.length >= 4, "the page names weeks");
  for (const n of nums) assert.ok(n >= 4, `week ${n}`);
  assert.doesNotMatch(html, /Test week\b/);
});

test("board.js: a board's weekLabel names the week; without it, weeks.js's label as before", () => {
  const run = (opt) => {
    const dom = new JSDOM(`<div id="b"></div>`, { runScripts: "outside-only" });
    dom.window.KWeeks = { label: (w) => `Week ${w - 3}` };
    dom.window.eval(board);
    const lb = dom.window.KBoard.create(dom.window.document.getElementById("b"), Object.assign({ columns: [{ key: "pts", label: "Points", d: 1 }] }, opt));
    lb.set({ week: { week: 5, start: Date.UTC(2026, 10, 23), rows: [{ a: "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr", pts: 3, ranked: true, boardPlace: 1 }] }, lastWeek: null, allTime: null });
    return dom.window.document.getElementById("b").textContent;
  };
  assert.match(run({ weekLabel: (w) => `Week ${w}` }), /Week 5, from /);
  assert.match(run({}), /Week 2, from /, "other games unchanged");
});
