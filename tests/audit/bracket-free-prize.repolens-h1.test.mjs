// Repo Lens #H-1 (PR #330 kg-09-bracket-followup @ 55e03cab), H1-1 (Low). Place in tests/audit/. Fails at 55e03cab.
// The Bracket page mounts the shared stake panel with a constant { freePrize: true }, so the panel's line (stake-panel.js
// explain) says "free players play for the 2 + 1 VHP prize" in every week, including Week 1 (vault week 4), the practice
// week, where the switch is off and nothing is paid, and on the same page as the practice notice that says no VHP is paid.
// Fix (candidate-fix-h1-1.diff): mount the panel after index.json is read, with freePrize on only from prizesFromWeek.
// Run from the repository root: TZ=UTC node --import tsx --test tests/audit/bracket-free-prize.repolens-h1.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const read = (f) => {
  const direct = path.join(APP, f);
  const nested = path.join(APP, "web", f);
  return fs.readFileSync(fs.existsSync(direct) ? direct : nested, "utf8");
};
await import(path.resolve(APP, "web/vhp-standard.js")); await import(path.resolve(APP, "web/bracket-math.js"));
const BM = globalThis.KBracketMath;
const windows = [];
after(() => { for (const w of windows) w.close(); });
const flush = async (w, n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => w.setTimeout(r, 0)); };

// stake-panel.js's own explain(), as repolens-g4.test.mjs extracts it
const explain = (() => {
  const src = read("web/stake-panel.js"), a = src.indexOf("function explain("), b = src.indexOf("\n  }\n", a);
  return new Function("exact", "UNIT", `${src.slice(a, b + 4)}; return explain;`)((x) => String(x), 100000000n);
})();
const GAME9 = { staked: true, free_prize: true, season_weeks: 1 };   // game-add 9 … --free (the vault's record)

// Game page standard (GAME-PAGE-STANDARD.md, Bracket row): the Bracket page has no stake panel any more, only a stake line
// to the Stake page. So the risk H1-1 guarded (the panel promising the 2 + 1 VHP prize in a practice week) can't come back
// through this page: no panel is mounted in any week, and the only free-prize sentence is the Rules row's, "from Week 5".
/** The page at `now`, index.json saying prizes start at `prizesFromWeek`; returns every stake-panel mount. */
async function mounts(now, prizesFromWeek) {
  const dom = new JSDOM(read("web/bracket.html"), { runScripts: "outside-only", url: "https://knodegames.com/bracket.html" });
  const w = dom.window; windows.push(w);
  w.Date.now = () => now;
  w.fetch = async (u) => {
    const s = String(u), json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (s.endsWith("bracket/index.json")) return json({ v: 1, updated: "2026-11-15T03:00:00.000Z", weeks: [4], game: 9, prizesFromWeek });
    return { ok: false, status: 404, json: async () => null };
  };
  w.koilib = { Provider: class { async getHeadInfo() { return { head_block_time: String(now) }; } }, Contract: class { constructor() { this.functions = {}; } } };
  w.KWallet = { address: null, kind: null, label: () => "", init() {}, subscribe() {}, async send() { throw new Error("no"); } };
  const out = [];
  w.KStake = { badge: () => out.push("badge"), mount: (root, opts) => { out.push({ ...opts }); return {}; } };
  for (const f of ["web/vhp-standard.js", "web/bracket-math.js", "web/bracket.js"]) w.eval(read(f));
  await flush(w);
  return { out, doc: w.document };
}

test("H1-1 (Low), standard page: in Week 1 (vault week 4, practice) no stake panel or badge is shown, so nothing promises a free prize", async () => {
  const { out, doc } = await mounts(BM.seedTime(4) + 3 * 3600000, 5);   // Sun 15 Nov, the week of Mon 16 Nov on show
  assert.deepEqual(out, [], "no stake panel or badge on the Bracket page");
  assert.equal(doc.getElementById("bracket-stake"), null);
  assert.doesNotMatch(doc.querySelector("main").textContent.replace(doc.getElementById("rules").textContent, ""), /2 \+ 1 VHP|free players play for|win 2 and 1 VHP/, "no prize words outside the Rules row");
  // the explain() line itself still keeps the prize off when told so (stake.html uses it)
  assert.doesNotMatch(explain(GAME9, 100000000n, { game: 9, freePrize: false }), /2 \+ 1 VHP|free players play for/);
});

test("H1-1, standard page: from Week 2 (vault week 5) the free prize is named in the closed Rules row, from Week 5, and staking is one line to the Stake page", async () => {
  const { out, doc } = await mounts(BM.seedTime(5) + 3 * 3600000, 5);
  assert.deepEqual(out, []);
  assert.match(doc.getElementById("rules").textContent, /On the Free play board, 1st and 2nd at the end of the week win 2 and 1 VHP, from Week 5/);
  const stake = doc.querySelector('main a[href="stake.html#g9"]');
  assert.ok(stake, "one stake line to the Stake page, game 9");
  assert.match(stake.textContent, /^Stake in Producer Bracket/);
});
