// Repo Lens #R4-2, R4-2.4: the three wallet mutants that survived #21's own tests. Written by Architecture from the
// reply (#R4-2b compares Repo Lens 4's own file).
//   1. the signed-payer check on the Kondor change path (ownMana: the player must be the payer);
//   2. nothing adds a sponsor or payer to the KOIN Vault request, from sendVault or any helper it calls;
//   3. samePick compares 64-bit picks with BigInt, not Number.
// Run: node --test tests/audit/send-picks.wallet-paths.repolens-r4.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as SP from "../../web/js/lib/send-picks.js";

const w = fs.readFileSync("web/wallet.js", "utf8");
function fnSrc(name) {
  const i = w.indexOf(`async function ${name}(`);
  assert.ok(i > 0, name);
  return w.slice(i, w.indexOf("\n  }\n", i) + 4);
}
const op = { call_contract: { contract_id: "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm", entry_point: 1, args: "a" } };

function kondorWith(payer) {
  const env = { sent: 0 };
  const make = new Function("env", `const W = env.W, lib = env.lib, window = env.window; const checkSigned = () => {};
    ${fnSrc("sendKondorWith")}; return sendKondorWith;`);
  env.W = { address: "1Player", provider: { wait: async () => true }, status: () => {} };
  env.window = { kondor: { getSigner: () => ({}) } };
  env.lib = { Transaction: class { constructor() { this.ops = []; } async pushOperation(o) { this.ops.push(o); }
    async sign() { return { id: "t1", signatures: ["s"], header: { payer, payee: "1Player" } }; }
    async send() { env.sent++; return {}; } } };
  return { run: make(env), env };
}

test("1. a change (ownMana) signed with someone else as payer is not sent", async () => {
  const k = kondorWith("1ByDDSBUzy5zkRceELc54Jh8i41yNRoKt8");
  await assert.rejects(k.run("change", [op], { ownMana: true, rcLimit: "100000000" }), /must use your own Mana/);
  assert.equal(k.env.sent, 0);
  const ok = kondorWith("1Player");
  assert.equal(await ok.run("change", [op], { ownMana: true, rcLimit: "100000000" }), "t1");
  assert.equal(ok.env.sent, 1, "the player as payer: sent");
});

test("2. the KOIN Vault request carries only the session, the operations and mana 'auto' or 'wallet' (real sendVault, vaultApi, creds)", async () => {
  const creds = w.match(/  const creds = \(\) => \(\{[^\n]*\n/)[0];
  let body = null;
  const make = new Function("env", `const W = env.W, VAULT = "https://vault.example", STATUS_CALLS = new Set(["request-status"]);
    const fetch = async (url, init) => { env.body = init.body ? JSON.parse(init.body) : null; return { ok: false, status: 400, json: async () => ({ ok: false, error: "stop" }) }; };
    const dropVault = () => {}, connectVault = async () => null, h = () => null, open = () => {}, sleep = async () => {};
    ${creds}
    ${fnSrc("vaultApi")}
    const VAULT_OWN_MANA = 10000000000n;
    ${fnSrc("vaultManaMode")}
    ${fnSrc("sendVault")}
    return sendVault;`);
  // M-843: "wallet" only when the wallet holds KOIN Vault's 100 Mana ceiling (base units 1e8), otherwise "auto"; a failed read is "auto".
  const env = { W: { address: "1Player", session: { sessionId: "s1", secret: "x" }, provider: { getAccountRc: async () => "9999999999" } } };
  await assert.rejects(make(env)("change", [op], { noSponsor: true }));
  body = env.body;
  assert.deepEqual(Object.keys(body).sort(), ["mana", "operations", "secret", "sessionId"]);
  assert.equal(body.mana, "auto", "99.99999999 Mana: below the ceiling");
  env.W.provider = { getAccountRc: async () => "10000000000" };
  await assert.rejects(make(env)("change", [op], { noSponsor: true }));
  assert.equal(env.body.mana, "wallet", "exactly 100 Mana");
  env.W.provider = { getAccountRc: async () => { throw new Error("rpc down"); } };
  await assert.rejects(make(env)("change", [op], { noSponsor: true }));
  assert.equal(env.body.mana, "auto", "a failed read never blocks");
  assert.doesNotMatch(JSON.stringify(body), /payer|sponsor|1ByDDSBUzy5zkRceELc54Jh8i41yNRoKt8/i);
  // And no line anywhere in the wallet builds a KOIN Vault request with a payer or the sponsor.
  for (const line of w.split("\n").filter((l) => /vaultApi\("request"/.test(l))) assert.doesNotMatch(line, /payer|sponsor/i);
});

test("3. samePick: two 64-bit picks that differ in the last bit are different picks (BigInt, not Number)", () => {
  assert.equal(SP.samePick("18446744073709551615", "18446744073709551614"), false);
  assert.equal(SP.samePick("9007199254740993", "9007199254740992"), false, "just above 2^53");
  assert.equal(SP.samePick("09007199254740993", "9007199254740993"), true, "same value");
  assert.equal(SP.plan([{ key: "k", op, existing: "9007199254740993", wanted: "9007199254740992" }]).changes.length, 1);
});
