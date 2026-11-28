// The Knode Games hub (site/games.html, games.js, games.json) and the welcome page's games list: plain data, no HTML
// from data, the same strict page rules as every other page, and every game listed on the welcome page.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const APP = process.env.APP || ".";
const read = (p) => fs.readFileSync(`${APP}/${p}`, "utf8");
const games = JSON.parse(read("web/games.json")).games;

test("games.json: known kinds and statuses, plain text, live games link to this site's own pages", () => {
  assert.ok(games.length >= 6);
  const ids = new Set();
  for (const g of games) {
    assert.match(g.id, /^[a-z0-9-]{1,24}$/); assert.ok(!ids.has(g.id), `${g.id} listed once`); ids.add(g.id);
    assert.ok(g.kinds.length && g.kinds.every((k) => k === "free" || k === "staked"), g.id);
    assert.ok(g.status === "live" || g.status === "soon" || g.status === "preview", g.id);
    if (g.opens !== undefined) assert.ok(typeof g.opens === "string" && g.opens.length <= 30, `${g.id}: opens`);
    assert.ok(g.status === "soon" ? g.href === "" : /^[a-z0-9-]+\.html(#[a-z/]+)?$/.test(g.href), `${g.id}: link`);
    assert.doesNotMatch(g.name + g.line, /[<>]/, `${g.id}: plain text`);
    if ((g.status === "live" || g.status === "preview") && g.href.includes(".html")) assert.ok(fs.existsSync(`${APP}/web/${g.href.split("#")[0]}`), `${g.id}: page exists`);
  }
  assert.deepEqual(games.filter((g) => g.status === "live").map((g) => g.id).sort(), ["blockx", "bracket", "fantasy", "golf", "lastnode", "overunder", "questions", "race", "survivor", "vs"]);
});

test("every live or preview game is in the games list rules, the Games menu, the Play menu and on the home page (the Over Under gap, 23 Nov)", async () => {
  const nav = await import(new URL(`file://${process.cwd()}/${APP}/tools/site-nav.mjs`.replace(/\/\.\//, "/")).href);
  const home = fs.readFileSync(`${APP}/web/index.html`, "utf8");
  const games_menu = nav.TOP.find((t) => t.label === "Games").items.map((i) => i[1]);
  const play = nav.MORE_GROUPS.find((g) => g[0] === "Play")[1].map((i) => i[1]);
  for (const g of games.filter((x) => x.status === "live" || x.status === "preview")) {
    assert.ok(/^[a-z0-9-]+\.html$/.test(g.href) || g.href === "#play" || g.id === "questions", `${g.id}: href the list accepts`);
    const h = g.id === "questions" ? "#play" : g.href;
    assert.ok(games_menu.includes(h), `${g.id}: in the Games drop-down`);
    assert.ok(play.includes(h), `${g.id}: in the Play list of the More sheet`);
    if (g.id !== "questions") assert.ok(home.includes(`href="${g.href}"`), `${g.id}: on the home page`);
  }
  assert.ok(games.length <= 40, "games.js shows at most 40 games");
});

test("games.js only reads and draws: no sending, no storage, no HTML from data; it checks games.json itself", () => {
  const js = read("web/games.js");
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|localStorage|sessionStorage|indexedDB|\.send\(|signTransaction/);
  assert.match(js, /function clean\(list\)/);
  assert.match(js, /\^\[a-z0-9-\]\+\\\.html/, "links limited to this site's pages");
});

test("games.html: no inline script or handler, pinned CDN scripts, and it reads only the race-data, names-data, stats-data and prize-settings branches besides the chain", () => {
  const h = read("web/games.html");
  assert.doesNotMatch(h, /<script(?![^>]*\bsrc=)[^>]*>/, "no inline script");
  assert.doesNotMatch(h, /\son[a-z]+\s*=/i, "no inline handlers");
  for (const m of h.matchAll(/<script src="https:[^"]+"([^>]*)>/g)) assert.match(m[1], /integrity="sha384-/);
  const csp = h.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  // KnodeGames2: the game-data branch host comes first (web/data-source.js, docs/DATA.md).
  assert.match(csp, /connect-src 'self' https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/game-data\/ https:\/\/koinos\.armana\.io https:\/\/api\.koinos\.io https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/race-data\/ https:\/\/koinvault\.app https:\/\/us\.i\.posthog\.com https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/names-data\/ https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/stats-data\/ https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/prize-settings\/ https:\/\/data\.knodegames\.com\/ https:\/\/live\.knodegames\.com\/live\.json;/);
  assert.match(csp, /frame-src 'none'; object-src 'none'; base-uri 'self'/);
});

test("the welcome page lists every game in games.json and links to the hub", () => {
  const h = read("web/index.html");
  const box = h.match(/<div class="welcome-also game-grid" id="welcome-games">([\s\S]*?)<\/div>\s*<div class="welcome-actions">/);
  assert.ok(box, "welcome games list");
  for (const g of games) assert.ok(box[1].includes(`<b>${g.name}</b>`), `welcome lists ${g.name}`);
  assert.match(box[1], /href="games\.html"/);
});

test("the service worker keeps the hub page and script but no game or race data", () => {
  const sw = read("web/sw.js");
  assert.match(sw, /"games\.html", "games\.js"/);
  assert.doesNotMatch(sw.match(/const SHELL = \[[^\]]*\]/)[0], /game-data|race-data|board\.json/);
});

// Owner, 10 Nov: every game card shows a Free play option, and a label from the game's free-prize switch.
test("every game card offers Free play; live cards carry a prize/practice label from the switch (never when unknown)", async () => {
  for (const g of games) assert.ok(g.kinds.includes("free"), `${g.id}: has a Free play option`);
  const js = read("web/games.js");
  assert.match(js, /KINDS = \{ free: "Free play"/);
  assert.match(js, /prize-settings\/free-prizes\.json/);
  assert.match(js, /if \(w < K\.FIRST\) return "practice"/, "before Week 1 nothing pays");
  assert.match(js, /if \(!switches\) return null/, "an unreadable switch file draws no prize promise");
  assert.match(read("web/games.html"), /<script src="weeks\.js"><\/script>\s*<script src="games\.js">/);
});

// Combo chat, 15 Nov: Combo Card is on main as a preview (cards can be built and shared, not sent until practice play opens).
test("Combo Card preview: linked from the home tile, the games list and the menus, marked Preview, never live", () => {
  const c = games.find((g) => g.id === "combo");
  assert.equal(c.status, "preview"); assert.equal(c.href, "combo.html"); assert.equal(c.opens, "Practice from Wed 25 Nov");
  assert.match(c.line, /Preview: build and share cards now; practice play from Wed 25 Nov, staking from Sun 6 Dec, 7 PM ET\.$/);
  const h = read("web/index.html");
  assert.match(h, /<a class="also-card gtile" href="combo\.html"( data-game="combo")?>[^]*?<b>Combo Card<\/b><p><span class="tile-tag">Preview<\/span>[^<]*Practice from Wed 25 Nov\./);
  assert.doesNotMatch(h, /gtile soon" aria-disabled="true"><span aria-hidden="true">🎟️/);
  const nav = read("tools/site-nav.mjs");
  assert.equal((nav.match(/\["Combo Card · Preview", "combo\.html"/g) || []).length, 2, "Play group and Games menu");
  const js = read("web/games.js");
  assert.match(js, /preview \? el\("span", \{ class: "pill preview", text: g\.opens \? `Preview · \$\{g\.opens\}` : "Preview" \}\)/);
  // PR B: the preview card sits at the end of the one list, with a "Take a look" button
  assert.match(js, /\.\.\.gameList\.filter\(\(g\) => g\.status === "preview"\)/);
  assert.match(js, /g\.status === "preview" \? "Take a look"/);
  // live-only parts never see it: pick status, prize tag, stake button
  for (const re of [/live \? el\("span", \{ class: "g-st" \}\) : null/, /live \? el\("span", \{ class: "pill prize"/, /VAULT_IDS\[g\.id\] && g\.status === "live"/, /if \(!K \|\| !id \|\| g\.status !== "live"\) return null;/]) assert.match(js, re);
});

test("Free prizes tag: shown exactly when the owner's switch is ON for this week; no amount on the card (D-794, PR B)", () => {
  const js = read("web/games.js"), html = read("web/games.html");
  assert.match(js, /b\.hidden = !\(g && prizeState\(g, now\) === "on"\)/, "drawn only when ON");
  assert.match(js, /text: "Free prizes", hidden: ""/, "hidden until the switch file says ON");
  assert.doesNotMatch(js, /VHP/, "no prize amount on the cards");
  assert.match(html, /\.pill\.prize \{ background: var\(--mint\); color: var\(--paper\); \}/);
});

test("Block X search description: the Block X chat's line (15 Nov), no stale block count or multiplier", () => {
  const b = read("web/blockx.html"), seo = read("tools/site-seo.mjs");
  const line = "A target about every hour (every 1,200 Koinos blocks). Pick the producer you think signs it; smaller producers score more. Free, with weekly VHP prizes.";
  assert.ok(seo.includes(line));
  for (const tag of ['name="description"', 'property="og:description"', 'name="twitter:description"']) assert.ok(b.includes(`<meta ${tag} content="${line}">`), tag);
  assert.ok(!b.includes("2,400 Koinos blocks"));
});

test("every menu page has the one short box at the top, from tools/page-box.json (D-730)", async () => {
  const nav = await import(new URL(`file://${process.cwd()}/${APP}/tools/site-nav.mjs`.replace(/\/\.\//, "/")).href);
  const accents = new Set(["site", "tool", "questions", "race", "blockx", "bracket", "golf", "fantasy", "lastnode", "overunder", "vs", "combo", "survivor"]);
  for (const [k, [game, text]] of Object.entries(nav.PAGE_BOX)) {
    assert.ok(accents.has(game), `${k}: known accent`);
    assert.ok(text.length >= 20 && text.length <= 200, `${k}: 1-2 short sentences`);
    assert.ok((text.match(/[.!?](\s|$)/g) || []).length <= 3, `${k}: at most three short sentences`);
    assert.doesNotMatch(text, /\b(bet|bets|odds|gambl\w*|earn\w*|returns?|guaranteed|beta)\b/i, `${k}: wording rules`);
  }
  for (const f of fs.readdirSync(`${APP}/web`).filter((x) => x.endsWith(".html"))) {
    const h = read(`web/${f}`);
    if (!/<nav class="tabs"/.test(h)) continue;
    if (f === "index.html") {
      for (const v of ["welcome", "play", "leaderboard", "results", "how"]) assert.match(h, new RegExp(`id="view-${v}"[^>]*>\\s*<aside class="page-box"`), `index ${v}: box at the top`);
    } else assert.match(h, /<main[^>]*>\s*<aside class="page-box"/, `${f}: box at the top of the page`);
    assert.match(h, /href="page-box\.css"/, `${f}: box styles`);
  }
});

test("Leaderboards and Results: the box is game-neutral, every game is listed (greyed when it has no board or results), and the tabs follow the game", () => {
  const box = JSON.parse(read("tools/page-box.json"));
  assert.match(box["index.html#leaderboard"][1], /^Every game has its own board\. Pick a game below\.$/);
  for (const f of ["web/leaders.js", "web/results.js"]) {
    const js = read(f);
    assert.match(js, /g\.status === "live" \|\| g\.status === "preview"/, `${f}: every live or preview game is listed`);
    assert.match(js, /class: [^}]*"soon"/, `${f}: a game with nothing yet is greyed, not hidden`);
    assert.match(js, /first\.textContent = q \? "Questions" : "Play"/, `${f}: the first tab follows the game`);
    assert.match(js, /nav\.setAttribute\("aria-label", g\.name\)/, `${f}: the tabs' label follows the game`);
  }
  assert.match(read("web/stake-page.js"), /Only games that take a stake are listed here\. New games appear once they open for staking\. Free-play games don't need a stake\./);
  // Play link: only a same-site page address ever reaches href (Repo Lens 4, I-1)
  for (const f of ["web/leaders.js", "web/results.js"]) assert.match(read(f), /\^\[a-z0-9-\]\+\\\.html\(#\[a-z0-9-\]\+\)\?\$\/\.test\(g\.href/, `${f}: the Play link only takes a *.html address`);
});

test("the All games \"Staked\" tag follows the vault's list_games, the same list as the Stake page (D-768)", () => {
  const js = read("web/games.js"), panel = read("web/stake-panel.js"), page = read("web/stake-page.js");
  assert.match(js, /K\.stakeable\(\)/, "games.js asks the vault");
  assert.match(js, /data-staked-pill/, "each Staked tag can be taken away or added");
  assert.match(panel, /async function stakeable\(\)[\s\S]{0,400}g\.staked && \(g\.active \|\| big\(g\.stake\) > 0n\)/, "the same filter as the Stake page");
  assert.match(panel, /window\.KStake = \{[^}]*stakeable/, "stake-panel.js offers it");
  // read only: no send in that path
  assert.doesNotMatch(panel.match(/async function stakeable\(\)[\s\S]*?\n  }/)[0], /send|sign/i);
  assert.doesNotMatch(page + panel, /VHP per 100/, "no per-100 wording on the stake pages");
  // games.json's kinds still drive the Rules text
  assert.ok(games.every((g) => Array.isArray(g.kinds)));
});

test("Leaderboards and Results: the game chips wrap to rows (hub-ui.css), and the picker keeps one button per game with the game's name", () => {
  const css = read("web/hub-ui.css");
  assert.match(css, /\.lb-games \{ flex-wrap: wrap; overflow: visible; row-gap: 8px; \}/);
  assert.match(css, /\.lb-games button \{ flex: 0 1 auto; max-width: 100%; min-height: 44px; white-space: normal; text-align: center; \}/);
  const home = read("web/index.html");
  assert.match(home, /class="lb-games" role="group" aria-label="Game" id="lb-games"/);
  assert.match(home, /class="lb-games res-games" role="group" aria-label="Game" id="res-games"/);
});

test("the Leaderboards picker has Knode Games VS and More or Fewer, with their 'soon' lines until data exists", () => {
  const vs = games.find((g) => g.id === "vs"), ou = games.find((g) => g.id === "overunder");
  assert.equal(vs.board.data, "games-data/vs/board.json");
  assert.equal(vs.board.soon, "Producer lists from Mon 30 Nov (picks open Fri 27, 7 PM ET).");
  assert.equal(ou.board.soon, "First results Mon 30 Nov.");
  assert.match(read("web/leaders.js"), /cfg\.soon \|\| "Couldn't load this leaderboard/);
  assert.match(read("web/leaders.js"), /soon: typeof b\.soon === "string" && b\.soon\.length <= 100 \? b\.soon : "",/);
});

// Owner, 25 Nov 2026 (M-824/M-825/M-826): Daily Questions is paid and shares rewards exactly like every other staked game.
// One shared payout section on the Rules view (Vault's Card 3 words, verbatim), nothing about "Daily Questions' part".
test("Rules: one shared payout section for every game, Vault's exact Card 3 text, and no Questions-first payout wording", () => {
  const home = read("web/index.html");
  const card3 = "Each week the vault's block rewards go to the players. A flat 5% fee is taken first. Then the free prizes are paid: in each game with a free prize, 2 VHP to the best free player and 1 VHP to the second. The rest is split across the staked games by each game's share of the VHP staked that week. Inside each game, the top 30% of staked players with at least 1 point share that game's part: 40% by place and stake counted up to 10 VHP, 60% by place and full stake. The bot closes the week. Each game's results are posted by Thursday 00:00 UTC (Wednesday 7 PM ET) and are final 24 hours after they're posted. If a game has no staked winners, its part carries into that game's next week. The free prizes are still paid to its free players.";
  assert.equal(home.split(card3).length - 1, 2, "the same paragraph in the shared section and in the Questions Good to know box");
  assert.match(home, /<div class="rules-shared" id="rewards-all">[\s\S]*<h3>Play free, or stake VHP<\/h3>[\s\S]*<h3>Pick in any game<\/h3>[\s\S]*<h3>The week closes<\/h3>[\s\S]*<h3>Collect your reward<\/h3>/);
  assert.match(home, /In games that pay a free prize, the 2 best free players each week win 2 VHP and 1 VHP/);
  assert.match(home, /In a thin week the free prizes can be smaller\. An unused free prize goes back into next week's rewards\./);
  for (const bad of [/Daily Questions' part/, /Daily Questions' share/, /works like every vault game/, /From Week 4 \(the week of 16 November\) Daily Questions/, /Reward split since the week of Monday 2 November/, /24 hours later/]) assert.doesNotMatch(home, bad, String(bad));
  assert.doesNotMatch(read("web/app.js"), /Daily Questions' share/);
  assert.doesNotMatch(read("web/stake.html"), /Daily Questions' own stake buttons/);
  assert.doesNotMatch(read("web/start.html"), /Then answer the daily questions/);
  assert.doesNotMatch(read("web/get.html"), /then answer each day's questions/);
  // the Questions tab keeps its own scoring and links to the shared section
  const q = home.slice(home.indexOf('id="rp-game"'), home.indexOf('id="rp-race"'));
  assert.match(q, /48 questions|8 a day, 48 a week/); assert.match(q, /48 is the top score/); assert.match(q, /href="#rewards-all"/);
  assert.match(q, /Rewards from weeks before 16 November are collected on this page/);
  assert.ok(q.includes("To share this game's weekly rewards, answer at least 2 questions that week (a voided question doesn't count)."), "Vault's 2-question sentence, word for word");
  for (const bad of [/\b(earn|earnings|returns?|APY|guaranteed|bet|odds)\b/i]) assert.doesNotMatch(card3, bad);
});

// M-831: Race's "Send my N picks" button was born disabled: its element helper wrote disabled="undefined" for an empty
// attribute. The helper must skip empty attributes (as Block X's does), and the only empty attribute is that one.
test("race.js: the element helper skips empty attributes, so the Send my picks button is not disabled", () => {
  const src = read("web/race.js");
  assert.match(src, /for \(const \[k, v\] of Object\.entries\(attrs\)\) \{ if \(v == null\) continue;/);
  assert.match(src, /disabled: sending \|\| undefined, onclick: sendDrafts/);
});

// M-843 item 2: a KOIN Vault send shows KOIN Vault's real error text, not the "free Mana may be used up" guess (which only
// fits the Knode sponsor, and a KOIN Vault send never uses it).
test("friendlyError (app.js, swap.js): a KOIN Vault wallet gets the real error text, before the Mana rewording", () => {
  for (const f of ["web/app.js", "web/swap.js"]) {
    const src = read(f);
    const i = src.indexOf("function friendlyError(");
    assert.ok(i > 0, f);
    const body = src.slice(i, src.indexOf("\n  }\n", i));
    const vault = body.indexOf('window.KWallet.kind === "vault") return `KOIN Vault says: ${text.slice(0, 240)}`;');
    const mana = body.indexOf("not enough Mana.");
    assert.ok(vault > 0 && mana > vault, `${f}: the KOIN Vault line comes first`);
    // The shown text is the cleaned text (the quoted part when there is one) behind the "KOIN Vault says: " prefix.
    const fn = new Function("window", body.replace("function friendlyError(", "return function friendlyError(") + "\n}");
    const fe = fn({ KWallet: { kind: "vault" } });
    assert.equal(fe('x "needs 100 available mana for its maximum limit" y'), "KOIN Vault says: needs 100 available mana for its maximum limit");
    assert.equal(fe("plain text"), "KOIN Vault says: plain text");
    assert.ok(fe("a".repeat(500)).length <= "KOIN Vault says: ".length + 240);
    const other = fn({ KWallet: { kind: "kondor" } });
    assert.ok(!other("plain text").startsWith("KOIN Vault says"));
  }
});

// M-836 (Repo Lens 4 follow-up to #166): the Producer page's element helper must also skip empty attributes, or a
// disabled/hidden attribute passed as undefined would be written as the text "undefined" and switch the control off.
test("node-page.js: the element helper skips empty attributes", () => {
  assert.match(read("web/node-page.js"), /for \(const \[k, v\] of Object\.entries\(attrs\)\) \{ if \(v == null\) continue; e\.setAttribute\(k, v\); \}/);
});
