// Repo Lens 2 (#12 status, Sat 21 Nov): the "acts for this wallet" rule of a key registration and a stake move had no test.
// Another wallet's register_public_key or move_stake in this wallet's history must not count for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.env.APP || ".";
const { historyFacts, POB_CONTRACT } = await import(path.resolve(APP, "bot/games/golf.ts"));
const { Contract, Signer } = await import("koilib");
const R = Array.from({ length: 2 }, (_, i) => Signer.fromSeed(`golf clubhouse actor test ${i}`).getAddress());
const VAULT = Signer.fromSeed("golf clubhouse actor test vault").getAddress();
const ADDR_T = { type: "bytes", options: { "(koinos.btype)": "ADDRESS" } };
const pob = new Contract({ id: POB_CONTRACT, abi: { methods: {
  register_public_key: { entry_point: 0x53192be1, argument: "p.register_public_key_arguments", return: "p.empty", read_only: false } },
  koilib_types: { nested: { p: { nested: {
    register_public_key_arguments: { fields: { producer: { ...ADDR_T, id: 1 }, public_key: { type: "bytes", id: 2 } } },
    empty: { fields: {} } } } } } } });
const vault = new Contract({ id: VAULT, abi: JSON.parse(fs.readFileSync(path.join(APP, "contracts/vault/abi/kpred.koilib.json"), "utf8")) });
async function trx(seq, op) {
  const e = await op;
  return { seq_num: String(seq), trx: { transaction: { id: "0x" + seq, operations: [{ call_contract: { ...e.call_contract } }] }, receipt: { id: "0x" + seq } } };
}
const keyOp = (a) => pob.encodeOperation({ name: "register_public_key", args: { producer: a, public_key: "AiAeY4PIK6GLlepslYHfS0_gFgRaYIfqarbOEIuo0Qc" } });
const moveOp = (a) => vault.encodeOperation({ name: "move_stake", args: { player: a, from_game: 1, to_game: 2, amount: "100000000" } });
const NONE = { burn: false, move: false, key: false };

test("a producer key registered for ANOTHER wallet does not count; for this wallet it does", async () => {
  const [a, b] = R;
  assert.deepEqual(await historyFacts(a, [await trx(1, keyOp(b))], VAULT), NONE);
  assert.deepEqual(await historyFacts(a, [await trx(1, keyOp(a))], VAULT), { ...NONE, key: true });
});

test("a stake moved for ANOTHER player does not count; for this wallet it does", async () => {
  const [a, b] = R;
  assert.deepEqual(await historyFacts(a, [await trx(1, moveOp(b))], VAULT), NONE);
  assert.deepEqual(await historyFacts(a, [await trx(1, moveOp(a))], VAULT), { ...NONE, move: true });
});
