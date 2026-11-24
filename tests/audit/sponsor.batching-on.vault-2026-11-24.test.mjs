// Vault, 24 Nov 2026 (M-551): pick batching switched on in the site's sponsor block, from the mainnet batch-test
// (1 pick 1.142 Mana, 4 picks 1.666, 10 picks 3.160; claude/vault/BATCH-TEST-MAINNET-2026-11-24.md) and the sponsor
// config sent the same day (per-tx 4.5, Picks pick 1.5, Race pick 1.3). These pins keep every send the page can make
// inside what the sponsor allows: a batch of n asks fixed + the sum of perOp + margin, and the sponsor's authorize
// allows at most n x each action's row (Sponsor.ts "what these actions may ask for") and the per-transaction cap.
// Run: node --test tests/audit/sponsor.batching-on.vault-2026-11-24.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const APP = process.env.APP || ".";
const sp = JSON.parse(fs.readFileSync(`${APP}/game-data/deployment.json`, "utf8")).sponsor;
const lim = JSON.parse(fs.readFileSync(`${APP}/sponsor-data/mana-limits.json`, "utf8"));
const PER_TX = 450000000n;   // the sponsor's per-transaction cap on chain from 24 Nov (tx 0x12205c59…)
const B = (v) => BigInt(v);
const PICKS = `${sp.picks}:8ce33c6c`, RACE = `${sp.race}:8ce33c6c`;

test("the batch block holds the measured numbers (fixed 0.9, picks 0.25, race 0.3, margin 0.5)", () => {
  assert.deepEqual(sp.batch, { fixed: "90000000", perOp: { [PICKS]: "25000000", [RACE]: "30000000" }, margin: "50000000" });
});

test("the site's rows equal mana-limits.json (the sponsor's rows on chain)", () => {
  for (const r of lim.rows) {
    const k = `${r.contract}:${(r.entry_point >>> 0).toString(16).padStart(8, "0")}`;
    assert.equal(sp.rcLimits[k], r.max_mana, k);
  }
  assert.equal(sp.rcLimits[PICKS], "150000000");
  assert.equal(sp.rcLimits[RACE], "130000000");
});

test("every batch of 2 to 10 picks or race picks fits the sponsor: at most n x the rows and at most the per-tx cap", () => {
  const rows = { [PICKS]: B(sp.rcLimits[PICKS]), [RACE]: B(sp.rcLimits[RACE]) };
  for (let n = 2; n <= 10; n++) for (let r = 0; r <= n; r++) {   // r race picks, n - r KnodeGames picks
    const ask = B(sp.batch.fixed) + B(sp.batch.margin) + B(r) * B(sp.batch.perOp[RACE]) + B(n - r) * B(sp.batch.perOp[PICKS]);
    const allowed = B(r) * rows[RACE] + B(n - r) * rows[PICKS];
    assert.ok(ask <= allowed, `${n} sends (${r} race): asks ${ask}, the sponsor allows ${allowed}`);
    assert.ok(ask <= PER_TX, `${n} sends: asks ${ask}, above the per-tx cap`);
    assert.ok(ask <= B(sp.rcLimitOther) && ask <= B(sp.rcLimit), `${n} sends: the page would cap it below what it needs`);
  }
});

test("the page's caps (rcLimit, rcLimitOther) stay within the per-tx cap and selfPayMin, and singles still ask their own row", () => {
  assert.ok(B(sp.rcLimit) <= PER_TX && B(sp.rcLimitOther) <= PER_TX);
  assert.ok(B(sp.rcLimitOther) <= B(sp.selfPayMin), "D-294");
  for (const v of Object.values(sp.rcLimits)) assert.ok(B(v) <= B(sp.rcLimit), "a single answer or pick asks its row, not more");
});

test("the measured 10-pick send (3.160 Mana) fits under the batch figure with room", () => {
  const ten = B(sp.batch.fixed) + 10n * B(sp.batch.perOp[PICKS]) + B(sp.batch.margin);
  assert.ok(ten >= 316016301n + 50000000n, `10 picks ask ${ten}`);
});
