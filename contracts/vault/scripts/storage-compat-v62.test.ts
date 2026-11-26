/**
 * Upgrade compatibility v6.1 → v6.2 (Seed Sponsor; claude/vault/SEED-SPONSOR-PLAN-2026-11-25.md).
 *
 * v6.2 will be uploaded over the live v6.1 vault, so this test lets the live code (test-fixtures/kpred-v61-test-build.wasm,
 * the test build of the source whose release build is the live fingerprint 11043e1f…) write a vault history on top of a
 * v5 start, then swaps in the new build (build/sim/contract.wasm) on the same storage mid-week:
 *
 * 1. v5 → v6.1 history: seed, stakes, a second game with stakes, a closed vault week, a week running.
 * 2. Every view reads back unchanged after the swap. The new fields read 0 (the minimum setting 0 = 1,000 VHP).
 * 3. Seed Sponsor on the upgraded vault: a donation and a support deposit, a close where only real rewards are gain,
 *    then every sponsor and player leaves; what is left is the seed (with the donation) and the fee.
 *
 * Run (after `npm run build:sim` in contracts/vault): node --import tsx --test contracts/vault/scripts/storage-compat-v62.test.ts   (from the repo root)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Signer } from "koilib";
import { SimChain } from "../../../bot/chain.ts";

const V5 = "contracts/vault/test-fixtures/kpred-v5-test-build.wasm";
const V61 = "contracts/vault/test-fixtures/kpred-v61-test-build.wasm";
const NEW = "contracts/vault/build/sim/contract.wasm";
const VHP = 100_000_000n;
const HOUR = 3_600_000, DAY = 24 * HOUR, WEEK = 7 * DAY;
const GENESIS = 1_800_000_000_000 - (1_800_000_000_000 % DAY);
const T0 = GENESIS - DAY, H0 = 50_000_000;

const key = (s: string) => Signer.fromSeed(`storage-compat-v62 ${s}`);
const [contract, owner, operator, seedOwner, A, B, D, S1, S2] = ["contract", "owner", "operator", "seed", "A", "B", "D", "S1", "S2"].map(key);
const addr = (s: Signer) => s.getAddress();

const NEW_FIELDS = new Set(["min_sponsor_vhp", "support_vhp", "donated_vhp", "sponsor_count"]);
const isDefault = (v: any) => v === undefined || v === null || v === false || v === 0 || v === "0" || v === "";
function sameAsBefore(before: any, after: any, where: string) {
  if (before === null || typeof before !== "object") { assert.deepEqual(after, before, where); return; }
  assert.equal(typeof after, "object", `${where}: missing`);
  for (const k of Object.keys(before)) sameAsBefore(before[k], after?.[k], `${where}.${k}`);
  for (const k of Object.keys(after)) {
    if (k in before) continue;
    assert.ok(NEW_FIELDS.has(k), `${where}.${k}: a field v6.1 never returned (${JSON.stringify(after[k])})`);
    assert.ok(isDefault(after[k]), `${where}.${k} should read as its default, got ${JSON.stringify(after[k])}`);
  }
}

test("v6.2 reads v6.1's stored data unchanged; Seed Sponsor works on the upgraded vault and every sponsor can leave", { skip: (![V5, V61, NEW].every((f) => fs.existsSync(f))) && "a build is missing: run npm run build:sim in contracts/vault" }, async () => {
  const sim = new SimChain(addr(contract), V5);
  await sim.init();
  const at = (t: number) => sim.setHeight(H0 + Math.floor((t - T0) / 3000), t);
  const send = (calls: any[], who: Signer[]) => sim.sendAs(calls.map(([method, args]) => ({ method, args })), who.map(addr));
  const ok = async (calls: any[], who: Signer[]) => {
    const r = await send(calls, who);
    assert.ok(r.ok, `${calls.map((c) => c[0]).join(", ")}: ${r.error}`);
    return r;
  };
  for (const p of [A, B, D, S1, S2]) { await sim.ledgerSet(2, addr(p), 5000n * VHP); await sim.ledgerSet(3, addr(p), 1000n * VHP); }
  await sim.ledgerSet(2, addr(seedOwner), 5000n * VHP);
  await sim.ledgerSet(3, addr(seedOwner), 500n * VHP);
  await sim.ledgerSet(3, addr(contract), 1000n * VHP);

  // ───── 1. history: v5 start, then the live v6.1 ─────
  at(T0);
  await ok([["init", { owner: addr(owner), operator: addr(operator), seed_owner: addr(seedOwner), genesis_time: String(GENESIS), week_length: String(WEEK),
    close_delay: String(12 * HOUR), settle_length: String(DAY), timelock_length: String(2 * DAY), min_stake: String(VHP), max_sponsor_rc: String(2n * VHP) }]], [contract]);
  await ok([["seed_deposit_vhp", { amount: String(500n * VHP) }]], [seedOwner]);
  for (const [p, n] of [[A, 100n], [B, 40n]] as const) await ok([["deposit_vhp", { from: addr(p), amount: String(n * VHP) }]], [p]);
  await sim.setCode(V61);
  at(GENESIS + 12 * HOUR);
  await ok([["propose_game", { game: 2, name: "Fantasy", staked: true, free_prize: false }]], [owner]);
  at(GENESIS + 4 * DAY + HOUR);
  await ok([["apply_game", { game: 2 }]], [owner]);
  await ok([["deposit_to", { game: 2, from: addr(D), amount: String(30n * VHP), koin: false }]], [D]);
  await sim.ledgerAdd(2, addr(contract), 20n * VHP);
  at(GENESIS + WEEK + 12 * HOUR);
  await ok([["close_week", { week: "0" }]], []);
  await sim.ledgerAdd(2, addr(contract), 30n * VHP);
  at(GENESIS + 2 * WEEK + 12 * HOUR);
  await ok([["close_week", { week: "1" }]], []);
  at(GENESIS + 2 * WEEK + 13 * HOUR);                                   // week 2 running

  const views = async () => ({
    state: await sim.read("get_state", {}),
    weeks: await Promise.all(["0", "1", "2"].map((week) => sim.read("get_week", { week }))),
    players: await Promise.all([A, B, D].flatMap((p) => ["0", "2"].map((week) => sim.read("get_player", { player: addr(p), week })))),
    games: await sim.read("list_games", {}),
    game2: await sim.read("get_game", { game: 2, week: "1" }),
  });
  const before = await views();
  // A field v6.1 never set (e.g. a `false` bool) is left out of a read: drop the time-dependent fields only.
  delete before.state.time; delete before.state.height;

  // ───── 2. the upgrade, mid-week 2 ─────
  await sim.setCode(NEW);
  const after = await views();
  delete after.state.time; delete after.state.height;
  assert.ok(isDefault(after.state.config.min_sponsor_vhp), "the minimum setting reads 0 (= 1,000 VHP) until the owner sets one");
  sameAsBefore(before, after, "view");
  assert.equal((await sim.read("list_sponsors", {})).rows, undefined, "no Seed Sponsor records yet");

  // ───── 3. Seed Sponsor on the upgraded vault ─────
  const small = await send([["support_deposit", { from: addr(S2), amount: String(999n * VHP), nickname: "Too Small", show_amount: false }]], [S2]);
  assert.ok(!small.ok && /at least 1000 VHP each time/.test(small.error ?? ""), `below the minimum is refused (${small.error})`);
  await ok([["seed_donate", { from: addr(S1), amount: String(1000n * VHP), nickname: "Giver", show_amount: true }]], [S1]);
  await ok([["support_deposit", { from: addr(S2), amount: String(2000n * VHP), nickname: "Helper", show_amount: false }]], [S2]);
  const st = await sim.read("get_state", {});
  assert.equal(st.totals.seed_vhp, String(1500n * VHP), "the donation is seed");
  assert.equal(st.totals.donated_vhp, String(1000n * VHP));
  assert.equal(st.totals.support_vhp, String(2000n * VHP));
  assert.equal(st.totals.sponsor_count, "2");
  assert.equal(st.totals.total_stake, before.state.totals.total_stake, "nobody plays with Seed Sponsor VHP");
  assert.equal((await sim.read("get_sponsor", { sponsor: addr(S2) })).sponsor.nickname, "Helper");

  // Week 2 closes: only the 15 VHP of real rewards is gain; the sponsors' 3,000 VHP is not.
  const feeBefore = BigInt((await sim.read("get_state", {})).totals.fee_vhp ?? 0);
  await sim.ledgerAdd(2, addr(contract), 15n * VHP);
  at(GENESIS + 3 * WEEK + 12 * HOUR);
  await ok([["close_week", { week: "2" }]], []);
  const w2 = (await sim.read("get_week", { week: "2" })).week;
  assert.equal(w2.prize_v6, true, "week 2 closes by the vault split");
  const fee = BigInt((await sim.read("get_state", {})).totals.fee_vhp ?? 0) - feeBefore;
  assert.equal(fee, 15n * VHP * 5n / 100n, `the 5% fee was taken on the 15 VHP of real rewards only (got ${fee})`);

  // ───── everyone leaves; what is left is the seed (with the donation) and what is owed to the owner ─────
  await ok([["support_withdraw", { to: addr(S2), amount: String(2000n * VHP) }]], [S2]);
  const gone = await send([["support_withdraw", { to: addr(S1), amount: "1" }]], [S1]);
  assert.ok(!gone.ok && /more than your support/.test(gone.error ?? ""), `a donation can't be withdrawn by the donor (${gone.error})`);
  for (const p of [A, B]) {
    const pl = (await sim.read("get_player", { player: addr(p), week: "3" })).player ?? {};
    const all = BigInt(pl.stake ?? 0) + BigInt(pl.pending ?? 0);
    if (all > 0n) await ok([["withdraw_from", { game: 1, to: addr(p), amount: String(all) }]], [p]);
  }
  await ok([["withdraw_from", { game: 2, to: addr(D), amount: String(30n * VHP) }]], [D]);
  const e = await sim.read("get_state", {});
  assert.equal(e.totals.total_stake ?? "0", "0", "every stake came out");
  assert.equal(e.totals.support_vhp ?? "0", "0", "every support deposit came out");
  assert.equal(e.totals.seed_vhp, String(1500n * VHP), "the seed keeps the donation");
  assert.ok(BigInt(e.vhp_balance) + BigInt(e.koin_balance ?? 0) >= 1500n * VHP, "and the vault still holds it");
});
