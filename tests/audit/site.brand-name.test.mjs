// The platform is "Knode Games" (two words) in the top bar, the logo label, the play button and the share picture (owner, 23 Nov): never the short "Knode".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");

test("every page's top bar says Knode Games next to the logo, with a matching label and play button", () => {
  const pages = fs.readdirSync(path.join(APP, "web")).filter((f) => f.endsWith(".html"));
  let n = 0;
  for (const f of pages) {
    const h = read(`web/${f}`);
    if (!/class="brand-name"/.test(h)) continue;
    n++;
    assert.match(h, /<span class="brand-name">Knode Games<\/span>/, f);
    assert.doesNotMatch(h, /aria-label="Knode home"|>Play Knode<\/a>/, f);
  }
  assert.ok(n >= 20, `pages checked: ${n}`);
});
test("the share picture's first line says KNODE GAMES", () => {
  assert.match(read("web/extras.js"), /text: `KNODE GAMES · WEEK \$\{s\.week\}`/);
});
