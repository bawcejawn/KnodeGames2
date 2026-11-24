// M-448 (owner, 23 Nov): ONE Results list per tab, for that tab's race length only (6-hour results only on the
// 6-hour tab); each race shows the Ruler's 1st, 2nd and 3rd and names the void producers; the typed tabs' separate
// "Latest results" list is gone while the Ruler scores the races. Page only.
// Needs race-dom-harness.mjs next to it. Run: TZ=UTC node --import tsx --test --test-concurrency=1 <this file>
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as H from "./race-dom-harness.mjs";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const { A, Bp, C, D } = H;
const prod = (voids = []) => [A, Bp, C, D].map((a) => ({ a, void: voids.includes(a), signed: 3 }));

async function page(type) {
  const now = Date.parse("2026-11-23T10:20:00Z"), ws = Date.parse("2026-11-23T00:00:00Z");
  const hours = []; for (let t = ws; t < Date.parse("2026-11-23T10:00:00Z"); t += 3600000) hours.push({ t, n: { [A]: 12, [Bp]: 6, [C]: 2 }, l: { [A]: t + 1000, [Bp]: t + 2000, [C]: t + 3000 }, c: [1, 1, 1, 1] });
  const blocks = (T) => { const ts = [], sig = []; for (let t = T - 7 * 3600000, i = 0; t <= T; t += 20000, i++) { ts.push(t); sig.push(i % 10 < 6 ? 0 : i % 10 < 9 ? 1 : 2); } return { ts, sig, signers: [A, Bp, C], from: 1, top: ts.length }; };
  const files = {
    "W005.json": { v: 1, week: 5, races: [] }, "T005.json": { v: 1, week: 5, races: [], hours },
    "R004.json": H.rulerFile(4, "on", 4, []),
    "R005.json": H.rulerFile(5, "on", 4, [H.rulerEntry("2026-11-23T00", [C, A, Bp], prod())]),
    "R005-1.json": H.rulerFile(5, "on", 4, [H.rulerEntry("H1-2026-11-23T08", [A, Bp, C], prod([D])), H.rulerEntry("H1-2026-11-23T09", [Bp, A, C], prod())]),
  };
  const p = await H.boot({ app: APP, now, files, vhp: { [A]: 100, [Bp]: 300, [C]: 200 }, blocks, type });
  await p.tick(6000);
  return p;
}
const text = (p) => p.doc.getElementById("ruler-list").textContent;

test("the 1-hour tab lists only 1-hour results, newest first, with the void producer named", async () => {
  const p = await page(1);
  assert.equal(p.doc.getElementById("ruler-title").textContent, "Results · 1-hour race");
  const rows = [...p.doc.querySelectorAll("#ruler-list .rl-row")];
  assert.equal(rows.length, 2, "two 1-hour races; the 6-hour race is not here");
  assert.match(rows[1].textContent, /1st .*· 2nd .*· 3rd /);
  assert.match(rows[1].textContent, /Void: .* \(VHP moved too much during the race, so it can't place; a pick on it doesn't score\)/);
  assert.doesNotMatch(rows[0].textContent, /Void:/);
  assert.ok(p.doc.getElementById("rt-results").hidden && p.doc.getElementById("rt-results-h").hidden, "no second list");
  assert.deepEqual(p.errors, []);
});

test("the 6-hour tab lists only 6-hour results; switching tabs switches the list", async () => {
  const p = await page(1);
  [...p.doc.querySelectorAll("#race-types button")].find((b) => /^6-hour/.test(b.textContent)).click(); await p.settle();
  assert.equal(p.doc.getElementById("ruler-title").textContent, "Results · 6-hour race");
  assert.equal(p.doc.querySelectorAll("#ruler-list .rl-row").length, 1);
  [...p.doc.querySelectorAll("#race-types button")].find((b) => /^2-hour/.test(b.textContent)).click(); await p.settle();
  assert.match(text(p), /No 2-hour results yet\./);
  assert.deepEqual(p.errors, []);
});
