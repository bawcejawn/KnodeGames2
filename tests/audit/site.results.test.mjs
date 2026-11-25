// Results (index.html#results, site/results.js): a tab per game. Daily Questions keeps app.js's results; the Producer
// Race shows every recorded week from the race recorder. Read-only, plain text, this repo's race-data only. Offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const APP = process.env.APP || ".";
const read = (p) => fs.readFileSync(`${APP}/${p}`, "utf8");

test("results.js only reads and draws: no sending, storage, eval or HTML from data", () => {
  const js = read("web/results.js");
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|localStorage|sessionStorage|indexedDB|sendTransaction|\.send\(|signTransaction/);
  assert.match(js, /RAW \+ "race-data\/index\.json"/);
  assert.match(js, /race-data\/W\$\{String\(w\)\.padStart\(3, "0"\)\}\.json/, "week files by number only");
  assert.match(js, /const ADAPTERS = \{ race, blockx, bracket, lastnode, golf \};/, "a game needs a drawing here before it gets a tab");
});

test("the results view has a game switcher and keeps the question results whole", () => {
  const h = read("web/index.html");
  assert.match(h, /id="res-games"/);
  assert.match(h, /<div id="res-q">[\s\S]*id="results-list"[\s\S]*<\/div>\s*<div id="res-g" hidden><\/div>\s*<\/section>/);
  assert.match(h, /<script src="race-math\.js"><\/script>\s*<script src="results\.js"><\/script>/);
  assert.ok(h.includes("https://raw.githubusercontent.com/bawcejawn/KnodeGames2/race-data/"), "index.html may read race-data");
});

test("games.json: the Producer Race has results; the hub links every game's results", () => {
  const race = JSON.parse(read("web/games.json")).games.find((g) => g.id === "race");
  assert.equal(race.results, true);
  assert.match(read("web/games.html"), /id="g-results"/);
  assert.match(read("web/games.js"), /index\.html#results\/\$\{g\.id\}/);
});

// R-BX-12: Who Signs Block X on the Results page, from the Block X recorder's files on games-data.
test("Block X results: its own tab, read from games-data/blockx by week number only, plain text", () => {
  const js = read("web/results.js");
  assert.match(js, /RAW \+ "games-data\/blockx\/index\.json"/);
  assert.match(js, /games-data\/blockx\/W\$\{String\(w\)\.padStart\(3, "0"\)\}\.json/, "week files by number only");
  assert.match(js, /f && f\.v === 1 && f\.week === w && Array\.isArray\(f\.targets\)/, "a week file is used only when it is the week asked for");
  assert.match(js, /ADDR\.test\(p\[0\]\) && ADDR\.test\(p\[1\]\)/, "only well-formed picks are drawn");
  assert.match(js, /const bxPts = \(h\) => fmt\(\(Number\(h\) \|\| 0\) \/ 100, 2\);/, "points ×100, shown as on blockx.html");
  assert.match(js, /Void, no points: \$\{String\(t\.void\)\.slice\(0, 200\)\}/, "a void target says why, cut to 200 characters");
  // R-BX-23 (D-129): Sunday targets are fun rounds: labelled, and left out of the week's total.
  assert.match(js, /fun: M\.restRace\(t\.time\)/);
  assert.match(js, /const mineAll = all\.filter\(\(x\) => x\.my && !x\.fun\);/, "pts this week skips Sunday");
  assert.match(js, /x\.fun \? "Fun round · not the week"/);
  const g = JSON.parse(read("web/games.json")).games.find((x) => x.id === "blockx");
  assert.equal(g.results, true);
  assert.ok(read("web/index.html").includes("https://raw.githubusercontent.com/bawcejawn/KnodeGames2/games-data/"), "index.html may read games-data");
});

test("Last Node Standing has a Results tab that points to its page (owner's three-places rule, M-416/M-449)", () => {
  const g = JSON.parse(read("web/games.json")).games.find((x) => x.id === "lastnode");
  assert.equal(g.results, true);
  const js = read("web/results.js");
  assert.match(js, /const lastnode = \{[\s\S]*?href: "lastnode\.html", text: "Open Last Node Standing"/);
});

test("Block Golf results (M-436, M-446): its own tab, read from games-data/golf by week number only, display only", () => {
  const js = read("web/results.js");
  assert.match(js, /RAW \+ "games-data\/golf\/index\.json"/);
  assert.match(js, /games-data\/golf\/W\$\{String\(w\)\.padStart\(3, "0"\)\}\.json/, "week files by number only");
  assert.match(js, /f\.v === 1 && f\.week === w && Array\.isArray\(f\.holes\) && Array\.isArray\(f\.cards\)/, "only a well-formed week file is drawn");
  assert.match(js, /const toPar = \(n\) => \(!Number\.isFinite\(n\) \? "–" : n === 0 \? "E" : n > 0 \? `\+\$\{n\}` : `−\$\{-n\}`\);/, "to par as golf-math.js shows it");
  assert.match(js, /No scorecards this week \(a card needs two holes played\)\./);
  assert.match(js, /el\("a", \{ href: "index\.html#leaderboard\/golf", text: "Block Golf leaderboard" \}\)/);
  assert.doesNotMatch(js.slice(js.indexOf("const golf = {"), js.indexOf("const ADAPTERS")), /VHP|prize|stake|paid/i, "free to play: no prize words (D-586)");
  const g = JSON.parse(read("web/games.json")).games.find((x) => x.id === "golf");
  assert.equal(g.results, true);
  assert.equal(g.status, "live");
});
