// Repo Lens #R3-4 (Block X PR #32 @ cdca1ec): pins two guards no test held.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BATCH_TEST_MAX_RC } from "../../bot/picks.ts";
const src = fs.readFileSync("bot/picks.ts", "utf8");
const body = src.slice(src.indexOf("async function batchTest("), src.indexOf("function buildTestnet()"));
test("R3-4.1: the most Mana one batch-test may ask for is 8 (a number, not only the constant's name)", () => {
  assert.equal(BATCH_TEST_MAX_RC, 8);
});
test("R3-4.2: a send stops when the test wallet holds more than 1 Mana of its own, before anything is signed", () => {
  const i = body.indexOf("if (koin > toSat(1)) throw");
  assert.ok(i > 0, "the empty-wallet guard is there");
  assert.ok(i < body.indexOf("new Transaction("), "and it comes before the transaction is built");
  assert.ok(i < body.indexOf("tx.send()"));
});
