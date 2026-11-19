// Over/Under page: how it sends (RL-5 #R5-1: R5-2, R5-3, R5-4, R5-5, R5-6, R5-7). The page's own logic needs a browser, so
// these tests read the page and also drive the shared card (web/js/lib/send-picks.js) with the items the page builds.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as F from "../math.js";
import * as SP from "../../../web/js/lib/send-picks.js";
import { checkSendPicks, sendPicksProblems } from "../../../tools/game-check.mjs";

const read = (p) => fs.readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const js = read("web/overunder.js"), html = read("web/overunder.html");
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

// ── R5-2: the shared card sends, a change is never sponsored ──
test("the page sends picks only through the shared Send my picks card (D-255, D-278), never through the wallet itself", () => {
  assert.match(js, /import \* as SP from "\.\/js\/lib\/send-picks\.js"/);
  assert.deepEqual(sendPicksProblems(js), [], "game:check's rule for pages that build picks");
  assert.match(code, /SP\.plan\(/);
  assert.match(code, /SP\.confirm\(/);
  assert.match(code, /SP\.send\(W,/);
  assert.doesNotMatch(code, /W\.send\(|W\.sendBatch\(|KWallet\.send/, "no direct wallet send");
  assert.doesNotMatch(code, /ownMana/, "the wallet.js ownMana stopgap is not used");
  const r = checkSendPicks({ page: "overunder.html" }, new URL("../../../", import.meta.url).pathname);
  assert.ok(r.length && r.every((x) => x.pass), JSON.stringify(r));
});
test("max changes 2 (D-286) and the changes used come from the chain, per number, into the card's plan", () => {
  assert.match(code, /maxChanges: F\.MAX_CHANGES/);
  assert.match(code, /changesUsed: Object\.fromEntries\(/);
  assert.equal(F.MAX_CHANGES, 2);
  const mk = (existing, wanted, key = "16:1") => ({ key, label: "x", op: { op: key }, existing, wanted, open: true });
  // the plan the page asks for: a change with 2 used is refused; with 1 used it is a change; a first pick is fresh; a number "0" is a real saved pick
  assert.equal(SP.plan([mk("5", "6")], { maxChanges: 2, changesUsed: { "16:1": 2 } }).refused[0].why, "no changes left");
  assert.equal(SP.plan([mk("5", "6")], { maxChanges: 2, changesUsed: { "16:1": 1 } }).changes.length, 1);
  assert.equal(SP.plan([mk(null, "6")], { maxChanges: 2, changesUsed: {} }).fresh.length, 1);
  assert.equal(SP.plan([mk("0", "6")], { maxChanges: 2, changesUsed: { "16:1": 0 } }).changes.length, 1, "an all-blank number is still your pick");
  assert.equal(SP.plan([mk("18446744073709551615", "18446744073709551615")]).same.length, 1);
});
test("a change goes out alone on the player's own Mana (noSponsor); new picks may be sponsored and batched; a guest can't change", async () => {
  const calls = [], W = { kind: "kondor", send: async (l, ops, o) => { calls.push({ ops, o: o || {} }); return "id"; }, sendBatch: async (l, ops) => { calls.push({ ops, batch: true }); return { id: "b", sent: ops.length, dropped: 0 }; } };
  const a = { key: "16:2", label: "A", op: { n: "a" }, existing: null, wanted: "1", open: true }, b = { key: "16:1", label: "B", op: { n: "b" }, existing: "3", wanted: "4", open: true };
  const p = SP.plan([a, b], { maxChanges: 2, changesUsed: { "16:1": 0 } });
  await SP.send(W, p, {});
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].o, {}, "the new pick is as today (sponsor allowed)");
  assert.deepEqual(calls[1].o, { noSponsor: true }, "the change is never sponsored");
  assert.equal(calls[1].ops.length, 1, "alone, not in a batch");
  await assert.rejects(() => SP.send({ ...W, kind: "guest" }, p, {}), /guest wallet can't change/);
  assert.match(code, /guest: W\.kind === "guest"/);
});

// ── R5-3: a failed read is never "no pick" ──
test("a failed pick read sends nothing and says so; it is never treated as no pick", () => {
  const get = code.slice(code.indexOf("async function getPick"), code.indexOf("The days you can pick for now") > 0 ? code.indexOf("The days you can pick for now") : undefined);
  assert.doesNotMatch(get.split("function openDays")[0], /catch/, "getPick has no catch that turns an error into null");
  assert.match(code, /Couldn't read your pick, try again\./);
  assert.match(code, /catch \{ say\("Couldn't read your pick, try again\."\); return; \}/, "send reads strictly right before it sends and stops on a failed read");
  assert.match(code, /st\.unread\.add\(d\)/, "the refresh marks a day it couldn't read");
  assert.match(code, /st\.unread\.has\(d\)/, "and the page doesn't offer a send for it");
  assert.match(code, /existing: now\[i\] \? now\[i\]\.number : null/, "existing is the number, or null; never 0 as 'no pick'");
});

// ── R5-4: the page reads KnodeGames2 ──
test("the page's data URL and its CSP point at KnodeGames2, not the old repo", () => {
  assert.match(js, /const DATA = "https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/games-data\/overunder\/"/);
  assert.doesNotMatch(js, /raw\.githubusercontent\.com\/bawcejawn\/KnodeGames\//, "no address of the old repo in the script");
  const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
  assert.ok(csp.split(";").find((d) => d.trim().startsWith("connect-src")).split(/\s+/).includes("https://raw.githubusercontent.com/bawcejawn/KnodeGames2/"));
});

// ── R5-5: the page says when it can't batch ──
test("the page does not promise one approval: it says how many approvals to expect and when it can't batch", () => {
  assert.doesNotMatch(html, /sent in one approval\./);
  assert.match(code, /batchReady/);
  assert.match(code, /can't batch/);
  assert.match(code, /will ask you to approve \$\{approvals\} times/);
});

// ── R5-6: the roster is out before any pick can exist ──
test("roster made + margin ≤ the first time any of the week's pick numbers opens (D-284)", () => {
  const m = JSON.parse(fs.readFileSync(new URL("../game.json", import.meta.url), "utf8"));
  const MARGIN = 6 * 3600000;                                           // at least 6 hours between the roster and the first pick
  const MON = Date.UTC(2026, 10, 16);
  const made = MON - m.inputsLeadHours * 3600000;
  const opens = F.weekDays(MON).flatMap((day) => [0, 1].map((h) => F.pickRoundOf(day, h) * F.PICK_ROUND - F.AHEAD));
  assert.equal(Math.min(...opens), MON + 0 - F.DAY / 2 - F.AHEAD, "the first to open is Monday's number B, 2.5 days before Monday");
  assert.ok(made + MARGIN <= Math.min(...opens), `roster made ${new Date(made).toISOString()} + 6 h must be ≤ first open ${new Date(Math.min(...opens)).toISOString()}`);
});

// ── R5-7: over 2^64 - 1 is no pick, even when its low bits look like one ──
test("a number above 2^64 - 1 decodes as no pick, even when its low bits would be a pick", () => {
  const r = { rows: Array.from({ length: 40 }, (_, i) => ({ a: `1${String(i).padStart(2, "0")}${"A".repeat(30)}`, line: 1 })) };
  assert.deepEqual(F.decodePick(r, "18446744073709551617", 0), {}, "2^64 + 1 would be Over on row 0");
  assert.deepEqual(F.decodePick(r, (2n ** 64n + 4n).toString(), 1), {}, "2^64 + 4 would be Over on row 33");
  assert.deepEqual(F.decodePick(r, "18446744073709551615", 0), {}, "2^64 - 1 is all 11: blank");
  assert.deepEqual(F.decodePick(r, "1", 0), { [r.rows[0].a]: "over" }, "a plain 1 still decodes");
});

// ── D-311: Over/Under SHOWS its line (only VS hides its numbers, D-309) ──
test("the page shows each producer's line as soon as the sealed roster is out: before any pick, with no wallet connected", () => {
  const fn = code.slice(code.indexOf("function renderSheet()"), code.indexOf("const why = "));
  const rows = fn.slice(fn.indexOf("tbody.replaceChildren(...r.rows.map"), fn.indexOf("const n = Object.keys(cur).length"));
  assert.match(rows, /lineText\(x\.line\)/, "every row shows its line");
  assert.doesNotMatch(rows, /me\(\)|saved|st\.saved|dirty\(|isLocked|sending/, "what the line shows does not depend on a wallet, a saved pick, a draft or a lock");
  // the rows are built from the roster alone: the only thing before them is "no roster yet"
  const before = fn.slice(0, fn.indexOf("tbody.replaceChildren(...r.rows.map"));
  assert.match(before, /if \(!r\) \{/);
  assert.doesNotMatch(before.replace(/\$\("ou-send"\)\.hidden = !r;/, ""), /!me\(\)|picks\b.*return/, "no wallet or pick check before the rows");
  assert.match(code, /\{ class: "num", text: lineText\(x\.line\) \}/, "the line is its own visible column");
  assert.match(html, /<th>Line<\/th>/);
  assert.doesNotMatch(html + js, /hidden until|until picks lock|reveal(ed)? (at|when) lock/i, "nothing about the line is hidden");
  // the line the page shows is the roster's own line, the one the recorder scores against
  assert.equal(F.lineOf("20400000"), 41);
  assert.match(code, /lineText = \(line\) => `\$\{Math\.floor\(line \/ 2\)\}\.5`/);
});
