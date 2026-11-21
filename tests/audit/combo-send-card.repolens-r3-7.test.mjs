// Repo Lens #R3-7 (Combo E, KG2 #42 @ 413500e): pins how combo.js feeds the shared "Send my picks" card. Eight mutations of
// combo.js passed the PR's own tests, among them `existing = null`, which would send every card CHANGE as a first pick,
// sponsored (a D-278 break). Offline: part 1 runs the real shared card (web/js/lib/send-picks.js) on Combo-shaped legs with
// a fake wallet; part 2 pins the lines of web/combo.js that feed it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const APP = process.env.APP || ".";
const SP = await import(path.resolve(APP, "web/js/lib/send-picks.js"));
const js = fs.readFileSync(path.resolve(APP, "web/combo.js"), "utf8");
const legKey = (l) => `${Number(l.code)}:${Number(l.round)}:${l.producer}`;
const P1 = "1" + "A".repeat(33), P2 = "1" + "B".repeat(33), P3 = "1" + "C".repeat(33);
const card = (a) => a.map(([code, round, producer]) => ({ code, round: String(round), producer }));
const old = card([[1, 100, P1], [4, 200, P2]]).map(legKey);
const same = card([[1, 100, P1], [4, 200, P2]]).map(legKey);
const next = card([[1, 100, P1], [4, 200, P3]]).map(legKey);
const fakeW = (kind = "kondor") => { const calls = []; return { kind, calls, send: async (l, ops, o) => { calls.push({ ops, o }); return "tx"; }, sendBatch: async () => { throw new Error("batch"); } }; };
const item = (existing, wanted, extra = {}) => ({ key: "8:5", label: "Combo card 1", op: { op: 1 }, existing, wanted, open: true, ...extra });

test("R3-7.1 a new card is a first pick: sponsored (no noSponsor); the same card again is 'already your card'", async () => {
  const W = fakeW(), p = SP.plan([item(null, next)], { maxChanges: 3, changesUsed: { "8:5": 0 } });
  assert.equal(p.fresh.length, 1); assert.equal(p.changes.length, 0);
  await SP.send(W, p, { label: "x", stillOpen: () => true });
  assert.equal(W.calls.length, 1); assert.ok(!W.calls[0].o || !W.calls[0].o.noSponsor);
  assert.equal(SP.plan([item(old, same)], { maxChanges: 3 }).same.length, 1);
});
test("R3-7.2 a changed card is paid with the player's own Mana, alone; a guest cannot change; the 4th change is refused", async () => {
  const W = fakeW(), p = SP.plan([item(old, next)], { maxChanges: 3, changesUsed: { "8:5": 1 } });
  assert.equal(p.changes.length, 1); assert.equal(p.changes[0].changesLeft, 2);
  await SP.send(W, p, { label: "x", stillOpen: () => true });
  assert.deepEqual(W.calls[0].o, { noSponsor: true });
  const G = fakeW("guest"); await assert.rejects(() => SP.send(G, p, {}), /guest wallet can't change/); assert.equal(G.calls.length, 0);
  let said = null; assert.equal(await SP.confirm(p, async () => true, String, { guest: true, cannot: async (l) => { said = l; } }), false); assert.ok(said);
  assert.equal(SP.plan([item(old, next)], { maxChanges: 3, changesUsed: { "8:5": 3 } }).refused[0].why, "no changes left");
  assert.equal(SP.plan([item(old, next, { open: false })], {}).refused[0].why, "locked");
});

test("R3-7.3 combo.js hands the shared card the card on chain, the sorted legs, the change count and the guest flag", () => {
  assert.match(js, /const legKey = \(l\) => `\$\{Number\(l\.code\)\}:\$\{Number\(l\.round\)\}:\$\{l\.producer\}`;/);
  assert.match(js, /const existing = editing !== null && slots\[editing\] \? slots\[editing\]\.legs\.map\(legKey\) : null;/, "a change carries the card on chain");
  assert.match(js, /wanted: sorted\.map\(legKey\), open: open\(\)/);
  assert.match(js, /maxChanges: C\.MAX_CHANGES, changesUsed: \{ \[key\]: editing !== null && slots\[editing\] \? Number\(slots\[editing\]\.changes \|\| 0\) : 0 \}/);
  assert.match(js, /if \(plan\.same\.length\) \{ toast = "That's already your card\."/);
  assert.match(js, /SP\.confirm\(plan, ask, legText, \{ guest: W\.kind === "guest", cannot \}\)/);
  assert.match(js, /await SP\.send\(W, plan, \{ label, stillOpen: open \}\)/);
});
test("R3-7.4 the pop-up answers 'keep' on Escape and on a click outside, and the chain is read right before signing", () => {
  assert.match(js, /if \(e\.key === "Escape"\) end\(false\)/);
  assert.match(js, /if \(e\.target === wrap\) end\(false\)/);
  assert.ok(js.indexOf("if (!same(onChain, expected))") > 0 && js.indexOf("if (!same(onChain, expected))") < js.indexOf("SP.plan("), "the on-chain read comes before the plan");
});
