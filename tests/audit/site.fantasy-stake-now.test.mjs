// Fantasy page, Vault M-174 (b): after Mon 23 Nov's vault game-apply 4, players can stake into Fantasy during week 5 and
// the stake counts from week 6 (Sun 29 Nov, 7 PM ET). The page must no longer say weeks 4 and 5 "take no stakes".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const h = fs.readFileSync(`${APP}/web/fantasy.html`, "utf8");

test("Fantasy page: no 'no stakes' wording left", () => {
  assert.doesNotMatch(h, /take no stakes|no stakes are taken|with no stakes/i);
});

test("Fantasy page: 'Stake now: it counts from week 6 (Sun 29 Nov, 7 PM ET)' in the note, the league note and Prizes", () => {
  const line = "Stake now: it counts from week 6 (Sun 29 Nov, 7 PM ET).";
  assert.equal(h.split(line).length - 1, 3, "test-weeks note, league note, Prizes");
  const at = (id) => h.slice(h.indexOf(`id="${id}"`), h.indexOf("</p>", h.indexOf(`id="${id}"`)));
  assert.ok(at("fx-testweeks").includes(line + " Weeks 4 and 5 are free play."), "the note uses Vault's sentence");
  assert.ok(at("league-note").includes("are free play: everyone plays on the Free play board. " + line));
  assert.match(h, /<p><b>Prizes\.<\/b> Weeks 4 and 5 \(to Sun 29 Nov, 7 PM ET\) are free play: everyone plays on the Free play board\. Stake now: it counts from week 6 \(Sun 29 Nov, 7 PM ET\)\. From week 6,/);
  assert.match(h, /Fantasy is a staked game from week 6 \(Sun 29 Nov, 7 PM ET; weeks 4 and 5 are free play, and a stake made now counts from week 6\):/);
});

test("Fantasy page: the wording follows the site's rules", () => {
  for (const id of ["fx-testweeks", "league-note"]) {
    const p = h.slice(h.indexOf(`id="${id}"`), h.indexOf("</p>", h.indexOf(`id="${id}"`)));
    assert.doesNotMatch(p, /\b(bet|odds|gambl|earn|returns|guaranteed|beta)\b/i, id);
  }
});

// Repo Lens #R4-4: the same claim was also in the test-week banner (nav.js, shown on the Fantasy page to Sun 29 Nov), the
// All games card (games.json) and the Home rules panel (index.html). None may still say weeks 4 and 5 take no stakes.
test("the All games card and the Home rules say 'Stake now', not 'no stakes' (the nav.js banner is gone, #51)", () => {
  assert.doesNotMatch(fs.readFileSync(`${APP}/web/nav.js`, "utf8"), /no stakes|Fantasy Producers: free play/);
  const SN = "Stake now: it counts from week 6 (Sun 29 Nov, 7 PM ET).";
  for (const f of ["web/games.json", "web/index.html"]) {
    const s = fs.readFileSync(`${APP}/${f}`, "utf8");
    assert.doesNotMatch(s, /take no stakes|no stakes are taken|with no stakes/i, f);
    assert.ok(s.includes(SN), `${f} has Vault's sentence`);
  }
});
