// Picks games 16 (Over Under) and 17 (Knode Games VS), owner D-290 / D-302: the exact config `npm run picks -- announce 16`
// and `announce 17` send. A registered shape can never change, so every field is pinned. number_max is 2^64 − 1, above
// JavaScript's safe integers: it must travel as an exact decimal string, never through a Number.
import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../../bot/picks.ts";

const want = (id: number, name: string) => ({
  id, name, kind: 3, list_size: 0, number_min: "0", number_max: "18446744073709551615", lock_mode: 2,
  round_size: "86400000", round_offset: "0", lead: "300000", ahead: "172800000",
  max_picks_per_day: 20, max_changes: 2, enabled: true,
});

test("game 16 sends exactly Over Under's D-290 values", () => {
  assert.deepEqual(T.buildGameConfig(T.OVERUNDER_GAME), want(16, "Over Under"));
});

test("game 17 sends exactly Knode Games VS's D-290 values", () => {
  assert.deepEqual(T.buildGameConfig(T.VS_GAME), want(17, "Knode Games VS"));
});

test("number_max is exactly 2^64 − 1, as a string, with nothing rounded", () => {
  for (const g of [T.OVERUNDER_GAME, T.VS_GAME]) {
    const c: any = T.buildGameConfig(g);
    assert.equal(typeof c.number_max, "string");
    assert.equal(BigInt(c.number_max), 2n ** 64n - 1n);
    assert.equal(T.U64_MAX, ((1n << 64n) - 1n).toString());
    assert.notEqual(c.number_max, String(Number(c.number_max)), "a Number would round it to 18446744073709552000");
  }
});

test("both are ones the mainnet tool registers, each once", () => {
  const ids = T.network(false).games.map((g: any) => g.id);
  assert.ok(ids.includes(16) && ids.includes(17));
  assert.equal(new Set(ids).size, ids.length, "no game id twice");
});

test("rounds: one a UTC day, locking 5 minutes before 00:00 UTC, open 2 days ahead", () => {
  const [r] = T.timeRounds(T.OVERUNDER_GAME, Date.parse("2026-11-24T12:00:00Z"));
  assert.equal(r.round, 20782, "Wed 25 Nov 2026 is day 20782");
  assert.equal(r.target, "2026-11-25T00:00:00.000Z");
  assert.equal(r.locks, "2026-11-24T23:55:00.000Z");
  assert.equal(r.opens, "2026-11-23T00:00:00.000Z");
});

test("an out-of-range or unsafe number range is refused", () => {
  const bad = [
    { numberMax: "18446744073709551616" },          // 2^64
    { numberMax: 18446744073709551615 },            // a Number, not a string
    { numberMax: "-1" }, { numberMax: "1e19" }, { numberMax: "007" }, { numberMax: "" },
    { numberMin: "5", numberMax: "4" },
    { lockMode: 1 }, { lead: 299999 }, { ahead: 300000 }, { ahead: 36 * 86400000 },
    { picksPerDay: 51 }, { maxChanges: 51 }, { id: 128 }, { name: "x".repeat(41) },
  ];
  for (const b of bad) assert.throws(() => T.buildGameConfig({ ...T.OVERUNDER_GAME, ...b }), undefined, JSON.stringify(b));
});

test("an announcement with any other value is refused at apply", () => {
  for (const g of [T.OVERUNDER_GAME, T.VS_GAME]) {
    const ok: any = T.buildGameConfig(g);
    assert.equal(T.pendingProblem(ok, g), null);
    for (const [k, v] of [["number_max", "18446744073709551614"], ["number_max", "18446744073709552000"], ["max_changes", 3],
      ["lead", "600000"], ["ahead", "604800000"], ["max_picks_per_day", 10], ["round_size", "43200000"], ["list_size", 1], ["kind", 1]] as const)
      assert.ok(T.pendingProblem({ ...ok, [k]: v }, g), `${g.id}: ${k} = ${v} must be refused`);
  }
});

test("the Bracket (game 9) is unchanged: still its own 2^31 − 1 rule", () => {
  assert.equal((T.buildGameConfig(T.BRACKET_GAME) as any).number_max, String(2 ** 31 - 1));
  assert.throws(() => T.buildGameConfig({ ...T.BRACKET_GAME, numberMax: 2 ** 31 }), /2\^31/);
});
