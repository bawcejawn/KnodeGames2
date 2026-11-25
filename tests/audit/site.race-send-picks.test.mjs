// "Send my picks" on the Producer Race (Capacity ask 13 Nov): hidden until the sponsor's batch row is set; any race length together;
// at most 10; a race that starts is dropped right before signing; the daily picks counted. A single pick is unchanged. Offline.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const js = fs.readFileSync("web/race.js", "utf8"), css = fs.readFileSync("web/styles.css", "utf8");

test("the bar shows only behind W.batchReady and only with chosen picks", () => {
  assert.match(js, /function batchOn\(\) \{ return !!\(W && typeof W\.batchReady === "function" && W\.batchReady\(\)\); \}/);
  assert.match(js, /if \(!batchOn\(\) \|\| !me\(\) \|\| !n\) \{ bar\.hidden = true/);
  assert.match(css, /\.pk-bar\[hidden\]/);
});
test("chosen picks of every race length, open and different from the current pick, at most 10", () => {
  assert.match(js, /for \(const \[index, horse\] of drafts\)/); assert.match(js, /for \(const \[k, horse\] of rtDrafts\)/);
  // D-743: a change never goes in a batch (it is asked first and paid with the player's own Mana), so only first picks are drafts
  assert.match(js, /!myPicks\.get\(index\) && start - Date\.now\(\) > LOCK_MARGIN/);
  assert.match(js, /!rtPicks\.get\(k\) && start - Date\.now\(\) > LOCK_MARGIN/);
  assert.match(js, /pendingDrafts\(\)\.slice\(0, 10\)/);
});
test("races that start are dropped right before signing; the daily picks counted; failure wording", () => {
  assert.match(js, /stillOpen: \(o\) => o\.__start - Date\.now\(\) > LOCK_MARGIN/);
  assert.match(js, /used \+ list\.length > max/);
  assert.match(js, /Nothing was saved; a race had started\. Try again\./);
  assert.match(js, /race: M\.contractRace\(d\.type, d\.index\)/);
});
test("a single pick still goes through sendPick exactly as before", () => {
  assert.match(js, /W\.send\(`\$\{change \? "change your pick to" : "pick"\} \$\{nameOf\(horse\)\} for the race at \$\{dayTime\(tr\.start\)\}`, \[operation\], change \? \{ noSponsor: true \} : \{\}\)/);   // D-743
  assert.match(js, /onclick: \(\) => sendPick\(cur \+ k, sel\.value\)/);
});
