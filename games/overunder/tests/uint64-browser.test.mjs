// Over/Under pick numbers go up to 2^64 - 1. In a browser koilib writes a uint64 through the `long` library; with none
// loaded it goes through a JavaScript number and rounds above 2^53 (RL-5 R5-1). Node tests never see that, so this test
// runs koilib the way a page does (a script in a window with no modules), with and without `long` loaded first.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import * as F from "../math.js";

const ROOT = new URL("../../../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), "utf8");
const abi = JSON.parse(read("contracts/picks/abi/picks.koilib.json"));
const KOILIB = read("node_modules/koilib/dist/koinos.min.js"), LONG = read("node_modules/long/umd/index.js");
const html = read("web/overunder.html");
const PLAYER = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";

/** A pick number as the chain would be given it: build the operation with the page's call, then read the number back. */
async function numberOnWire(n, withLong) {
  const win = { TextEncoder, TextDecoder, crypto: globalThis.crypto, console, setTimeout, clearTimeout, URL, fetch() {} };
  win.window = win; win.self = win;
  const ctx = vm.createContext(win);
  if (withLong) vm.runInContext(LONG, ctx);
  vm.runInContext(KOILIB, ctx);
  const lib = ctx.koilib || ctx.koinos || ctx.window;   // the page does the same: window.koilib || window.koinos || window
  const c = new lib.Contract({ id: "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm", abi, provider: { call() {} } });
  const { operation } = await c.functions.pick({ player: PLAYER, game: 16, round: "1", producers: [], number: n }, { onlyOperation: true });
  return String((await c.decodeOperation(operation)).args.number);
}
const NUMBERS = ["9007199254740993", "6148914691236517205", "12297829382473034410", "18446744073709551615", "1", "0"];

test("with long loaded first, every pick number from 0 to 2^64 - 1 comes back exact (2^53 + 1 and 2^64 - 1 included)", async () => {
  for (const n of NUMBERS) assert.equal(await numberOnWire(n, true), n, `number ${n}`);
});

test("the numbers the game itself builds (full 32-row numbers) come back exact", async () => {
  const roster = { rows: Array.from({ length: 64 }, (_, i) => ({ a: `1${String(i).padStart(2, "0")}${"A".repeat(30)}`, line: 1 })) };
  const all = Object.fromEntries(roster.rows.map((x, i) => [x.a, i % 3 ? "under" : "over"]));
  for (const n of F.encodePicks(roster, all)) assert.equal(await numberOnWire(n, true), n);
});

test("without long the same numbers are rounded (why the page must load it): the test would catch the missing script", async () => {
  assert.notEqual(await numberOnWire("9007199254740993", false), "9007199254740993");
  assert.notEqual(await numberOnWire("18446744073709551615", false), "18446744073709551615");
});

test("the page loads long@5.3.2 BEFORE koilib, pinned by integrity, and its CSP allows exactly that file", () => {
  const long = html.indexOf("npm/long@5.3.2/umd/index.js\" integrity=\"sha384-"), koi = html.indexOf("<script src=\"https://cdn.jsdelivr.net/npm/koilib@");
  assert.ok(long > 0 && koi > 0 && long < koi, "long is a script before koilib");
  const tag = html.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/long@5\.3\.2\/umd\/index\.js" integrity="(sha384-[A-Za-z0-9+/=]+)" crossorigin="anonymous"><\/script>/);
  assert.ok(tag, "the long script tag has an integrity hash and crossorigin");
  assert.equal(tag[1], "sha384-" + crypto.createHash("sha384").update(fs.readFileSync(new URL("node_modules/long/umd/index.js", ROOT))).digest("base64"), "the pin is the hash of the file in the npm package long@5.3.2");
  const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
  assert.ok(csp.split(";").find((d) => d.trim().startsWith("script-src")).split(/\s+/).includes("https://cdn.jsdelivr.net/npm/long@5.3.2/umd/index.js"));
});
