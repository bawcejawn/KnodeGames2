// Last Node Standing on the VHP ruler, end to end: the REAL recorder (bot/games/lastnode.ts, the ruler path) on the
// Last Node fixture chain and the REAL publish job (lastnode.yml), run after run, everything checked against the (fake)
// chain and the ruler's data. Replaces round 2's race-card versions of M-H-n1, N-1 (hours, picks, field) and N-2.
import "./lib/quiet.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withBash } from "./lib/platform.mjs";
const APP = fileURLToPath(new URL("../..", import.meta.url));
process.env.APP = APP;
const H = await import("./lastnode-vault.helpers.mjs");
const { publisher, dayFile, boardOf, idx, PICKS, CUT_ORDER, WINNER, chainFor, REST_W3, voidDay, rulerFile, FX } = H;
const { run } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
const L = globalThis.KLastNode;
const linux = withBash;
const DAY = "2026-11-10", START = Date.parse(`${DAY}T14:00:00Z`), EV = L.eventOf(DAY), K = "1" + "K".repeat(33);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ln-rp-"));
/** The blocks with time in [t0, t1) on the fixture chain, as a node reads them. */
const windowOf = async (_n, t0, t1) => {
  // only this event's field-card hour and race hours (earlier days aren't this test's: the recorder skips them)
  if (t0 < START - 29 * 3600000 || t1 > START + 11 * 3600000 || (t0 < START && t1 > START - 27 * 3600000)) throw new Error("not this event");
  const c = FX.chainOf(), i0 = FX.idxAt(t0), i1 = FX.idxAt(t1), counts = {};
  for (let i = i0; i < i1; i++) counts[c.who[i]] = (counts[c.who[i]] || 0) + 1;
  return { from: FX.FROM + i0, to: FX.FROM + i1 - 1, counts };
};
const picksOf = async (_n, round) => (round === EV.round ? PICKS.map(([w, s0, b]) => (b ? [w, s0, START - 3600000, b] : [w, s0, START - 3600000])) : []);
const files = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]));
const record = (dir, t, extra = {}) => run({ p: "m", check: "c", prev: dir, out: dir, picksContract: K, windowOf, picksOf, rulerLedger: FX.ledgerOf(), rankedOf: async (w) => new Set(w), stakedOf: async () => null, now: { time: t, libTime: t }, ...extra });
/** The publish job's only allowed error on an honest run: the one cancel alert (an event before the test day, no card). */
const honest = (r) => r.status === 0 || r.out.split("\n").filter((x) => x.startsWith("::error::")).every((x) => /cancelled at the picks lock/.test(x));

linux("ruler N-2: recorder → publish → recorder → publish, through the field, picks and every hour, never refused", async () => {
  const dir = tmp(), pub = publisher(); pub.chain(chainFor([DAY]));
  for (const t of [EV.opens - 60 * 60000, EV.opens + 6 * 60000, START + 3 * 3600000 + 10 * 60000, START + 3 * 3600000 + 15 * 60000, START + 10 * 3600000 + 10 * 60000, START + 10 * 3600000 + 15 * 60000]) {
    await record(dir, t);
    const r = pub.publish(files(dir), { KG_TEST_NOW: String(t + 60000) });
    assert.ok(honest(r), `run at ${new Date(t).toISOString()}: ${r.out}`);
  }
  const d = JSON.parse(pub.show(`D${DAY}.json`)), rd = JSON.parse(pub.show(`R${DAY}.json`));
  assert.equal(d.hours.length, 10); assert.equal(d.done, true); assert.equal(d.winner, WINNER);
  assert.deepEqual(d.cuts.map((c) => c.a), CUT_ORDER); assert.ok(d.cuts.every((c) => c.why === "luck"));
  assert.equal(rd.hours.length, 10); assert.ok(rd.field);
  assert.equal(d.players.find((p) => p.a === PICKS[0][0]).points, 15);
});

linux("ruler M-H-n1: a second honest run after the field is published is accepted (nothing changed)", async () => {
  const dir = tmp(), pub = publisher();
  await record(dir, EV.opens - 30 * 60000);
  assert.ok(files(dir)[`D${DAY}.json`].field, "the field is set from the field card");
  assert.ok(honest(pub.publish(files(dir), { KG_TEST_NOW: String(EV.opens - 29 * 60000) })));
  await record(dir, EV.opens - 25 * 60000);
  const r2 = pub.publish(files(dir), { KG_TEST_NOW: String(EV.opens - 24 * 60000) });
  assert.ok(honest(r2), r2.out);
});

