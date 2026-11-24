// D-730 on the Daily Questions page (index.html#play): one short box at the top, then today's questions; the long text
// (the schedule line, "New here?", Reminders) lives in Rules (#how, the Daily Questions tab). Questions chat, 24 Nov 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const APP = new URL("../..", import.meta.url).pathname;
const html = fs.readFileSync(`${APP}web/index.html`, "utf8");
const src = fs.readFileSync(`${APP}web/app.js`, "utf8");
const box = JSON.parse(fs.readFileSync(`${APP}tools/page-box.json`, "utf8"));
const section = (id) => { const a = html.indexOf(`id="${id}"`); assert.ok(a > 0, id); const b = html.indexOf("<!-- ─────────────", a); return html.slice(a, b > a ? b : undefined); };

test("the Play box carries Marketing's sentence (M-491) and is in the page", () => {
  const text = "A few quick questions about the chain, Monday to Saturday. Free to play, guest play works. Correct answers climb the weekly board.";
  assert.deepEqual(box["index.html#play"], ["questions", text]);
  assert.match(section("view-play"), new RegExp(`<aside class="page-box" data-game="questions"><p>${text.replace(/[.]/g, "\\.")}</p></aside>`));
});

test("the long text moved from Play into the Daily Questions rules tab", () => {
  const play = section("view-play"), rules = section("rp-game");
  for (const id of ['id="schedule"', 'id="panel-remind"', 'class="q-intro"']) {
    assert.ok(!play.includes(id), `${id} is not on the Play page`);
    assert.ok(rules.includes(id), `${id} is in Rules`);
  }
  assert.doesNotMatch(src, /class: "band-text" \}, "Answer each day's questions/, "the hero keeps its headline only");
});

test("the tap hint shows once above the questions, not under every card; Reminders say both rounds", () => {
  assert.equal((src.match(/Tap an answer to play: free, and a guest wallet works/g) || []).length, 1);
  assert.match(src, /oq\.replaceChildren\(\.\.\.\(open\.length \? \[hint, \.\.\.open\.map/);
  assert.doesNotMatch(src, /mode === "open" \? el\("span", \{ class: "q-cta" \}/);
  assert.match(src, /New questions come out Monday to Saturday at \$\{localHour\(0\)\} and \$\{localHour\(12\)\} your time\./);
  assert.doesNotMatch(src, /from Monday 9 November also at/);
});
