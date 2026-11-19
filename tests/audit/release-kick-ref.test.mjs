// Repo Lens J14-1 (KG2 #8): the PC's release check reads today's question file from the game-data branch. In
// KnodeGames2 main has no question files, so reading ?ref=main would always say "not out": false alerts and extra bot
// starts after cutover.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DATA_REF, todaysFilePath } from "../../bot/release-kick.mjs";

test("release check: today's question file is read from game-data, never main", () => {
  assert.equal(DATA_REF, "game-data");
  assert.equal(todaysFilePath("bawcejawn/KnodeGames2", "2026-11-22"), "/repos/bawcejawn/KnodeGames2/contents/game-data/questions/2026-11-22.json?ref=game-data");
  const src = fs.readFileSync("bot/release-kick.mjs", "utf8");
  assert.match(src, /gh\("GET", todaysFilePath\(REPO, label\), null, false\)/, "todaysFile uses the path above");
  assert.doesNotMatch(src, /contents\/game-data\/[^`"]*\?ref=main/, "no question read from main");
  assert.match(src, /const REPO = process\.env\.HEAL_REPO \|\| "bawcejawn\/KnodeGames2";/);
});
