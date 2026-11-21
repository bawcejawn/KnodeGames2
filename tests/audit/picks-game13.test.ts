// Picks game 13, Last Node Standing (mainnet): the exact shape the announce sends. The shape can never change once applied,
// so every field is pinned here, and checked against the game's own rules (web/lastnode-math.js MAINNET_GAME, which arrives with the Last Node PR).
import { test } from "node:test";
import assert from "node:assert/strict";

test("Picks game 13 (Last Node Standing): exactly the shape the owner announces, never anything else", async () => {
  const T: any = await import("../../bot/picks.ts");
  const cfg = T.buildGameConfig(T.LASTNODE_GAME);
  assert.deepEqual(cfg, {
    id: 13, name: "Last Node Standing", kind: 2, list_size: 2, number_min: "0", number_max: "0", lock_mode: 2,
    round_size: "86400000", round_offset: "50100000", lead: "300000", ahead: "86400000", max_picks_per_day: 10, max_changes: 5, enabled: true,
  });
  assert.equal(T.pendingProblem(cfg, T.LASTNODE_GAME), null, "an announcement of exactly this shape can be applied");
  assert.match(String(T.pendingProblem({ ...cfg, max_changes: 50 }, T.LASTNODE_GAME)), /max_changes/, "any other shape is refused at apply");
});

test("Picks game 13's rounds: the first live event (Tue 24 Nov 2026, 14:00 UTC) locks at 13:50 UTC and opens 24 hours ahead", async () => {
  const T: any = await import("../../bot/picks.ts");
  const [r] = T.timeRounds(T.LASTNODE_GAME, Date.parse("2026-11-23T14:00:00Z"));
  assert.deepEqual(r, { round: 20781, target: "2026-11-24T13:55:00.000Z", opens: "2026-11-23T13:55:00.000Z", locks: "2026-11-24T13:50:00.000Z" });
});
