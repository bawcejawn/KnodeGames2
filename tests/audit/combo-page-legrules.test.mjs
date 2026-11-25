// Combo page, fix-check FC-22 (Repo Lens Info on #123): the page turns cards on only when game 8's leg types on chain
// lock exactly as combo-math.js prices them, the same rule as the recorder (expectedLegTypes / settingsProblem, RL-25).
// Before this file nothing tested the page's side: deleting or loosening its check passed every test.
// Offline: the check is taken from web/combo.js as written and run on fake game-8 settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.env.APP || ".";
const { expectedLegTypes, settingsProblem } = await import(path.resolve(APP, "bot/games/combo.ts"));
const M = globalThis.KRaceMath, X = globalThis.KBlockX, C = globalThis.KCombo;
const js = fs.readFileSync(path.resolve(APP, "web/combo.js"), "utf8");

// The page's check, from "const want" up to the line that turns cards on. Its early "return" means "stay a builder".
const m = js.match(/\n(\s*const want = [^\n]+\n\s*for \(const t of \(Array\.isArray\(game\.leg_types\)[\s\S]*?\n\s*\}\n)(\s*liveMax = [^\n]+\n\s*cardsLive = true;)/);
test("FC-22: the page checks game 8's leg types right before it turns cards on", () => {
  assert.ok(m, "the FC-22 block (const want … for … leg_types …) must sit right before liveMax / cardsLive = true in web/combo.js");
  assert.match(js, /if \(!game \|\| Number\(game\.kind\) !== 4 \|\| !game\.enabled\) return;/, "a non-card or disabled game 8 keeps the page a builder");
});
const pageAccepts = new Function("C", "M", "X", "game", m[1].replace(/\breturn;/g, "return false;") + "\nreturn true;");
const accepts = (legs) => pageAccepts(C, M, X, { kind: 4, enabled: true, leg_types: legs });
const good = () => expectedLegTypes().map((t) => ({ ...t }));

test("FC-22: the page accepts exactly the recorder's leg types (and none announced yet)", () => {
  assert.equal(settingsProblem({ kind: 4, round_size: C.CARDS_PER_DAY, round_offset: 0, leg_types: good() }), null);
  assert.equal(accepts(good()), true);
  assert.equal(accepts([]), true, "no leg types yet: nothing to mismatch (the recorder agrees)");
  assert.equal(accepts(good().slice(0, 1)), true, "a subset is fine");
});

test("FC-22: any change in a lock rule, on any leg type, keeps the page a builder (as the recorder refuses it)", () => {
  let n = 0;
  for (let i = 0; i < 4; i++) {
    for (const k of ["lock_mode", "round_size", "round_offset", "lead", "ahead"]) {
      const legs = good();
      legs[i] = { ...legs[i], [k]: String(Number(legs[i][k] || 0) + 1) };
      assert.equal(accepts(legs), false, `leg type ${legs[i].code}: ${k} + 1 must be refused by the page`);
      assert.notEqual(settingsProblem({ kind: 4, round_size: C.CARDS_PER_DAY, round_offset: 0, leg_types: legs }), null, "and by the recorder");
      n++;
    }
  }
  assert.equal(n, 20);
});
