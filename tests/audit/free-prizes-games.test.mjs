// The prizes tool knows every vault game with a free-prize switch, including Over Under (16) and Knode Games VS (17):
// `npm run prizes -- off 16` must be accepted (D-573: Over Under's free prize OFF to start).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GAMES, setSwitch, empty, switchFor, prizeOn, weekStart } from "../../bot/free-prizes.ts";

test("the prizes tool lists games 16 Over Under and 17 Knode Games VS, and keeps 1 to 13 unchanged", () => {
  assert.equal(GAMES["16"], "Over Under");
  assert.equal(GAMES["17"], "Knode Games VS");
  assert.deepEqual(Object.keys(GAMES).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 6, 7, 8, 9, 13, 16, 17]);
  assert.equal(GAMES["13"], "Last Node Standing");
  assert.equal(GAMES["1"], "Daily Questions");
});

test("turning game 16 off in week 5 holds its prize from week 6 on, never the week in progress", () => {
  const now = weekStart(5) + 2 * 86_400_000;   // Wed of vault week 5
  const { next, from } = setSwitch(empty(), 16, false, now);
  assert.equal(from, 6);
  assert.equal(switchFor(next, 16, 6), false);
  assert.equal(switchFor(next, 16, 5), null);   // week 5 follows the registration (not changed)
  assert.equal(prizeOn(next, 16, 6), false);      // the bot posts no Over Under free winners from week 6
  assert.equal(prizeOn(next, 9, 6), true);        // other games untouched
});

test("a game the vault doesn't have is still refused", () => {
  assert.throws(() => setSwitch(empty(), 18, false, weekStart(5)), /isn't a vault game/);
});
