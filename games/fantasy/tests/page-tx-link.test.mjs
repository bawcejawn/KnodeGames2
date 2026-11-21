// Owner, Mon 16 Nov (rebuilt on the shared Send my picks card, Fri 20 Nov): the saved dialogs for a team and a Rival
// challenge show the whole transaction id, a Copy button and a koinosscan link, built with textContent and attributes
// only (no HTML strings), and only for a well-formed id.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const js = fs.readFileSync(path.join(ROOT, "web/fantasy.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "web/fantasy.css"), "utf8");

test("team and Rival dialogs: full id, Copy, explorer link; no cut-off id", () => {
  assert.match(js, /const TX_EXPLORER = "https:\/\/koinosscan\.com\/tx\/";/);
  assert.match(js, /if \(!\/\^0x\[0-9a-f\]\{20,\}\$\/i\.test\(s\)\) return null;/);
  assert.match(js, /rel: "noopener noreferrer", text: "View on koinosscan"/);
  assert.equal((js.match(/txLine\(id\)\]\.filter\(Boolean\)/g) || []).length, 2, "team save and Rival challenge");
  assert.equal((js.match(/const id = r\.ids\[r\.ids\.length - 1\];/g) || []).length, 2, "both take the last id from the shared card");
  assert.doesNotMatch(js, /String\(id\)\.slice\(0, 18\)/);
  const fn = js.slice(js.indexOf("function txLine"), js.indexOf("function txLine") + 900);
  assert.doesNotMatch(fn, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(css, /\.fx-tx \.mono \{ overflow-wrap: anywhere;/);
});

test("txLine: a real tx id gets the line; anything else gets nothing", () => {
  const src = js.slice(js.indexOf("  const TX_EXPLORER"), js.indexOf("\n  }\n", js.indexOf("  function txLine")) + 4);
  const made = [];
  const el = (tag, attrs = {}, ...kids) => { const e = { tag, attrs, kids, textContent: attrs.text }; made.push(e); return e; };
  const txLine = new Function("el", "navigator", `${src}; return txLine;`)(el, {});
  for (const bad of [null, undefined, "", "0x12", "abc", "0x" + "g".repeat(40), "javascript:alert(1)", 42]) assert.equal(txLine(bad), null, String(bad));
  const id = "0x1220" + "ab".repeat(32);
  const line = txLine(id);
  assert.equal(line.attrs.class, "fx-tx");
  const a = made.find((e) => e.tag === "a");
  assert.equal(a.attrs.href, "https://koinosscan.com/tx/" + id);
  assert.equal(a.attrs.target, "_blank");
  assert.equal(a.attrs.rel, "noopener noreferrer");
  assert.ok(made.some((e) => e.tag === "p" && e.textContent === `Transaction ${id}`), "the whole id, not cut off");
});
