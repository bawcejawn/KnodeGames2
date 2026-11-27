// Seed Sponsor page, PR B: the Donate, Support and Withdraw flows, wired to the vault v6.2 calls (PR C,
// seedsponsor/vault-c). Owner's spec: claude/library/SEED-SPONSOR-OUTLINE-AND-START-2026-11-25.md, M-821, and the owner's
// answers of 25 Nov 8:11 PM ET. The buttons stay off until BOTH the owner's live switch (window.KG.seedSponsor.live) is
// on AND the vault answers the v6.2 calls. Offline: the scripts run in a sandbox; transactions are built, never sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");
const require = createRequire(import.meta.url);
const koilib = require(path.join(APP, "node_modules/koilib"));
const V62 = JSON.parse(read("tests/fixtures/seed-sponsor/kpred-v62.koilib.json"));   // the v6.2 ABI, from seedsponsor/vault-c
const html = read("web/seed-sponsor.html");

function load() {
  const box = { window: {}, console };
  for (const f of ["web/js/lib/config.js", "web/names.js", "web/seed-sponsor-math.js", "web/seed-sponsor-chain.js"]) vm.runInNewContext(read(f), box, { filename: f });
  box.window.KNames = box.KNames;   // names.js puts KNames on globalThis
  return box.window;
}
const W = load();
const S = W.KSeedSponsor, C = W.KSeedSponsorChain;
const reserved = W.KNames.rules.reserved;
const here = (x) => structuredClone(x);
const UNIT = 100000000n, V = (n) => BigInt(n) * UNIT;
const DEP = { contract: "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr", vhp: "12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq" };
const ME = koilib.Signer.fromSeed("seed sponsor flows test").getAddress();

// ── the page's copy of the v6.2 calls matches the vault's ABI ──
test("every call the page uses has the vault's entry point and field numbers (v6.2 ABI)", () => {
  const mine = C.VAULT_ABI, theirs = V62;
  for (const [m, d] of Object.entries(mine.methods)) {
    assert.ok(theirs.methods[m], `the vault has ${m}`);
    assert.equal(d.entry_point >>> 0, theirs.methods[m].entry_point >>> 0, `${m} entry point`);
    assert.equal(d.argument, theirs.methods[m].argument, `${m} argument`);
    assert.equal(!!d.read_only, !!theirs.methods[m].read_only, `${m} read_only`);
  }
  const t = theirs.koilib_types.nested.kpred.nested;
  for (const [type, def] of Object.entries(mine.koilib_types.nested.kpred.nested)) {
    assert.ok(t[type], `the vault has type ${type}`);
    for (const [f, fd] of Object.entries(def.fields)) {
      assert.ok(t[type].fields[f], `${type}.${f} exists`);
      assert.equal(fd.id, t[type].fields[f].id, `${type}.${f} field number`);
      assert.equal(fd.type, t[type].fields[f].type, `${type}.${f} type`);
    }
  }
  for (const m of ["seed_donate", "support_deposit", "support_withdraw", "set_sponsor_profile", "get_sponsor", "list_sponsors", "get_state"]) assert.ok(mine.methods[m], m);
});

// ── the transactions each button builds ──
const k = () => ({ lib: koilib, dep: DEP, provider: new koilib.Provider(["http://127.0.0.1:1"]) });
async function decoded(ops) {
  const out = [];
  for (const op of ops) {
    const cc = op.call_contract;
    const isVault = cc.contract_id === DEP.contract;
    const abi = isVault ? V62 : C.TOKEN_ABI;
    const c = new koilib.Contract({ id: cc.contract_id, abi, provider: k().provider });
    const m = Object.entries(abi.methods).find(([, d]) => (d.entry_point >>> 0) === (Number(cc.entry_point) >>> 0));
    assert.ok(m, `known entry point ${cc.entry_point}`);
    out.push({ to: isVault ? "vault" : "vhp", call: m[0], args: await c.decodeOperation(op).then((d) => d.args) });
  }
  return out;
}

test("Donate: approve the vault for exactly the amount, then seed_donate with the sponsor's choices", async () => {
  const ops = await C.buildOps(k(), "donate", { player: ME, units: V(1500), nickname: "Node Fan", showAmount: true });
  assert.deepEqual(await decoded(ops), [
    { to: "vhp", call: "approve", args: { owner: ME, spender: DEP.contract, value: String(V(1500)) } },
    { to: "vault", call: "seed_donate", args: { from: ME, amount: String(V(1500)), nickname: "Node Fan", show_amount: true } },
  ]);
});

test("Support: approve, then support_deposit; opting out sends an empty nickname", async () => {
  const ops = await C.buildOps(k(), "support", { player: ME, units: V(1000), nickname: "", showAmount: false });
  const d = await decoded(ops);
  assert.equal(d.length, 2);
  assert.equal(d[0].call, "approve");
  assert.equal(d[1].call, "support_deposit");
  assert.equal(d[1].args.from, ME);
  assert.equal(d[1].args.amount, String(V(1000)));
  assert.ok(!d[1].args.nickname, "no nickname when opted out");
  assert.ok(!d[1].args.show_amount);
});

test("Withdraw: one support_withdraw to the sponsor's own wallet, no approve; profile: one set_sponsor_profile", async () => {
  assert.deepEqual(await decoded(await C.buildOps(k(), "withdraw", { player: ME, units: V(250) })),
    [{ to: "vault", call: "support_withdraw", args: { to: ME, amount: String(V(250)) } }]);
  assert.deepEqual(await decoded(await C.buildOps(k(), "profile", { player: ME, nickname: "New Name", showAmount: true })),
    [{ to: "vault", call: "set_sponsor_profile", args: { sponsor: ME, nickname: "New Name", show_amount: true } }]);
  await assert.rejects(C.buildOps(k(), "stake", { player: ME, units: V(1) }), /unknown/);
});

