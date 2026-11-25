// Block X first visit (Growth change 3, M-632/M-654/M-661): one tap makes the guest AND sends the pick; the success card says
// when the result comes, with "Remind me" (result, or every morning at 7 AM local) and "Share". No server, no address anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync(new URL("../../web/blockx.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../../web/blockx.html", import.meta.url), "utf8");
const w = fs.readFileSync(new URL("../../web/wallet.js", import.meta.url), "utf8");
const fn = (name) => { const i = js.indexOf(name); assert.ok(i > 0, name); return js.slice(i, js.indexOf("\n  }\n", i) + 4); };

test("wallet: playGuest only runs the existing connectGuest, and only while guest play is ready", () => {
  assert.match(w, /guestReady: \(\) => guestReady\(\), playGuest: \(\) => \(guestReady\(\) \? connectGuest\(\) : Promise\.resolve\(null\)\),/);
});

test("one tap: a new visitor on mainnet picks first, then 'Play free: lock in' starts the guest and sends", () => {
  assert.match(js, /const oneTap = \(\) => !TESTNET && !me\(\) && !!\(W && typeof W\.playGuest === "function"[^\n]*W\.guestReady\(\)\);/);
  assert.match(fn("function choose(r, a)"), /if \(!me\(\) && oneTap\(\)\) \{ drafts\.set\(r, a\); renderTargets\(true\);/, "no wallet sheet before the pick");
  assert.match(js, /tap \? lockInAsGuest\(r, choice\) : startPlaying\(\)/);
  assert.match(js, /!who \? \(tap \? "Play free: lock in" :/);
  assert.match(js, /if \(tap && \(sending \|\| !choice\)\) btn\.disabled = true;/, "nothing to lock in until a producer is chosen");
  const g = fn("async function lockInAsGuest");
  assert.match(g, /a = await W\.playGuest\(\)/);
  assert.match(g, /if \(!a \|\| !me\(\)\) return;/, "cancelled: nothing is sent");
  assert.match(g, /sendPick\(r, producer\);/, "the same send path as every other first pick (sponsored, unchanged)");
  assert.doesNotMatch(g, /W\.send\(|noSponsor|sendBatch/, "nothing new is sent or signed here");
});

test("the success card: 'Result about <time>', Remind me (two choices) and Share", () => {
  assert.match(js, /el\("p", \{ class: "bx-result-at" \}, "Result about ", el\("b", \{ text: clock\(about\(h\)\) \}\)\)/);
  assert.match(js, /el\("div", \{ class: "bx-after" \}, remindButtons\(h\), shareButton\(h\)\)/);
  const r = fn("function remindButtons");
  assert.match(r, /"When my result is in"/); assert.match(r, /"Every morning at 7 AM"/);
  assert.match(r, /try \{ document\.dispatchEvent\(new CustomEvent\("kg:remind", \{ detail: \{ reminder: "result" \} \}\)\); \} catch/);
  assert.match(r, /try \{ document\.dispatchEvent\(new CustomEvent\("kg:remind", \{ detail: \{ reminder: "daily" \} \}\)\); \} catch/);
  const s = fn("function shareButton");
  assert.match(s, /I picked who signs block \$\{fmt\(h\)\} on Knode Games\. Your turn\./);
  assert.doesNotMatch(s, /W\.address|\bme\(\)|\bwho\b(?! signs)|address/i, "no address in the share");
});

test("the calendar files: the result once at the block's time; every morning 07:00 floating local time; no address", () => {
  const b = fn("function buildIcs");
  assert.match(b, /DTSTART:\$\{icsStamp\(at\)\}/);
  assert.match(b, /`DTSTART:\$\{day\}T070000`, `DTEND:\$\{day\}T071000`, "RRULE:FREQ=DAILY"/, "no Z and no TZID: 7 AM where the visitor is");
  assert.match(b, /Knode Games: today's picks are open/);
  assert.doesNotMatch(b, /W\.address|\bme\(\)|\bwho\b/, "no address in the file");
  assert.doesNotMatch(js.slice(js.indexOf("function saveIcs"), js.indexOf("function remindButtons")), /fetch\(|XMLHttpRequest/, "made on the page, no server");
});

test("the page top (box, title, stage) carries no dates and no prize amounts", () => {
  const top = html.slice(html.indexOf("<main"), html.indexOf('id="targets-box"'));
  assert.doesNotMatch(top, /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b \d|\b\d+ (Nov|Dec)\b|VHP|×\d|\bWeek \d/);
});
