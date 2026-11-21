// Repo Lens #R4-2, R4-2.1 (Medium) and R4-2.3 / R4-2.6, written by Architecture from the reply (Repo Lens 4's own files
// did not reach the project; #R4-2b compares them). Fantasy's read before a send is strict: a failed get_pick read
// sends nothing (it never turns a change into a sponsored "first pick", D-278). The change limit comes from get_game.
// Run: node --test tests/audit/site.send-picks-failopen.repolens-r4.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as SP from "../../web/js/lib/send-picks.js";

const src = fs.readFileSync("web/fantasy.js", "utf8");
const between = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > 0 && j > i, `${a} … ${b}`); return src.slice(i, j); };
const READS = between("  const READ_FAILED", "  /** The next day you can still pick for");
const SENDS = between("  /** R4-2.6", "  document.addEventListener(\"keydown\"");

function page({ getPick, getGame, kind = "kondor" }) {
  const calls = [], pops = [];
  const W = {
    kind, label: () => "Kondor",
    async send(label, ops, opts = {}) { calls.push({ how: "send", ops, opts }); return "tx"; },
    async sendBatch(label, ops, opts = {}) { calls.push({ how: "batch", ops, opts }); return { id: "tx", sent: ops.length, dropped: 0 }; },
  };
  const picks = { functions: {
    get_pick: getPick,
    get_game: getGame || (async () => ({ result: { game: { max_changes: 20 } } })),
    pick: async (args) => ({ operation: { call_contract: { contract_id: "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm", entry_point: 1, args: JSON.stringify(args) } } }),
  } };
  const make = new Function("env", `const { SP, W, picks } = env; let asking = null;
    const me = () => "1Player", nameOf = (a) => a, okBtn = () => null, pop = (...a) => env.pops.push(a), ask = () => env.ask;
    ${READS}
    ${SENDS}
    return { sendOne, readPick, maxChangesOf, manaLine, READ_FAILED };`);
  const env = { SP, W, picks, pops, ask: async () => true };
  return { ...make(env), calls, pops, env };
}
const P = "1ProducerAAAA", Q = "1ProducerBBBB";

test("R4-2.1: get_pick fails -> nothing is sent (no sponsored 'first pick')", async () => {
  const pg = page({ getPick: async () => { throw new Error("node timeout"); } });
  await assert.rejects(pg.sendOne(4, 20410, [P], "Fantasy team", "Change?", Date.now() + 3600e3), /couldn't check your current pick/);
  assert.equal(pg.calls.length, 0);
});

test("R4-2.1: an answer with no result object counts as a failed read too", async () => {
  const pg = page({ getPick: async () => undefined });
  await assert.rejects(pg.sendOne(4, 20410, [P], "Fantasy team", "Change?", Date.now() + 3600e3), /couldn't check/);
  assert.equal(pg.calls.length, 0);
});

test("controls: no pick on chain -> a first pick (sponsor allowed); a pick on chain -> a change (noSponsor)", async () => {
  const a = page({ getPick: async () => ({}) });
  await a.sendOne(4, 20410, [P], "Fantasy team", "Change?", Date.now() + 3600e3);
  assert.deepEqual(a.calls.map((c) => [c.how, !!c.opts.noSponsor]), [["send", false]]);
  const b = page({ getPick: async () => ({ result: { pick: { producers: [Q], changes: 0 } } }) });
  await b.sendOne(4, 20410, [P], "Fantasy team", "Change?", Date.now() + 3600e3);
  assert.deepEqual(b.calls.map((c) => [c.how, !!c.opts.noSponsor]), [["send", true]]);
});

test("R4-2.3: the limit is get_game max_changes and the count is get_pick changes; at the limit nothing is sent", async () => {
  const pg = page({ getPick: async () => ({ result: { pick: { producers: [Q], changes: 5 } } }), getGame: async () => ({ result: { game: { max_changes: 5 } } }) });
  await assert.rejects(pg.sendOne(5, 20410, [P], "Weekly Rival", "Change?", Date.now() + 3600e3), /changed again/);
  assert.equal(pg.calls.length, 0);
  const ok = page({ getPick: async () => ({ result: { pick: { producers: [Q], changes: 4 } } }), getGame: async () => ({ result: { game: { max_changes: 5 } } }) });
  await ok.sendOne(5, 20410, [P], "Weekly Rival", "Change?", Date.now() + 3600e3);
  assert.equal(ok.calls.length, 1, "one change left: it goes");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /maxChanges:\s*\d/, "no copied limit");
});

test("R4-2.6: the Mana line by wallet kind (KOIN Vault: never 'Knode's sponsor pays')", () => {
  const { manaLine } = page({ getPick: async () => ({}) });
  assert.doesNotMatch(manaLine("vault", false), /sponsor pays/);
  assert.match(manaLine("vault", false), /KOIN Vault decides/);
  assert.match(manaLine("kondor", false), /unless your wallet has enough Mana of its own/);
  assert.match(manaLine("guest", false), /sponsor pays/);
  for (const k of ["vault", "kondor", "guest"]) assert.equal(manaLine(k, true), "A change: paid with your own Mana.");
});
