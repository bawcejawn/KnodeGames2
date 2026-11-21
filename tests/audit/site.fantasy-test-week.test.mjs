// Fantasy's free test week banner (owner, 14 Nov 2026: week 4 free test, week 5 from Sun 22 Nov 7 PM ET first real week).
// Runs nav.js with a tiny fake page at chosen times. Run: TZ=UTC node --test tests/audit/site.fantasy-test-week.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const NAV = fs.readFileSync(`${APP}/web/nav.js`, "utf8");

function run(page, iso) {
  const kids = [];
  const mk = (tag) => ({ tag, className: "", attrs: {}, parts: [], textContent: "",
    setAttribute(k, v) { this.attrs[k] = v; }, append(...x) { this.parts.push(...x); } });
  const main = { prepend: (n) => kids.unshift(n), querySelector: (sel) => kids.find((k) => sel.split(".").filter(Boolean).every((c) => k.className.split(" ").includes(c))) || null };
  const document = { querySelector: (s) => (s === "main" ? main : null), getElementById: () => null, createElement: mk };
  const RealDate = Date, t = RealDate.parse(iso);
  const FakeDate = class extends RealDate { static now() { return t; } };
  vm.runInNewContext(NAV, { document, location: { pathname: `/${page}` }, Date: FakeDate, window: {} });
  return kids.map((k) => [k.className, (k.parts[0] && k.parts[0].textContent) + (k.parts[1] || "")]);
}
const fx = (page, iso) => run(page, iso).filter(([c]) => c.includes("fx-test-week"));

test("no Fantasy banner on any page, at any time (owner, Sat 21 Nov: the 'Fantasy Producers' warning goes)", () => {
  for (const p of ["fantasy.html", "index.html", "games.html", "race.html", "blockx.html", "stake.html", "golf.html"])
    for (const t of ["2026-11-16T00:00:00Z", "2026-11-21T12:00:00Z", "2026-11-28T12:00:00Z"]) assert.equal(fx(p, t).length, 0, `${p} at ${t}`);
  assert.doesNotMatch(NAV, /fx-test-week|Fantasy Producers: free play|FX_FROM|FX_UNTIL/);
});

test("Fantasy page note and the games list say week 4 is a free test and every week is real from Sun 22 Nov 7 PM ET", () => {
  const h = fs.readFileSync(`${APP}/web/fantasy.html`, "utf8"), g = JSON.parse(fs.readFileSync(`${APP}/web/games.json`, "utf8"));
  assert.match(h, /<b>Week 4 is a free test week\.<\/b>[^<]*test play starts with the Tue 17 Nov round \(first lock Mon 16 Nov, 6:55 PM ET\)\. Week 5 \(Sun 22 Nov, 7 PM ET to Sun 29 Nov, 7 PM ET\) is free play too\. Week 5 starts with no teams: pick yours before Sun 22 Nov, 6:55 PM ET\. <b>Stake now: it counts from week 6 \(Sun 29 Nov, 7 PM ET\)\. Weeks 4 and 5 are free play\.<\/b>/);
  assert.doesNotMatch(h, /planned for Mon 30 Nov|Test weeks/);
  const f = (g.games || g).find((x) => x.id === "fantasy");
  assert.match(f.line, /Weeks 4 and 5 are free play\. Stake now: it counts from week 6 \(Sun 29 Nov, 7 PM ET\)\.$/);
  assert.doesNotMatch(f.line, /Test weeks/);
  // The page hides its note from Mon 23 Nov 00:00 UTC (Sun 22 Nov 7 PM ET), the end of week 4.
  assert.match(fs.readFileSync(`${APP}/web/fantasy.js`, "utf8"), /TEST_WEEK_ENDS = Date\.UTC\(2026, 10, 30\);   \/\/ weeks 4 and 5 are free play \(D-238\)\n  if \(Date\.now\(\) >= TEST_WEEK_ENDS && \$\("fx-testweeks"\)\) \$\("fx-testweeks"\)\.hidden = true;/);
});

test("nav.js adds no banner at all: nothing in the old test week, nothing in weeks 4 and 5", () => {
  for (const t of ["2026-11-12T12:00:00Z", "2026-11-16T00:00:00Z", "2026-11-25T12:00:00Z"]) for (const p of ["fantasy.html", "index.html", "games.html"]) assert.equal(run(p, t).length, 0, `${p} at ${t}`);
});
