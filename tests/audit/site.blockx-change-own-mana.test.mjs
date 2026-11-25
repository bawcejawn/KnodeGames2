// Block X: a pick change (D-743 / D-278, Vault M-522). Games 2 and 12 allow 1 change per pick (Picks max_changes). A change is
// never in a batch, is asked first, and is paid with the player's own Mana (noSponsor); the Rules say so in those words.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../web/blockx.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../../web/blockx.js", import.meta.url), "utf8");
const X = (await import("../../web/blockx-math.js"), globalThis.KBlockX);

test("the Rules sentence matches Picks max_changes for games 2 and 12 (1) and says 'with your own Mana'", () => {
  assert.equal(X.MAINNET_GAME.maxChanges, 1); assert.equal(X.MAINNET_HOURLY.maxChanges, 1);
  assert.match(html, /You can change a pick <span data-bx="changesw">once<\/span>, with your own Mana, until it locks/);
  assert.doesNotMatch(html, /Change your pick until it locks/, "no sentence promises free changes");
  assert.match(js, /changesw: G\.MAX_CHANGES === 1 \? "once"/, "the word follows the shown game's own max_changes");
  assert.match(js, /You can change it \$\{changesWord\(\)\}, with your own Mana, until it locks\./);
  assert.match(js, /Until then you can change it \$\{changesWord\(\)\}, with your own Mana/);
});

test("a change is never in a batch: 'Add to my picks' only for a first pick, and the batch re-reads the chain", () => {
  assert.match(js, /const add = batchOn\(\) && !mineP \?/);
  const q = js.slice(js.indexOf("async function sendQueue"), js.indexOf("async function sendPick"));
  assert.match(q, /picksContract\.functions\.get_pick\(/, "each queued round is read from the chain before sending");
  assert.match(q, /rounds\.filter\(\(r, i\) => !have\[i\]\)/, "a round that already has a pick is left out");
  assert.match(q, /Couldn't check your picks", \["Nothing was sent/, "fails closed when the read fails");
  assert.doesNotMatch(q, /noSponsor/, "the batch carries first picks only");
  assert.match(q, /catch \{ return pickModal\("bad", "Couldn't check your picks"/, "R4-31 L-1: the batch fails closed");
  assert.match(q, /\$\{changes \? `; \$\{changes\} already had a pick/, "R4-31 L-3: the sent line says when changes were left out");
});

test("a single change: read from the chain, asked first, own Mana only, never a guest, sent with noSponsor", () => {
  const p = js.slice(js.indexOf("async function sendPick"));
  assert.match(p, /picksContract\.functions\.get_pick\([\s\S]{0,500}catch \{ return pickModal\("bad", "Couldn't check your pick"/, "fails closed");
  assert.match(p, /if \(n >= G\.MAX_CHANGES\) return pickModal\("info", "Already changed"/);
  assert.match(p, /W\.kind === "guest" \|\| !\(have >= CHANGE_MANA\)\) return pickModal\("info", "Your first pick stays"/);
  assert.match(p, /if \(!\(await askChange\(/);
  assert.match(js, /const CHANGE_MANA = 1\.0;/, "R4-31 L-2: Vault's 1.0 Mana figure");
  assert.match(p, /W\.send\([^\n]*, \[operation\], change \? \{ noSponsor: true \} : \{\}\)/);
  assert.match(js, /"Cancel"\),\s*el\("button", \{ class: "btn", type: "button", onclick: \(\) => \{ closeModal\(\); done\(true\); \} \}, "Confirm change"\)/, "Cancel first");
});
