// Repo Lens #J-17b (RL-2), KnodeGames2 PR #15 (reconstructed head, J17-6): the Race rule is "picked in 3 or more RACES",
// not "made 3 or more picks". A wallet with several horses in ONE race must not be compared. EXPECTED TO PASS on the
// reconstructed #J-17b head; it FAILS if the filter counts picks (l.length >= MIN_RACE_PICKS) instead of distinct races
// (a mutation the PR's own J17-6 test does not catch).
// Save as tests/audit/identical-picks-races-not-picks.repolens-r2.test.ts and add it to the "test" line in package.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PICKS_OF, MIN_RACE_PICKS, identicalGroups } from "../../bot/identical-picks.ts";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb";

test("J17-6: three horses in one race is one race, so nobody is compared", () => {
  assert.equal(MIN_RACE_PICKS, 3);
  const row = (a: string, h: string) => [a, h, 1, 0, 0, 0];
  const wf = { races: [{ start: 100, result: { picks: [row(A, "1H1"), row(A, "1H2"), row(A, "1H3"), row(B, "1H1"), row(B, "1H2"), row(B, "1H3")] } }] };
  const p = PICKS_OF[7](wf);
  assert.equal(p.size, 0, "one race only: not compared, however many horses");
  assert.deepEqual(identicalGroups(p, [A, B]), []);
});

test("J17-6: the same wallets over three different races are compared", () => {
  const row = (a: string, h: string) => [a, h, 1, 0, 0, 0];
  const wf = { races: [100, 200, 300].map((start) => ({ start, result: { picks: [row(A, "1H1"), row(B, "1H1")] } })) };
  const p = PICKS_OF[7](wf);
  assert.deepEqual([...p.keys()].sort(), [A, B]);
  assert.deepEqual(identicalGroups(p, [A, B]), [[A, B]]);
});
