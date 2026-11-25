// Block Golf page (golf.html, golf.js, golf.css): the same strict page rules as every game page, nothing built
// from HTML, read-only (no transaction, no storage), and every element the script draws into exists. Offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const APP = process.env.APP || ".";
const read = (f) => {
  const direct = `${APP}/${f}`;
  const nested = `${APP}/web/${f}`;
  return fs.readFileSync(fs.existsSync(direct) ? direct : nested, "utf8");
};
const html = read("web/golf.html"), js = read("web/golf.js");
const csp = (h) => (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(h) || [])[1];

test("the same Content-Security-Policy as the other game pages; no inline scripts or handlers", () => {
  assert.equal(csp(html), csp(read("web/blockx.html")));
  assert.doesNotMatch(html, /<script>(?!\s*<\/script>)|<script(?![^>]*\bsrc=)[^>]*>/i, "no inline script");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "no inline handlers");
  for (const m of html.matchAll(/<script src="https:[^"]+"[^>]*>/g)) assert.match(m[0], /integrity="sha384-[^"]+" crossorigin="anonymous"/, "CDN scripts pinned");
});

test("scripts load in order: wallet first, names and the stake panel, the shared rules, the board, the page, analytics", () => {
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !s.startsWith("https:"));
  assert.deepEqual(srcs, ["data-source.js", "guest.js", "wallet.js", "header-wallet.js", "nav.js", "names.js", "stake-panel.js", "weeks.js", "golf-math.js", "board.js", "golf.js", "vendor/posthog-1.438.13.js", "analytics.js"]);
  assert.match(html, /<link rel="stylesheet" href="board\.css">\s*<link rel="stylesheet" href="golf\.css">/);
});

test("golf.js builds nothing from HTML, sends nothing and stores nothing", () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(js, /\.send\(|signTransaction|method:\s*"POST"/);
  assert.match(js, /const DATA = "https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/games-data\/golf\/"/);
  assert.ok(csp(html).includes("https://raw.githubusercontent.com/bawcejawn/KnodeGames2/games-data/"), "the page may read games-data");
});

test("every element the script uses exists once in the page", () => {
  const ids = new Set([...js.matchAll(/\$\("([a-z0-9-]+)"\)/g)].map((m) => m[1]));
  assert.ok(ids.size > 10);
  for (const id of ids) assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id);
});

test("game links come only from games.json pages on this site", () => {
  assert.match(js, /\/\^\[a-z0-9-\]\+\\\.html\(#\[a-z0-9\/-\]\*\)\?\$\/\.test\(g\.href\)/);
});

test("the page's stroke key matches the shared rules", () => {
  const box = { window: {} };
  vm.runInNewContext(read("web/golf-math.js"), box);
  const G = box.window.KGolf;
  assert.equal(JSON.stringify(G.BANDS.map((b) => b[0])), "[5,25,65,90,100]");
  for (const pct of [5, 25, 65, 90]) assert.ok(html.includes(`Top ${pct}%`) || js.includes(`Top ${pct}%`), `${pct}% in the key`);
  // D-586: Block Golf is free to play: everyone who scored is in the field, one place per wallet, 3 make a hole.
  assert.match(html, /Everyone who scored on that game that week, one place per wallet/);
  assert.match(html, /A hole needs at least 3 players who scored/);
  assert.equal(G.PRACTICE_MIN_FIELD, 3);
  assert.doesNotMatch(html + js, /at least 1 VHP\)|hold at least 1 VHP or stake in Knode Games/, "Repo Lens G-6: Golf's own staking rule");
  assert.doesNotMatch(html, /counted by the VHP they have staked|Block Golf stakers|Two boards|Staked board/, "no staked rules on the page");
  assert.match(html, /Block Golf is free to play\.<\/b> No staking and no prizes/);
  assert.match(html, /<b>One board\.<\/b> Everyone plays on the same board/);
});

test("games.json: Block Golf is live, with its page and its leaderboard on games-data; the menus link it", () => {
  const g = JSON.parse(read("web/games.json")).games.find((x) => x.id === "golf");
  assert.equal(g.status, "live");
  assert.equal(g.href, "golf.html");
  assert.ok(g.line.length <= 200);
  for (const p of ["golf.html", "blockx.html", "index.html", "games.html"]) assert.match(read(p), /href="golf\.html"/, `${p} links Block Golf`);
  assert.equal(g.board.data, "games-data/golf/board.json");
  assert.deepEqual(g.board.columns.map((c) => c.key), ["pts", "topar", "holes", "lost"]);
});

test("standards every game page meets: nicknames (D-078), stake badge and panel for game 6 (D-031), the Sunday line (D-125)", () => {
  assert.match(js, /window\.KNames\.of\(a\)/, "names through names.js");
  // GAME-PAGE-STANDARD (M-607): the board moved to the Leaderboards page (it shows nicknames there); the leader's card
  // line here still names the wallet through names.js.
  assert.match(js, /nameOf\(card\.a\)/, "the leader's card line shows a nickname");
  assert.doesNotMatch(js + html, /KBoard\.create|id="gf-board"|id="board-box"/, "no copy of the board on the game page");
  assert.match(html, /<a href="index\.html#leaderboard\/golf">Leaderboard<\/a>/);
  assert.match(js, /const GAME_ID = 6;/);
  // D-586: no stake badge (nothing invites staking); the panel only for a wallet that still has stake in Block Golf.
  assert.doesNotMatch(js + html, /KStake\.badge|stake-badge/);
  assert.match(js, /KStake\.status\(GAME_ID, who\); if \(!mounted && st && st\.amount > 0n\) \{ mounted = true; window\.KStake\.mount\(\$\("golf-stake"\), \{ game: GAME_ID \}\)/);
  assert.match(html, /<section class="gf-card" id="golf-stake" hidden>/);
  assert.match(html, /Sunday is review day: results are checked and paid from Monday\./);
  assert.doesNotMatch(html + js, /bawcejawn\.github\.io\/Knode|\/Knode\/|final 12 hours/, "no old repo address or 12-hour final");
});

test("week labels: Golf names weeks as players see them (D-063: vault week 4 is Week 4)", () => {
  assert.doesNotMatch(js, /wf\.week \+ 1/, "never vault week + 1");
  assert.match(js, /window\.KWeeks\.label\(w\)/);
  assert.match(js, /G\.shareText\(card, weekLabel\(wf\.week\)\)/);
  // B13-B5: the card line itself names the week through weekLabel, and no other `Week ${…}` is built on the page
  assert.match(js, /\$\("card-sub"\)\.textContent = `\$\{weekLabel\(wf\.week\)\}, from /);
  assert.deepEqual(js.match(/`Week \$\{[^}]*\}/g), ["`Week ${w}"], "only weekLabel's own fallback");
  const box = { window: {} }; box.globalThis = box.window;
  new Function("window", "globalThis", fs.readFileSync(`${APP}/web/weeks.js`, "utf8"))(box.window, box.window);
  assert.equal(box.window.KWeeks.label(4), "Week 4");   // owner, 9 Nov: Week 4 = Mon 16 (vault week 4)
});

