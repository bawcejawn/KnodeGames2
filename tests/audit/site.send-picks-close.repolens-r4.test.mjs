// Repo Lens #R4-2, R4-2.4 (check E): closing the "Change it?" card in any way answers "keep", nothing is sent, and the
// page's `sending` flag is always reset. Written by Architecture from the reply (#R4-2b compares Repo Lens 4's own).
// Run: node --test tests/audit/site.send-picks-close.repolens-r4.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("web/fantasy.js", "utf8");
const i = src.indexOf("  let asking = null;"), j = src.indexOf("\n  }\n", src.indexOf("  function ask(title)")) + 4;
assert.ok(i > 0 && j > i);
const CODE = src.slice(i, j).replace(/const okBtn = [^\n]*\n/, "");

const within = (p) => { let t; return Promise.race([p, new Promise((r) => { t = setTimeout(() => r("no answer"), 500); })]).finally(() => clearTimeout(t)); };
function card() {
  const env = { buttons: [] };
  const make = new Function("env", `let modal = { hidden: false, querySelectorAll: () => [] };
    const el = (tag, attrs, text) => { const b = { ...attrs, text }; env.buttons.push(b); return b; };
    const pop = () => { modal.hidden = false; };
    ${CODE}
    return { ask, closePop, get modal() { return modal; } };`);
  return { ...make(env), env };
}

test("closePop (Escape, a click outside, OK) answers keep", async () => {
  const c = card();
  const answer = c.ask("Change?")(["your pick this round is X"]);
  c.closePop();
  assert.equal(await within(answer), false);
  assert.equal(c.modal.hidden, true);
});

test("Change it answers true, Keep my pick answers false, and a later close doesn't answer again", async () => {
  const a = card(); const p = a.ask("t")(["l"]);
  a.env.buttons.find((b) => b.text === "Change it").onclick();
  assert.equal(await within(p), true);
  a.closePop();   // nothing left to answer
  const b = card(); const q = b.ask("t")(["l"]);
  b.env.buttons.find((x) => x.text === "Keep my pick").onclick();
  assert.equal(await within(q), false);
});

test("every send resets `sending` in finally, so a closed card never leaves the page stuck", () => {
  for (const name of ["saveTeam", "sendRival"]) {
    const s = src.slice(src.indexOf(`async function ${name}()`));
    const body = s.slice(0, s.indexOf("\n  }\n"));
    assert.match(body, /sending = true;/, name);
    assert.match(body, /finally \{ sending = false;/, name);
    assert.match(body, /if \(!r\) \{ closePop\(\); return; \}/, `${name}: a "keep" answer sends nothing`);
  }
});
