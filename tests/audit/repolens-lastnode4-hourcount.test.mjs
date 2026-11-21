// Repo Lens #R2-2 (Last Node round 4, LN4-3): the recorder's guard "the day's ruler file holds exactly one card per recorded
// hour" really stops it. Built on lastnode-ruler-run.test.mjs's fixture. With a card missing from the ruler file the next run
// must record nothing more and say so (a mutant with the guard removed must fail this test).
import "./lib/quiet.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const APP = fileURLToPath(new URL("../..", import.meta.url));
process.env.APP = APP;
const F = await import("./race-ruler.fixture.mjs");
const { R, chain, timeline, FROM, T_FIRST, N } = F;
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const L = globalThis.KLastNode;
const { run } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
const LEDGER = R.ledger(timeline());
const DAY = "2026-11-03", EV = L.eventOf(DAY);
const windowOf = async (_n, t0, t1) => {
  const i0 = Math.max(0, Math.ceil((t0 - T_FIRST) / 3000)), i1 = Math.min(N, Math.ceil((t1 - T_FIRST) / 3000));
  const counts = {};
  for (let i = i0; i < i1; i++) counts[chain.who[i]] = (counts[chain.who[i]] || 0) + 1;
  return { from: FROM + i0, to: FROM + i1 - 1, counts };
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ln-hc-"));
const go = (dir, t) => run({ p: "m", check: "c", prev: dir, out: dir, picksContract: null, windowOf, rulerLedger: LEDGER, rankedOf: async () => new Set(), stakedOf: async () => null, now: { time: t, libTime: t } });
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

test("ruler file with a card missing for a recorded hour: nothing more is recorded, and the run says so", async () => {
  const dir = tmp();
  await go(dir, EV.opens - 30 * 60000);
  await go(dir, EV.start + 3600000 + 5 * 60000);          // hour 0 is over: recorded with its card
  const before = read(dir, `D${DAY}.json`);
  assert.equal(before.hours.length, 1, "setup: one hour recorded");
  assert.equal(before.done, false, "setup: the event is still running");
  const rf = path.join(dir, `R${DAY}.json`), rd = read(dir, `R${DAY}.json`);
  assert.equal(rd.hours.length, 1);
  rd.hours = [];                                           // the ruler file lost the hour's card
  fs.writeFileSync(rf, JSON.stringify(rd));
  const r = await go(dir, EV.start + 6 * 3600000);
  assert.ok(r.problems.some((p) => /ruler file has 0 hour cards for 1 recorded hours/.test(p)), r.problems.join("; "));
  assert.equal(read(dir, `D${DAY}.json`).hours.length, 1, "no hour is recorded on top of a file that lost a card");
});
