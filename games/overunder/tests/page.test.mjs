// Over/Under page: the page script and the HTML agree, and the page runs the recorder's own rules file.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../../web/${p}`, import.meta.url), "utf8");
const js = read("overunder.js"), html = read("overunder.html");

test("the page loads games/overunder/math.js, the same file the recorder uses, and checks the roster before it shows a row", () => {
  assert.match(js, /from "\.\/games\/overunder\/math\.js"/);
  assert.match(js, /F\.checkRoster\(/);
  assert.match(js, /F\.encodePick\(/);
  assert.match(js, /F\.pickRoundOf\(/, "number A and number B are two Picks rounds (D-296)");
  assert.match(js, /sendBatch/, "both numbers go in one approval (D-211)");
  assert.match(js, /F\.decodePick\(/);
  assert.match(html, /<script type="module" src="overunder\.js"><\/script>/);
});

test("every element id the script reads exists in the page", () => {
  const ids = new Set([...js.matchAll(/\$\("([a-z0-9-]+)"\)/g)].map((m) => m[1]));
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `#${id} is in overunder.html`);
});

test("no HTML strings: the page is built with textContent and elements (no innerHTML, outerHTML, insertAdjacentHTML, document.write)", () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});

test("the page sends one Picks operation per pick number (up to two a day, batched) to game 16 with an empty producer list; a change is paid with the player's own Mana (D-278)", () => {
  assert.match(js, /game: GAME, round: String\(F\.pickRoundOf\(d \* DAY, x\.h\)\), producers: \[\], number: x\.number/);
  assert.match(js, /GAME = F\.GAME/);
  assert.match(js, /isChange \? \{ ownMana: true \} : \{\}/);
  assert.match(js, /Connect a wallet to change a pick/);
  assert.match(js, /F\.MAX_CHANGES/);
});

test("the page text matches the rules: half-block lines, blank row = no pick, 2 changes, 5 minute lock, void skipped, Free prizes 2 / 1 VHP", () => {
  for (const s of ["half block", "blank", "2 more times", "5 minutes", "skipped", "2 VHP for first and 1 VHP for second", "Friday 00:00 UTC"]) assert.ok(html.includes(s) || js.includes(s), s);
  assert.doesNotMatch(html, /guarantee|risk-free|can't lose/i);
});

test("the page is not yet listed in games.json or the other pages' menus (that comes at launch, with the Hub chat)", () => {
  const games = JSON.parse(read("games.json"));
  assert.ok(!JSON.stringify(games).includes("overunder.html"));
});
