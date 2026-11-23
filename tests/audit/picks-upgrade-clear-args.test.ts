// Sun 22 Nov: `npm run picks -- upgrade-clear --send` stopped with "Invalid hex" before signing, because the tool sent
// { hash: "0x" }. The clear now sends an empty hash, which koilib encodes and the contract treats as "clear"
// (schedule_upgrade: a missing, empty or all-zero hash clears the announced upgrade). Needed before the Picks handover:
// owner-propose refuses while an upgrade is announced.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Contract, Provider } from "koilib";
import { CLEAR_UPGRADE_ARGS } from "../../bot/picks.ts";

const abi = JSON.parse(fs.readFileSync("contracts/picks/abi/picks.koilib.json", "utf8"));
const contract = () => new Contract({ id: "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm", abi, provider: new Provider(["http://127.0.0.1:1"]) });

test("upgrade-clear's arguments encode (no 'Invalid hex') and carry no hash", async () => {
  const op = await contract().encodeOperation({ name: "schedule_upgrade", args: { ...CLEAR_UPGRADE_ARGS } });
  assert.equal(op.call_contract?.args?.length ?? 0, 0, "an empty message: the contract reads a missing hash and clears");
});

test("the old arguments are the ones koilib refused", async () => {
  await assert.rejects(contract().encodeOperation({ name: "schedule_upgrade", args: { hash: "0x" } }), /Invalid hex/);
});

test("the tool sends CLEAR_UPGRADE_ARGS, not a literal hash", () => {
  const src = fs.readFileSync("bot/picks.ts", "utf8");
  assert.match(src, /"schedule_upgrade", CLEAR_UPGRADE_ARGS\)/);
  assert.doesNotMatch(src, /"schedule_upgrade", \{ hash: "0x" \}/);
});
