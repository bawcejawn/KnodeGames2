// Repo Lens #L-10 ask 1: Survivor's own clock (games/survivor/math.js) and its game id (game.json) must equal the Picks
// game 3 entry the bot registers (bot/picks.ts SURVIVOR_GAME, PR #11). A registered Picks shape can never change, so the
// two must not drift: if one side moves, this fails.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../math.js";
import { SURVIVOR_GAME } from "../../../bot/picks.ts";
import { page } from "./load-page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const game = JSON.parse(fs.readFileSync(path.join(ROOT, "games/survivor/game.json"), "utf8"));

test("Survivor's math.js, game.json and page limits equal bot/picks.ts SURVIVOR_GAME", () => {
  assert.equal(SURVIVOR_GAME.id, S.GAME_ID, "game id (math.js)");
  assert.equal(SURVIVOR_GAME.id, game.picks.gameId, "game id (game.json)");
  assert.equal(SURVIVOR_GAME.round, S.DAY, "one round = one UTC day");
  assert.equal(SURVIVOR_GAME.offset, 0, "rounds start 00:00 UTC");
  assert.equal(SURVIVOR_GAME.lead, S.LEAD_MS, "lock 5 minutes before the day");
  assert.equal(SURVIVOR_GAME.ahead, S.AHEAD_MS, "opens 7 days ahead");
  assert.equal(SURVIVOR_GAME.lockMode, 2, "locks by time");
  assert.equal(SURVIVOR_GAME.kind, 1, "one producer per pick");
  assert.equal(SURVIVOR_GAME.listSize, 1, "one producer per pick");
  assert.equal(SURVIVOR_GAME.maxChanges, page.MAX_CHANGES, "changes per pick (the page)");
  assert.equal(SURVIVOR_GAME.picksPerDay, page.PICKS_PER_DAY, "picks per day (the page)");
  // the values themselves, so a change on both sides at once still shows here
  assert.deepEqual([S.DAY, S.LEAD_MS, S.AHEAD_MS, S.GAME_ID, page.MAX_CHANGES, page.PICKS_PER_DAY], [86400000, 300000, 604800000, 3, 5, 20]);
});
