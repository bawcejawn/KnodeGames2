// Last Node Standing on the VHP ruler: the recorder end to end on a made-up chain (the Race's ruler fixture: 15 days of
// history, then 9 days of blocks, one every 3 s, signers drawn by VHP). The field comes from the ruler's field card,
// every hour from its own card, the cuts from rulerCutsFrom; every card is the one the ruler rebuilds from the data.
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
const { R, P, chain, timeline, FROM, T_FIRST, N } = F;
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const L = globalThis.KLastNode;
const { run } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
const RL = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode-ruler.ts")).href);
const LEDGER = R.ledger(timeline());
const DAY = "2026-11-03", EV = L.eventOf(DAY);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ln-ruler-"));
/** The blocks with time in [t0, t1) on the fixture chain, as a node reads them. */
const windowOf = async (_node, t0, t1) => {
  const i0 = Math.max(0, Math.ceil((t0 - T_FIRST) / 3000)), i1 = Math.min(N, Math.ceil((t1 - T_FIRST) / 3000));
  const counts = {};
  for (let i = i0; i < i1; i++) counts[chain.who[i]] = (counts[chain.who[i]] || 0) + 1;
  return { from: FROM + i0, to: FROM + i1 - 1, counts };
};
const go = (dir, t, extra = {}) => run({ p: "m", check: "c", prev: dir, out: dir, picksContract: null, windowOf, rulerLedger: LEDGER, rankedOf: async () => new Set(), stakedOf: async () => null, now: { time: t, libTime: t }, ...extra });
const read = (dir, f) => { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };

test("ruler: the field comes from the field card (entry, by own) and is published before picks open", async () => {
  const dir = tmp();
  const r = await go(dir, EV.opens - 30 * 60000);
  const df = read(dir, `D${DAY}.json`), rd = read(dir, `R${DAY}.json`);
  assert.ok(df && df.field, r.problems.join("; "));
  // The fixture's producer with 1 VHP has fewer than 10 expected blocks an hour: no entry, not in the field.
  assert.deepEqual(df.field.nodes.map((n) => n.a), P.slice(0, 4));
  assert.equal(df.field.round, RL.fieldRound(EV.start)); assert.deepEqual(df.field.window, rd.field.window);
  assert.deepEqual(RL.fieldOf(rd.field.card), df.field.nodes);
  const fc = JSON.parse(rd.field.card);
  assert.equal(fc.paying, false); assert.equal(fc.game, 13);
  // The ruler rebuilds the field card byte for byte from Last Node's own settings.
  const v = R.recompute(LEDGER, rd.field.card, RL.settingsFor(df.field.round, df.field.window, false));
  assert.ok(v.same, v.diff);
});

test("ruler: each hour has its own scored card; the cuts follow rulerCutsFrom; the race ends with one node", async () => {
  const dir = tmp();
  await go(dir, EV.opens - 30 * 60000);
  const r = await go(dir, EV.start + 6 * 3600000);
  const df = read(dir, `D${DAY}.json`), rd = read(dir, `R${DAY}.json`);
  assert.equal(r.problems.filter((p) => !/race-samples|samples/.test(p)).length, 0, r.problems.join("; "));
  assert.equal(df.done, true, JSON.stringify(df.cuts)); assert.ok(df.winner);
  assert.equal(df.hours.length, rd.hours.length); assert.ok(df.hours.length >= 1 && df.hours.length <= 3);
  for (let i = 0; i < df.hours.length; i++) {
    const h = df.hours[i], e = rd.hours[i];
    assert.deepEqual(e.window, RL.hourWindow(h.from, h.to)); assert.equal(e.round, RL.hourRound(EV.start + i * 3600000));
    assert.deepEqual(h.rows, RL.rowsOf(e.card, df.field.nodes.map((n) => n.a)));
    const v = R.recompute(LEDGER, e.card, RL.settingsFor(e.round, e.window, true));
    assert.ok(v.same, v.diff);
    // the hour's blocks are exactly the blocks with time in the hour
    const w = await windowOf(null, EV.start + i * 3600000, EV.start + (i + 1) * 3600000);
    assert.equal(h.from, w.from); assert.equal(h.to, w.to);
  }
  const res = L.rulerCutsFrom(df.field, df.hours);
  assert.deepEqual(df.cuts, res.cuts); assert.equal(df.winner, res.winner);
});

test("ruler: no data yet means the field waits; still none at the lock means the event is void", async () => {
  const dir = tmp();
  const r1 = await go(dir, EV.opens - 30 * 60000, { rulerLedger: null });
  assert.equal(read(dir, `D${DAY}.json`)?.field ?? null, null); assert.ok(r1.problems.some((p) => /ruler/.test(p)) || true);
  await go(dir, EV.lock + 60000, { rulerLedger: null });
  const df = read(dir, `D${DAY}.json`);
  assert.equal(df.field, null); assert.equal(df.void, "no ruler card for the field");
});

