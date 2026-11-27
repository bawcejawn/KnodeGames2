// Seed Sponsor page (web/seed-sponsor.html + seed-sponsor.js + seed-sponsor-math.js), PR A and PR B.
// The owner's spec: claude/library/SEED-SPONSOR-OUTLINE-AND-START-2026-11-25.md and the owner's answers of Wed 25 Nov
// (M-817). This first version only reads the chain: the Donate and Support buttons stay "coming soon" until the vault
// upgrade is live. Offline: runs the math in a sandbox with no page, and reads the files.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");
const html = read("web/seed-sponsor.html");
const pageJs = read("web/seed-sponsor.js");
const mathJs = read("web/seed-sponsor-math.js");
const configJs = read("web/js/lib/config.js");

/** Load config.js and the math into one sandbox, as the page does. `edit` changes config.js's text first. */
function load(edit = (s) => s) {
  const box = { window: {} };
  vm.runInNewContext(edit(configJs), box);
  vm.runInNewContext(mathJs, box);
  return box.window;
}
const W = load();
const S = W.KSeedSponsor;
// The sandbox has its own Object and Array, so results are copied into this realm before deep comparison.
const here = (x) => structuredClone(x);
const UNIT = 100000000n;
const V = (n) => BigInt(n) * UNIT;

// ── the minimum (PR B): one setting, every deposit ──
test("the minimum is 1,000 VHP, read from the one setting in js/lib/config.js", () => {
  assert.equal(W.KG.seedSponsor.minVhp, 1000);
  assert.equal(S.minVhp(W.KG), 1000);
});

test("changing the one setting changes the minimum everywhere it is checked", () => {
  const w = load((s) => s.replace(/minVhp:\s*1000\b/, "minVhp: 2500"));
  const s = w.KSeedSponsor;
  assert.equal(s.minVhp(w.KG), 2500);
  assert.equal(s.checkAmount("2499", s.minVhp(w.KG)).ok, false);
  assert.equal(s.checkAmount("2500", s.minVhp(w.KG)).ok, true);
});

test("a broken or missing setting falls back to 1,000, never to 0", () => {
  for (const bad of [undefined, null, 0, -5, 1.5, "abc", NaN, Infinity]) {
    assert.equal(S.minVhp({ seedSponsor: { minVhp: bad } }), 1000, String(bad));
  }
  assert.equal(S.minVhp({}), 1000);
  assert.equal(S.minVhp(undefined), 1000);
});

test("once the vault holds its own minimum, the chain's value wins over the page setting", () => {
  assert.equal(S.minVhp(W.KG, String(V(1500))), 1500);
  assert.equal(S.minVhp(W.KG, "0"), 1000);          // a zero or unreadable chain value is ignored
  assert.equal(S.minVhp(W.KG, "junk"), 1000);
});

test("every deposit and donation must be at least the minimum, top-ups included; whole VHP only", () => {
  const min = 1000;
  assert.deepEqual(here(S.checkAmount("1000", min)), { ok: true, units: V(1000) });
  assert.deepEqual(here(S.checkAmount("1,000", min)), { ok: true, units: V(1000) });
  assert.equal(S.checkAmount(" 25000 ", min).units, V(25000));
  assert.equal(S.checkAmount("999", min).ok, false);
  assert.match(S.checkAmount("999", min).reason, /at least 1,000 VHP/);
  assert.equal(S.checkAmount("200", min).ok, false);  // a top-up below the minimum is refused too
  for (const bad of ["", "abc", "1000.5", "-1000", "1e4", "0x3e8", "1,00,0"]) assert.equal(S.checkAmount(bad, min).ok, false, bad);
  assert.equal(S.checkAmount("123456789012345678901234", min).ok, false);   // beyond what the chain can hold
});

// ── nicknames ──
test("nicknames: 3 to 20 letters, digits, spaces, - and _; spaces trimmed and squeezed", () => {
  assert.deepEqual(here(S.checkNickname("  Node   Fan_1 ")), { ok: true, name: "Node Fan_1" });
  assert.equal(S.checkNickname("ab").ok, false);
  assert.equal(S.checkNickname("a".repeat(21)).ok, false);
  assert.equal(S.checkNickname("a".repeat(20)).ok, true);
  for (const bad of ["<script>", "hi!", "né", "a​b​c", "line\nbreak", "@name", "   "]) assert.equal(S.checkNickname(bad).ok, false, JSON.stringify(bad));
});

