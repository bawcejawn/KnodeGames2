// Picks game 3 (Survivor, owner D-246): the exact config `npm run picks -- announce 3` sends must be the Survivor chat's
// values (claude/survivor/TO-CHATS-SURVIVOR-BUILT-2026-11-14.md). A registered shape can never change, so every field is pinned.
import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../../bot/picks.ts";

test("game 3 sends exactly Survivor's values", () => {
  assert.deepEqual(T.buildGameConfig(T.SURVIVOR_GAME), {
    id: 3, name: "Survivor", kind: 1, list_size: 1, number_min: "0", number_max: "0", lock_mode: 2,
    round_size: "86400000", round_offset: "0", lead: "300000", ahead: "604800000",
    max_picks_per_day: 20, max_changes: 5, enabled: true,
  });
});

test("game 3 is one the mainnet tool registers, and only once", () => {
  const ids = T.network(false).games.map((g: any) => g.id);
  assert.ok(ids.includes(3));
  assert.equal(new Set(ids).size, ids.length, "no game id twice");
});

test("Survivor's rounds: one a UTC day, locking 5 minutes before 00:00 UTC, open 7 days ahead", () => {
  const [r] = T.timeRounds(T.SURVIVOR_GAME, Date.parse("2026-11-29T12:00:00Z"));
  assert.equal(r.round, 20787, "Mon 30 Nov 2026 is day 20787");
  assert.equal(new Date(r.target).toISOString(), "2026-11-30T00:00:00.000Z");
  assert.equal(new Date(r.locks).toISOString(), "2026-11-29T23:55:00.000Z");
});

test("an announcement with any other value is refused at apply", () => {
  const ok = T.buildGameConfig(T.SURVIVOR_GAME);
  assert.equal(T.pendingProblem(ok, T.SURVIVOR_GAME), null);
  for (const [k, v] of [["max_changes", 20], ["lead", "600000"], ["ahead", "86400000"], ["max_picks_per_day", 10], ["round_offset", "1"]] as const)
    assert.ok(T.pendingProblem({ ...ok, [k]: v }, T.SURVIVOR_GAME), `${k} = ${v} must be refused`);
});
