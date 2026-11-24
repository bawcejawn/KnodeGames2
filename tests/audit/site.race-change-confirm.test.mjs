// D-743 / D-745 (owner, 23 Nov; Vault M-522): on the Producer Race page a pick that replaces one you already have for the
// same race is a CHANGE. The page allows 1 change per race (the contract counts changes but has no cap yet): it asks
// first ("You already have a pick for this race (X). Changing it uses your own Mana: about 0.9 (you have Y)." with
// Cancel and Confirm, "1 of 1 change left"), sends the change alone with the player's own Mana (noSponsor, D-278), and
// then greys the race's other buttons out as "Changed". A guest or a wallet without Mana is told "You need your own
// Mana to change a pick. Your first pick stays." A first pick is unchanged: one tap, "Free: Knode Games pays the Mana."
// Page only. Needs race-dom-harness.mjs next to it. Run: TZ=UTC node --import tsx --test --test-concurrency=1 <this file>
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

async function page(picks, extra = {}) {
  await import(`${APP}web/race-math.js`);
  const next = String(globalThis.KRaceMath.raceIndex(NOW) + 1), race = { wallet: D, picks: picks(next), ...extra };
  const p = await H.boot({ app: APP, now: NOW, files: { "W002.json": H.weekFile(2, FIN, LIVE, prevSt, field) }, vhp: { [A]: 300, [Bp]: 200, [C]: 100 }, blocks, race });
  await p.tick(6000); await p.settle();
  return { p, race, next };
}
/** The Pick button in the first upcoming race's column, on the producer's lane. */
const pickBtn = (p, a) => p.doc.querySelector(`#track .pr-lane[data-addr="${a}"] .rt-pk`);
const modal = (p) => p.doc.querySelector(".pk-modal");
const button = (p, t) => [...modal(p).querySelectorAll("button")].find((b) => b.textContent === t);

test("a change asks first; Cancel sends nothing; Confirm sends once with the player's own Mana; then the race shows 'Changed'", async () => {
  const { p, race, next } = await page((n) => ({ [n]: { horse: A, changes: 0 } }), { mana: 12.5 });
  const b = pickBtn(p, Bp); assert.ok(b && !b.disabled, "a Pick button for B");
  b.click(); await p.settle();
  assert.match(modal(p).textContent, /Change your pick\?/);
  assert.match(modal(p).textContent, /You already have a pick for this race \(.+\)\. Changing it uses your own Mana: about 0\.9 \(you have 12\.5\)\./);
  assert.match(modal(p).textContent, /1 of 1 change left\./);
  assert.equal(race.sent.length, 0, "nothing is sent on one tap");
  assert.equal(modal(p).querySelector("button").textContent, "Cancel", "Cancel comes first");
  button(p, "Cancel").click(); await p.settle();
  assert.equal(race.sent.length, 0);
  assert.equal(race.picks[next].horse, A);
  pickBtn(p, Bp).click(); await p.settle();
  button(p, "Confirm change").click(); await p.settle();
  assert.equal(race.sent.length, 1);
  assert.equal(race.sent[0].opts.noSponsor, true, "a change is never sponsored (D-278)");
  assert.match(race.sent[0].label, /^change your pick to /);
  assert.equal(race.picks[next].horse, Bp);
  await p.tick(6000); await p.settle();
  const c = pickBtn(p, C);
  assert.ok(c.disabled, "the race's other buttons grey out");
  assert.match(c.textContent, /^Changed/);
  assert.deepEqual(p.errors, []);
});

test("a first pick is one tap, free (the sponsor may pay), with the new wording", async () => {
  const { p, race } = await page(() => ({}));
  pickBtn(p, Bp).click(); await p.settle();
  assert.equal(race.sent.length, 1);
  assert.equal(race.sent[0].opts.noSponsor, undefined);
  assert.doesNotMatch(modal(p).textContent, /Change your pick/);
});

test("1 change per race: once used, the buttons say 'Changed' and nothing more is sent", async () => {
  const { p, race } = await page((n) => ({ [n]: { horse: A, changes: 1 } }));
  const b = pickBtn(p, Bp);
  assert.ok(b.disabled && /^Changed/.test(b.textContent));
  assert.match(pickBtn(p, A).textContent, /^Locked in/);
  assert.equal(race.sent.length, 0);
});

test("no Mana of its own, or a guest: 'You need your own Mana to change a pick. Your first pick stays.' Nothing is sent", async () => {
  for (const extra of [{ mana: 0.2 }, { kind: "guest" }]) {
    const { p, race } = await page((n) => ({ [n]: { horse: A, changes: 0 } }), extra);
    pickBtn(p, Bp).click(); await p.settle();
    assert.match(modal(p).textContent, /You need your own Mana to change a pick\. Your first pick stays\./, JSON.stringify(extra));
    assert.ok(modal(p).querySelector('a[href="get.html"]'));
    assert.equal(race.sent.length, 0);
  }
});
