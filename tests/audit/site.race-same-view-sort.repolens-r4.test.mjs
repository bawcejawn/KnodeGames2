// Repo Lens 4 #R4-10 (PR #64): pins the reviewer's checks 1 and 3 and the A–Z order. Based on site.race-same-view-sort.test.mjs.
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

const click = async (p, id, text) => { [...bar(p, id).querySelectorAll("button")].find((b) => b.textContent === text).click(); await p.settle(); };
const facts = (p) => new Map(p.typedLanes().map((l) => [l.a, `${l.rank}|${l.gap}|${l.win}`]));
const animalAt = (p) => new Map([...p.doc.querySelectorAll("#rt-track .pr-lane[data-addr]")].map((l) => [l.dataset.addr, Number((l.querySelector(".rt-animal").getAttribute("style").match(/\* ([0-9.]+)\)/) || [])[1])]));

test("R4-10 check 1: Sort and View never change a producer's place, gap or win mark", async () => {
  const p = await typed(1), base = facts(p);
  for (const [id, t] of [["rt-sort", "Current place"], ["rt-sort", "A–Z"], ["rt-view", "Whole race"], ["rt-sort", "Most VHP"], ["rt-view", "Pack"]]) {
    await click(p, id, t);
    assert.deepEqual(facts(p), base, `${id} ${t}`);
  }
});

test("R4-10 A–Z: the lanes are in name order", async () => {
  const p = await typed(3);
  await click(p, "rt-sort", "A–Z");
  const names = p.typedLanes().map((l) => p.win.KNames ? p.win.KNames.of(l.a) : l.a);
  assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" })));
  assert.notDeepEqual(p.typedLanes().map((l) => l.a), [Bp, C, A], "not the Most VHP order");
});

test("R4-10 check 3: Pack view spreads the field (last ~4%, leader ~96%); Whole race uses the real distance", async () => {
  const p = await typed(2), pk = animalAt(p), xs = [...pk.values()].sort((a, b) => a - b);
  assert.ok(Math.abs(xs[0] - 0.04) < 1e-3 && Math.abs(xs[2] - 0.96) < 1e-3, `pack: ${xs}`);
  await click(p, "rt-view", "Whole race");
  const wh = [...animalAt(p).values()].sort((a, b) => a - b);
  assert.notDeepEqual(wh, xs, "Whole race is not the pack scale");
});

test("R4-10 check 3: packScale gives 0.5 when all are level, for a single producer and with no rows", async () => {
  const fs = await import("node:fs");
  const s = fs.readFileSync(`${APP}web/race.js`, "utf8"), i = s.indexOf("function packScale(rows)");
  assert.ok(i > 0, "packScale is in race.js");
  const body = s.slice(i, s.indexOf("\n  }\n", i) + 4);
  const packScale = new Function(`${body}; return packScale;`)();
  assert.equal(packScale([{ x: 0.3 }, { x: 0.3 }])(0.3), 0.5, "all level");
  assert.equal(packScale([{ x: 0.7 }])(0.7), 0.5, "one producer");
  assert.equal(packScale([])(0), 0.5, "no rows");
  assert.equal(packScale([{ x: NaN }, { x: 0.2 }])(0.2), 0.5, "a missing distance is ignored");
  const f = packScale([{ x: 0.1 }, { x: 0.5 }]);
  assert.ok(Math.abs(f(0.1) - 0.04) < 1e-9 && Math.abs(f(0.5) - 0.96) < 1e-9);
});
