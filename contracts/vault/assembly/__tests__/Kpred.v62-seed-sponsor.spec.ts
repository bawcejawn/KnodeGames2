/**
 * v6.2 Seed Sponsor (claude/vault/SEED-SPONSOR-PLAN-2026-11-25.md; owner M-816, M-820, M-821, 25 Nov 8:11 PM).
 *   seed_donate       VHP becomes seed (seed_vhp): the platform's; the donor can never take it back
 *   support_deposit   VHP owed to its sponsor like a stake (in liabilities, never first-loss), producing as seed
 *   support_withdraw  only the sponsor; any amount, any time; also while paused and in the withdrawals-only build
 *   every donation and deposit (top-ups too) is at least the owner-set minimum (default 1,000 VHP), whole VHP
 *   nicknames 3-20 of A-Z a-z 0-9 space - _ (no Unicode at all, so no lookalike letters, AB-062); empty = not shown
 *   the owner can hide a name; nobody plays with these tokens (never in total_stake or a game's stake).
 * MockVM. Run: npm test
 */
import { Base58, MockVM, authority, chain, System, protocol, Protobuf } from "@koinos/sdk-as";
import { Kpred, testSetInitV6Rule, testSetInitQ60Rule, testSetSafeMode } from "../Kpred";
import { Tokens } from "../Tokens";
import { kpred } from "../proto/kpred";

const CONTRACT = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqe");
const OWNER = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqG");
const OPERATOR = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqK");
const SEED = Base58.decode("1DQzuCcTKacbs9GGScRTU1Hc8BsyARTPqP");
const A = Base58.decode("1PWeFG4pPtjZZoYvcmGb6mYhMYJjnkHrmz");
const B = Base58.decode("1HGh4rQvYYcm4fGiU1C7vQoSxnUiGa9Ah7");
const P = Base58.decode("12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq");   // a player
const KOIN_TAG: u8 = 1, VHP_TAG: u8 = 2, MANA_TAG: u8 = 3;

const VHP: u64 = 100_000_000;
const MIN: u64 = 1000 * VHP;
const GENESIS: u64 = 1000, WEEK: u64 = 1000;
const MS: u64 = 2800;
const CLOSE: u64 = 10, SETTLE: u64 = 100, LOCK: u64 = 50;

let gK: Kpred | null = null;
let gWho: Uint8Array = new Uint8Array(0);
let gAmt: u64 = 0;
let gName: string = "";

