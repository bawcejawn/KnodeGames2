// Audit AB-059 (Audit Bot QA audit of a8d0569, 16 Nov 2026): a VHP boost after the "decided" block.
// decidedHeight calls an answer decided early on a statistical bound (the producer's own rate so far). VHP readings after
// that block never voided, and silences after it never counted. A producer that boosts its VHP right after the decided
// block can then change the answer without the swing voiding the question. Fix: if the answer at the end is not the
// answer at the "decided" block, it wasn't decided, and the whole window counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreQuestion, decidedHeight, optionAt } from "../../questions/resolver.ts";
import { optionFor } from "../../questions/common.ts";

const day = JSON.parse(fs.readFileSync("tests/audit/fixtures/W000-D3.at-6b37c46.json", "utf8"));
const RELEASE = 100_000_000_000_000n;
const T0 = 1_792_627_200_000;
const FILLER = "1Filler";

function m9(rate: number) {
  const q = structuredClone(day.questions.find((x: any) => x.template === "M9"));
  q.model.rates = { ...q.model.rates, [q.subjects[0]]: rate };
  q.model.vhp = { [q.subjects[0]]: RELEASE.toString() };
  q.model.vhpHeight = q.releaseHeight;
  q.model.voidVhpSwing = 0.1;
  return q;
}
function spread(q: any, rate: number) {
  const width = q.windowEnd - q.windowStart + 1;
  let acc = 0;
  return Array.from({ length: width }, (_, i) => {
    acc += rate; let s = FILLER;
    if (acc >= 1) { s = q.subjects[0]; acc -= 1; }
    return { h: q.windowStart + i, ts: T0 + i * 3000, signer: s, ntx: 0, compute: 0 };
  });
}
const boosted = (q: any) => ({ [q.subjects[0]]: ((RELEASE * 300n) / 100n).toString() });

test("AB-059: a boost right after the decided block that changes the answer voids the question (it used to resolve)", () => {
  const q = m9(0.0075);
  const honest = spread(q, 0.0075);
  const d = decidedHeight(q, honest);
  assert.ok(d < q.windowEnd - 600, `the honest week is decided early (at ${d})`);
  // The subject boosts its VHP right after d and signs every one of the next 200 blocks.
  const cut = d - q.windowStart + 1;
  const win = honest.map((b, i) => (i >= cut && i < cut + 200 ? { ...b, signer: q.subjects[0] } : b));
  assert.equal(decidedHeight(q, win), d, "the blocks up to d are the same, so d is the same");
  const count = (w: any[]) => w.filter((b) => b.signer === q.subjects[0]).length;
  assert.notEqual(optionFor(count(win), q.thresholds), optionFor(count(honest), q.thresholds), "the boost changes the answer");
  assert.notEqual(optionAt(q, win, cut), optionFor(count(win), q.thresholds));
  const r = scoreQuestion(q, win, { vhpReadings: [{ height: d + 50, values: boosted(q) }] });
  assert.ok(r.ok, r.ok ? "" : r.reason);
  assert.equal(r.result.void, true, "the swing during the boost voids");
  assert.match(r.result.reason ?? "", /VHP changed by more than 10%/);
  assert.equal(r.result.vhpCheck?.decidedHeight, q.windowEnd, "not decided: the whole window counted");
});

test("AB-059: an answer that really was decided early keeps its early block (a later swing still doesn't void)", () => {
  const q = m9(0.0075);
  const win = spread(q, 0.0075);
  const d = decidedHeight(q, win);
  const r = scoreQuestion(q, win, { vhpReadings: [{ height: q.windowEnd - 10, values: boosted(q) }] });
  assert.ok(r.ok && !r.result.void && r.result.vhpCheck?.decidedHeight === d);
  assert.equal(optionAt(q, win, d - q.windowStart + 1), r.result.option);
});

test("AB-059: optionAt matches the full score at the last block for every kind it covers", () => {
  const q = m9(0.0075);
  const win = spread(q, 0.0075);
  const full = scoreQuestion(q, win);
  assert.ok(full.ok);
  assert.equal(optionAt(q, win, win.length), full.result.option);
  assert.equal(optionAt({ ...q, template: "M4" }, win, win.length), undefined, "interval questions are decided only when certain");
});
