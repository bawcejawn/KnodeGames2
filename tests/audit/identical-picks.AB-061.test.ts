// Audit AB-061, owner's option A (O-31): a weekly notice when staked wallets with points made exactly the same picks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PICKS_OF, COVERED, weekFileSpec, identicalGroups, identicalNotice } from "../../bot/identical-picks.ts";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb", C = "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCc", D = "1DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDd";

test("AB-061: the week file sits next to the game's vault folder", () => {
  assert.equal(weekFileSpec("race-data:vault", 4), "race-data:W004.json");
  assert.equal(weekFileSpec("games-data:bracket/vault", 12), "games-data:bracket/W012.json");
  assert.equal(weekFileSpec("games-data:bracket/vault/", 5), "games-data:bracket/W005.json");
  assert.deepEqual(COVERED, [7, 9]);
});

test("AB-061: Race picks: every (race, horse) of the week; same set = same picks, order doesn't matter", () => {
  const wf = { races: [
    { start: 100, result: { picks: [[A, "1H1", 1, 1, 0, 0], [B, "1H1", 2, 1, 0, 0], [C, "1H2", 3, 0, 0, 1]] } },
    { start: 200, result: { picks: [[B, "1H3", 4, 0, 0, 0], [A, "1H3", 5, 0, 0, 0], [C, "1H3", 6, 0, 0, 0]] } },
    { start: 300, result: { final: false } },
  ] };
  const p = PICKS_OF[7](wf);
  assert.equal(p.get(A), p.get(B));
  assert.notEqual(p.get(A), p.get(C));
  assert.deepEqual(identicalGroups(p, [A, B, C, D]), [[A, B]]);
});

test("AB-061: Bracket picks: the bracket number", () => {
  const p = PICKS_OF[9]({ picks: { rows: [[A, 77, 1], [B, 77, 2], [C, 77, 3], [D, 12, 4]] } });
  assert.deepEqual(identicalGroups(p, [A, B, C, D]), [[A, B, C]]);
  assert.deepEqual(identicalGroups(p, [A, D]), [], "only the wallets asked about (the week's scorers) count");
});

test("AB-061: odd files compare nothing, and the notice names the groups and says nothing is held", () => {
  for (const wf of [null, {}, { races: "x" }, { picks: { rows: [["x"]] } }]) { assert.equal(PICKS_OF[7](wf).size, 0); assert.equal(PICKS_OF[9](wf).size, 0); }
  assert.equal(identicalNotice("Producer Race", 4, []), "");
  const t = identicalNotice("Producer Race", 4, [[A, B, C], [C, D]]);
  assert.match(t, /^Producer Race week 4: some winning wallets may be playing as one: 2 group\(s\) made exactly the same picks: 3 wallets \(/);
  assert.match(t, /Nothing is held \(audit AB-061, owner's option A\)/);
});
