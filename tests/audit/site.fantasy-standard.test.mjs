// Fantasy: the standard game page (D-791, GAME-PAGE-STANDARD.md). Open: the shared box, the hero (with the one-line
// "my week" strip and the links row) and the team sheet. Everything else sits in TWO closed rows: "For the curious"
// (players, my week by day, Weekly Rival, League) and "Rules and how points work" (the dated free-week note, the
// save-early note, how to play, the questions, the full rules). Stake is one line. Page only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const html = fs.readFileSync(`${APP}/web/fantasy.html`, "utf8");
const js = fs.readFileSync(`${APP}/web/fantasy.js`, "utf8");
const doc = new JSDOM(html).window.document;
const main = doc.querySelector("main.fx");

test("order: box, hero, status, team sheet, then only the two closed rows and the stake line", () => {
  const kids = [...main.children].map((e) => e.id || e.className);
  assert.equal(main.firstElementChild.className, "page-box");
  assert.deepEqual(kids.slice(kids.indexOf("sheet")), ["sheet", "curious", "rules", "fx-stake-line"]);
  assert.ok(kids.indexOf("sheet") < 7, "the play area comes right after the hero");
  for (const id of ["curious", "rules"]) {
    const d = doc.getElementById(id);
    assert.equal(d.tagName, "DETAILS"); assert.equal(d.className, "fold"); assert.equal(d.hasAttribute("open"), false, `${id} closed on load`);
  }
  assert.equal(doc.getElementById("curious").querySelector("summary").textContent, "For the curious");
  assert.equal(doc.getElementById("rules").querySelector("summary").textContent, "Rules and how points work");
  assert.equal(doc.querySelector(".fx-nav"), null, "no section tabs");
  assert.equal(doc.getElementById("fantasy-stake"), null, "no stake panel");
});

test("what moved where", () => {
  const inside = (id, row) => assert.ok(doc.getElementById(row).contains(doc.getElementById(id)), `${id} in #${row}`);
  for (const id of ["pool-box", "fx-legend", "week-box", "rival-box", "league-box"]) inside(id, "curious");
  for (const id of ["fx-testweeks", "fx-save-early", "fx-guide", "how-text"]) inside(id, "rules");
  assert.ok(doc.getElementById("rules").querySelectorAll(".fx-faq details").length >= 5, "the questions sit inside Rules");
  assert.ok(doc.querySelector(".fx-hero").contains(doc.getElementById("you")), "my week as one line in the hero");
  assert.match(doc.querySelector(".fx-hero .fx-links").innerHTML, /href="#rules"[^>]*>Rules<\/a> · <a href="#curious" data-open="curious">League<\/a> · <a href="ruler.html">Ruler<\/a>/);
  assert.equal(doc.querySelector("#fx-stake-line a").getAttribute("href"), "stake.html#g4");
  assert.ok(doc.getElementById("fx-stake-line").hidden, "hidden until a real wallet is connected");
});

test("script: the add-a-producer path opens the players row; Rules/League links open their row; guests see no stake line", () => {
  assert.match(js, /function pickFromList\(\) \{\n    openFold\("curious"\);/);
  assert.match(js, /function openFold\(id\) \{ const d = \$\(id\); if \(d && d\.tagName === "DETAILS"\) d\.open = true; return d; \}/);
  assert.match(js, /document\.querySelectorAll\('a\[href="#rules"\], a\[data-open\]'\)/);
  assert.match(js, /sl\.hidden = !me\(\) \|\| !W \|\| W\.kind === "guest";/);
  assert.doesNotMatch(js, /KStake\.mount/);
  assert.doesNotMatch(js, /fx-guide-x|fx-guide-show/);
});
