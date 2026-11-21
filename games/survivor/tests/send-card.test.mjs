// Survivor's page sends picks only through the shared Send my picks card (D-255 / D-256 / D-278, Library 19 Nov):
// a first pick as today (the sponsor may pay), a change alone with the player's own Mana (noSponsor), a guest without a
// Change button, and 5 changes per pick (MAX_CHANGES, the contract's limit).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { page } from "./load-page.mjs";
import * as SP from "../../../web/js/lib/send-picks.js";
import { checkSendPicks, SEND_PICKS_ALLOW } from "../../../tools/game-check.mjs";

const js = fs.readFileSync("web/survivor.js", "utf8");
const html = fs.readFileSync("web/survivor.html", "utf8");
const code = js.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

test("game:check: web/survivor.js passes the card rule for real (no allowance left)", () => {
  assert.equal(SEND_PICKS_ALLOW["web/survivor.js"], undefined);
  const r = checkSendPicks({ page: "survivor.html" });
  assert.ok(r.length && r.every((x) => x.pass), r.map((x) => x.msg).join("\n"));
});

test("the page imports the card, sends through SP.send, and never calls the wallet itself", () => {
  assert.match(js, /import \* as SP from "\.\/js\/lib\/send-picks\.js";/);
  assert.match(code, /SP\.plan\(\[\{ key, label, op: operation, existing, wanted: producer, open: stillOpen\(\) \}\], \{ maxChanges, changesUsed: \{ \[key\]: used \} \}\)/);
  assert.match(code, /SP\.confirm\(p, askChange, nameOf, \{ guest: W\.kind === "guest", cannot: cannotChange \}\)/);
  assert.match(code, /SP\.send\(W, p, \{ label, stillOpen \}\)/);
  assert.doesNotMatch(code, /\bW\.send\s*\(|KWallet\.send\s*\(|\.sendBatch\s*\(/);
  // first pick or change comes from the chain read right before the card (a failed read throws), and the limit from get_game
  assert.match(code, /const \{ existing, used \} = await readPick\(round, who\);/);
  assert.match(code, /const maxChanges = await maxChangesOf\(\);/);
});

test("5 changes per pick: the card counts against MAX_CHANGES and refuses the sixth", () => {
  assert.equal(page.MAX_CHANGES, 5);
  const it = (existing, used) => SP.plan([{ key: "3:1", label: "x", op: { call_contract: {} }, existing, wanted: B, open: true }], { maxChanges: page.MAX_CHANGES, changesUsed: { "3:1": used } });
  assert.equal(it(null, 0).fresh.length, 1, "no pick on chain: a first pick");
  assert.equal(it(A, 0).changes.length, 1, "a pick on chain, another producer: a change");
  assert.equal(it(A, 4).changes.length, 1, "the fifth change is allowed");
  const sixth = it(A, 5);
  assert.equal(sixth.changes.length, 0);
  assert.equal(sixth.refused[0].why, "no changes left");
  assert.equal(it(B, 0).same.length, 1, "the same producer: nothing to send");
});

test("D-278: a first pick goes as today, a change goes alone with noSponsor, a guest can't change", async () => {
  const sent = [];
  const W = { kind: "kondor", send: async (label, ops, opts) => { sent.push(opts || {}); return "id"; }, sendBatch: async () => { throw new Error("no batch for one pick"); } };
  const op = { call_contract: {} };
  await SP.send(W, SP.plan([{ key: "3:1", label: "x", op, existing: null, wanted: B, open: true }], { maxChanges: 5 }), { label: "x" });
  assert.equal(sent[0].noSponsor, undefined, "first pick: the wallet decides (sponsored as today)");
  await SP.send(W, SP.plan([{ key: "3:1", label: "x", op, existing: A, wanted: B, open: true }], { maxChanges: 5 }), { label: "x" });
  assert.equal(sent[1].noSponsor, true, "a change: never the sponsor");
  const cannot = [];
  const go = await SP.confirm(SP.plan([{ key: "3:1", label: "x", op, existing: A, wanted: B, open: true }], { maxChanges: 5 }), async () => true, (a) => a, { guest: true, cannot: async (l) => cannot.push(l) });
  assert.equal(go, false, "a guest's change is never sent");
  assert.ok(cannot[0].includes(SP.GUEST_CHANGE));
});

test("guest: the day card has no Change button once a pick exists, and says why", () => {
  assert.match(code, /const guestChange = !!\(mineP && W && W\.kind === "guest"\);/);
  assert.match(code, /const btn = guestChange \? null : el\("button"/);
  assert.match(code, /if \(guestChange\) notes\.push\(el\("div", \{ class: "bx-now", text: SP\.GUEST_CHANGE \}\)\);/);
});

test("the text: a first pick is free, each change uses your own Mana; no copy of the self-pay number", () => {
  assert.match(html, /A first pick is free: Knode's Mana sponsor pays, unless your wallet has enough Mana of its own \(then it uses yours\)\. Each change uses your own Mana/);
  assert.doesNotMatch(html, /The Mana is paid by Knode's Mana sponsor\./);
  assert.match(code, /\[what, manaLine\(W\.kind, p\.changes\.length > 0\)\]/);
  assert.doesNotMatch(js + html, /selfPayMin|\b25\s*Mana|2500000000\b/);
});

// R4-2 (as on the Fantasy page): the read, the chain's limit and the Mana line, run on the page's own code.
const between = (a, b) => { const i = js.indexOf(a), j = js.indexOf(b, i); assert.ok(i > 0 && j > i, `${a} … ${b}`); return js.slice(i, j); };
const HELPERS = between('  const READ_FAILED', '  /** One pick through the shared Send my picks card');
const helpers = (picksContract) => new Function("env", `const { S, picksContract } = env; ${HELPERS}; return { readPick, maxChangesOf, manaLine, READ_FAILED };`)({ S: { GAME_ID: 3 }, picksContract });

test("R4-2: a failed or empty pick read stops the send (never taken as 'no pick')", async () => {
  const h = helpers({ functions: { get_pick: async () => { throw new Error("node timeout"); } } });
  await assert.rejects(h.readPick("20422", "1P"), new RegExp(h.READ_FAILED));
  const h2 = helpers({ functions: { get_pick: async () => null } });
  await assert.rejects(h2.readPick("20422", "1P"), new RegExp(h2.READ_FAILED));
  const h3 = helpers({ functions: { get_pick: async () => ({ result: { pick: { producers: [A], changes: 3 } } }) } });
  assert.deepEqual(await h3.readPick("20422", "1P"), { existing: A, used: 3 });
  const h4 = helpers({ functions: { get_pick: async () => ({ result: {} }) } });
  assert.deepEqual(await h4.readPick("20422", "1P"), { existing: null, used: 0 });
});

test("R4-2.3: the change limit comes from get_game (no copied 5); a failed read shows no count", async () => {
  for (const [lim, used, ok] of [[20, 5, true], [2, 2, false]]) {
    const h = helpers({ functions: { get_game: async () => ({ result: { game: { max_changes: lim } } }) } });
    const n = await h.maxChangesOf();
    assert.equal(n, lim);
    const p = SP.plan([{ key: "k", label: "x", op: { call_contract: {} }, existing: A, wanted: B, open: true }], { maxChanges: n, changesUsed: { k: used } });
    assert.equal(p.changes.length, ok ? 1 : 0, `limit ${lim}, ${used} used`);
  }
  const f = helpers({ functions: { get_game: async () => { throw new Error("node timeout"); } } });
  assert.equal(await f.maxChangesOf(), undefined);
});

test("R4-2.6: the Mana line by wallet kind; a change is never the sponsor's", () => {
  const h = helpers({ functions: {} });
  assert.equal(h.manaLine("kondor", true), "A change: paid with your own Mana.");
  assert.equal(h.manaLine("vault", true), "A change: paid with your own Mana.");
  assert.match(h.manaLine("vault", false), /KOIN Vault decides/);
  assert.match(h.manaLine("guest", false), /sponsor pays/);
  assert.match(h.manaLine("kondor", false), /^A first pick is free/);
});
