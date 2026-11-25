// Speed PR 3 (Wed 25 Nov): Results · Producer Race shows the 6-hour races first. Its two files (W and R) are asked for
// at once; the other lengths (T and R-1 to R-4, ~1.2 MB to read on a phone) load after the first draw, and the page
// draws again with them. Measured (slow phone, Fast 3G + 4x CPU, with #119's hints): first race card 8.8 s -> 7.0 s.
// Real results.js and race-math.js in jsdom; every file request is held until the test lets it go.
// Run: node --test tests/audit/site.race-results-speed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const read = (f) => fs.readFileSync(new URL(`../../web/${f}`, import.meta.url), "utf8");

function page() {
  const dom = new JSDOM(`<div id="view-results"><div id="res-games" class="lb-games"></div><div id="res-q"></div><div id="res-g"></div></div>`,
    { url: "https://knodegames.com/index.html#results/race", runScripts: "outside-only" });
  const w = dom.window, asked = [], held = new Map();
  w.fetch = (url) => {
    const u = String(url);
    asked.push(u.replace(/^https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\//, ""));
    if (u === "games.json") return Promise.resolve({ ok: true, json: async () => JSON.parse(read("games.json")) });
    return new Promise((resolve) => held.set(asked[asked.length - 1], resolve));
  };
  w.eval(read("race-math.js"));
  w.eval(read("results.js"));
  const M = w.KRaceMath, week = M.weekOf(Date.now());
  const p3 = String(week).padStart(3, "0");
  const ok = (body) => ({ ok: true, json: async () => body });
  const missing = { ok: false, status: 404, json: async () => ({}) };
  const answer = async (name, res) => { for (let i = 0; i < 100 && !held.has(name); i++) await new Promise((r) => setTimeout(r, 5)); assert.ok(held.has(name), `${name} asked for`); held.get(name)(res); held.delete(name); await new Promise((r) => setTimeout(r, 20)); };
  return { w, M, week, p3, asked, held, ok, missing, answer };
}

test("W and R are asked for at once; the page draws before the other lengths' files load, then again with them", async () => {
  const { w, M, week, p3, asked, held, ok, missing, answer } = page();
  try {
    assert.ok(M.TYPES_ON_WEEK !== null && week >= M.TYPES_ON_WEEK, "this week has the other lengths");
    await answer("race-data/index.json", ok({ weeks: [week] }));
    // Both 6-hour files are on their way before either is answered (one wait on a slow phone, not two).
    for (let i = 0; i < 50 && !held.has(`race-data/R${p3}.json`); i++) await new Promise((r) => setTimeout(r, 5));
    assert.ok(held.has(`race-data/W${p3}.json`) && held.has(`race-data/R${p3}.json`), "W and R asked for together");
    assert.ok(!asked.some((a) => /race-data\/T\d+\.json|race-data\/R\d+-\d\.json/.test(a)), "no other-length file before the first draw");
    await answer(`race-data/W${p3}.json`, ok({ v: 1, week, races: [] }));
    await answer(`race-data/R${p3}.json`, missing);
    // First draw: the band is there, with the "loading the other lengths" line, while T and R-1..4 are still out.
    const band = () => w.document.querySelector("#res-g .rband");
    assert.ok(band(), "drawn after the 6-hour files");
    assert.match(band().textContent, /Loading the 1-hour, 2-hour, daily and weekly races…/);
    for (const f of [`T${p3}`, `R${p3}-1`, `R${p3}-2`, `R${p3}-3`, `R${p3}-4`]) assert.ok(held.has(`race-data/${f}.json`), `${f} asked for after the first draw`);
    // They come in: the page draws again, the line is gone.
    for (const f of [`T${p3}`, `R${p3}-1`, `R${p3}-2`, `R${p3}-3`, `R${p3}-4`]) held.get(`race-data/${f}.json`)(missing);
    held.clear();
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(band() && !/Loading the 1-hour/.test(band().textContent), "drawn again without the line");
    // Each file once.
    const counts = asked.reduce((m, a) => m.set(a, (m.get(a) || 0) + 1), new Map());
    assert.ok([...counts.values()].every((n) => n === 1), "no file asked for twice");
  } finally { w.close(); }
});