test("the page sends with the sponsor's own Mana (the Mana sponsor never pays for Seed Sponsor)", () => {
  const js = read("web/seed-sponsor.js");
  const sends = [...js.matchAll(/KWallet\.send\(([^;]*?)\)/g)].map((m) => m[1]);
  assert.ok(sends.length >= 1, "the page sends through KWallet.send");
  for (const s of sends) assert.match(s, /noSponsor:\s*true/);
});

// ── the records and the list ──
test("one chain record can be a donor and a supporter: it becomes two list entries", () => {
  const rows = [
    { address: ME, sponsor: { donated: String(V(2000)), support: String(V(1000)), nickname: "Both Ways", show_amount: true } },
    { address: DEP.vhp, sponsor: { donated: "0", support: String(V(1500)), nickname: "Helper" } },
    { address: koilib.Signer.fromSeed("seed sponsor flows test 2").getAddress(), sponsor: { donated: String(V(1000)), support: "0", nickname: "Rude", hidden: true } },
  ];
  const list = here(S.listRows(S.fromChain(rows), reserved));
  assert.deepEqual(list.donors, [{ name: "Both Ways", amount: "2,000 VHP" }, { name: "Anonymous Donor", amount: null }]);
  assert.deepEqual(list.supporters, [{ name: "Helper", amount: null }, { name: "Both Ways", amount: "1,000 VHP" }]);
});

test("a name that looks like Knode Games or Koinos is refused on the form and never shown on the list (AB-062)", () => {
  for (const n of ["Knode Games", "Kn0de Games fan", "My Knode", "Koinos Team", "official", "support"]) {
    assert.equal(S.checkNickname(n, reserved).ok, false, n);
    assert.match(S.checkNickname(n, reserved).reason, /reserved/);
  }
  assert.equal(S.checkNickname("Blocknode fan", reserved).ok, true);
  const list = here(S.listRows([{ kind: "support", units: String(V(1000)), nickname: "Knode Games", showAmount: true }], reserved));
  assert.deepEqual(list.supporters, [{ name: "Anonymous Sponsor", amount: "1,000 VHP" }]);
});

// ── the confirm screens ──
test("the Donate confirm screen says, in big type, that it is a donation and gives the owner's exact sentence", () => {
  const c = S.confirmText("donate", V(1500), "Node Fan", true);
  assert.equal(c.title, "You are DONATING 1,500 VHP");
  assert.ok(c.lines.includes("A donation becomes part of the Knode Games seed, owned by the platform. It can be used for the platform, including moving it out of the vault, and you can't take it back."));
  assert.ok(c.lines.some((l) => /shown as “Node Fan”, with the amount/.test(l)));
  assert.equal(c.button, "Donate 1,500 VHP. I can't take it back");
});

test("the Support confirm screen says, in big type, that it is support, who can withdraw it, and that the rewards aren't theirs", () => {
  const c = S.confirmText("support", V(1000), "", false);
  assert.equal(c.title, "You are adding SUPPORT: 1,000 VHP");
  assert.ok(c.lines.includes("Only you can withdraw your support: any amount, any time."));
  assert.ok(c.lines.includes("Your VHP produces blocks for the vault. Its rewards pay the weekly free prizes first, and the rest is shared by the players who stake. You receive none of them."));
  assert.ok(c.lines.some((l) => /not shown on this page/.test(l)));
  const w = S.confirmText("withdraw", V(250));
  assert.equal(w.title, "Withdraw 250 VHP of your support");
});

// ── the page ──
test("the tick's label is exactly the one Vault and the owner asked for; there is an opt-out", () => {
  const vis = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.ok(vis.includes("Show my amount on this page (amounts are always public on the chain)"));
  assert.match(vis, /Don't show me on this page/);
});

test("the buttons stay off unless the owner's switch is on AND the vault answers the v6.2 calls", () => {
  assert.equal(W.KG.seedSponsor.live, false, "the switch ships off");
  assert.equal(S.liveOn(W.KG), false);
  assert.equal(S.liveOn({ seedSponsor: { live: true } }), true);
  assert.equal(S.liveOn({ seedSponsor: { live: "yes" } }), false, "only a real true turns it on");
  const js = read("web/seed-sponsor.js");
  assert.match(js, /S\.liveOn\(window\.KG\)\s*&&\s*chainReady/);
  for (const b of html.matchAll(/<button\b[^>]*class="[^"]*ss-go[^"]*"[^>]*>/g)) assert.match(b[0], /\bdisabled\b/);
});

test("a guest wallet can't use Seed Sponsor: the page says to connect a wallet", () => {
  const js = read("web/seed-sponsor.js");
  assert.match(js, /\.kind === "guest"/);
  assert.match(js, /Seed Sponsor needs your own wallet/);
});

test("every new word still follows the owner's rules (no banned words, no wallet addresses, 'Seed Sponsor')", () => {
  const strings = (s) => [...s.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]).join("\n");
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
  const text = strings(read("web/seed-sponsor.js")) + "\n" + strings(read("web/seed-sponsor-math.js")) + "\n" + visible;
  const banned = /\b(earn\w*|returns?|APY|APR|yield\w*|interest|guarantee\w*|bets?|betting|odds|lines?|get rich|profit\w*|invest\w*)\b/i;
  assert.deepEqual(text.split("\n").filter((l) => banned.test(l)), []);
  for (const f of ["web/seed-sponsor.js", "web/seed-sponsor-math.js", "web/seed-sponsor-chain.js", "web/seed-sponsor.html"]) assert.doesNotMatch(read(f), /\b1[1-9A-HJ-NP-Za-km-z]{25,34}\b/, f);
});