test("npm run golf exists (golf.yml runs it every hour)", () => {
  assert.equal(JSON.parse(read("package.json")).scripts.golf, "tsx bot/games/golf.ts");
  assert.match(read(".github/workflows/golf.yml"), /run: npm run golf\n/);
});

test("the Clubhouse: the page's ladder text matches the shared rules, and it reads clubhouse.json", () => {
  const box = { window: {} };
  vm.runInNewContext(read("web/golf-math.js"), box);
  const G = box.window.KGolf;
  assert.deepEqual([...G.CLUB_LADDER], [7, 6, 5, 4, 4, 3, 3, 2, 2, 1]);
  assert.match(html, /0 = lost ball, 1 = double bogey, 2 = bogey, 3 or 4 = par, 5 or 6 = birdie, 7 or 8 = eagle, 9 or more = hole in one/);
  assert.match(html, /earned once, the first week it's seen, and kept for good/);
  assert.match(js, /fetchJson\(DATA \+ "clubhouse\.json"\)/);
  assert.match(js, /href: "#clubhouse"/);
  for (const f of Object.keys(G.CLUB_FEATURES)) assert.ok(G.isFeature(f), f);
  assert.equal(G.featureName("play-race", "Producer Race"), "Played Producer Race");
});

test("GAME-PAGE-STANDARD (M-607): box first, the scorecard open, then one links row and two closed rows, nothing else open", () => {
  const main = html.slice(html.indexOf('<main class="gf">'), html.indexOf("</main>"));
  assert.match(main, /^<main class="gf">\s*<aside class="page-box" data-game="golf">/, "the shared box is first in <main>");
  assert.match(main, /<h1>Block Golf<\/h1>\s*<p class="gf-links"><a href="#rules" id="rules-link">Rules<\/a> · <a href="index\.html#leaderboard\/golf">Leaderboard<\/a> · <a href="ruler\.html">Ruler<\/a><\/p>/);
  assert.doesNotMatch(main, /gf-kicker|gf-lede|id="practice"|id="how"/, "no second intro, no note box, no old How it works");
  const folds = [...main.matchAll(/<details([^>]*)>/g)].map((m) => m[1]);
  assert.deepEqual(folds, [' class="fold" id="curious"', ' class="fold gf-how" id="rules"'], "exactly two fold-outs, closed on load (no open attribute)");
  // After the scorecard: only the hidden stake panel, the links row and the two fold-outs (Holes + Clubhouse inside "curious").
  const after = main.slice(main.indexOf('id="card-box"'));
  const top = after.slice(after.indexOf("</section>") + 10).replace(/<details[\s\S]*?<\/details>/g, "");
  assert.deepEqual([...top.matchAll(/<section[^>]*>/g)].map((m) => m[0]), ['<section class="gf-card" id="golf-stake" hidden>'], "no open section after the play area");
  const curious = main.slice(main.indexOf('id="curious"'), main.indexOf("</details>", main.indexOf('id="curious"')));
  assert.match(curious, /id="todo-box"/); assert.match(curious, /id="clubhouse"/);
  const rules = main.slice(main.indexOf('id="rules"'));
  for (const s of [/Block Golf is free to play\.<\/b> No staking and no prizes/, /Points = 7 for each counted hole, minus your strokes/, /Sunday is review day/]) assert.match(rules, s);
  assert.match(js, /a link to something inside a closed fold-out \(Rules, the Clubhouse\) opens that row/);
});
