// Repo Lens #G-18 (Last Node fix-check 3 @ 796a2cc): failing tests. Place in tests/audit/ next to lastnode-vault.helpers.mjs.
// They run the REAL publish shell extracted from lastnode.yml (publisher() in the helpers), Linux only (bash), as the
// round-2 tests do. Run: node --import tsx --test tests/audit/repolens-lastnode3.test.mjs
import "./lib/quiet.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withBash } from "./lib/platform.mjs";
const APP = fileURLToPath(new URL("../..", import.meta.url));
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const { publisher, voidDay, fieldCard, raceFiles, idx } = await import("./lastnode-vault.helpers.mjs");
const linux = withBash;

// LN3-1: a day file first published VOID is never checked: only a change from a published non-void day is ("made void
// while it can still be recorded", lastnode.yml:640, inside `if old is not None`). The recorder voids an event only at or
// after its lock (no card / no form / too few nodes) or 3 days after its start, so a void before the lock is never an
// honest run's; yet one bad record run can publish the NEXT event as void before the honest run publishes its field, and
// a void event can never change again (":639"). The event is cancelled for everyone (its picks never count), which also
// moves who reaches the free prize's 3 events. Fix: a NEW void day file only at or after its lock (or 3 days after its
// start), and "no race card for the field" only if race-data has no card in [card time, picks open).
linux("LN3-1: a bad run can't cancel tomorrow's event by publishing it void before its picks even open", () => {
  const day = "2026-11-17", start = Date.parse(`${day}T14:00:00Z`);
  const now = start - 26 * 3600000 + 30 * 60000;                       // 12:30 UTC the day before: the card is out, picks open at 13:55
  const pub = publisher();
  const race = raceFiles([fieldCard(day)]);
  const r = pub.publish({ [`D${day}.json`]: voidDay(day), "index.json": { ...idx, days: [day] } }, { KG_TEST_NOW: String(now), FAKE_RACE: race });
  assert.equal(pub.show(`D${day}.json`), null, `a void file for an event that hasn't locked (its race card is on race-data) was published:\n${r.out.slice(-600)}`);
});

// LN3-2: D-159 / I-103 (owner, 5 Nov, every standard): free-prize ties pay up to 10 per place; more than 10 tied pays
// exactly 10 (earlier score time, then address), never zero. freePlaces (bot/games/lastnode.ts:456-463) empties the place,
// and the README says so. Last Node's points are small whole numbers, so big ties are likely. The switch is OFF today.
// Fix: keep the first 10 of the group (by the time the score was reached, then address) in freePlaces and in the publish
// job's recompute of first / second; update the README.
const { freePlaces } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
test("LN3-2: eleven wallets tied for 1st: exactly 10 are paid, never an empty place", () => {
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const prizes = Array.from({ length: 11 }, (_, i) => ({ player: "1" + B58[i] + "A".repeat(32), place: 1 }));
  const r = freePlaces(prizes);
  assert.equal(r.first.length, 10, `more than 10 tied must pay exactly 10 (D-159), got ${r.first.length}: ${r.problems.join("; ")}`);
});

// LN3-1, as the blind verifier widened it: no race card is needed (a void with field null skips every race-data and chain
// check), so ANY future day can be voided; and a void reason the recorder's loadDay cuts differently (Python len counts
// code points, JavaScript's slice(0, 200) UTF-16 units) makes every honest rewrite "a void event changed": all publishing
// stops. Fix: also refuse a day file whose start is more than one day ahead of the job's clock, and cap the reason in
// UTF-16 units (or ASCII only) in the shape check.
linux("LN3-1b: a void file for a day months ahead, with no race data at all, is refused", () => {
  const day = "2027-03-01", pub = publisher();
  pub.publish({ [`D${day}.json`]: voidDay(day), "index.json": { ...idx, days: [day] } }, { KG_TEST_NOW: String(Date.parse("2026-11-16T09:00:00Z")), FAKE_RACE: raceFiles([]) });
  assert.equal(pub.show(`D${day}.json`), null, "a void file for a day months ahead was published");
});
linux("LN3-1c: a void reason the recorder would cut differently (150 emoji) is refused at its first publish", () => {
  const day = "2026-11-20", pub = publisher(), bad = { ...voidDay(day), void: "\u{1F600}".repeat(150) };
  pub.publish({ [`D${day}.json`]: bad, "index.json": { ...idx, days: [day] } }, { KG_TEST_NOW: String(Date.parse("2026-11-16T09:00:00Z")), FAKE_RACE: raceFiles([]) });
  assert.equal(pub.show(`D${day}.json`), null, "published: every honest rewrite (loadDay's slice(0, 200)) is then refused as 'a void event changed'");
});
