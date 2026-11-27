// D-945 / M-847: the guest "Collect to another wallet" screen is built but UNWIRED (the contract calls claim_to /
// claim_game_to arrive with v6.2). These tests pin: the address check, the refusals, and that nothing is reachable yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const koilib = createRequire(APP + "/")("koilib");
const walletSrc = fs.readFileSync(`${APP}/web/wallet.js`, "utf8");
const guestSrc = fs.readFileSync(`${APP}/web/guest.js`, "utf8");
const MAINNET = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const GAME = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr", DESK = "1FKTpXBhhHEbu5vVchM8UsVbAvPArJsRmR", SPONSOR = "1ByDDSBUzy5zkRceELc54Jh8i41yNRoKt8";

function load() {
  const mk = (tag) => ({ tag, attrs: {}, kids: [], style: {}, setAttribute() {}, addEventListener() {}, append() {}, remove() {}, textContent: "" });
  const document = { createElement: mk, getElementById: () => null, head: mk("head"), body: mk("body"), documentElement: { style: {} } };
  const store = { getItem: () => null, setItem() {}, removeItem() {} };
  const win = { location: { protocol: "https:", hostname: "knodegames.com" }, koilib, crypto: webcrypto, localStorage: store, confirm: () => true, navigator: {} };
  win.top = win; win.self = win;
  const ctx = { window: win, document, localStorage: store, sessionStorage: store, navigator: { userAgent: "t", maxTouchPoints: 0, platform: "x" }, crypto: webcrypto,
    console, setTimeout, clearTimeout, Promise, URL, URLSearchParams, JSON, BigInt, Uint8Array, Array, Number, String, Object, Map, Set, Error, Math, Date, RegExp };
  vm.createContext(ctx); vm.runInContext(guestSrc, ctx); vm.runInContext(walletSrc, ctx);
  win.KWallet.init({ provider: { getChainId: async () => MAINNET, getAccountRc: async () => "0" }, chainId: MAINNET, payer: "sponsor", toast() {}, status() {},
    sponsor: { address: SPONSOR, covers: [GAME, DESK], tokens: [], rcLimit: "100000000", guest: true }, onChange() {} });
  return win.KWallet;
}

test("D-945: isKoinosAddress accepts real addresses and refuses a mistyped one", async () => {
  const KW = load();
  const real = koilib.Signer.fromSeed("collect-to test seed").address;
  for (const a of [real, GAME, DESK, SPONSOR]) assert.equal(await KW.isKoinosAddress(a), true, a);
  const mutated = real.slice(0, -1) + (real.endsWith("a") ? "b" : "a");
  for (const bad of [mutated, real.slice(1), real + "1", "", "0x" + "a".repeat(40), "1Invalid0OIl", null, undefined, 12])
    assert.equal(await KW.isKoinosAddress(bad), false, String(bad));
  for (let i = 0; i < real.length; i++) {   // any single changed character breaks the checksum
    const c = real[i] === "z" ? "y" : "z";
    if (c !== real[i]) assert.equal(await KW.isKoinosAddress(real.slice(0, i) + c + real.slice(i + 1)), false, `char ${i}`);
  }
});

test("D-945: Knode Games addresses are refused as a recipient, an ordinary address is not", async () => {
  const KW = load();
  for (const a of [GAME, DESK, SPONSOR]) assert.match(await KW.recipientProblem(a), /Knode Games address/, a);
  assert.match(await KW.recipientProblem("1abc"), /valid Koinos address/);
  assert.equal(await KW.recipientProblem(koilib.Signer.fromSeed("friend").address), "");
});

test("D-945: unwired, nothing is reachable: the screen is off, and refuses to open", () => {
  const KW = load();
  assert.equal(KW.claimToOn(), false, "no entry points yet, so off");
  assert.equal(KW.guestCollectTo({ amount: "1 VHP", send: async () => {} }), false);
  assert.match(walletSrc, /const CLAIM_TO = null, CLAIM_GAME_TO = null;/, "both entry points unset until Vault's reply");
  // guestOp is unchanged until it is wired, so a guest still signs only answers and picks.
  assert.doesNotMatch(walletSrc.slice(walletSrc.indexOf("const guestOp"), walletSrc.indexOf("// Owner switch")), /CLAIM_TO|CLAIM_GAME_TO/);
});

test("D-945: the screen's words: back-up warning first, full address, amount, can't be undone, never filled in", () => {
  const src = walletSrc.slice(walletSrc.indexOf("function guestCollectTo"), walletSrc.indexOf("function guestCant"));
  assert.ok(src.indexOf("Back up your guest key first.") > 0 && src.indexOf("Back up your guest key first.") < src.indexOf("Type or paste the Koinos address"), "warning comes before the address field");
  assert.match(src, /This can't be undone/);
  assert.match(src, /Amount: \$\{ctx\.amount\}/);
  assert.match(src, /It is never filled in for you/);
  assert.doesNotMatch(src, /location|URLSearchParams|input\.value\s*=/, "never filled from the page address or a link");
  assert.match(src, /W\.kind !== "guest"/, "guest wallets only");
});
