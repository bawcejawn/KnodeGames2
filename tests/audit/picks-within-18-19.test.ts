// Picks games 18 (Within 5 blocks) and 19 (Within 10 blocks), mainnet: the exact shape the announce sends. The shape can never
// change once applied (id, kind, list_size, number range, lock_mode, round_size, round_offset), so every field is pinned.
// Repo Lens 2 #R2-19 section 2: the table is the same as game 12 (same targets), written without lockMode so it is a BLOCK-locked game.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const T: any = await import("../../bot/picks.ts");
const want = (id: number, name: string) => ({
  id, name, kind: 1, list_size: 1, number_min: "0", number_max: "0", lock_mode: 1,
  round_size: "1200", round_offset: "0", lead: "100", ahead: "14500", max_picks_per_day: 48, max_changes: 1, enabled: true,
});
const mainnet = () => T.network(false);
const byId = (id: number) => mainnet().games.find((g: any) => g.id === id);

test("Picks game 18 (Within 5 blocks) and 19 (Within 10 blocks): exactly the shape the owner announces", () => {
  assert.deepEqual(T.buildGameConfig(T.WITHIN5_GAME), want(18, "Within 5 blocks"));
  assert.deepEqual(T.buildGameConfig(T.WITHIN10_GAME), want(19, "Within 10 blocks"));
  for (const g of [T.WITHIN5_GAME, T.WITHIN10_GAME]) assert.ok(!("leg_types" in T.buildGameConfig(g)), "a one-pick height game has no leg_types key");
});

test("games 18 and 19 are BLOCK-locked like game 12 (a lockMode 2 entry would be a different, permanent shape)", () => {
  for (const g of [T.WITHIN5_GAME, T.WITHIN10_GAME]) {
    assert.equal(g.lockMode, undefined, "no lockMode: buildGameConfig takes the height-game path");
    assert.equal(T.buildGameConfig(g).lock_mode, 1);
  }
  // A time-locked variant goes down another path and is NOT this config.
  const wrong = T.buildGameConfig({ ...T.WITHIN5_GAME, lockMode: 2, kind: 1, listSize: 1, round: 86400000, lead: 300000, ahead: 86400000 });
  assert.notEqual(wrong.lock_mode, 1);
});

test("games 18 and 19 use the same targets as game 12: same round size and offset (target X = round x 1,200)", () => {
  const g12 = byId(12);
  for (const g of [T.WITHIN5_GAME, T.WITHIN10_GAME]) {
    assert.equal(g.round, g12.round); assert.equal(g.offset, g12.offset);
    assert.equal(g.lead, g12.lead); assert.equal(g.ahead, g12.ahead);
  }
  assert.equal(g12.round, 1200); assert.equal(g12.offset, 0);
});

test("the mainnet list is 12 games; 18 and 19 are appended, nothing moved or dropped", () => {
  const m = mainnet();
  assert.equal(m.games.length, 12);
  assert.deepEqual(m.games.map((g: any) => g.id), [2, 12, 9, 4, 5, 8, 3, 13, 16, 17, 18, 19]);
  assert.equal(byId(18), T.WITHIN5_GAME); assert.equal(byId(19), T.WITHIN10_GAME);
});

test("every other game's announce config is unchanged (sha256 of the ten configs on main before this change)", () => {
  const ten = mainnet().games.filter((g: any) => g.id !== 18 && g.id !== 19).map((g: any) => T.buildGameConfig(g));
  assert.equal(ten.length, 10);
  const sha = crypto.createHash("sha256").update(JSON.stringify(ten)).digest("hex");
  assert.equal(sha, "2604fbe038f09335368cd6128a79769e3e3b56ed5f6e695ac42bc3eb2da724d0", "update only if another game's shape was meant to change");
});

test("an announcement of exactly this shape can be applied; any other shape is refused at apply", () => {
  for (const [g, id] of [[T.WITHIN5_GAME, 18], [T.WITHIN10_GAME, 19]] as const) {
    const cfg = T.buildGameConfig(g);
    assert.equal(T.pendingProblem(cfg, g), null);
    assert.match(String(T.pendingProblem({ ...cfg, lock_mode: 2 }, g)), /lock_mode/);
    assert.match(String(T.pendingProblem({ ...cfg, round_size: "1201" }, g)), /round_size/);
    assert.match(String(T.pendingProblem({ ...cfg, kind: 2 }, g)), /kind/);
    assert.match(String(T.pendingProblem({ ...cfg, max_changes: 2 }, g)), /max_changes/);
    assert.match(String(T.pendingProblem({ ...cfg, name: "x" }, g)), /name/);
    assert.equal(cfg.id, id);
  }
});

test("a worked round: round r has target r x 1,200, locks 100 blocks before it and opens 14,500 blocks before it", () => {
  const r = 5_000_000, target = r * 1200;
  const c = T.buildGameConfig(T.WITHIN5_GAME);
  assert.equal(target - Number(c.lead), target - 100);
  assert.equal(target - Number(c.ahead), target - 14500);
  assert.equal((Number(c.ahead) - Number(c.lead)) / Number(c.round_size) | 0, 12, "12 targets open at once");
});

test("names are 1 to 40 bytes and carry no slash", () => {
  for (const g of [T.WITHIN5_GAME, T.WITHIN10_GAME]) { assert.ok(Buffer.byteLength(g.name) >= 1 && Buffer.byteLength(g.name) <= 40); assert.ok(!g.name.includes("/")); }
});
