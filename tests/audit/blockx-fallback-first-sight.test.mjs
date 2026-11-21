// Repo Lens #R3-1, R3-1.1: the 48-hour fallback is made only for a target an EARLIER run already saw waiting, so one
// failed data load on the first look at an old target can never make a final old-points entry.
// (Written by the Block X chat from the finding; Repo Lens's own test file replaces this one if it is saved.)
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const APP = path.resolve(process.env.APP || ".");
const { R, timeline, X } = await import(path.join(APP, "tests/audit/blockx-ruler.fixture.mjs"));
const BR = await import(path.join(APP, "bot/blockx-ruler.ts"));
const H = 3600000;
const T_X = 1792368000000 + 4 * 7 * 86400000 + 86400000 + 6 * H;
const signer = R.ledger(timeline()).signer(X);
const t = { round: Math.floor(X / 1200), height: X, final: true, checked: 2, signer, time: T_X, lockTime: T_X - 300000, card: null, picks: [] };

test("first sight at 50 hours with the data missing: it waits, it does not become a final fallback", () => {
  const e = BR.entryFor(null, t, 100, T_X + 50 * H, null, true);
  assert.equal(BR.isFallback(e), false);
  assert.equal(e.void, false);
  assert.match(e.note, /^not yet/);
});

test("the next run, which now has that waiting entry, makes the fallback", () => {
  const first = BR.entryFor(null, t, 100, T_X + 50 * H, null, true);
  const next = BR.entryFor(null, t, 100, T_X + 51 * H, first, true);
  assert.equal(BR.isFallback(next), true);
});

test("first sight at 50 hours with the data present: the normal ruler entry, never a fallback", () => {
  const e = BR.entryFor(R.ledger(timeline()), t, 100, T_X + 50 * H, null, true);
  assert.equal(BR.isFallback(e), false);
  assert.notEqual(e.card, null);
});

test("an earlier entry that already has a card is never turned into a fallback", () => {
  const card = BR.entryFor(R.ledger(timeline()), t, 100, T_X + 10 * H, null, true);
  const again = BR.entryFor(null, t, 100, T_X + 60 * H, card, true);
  assert.equal(BR.isFallback(again), false);
  assert.equal(again.card, card.card);
});

test("an earlier void entry stays void, not a fallback", () => {
  const voided = BR.entryFor(null, { ...t, void: true }, 100, T_X + 60 * H, null, true);
  const again = BR.entryFor(null, t, 100, T_X + 70 * H, voided, true);
  assert.equal(BR.isFallback(again), false);
});

test("shadow weeks still never make one, even with an earlier waiting entry", () => {
  const first = BR.entryFor(null, t, 100, T_X + 10 * H, null, false);
  assert.equal(BR.isFallback(BR.entryFor(null, t, 100, T_X + 60 * H, first, false)), false);
});
