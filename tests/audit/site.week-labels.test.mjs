// Owner 21 Nov 2026: players see the platform's vault week number everywhere (Week 4, Week 5, ...), never a per-game count.
// "Test week" (vault week 3) and "Week of 2 Nov" (earlier weeks) stay. This sweeps the site's own pages, scripts and games list for
// the old count ("Week 1", "Week 2", "Week 3") in code and visible text; comments are left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const APP = process.env.APP || ".";
const WEB = `${APP}/web`;
const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

test("no 'Week 1', 'Week 2' or 'Week 3' anywhere on the site (html, scripts, games list); 'Test week' is allowed", () => {
  const files = fs.readdirSync(WEB).filter((f) => /\.(html|js|json)$/.test(f) && f !== "sitemap.xml");
  assert.ok(files.length > 40, "the sweep sees the site's files");
  assert.ok(files.includes("games.json") && files.includes("app.js") && files.includes("race.html"));
  const bad = [];
  for (const f of files) {
    const text = stripComments(fs.readFileSync(`${WEB}/${f}`, "utf8"));
    text.split("\n").forEach((line, i) => { if (/\bWeek [123]\b/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(bad, []);
});

test("the sweep itself catches the old count and lets the allowed labels through", () => {
  const find = (t) => /\bWeek [123]\b/.test(stripComments(t));
  assert.equal(find("<p>paid from Week 1 (Mon 16 Nov)</p>"), true);
  assert.equal(find("const s = 'Week 2';"), true);
  assert.equal(find("Test week"), false);
  assert.equal(find("Week of 2 Nov"), false);
  assert.equal(find("// the old Week 1 count"), false);
  assert.equal(find("Week 4 and Week 5"), false);
});
