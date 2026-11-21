// Repo Lens #J-18 (KnodeGames2 PR #14 @ 1a91421, audit AB-062): lookalike letters from scripts the fix doesn't map still
// pass okPool. The CONFUSABLE table covers Cyrillic and Greek, and mixedScript checks only those two, so Latin small
// capitals (ᴏ ɴ ᴋ), Latin alpha (ɑ), Armenian (օ ո), Coptic (ⲟ), Cherokee (Ꮶ), Canadian syllabics (ᑯ) and Lisu (ꓒ)
// next to Latin letters still show, for example "Kᴏinos Team" or "Knօde Games". EXPECTED TO FAIL on 1a91421; passes
// with candidate-fix-j18-1.diff (a name with a Latin letter must fold to plain a-z / 0-9).
import { test } from "node:test";
import assert from "node:assert/strict";
await import("../../web/names.js");
const R = globalThis.KNames.rules;

test("J18-1: lookalikes from other scripts next to Latin letters are refused as pool names", () => {
  for (const n of ["Kᴏinos Team", "Kɴode Games", "ᴋnode Games", "Kɑinos Team", "Armɑna", "Knօde Games", "Kոode Games",
    "Kօinos Team", "Knⲟde Games", "Ꮶnode Games", "Knoᑯe Games", "Knoꓒe"]) assert.equal(R.okPool(n), false, n);
});

test("J18-1: honest names still show (accented Latin, one other script, ordinary Latin)", () => {
  for (const n of ["café pool", "Pool Ñandú", "Bjørn Pool", "Łódź Pool", "Straße Pool", "Ærø Node", "Пул Москва", "Blocknode", "Armana", "Koinos Pool Ltd 2", "Rocket 🚀 Pool"].filter((x) => !R.reserved(x)))
    assert.equal(R.okPool(n), true, n);
});
