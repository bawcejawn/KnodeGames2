// Repo Lens #L-10 ask 2: Picks game 3 is applied Tue 24 Nov 2026, so the contract takes picks for Wed 25 to Sun 29 Nov
// too. The page must offer only Season 1's play days (Mon 30 Nov = day 1, D-246), never those earlier days, and never
// a Sunday. pickDays is the list the page's day cards use (survivor.js openDays).
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../math.js";
import { page } from "./load-page.mjs";

const { pickDays } = page;
const at = (iso) => Date.parse(iso);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY1 = at("2026-11-30T00:00:00Z");

test("Season 1's day 1 is Mon 30 Nov 2026", () => {
  assert.equal(S.weekStart(S.FIRST_WEEK), DAY1);
  assert.equal(S.seasonDayOf(DAY1).n, 1);
});

test("Tue 24 Nov (the apply) to Sun 29 Nov: only days from Mon 30 Nov are offered", () => {
  for (const t of ["2026-11-24T17:00:00Z", "2026-11-25T00:00:00Z", "2026-11-26T12:00:00Z", "2026-11-28T23:59:00Z", "2026-11-29T23:50:00Z"]) {
    const days = pickDays(at(t));
    assert.ok(days.every((d) => d >= DAY1), `${t}: ${days.map(iso)}`);
    for (const d of days) assert.ok(S.seasonDayOf(d), `${t}: ${iso(d)} is a season play day`);
  }
  // On Tue 24 Nov, 5 PM UTC, days 1 and 2 (Mon 30 Nov, Tue 1 Dec) are within 7 days; Wed 25 to Sun 29 are not offered.
  assert.deepEqual(pickDays(at("2026-11-24T17:00:00Z")).map(iso), ["2026-11-30", "2026-12-01"]);
  // Before Season 1 is in reach, nothing is offered at all.
  assert.deepEqual(pickDays(at("2026-11-22T17:00:00Z")), []);
});

test("day 1 closes 2 minutes before its lock (Sun 29 Nov 23:55 UTC)", () => {
  assert.ok(pickDays(at("2026-11-29T23:52:00Z")).includes(DAY1));
  assert.ok(!pickDays(at("2026-11-29T23:53:30Z")).includes(DAY1));
});

test("during the season: never a Sunday, never past 7 days ahead", () => {
  const t = at("2026-12-02T10:00:00Z");
  const days = pickDays(t);
  assert.ok(days.length > 0);
  for (const d of days) {
    assert.notEqual(new Date(d).getUTCDay(), 0, `${iso(d)} is not a Sunday`);
    assert.ok(d - t <= S.AHEAD_MS && d > t);
  }
});
