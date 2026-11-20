// Picks games 16 (Over Under, rolling) and 17 (Knode Games VS), owner D-325 to D-351: the exact config
// `npm run picks -- announce 16` and `announce 17` send. A registered shape can never change, so every field is pinned.
// VS's number_max is 2^64 − 1, above JavaScript's safe integers: it must travel as an exact decimal string.
import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../../bot/picks.ts";

const HALF_HOUR = 1800000;

test("game 16 sends exactly rolling Over Under's values (30-min starts, 2 h window, 1 = Over, 2 = Under, no changes)", () => {
  assert.deepEqual(T.buildGameConfig(T.OVERUNDER_GAME), {
    id: 16, name: "Over Under", kind: 3, list_size: 0, number_min: "1", number_max: "2", lock_mode: 2,
    round_size: "1800000", round_offset: "0", lead: "300000", ahead: "7200000",
    max_picks_per_day: 50, max_changes: 0, enabled: true,
  });
});

test("game 17 sends exactly VS's values (one 24 h round from 00:00 UTC, u64, no changes)", () => {
  assert.deepEqual(T.buildGameConfig(T.VS_GAME), {
    id: 17, name: "Knode Games VS", kind: 3, list_size: 0, number_min: "0", number_max: "18446744073709551615", lock_mode: 2,
    round_size: "86400000", round_offset: "0", lead: "300000", ahead: "172800000",
    max_picks_per_day: 20, max_changes: 0, enabled: true,
  });
});

test("VS's number_max is exactly 2^64 − 1, as a string, with nothing rounded", () => {
  const c: any = T.buildGameConfig(T.VS_GAME);
  assert.equal(typeof c.number_max, "string");
  assert.equal(BigInt(c.number_max), 2n ** 64n - 1n);
  assert.equal(T.U64_MAX, ((1n << 64n) - 1n).toString());
  assert.notEqual(c.number_max, String(Number(c.number_max)), "a Number would round it to 18446744073709552000");
});

test("both are ones the mainnet tool registers, each once", () => {
  const ids = T.network(false).games.map((g: any) => g.id);
  assert.ok(ids.includes(16) && ids.includes(17));
  assert.equal(new Set(ids).size, ids.length, "no game id twice");
});

test("Over Under: a game starts every 30 min UTC; picks open 2 h before and lock 5 min before; 4 open at once", () => {
  const now = Date.parse("2026-11-23T16:30:00Z");
  const rs = T.timeRounds(T.OVERUNDER_GAME, now, 6);
  assert.equal(rs[0].target, "2026-11-23T17:00:00.000Z");
  assert.equal(rs[0].round, Date.parse("2026-11-23T17:00:00Z") / HALF_HOUR);
  assert.equal(rs[0].locks, "2026-11-23T16:55:00.000Z");
  assert.equal(rs[0].opens, "2026-11-23T15:00:00.000Z");
  for (let i = 1; i < rs.length; i++) assert.equal(Date.parse(rs[i].target) - Date.parse(rs[i - 1].target), HALF_HOUR);
  const open = rs.filter((x) => Date.parse(x.opens) <= now && now < Date.parse(x.locks));
  assert.equal(open.length, 4, "4 games open for picks at any moment");
});

test("Over Under: 48 starts a day fit under 50 picks a day (one pick each, no changes)", () => {
  assert.equal(86400000 / T.OVERUNDER_GAME.round, 48);
  assert.ok(48 * (1 + T.OVERUNDER_GAME.maxChanges) <= T.OVERUNDER_GAME.picksPerDay);
});

test("VS: one round a UTC day, locking 5 minutes before 00:00 UTC, open 2 days ahead", () => {
  const [r] = T.timeRounds(T.VS_GAME, Date.parse("2026-11-24T12:00:00Z"));
  assert.equal(r.round, 20782, "Wed 25 Nov 2026 is day 20782");
  assert.equal(r.target, "2026-11-25T00:00:00.000Z");
  assert.equal(r.locks, "2026-11-24T23:55:00.000Z");
  assert.equal(r.opens, "2026-11-23T00:00:00.000Z");
});

test("an out-of-range or unsafe setting is refused", () => {
  const bad = [
    { numberMax: "18446744073709551616" }, { numberMax: 18446744073709551615 }, { numberMax: "-1" }, { numberMax: "1e19" },
    { numberMax: "007" }, { numberMax: "" }, { numberMin: "3", numberMax: "2" },
    { lockMode: 1 }, { lead: 299999 }, { ahead: 300000 }, { ahead: 36 * 86400000 },
    { picksPerDay: 51 }, { maxChanges: 51 }, { id: 128 }, { name: "x".repeat(41) },
  ];
  for (const g of [T.OVERUNDER_GAME, T.VS_GAME])
    for (const b of [...bad, { offset: g.round }]) assert.throws(() => T.buildGameConfig({ ...g, ...b }), undefined, `${g.id} ${JSON.stringify(b)}`);
});

test("an announcement with any other value is refused at apply", () => {
  const other: Record<number, [string, any][]> = {
    16: [["round_size", "43200000"], ["ahead", "172800000"], ["number_min", "0"], ["number_max", "3"], ["max_changes", 2], ["max_picks_per_day", 20]],
    17: [["round_size", "43200000"], ["number_max", "18446744073709551614"], ["number_max", "18446744073709552000"], ["max_changes", 2], ["max_picks_per_day", 50]],
  };
  for (const g of [T.OVERUNDER_GAME, T.VS_GAME]) {
    const ok: any = T.buildGameConfig(g);
    assert.equal(T.pendingProblem(ok, g), null);
    for (const [k, v] of [...other[g.id], ["lead", "600000"], ["round_offset", "1"], ["list_size", 1], ["kind", 1]] as [string, any][])
      assert.ok(T.pendingProblem({ ...ok, [k]: v }, g), `${g.id}: ${k} = ${v} must be refused`);
  }
});

test("the Bracket (game 9) is unchanged: still its own 2^31 − 1 rule", () => {
  assert.equal((T.buildGameConfig(T.BRACKET_GAME) as any).number_max, String(2 ** 31 - 1));
  assert.throws(() => T.buildGameConfig({ ...T.BRACKET_GAME, numberMax: 2 ** 31 }), /2\^31/);
});
