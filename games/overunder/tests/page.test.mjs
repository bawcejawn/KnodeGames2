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

test("the owner's wording: form (not rate), the open and lock times, no banned words", () => {
  const all = text(html) + " " + words(code);
  for (const s of ["Picks open 2 hours before the start", "never more than 4", "No changes", "half block", "skipped", "pays no VHP prize for now", "every 30 minutes", "Unreliable"]) assert.ok(all.includes(s), s);
  assert.doesNotMatch(all, /Over\/Under/);
  assert.doesNotMatch(all, /\b(bet|bets|betting|earn|earns|returns|odds|guaranteed|beta)\b/i);
  assert.doesNotMatch(text(html), /\brate\b/i);
});

test("the page is listed in games.json as a live, free-play game (Hub, 23 Nov: it has run and picks are in)", () => {
  const g = JSON.parse(read("games.json")).games.find((x) => x.id === "overunder");
  assert.ok(g, "listed");
  assert.equal(g.href, "overunder.html");
  assert.equal(g.status, "live");
  assert.deepEqual(g.kinds, ["free"]);
});

test("a game card gives the game's length in blocks and roughly in time (14,400 blocks at about 3 s a block)", () => {
  assert.ok(js.includes('" in its next 14,400 blocks (about 12 hours)"'));
});

test("the look (D-730, D-732): one short box with Rules and Ruler links, 'the number', ▲ More / ▼ Fewer, a calm flash, a sticky Send bar", () => {
  const css = read("overunder.css");
  const box = JSON.parse(fs.readFileSync(new URL("../../../tools/page-box.json", import.meta.url), "utf8"))["overunder.html"][1];
  assert.equal(box, "Free test game, no prizes yet. Pick a producer and call whether it signs more or fewer blocks than the number shown. A new game starts every 30 minutes.", "Marketing's box text (M-491), in the shared box (#94)");
  assert.equal((html.match(/class="page-box"/g) || []).length, 1, "exactly one box on the page (R3-17 F-5)");
  assert.ok(!html.includes('class="ou-box"'), "no second, page-own box");
  assert.match(html, /<p class="ou-links"><a href="#help" id="ou-rules-link">Rules<\/a> · <a href="ruler\.html">The Ruler<\/a><\/p>/);
  assert.match(code, /\$\("help"\)\.open = true/, "the Rules link opens the rules box");
  assert.ok(js.includes('"The number"') && js.includes('"▲ More"') && js.includes('"▼ Fewer"'));
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.ou-g\.sent \{ animation: none; \}/, "no flash for people who ask for less motion");
  assert.match(css, /\.ou-actions\.ready \{ position: sticky;/);
  assert.match(code, /: el\("span", \{ class: "ou-g-lock", text: "Cancelled" \}\)/, "a cancelled game shows no countdown");
});

test("the game is called More or Fewer: 'Over' or 'Under' never shows on this page (owner, D-762; display only)", () => {
  assert.ok(js.includes('btn(F.OVER, "More", "than the number", "ou-o"), btn(F.UNDER, "Fewer", "than the number", "ou-u")'));
  // This page's own words: its head (title, search and share text) and <main>. The menus are the Hub's (site-nav) and change in its PR.
  const head = html.slice(0, html.indexOf("</head>")), main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const mine = text(head.replace(/<link[^>]*>/g, "")) + " " + [...head.matchAll(/content="([^"]*)"/g)].map((m) => m[1]).join(" ") + " " + text(main) + " " + words(code);
  assert.doesNotMatch(mine.replace(/overunder\.(html|js|css)/g, ""), /\b(Over|Under|over|under)\b/, "no Over / Under word a player can see");
  assert.match(mine, /More or Fewer/);
});

test("the two spots the Hub checked say More or Fewer: the label above the headline and the Prizes paragraph (M-577)", () => {
  assert.match(html, /<p class="ou-kicker">More or Fewer<\/p>/);
  const prizes = html.match(/<p><b>Prizes\.<\/b>[^\n]*<\/p>/)[0];
  assert.match(prizes, /More or Fewer/);
  assert.doesNotMatch(prizes, /\b(Over|Under)\b/);
});

test("the owner's admin cards for game 16 say More or Fewer; the variable names stay OVERUNDER_ (display only, D-762)", () => {
  const admin = fs.readFileSync(new URL("../../../ops/admin/switches.ts", import.meta.url), "utf8");
  const cards = admin.split("\n").filter((l) => /name: "OVERUNDER_/.test(l));
  assert.equal(cards.length, 4);
  for (const c of cards) assert.doesNotMatch(c.replace(/OVERUNDER_[A-Z_]+/g, ""), /Over Under|\b(Over|Under)\b/);
});