function at(h: u64): void {
  MockVM.commitTransaction();
  MockVM.setBlock(new protocol.block(new Uint8Array(0), new protocol.block_header(new Uint8Array(0), h, h * MS)));
  System.resetCache();
}
function as(acct: Uint8Array): void {
  MockVM.commitTransaction();
  MockVM.setAuthorities([new MockVM.MockAuthority(authority.authorization_type.contract_call, acct, true)]);
}
function nobody(): void {
  MockVM.commitTransaction();
  MockVM.setAuthorities([]);
}
function setup(): Kpred {
  MockVM.reset();
  MockVM.setContractId(CONTRACT);
  MockVM.setContractArguments(CONTRACT);
  MockVM.setEntryPoint(0);
  MockVM.setCaller(new chain.caller_data(new Uint8Array(0), chain.privilege.user_mode));
  MockVM.setContractMetadata(new chain.contract_metadata_object(new Uint8Array(0), false, false, false, false));
  MockVM.setHeadInfo(new chain.head_info(null, 0, 1));
  at(100);
  testSetInitV6Rule(1);
  testSetInitQ60Rule(1);
  testSetSafeMode(false);
  const k = new Kpred();
  k.init(new kpred.init_arguments(OWNER, OPERATOR, SEED, GENESIS * MS, WEEK * MS, CLOSE * MS, SETTLE * MS, LOCK * MS, VHP, VHP));
  const ws = [A, B, P, SEED];
  for (let i = 0; i < ws.length; i++) {
    Tokens.testSet(VHP_TAG, ws[i], 100_000 * VHP);
    Tokens.testSet(MANA_TAG, ws[i], 1000 * VHP);
  }
  Tokens.testSet(MANA_TAG, CONTRACT, 1000 * VHP);
  at(GENESIS + 100);
  return k;
}
const vhpOf = (w: Uint8Array): u64 => Tokens.testGet(VHP_TAG, w);
const vault = (): u64 => Tokens.testGet(VHP_TAG, CONTRACT);
function donate(k: Kpred, who: Uint8Array, amount: u64, name: string = "", show: bool = false): void {
  as(who);
  k.seed_donate(new kpred.seed_donate_arguments(who, amount, name, show));
  MockVM.commitTransaction();
}
function support(k: Kpred, who: Uint8Array, amount: u64, name: string = "", show: bool = false): void {
  as(who);
  k.support_deposit(new kpred.support_deposit_arguments(who, amount, name, show));
  MockVM.commitTransaction();
}
function unsupport(k: Kpred, who: Uint8Array, amount: u64): void {
  as(who);
  k.support_withdraw(new kpred.support_withdraw_arguments(who, amount));
  MockVM.commitTransaction();
}
function rec(k: Kpred, who: Uint8Array): kpred.sponsor_object {
  return k.get_sponsor(new kpred.get_sponsor_arguments(who)).sponsor!;
}
function totals(k: Kpred): kpred.totals_object { return k.get_state(new kpred.get_state_arguments()).totals!; }
/** Expect the call in `f` to be refused with `msg`. */
function refused(f: () => void, msg: string): void {
  expect(f).toThrow();
  if (msg == "AUTH") expect(MockVM.getErrorMessage()!.endsWith("authorization failed")).toBe(true);   // the SDK's own message
  else expect(MockVM.getErrorMessage()).toBe(msg);
  MockVM.commitTransaction();
}
function lastEvent(): kpred.seed_sponsor_event {
  const ev = MockVM.getEvents();
  expect(ev.length).toBeGreaterThan(0);
  const e = ev[ev.length - 1];
  expect(e.name!).toBe("kpred.seed_sponsor");
  return Protobuf.decode<kpred.seed_sponsor_event>(e.data, kpred.seed_sponsor_event.decode);
}

describe("v6.2 Seed Sponsor: donations", () => {
  it("a donation becomes seed: the VHP moves into the vault, seed_vhp and donated_vhp grow, and the record keeps it", () => {
    const k = setup();
    const before = vhpOf(A);
    as(A);
    k.seed_donate(new kpred.seed_donate_arguments(A, 1500 * VHP, "Node Fan", true));
    const ev = lastEvent();
    expect(ev.kind).toBe(1);
    expect(ev.amount).toBe(1500 * VHP);
    expect(ev.record!.donated).toBe(1500 * VHP);
    MockVM.commitTransaction();
    expect(vhpOf(A)).toBe(before - 1500 * VHP);
    expect(vault()).toBe(1500 * VHP);
    const t = totals(k);
    expect(t.seed_vhp).toBe(1500 * VHP);
    expect(t.donated_vhp).toBe(1500 * VHP);
    expect(t.support_vhp).toBe(0);
    expect(t.total_stake).toBe(0);                       // nobody plays with it
    expect(t.sponsor_count).toBe(1);
    const r = rec(k, A);
    expect(r.donated).toBe(1500 * VHP);
    expect(r.support).toBe(0);
    expect(r.nickname).toBe("Node Fan");
    expect(r.show_amount).toBe(true);
    expect(r.hidden).toBe(false);
    expect(r.first_at).toBe((GENESIS + 100) * MS);
    expect(r.last_at).toBe((GENESIS + 100) * MS);
  });

  it("the donor can never take a donation back: support_withdraw only reaches support", () => {
    const k = setup();
    donate(k, A, MIN);
    gK = k;
    as(A);
    refused(() => { gK!.support_withdraw(new kpred.support_withdraw_arguments(A, 1)); }, "more than your support");
    expect(rec(k, A).donated).toBe(MIN);
    expect(totals(k).seed_vhp).toBe(MIN);
  });

  it("the seed owner can move donated VHP like any seed VHP (48 h timelock), but never support (owner M-820)", () => {
    const k = setup();
    donate(k, A, 2000 * VHP);
    support(k, B, 3000 * VHP);
    gK = k;
    as(SEED);
    refused(() => { gK!.request_seed_withdrawal(new kpred.request_seed_withdrawal_arguments(2001 * VHP, 0)); }, "more than the seed");
    as(SEED);
    k.request_seed_withdrawal(new kpred.request_seed_withdrawal_arguments(2000 * VHP, 0));
    at(GENESIS + 100 + LOCK + 1);
    as(SEED);
    const before = vhpOf(SEED);
    k.execute_seed_withdrawal(new kpred.execute_seed_withdrawal_arguments());
    MockVM.commitTransaction();
    expect(vhpOf(SEED)).toBe(before + 2000 * VHP);       // the donation left with the seed
    expect(totals(k).seed_vhp).toBe(0);
    expect(totals(k).donated_vhp).toBe(2000 * VHP);      // the memo keeps what was given
    expect(vault()).toBe(3000 * VHP);                    // B's support is still there
    const b = vhpOf(B);
    unsupport(k, B, 3000 * VHP);
    expect(vhpOf(B)).toBe(b + 3000 * VHP);
  });
});

