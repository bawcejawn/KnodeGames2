// Repo Lens #R2-5 (Last Node PR #30, finding LN30-1): the page's glue around the shared "Send my picks" card is pinned. The
// card itself (web/js/lib/send-picks.js) is tested by the send-picks tests; these pin what ONLY lastnode.js decides: a locked
// round is never offered to the card as open, the changes budget is the registered max_changes, a pop-up closed any other
// way answers "keep my pick" (else `sending` stays true and the page sticks), and the lock is re-checked right before signing.
// Place in tests/audit/. Run: node --import tsx --test tests/audit/repolens-lastnode30-sendpick.test.mjs
// Proof: each pin fails when its line is changed (open: true; maxChanges: 99; the asking resolve removed; stillOpen: () => true).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const APP = process.env.APP || ".";
const js = fs.readFileSync(path.resolve(APP, "web/lastnode.js"), "utf8");

test("LN30-1: lastnode.js tells the card the truth about the lock and the changes budget", () => {
  assert.match(js, /existing: cur\.existing, wanted: producers, open: pickable\(round\) \}\]/, "the round is open only while pickable(round)");
  assert.match(js, /\{ maxChanges: REG\.maxChanges, changesUsed: \{ \[key\]: cur\.changes \} \}/, "the changes budget is the registered max_changes");
  assert.match(js, /stillOpen: \(\) => pickable\(round\) \}\);/, "the lock is checked again right before signing");
});
test("LN30-1: a question closed any other way is answered 'keep my pick', so the page never sticks", () => {
  assert.match(js, /function closeModal\(\) \{ if \(modal\) modal\.hidden = true; if \(asking\) \{ const d = asking; asking = null; d\(false\); \} \}/);
  assert.match(js, /asking = done; \}\);\s*\n\s*const cannot = /, "ask() registers itself as the open question");
  assert.match(js, /asking = null; closeModal\(\); done\(v\)/, "an answer clears it first, so it is never answered twice");
});
