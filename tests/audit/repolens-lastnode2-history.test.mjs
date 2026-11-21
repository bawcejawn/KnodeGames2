// Repo Lense fix-check round 2, reviewer M-H: failing tests for the publish job's history check.
// NOT RUN HERE (static review). Drop into tests/audit/ next to lastnode-vault.test.mjs; they drive the REAL recorder
// (bot/games/lastnode.ts run(), real makeField/loadDay) and the REAL publish shell extracted from lastnode.yml, exactly as
// that file's publisher() does (copy publishScript()/publisher()/dayFile()/boardOf()/raceFiles() from it).
import "./lib/quiet.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withBash } from "./lib/platform.mjs";
const APP = fileURLToPath(new URL("../..", import.meta.url));
const { run } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
const L = globalThis.KLastNode;
const A = (c) => "1" + c.repeat(33);
// import or paste: publisher, dayFile, boardOf, raceFiles, idx, PICKS, NODES (tests/audit/lastnode-vault.test.mjs)
import { publisher, dayFile, boardOf, raceFiles, idx, PICKS, NODES, CUT_ORDER, WINNER, chainFor, gamed, dayG, vgood, history, REST_W3, voidDay } from "./lastnode-vault.helpers.mjs";

const linux = withBash;   // the publish job's real shell: Linux (GitHub Actions); skipped with a reason elsewhere
const card = (at) => ({ at, field: NODES.slice(0, 4).map((a, i) => ({ a, vhp: 4000 - i * 1000, k: 600 })), paddock: [] });

// M-H-n1: the recorder's second run must publish (loadDay keeps field.vt and hours[i].card === null).
// M-H-n1: retired with the VHP ruler (race cards and block counts are gone); its successor is in
// tests/audit/lastnode-ruler-publish.test.mjs.

// M-H-n2: one bad run can't append invented hours/picks; at minimum the run must hold the vault file for review.
linux("M-H-n2: invented hours appended by one run don't reach a vault file without the owner's release", () => {
  const pub = publisher();
  const seed = dayFile("2026-11-15", PICKS, { hours: 1 });                    // Sunday of week 3, hour 0 published
  pub.publish({ "D2026-11-15.json": seed, "index.json": { ...idx, days: ["2026-11-15"] } }, { KG_TEST_NOW: String(Date.parse("2026-11-15T15:10:00Z")) });
  const forged = dayFile("2026-11-15", PICKS, { hours: 10 });                 // the rest of the event, invented
  const brd = boardOf([forged]);
  const v = { game: 13, week: 3, final: true, rows: brd.lastWeek.rows.filter((r) => r.pts >= 1).map((r) => ({ player: r.a, points: r.pts })), first: [], second: [] };
  const r = pub.publish({ "D2026-11-15.json": forged, "board.json": brd, "index.json": { ...idx, days: ["2026-11-15"] }, "vault/W3.json": v }, { KG_TEST_NOW: String(Date.parse("2026-11-16T12:30:00Z")) });
  assert.equal(pub.show("vault/W3.json"), null, r.out);                                         // fails today: published, exit 0
});

// N-1, the chain itself: hours whose counts aren't the chain's are refused, whatever the run's own files add up to.
// N-1 (hours): retired with the VHP ruler (race cards and block counts are gone); its successor is in
// tests/audit/lastnode-ruler-publish.test.mjs.

// N-1 (picks, field): retired with the VHP ruler (race cards and block counts are gone); its successor is in
// tests/audit/lastnode-ruler-publish.test.mjs.

// M-H-n3: the publish job refuses a final board / vault file while a day of that week isn't done or void.
linux("M-H-n3: last week can't be marked final, nor a vault file filed, before every day is done or void", () => {
  const pub = publisher();
  const sun = dayFile("2026-11-15", PICKS, { hours: 1 });                      // not done
  const brd = boardOf([sun], true);
  const v = { game: 13, week: 3, final: true, rows: brd.lastWeek.rows.filter((r) => r.pts >= 1).map((r) => ({ player: r.a, points: r.pts })), first: [], second: [] };
  const r = pub.publish({ "D2026-11-15.json": sun, "board.json": brd, "index.json": { ...idx, days: ["2026-11-15"] }, ...(v.rows.length ? { "vault/W3.json": v } : {}) }, { KG_TEST_NOW: String(Date.parse("2026-11-16T12:30:00Z")) });
  assert.notEqual(r.status, 0); assert.equal(pub.show("vault/W3.json"), null);                // fails today
  // and the honest run that finishes Sunday afterwards is still accepted
  const done = dayFile("2026-11-15", PICKS, { hours: 10 });
  const r2 = pub.publish({ "D2026-11-15.json": done, "board.json": boardOf([done], true), "index.json": { ...idx, days: ["2026-11-15"] } }, { KG_TEST_NOW: String(Date.parse("2026-11-16T12:35:00Z")) });
  assert.equal(r2.status, 0, r2.out);
});

// M-H-n4: hours already published are not re-judged against race cards that appeared later.
// (Adapted to the N-4 rule: a window names the first card taken at or after its end; here c1, 20 minutes after hour 0.
// The late card is one taken between the window's end and c1 that reaches race-data only after the hour was published.)
// M-H-n4: retired with the VHP ruler (race cards and block counts are gone); its successor is in
// tests/audit/lastnode-ruler-publish.test.mjs.

// M-H-n5: a field histcheck and lastnode-math.js replay differently is refused at its first publish.
linux("M-H-n5: h whose x10000 rounds differently in Python and JavaScript, or vhp >= 2^53, is refused", () => {
  for (const tweak of [(n, i) => (i === 2 ? { ...n, h: 4.9999999999999996e-5 } : n), (n, i) => (i < 2 ? { ...n, vhp: 9007199254740992 + i } : n)]) {
    const d = dayFile("2026-11-10", PICKS, { hours: 0 });
    d.field = { ...d.field, nodes: d.field.nodes.map(tweak) };
    const r = publisher().publish({ "D2026-11-10.json": d, "index.json": { ...idx, days: ["2026-11-10"] } }, { KG_TEST_NOW: String(Date.parse("2026-11-10T13:30:00Z")) });
    assert.notEqual(r.status, 0, "planted field accepted");                                     // fails today
  }
});

// M-H-n6: watch-and-hold is enforced by the publish job, not only by the recorder.
linux("M-H-n6: a vault file for a week watchWeek flags is not published unless the week is released", () => {
  // Week 3's winner signs 160 blocks an hour against 100 expected (it wins; watchWeek flags it, z about 6), the board is
  // final and published. A run files W3 without a HOLD file and without LASTNODE_RELEASE_WEEKS: not on games-data.
  const pub = publisher(); pub.chain(gamed.chain()); pub.seed(gamed.history());
  const r = pub.publish({ ...gamed.history(), "vault/W3.json": vgood });
  assert.notEqual(r.status, 0, r.out); assert.equal(pub.show("vault/W3.json"), null);
  const rel = pub.publish({ ...gamed.history(), "vault/W3.json": vgood }, { LASTNODE_RELEASE_WEEKS: "3" });
  assert.equal(rel.status, 0, rel.out); assert.ok(pub.show("vault/W3.json"), "released by the owner: filed");
});

// N-2 end to end (the report's "add a publish-twice test"): the REAL recorder and the REAL publish job, run after run,
// with hours, picks and race cards, everything checked against the (fake) chain. Every honest run must publish.
// N-2: retired with the VHP ruler (race cards and block counts are gone); its successor is in
// tests/audit/lastnode-ruler-publish.test.mjs.
