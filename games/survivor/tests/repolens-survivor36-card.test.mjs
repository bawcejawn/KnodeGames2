// Repo Lens 2 (#36 round 1): pins the page glue that the PR's own tests left unpinned. Each pinned line was changed by
// hand and survived the PR's tests (closeAsk, the keep-on-close hook, the changes+1 count, the already-your-pick stop).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync("web/survivor.js", "utf8");
const code = js.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const one = (re, why) => assert.equal((code.match(re) || []).length, 1, why);

test("every way of closing the question answers Keep: closeModal calls closeAsk, and both modals register their answer", () => {
  one(/function closeModal\(\) \{ if \(modal\) modal\.hidden = true; closeAsk\(\); \}/, "closeModal answers an open question");
  one(/"Keep my pick"\)\]\);\s*asking = done;\s*const keep =/, "askChange registers asking after it opens");
  one(/const cannotChange = \(lines\) => new Promise\(\(done\) => \{ pickModal\([^\n]*\[okBtn\("OK"\)\]\); asking = done; \}\);/, "cannotChange registers asking");
  one(/const go = \(v\) => \(\) => \{ asking = null; closeModal\(\); done\(v\); \};/, "an answer clears asking first: never answered twice");
});

test("closeAsk runs as written: answers false once, a second close does nothing", () => {
  const line = code.match(/let asking = null;\s*const closeAsk = [^\n]*/);
  assert.ok(line, "closeAsk found");
  const f = new Function(`${line[0]}; return { set: (d) => { asking = d; }, closeAsk, get: () => asking };`)();
  const got = [];
  f.set((v) => got.push(v));
  f.closeAsk(); f.closeAsk();
  assert.deepEqual(got, [false]);
  assert.equal(f.get(), null);
});

test("the chain read decides: a same pick stops, a refusal maps to its message, a change counts used + 1", () => {
  one(/if \(p\.refused\.length\) throw new Error\(p\.refused\[0\]\.why === "no changes left" \? "changed again" : "locked"\);/, "refused stops the send");
  one(/if \(p\.same\.length\) throw new Error\("already your pick"\);/, "same pick stops the send");
  one(/changes: existing \? used \+ 1 : 0/, "the cached count after a change is used + 1");
  one(/if \(!\(await SP\.confirm\(p, askChange, nameOf, \{ guest: W\.kind === "guest", cannot: cannotChange \}\)\)\) return;/, "a declined or guest change returns before any send");
});