describe("v6.2 Seed Sponsor: support deposits", () => {
  it("support is owed to its sponsor, is not seed and not stake, and only the sponsor can withdraw it", () => {
    const k = setup();
    support(k, A, 1200 * VHP, "Helper", false);
    const t = totals(k);
    expect(t.support_vhp).toBe(1200 * VHP);
    expect(t.seed_vhp).toBe(0);
    expect(t.total_stake).toBe(0);
    expect(k.get_game(new kpred.get_game_arguments(1)).game!.stake).toBe(0);   // no game's stake moves
    expect(rec(k, A).support).toBe(1200 * VHP);
    // B can't take A's support, even by naming A as the receiver.
    gK = k;
    as(B);
    refused(() => { gK!.support_withdraw(new kpred.support_withdraw_arguments(A, VHP)); }, "AUTH");
    // Neither can the owner or the seed owner.
    as(OWNER);
    refused(() => { gK!.support_withdraw(new kpred.support_withdraw_arguments(A, VHP)); }, "AUTH");
    as(SEED);
    refused(() => { gK!.support_withdraw(new kpred.support_withdraw_arguments(A, VHP)); }, "AUTH");
  });

  it("withdraw any amount, at any time: part, below the minimum, then the rest; more than the support is refused", () => {
    const k = setup();
    support(k, A, 1000 * VHP, "Helper");
    const before = vhpOf(A);
    unsupport(k, A, 1);                                   // one satoshi: no minimum on the way out
    unsupport(k, A, 400 * VHP);                           // leaves less than the minimum: fine
    expect(rec(k, A).support).toBe(600 * VHP - 1);
    gK = k;
    as(A);
    refused(() => { gK!.support_withdraw(new kpred.support_withdraw_arguments(A, 600 * VHP)); }, "more than your support");
    as(A);
    refused(() => { gK!.support_withdraw(new kpred.support_withdraw_arguments(A, 0)); }, "amount must be positive");
    unsupport(k, A, 600 * VHP - 1);
    expect(vhpOf(A)).toBe(before + 1000 * VHP);
    expect(rec(k, A).support).toBe(0);
    expect(totals(k).support_vhp).toBe(0);
    expect(rec(k, A).nickname).toBe("Helper");          // the record stays; the page hides a support name at 0
    expect(lastEvent().kind).toBe(3);
  });

  it("withdrawals stay open while new deposits are paused and in the withdrawals-only build", () => {
    const k = setup();
    support(k, A, 2000 * VHP);
    as(OWNER);
    k.set_paused(new kpred.set_paused_arguments(true));
    unsupport(k, A, 500 * VHP);
    gK = k;
    as(B);
    refused(() => { gK!.support_deposit(new kpred.support_deposit_arguments(B, MIN, "", false)); }, "new deposits are paused");
    as(B);
    refused(() => { gK!.seed_donate(new kpred.seed_donate_arguments(B, MIN, "", false)); }, "new deposits are paused");
    as(OWNER);
    k.set_paused(new kpred.set_paused_arguments(false));
    testSetSafeMode(true);
    unsupport(k, A, 1500 * VHP);
    expect(rec(k, A).support).toBe(0);
    const safeMsg = "the vault is in withdrawals-only mode: you can withdraw your stake and claim finished weeks";
    as(B);
    refused(() => { gK!.support_deposit(new kpred.support_deposit_arguments(B, MIN, "", false)); }, safeMsg);
    as(B);
    refused(() => { gK!.seed_donate(new kpred.seed_donate_arguments(B, MIN, "", false)); }, safeMsg);
    testSetSafeMode(false);
  });

  it("support is in what the vault owes: never counted as gain at the close, so it is never paid out", () => {
    const k = setup();
    support(k, A, 5000 * VHP);
    at(GENESIS + WEEK + CLOSE + 1);
    nobody();
    const r = k.close_week(new kpred.close_week_arguments(0));
    MockVM.commitTransaction();
    expect(r.gain).toBe(0);
    expect(r.pot).toBe(0);
    expect(totals(k).fee_vhp).toBe(0);
    // Real rewards arrive: only they are gain.
    Tokens.testSet(VHP_TAG, CONTRACT, vault() + 10 * VHP);
    at(GENESIS + 2 * WEEK + CLOSE + 1);
    nobody();
    const r2 = k.close_week(new kpred.close_week_arguments(1));
    MockVM.commitTransaction();
    expect(r2.gain).toBe(10 * VHP);
    expect(totals(k).support_vhp).toBe(5000 * VHP);
  });

  it("a seed withdrawal can never reach support: seedFree leaves it out even in a shortfall", () => {
    const k = setup();
    donate(k, A, 1000 * VHP);
    support(k, B, 1000 * VHP);
    // A shortfall of 300 VHP (e.g. lost production): the seed takes it first.
    Tokens.testSet(VHP_TAG, CONTRACT, vault() - 300 * VHP);
    as(SEED);
    k.request_seed_withdrawal(new kpred.request_seed_withdrawal_arguments(1000 * VHP, 0));
    at(GENESIS + 100 + LOCK + 1);
    as(SEED);
    const before = vhpOf(SEED);
    k.execute_seed_withdrawal(new kpred.execute_seed_withdrawal_arguments());
    MockVM.commitTransaction();
    expect(vhpOf(SEED)).toBe(before + 700 * VHP);        // only what is left after B's support
    expect(vault()).toBe(1000 * VHP);
    const b = vhpOf(B);
    unsupport(k, B, 1000 * VHP);
    expect(vhpOf(B)).toBe(b + 1000 * VHP);
  });

  it("support produces as seed: it is in the seed's part of the rewards (acc_seed) and in the house's", () => {
    const k = setup();
    support(k, A, 2000 * VHP);
    const t0 = totals(k);
    at(GENESIS + 300);
    donate(k, B, 1000 * VHP);                            // any change brings the accumulators up to date
    const t1 = totals(k);
    const dt: u64 = 200 * MS;
    expect(t1.acc_seed_lo - t0.acc_seed_lo).toBe(2000 * VHP * dt);
    expect(t1.acc_house_lo - t0.acc_house_lo).toBe(2000 * VHP * dt);
    expect(t1.acc_player_lo - t0.acc_player_lo).toBe(0);
  });
});

