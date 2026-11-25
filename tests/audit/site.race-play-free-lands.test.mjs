// M-696 (owner, 24 Nov): "Play free" took the owner to the BOTTOM of the Race page. Cause: the header's link goes to
// #pick-zone (the 6-hour pick box); on a typed tab (1-hour, 2-hour, daily, weekly) the page hides #pick-zone after the
// browser has scrolled to it, so the page sat low (in the Results list). Now the page itself scrolls to the open tab's
// pick area (the race-length tabs above the board) with the first Pick button on screen, on load and on a tap of any
// #pick-zone link. Without a wallet each lane's buttons read "Play free to pick" and open the wallet sheet (guest
// first); once the guest is on, the page stays at the pick area. Page only: no send, wallet or scoring code.
// Needs race-dom-harness.mjs next to it. Run: TZ=UTC node --import tsx --test --test-concurrency=1 <this file>
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as H from "./race-dom-harness.mjs";

const APP = fileURLToPath(new URL("../../", import.meta.url));
const js = readFileSync(`${APP}web/race.js`, "utf8"), html = readFileSync(`${APP}web/race.html`, "utf8");
const { A, Bp, C } = H;
const FIN = "2026-11-07T12", LIVE = "2026-11-07T18", NOW = Date.parse("2026-11-07T21:00:00Z");
const field = [[A, 300, 1], [Bp, 200, 1.5], [C, 100, 3]];
const prevSt = [{ a: C, steps: 40, blocks: 13, last: 1 }, { a: A, steps: 30, blocks: 30, last: 2 }, { a: Bp, steps: 20, blocks: 13, last: 3 }];
const blocks = (T) => { const ts = [], sig = []; for (let t = T - 7 * 3600000, i = 0; t <= T; t += 20000, i++) { ts.push(t); sig.push(i % 10 < 6 ? 0 : i % 10 < 9 ? 1 : 2); } return { ts, sig, signers: [A, Bp, C], from: 1, top: ts.length }; };

test("no wallet: each 6-hour lane offers 'Play free to pick'; a tap opens the wallet sheet and sends nothing", async () => {
  const race = { wallet: null, picks: {} };
  const p = await H.boot({ app: APP, now: NOW, files: { "W002.json": H.weekFile(2, FIN, LIVE, prevSt, field) }, vhp: { [A]: 300, [Bp]: 200, [C]: 100 }, blocks, race });
  await p.tick(6000); await p.settle();
  const bs = [...p.doc.querySelectorAll("#track .pr-lane .rt-pk")];
  assert.ok(bs.length >= 3, "the lanes carry buttons for a guest too");
  for (const b of bs) { assert.ok(b.classList.contains("free")); assert.match(b.textContent, /^Play free to pick/); }
  const b = bs.find((x) => !x.disabled); assert.ok(b);
  b.click(); await p.settle();
  assert.equal(race.connects, 1, "the wallet sheet opens (guest first)");
  assert.deepEqual(race.sent || [], []);
  assert.deepEqual(p.errors, []);
});

test("typed lanes: the same 'Play free to pick' buttons, never disabled for want of a wallet", () => {
  assert.match(js, /const free = !who;   \/\/ M-696/);
  assert.match(js, /el\("span", \{ text: free \? "Play free to pick" : chosen \?/);
  assert.match(js, /if \(free\) \{ if \(!W\) b\.disabled = true; b\.addEventListener\("click", \(\) => playFree\(\)\); return b; \}/);
});

test("Play free lands on the open tab's pick area, with the first Pick button above the phone's bottom bar", () => {
  assert.match(js, /return tabs && !tabs\.hidden \? tabs : rtype \? \$\("typed"\) : \$\("live"\);/);
  assert.match(js, /document\.querySelectorAll\(rtype \? "#rt-track \.rt-pk" : "#track \.rt-pk"\)/);
  assert.match(js, /const bar = document\.querySelector\("nav\.tabbar"\);/, "the bottom bar is measured");
  assert.match(js, /const barH = bar && bar\.getClientRects\(\)\.length \? Math\.max\(0, window\.innerHeight - bar\.getBoundingClientRect\(\)\.top\) : 0;/, "R3-32: by its own selector, never the wallet sheet's backdrop");
  assert.doesNotMatch(js, /document\.elementFromPoint\(window\.innerWidth \/ 2, window\.innerHeight - 2\)/, "R3-32: not whatever is fixed at the bottom of the screen");
  assert.match(js, /const a = e\.target && e\.target\.closest && e\.target\.closest\('a\[href="#pick-zone"\]'\);/, "a tap on any #pick-zone link");
  assert.match(js, /if \(location\.hash === "#pick-zone" && !landed\)/, "and a visit to race.html#pick-zone");
  assert.match(js, /if \(stayAtPick && me\(\)\) \{ stayAtPick = false;/, "after the guest starts, the page stays at the pick area");
  assert.match(html, /#race-types, #typed \{ scroll-margin-top: 80px; \}/);
  assert.match(html, /\.rt-pk\.free \{/);
});

test("the header and Home links are not touched (Hub's 'Play free path')", () => {
  assert.ok(html.includes('<a class="btn btn-play-free" href="#pick-zone">Play free</a>'));
});