// ── the sponsor list ──
test("the list (owner, 8:11 PM: hidden names are Anonymous Donor / Anonymous Sponsor): opt-out hides a sponsor, a support name goes at 0, a donation name stays, amounts only when ticked", () => {
  const rows = here(S.listRows([
    { kind: "donation", units: String(V(5000)), nickname: "Big Giver", showAmount: true },
    { kind: "donation", units: String(V(1000)), nickname: "Quiet One", showAmount: false },
    { kind: "donation", units: String(V(3000)), nickname: "" },                       // opted out
    { kind: "support", units: String(V(2000)), nickname: "Helper", showAmount: true },
    { kind: "support", units: "0", nickname: "Gone", showAmount: true },              // withdrew everything
    { kind: "support", units: String(V(1200)), nickname: "Rude Word", hidden: true, showAmount: true },
    { kind: "donation", units: String(V(1100)), nickname: "Rude Too", hidden: true, showAmount: false },
  ]));
  assert.deepEqual(rows.donors.map((r) => [r.name, r.amount]), [["Big Giver", "5,000 VHP"], ["Anonymous Donor", null], ["Quiet One", null]]);
  assert.deepEqual(rows.supporters.map((r) => [r.name, r.amount]), [["Helper", "2,000 VHP"], ["Anonymous Sponsor", "1,200 VHP"]]);
});

test("the list never shows a wallet address, even if one is passed in by mistake", () => {
  const rows = S.listRows([{ kind: "support", units: String(V(1000)), nickname: "x", owner: "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr", showAmount: true },
    { kind: "donation", units: String(V(1000)), nickname: "1Mpmf2ERhjYpX7CCiM11WE", showAmount: true }]);
  const text = JSON.stringify(rows);
  assert.doesNotMatch(text, /1[1-9A-HJ-NP-Za-km-z]{20,}/);
});

test("the seed total is read from the vault's totals and shown in whole VHP", () => {
  assert.equal(S.seedTotal({ totals: { seed_vhp: String(V(21050)) } }), V(21050));
  assert.equal(S.seedTotal({ totals: { seed_vhp: String(V(21050)), support_vhp: String(V(3000)) } }), V(24050));
  assert.equal(S.seedTotal({}), null);
  assert.equal(S.fmtVhp(V(21050)), "21,050 VHP");
  assert.equal(S.fmtVhp(V(21050) + 60000000n), "21,050 VHP");   // whole VHP on the page
});

// ── words, names and addresses on the page ──
const visible = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
const strings = (js) => [...js.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]).join("\n");
const pageText = visible(html) + "\n" + strings(pageJs) + "\n" + strings(mathJs);

test("owner's wording rules: none of the banned words anywhere on the page", () => {
  const banned = /\b(earn\w*|returns?|APY|APR|yield\w*|interest|guarantee\w*|bets?|betting|odds|lines?|get rich|profit\w*|invest\w*)\b/i;
  const hits = pageText.split("\n").filter((l) => banned.test(l));
  assert.deepEqual(hits, []);
  assert.match(visible(html), /support/i);
});

test("no wallet address on the page or in its scripts (the vault's address comes from deployment.json)", () => {
  const addr = /\b1[1-9A-HJ-NP-Za-km-z]{25,34}\b/;
  for (const [f, s] of [["seed-sponsor.html", html], ["seed-sponsor.js", pageJs], ["seed-sponsor-math.js", mathJs]]) assert.doesNotMatch(s, addr, f);
});

test("always 'Seed Sponsor', never a bare 'Sponsor' (that is the Mana sponsor)", () => {
  // A word "sponsor" on its own (not part of a name like min_sponsor_vhp or seedSponsor) must follow "Seed". The one
  // exception is the owner's own label for a hidden support name, "Anonymous Sponsor" (owner, 25 Nov, 8:11 PM ET).
  const bare = [...(html + "\n" + pageJs + "\n" + mathJs).matchAll(/(?<!seed[\s-])(?<!Anonymous )\bsponsors?\b/gi)].map((m) => m.index);
  assert.deepEqual(bare, []);
  assert.match(html, /<h1[^>]*>Seed Sponsors?<\/h1>/);
});

test("the two kinds are unmissable: Donate (cannot be withdrawn) and Support (withdraw any time)", () => {
  const t = visible(html).replace(/\s+/g, " ");
  assert.match(t, /Donate \(cannot be withdrawn\)/);
  assert.match(t, /Support \(withdraw any time\)/);
});