describe("v6.2 Seed Sponsor: the minimum", () => {
  it("every donation and deposit is at least 1,000 VHP by default, top-ups included; whole VHP only", () => {
    const k = setup();
    gK = k;
    expect(k.get_state(new kpred.get_state_arguments()).config!.min_sponsor_vhp).toBe(0);   // 0 = the default, 1,000 VHP
    const msg = "at least 1000 VHP each time";
    as(A);
    refused(() => { gK!.seed_donate(new kpred.seed_donate_arguments(A, MIN - VHP, "", false)); }, msg);
    as(A);
    refused(() => { gK!.support_deposit(new kpred.support_deposit_arguments(A, MIN - VHP, "", false)); }, msg);
    support(k, A, MIN);
    as(A);
    refused(() => { gK!.support_deposit(new kpred.support_deposit_arguments(A, 200 * VHP, "", false)); }, msg);   // a small top-up too
    as(A);
    refused(() => { gK!.support_deposit(new kpred.support_deposit_arguments(A, MIN + 1, "", false)); }, "whole VHP only (1, 2, 3 …)");
    support(k, A, MIN);
    expect(rec(k, A).support).toBe(2 * MIN);
  });

  it("only the owner changes the minimum; never 0 or part of a VHP; it applies to new deposits at once", () => {
    const k = setup();
    gK = k;
    as(A);
    refused(() => { gK!.set_min_sponsor(new kpred.set_min_sponsor_arguments(500 * VHP)); }, "owner only");
    as(OWNER);
    refused(() => { gK!.set_min_sponsor(new kpred.set_min_sponsor_arguments(0)); }, "the minimum can never be 0");
    as(OWNER);
    refused(() => { gK!.set_min_sponsor(new kpred.set_min_sponsor_arguments(VHP + 1)); }, "whole VHP only (1, 2, 3 …)");
    as(OWNER);
    k.set_min_sponsor(new kpred.set_min_sponsor_arguments(500 * VHP));
    const ev = lastEvent();
    expect(ev.kind).toBe(6);
    expect(ev.amount).toBe(500 * VHP);
    MockVM.commitTransaction();
    expect(k.get_state(new kpred.get_state_arguments()).config!.min_sponsor_vhp).toBe(500 * VHP);
    support(k, A, 500 * VHP);
    as(B);
    refused(() => { gK!.seed_donate(new kpred.seed_donate_arguments(B, 499 * VHP, "", false)); }, "at least 500 VHP each time");
  });
});

