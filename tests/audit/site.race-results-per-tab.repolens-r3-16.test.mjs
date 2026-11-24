// Repo Lens #R3-16 (Race #98 @ d71a0f3): the new per-tab Results list. Three things #98's own tests did not hold:
// the void line names the producer (not a count), a ruled pick shows its mark (the same pickOutcome as the pick rows),
// and a trial (shadow) row never shows a mark. Needs race-dom-harness.mjs next to it.
// Run: TZ=UTC node --import tsx --test --test-concurrency=1 <this file>
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as H from "./race-dom-harness.mjs";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const { A, Bp, C, D } = H, ME = H.addr("M");
const prod = (voids = []) => [A, Bp, C, D].map((a) => ({ a, void: voids.includes(a), signed: 3 }));
const short = (a) => a.slice(0, 5) + "…" + a.slice(-4);

async function page(typedMode) {
  const now = Date.parse("2026-11-23T10:20:00Z"), ws = Date.parse("2026-11-23T00:00:00Z");
  const hours = []; for (let t = ws; t < Date.parse("2026-11-23T10:00:00Z"); t += 3600000) hours.push({ t, n: { [A]: 12, [Bp]: 6, [C]: 2 }, l: { [A]: t + 1000, [Bp]: t + 2000, [C]: t + 3000 }, c: [1, 1, 1, 1] });
  const blocks = (T) => { const ts = [], sig = []; for (let t = T - 7 * 3600000, i = 0; t <= T; t += 20000, i++) { ts.push(t); sig.push(i % 10 < 6 ? 0 : i % 10 < 9 ? 1 : 2); } return { ts, sig, signers: [A, Bp, C], from: 1, top: ts.length }; };
  const id = "H1-2026-11-23T08", id2 = "H1-2026-11-23T09";
  const files = {
    "W005.json": { v: 1, week: 5, races: [] },
    "T005.json": { v: 1, week: 5, hours, races: [{ type: 1, id, result: { final: true, picks: [[ME, A]], standings: [{ a: A, steps: 9 }, { a: Bp, steps: 5 }, { a: C, steps: 2 }] } },
      { type: 1, id: id2, result: { final: true, picks: [[ME, D]], standings: [{ a: Bp, steps: 9 }, { a: A, steps: 5 }, { a: C, steps: 2 }] } }] },
    "R004.json": H.rulerFile(4, "on", 4, []),
    "R005.json": H.rulerFile(5, "on", 4, []),
    "R005-1.json": H.rulerFile(5, typedMode, 4, [H.rulerEntry(id, [A, Bp, C], prod([D])), H.rulerEntry(id2, [Bp, A, C], prod([D]))]),
  };
  const p = await H.boot({ app: APP, now, files, vhp: { [A]: 100, [Bp]: 300, [C]: 200 }, blocks, type: 1, wallet: ME });
  await p.tick(6000);
  return [...p.doc.querySelectorAll("#ruler-list .rl-row")];
}

test("R3-16: the void line names the void producer; a winning pick shows ✓, a pick on a void producer ✗", async () => {
  const rows = await page("on");   // newest first: [09:00 race (picked D, void), 08:00 race (picked A, 1st)]
  assert.equal(rows.length, 2);
  assert.ok(rows[1].textContent.includes(`Void: ${short(D)} (`), rows[1].textContent);
  assert.match(rows[1].textContent, new RegExp(`You picked ${short(A)}`));
  const win = rows[1].querySelector(".pk-ok");
  assert.ok(win && /^✓ /.test(win.textContent), "the winning pick is marked ✓, as on the pick rows");
  const lose = rows[0].querySelector(".pk-no");
  assert.ok(lose && lose.textContent === "✗", "a pick on a void producer scores nothing: ✗");
});
test("R3-16: a trial (shadow) row shows the pick but never a mark", async () => {
  const rows = await page("shadow");
  assert.equal(rows.length, 2);
  for (const r of rows) { assert.match(r.textContent, /trial/); assert.equal(r.querySelectorAll(".pk-ok, .pk-no").length, 0); assert.doesNotMatch(r.textContent, /✓|✗/); }
});
