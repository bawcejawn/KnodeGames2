// Block X capacity (Capacity chat, 13 Nov): readPicks stops LOUDLY past 100,000 picks for one target, never a quiet
// cut at the limit (before, the loop ended after 1,000 pages of 100 and returned what it had). Offline: a fake page reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const APP = process.env.APP || ".";
const { pagePicks, MAX_PICKS_PER_TARGET, TooManyPicks } = await import(path.resolve(APP, "bot/games/blockx.ts"));

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const addr = (i) => { let s = "1", n = i + 1; while (s.length < 34) { s += B58[n % 58]; n = Math.floor(n / 58) + 7 * s.length; } return s; };
const PROD = addr(10 ** 9);
/** A fake list_picks: `n` players, pages of `size`, start_after = the last player of the page before. */
function pages(n, size = 100) {
  const players = Array.from({ length: n }, (_, i) => addr(i));
  const at = new Map(players.map((p, i) => [p, i]));
  let calls = 0;
  const page = async (after) => {
    calls++;
    const from = after === undefined ? 0 : at.get(after) + 1;
    return players.slice(from, from + size).map((p, k) => ({ player: p, pick: { producers: [PROD], time: String(1000 + from + k) } }));
  };
  return { page, calls: () => calls };
}

test("the limit is 100,000 picks a target", () => {
  assert.equal(MAX_PICKS_PER_TARGET, 100000);
});

test("reads every page until an empty one (a few picks, many pages)", async () => {
  const f = pages(250);
  const got = await pagePicks(f.page, 7);
  assert.equal(got.length, 250);
  assert.equal(f.calls(), 4);   // 100 + 100 + 50 + the empty page
  assert.deepEqual(got[0], { player: addr(0), producer: PROD, time: 1000 });
});

test("exactly at the limit is read whole (no quiet cut, no error)", async () => {
  const f = pages(1000, 10);
  const got = await pagePicks(f.page, 7, () => {}, 1000);
  assert.equal(got.length, 1000);
});

test("past the limit it stops loudly, naming the round, and returns nothing", async () => {
  const f = pages(1001, 10);
  await assert.rejects(() => pagePicks(f.page, 34204, () => {}, 1000), (e) => e instanceof TooManyPicks && /round 34204 has more than 1,000 picks/.test(e.message));
  // It stopped on the page that went over, not after reading everything a node might send.
  assert.equal(f.calls(), 101);
});

test("the real limit: 100,001 picks stops loudly (the old loop returned exactly 100,000 with no error)", async () => {
  const f = pages(100001);
  await assert.rejects(() => pagePicks(f.page, 1), TooManyPicks);
});

test("rows that aren't valid picks still count toward the limit, so a node can't keep it reading for ever", async () => {
  let i = 0;
  const page = async () => Array.from({ length: 100 }, () => ({ player: `bad${i++}`, pick: { producers: [] } }));
  await assert.rejects(() => pagePicks(page, 3, () => {}, 500), TooManyPicks);
});

test("a page that doesn't move forward (the same last key again) stops loudly instead of looping", async () => {
  const same = [{ player: addr(1), pick: { producers: [PROD], time: "5" } }];
  await assert.rejects(() => pagePicks(async () => same, 9), /didn't move forward/);
});

test("the re-read's deadline is checked before every page", async () => {
  const f = pages(300);
  let n = 0;
  await assert.rejects(() => pagePicks(f.page, 2, () => { if (++n > 2) throw new Error("out of time"); }), /out of time/);
  assert.equal(f.calls(), 2);
});
