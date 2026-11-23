// M-448 (owner, 23 Nov): on the weekly board the leader sat at the finish with ~121 hours to go. The typed boards'
// finish line (KRaceMath.ledgerLine) needs a card for every hour of the race; hours after the last recorded 6-hour race
// had none, so the line was 0 and the leader was drawn at the finish. The page now uses the card in force for them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const js = readFileSync(new URL("../../web/race.js", import.meta.url), "utf8");
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../../web/race-math.js", import.meta.url), "utf8"), ctx);
const M = ctx.window.KRaceMath;

test("M-448: rtBoard's finish line falls back to the card in force for hours with no card yet", () => {
  const i = js.indexOf("function rtBoard("), body = js.slice(i, js.indexOf("function rtTabs(", i));
  assert.match(body, /M\.ledgerLine\(cur, \(h\) => cardAt\(rtype, h\) \|\| card\)/);
});

test("M-448: a weekly race one day in is about 1/6 of the way, not at the finish", () => {
  const race = M.typedRace(4, M.typedIndex(4, Date.UTC(2026, 10, 24, 12)));
  const card = { field: [{ a: "x", k: 100, h: 1, vhp: 1 }] }, known = race.start + 24 * M.HOUR;
  const only = (h) => (h < known ? card : null);
  assert.equal(M.ledgerLine(race, only), null, "without the fallback there is no line");
  const line = M.ledgerLine(race, (h) => only(h) || card);
  assert.ok(line > 0);
  const [r] = M.track([{ a: "x", steps: line / 6 }], line, false);
  assert.ok(r.x > 0.1 && r.x < 0.25, `x = ${r.x}`);
  const [old] = M.track([{ a: "x", steps: line / 6 }], 0, false);
  assert.ok(Math.abs(old.x - M.LIVE_MAX) < 1e-9, "the old drawing: the leader at the finish");
});
