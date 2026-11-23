// Repo Lens #R3-8 (Combo D, KG2 #63 @ 47cbb6f): once picks-data/deployment.json records Picks v2, the owner tools accept
// ONLY v2 on chain (FC-27); the audited v1 there would be a downgrade and nothing may be signed. On 47cbb6f, removing the
// FC-27 rule passed every test. Offline: fake contract metadata, no node is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertAuditedContract, PICKS_SHA256, PICKS_V2_SHA256 } from "../../bot/picks.ts";
const recorded = JSON.parse(fs.readFileSync("picks-data/deployment.json", "utf8")).wasmSha256;
const net = { testnet: false, picks: "1P" };
const at = (hash: string) => async () => ({ exists: true, hash: "0x1220" + hash, call: true, tx: true, upload: true });
test("R3-8: with Picks v2 recorded, v1 on chain is refused and v2 is accepted", { skip: recorded !== PICKS_V2_SHA256 && "deployment.json does not record v2 yet" }, async () => {
  await assertAuditedContract(net, {} as any, at(PICKS_V2_SHA256) as any, undefined, []);
  await assert.rejects(assertAuditedContract(net, {} as any, at(PICKS_SHA256) as any, undefined, []), /not the expected Picks build/);
});
test("R3-8: the recorded Picks code is v2 (this PR) and hashes.json says the same", () => {
  assert.equal(recorded, PICKS_V2_SHA256);
  const h = JSON.parse(fs.readFileSync("contracts/hashes.json", "utf8")).picks;
  assert.equal(h.live, PICKS_V2_SHA256); assert.equal(h.source, PICKS_V2_SHA256);
});