describe("v6.2 Seed Sponsor: names and the list", () => {
  it("nicknames: 3 to 20 of A-Z a-z 0-9 space - _, no space at either end or twice; empty = not shown", () => {
    const k = setup();
    gK = k;
    const msg = "a nickname is 3 to 20 letters, digits, spaces, - or _ (no space at the start, the end or twice)";
    const bad = ["ab", "a".repeat(21), "Knöde", "Кnode", "hi!", " lead", "trail ", "two  spaces", "tab\tname", "@name"];
    for (let i = 0; i < bad.length; i++) {
      gName = bad[i];
      as(A);
      refused(() => { gK!.support_deposit(new kpred.support_deposit_arguments(A, MIN, gName, false)); }, msg);
    }
    support(k, A, MIN, "Node_Fan-20 x");
    expect(rec(k, A).nickname).toBe("Node_Fan-20 x");
    support(k, B, MIN, "");                               // opted out
    expect(rec(k, B).nickname).toBe("");
  });

  it("a deposit carries the sponsor's current choices; set_sponsor_profile changes them without moving VHP", () => {
    const k = setup();
    support(k, A, MIN, "First", true);
    donate(k, A, MIN, "Second", false);                  // the newest choice wins
    expect(rec(k, A).nickname).toBe("Second");
    expect(rec(k, A).show_amount).toBe(false);
    expect(totals(k).sponsor_count).toBe(1);             // one wallet, one record, both kinds
    as(A);
    k.set_sponsor_profile(new kpred.set_sponsor_profile_arguments(A, "", true));
    expect(lastEvent().kind).toBe(4);
    MockVM.commitTransaction();
    expect(rec(k, A).nickname).toBe("");
    expect(rec(k, A).show_amount).toBe(true);
    expect(rec(k, A).support).toBe(MIN);
    gK = k;
    as(B);
    refused(() => { gK!.set_sponsor_profile(new kpred.set_sponsor_profile_arguments(A, "Taken", false)); }, "AUTH");
    as(B);
    refused(() => { gK!.set_sponsor_profile(new kpred.set_sponsor_profile_arguments(B, "Nobody", false)); }, "no Seed Sponsor record for that wallet");
  });

  it("only the owner hides or shows a name; hiding keeps the amounts and the sponsor's own choices", () => {
    const k = setup();
    support(k, A, MIN, "Rude Word", true);
    gK = k;
    as(A);
    refused(() => { gK!.set_sponsor_hidden(new kpred.set_sponsor_hidden_arguments(A, true)); }, "owner only");
    as(OWNER);
    k.set_sponsor_hidden(new kpred.set_sponsor_hidden_arguments(A, true));
    expect(lastEvent().kind).toBe(5);
    MockVM.commitTransaction();
    const r = rec(k, A);
    expect(r.hidden).toBe(true);
    expect(r.nickname).toBe("Rude Word");
    expect(r.support).toBe(MIN);
    // The sponsor changing their profile does not un-hide them.
    as(A);
    k.set_sponsor_profile(new kpred.set_sponsor_profile_arguments(A, "Nice Name", true));
    MockVM.commitTransaction();
    expect(rec(k, A).hidden).toBe(true);
    as(OWNER);
    refused(() => { gK!.set_sponsor_hidden(new kpred.set_sponsor_hidden_arguments(B, true)); }, "no Seed Sponsor record for that wallet");
  });

  it("list_sponsors pages through every record; get_sponsor of an unknown wallet is empty", () => {
    const k = setup();
    donate(k, A, MIN, "Alpha");
    support(k, B, MIN, "Beta");
    support(k, P, MIN);
    const all = k.list_sponsors(new kpred.list_sponsors_arguments(null, 0)).rows;
    expect(all.length).toBe(3);
    const first = k.list_sponsors(new kpred.list_sponsors_arguments(null, 2)).rows;
    expect(first.length).toBe(2);
    const rest = k.list_sponsors(new kpred.list_sponsors_arguments(first[1].address, 2)).rows;
    expect(rest.length).toBe(1);
    expect(totals(k).sponsor_count).toBe(3);
    const none = rec(k, OPERATOR);
    expect(none.support).toBe(0);
    expect(none.donated).toBe(0);
    expect(none.first_at).toBe(0);
  });
});

describe("v6.2 Seed Sponsor: solvency", () => {
  it("donations, support, a player's stake and the seed's withdrawal all add up; every sponsor can leave", () => {
    const k = setup();
    as(P);
    k.deposit_to(new kpred.deposit_to_arguments(P, 1, 50 * VHP, false));
    MockVM.commitTransaction();
    donate(k, A, 1000 * VHP);
    support(k, A, 2000 * VHP);
    support(k, B, 1000 * VHP);
    expect(vault()).toBe(4050 * VHP);
    k.assertSolvent();
    unsupport(k, A, 2000 * VHP);
    unsupport(k, B, 1000 * VHP);
    as(P);
    k.withdraw_from(new kpred.withdraw_from_arguments(P, 1, 50 * VHP));
    MockVM.commitTransaction();
    expect(vault()).toBe(1000 * VHP);                    // only the donation (seed) is left
    expect(totals(k).seed_vhp).toBe(1000 * VHP);
    k.assertSolvent();
  });
});
