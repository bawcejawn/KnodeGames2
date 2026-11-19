// Repo Lens #J-17 (KnodeGames2 PR #15 @ 6b27393, audit AB-059): optionAt must give, at the "decided" block, the answer
// the whole window gives for an HONEST week, for every kind decidedHeight can decide statistically. If optionAt's
// formula for a kind is wrong, the AB-059 guard fires on honest questions: "decided" moves to windowEnd, so VHP readings
// and silences after the real decided block count again (more voids). The PR's own test covers only M9 (single).
// This one covers tail (M10), M6 (empty-block share), h2h (E2) and combo (H2). EXPECTED TO PASS on 6b27393. It fails
// if optionAt's h2h sign, combo bits or tail sum are wrong (mutations the PR's own tests miss).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreQuestion, decidedHeight, optionAt } from "../../questions/resolver.ts";

const day = JSON.parse(fs.readFileSync("tests/audit/fixtures/W000-D3.at-6b37c46.json", "utf8"));
const T0 = 1_792_627_200_000;
const base = (t: string) => structuredClone(day.questions.find((x: any) => x.template === t));

/** A deterministic honest window: block i is signed by `signerAt(i)`, empty when `emptyAt(i)`. */
function windowOf(q: any, signerAt: (i: number) => string, emptyAt: (i: number) => boolean = () => false) {
  const width = q.windowEnd - q.windowStart + 1;
  return Array.from({ length: width }, (_, i) => ({ h: q.windowStart + i, ts: T0 + i * 3000, signer: signerAt(i), ntx: emptyAt(i) ? 0 : 3, compute: 0 }));
}
/** Every `every`-th block to `who`, the rest to a filler. */
const every = (who: string, n: number) => (i: number) => (i % n === 0 ? who : "1Filler");

function check(name: string, q: any, win: any[]) {
  const d = decidedHeight(q, win);
  assert.ok(d < q.windowEnd, `${name}: the honest window is decided before its last block (got ${d}); the case must test something`);
  const full = scoreQuestion(q, win);
  assert.ok(full.ok, full.ok ? "" : `${name}: ${full.reason}`);
  assert.equal(optionAt(q, win, d - q.windowStart + 1), full.result.option, `${name}: optionAt at the decided block = the final answer`);
  assert.equal(optionAt(q, win, win.length), full.result.option, `${name}: optionAt over the whole window = scoreQuestion`);
}

test("J17: tail (M10), honest group well below its first line", () => {
  const q = base("M10");
  const g: string[] = q.group;
  // One group member every 40 blocks: far below the first threshold, decided early.
  check("M10", q, windowOf(q, (i) => (i % 40 === 0 ? g[i % g.length] : "1Filler")));
});

test("J17: M6 empty-block share, honest week with few empty blocks", () => {
  const q = base("M6");
  // 0.5% empty blocks: the share (5 per 1000) stays far under the first line (987).
  check("M6", q, windowOf(q, () => "1Filler", (i) => i % 200 === 0));
});

test("J17: M6 empty-block share that ends between two lines (about 989 per 1000)", () => {
  const q = base("M6");
  // One non-empty block in 91: share = round(1000 × 90/91) = 989, between the lines 987 and 990. Decided only near the
  // end; at that block a share over the blocks so far (not the whole window) would already read 990 or more.
  check("M6-mid", q, windowOf(q, () => "1Filler", (i) => i % 91 !== 0));
});

test("J17: h2h (E2 built from M9's producers), a steady lead", () => {
  const m9 = base("M9");
  const a = m9.subjects[0], b = "1Bprod";
  const q = { ...m9, template: "E2", subjects: [a, b], thresholds: [-20, 0, 20], options: ["A", "B", "C", "D"] };
  q.model = { ...m9.model, rates: { ...m9.model.rates, [a]: 0.05, [b]: 0.01 } };
  // a signs every 20th block, b every 100th: a's lead grows far past 20.
  check("E2", q, windowOf(q, (i) => (i % 100 === 1 ? b : i % 20 === 0 ? a : "1Filler")));
});

test("J17: combo (H2 built from M9's producers), both lines settled early", () => {
  const m9 = base("M9");
  const [a, b, c, d] = [m9.subjects[0], "1Bprod", "1Cprod", "1Dprod"];
  const q = { ...m9, template: "H2", subjects: [a, b, c, d], thresholds: [0, 0], options: ["0", "1", "2", "3"] };
  q.model = { ...m9.model, rates: { ...m9.model.rates, [a]: 0.05, [b]: 0.01, [c]: 0.01, [d]: 0.05 } };
  // a far ahead of b (line 1 true), d far ahead of c (line 2 false) → option 2.
  check("H2", q, windowOf(q, (i) => (i % 20 === 0 ? a : i % 20 === 10 ? d : i % 100 === 3 ? b : i % 100 === 7 ? c : "1Filler")));
});
