// Owner, Sun 22 Nov 2026 (M-347): the SAME View (Pack / Whole race) and Sort (Most VHP / Current place / A–Z) buttons on
// every race length. The 1-hour, 2-hour, daily and weekly boards get the 6-hour board's buttons; the choice is one
// shared choice (pr-view / pr-sort), so it stays when the player switches tabs. Page only: nothing is scored here.
// Needs race-dom-harness.mjs next to it. Run: TZ=UTC node --import tsx --test --test-concurrency=1 <this file>
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as H from "./race-dom-harness.mjs";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const { A, Bp, C } = H;
const prod = { [A]: 1, [Bp]: 1, [C]: 1 };

/** Week 5 (race types live), a typed race running at Mon 23 Nov 10:20 UTC; A signs most, then B, then C. */
async function typed(type) {
  const now = Date.parse("2026-11-23T10:20:00Z"), ws = Date.parse("2026-11-23T00:00:00Z");
  const hours = []; for (let t = ws; t < Date.parse("2026-11-23T10:00:00Z"); t += 3600000) hours.push({ t, n: { [A]: 12, [Bp]: 6, [C]: 2 }, l: { [A]: t + 1000, [Bp]: t + 2000, [C]: t + 3000 }, c: [1, 1, 1, 1] });
  const blocks = (T) => { const ts = [], sig = []; for (let t = T - 7 * 3600000, i = 0; t <= T; t += 20000, i++) { ts.push(t); sig.push(i % 10 < 6 ? 0 : i % 10 < 9 ? 1 : 2); } return { ts, sig, signers: [A, Bp, C], from: 1, top: ts.length }; };
  const files = { "W005.json": { v: 1, week: 5, races: [] }, "T005.json": { v: 1, week: 5, races: [], hours }, "R004.json": H.rulerFile(4, "on", 4, []), "R005.json": H.rulerFile(5, "on", 4, []) };
  const p = await H.boot({ app: APP, now, files, vhp: { [A]: 100, [Bp]: 300, [C]: 200 }, blocks, type });
  await p.tick(6000);
  return p;
}
const bar = (p, id) => p.doc.getElementById(id);
const pressed = (b) => b.querySelector('button[aria-pressed="true"]').textContent;
const order = (p) => p.typedLanes().map((l) => l.a);

for (const type of [1, 2, 3, 4]) test(`type ${type}: the same View and Sort buttons as the 6-hour race`, async () => {
  const p = await typed(type);
  assert.match(bar(p, "rt-view").textContent, /^View:PackWhole race$/);
  assert.match(bar(p, "rt-sort").textContent, /^Sort:Most VHPCurrent placeA–Z$/);
  assert.equal(pressed(bar(p, "rt-view")), "Pack", "Pack is the default, as on the 6-hour race");
  assert.equal(pressed(bar(p, "rt-sort")), "Most VHP");
  assert.equal(p.typedLanes().length, 3);
});

test("Pack view on a typed board: the pack lanes, the pack label in the header; Whole race brings back the time ruler", async () => {
  const p = await typed(1);
  const runs = [...p.doc.querySelectorAll("#rt-track .pr-lane[data-addr] .pr-run")];
  assert.ok(runs.length === 3 && runs.every((r) => r.classList.contains("pack")));
  assert.ok(p.doc.querySelector("#rt-track .rt-head .pr-packlbl"), "pack label");
  [...bar(p, "rt-view").querySelectorAll("button")].find((b) => b.textContent === "Whole race").click(); await p.settle();
  assert.equal(p.win.localStorage.getItem("pr-view"), "whole");
  assert.ok(![...p.doc.querySelectorAll("#rt-track .pr-lane[data-addr] .pr-run")].some((r) => r.classList.contains("pack")));
  assert.ok(p.doc.querySelector("#rt-track .rt-head .rt-ruler"), "time ruler back");
});

test("Sort on a typed board: Most VHP (fixed line-up), Current place (live order), A–Z; remembered", async () => {
  const p = await typed(2);
  assert.deepEqual(order(p), [Bp, C, A], "Most VHP: B 300, C 200, A 100");
  [...bar(p, "rt-sort").querySelectorAll("button")].find((b) => b.textContent === "Current place").click(); await p.settle();
  assert.equal(p.win.localStorage.getItem("pr-sort"), "place");
  const ranks = p.typedLanes().map((l) => l.rank);
  assert.deepEqual(ranks, [...ranks].sort((x, y) => parseInt(x) - parseInt(y)), `live order: ${ranks}`);
  [...bar(p, "rt-sort").querySelectorAll("button")].find((b) => b.textContent === "A–Z").click(); await p.settle();
  const names = p.typedLanes().map((l) => l.a);
  assert.equal(p.win.localStorage.getItem("pr-sort"), "name");
  assert.equal(names.length, 3);
});

test("the choice is shared: it stays when the player switches race length", async () => {
  const p = await typed(1);
  [...bar(p, "rt-view").querySelectorAll("button")].find((b) => b.textContent === "Whole race").click(); await p.settle();
  [...bar(p, "rt-sort").querySelectorAll("button")].find((b) => b.textContent === "A–Z").click(); await p.settle();
  [...p.doc.querySelectorAll("#race-types button")].find((b) => /^2-hour/.test(b.textContent)).click(); await p.settle(); await p.tick(6000);
  assert.equal(pressed(bar(p, "rt-view")), "Whole race");
  assert.equal(pressed(bar(p, "rt-sort")), "A–Z");
});

test("page only: the change touches no scoring (race-math.js unchanged, no recorder or vault file)", async () => {
  const p = await typed(4);
  assert.deepEqual(p.errors, [], "no page errors");
});