test("the page warns: gifts only through the page's button, never by sending VHP to the vault address", () => {
  const t = visible(html).replace(/\s+/g, " ");
  assert.match(t, /only through the button on this page/i);
  assert.match(t, /never send VHP straight to the vault address/i);
});

test("the page says the VHP never plays and wins nothing; its rewards pay free prizes first, then the stakers (Vault plan (c))", () => {
  const t = visible(html).replace(/\s+/g, " ");
  assert.match(t, /never staked in a game/i);
  assert.match(t, /cannot win prizes/i);
  // Repo Lens 3 #R3-45: the 5% fee is named.
  assert.match(t, /Its rewards, after a 5% fee, pay the weekly free prizes first; the rest is shared by the players who stake\. You get none of them\./);
  assert.doesNotMatch(t, /go to the platform/i);
});

test("the Donate box says, in the owner's exact words, that a donation is the platform's and can be moved out (M-820)", () => {
  const t = visible(html).replace(/\s+/g, " ");
  assert.ok(t.includes("A donation becomes part of the Knode Games seed, owned by the platform. It can be used for the platform, including moving it out of the vault, and you can't take it back."));
  const give = html.slice(html.indexOf('class="card ss-kind give"'), html.indexOf('class="card ss-kind keep"'));
  assert.match(give, /moving it out of the vault/);
});

test("the Support box says only the Seed Sponsor can withdraw it, any amount, any time, never the owner (M-820)", () => {
  const keep = visible(html.slice(html.indexOf('class="card ss-kind keep"'), html.indexOf("</section>", html.indexOf('class="card ss-kind keep"')))).replace(/\s+/g, " ");
  assert.match(keep, /Only you can withdraw your support: any amount, any time\./);
  // Repo Lens 3 #R3-45: the promise is the vault's rule (owner M-820; built in vault v6.2).
  assert.match(keep, /Under the vault's rules, no other wallet can move it, not even the platform owner's\./);
});

test("the list says amounts are always public on the chain, whatever the tick (Vault plan, point 2)", () => {
  assert.match(visible(html).replace(/\s+/g, " "), /Amounts are always public on the chain\./);
});

test("the page reads the vault's own minimum by its field name once the upgrade is live (Vault plan (g))", () => {
  assert.match(pageJs, /result\.config\.min_sponsor_vhp/);
});

test("a vault answer without totals shows '–', not an empty box (Repo Lens 4 R4-76 L-1)", () => {
  assert.match(pageJs, /if \(total === null\) throw new Error\("no totals"\);/);
  assert.match(pageJs, /\$\("ss-total"\)\.textContent = "–";/);
});

test("the green 'Still yours' tag reads at 4.5:1 or better in light mode (Repo Lens 3 #R3-45)", () => {
  assert.match(html, /\.keep \.ss-tag \{ background: var\(--mint-soft\); color: var\(--mint\); \}/);
});

// ── read-only until the vault upgrade ──
test("this version only reads: no signing, no sending, the buttons say coming soon and are disabled", () => {
  for (const s of [pageJs, mathJs]) assert.doesNotMatch(s, /\b(signer|getSigner|signTransaction|sendTransaction|kondor|wallet\.(send|sign)|\.transfer\(|deposit_to|seed_deposit|withdraw_from)\b/);
  const buttons = [...html.matchAll(/<button\b[^>]*class="[^"]*ss-go[^"]*"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
  assert.equal(buttons.length, 2);
  for (const b of buttons) { assert.match(b, /\bdisabled\b/); assert.match(b, /coming soon/i); }
});

test("phone first: viewport tag, no fixed widths above 320 px, and the two boxes stack on a narrow screen", () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  const fixed = [...css.matchAll(/(?<!max-)(?<!min-)width:\s*(\d+)px/g)].map((m) => +m[1]).filter((n) => n > 320);
  assert.deepEqual(fixed, []);
  assert.match(css, /\.ss-kinds\s*\{[^}]*grid-template-columns:\s*1fr\s*;/);              // one column by default (phones)
  assert.match(css, /@media \(min-width: 6\d\dpx\)\s*\{\s*\.ss-kinds\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
});

test("the page and its scripts are listed for the site (search tags and the assembled site)", () => {
  assert.match(read("tools/site-seo.mjs"), /file: "seed-sponsor\.html"/);
  assert.match(html, /<script src="js\/lib\/config\.js"><\/script>\s*<script src="seed-sponsor-math\.js"><\/script>\s*<script src="seed-sponsor\.js"><\/script>/);
});