linux("ruler N-1: hours are the chain's blocks (both nodes) and their rows the ruler's; picks the Picks contract's; the field its card's", () => {
  const rest = Object.fromEntries(REST_W3.map((x) => [`D${x}.json`, voidDay(x)])), ix = { ...idx, days: [DAY, ...REST_W3] };
  const good = dayFile(DAY, PICKS);
  // 1. a forged history: the winner's and another node's rows swapped from hour 3 on (cuts, players and board follow)
  const swapped = JSON.parse(JSON.stringify(good));
  for (const h of swapped.hours) if (h.i >= 3) { const x = h.rows[WINNER]; h.rows[WINNER] = h.rows[CUT_ORDER[8]]; h.rows[CUT_ORDER[8]] = x; }
  const res = L.rulerCutsFrom(swapped.field, swapped.hours);
  Object.assign(swapped, { cuts: res.cuts, standing: res.standing, winner: res.winner, done: res.done });
  swapped.players = PICKS.map(([w, s0, b]) => ({ a: w, r: L.playerResult(swapped.field, res, { start: s0, backup: b || null }) })).filter((x) => x.r.entered)
    .map(({ a, r }) => ({ a, start: r.start, jumpTo: r.jumpTo, out: r.out, survived: r.survived, rode: r.rode, jumped: r.jumped, points: r.points, ranked: true })).sort((x, y) => y.points - x.points || (x.a < y.a ? -1 : 1));
  assert.notEqual(swapped.winner, good.winner, "the forgery changes the winner");
  const r1 = publisher().publish({ [`D${DAY}.json`]: swapped, ...rest, "board.json": boardOf([swapped]), "index.json": ix });
  assert.notEqual(r1.status, 0); assert.match(r1.out, /hour 3's rows aren't its ruler card's/);
  // 2. an hour that leaves out its last block (the window's edge on the chain), with its card rebuilt to match
  const short = dayFile(DAY, PICKS, { hours: 1 }); short.hours[0].to -= 1;
  const r2 = publisher().publish({ [`D${DAY}.json`]: short, "index.json": { ...idx, days: [DAY] } });
  assert.notEqual(r2.status, 0); assert.match(r2.out, /hour 0.*isn't at or after its end/);
  // 3. the two nodes disagree about block times: refused (tried again next run)
  const pub3 = publisher(); const ch = chainFor([DAY]); pub3.chain({ ...ch, b: { linear: { ...ch.linear, t0: ch.linear.t0 + 3000 } } });
  const r3 = pub3.publish({ [`D${DAY}.json`]: dayFile(DAY, PICKS, { hours: 1 }), "index.json": { ...idx, days: [DAY] } });
  assert.notEqual(r3.status, 0); assert.match(r3.out, /hour 0|field card/);
  // 4. a stranger planted on the winner in hour 0's picks
  const planted = dayFile(DAY, [...PICKS, ["1" + "X".repeat(33), WINNER]], { hours: 1 });
  const r4 = publisher().publish({ [`D${DAY}.json`]: planted, "index.json": { ...idx, days: [DAY] } });
  assert.notEqual(r4.status, 0); assert.match(r4.out, /its picks aren't the Picks contract's/);
  // 5. a field from a later moment than the field time (chosen after seeing more VHP)
  const late = dayFile(DAY, PICKS, { hours: 0 }); late.picks = {}; late.players = []; late.field = { ...late.field, at: late.field.at + 3600000 };
  const r5 = publisher().publish({ [`D${DAY}.json`]: late, "index.json": { ...idx, days: [DAY] } }, { KG_TEST_NOW: String(START - 3 * 3600000) });
  assert.notEqual(r5.status, 0); assert.match(r5.out, /field isn't at the field time/);
  // 6. the field card's last block isn't the last one before the field time
  const off = dayFile(DAY, PICKS, { hours: 0 }); off.picks = {}; off.players = [];
  const w = { ...off.field.window, W0: off.field.window.W0 - 1, W1: off.field.window.W1 - 1, L: off.field.window.L - 1, S0: off.field.window.S0 - 1, S1: off.field.window.S1 - 1 };
  off.field = { ...off.field, window: w };
  const r6 = publisher().publish({ [`D${DAY}.json`]: off, "index.json": { ...idx, days: [DAY] } }, { KG_TEST_NOW: String(START - 3 * 3600000) });
  assert.notEqual(r6.status, 0); assert.match(r6.out, /isn't the last block before/);
  // 7. honest: the field alone, and the whole day
  const h0 = dayFile(DAY, PICKS, { hours: 0 }); h0.picks = {}; h0.players = [];
  const ok0 = publisher().publish({ [`D${DAY}.json`]: h0, "index.json": { ...idx, days: [DAY] } }, { KG_TEST_NOW: String(START - 3 * 3600000) });
  assert.equal(ok0.status, 0, ok0.out);
  const ok = publisher().publish({ [`D${DAY}.json`]: good, ...rest, "board.json": boardOf([good]), "index.json": ix });
  assert.equal(ok.status, 0, ok.out);
});

linux("ruler: an event whose field card isn't made by the lock is void (and alerts once); a void ruler file never reaches a vault file", async () => {
  const dir = tmp();
  await record(dir, EV.lock + 60000, { rulerLedger: null });
  const d = files(dir)[`D${DAY}.json`];
  assert.equal(d.void, "no ruler card for the field"); assert.equal(files(dir)[`R${DAY}.json`], undefined);
  const r = publisher().publish(files(dir), { KG_TEST_NOW: String(EV.lock + 2 * 60000) });
  assert.match(r.out, /cancelled at the picks lock/); assert.notEqual(r.status, 0, "the owner is told");
});

linux("capacity: last week's rows past the board's 2,000 are published in me/ files only exactly as the day files give them", async () => {
  const { meShards } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const many = Array.from({ length: 2010 }, (_, i) => ["1" + (B58[i % 58] + B58[Math.floor(i / 58) % 58] + "w".repeat(40)).slice(0, 33), i % 2 ? WINNER : CUT_ORDER[i % 9]]);
  const day = dayFile(DAY, many), full = boardOf([day]);
  const lw = full.lastWeek, board = { ...full, lastWeek: { ...lw, rows: lw.rows.slice(0, 2000) } };
  const me = meShards({ today: { day: "x", rows: [] }, week: { week: 4, rows: [] }, lastWeek: { week: lw.week, rows: lw.rows }, allTime: { rows: [] } }, "x");
  const files = { ...H.history(board, day) };
  for (const [k, f] of me) files[`me/${k}.json`] = f;
  const pubMe = (fs0) => { const pub = publisher(); pub.chain(chainFor([DAY, ...REST_W3], { picks: many })); return pub.publish(fs0); };
  const ok = pubMe(files);
  assert.equal(ok.status, 0, ok.out);
  // a me row with other points, and a missing me file: refused
  const k0 = [...me.keys()][0], bad = JSON.parse(JSON.stringify(files[`me/${k0}.json`])); bad.lastWeek.rows[0].pts += 1;
  const r1 = pubMe({ ...files, [`me/${k0}.json`]: bad });
  assert.notEqual(r1.status, 0); assert.match(r1.out, new RegExp(`me/${k0}\\.json: last week's rows past the board's 2,000 don't add up`));
  const { [`me/${k0}.json`]: _, ...without } = files;
  const r2 = pubMe(without);
  assert.notEqual(r2.status, 0); assert.match(r2.out, /don't add up from the day files/);
});

linux("fallback (owner, 13 and 14 Nov 2026): no ruler card for an hour 48 hours after it makes the event void, recorded and alerted; never earlier", async () => {
  const { NOCARD_48H, RULER_GRACE_MS } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
  assert.equal(RULER_GRACE_MS, 48 * 3600000);
  const dir = tmp(), pub = publisher(); pub.chain(chainFor([DAY]));
  // Hours 0 to 2 recorded and published as usual.
  for (const t of [EV.opens - 60 * 60000, START + 3 * 3600000 + 10 * 60000]) {
    await record(dir, t);
    const r = pub.publish(files(dir), { KG_TEST_NOW: String(t + 60000) });
    assert.ok(honest(r), r.out);
  }
  assert.equal(files(dir)[`D${DAY}.json`].hours.length, 3);
  // The ruler's data stops before hour 3's card: the ledger reaches only the end of hour 2.
  const full = FX.ledgerOf(), behind = Object.assign(Object.create(Object.getPrototypeOf(full)), full, { to: FX.heightAt(START + 3 * 3600000) });
  const t1 = START + 4 * 3600000;
  // Before the grace ends: the event waits (no void).
  const r0 = await record(dir, t1 + RULER_GRACE_MS - 60000, { rulerLedger: behind });
  assert.equal(files(dir)[`D${DAY}.json`].void, undefined, "still waiting inside the 48 hours");
  assert.ok(!r0.problems.some((x) => /fallback/.test(x)));
  // After it: void, alerted, the hours so far kept, no one scores.
  const r1 = await record(dir, t1 + RULER_GRACE_MS + 60000, { rulerLedger: behind });
  const d = files(dir)[`D${DAY}.json`];
  assert.equal(d.void, NOCARD_48H); assert.equal(d.hours.length, 3); assert.deepEqual(d.players, []); assert.equal(d.winner, null);
  assert.ok(r1.problems.some((x) => /no ruler card 48 hours after the hour.*fallback rule/.test(x)), r1.problems.join("\n"));
  // The publish job: a too-early copy is refused; the honest one is published and turns the run red once (the owner is emailed).
  const early = pub.publish(files(dir), { KG_TEST_NOW: String(t1 + RULER_GRACE_MS - 30 * 60000) });
  assert.notEqual(early.status, 0); assert.match(early.out, /before the 48-hour grace ended/);
  const ok = pub.publish(files(dir), { KG_TEST_NOW: String(t1 + RULER_GRACE_MS + 2 * 60000) });
  assert.match(ok.out, /48-hour fallback/); assert.doesNotMatch(ok.out, /break the rules/, ok.out);
  assert.equal(JSON.parse(pub.show(`D${DAY}.json`)).void, NOCARD_48H);
});

linux("fallback: a missing-card void on an event its hours already decide, or without a field, is refused", () => {
  const good = dayFile(DAY, PICKS);
  const decided = { ...good, void: "no ruler card for an hour within 48 hours", cuts: [], standing: [], winner: null, done: false, players: [] };
  const r = publisher().publish({ [`D${DAY}.json`]: decided, "index.json": { ...idx, days: [DAY] } }, { KG_TEST_NOW: String(START + 20 * 86400000) });
  assert.notEqual(r.status, 0); assert.match(r.out, /void for a missing hour card, but its hours already decide it/);
});

linux("every producer void = the race is void (owner, 13 Nov 2026): the publish job accepts that void only when its hours leave no node standing", () => {
  // The honest case (every node still standing out in one hour: no winner, no one scores) is the cut rule's own test
  // (lastnode-ruler.test.mjs) and the recorder's step 4; here, the forged one: claimed with a node still standing.
  const four = dayFile(DAY, PICKS, { hours: 4 });
  const forged = { ...four, void: "every node still standing went out in the same hour", cuts: [], standing: [], winner: null, done: false, players: [] };
  const r = publisher().publish({ [`D${DAY}.json`]: forged, "index.json": { ...idx, days: [DAY] } }, { KG_TEST_NOW: String(START + 5 * 3600000) });
  assert.notEqual(r.status, 0); assert.match(r.out, /void for every node out, but its hours leave a node standing/);
});

linux("launch gate (LASTNODE_FROM_WEEK): the recorder never records an event of an earlier vault week, and the publish job refuses one", async () => {
  const wk = L.weekOf(START);
  // Gate on the next week: the test day's event is never read or written.
  const dir = tmp();
  await record(dir, START + 3 * 3600000 + 10 * 60000, { fromWeek: wk + 1 });
  assert.equal(files(dir)[`D${DAY}.json`], undefined, "no day file before the first live week");
  // Gate on its own week: recorded as usual.
  const dir2 = tmp();
  await record(dir2, START + 3 * 3600000 + 10 * 60000, { fromWeek: wk });
  assert.equal(files(dir2)[`D${DAY}.json`].hours.length, 3);
  // The publish job: the same honest files are refused when the gate is later than their week.
  const pub = publisher(); pub.chain(chainFor([DAY]));
  const r = pub.publish(files(dir2), { KG_TEST_NOW: String(START + 3 * 3600000 + 11 * 60000), LASTNODE_FROM_WEEK: String(wk + 1) });
  assert.notEqual(r.status, 0); assert.match(r.out, /an event before the first live week/);
  const ok = pub.publish(files(dir2), { KG_TEST_NOW: String(START + 3 * 3600000 + 11 * 60000), LASTNODE_FROM_WEEK: String(wk) });
  assert.ok(honest(ok), ok.out);
  // A bad value stops the recorder before it writes anything.
  await assert.rejects(record(tmp(), START, { fromWeek: 0 }), /LASTNODE_FROM_WEEK must be a vault week number/);
});

linux("launch gate: the workflow's record and publish jobs don't run on mainnet without LASTNODE_FROM_WEEK", () => {
  const y = fs.readFileSync(path.join(APP, ".github/workflows/lastnode.yml"), "utf8");
  const ifs = [...y.matchAll(/^    if: \$\{\{ (.*) \}\}$/gm)].map((m) => m[1]);
  assert.equal(ifs.length, 2);
  for (const c of ifs) assert.equal(c, "vars.LASTNODE_ENABLED == 'true' && vars.LASTNODE_FROM_WEEK != '' && github.ref == 'refs/heads/main'");
  assert.equal((y.match(/LASTNODE_FROM_WEEK: \$\{\{ vars\.LASTNODE_FROM_WEEK \}\}/g) || []).length, 2, "both jobs read it");
});
