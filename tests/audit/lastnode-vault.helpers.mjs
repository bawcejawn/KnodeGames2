// Shared helpers for the Last Node Standing publish tests: the REAL publish shell from lastnode.yml run against a
// throwaway bare repository, the recorder-shaped day files and boards it checks, and the race-card folder.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PY, withBash } from "./lib/platform.mjs";
export const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
await import(pathToFileURL(path.resolve(APP, "web/race-math.js")).href); await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const L = globalThis.KLastNode;
// The VHP ruler (owner, 11 Nov; Library, 12 Nov): the made-up chain whose real ruler cards give the test history.
const FX = await import("./lastnode-ruler.fixture.mjs");
const RL = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode-ruler.ts")).href);
export { FX, RL };
export const A = (c) => "1" + c.repeat(33);
export const P1 = A("P"), P2 = A("Q"), P3 = A("R"), P4 = A("S");
export const yml = fs.readFileSync(path.resolve(APP, ".github/workflows/lastnode.yml"), "utf8");
export const AT = (w, h) => String(L.weekStart(w) + h * 3600000);

// The publish step's real shell against a throwaway bare repository (bash, git): skipped on Windows.
export const linux = withBash;   // the publish job's real shell: Linux (GitHub Actions); skipped on Windows
export function publishScript() {
  const lines = yml.split("\n");
  const i = lines.findIndex((l) => /name:\s*Push games-data\/lastnode/.test(l));
  const r = lines.findIndex((l, j) => j > i && /^\s+run:\s*\|\s*$/.test(l));
  const indent = lines[r + 1].match(/^\s*/)[0].length;
  const out = [];
  for (let j = r + 1; j < lines.length; j++) { const l = lines[j]; if (l.trim() && l.match(/^\s*/)[0].length < indent) break; out.push(l.slice(indent)); }
  const s = out.join("\n");
  assert.match(s, /^remote=.*$/m);
  return s.replace(/^remote=.*$/m, 'remote="$FAKE_REMOTE"').replace(/sleep \$\(\(try \* 5\)\)/g, "sleep 0");
}
// Fix-check N-1: the publish job re-reads what a run adds from two RPC nodes. The tests run a fake Koinos node
// (tests/audit/lib/fake-koinos-rpc.py, its own encoders) answering from a fixture: by default the HONEST chain for the
// days a run names (the blocks and picks dayFile() gives with PICKS), whatever the run's files say.
const servers = [];
process.on("exit", () => { for (const p of servers) try { p.kill(); } catch { /* gone */ } });
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function fakeNode(fixtureFile) {
  const portFile = fixtureFile + ".port";
  const p = spawn(PY, ["-I", path.resolve(APP, "tests/audit/lib/fake-koinos-rpc.py"), fixtureFile, portFile], { stdio: "ignore" });
  servers.push(p); p.unref();
  for (let k = 0; k < 500 && !fs.existsSync(portFile); k++) sleepMs(10);
  const port = fs.readFileSync(portFile, "utf8").trim();
  return { a: `http://127.0.0.1:${port}/a`, b: `http://127.0.0.1:${port}/b` };
}
export const PICKS_CONTRACT = A("K");
export const FILLER = A("z");                   // a producer outside the field
/** The honest chain for some days: every window of their whole event (dayFile's blocks, the rest by FILLER) and PICKS. */
/** The vault (v6) in the fake chain: P1, P2 and P3 staked in game 13 (1 VHP) in every week the days fall in; P4 isn't
 *  (the vault file's rows: P1, P2, P3). Free winners need a wallet that holds 1 VHP (vhp) or a Knode Games stake. */
