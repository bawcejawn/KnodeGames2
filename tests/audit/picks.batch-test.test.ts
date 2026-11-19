// The mainnet batch measurement (bot/picks.ts "batch-test", D-252 / D-254): the command line is strict, the sponsor
// question is the same bytes wallet.js asks, the wrong wallet is refused, and the command can only measure: it
// signs with BATCH_TEST_WIF alone, names only the live sponsor, and writes no setting. Offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { utils } from "koilib";
import { batchPlan, wouldPayArgs, batchWalletCheck, BATCH_SPONSOR, BATCH_TEST_MAX_RC } from "../../bot/picks.ts";

const W = "1KVazyq4idDuyKZTYQUvNNnzbzVzAgSQHA";
const src = fs.readFileSync("bot/picks.ts", "utf8");
const body = src.slice(src.indexOf("async function batchTest("), src.indexOf("function buildTestnet()"));

test("batchPlan reads the three planned measurements", () => {
  assert.deepEqual(batchPlan(["12", "--n", "2", "--wallet", W]), { game: 12, n: 2, alsoGame: null, alsoN: 0, rc: 2.4, wallet: W });
  assert.equal(batchPlan(["12", "--n", "5", "--wallet", W, "--rc", "7"]).rc, 7);
  const ten = batchPlan(["12", "--n", "5", "--also-game", "2", "--also-n", "5", "--wallet", W, "--rc", "7"]);
  assert.equal(ten.n + ten.alsoN, 10);
  assert.equal(ten.alsoGame, 2);
});

test("batchPlan refuses anything loose", () => {
  const bad = (a: string[], re: RegExp) => assert.throws(() => batchPlan(a), re);
  bad(["--n", "2", "--wallet", W], /The game/);
  bad(["12", "--wallet", W], /--n/);
  bad(["12", "--n", "0", "--wallet", W], /at least 1/);
  bad(["12", "--n", "11", "--wallet", W], /at most 10/);
  bad(["12", "--n", "6", "--also-game", "2", "--also-n", "5", "--wallet", W], /at most 10/);
  bad(["12", "--n", "5", "--also-game", "12", "--also-n", "5", "--wallet", W], /different game/);
  bad(["12", "--n", "5", "--also-n", "5", "--wallet", W], /needs --also-game/);
  bad(["12", "--n", "2"], /--wallet/);
  bad(["12", "--n", "2", "--wallet", "nope"], /--wallet/);
  bad(["12", "--n", "2", "--wallet", W, "--rc", "0"], /--rc/);
  bad(["12", "--n", "2", "--wallet", W, "--rc", String(BATCH_TEST_MAX_RC + 1)], /--rc/);
  bad(["12", "--n", "2", "--wallet", W, "--rc", "1e3"], /--rc/);
  bad(["12", "--n", "2", "--wallet", W, "--sponsor", "x"], /Unknown option/);
});

test("the sponsor question has the bytes wallet.js asks: payee, rc_limit, then one games entry each", () => {
  const b = wouldPayArgs(W, 240000000n, [12, 2]);
  const acct = utils.decodeBase58(W);
  assert.deepEqual([...b.subarray(0, 2 + acct.length)], [0x0a, acct.length, ...acct]);
  // 240000000 = 0x0E4E1C00 as a varint, then 0x28 12, 0x28 2
  assert.deepEqual([...b.subarray(2 + acct.length)], [0x10, 0x80, 0xb8, 0xb8, 0x72, 0x28, 12, 0x28, 2]);
  const wallet = fs.readFileSync("web/wallet.js", "utf8");
  assert.ok(wallet.includes("const bytes = [0x0a, acct.length, ...acct, 0x10];") && wallet.includes("bytes.push(0x28); push(g);"), "wallet.js still builds the question the same way");
  assert.ok(wallet.includes("WOULD_PAY = 0xda1fd8f5") && src.includes("WOULD_PAY_ENTRY = 0xda1fd8f5"));
});

test("the wrong key or a wallet that matters is refused", () => {
  assert.throws(() => batchWalletCheck("1Other11111111111111111111111111", W, {}), /not the wallet named/);
  assert.throws(() => batchWalletCheck(W, W, { [W]: "the Picks owner" }), /needs its own empty wallet/);
  assert.doesNotThrow(() => batchWalletCheck(W, W, { "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr": "the vault" }));
});

test("batch-test can only measure: pinned sponsor, one key, mainnet guard, no setting written", () => {
  assert.equal(BATCH_SPONSOR, "1ByDDSBUzy5zkRceELc54Jh8i41yNRoKt8");
  assert.ok(body.includes("sp.address !== BATCH_SPONSOR"), "refuses a settings file that names another sponsor");
  assert.ok(body.includes("payer: BATCH_SPONSOR"), "the payer is the pinned constant, not read from a file");
  assert.ok(body.includes('signerOf("BATCH_TEST_WIF", p)') && !/OWNER_WIF|PLAYER_WIF|OPERATOR_WIF"?\)/.test(body.replace(/for \(const k of \[[^\]]*\]\)/, "")), "signs with BATCH_TEST_WIF only");
  assert.ok(body.includes("mainnetGuard(net, send)") && body.includes("if (net.testnet) throw"), "mainnet only, with the send guards");
  assert.ok(body.includes("if (!send) {") && body.indexOf("if (!send) {") < body.indexOf("tx.send()"), "a dry run returns before anything is sent");
  assert.ok(body.includes("if (!yes) throw") && body.indexOf("if (!yes) throw") < body.indexOf("tx.send()"), "no send if the sponsor says no");
  assert.ok(!/deployment\.json"\)?,?\s*[a-zA-Z{]/.test(body.replace(/readJson\(path\.join\("game-data", "deployment\.json"\)\)/, "")), "reads deployment.json only");
  assert.ok(!/writeJson\([^)]*deployment/.test(body), "writes no deployment file");
  assert.ok(!/log\([^)]*WIF/.test(body), "never prints a key");
});

test("the Picks tool help lists batch-test and the key it uses", () => {
  assert.ok(src.includes("batch-test <game> --n N"));
  assert.ok(src.includes("BATCH_TEST_WIF  batch-test only"));
});
