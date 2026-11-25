// Repo Lens #R3-11 (Combo dates, KG2 #71 @ bd98af7): the Combo page's own two date lines are pinned (one set of dates:
// practice play from Wed 25 Nov, practice until Sun 6 Dec 7 PM ET, staking from week 7). Changing either went unnoticed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const html = fs.readFileSync(path.resolve(process.env.APP || ".", "web/combo.html"), "utf8");
test("R3-11: combo.html says practice until Sun 6 Dec 7 PM ET, then staking; sending opens with practice play (Wed 25 Nov)", () => {
  assert.match(html, /id="practice-note" hidden><b>Practice week\.<\/b> Practice weeks run until Sun 6 Dec, 7 PM ET: free play only, nothing is paid\. Staking starts that evening\./);
  assert.match(html, /id="cards-soon"><b>Preview\.<\/b> Build and share cards now\. Sending them opens with practice play, about Wed 25 Nov\./);
  assert.doesNotMatch(html, /Mon 7 Dec|Opens Mon 7 Dec/);
});
