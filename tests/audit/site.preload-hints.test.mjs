// Speed (Wed 25 Nov): every published page gets one preload hint per script at build time (tools/ci/preload-hints.mjs).
// Measured on a slow phone (Fast 3G, 4x CPU): race.html 13.4 s -> 4.6 s until its scripts are in, blockx 12.8 -> 4.3,
// games 12.7 -> 4.1, stake 11.4 -> 3.9. The CSP <meta> on each page stops Chrome looking ahead, so without the hints the
// scripts download one by one. These tests pin that the build adds the hints and changes nothing else.
// Run: node --test tests/audit/site.preload-hints.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { addHints } from "../../tools/ci/preload-hints.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DIST = fs.mkdtempSync(path.join(os.tmpdir(), "kg-dist-hints-"));
const built = spawnSync(process.execPath, [path.join(ROOT, "tools/ci/assemble-site.mjs"), DIST], { cwd: ROOT, encoding: "utf8" });
const pages = fs.readdirSync(path.join(ROOT, "web")).filter((n) => n.endsWith(".html"));
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
const HINT = /^ *<link rel="(?:preload" as="script|modulepreload)"[^>]*>\n/gm;
const NOTE = /^ *<!-- Added at build time by tools\/ci\/preload-hints\.mjs[^\n]*-->\n/m;

test("the site builds", () => assert.equal(built.status, 0, built.stderr));

test("every published page: one hint per script at the end of the page, same integrity and crossorigin, nothing left over", () => {
  let checked = 0;
  for (const p of pages) {
    const html = fs.readFileSync(path.join(DIST, p), "utf8");
    const end = html.indexOf("</head>");
    if (end < 0) continue;
    const scripts = [...html.slice(end).matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g)].map((m) => m[0]);
    const hints = [...html.slice(0, end).matchAll(/<link rel="(?:preload" as="script|modulepreload)"[^>]*>/g)].map((m) => m[0]);
    const srcs = [...new Set(scripts.map((s) => attr(s, "src")))];
    assert.equal(hints.length, srcs.length, `${p}: ${hints.length} hints for ${srcs.length} scripts`);
    for (const s of scripts) {
      const h = hints.find((x) => attr(x, "href") === attr(s, "src"));
      assert.ok(h, `${p}: hint for ${attr(s, "src")}`);
      assert.equal(/\btype="module"/.test(s), /rel="modulepreload"/.test(h), `${p} ${attr(s, "src")}: module scripts get modulepreload`);
      assert.equal(attr(h, "integrity"), attr(s, "integrity"), `${p} ${attr(s, "src")}: same integrity`);
      assert.equal(attr(h, "crossorigin"), attr(s, "crossorigin"), `${p} ${attr(s, "src")}: same crossorigin`);
    }
    if (scripts.length) checked++;
  }
  assert.ok(checked >= 25, `${checked} pages with scripts checked`);
});

test("the build only adds hint lines: take them out and each page is byte for byte its web/ source (CSP and script tags untouched)", () => {
  for (const p of pages) {
    const src = fs.readFileSync(path.join(ROOT, "web", p), "utf8");
    const out = fs.readFileSync(path.join(DIST, p), "utf8");
    if (out === src) continue;   // a page that already has its own hints (index.html after #119), or no scripts
    assert.equal(out.replace(NOTE, "").replace(HINT, ""), src.replace(HINT, ""), `${p}: only hint lines added`);
    const head = out.slice(0, out.indexOf("</head>"));
    assert.ok(head.indexOf('http-equiv="Content-Security-Policy"') < head.search(/rel="(?:preload" as="script|modulepreload)"/), `${p}: hints after the CSP tag`);
    const hub = head.lastIndexOf('<link rel="stylesheet" href="hub-ui.css">');
    if (hub >= 0) assert.ok(Math.max(head.lastIndexOf('rel="preload" as="script"'), head.lastIndexOf('rel="modulepreload"')) < hub && !/<link|<meta|<script/.test(head.slice(hub + 40)), `${p}: hub-ui.css stays last in <head>`);
  }
});

test("addHints: leaves a page that already has hints alone, runs once, PostHog at low priority, CDN integrity copied", () => {
  const page = '<head>\n<meta http-equiv="Content-Security-Policy" content="x">\n  <link rel="stylesheet" href="hub-ui.css">\n</head>\n<body>\n'
    + '  <script src="https://cdn.jsdelivr.net/npm/a@1/a.js" integrity="sha384-AA" crossorigin="anonymous"></script>\n'
    + '  <script src="app.js"></script>\n  <script type="module" src="page.js"></script>\n  <script src="vendor/posthog-1.438.13.js"></script>\n</body>';
  const once = addHints(page);
  assert.equal(addHints(once), once, "second run changes nothing");
  assert.match(once, /<link rel="preload" as="script" href="https:\/\/cdn\.jsdelivr\.net\/npm\/a@1\/a\.js" integrity="sha384-AA" crossorigin="anonymous">/);
  assert.match(once, /<link rel="modulepreload" href="page\.js">/);
  assert.match(once, /<link rel="preload" as="script" href="vendor\/posthog-1\.438\.13\.js" fetchpriority="low">/);
  assert.ok(once.indexOf('href="app.js">') < once.indexOf("hub-ui.css"), "above hub-ui.css");
  assert.equal(addHints("<head></head><body><p>no scripts</p></body>"), "<head></head><body><p>no scripts</p></body>");
});