export const VAULT_C = A("V"), VHP_C = A("W");
export function chainFor(days, { picks = PICKS, stakers = [P1, P2, P3], vhp = {}, knode = {}, extra = {} } = {}) {
  const pk = {}, players = {};
  for (const day of days) { const w = L.weekOf(Date.parse(`${day}T14:00:00Z`)); for (const a of stakers) players[`${w}:${a}`] = { week_stake: 100000000, peak: 100000000, active: 100000000 }; }
  Object.assign(players, extra);
  for (const day of days) pk[`13:${L.eventOf(day).round}`] = picks.map(([w, s0, b]) => [w, b ? [s0, b] : [s0], Date.parse(`${day}T14:00:00Z`) - 3600000]);
  // The blocks: the ruler fixture's chain (a block every 3 s); only their times are read by the publish job.
  return { linear: FX.linear(), picks: pk, vault: { min: 100000000, live: true, players }, vhp, knode };
}
export function publisher() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lns-pub-"));
  const remote = path.join(root, "remote.git");
  const fixture = path.join(root, "chain.json");
  fs.writeFileSync(fixture, JSON.stringify({ windows: [] }));
  const node = fakeNode(fixture);
  const env = { ...process.env, HOME: root, GIT_CONFIG_NOSYSTEM: "1", FAKE_REMOTE: remote, GH_TOKEN: "x", KG_TEST_NOW: AT(4, 13),
    LASTNODE_RPC: node.a, LASTNODE_RPC_CHECK: node.b, LASTNODE_PICKS: PICKS_CONTRACT, LASTNODE_VAULT: VAULT_C, LASTNODE_VHP: VHP_C,
    RULER_PY: path.resolve(APP, "ruler/vhp_ruler.py") };
  execFileSync("git", ["init", "-q", "--bare", remote], { env });
  let n = 0, chainSet = false, boost = {};
  return {
    remote, env, node,
    /** The chain the fake node answers with from now on (default: the honest chain for each run's days). */
    chain(fx) { fs.writeFileSync(fixture, JSON.stringify(fx)); chainSet = true; boost = fx.boost || {}; },
    publish(files, extraEnv = {}) {
      const t = path.join(root, `run${++n}`), IN = path.join(t, "incoming");
      fs.mkdirSync(path.join(IN, "lastnode", "vault"), { recursive: true });
      if (Object.keys(files).some((k) => k.startsWith("me/"))) fs.mkdirSync(path.join(IN, "lastnode", "me"), { recursive: true });
      const days = Object.keys(files).filter((k) => /^D\d{4}-\d{2}-\d{2}\.json$/.test(k)).map((k) => k.slice(1, -5));
      // Each day with a field gets its ruler file (the cards it was built from) unless the test gives its own (or null).
      const all = { ...files };
      for (const x of days) { const v = files[`D${x}.json`]; if (!(`R${x}.json` in all) && v && typeof v === "object" && v.field) all[`R${x}.json`] = rulerFile(x, (v.hours || []).length, boost); }
      for (const [k, v] of Object.entries(all)) if (v !== null) fs.writeFileSync(path.join(IN, "lastnode", k), typeof v === "string" ? v : JSON.stringify(v));
      if (!chainSet) fs.writeFileSync(fixture, JSON.stringify(chainFor(days)));
      const r = spawnSync("bash", ["-c", publishScript()], { cwd: t, env: { ...env, IN, RUNNER_TEMP: t, LASTNODE_RULER_TL: FX.tlFileOf(boost), ...extraEnv }, encoding: "utf8" });
      return { status: r.status, out: r.stdout + r.stderr };
    },
    /** Put files on games-data directly, as earlier runs would have published them. */
    seed(files) {
      const w = path.join(root, `seed${++n}`);
      execFileSync("git", ["init", "-q", w], { env });
      const g = (...a) => execFileSync("git", a, { cwd: w, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      try { g("fetch", "-q", remote, "games-data"); g("checkout", "-q", "FETCH_HEAD"); } catch { /* first */ }
      for (const [k, v] of Object.entries(files)) { const f = path.join(w, "lastnode", k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); }
      g("add", "-A"); g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "seed"); g("push", "-q", remote, "HEAD:refs/heads/games-data");
    },
    show: (name) => { try { return execFileSync("git", ["--git-dir", remote, "show", `games-data:lastnode/${name}`], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch { return null; } },
  };
}
export const idx = { v: 1, updated: "x", days: [], contract: null, game: 13 };

// Last week's history (week 3 starts Monday 2026-11-09), made by the real rules: one event, an 11-node field, one cut
// an hour. P1 and P2 ride the winner (10 + 5 = 15), P4's node goes at cut 5 (4), P3's at cut 3 (2).
export const NODES = Array.from({ length: 11 }, (_, i) => A("ABCDEFGHJKL"[i]));
export const CUT_ORDER = NODES.slice(1), WINNER = NODES[0];
/** A day's ruler cards on the fixture chain (field card + 10 hour cards), made once per day and boost. */
const RCACHE = new Map();
function rulerDay(day, boost) {
  const k = `${day}|${JSON.stringify(boost)}`;
  if (RCACHE.has(k)) return RCACHE.get(k);
  const start = Date.parse(`${day}T14:00:00Z`), Lg = FX.ledgerOf(boost);
  const fw = RL.fieldWindow(FX.heightAt(RL.fieldTime(start)) - 1), fr = RL.fieldRound(start), fc = RL.cardFor(Lg, fr, fw, false);
  if (!("card" in fc)) throw new Error(`fixture field card for ${day}: ${fc.note}`);
  const hours = [];
  for (let i = 0; i < NODES.length - 1; i++) {
    const t0 = start + i * 3600000, w = RL.hourWindow(FX.heightAt(t0), FX.heightAt(t0 + 3600000) - 1), rnd = RL.hourRound(t0), c = RL.cardFor(Lg, rnd, w, true);
    if (!("card" in c)) throw new Error(`fixture hour card ${day} ${i}: ${c.note}`);
    hours.push({ round: rnd, window: w, card: c.card });
  }
  const out = { field: { round: fr, window: fw, card: fc.card }, hours };
  RCACHE.set(k, out);
  return out;
}
/** The ruler file (R<day>.json) of `day` on the chain with `boost` (the publisher's chain), with its first n hours. */
export function rulerFile(day, n, boost = {}) { const rd = rulerDay(day, boost); return { v: 1, day, field: rd.field, hours: rd.hours.slice(0, n) }; }
export function dayFile(day, pickRows, { hours = 10, extra = {}, boost = {} } = {}) {
  const start = Date.parse(`${day}T14:00:00Z`), rd = rulerDay(day, boost);
  const field = { at: RL.fieldTime(start), round: rd.field.round, window: rd.field.window, nodes: RL.fieldOf(rd.field.card) };
  // Every hour as the recorder keeps it: its own blocks and its card's rows for the field nodes. In hour i the fixture's
  // CUT_ORDER[i] signs at half its rate (lowest fpct: cut); boost: { node: blocks an hour of 100 } signs more.
  const hs = rd.hours.slice(0, hours).map((e, i) => ({ i, from: e.window.S0, to: e.window.S1, rows: RL.rowsOf(e.card, field.nodes.map((n) => n.a)), checked: 2 }));
  const res = L.rulerCutsFrom(field, hs);
  const picks = { 0: pickRows.map(([w, s0, b]) => (b ? [w, s0, start - 3600000, b] : [w, s0, start - 3600000])) };
  const players = pickRows.map(([w, s0, b]) => ({ a: w, r: L.playerResult(field, res, { start: s0, backup: b || null }) })).filter((x) => x.r.entered)
    .map(({ a, r }) => ({ a, start: r.start, jumpTo: r.jumpTo, out: r.out, survived: r.survived, rode: r.rode, jumped: r.jumped, points: r.points, ranked: true }))
    .sort((x, y) => y.points - x.points || (x.a < y.a ? -1 : 1));
  return { v: 1, day, start, week: L.weekOf(start), field, hours: hs, picks, cuts: res.cuts, standing: res.standing, winner: res.winner, done: res.done, players, ...extra };
}
export const boardOf = (days, final = true, week = 3) => {
  const rows = days.flatMap((d) => d.players.map((p) => ({ player: p.a, points: p.points, rode: p.rode, jumped: p.jumped, ranked: p.ranked })));
  const rk = new Set(rows.filter((x) => x.ranked).map((x) => x.player));
  const view = L.places(L.board(rows)).map((x) => ({ a: x.player, place: x.place, pts: x.pts, rides: x.rides, jumps: x.jumps, events: x.events, ranked: rk.has(x.player) }));
  return { v: 1, updated: "x", today: { rows: [] }, week: { rows: [] }, lastWeek: { week, start: L.weekStart(week), final, rows: view }, allTime: { rows: [] } };
};
export const PICKS = [[P1, WINNER], [P2, WINNER], [P4, CUT_ORDER[4]], [P3, CUT_ORDER[2]]];
export const dayW3 = dayFile("2026-11-10", PICKS);
export const brd = boardOf([dayW3]);
export const vgood = { game: 13, week: 3, final: true, rows: [{ player: P1, points: 15 }, { player: P2, points: 15 }, { player: P3, points: 2 }], first: [], second: [] };
/** A void day file, as the recorder writes for an event it never got a field for. */
export const voidDay = (day, why = "no ruler card for the field") => { const start = Date.parse(`${day}T14:00:00Z`);
  return { v: 1, day, start, week: L.weekOf(start), field: null, void: why, hours: [], picks: {}, cuts: [], standing: [], winner: null, done: false, players: [] }; };
/** The rest of week 3 after the recorded Tuesday: void (fix-check N-3: a final week has every event finished or void). */
export const REST_W3 = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
export const history = (b = brd, day = dayW3) => ({ "board.json": b, "D2026-11-10.json": day, ...Object.fromEntries(REST_W3.map((x) => [`D${x}.json`, voidDay(x)])),
  "index.json": { ...idx, days: ["2026-11-10", ...REST_W3] } });

export const S10 = Date.parse("2026-11-10T14:00:00Z");


/** Week 3 with one node far above its multiplier: the winner signs 160 an hour against 100 expected (watch-and-hold
 *  flags it: z about 6 in the event it won). gamed.chain is the chain that really says so. */
export const dayG = dayFile("2026-11-10", PICKS, { boost: { [WINNER]: 160 } });
export const gamed = { history: () => history(boardOf([dayG]), dayG), chain: () => ({ ...chainFor(["2026-11-10", ...REST_W3]), boost: { [WINNER]: 160 } }) };

/** Legacy (before the VHP ruler): race cards are no longer read by Last Node's publish job. Kept so the earlier
 *  rounds' tests still import; FAKE_RACE is ignored. */
export function raceFiles() { return fs.mkdtempSync(path.join(os.tmpdir(), "lns-race-")); }
export function fieldCard(day) { return { at: Date.parse(`${day}T14:00:00Z`) - 26 * 3600000, field: [], paddock: [] }; }
