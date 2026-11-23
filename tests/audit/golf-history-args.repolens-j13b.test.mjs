// Repo Lens #J-13b (Golf Clubhouse history, head 0e7b5cb), J13b-1 (Low, test). Place in tests/audit/.
// Run from the repository root: TZ=UTC node --import tsx --test --test-concurrency=1 tests/audit/golf-history-args.repolens-j13b.test.mjs
// The two nodes must agree on each operation's ARGUMENTS too (who burned, who registered a key, whose stake moved), not only
// on its contract and entry point. Otherwise node 1 alone decides the wallet, and a feature can count that node 2 doesn't show.
// Passes on 0e7b5cb; fails if histKey stops comparing args.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const APP = process.env.APP || ".";
const { samePage, newestBoth, POB_CONTRACT } = await import(path.resolve(APP, "bot/games/golf.ts"));
const { Contract, Signer } = await import("koilib");
const [A, B] = [0, 1].map((i) => Signer.fromSeed(`j13b wallet ${i}`).getAddress());
const ADDR_T = { type: "bytes", options: { "(koinos.btype)": "ADDRESS" } }, U64_T = { type: "uint64", options: { jstype: "JS_STRING" } };
const pob = new Contract({ id: POB_CONTRACT, abi: { methods: { burn: { entry_point: 0x859facc5, argument: "p.burn_arguments", return: "p.empty", read_only: false } },
  koilib_types: { nested: { p: { nested: { burn_arguments: { fields: { token_amount: { ...U64_T, id: 1 }, burn_address: { ...ADDR_T, id: 2 }, vhp_address: { ...ADDR_T, id: 3 } } }, empty: { fields: {} } } } } } } });
const burn = async (seq, who) => ({ seq_num: String(seq), trx: { transaction: { id: "0xabc", operations: [{ call_contract: { ...(await pob.encodeOperation({ name: "burn", args: { token_amount: "100000000", burn_address: who, vhp_address: who } })).call_contract } }] }, receipt: { id: "0xabc" } } });

test("J13b-1: the same contract and entry point with different arguments is a disagreement (oldest-first and newest page)", async () => {
  const forA = await burn(5, A), forB = await burn(5, B);
  assert.equal(samePage([forA], [forB]), false, "who burned differs between the nodes");
  assert.equal(newestBoth([forA], [forB]), null, "who burned differs between the nodes");
  assert.equal(samePage([forA], [await burn(5, A)]), true, "control: the same burn agrees");
});
