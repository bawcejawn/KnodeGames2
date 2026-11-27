/* Seed Sponsor page: the vault v6.2 calls it uses, and the transactions each button builds. Nothing here signs or
   sends: seed-sponsor.js sends the operations, with the Seed Sponsor's own Mana.
   The calls (vault v6.2, PR C, claude/vault/SEED-SPONSOR-PLAN-2026-11-25.md):
     seed_donate(from, amount, nickname, show_amount)      a donation: becomes seed, can't be taken back
     support_deposit(from, amount, nickname, show_amount)  support: only this wallet can withdraw it
     support_withdraw(to, amount)                          any amount, any time
     set_sponsor_profile(sponsor, nickname, show_amount)   change the nickname (empty = not shown) or the tick
     get_sponsor(sponsor), list_sponsors(start, limit)     the records; get_state for the totals and the minimum
   Entry points are the first 4 bytes of sha256(name). tests/audit/site.seed-sponsor-flows.test.mjs checks every entry
   point and field number against the v6.2 ABI. Fields the page doesn't read are left out (the decoder skips them). */
(function () {
  "use strict";
  const addr = (id) => ({ type: "bytes", id, options: { "(koinos.btype)": "ADDRESS" } });
  const u64 = (id) => ({ type: "uint64", id, options: { jstype: "JS_STRING" } });
  const u32 = (id) => ({ type: "uint32", id });
  const bool = (id) => ({ type: "bool", id });
  const str = (id) => ({ type: "string", id });

  const VAULT_ABI = {
    methods: {
      get_state: { entry_point: 0x3d02a349, argument: "kpred.get_state_arguments", return: "kpred.get_state_result", read_only: true },
      get_sponsor: { entry_point: 0xaa100291, argument: "kpred.get_sponsor_arguments", return: "kpred.get_sponsor_result", read_only: true },
      list_sponsors: { entry_point: 0xe0589df1, argument: "kpred.list_sponsors_arguments", return: "kpred.list_sponsors_result", read_only: true },
      seed_donate: { entry_point: 0xc1f9c810, argument: "kpred.seed_donate_arguments", return: "kpred.seed_donate_result", read_only: false },
      support_deposit: { entry_point: 0xfe50c7a1, argument: "kpred.support_deposit_arguments", return: "kpred.support_deposit_result", read_only: false },
      support_withdraw: { entry_point: 0x3673ab1a, argument: "kpred.support_withdraw_arguments", return: "kpred.support_withdraw_result", read_only: false },
      set_sponsor_profile: { entry_point: 0xcdaac8db, argument: "kpred.set_sponsor_profile_arguments", return: "kpred.set_sponsor_profile_result", read_only: false },
    },
    koilib_types: { nested: { kpred: { nested: {
      config_object: { fields: { paused: bool(11), min_sponsor_vhp: u64(24) } },
      totals_object: { fields: { seed_vhp: u64(2), support_vhp: u64(22), donated_vhp: u64(23), sponsor_count: u64(24) } },
      get_state_arguments: { fields: {} },
      get_state_result: { fields: { config: { type: "config_object", id: 1 }, totals: { type: "totals_object", id: 2 }, time: u64(11), safe_mode: bool(12) } },
      sponsor_object: { fields: { support: u64(1), donated: u64(2), nickname: str(3), show_amount: bool(4), hidden: bool(5) } },
      sponsor_row: { fields: { address: addr(1), sponsor: { type: "sponsor_object", id: 2 } } },
      get_sponsor_arguments: { fields: { sponsor: addr(1) } },
      get_sponsor_result: { fields: { sponsor: { type: "sponsor_object", id: 1 } } },
      list_sponsors_arguments: { fields: { start: addr(1), limit: u32(2) } },
      list_sponsors_result: { fields: { rows: { rule: "repeated", type: "sponsor_row", id: 1 } } },
      seed_donate_arguments: { fields: { from: addr(1), amount: u64(2), nickname: str(3), show_amount: bool(4) } },
      seed_donate_result: { fields: {} },
      support_deposit_arguments: { fields: { from: addr(1), amount: u64(2), nickname: str(3), show_amount: bool(4) } },
      support_deposit_result: { fields: {} },
      support_withdraw_arguments: { fields: { to: addr(1), amount: u64(2) } },
      support_withdraw_result: { fields: {} },
      set_sponsor_profile_arguments: { fields: { sponsor: addr(1), nickname: str(2), show_amount: bool(3) } },
      set_sponsor_profile_result: { fields: {} },
    } } } },
  };

  const TOKEN_ABI = {
    methods: {
      approve: { entry_point: 0x74e21680, argument: "token.approve_arguments", return: "token.approve_result", read_only: false },
    },
    koilib_types: { nested: { token: { nested: {
      approve_arguments: { fields: { owner: addr(1), spender: addr(2), value: u64(3) } },
      approve_result: { fields: {} },
    } } } },
  };

  const vaultOf = (k) => new k.lib.Contract({ id: k.dep.contract, abi: VAULT_ABI, provider: k.provider });
  const opOf = async (contract, fn, args) => (await contract.functions[fn](args, { onlyOperation: true })).operation;

  /** The operations for one button, in one transaction. k = { lib, dep: { contract, vhp }, provider }.
   *  a = { player, units (BigInt), nickname, showAmount }. A donation or support deposit first lets the vault take
   *  exactly that amount (approve), as every vault deposit does; a withdrawal or a profile change moves nothing in. */
  async function buildOps(k, action, a) {
    const vault = vaultOf(k);
    const amount = a.units != null ? a.units.toString() : undefined;
    if (action === "donate" || action === "support") {
      const token = new k.lib.Contract({ id: k.dep.vhp, abi: TOKEN_ABI, provider: k.provider });
      return [
        await opOf(token, "approve", { owner: a.player, spender: k.dep.contract, value: amount }),
        await opOf(vault, action === "donate" ? "seed_donate" : "support_deposit", { from: a.player, amount, nickname: a.nickname || "", show_amount: !!a.showAmount }),
      ];
    }
    if (action === "withdraw") return [await opOf(vault, "support_withdraw", { to: a.player, amount })];
    if (action === "profile") return [await opOf(vault, "set_sponsor_profile", { sponsor: a.player, nickname: a.nickname || "", show_amount: !!a.showAmount })];
    throw new Error(`unknown action ${action}`);
  }

  /** Every record, page by page (50 a page, at most `pages` pages). Throws if the vault doesn't answer the call. */
  async function readAll(vault, pages = 40) {
    const rows = [];
    let start;
    for (let i = 0; i < pages; i++) {
      const { result } = await vault.functions.list_sponsors(start ? { start, limit: 50 } : { limit: 50 });
      const page = (result && result.rows) || [];
      rows.push(...page);
      if (page.length < 50) break;
      start = page[page.length - 1].address;
    }
    return rows;
  }

  async function readMine(vault, address) {
    const { result } = await vault.functions.get_sponsor({ sponsor: address });
    return (result && result.sponsor) || {};
  }

  window.KSeedSponsorChain = { VAULT_ABI, TOKEN_ABI, buildOps, vaultOf, readAll, readMine };
})();
