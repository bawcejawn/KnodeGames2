// M-528 (owner, 23 Nov): the header's 3 steps follow the open tab. Step 2 shows that race's length, step 3 that tab's
// real points (the same text as the tab's chip). Week 5 (points before v3): 1-hour 3/2/1, 6-hour 4/2/1, daily 6/3/2.
// Needs race-dom-harness.mjs next to it. Run: TZ=UTC node --import tsx --test --test-concurrency=1 <this file>
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as H from "./race-dom-harness.mjs";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const { A, Bp, C } = H;

async function page(type) {
  const now = Date.parse("2026-11-23T10:20:00Z"), ws = Date.parse("2026-11-23T00:00:00Z");
  const hours = []; for (let t = ws; t < Date.parse("2026-11-23T10:00:00Z"); t += 3600000) hours.push({ t, n: { [A]: 12, [Bp]: 6, [C]: 2 }, l: { [A]: t + 1000, [Bp]: t + 2000, [C]: t + 3000 }, c: [1, 1, 1, 1] });
  const blocks = (T) => { const ts = [], sig = []; for (let t = T - 7 * 3600000, i = 0; t <= T; t += 20000, i++) { ts.push(t); sig.push(i % 10 < 6 ? 0 : i % 10 < 9 ? 1 : 2); } return { ts, sig, signers: [A, Bp, C], from: 1, top: ts.length }; };
  const files = { "W005.json": { v: 1, week: 5, races: [] }, "T005.json": { v: 1, week: 5, races: [], hours }, "R004.json": H.rulerFile(4, "on", 4, []), "R005.json": H.rulerFile(5, "on", 4, []) };
  const p = await H.boot({ app: APP, now, files, vhp: { [A]: 100, [Bp]: 300, [C]: 200 }, blocks, type });
  await p.tick(6000);
  return p;
}
const steps = (p) => [p.doc.getElementById("rc-step-len").textContent, p.doc.getElementById("rc-step-pts").textContent];
const WANT = {
  0: ["6 hours, live, block by block", "1st 4 · 2nd 2 · 3rd 1"],
  1: ["1 hour, live, block by block", "1st 3 · 2nd 2 · 3rd 1"],
  2: ["2 hours, live, block by block", "1st 3 · 2nd 2 · 3rd 1"],
  3: ["a day, live, block by block", "1st 6 · 2nd 3 · 3rd 2"],
  4: ["a week (Monday to Saturday), live, block by block", "1st 12 · 2nd 6 · 3rd 4"],
};
for (const t of [1, 2, 3, 4]) test(`M-528: tab ${t} opens with its own length and points in the header`, async () => {
  const p = await page(t);
  assert.deepEqual(steps(p), WANT[t]);
  const chip = [...p.doc.querySelectorAll("#race-types button")].find((b) => b.getAttribute("aria-pressed") === "true").querySelector("small").textContent;
  assert.equal(steps(p)[1], chip, "the same text as the tab's chip");
  assert.deepEqual(p.errors, []);
});
test("M-528: switching tabs switches the header (6-hour, then daily)", async () => {
  const p = await page(1);
  [...p.doc.querySelectorAll("#race-types button")].find((b) => /^6-hour/.test(b.textContent)).click(); await p.settle();
  assert.deepEqual(steps(p), WANT[0]);
  [...p.doc.querySelectorAll("#race-types button")].find((b) => /^Daily/.test(b.textContent)).click(); await p.settle();
  assert.deepEqual(steps(p), WANT[3]);
});
test("M-528: the Rules text no longer says every race is 6 hours", async () => {
  const { readFileSync } = await import("node:fs");
  const h = readFileSync(`${APP}web/race.html`, "utf8");
  assert.doesNotMatch(h, /The finish line is the 6-hour mark/);
  assert.match(h, /1-hour races \(every hour\), 2-hour races \(every 2 hours\), a daily race \(the UTC day\) and a weekly race \(Monday to Saturday, UTC\)/);
});
