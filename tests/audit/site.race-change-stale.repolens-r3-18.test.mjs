// Repo Lens #R3-18 (Race #102 @ f551299): "a change can never reach the sponsor from this page" must hold even when
// the page's own list of the player's picks is out of date (it is re-read only every 60 s). Case: the player picked
// this race from another device or tab after the page loaded; then taps Pick here on another horse. On chain that is
// a CHANGE, so the page must re-read the pick right before signing, ask first, and never send it sponsored.
// Needs race-dom-harness.mjs (with #102's `race` option) next to it.
// Run: TZ=UTC node --import tsx --test --test-concurrency=1 <this file>
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as H from "./race-dom-harness.mjs";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const { A, Bp, C, D } = H;
const FIN = "2026-11-07T12", LIVE = "2026-11-07T18", NOW = Date.parse("2026-11-07T21:00:00Z");
const field = [[A, 300, 1], [Bp, 200, 1.5], [C, 100, 3]];
const prevSt = [{ a: C, steps: 40, blocks: 13, last: 1 }, { a: A, steps: 30, blocks: 30, last: 2 }, { a: Bp, steps: 20, blocks: 13, last: 3 }];
const blocks = (T) => { const ts = [], sig = []; for (let t = T - 7 * 3600000, i = 0; t <= T; t += 20000, i++) { ts.push(t); sig.push(i % 10 < 6 ? 0 : i % 10 < 9 ? 1 : 2); } return { ts, sig, signers: [A, Bp, C], from: 1, top: ts.length }; };
const pickBtn = (p, a) => p.doc.querySelector(`#track .pr-lane[data-addr="${a}"] .rt-pk`);

test("R3-18: a pick made elsewhere after the page loaded: tapping another horse is a change, asked first, never sponsored", async () => {
  await import(`${APP}web/race-math.js`);
  const next = String(globalThis.KRaceMath.raceIndex(NOW) + 1), race = { wallet: D, picks: {}, mana: 12.5 };
  const p = await H.boot({ app: APP, now: NOW, files: { "W002.json": H.weekFile(2, FIN, LIVE, prevSt, field) }, vhp: { [A]: 300, [Bp]: 200, [C]: 100 }, blocks, race });
  await p.tick(6000); await p.settle();
  race.picks[next] = { horse: A, changes: 0 };          // picked from the player's phone; this page has not re-read yet
  const b = pickBtn(p, Bp); assert.ok(b && !b.disabled);
  b.click(); await p.settle();
  for (const s of race.sent) assert.equal(s.opts.noSponsor, true, "a change went out sponsored (D-278 / D-743)");
  assert.equal(race.sent.length, 0, "nothing is sent on one tap: the change is asked first");
  assert.match(p.doc.querySelector(".pk-modal").textContent, /Change your pick\?/);
});

test("R3-18: the 6-hour list's Change button also obeys the 1-change cap (the chain's stored changes): 'Already changed', nothing sent", async () => {
  await import(`${APP}web/race-math.js`);
  const next = String(globalThis.KRaceMath.raceIndex(NOW) + 1), race = { wallet: D, picks: { [next]: { horse: A, changes: 1 } }, mana: 12.5 };
  const p = await H.boot({ app: APP, now: NOW, files: { "W002.json": H.weekFile(2, FIN, LIVE, prevSt, field) }, vhp: { [A]: 300, [Bp]: 200, [C]: 100 }, blocks, race });
  await p.tick(6000); await p.settle();
  const row = [...p.doc.querySelectorAll("#pk-list .pk-row")].find((r) => [...r.querySelectorAll("button")].some((b) => b.textContent === "Change"));
  assert.ok(row, "the next race's row offers Change");
  const sel = row.querySelector("select"), btn = [...row.querySelectorAll("button")].find((b) => b.textContent === "Change");
  sel.value = Bp; sel.dispatchEvent(new p.win.Event("change")); btn.click(); await p.settle();
  assert.equal(race.sent.length, 0);
  assert.match(p.doc.querySelector(".pk-modal").textContent, /Already changed/);
});
