// Over Under page (web/overunder.html, web/overunder.js): the page and the HTML agree, the page runs the recorder's own rules
// file, shows only a checked schedule file, sends through the shared card, and says what the rules say.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../../web/${p}`, import.meta.url), "utf8");
const js = read("overunder.js"), html = read("overunder.html");
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const text = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
/** The words a player can see from the script: its string literals (not field names such as board.js's `earns`). */
const words = (s) => [...s.matchAll(/"(?:[^"\\]|\\.)*"|`[^`]*`/g)].map((m) => m[0]).join(" ");

test("the page imports only the rules file and the shared send card", () => {
  const imports = [...js.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["./games/overunder/math.js", "./js/lib/send-picks.js"]);
  assert.match(html, /<script type="module" src="overunder\.js"><\/script>/);
});

test("a game is shown only from its checked schedule file; the pick goes to the contract's round for its start", () => {
  assert.match(code, /F\.checkEntry\(e\)\.ok && e\.start === start/);
  assert.match(code, /j\.round !== idOf\(start\) \|\| j\.start !== start/);
  assert.match(code, /round: String\(F\.roundOfStart\(start\)\), player: who/);
  assert.match(code, /round = String\(F\.roundOfStart\(s\)\)/);
  assert.match(code, /SP\.plan\(items, \{ maxChanges: F\.MAX_CHANGES \}\)/);
  assert.match(code, /SP\.send\(/);
  assert.match(code, /catch \{ throw new Error\(READ_FAILED\); \}/, "a failed read of your pick sends nothing");
});

test("every element id the script reads exists in the page", () => {
  const ids = new Set([...js.matchAll(/\$\("([a-z0-9-]+)"\)/g)].map((m) => m[1]));
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `#${id} is in overunder.html`);
});

test("no HTML strings: the page is built with textContent and elements", () => {
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});

test("the owner's wording: Over Under (no slash), form (not rate), the open and lock times, no banned words", () => {
  const all = text(html) + " " + words(code);
  for (const s of ["Picks open 2 hours before the start", "never more than 4", "No changes", "half block", "skipped", "pays no VHP prize for now", "every 30 minutes", "Unreliable"]) assert.ok(all.includes(s), s);
  assert.doesNotMatch(all, /Over\/Under/);
  assert.doesNotMatch(all, /\b(bet|bets|betting|earn|earns|returns|odds|guaranteed|beta)\b/i);
  assert.doesNotMatch(text(html), /\brate\b/i);
});

test("the page is not yet in games.json (the Hub lists it at launch)", () => {
  assert.ok(!read("games.json").includes("overunder.html"));
});

test("a game card gives the game's length in blocks and roughly in time (14,400 blocks at about 3 s a block)", () => {
  assert.ok(js.includes('" in its next 14,400 blocks (about 12 hours)"'));
});
