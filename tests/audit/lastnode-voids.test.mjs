// Fix-check LN3-1 / LN3-3 (Repo Lens #G-18): a day file published for the first time as void is checked against when the
// recorder itself would write it; an honest cancel at the lock is published and turns the run red once (the owner is
// emailed). Runs the REAL publish shell from lastnode.yml, Linux only (bash), like the round-2 and round-3 tests.
import "./lib/quiet.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withBash } from "./lib/platform.mjs";
const APP = fileURLToPath(new URL("../..", import.meta.url));
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const { publisher, voidDay, raceFiles, idx } = await import("./lastnode-vault.helpers.mjs");
const linux = withBash;
const day = "2026-11-17", start = Date.parse(`${day}T14:00:00Z`), lock = start - 10 * 60000;
const run = (file, now) => { const pub = publisher(); const r = pub.publish({ [`D${day}.json`]: file, "index.json": { ...idx, days: [day] } }, { KG_TEST_NOW: String(now), FAKE_RACE: raceFiles([]) }); const s = pub.show(`D${day}.json`); return { r, got: s === null ? null : JSON.parse(s) }; };

linux("LN3-1/LN3-3: an honest cancel at the lock is published, and the run turns red once (the owner is emailed)", () => {
  for (const why of ["no ruler card for the field", "fewer than 2 nodes with entry on the ruler's field card"]) {
    const { r, got } = run(voidDay(day, why), lock + 5 * 60000);
    assert.ok(got && got.void === why, `${why}: not published:\n${r.out.slice(-600)}`);
    assert.notEqual(r.status, 0); assert.match(r.out, /cancelled at the picks lock[^\n]*D2026-11-17\.json/);
  }
});
linux("LN3-3: a cancel published long after its lock (a catch-up run) is published without the alert", () => {
  const { r, got } = run(voidDay(day), lock + 8 * 3600000);
  assert.ok(got && got.void, r.out.slice(-600)); assert.doesNotMatch(r.out, /cancelled at the picks lock/); assert.equal(r.status, 0, r.out.slice(-600));
});
linux("LN3-1: a new void must be one the recorder writes, with nothing in it, and late voids only after 3 days", () => {
  const cases = [
    [{ ...voidDay(day), void: "test" }, lock + 60000, "a reason the recorder never writes"],
    [{ ...voidDay(day), picks: { "0": [["1" + "P".repeat(33), "1" + "N".repeat(33), lock - 60000]] } }, lock + 60000, "invented picks"],
    [voidDay(day, "never recorded"), start + 2 * 86400000, "'never recorded' within 3 days"],
    [voidDay(day, "not recorded within 3 days"), start + 4 * 86400000, "'not recorded' with no field"],
  ];
  for (const [file, now, what] of cases) { const { r, got } = run(file, now); assert.equal(got, null, `${what}: published:\n${r.out.slice(-400)}`); }
  const { r, got } = run(voidDay(day, "never recorded"), start + 4 * 86400000);
  assert.ok(got && got.void === "never recorded", r.out.slice(-600));
});
linux("LN3-1b: the next event's day file is fine; the one after is refused", () => {
  const pub = publisher(), next = "2026-11-18", after = "2026-11-19", now = Date.parse("2026-11-17T01:00:00Z");
  pub.publish({ [`D${after}.json`]: voidDay(after), "index.json": { ...idx, days: [after] } }, { KG_TEST_NOW: String(now), FAKE_RACE: raceFiles([]) });
  assert.equal(pub.show(`D${after}.json`), null, "a day two events ahead was published");
  const pub2 = publisher(), f = { ...voidDay(next), void: undefined }; delete f.void;
  const r = pub2.publish({ [`D${next}.json`]: f, "index.json": { ...idx, days: [next] } }, { KG_TEST_NOW: String(now), FAKE_RACE: raceFiles([]) });
  assert.doesNotMatch(r.out, /past the next event/, "the next event (picks open soon) is never refused for its date");
});