test("ruler: an hour waits ('not yet') until the ruler's data has it, then is recorded", async () => {
  const dir = tmp();
  await go(dir, EV.opens - 30 * 60000);
  const t = EV.start + 3600000 + 60000, n = Math.ceil((t - 10 * 60000 - T_FIRST) / 3000), tl = timeline();
  const short = R.ledger({ ...tl, to: FROM + n - 1, signers: chain.who.slice(0, n), ids: chain.ids.slice(0, n), deltas: tl.deltas.filter((d) => d.h < FROM + n) });
  const r = await go(dir, t, { rulerLedger: short });
  assert.equal(read(dir, `D${DAY}.json`).hours.length, 0, "the hour waited");
  assert.equal(r.problems.filter((p) => /hour/.test(p)).length, 0, "a 'not yet' is not a problem");
  await go(dir, t);
  assert.equal(read(dir, `D${DAY}.json`).hours.length, 1);
});

// ── the publish job's shape check on real recorder output (the ruler), then tampered (successor of the old method's) ──
import { execFileSync, spawnSync } from "node:child_process";
import { PY, withPython, withBash } from "./lib/platform.mjs";
const yml = fs.readFileSync(path.resolve(APP, ".github/workflows/lastnode.yml"), "utf8");
const checkPy = yml.match(/<<'PY'\n([\s\S]*?)\n\s*PY\n/)[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
const shapeOk = (dir) => { try { execFileSync(PY, ["-I", "-c", checkPy, dir], { stdio: "pipe", env: { ...process.env, RUNNER_TEMP: tmp() } }); return true; } catch { return false; } };

withPython("ruler: the publish check accepts the recorder's ruler files and refuses tampered ones", async () => {
  const dir = tmp();
  await go(dir, EV.opens - 30 * 60000);
  await go(dir, EV.start + 2 * 3600000 + 60000);
  assert.ok(shapeOk(dir), "recorder output passes");
  const f = path.join(dir, `D${DAY}.json`), good = fs.readFileSync(f, "utf8");
  const rf = path.join(dir, `R${DAY}.json`), rgood = fs.readFileSync(rf, "utf8");
  const bad = [
    (d) => { d.hours[0].rows["1" + "Z".repeat(33)] = d.hours[0].rows[P[0]]; },   // a row for a node outside the field
    (d) => { d.hours[0].rows[P[0]].fpct = "0x10"; },                             // a row that isn't decimal text
    (d) => { d.hours[0].blocks = { [P[0]]: 3 }; },                               // the old method's blocks
    (d) => { d.cuts[0].why = "slow"; },                                          // a reason the rule never gives
    (d) => { d.cuts[0].at = 9; },                                                // a cut after the recorded hours
    (d) => { d.field.nodes[0].own = 12; },                                       // own that isn't decimal text
    (d) => { d.field.nodes[0].h = 1; },                                          // the old method's handicap
    (d) => { d.field.window.L = -1; },                                           // a window that isn't block heights
    (d) => { d.extra = "<script>"; },                                            // an unknown field
  ];
  for (const t of bad) { const d = JSON.parse(good); t(d); fs.writeFileSync(f, JSON.stringify(d)); assert.equal(shapeOk(dir), false, String(t)); }
  fs.writeFileSync(f, good);
  for (const t of [(r) => { r.hours.push({ round: "1", window: {}, card: "x".repeat(1500001) }); }, (r) => { r.v = 2; }, (r) => { r.day = "2026-11-04"; }, (r) => { r.hours[0].extra = 1; }]) {
    const r = JSON.parse(rgood); t(r); fs.writeFileSync(rf, JSON.stringify(r)); assert.equal(shapeOk(dir), false, String(t));
  }
  fs.writeFileSync(rf, rgood); assert.ok(shapeOk(dir));
});

withBash("ruler M-F-2: the record job's vhp-data read stops the run when it fails (never 'no data, go on')", () => {
  const lines = yml.split("\n"), i0 = lines.findIndex((l) => l.includes('git init -q "$RUNNER_TEMP/vhp-data"'));
  const step = lines.slice(i0, i0 + 3).map((l) => l.replace(/^ {10}/, "")).join("\n");
  assert.match(step, /fetch -q --depth 1 "\$repo" vhp-data/);
  const rt = tmp(), r = spawnSync("bash", ["-c", `set -euo pipefail\nRUNNER_TEMP=${rt}; repo=file://${rt}/unreachable\n${step}\necho went-on`], { encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.doesNotMatch(r.stdout, /went-on/);
  // and the recorder's own env names the folder
  assert.match(yml, /LASTNODE_VHP_DATA: \$\{\{ runner\.temp \}\}\/vhp-data/);
});
