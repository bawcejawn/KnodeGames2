// Repo Lens #R4-2b (KnodeGames2 PR #21 @ 96bc02e): extra cover for R4-2.3 that Architecture's tests leave open.
// Their limit test uses one limit (5) and one game, so a page that copies "5" survives, and so does a cache that ignores the game id.
// Here: limit 20 with 5 used must GO; limit 2 with 2 used must be refused; two games with different limits on one page keep their own limit;
// and when get_game fails the change still goes alone on the player's own Mana (noSponsor), never sponsored.
// Run from the repo root: TZ=UTC node --import tsx --test --test-concurrency=1 tests/audit/site.send-picks-limits.repolens-r4b.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as SP from "../../web/js/lib/send-picks.js";

const src = fs.readFileSync("web/fantasy.js", "utf8");
const between = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > 0 && j > i, `${a} … ${b}`); return src.slice(i, j); };
const READS = between("  const READ_FAILED", "  /** The next day you can still pick for");
const SENDS = between("  /** R4-2.6", "  document.addEventListener(\"keydown\"");
function page({ limits, used, getGameFails = false }) {
  const calls = [];
  const W = { kind: "kondor", label: () => "Kondor",
    async send(label, ops, opts = {}) { calls.push({ opts }); return "tx"; }, async sendBatch() { throw new Error("no batch"); } };
  const picks = { functions: {
    get_pick: async ({ game }) => ({ result: { pick: { producers: ["1Other"], changes: used[game] } } }),
    get_game: async ({ game }) => { if (getGameFails) throw new Error("node timeout"); return { result: { game: { max_changes: limits[game] } } }; },
    pick: async () => ({ operation: { call_contract: { contract_id: "1Picks", entry_point: 1, args: "x" } } }) } };
  const make = new Function("env", `const { SP, W, picks } = env; let asking = null;
    const me = () => "1Player", nameOf = (a) => a, okBtn = () => null, pop = () => {}, ask = () => async () => true;
    ${READS}
    ${SENDS}
    return { sendOne };`);
  return { ...make({ SP, W, picks }), calls };
}
const go = (pg, game) => pg.sendOne(game, 20410, ["1Mine"], "x", "Change?", Date.now() + 3600e3);

test("R4-2.3: limit 20 with 5 used goes; limit 2 with 2 used is refused (no copied number can pass both)", async () => {
  const a = page({ limits: { 4: 20 }, used: { 4: 5 } });
  await go(a, 4); assert.equal(a.calls.length, 1);
  const b = page({ limits: { 4: 2 }, used: { 4: 2 } });
  await assert.rejects(go(b, 4), /changed again/); assert.equal(b.calls.length, 0);
});
test("R4-2.3: two games on one page keep their own limit (the cache is per game)", async () => {
  const pg = page({ limits: { 4: 20, 5: 5 }, used: { 4: 7, 5: 5 } });
  await go(pg, 4);                                                    // 7 of 20: goes
  await assert.rejects(go(pg, 5), /changed again/);                   // 5 of 5: refused, whatever game 4 said
  assert.equal(pg.calls.length, 1);
});
test("R4-2.3: if get_game fails the change still goes alone on the player's own Mana (never sponsored)", async () => {
  const pg = page({ limits: {}, used: { 4: 3 }, getGameFails: true });
  await go(pg, 4);
  assert.equal(pg.calls.length, 1);
  assert.equal(pg.calls[0].opts.noSponsor, true);
});
