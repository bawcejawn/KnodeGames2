// Repo Lens #R4-2 (I-1, ratchet), written by Architecture from the reply (#R4-2b compares Repo Lens 4's own file).
// Every page that builds pick operations sends them through the shared card (web/js/lib/send-picks.js), except the
// pages listed in PENDING, which still send picks themselves until they convert. A new page outside the card fails here.
// When a page converts, remove it from PENDING in the same PR (this test fails until you do).
// Run: node --test tests/audit/send-picks.pages-ratchet.repolens-r4.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// One entry per line, a comment line between entries: a converting PR deletes ONLY its own entry line, so two pages
// converting at the same time never conflict (Repo Lens #R5-1b C1). Never add an entry; nothing else needs editing.
export const PENDING = [
  "blockx.js",
  // ·
  "bracket.js",
  // ·
  "race.js",
  // ·
  // ·
  "overunder.js",
];
// The six names the list started with. Never edited by a converting PR (it deletes only its own entry line above); it stops a
// shrinking list from being used to slip in a new page name (Repo Lens #R4-2b).
const STARTED_NAMES = new Set(["blockx.js", "bracket.js", "combo.js", "race.js", "survivor.js", "overunder.js"]);
const STARTED_WITH = 6;   // the list on the day the card landed; PENDING may only be at most this long
const BUILDS_PICKS = /functions\s*(?:\.\s*pick\b|\[\s*["'`]pick["'`]\s*\])|\{\s*[^}]*\bpick\b[^}]*\}\s*=\s*\w+\.functions/;
// Importing the card is not using it (Repo Lens #R4-2b): the page must also send through it, SP.send(...).
const USES_CARD_TEXT = (src) => /from\s+["']\.\/js\/lib\/send-picks\.js["']/.test(src) && /\bSP\.send\s*\(/.test(src);
const USES_CARD = { test: USES_CARD_TEXT };

const pages = fs.readdirSync("web").filter((f) => f.endsWith(".js")).map((f) => ({ f, src: fs.readFileSync(path.join("web", f), "utf8") }));

test("every page that builds picks uses the card, or is listed in PENDING", () => {
  const outside = pages.filter((p) => BUILDS_PICKS.test(p.src) && !USES_CARD.test(p.src)).map((p) => p.f);
  const extra = outside.filter((f) => !PENDING.includes(f));
  assert.deepEqual(extra, [], `send picks through web/js/lib/send-picks.js: ${extra.join(", ")}`);
});

test("a page in PENDING that now uses the card is taken off the list (the list only shrinks)", () => {
  const converted = pages.filter((p) => PENDING.includes(p.f) && USES_CARD.test(p.src)).map((p) => p.f);
  assert.deepEqual(converted, [], `remove from PENDING: ${converted.join(", ")}`);
  assert.ok(PENDING.length <= STARTED_WITH, "nothing is added to PENDING (it only shrinks)");
  assert.equal(new Set(PENDING).size, PENDING.length, "no entry twice");
  assert.deepEqual(PENDING.filter((f) => !STARTED_NAMES.has(f)), [], "PENDING may only keep names it started with: a new page must use the card, not join the list");
});

test("Fantasy uses the card, and the pattern catches the ways around a plain text rule", () => {
  assert.ok(USES_CARD.test(fs.readFileSync("web/fantasy.js", "utf8")));
  for (const s of ["c.functions.pick({})", "c.functions['pick']({})", "c.functions[\"pick\"]({})", "const { pick } = c.functions;"]) assert.match(s, BUILDS_PICKS, s);
});
