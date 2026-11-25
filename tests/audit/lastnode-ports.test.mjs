// Fix-check round 2 (N-8, N-9): the publish job's Python ports must decide exactly as the recorder's JavaScript.
// The functions are taken from the workflow's histcheck.py heredoc itself (by name, with Python's ast module, nothing
// else in the script runs) and fed the same random weeks as the recorder's own watchWeek and hInt.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PY, withPython } from "./lib/platform.mjs";
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const { watchWeek } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
const RL = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode-ruler.ts")).href);
const L = globalThis.KLastNode;
const yml = fs.readFileSync(path.resolve(APP, ".github/workflows/lastnode.yml"), "utf8");
const hist = yml.match(/<<'HIST'\n([\s\S]*?)\n\s*HIST\n/)[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
const py = (names, call, input) => execFileSync(PY, ["-I", "-c", `
import ast, datetime, json, math, re, sys
src = sys.argv[1]; names = set(json.loads(sys.argv[2]))
tree = ast.parse(src)
keep = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in names) or (isinstance(n, ast.Assign) and any(e.id in names for t in n.targets for e in ([t] if isinstance(t, ast.Name) else getattr(t, 'elts', [])) if isinstance(e, ast.Name)))]
g = {"math": math, "json": json, "sys": sys, "re": re, "datetime": datetime, "H": 3600000, "DAY": 86400000, "errs": []}
exec(compile(ast.Module(body=keep, type_ignores=[]), "histcheck", "exec"), g)
print(json.dumps(eval(${JSON.stringify(call)}, g)))`, hist, JSON.stringify(names)], { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 1 << 26 });

const A = (c) => "1" + c.repeat(33);
const NODES = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"].map(A);
/** A random week on the VHP ruler: a field (own), hour rows (fpct, entry, void, credited, expected), the cuts. */
function week(R) {
  const n = 3 + Math.floor(R.next() * (NODES.length - 2)), nodes = NODES.slice(0, n);
  const field = { at: 0, round: "1", window: { W0: 0, W1: 0, L: 0, S0: 0, S1: 0 }, nodes: nodes.map((a) => ({ a, own: String(1 + Math.floor(R.next() * 1e15)) })) };
  const boost = nodes.map(() => (R.next() < 0.15 ? 1 + R.next() * 0.6 : 1));
  const evs = [];
  for (let d = 0; d < 7; d++) {
    const hours = Array.from({ length: n - 1 }, (_, i) => ({ i, from: 0, to: 0, checked: 2, rows: Object.fromEntries(nodes.map((a, k) => {
      const e = 20 + Math.floor(R.next() * 150), g = R.poisson(e * boost[k]);
      return [a, { fpct: R.next() < 0.03 ? null : String(Math.floor(R.next() * 1e6)), entry: R.next() > 0.03, void: R.next() < 0.02, credited: String(g * 1e6), expected: String(e * 1e6 + Math.floor(R.next() * 1e6)) }];
    })) }));
    const res = L.rulerCutsFrom(field, hours);
    evs.push({ v: 1, day: `d${d}`, start: d * 86400000, week: 0, field, hours, picks: {}, cuts: res.cuts, standing: res.standing, winner: res.winner, done: res.done, players: [], ...(R.next() < 0.05 ? { void: "x" } : {}) });
  }
  return evs;
}

withPython("N-9: the publish job's watch_week flags exactly what the recorder's watchWeek flags (500 random ruler weeks)", () => {
  const R = L.rng(77), weeks = Array.from({ length: 500 }, () => week(R));
  const want = weeks.map((w) => watchWeek(w, 3600000));
  const got = JSON.parse(py(["js_round", "DEC", "dec", "ruler_cuts_from", "FINAL_LUCK_FROM_WEEK", "watch_week", "WEEK_Z", "WEEK_WINS", "EVENT_Z"], "[watch_week(w) for w in json.load(sys.stdin)]", weeks));
  assert.deepEqual(got, want);
  assert.ok(want.filter((x) => x.length).length >= 20, "the sample has flagged weeks too");
});

withPython("ruler: the publish job's ruler_cuts_from and player_result give the recorder's rulerCutsFrom and playerResult (several cuts an hour)", () => {
  const R = L.rng(31), cases = [];
  for (let k = 0; k < 400; k++) {
    const [ev] = week(R), names = ev.field.nodes.map((x) => x.a);
    const pick = () => names[Math.floor(R.next() * names.length)];
    const picks = Array.from({ length: 6 }, () => { const s0 = pick(), b = R.next() < 0.6 ? pick() : null; return [s0, b && b !== s0 ? b : null]; });
    cases.push({ field: ev.field, hours: ev.hours.slice(0, Math.floor(R.next() * (ev.hours.length + 1))), picks });
  }
  const want = cases.map((c) => { const res = L.rulerCutsFrom(c.field, c.hours); return { res, players: c.picks.map(([s0, b]) => { const r = L.playerResult(c.field, res, { start: s0, backup: b }); return [r.out, r.survived, r.jumped, r.jumpTo, r.rode, r.points]; }) }; });
  const got = JSON.parse(py(["DEC", "dec", "ruler_cuts_from", "player_result", "js_round", "BONUS_STAYED", "BONUS_JUMPED"],
    "[(lambda res: {'res': res, 'players': [(lambda r: [r['out'], r['survived'], r['jumped'], r['jumpTo'], r['rode'], r['points']])(player_result(c['field'], res, s0, b)) for s0, b in c['picks']]})(ruler_cuts_from(c['field'], c['hours'])) for c in json.load(sys.stdin)]", cases));
  assert.deepEqual(got.map((x) => x.res), want.map((x) => x.res));
  assert.deepEqual(got.map((x) => x.players), want.map((x) => x.players));
  assert.ok(want.some((x) => x.res.cuts.some((c, i, a) => i && a[i - 1].at === c.at)), "the sample has hours with several cuts");
});

withPython("ruler: the publish job's settings, rounds, windows, field and rows are the recorder's (lastnode-ruler.ts)", () => {
  const got = JSON.parse(py(["RULER_SET", "CARD_BLOCKS", "FIELD_BLOCKS", "FIELD_LEAD", "ymdh", "hour_round", "field_round", "hour_window", "field_window", "settings", "field_of", "rows_of"],
    "(lambda a: {'set': RULER_SET, 'lead': FIELD_LEAD, 'blocks': [CARD_BLOCKS, FIELD_BLOCKS], 'hr': hour_round(a['t']), 'fr': field_round(a['t']), 'hw': hour_window(5000, 6199), 'fw': field_window(9000), 's': settings('7', hour_window(5000, 6199), True), 'field': field_of(a['card']), 'rows': rows_of(a['card'], a['nodes'])})(json.load(sys.stdin))",
    { t: Date.parse("2026-11-17T15:00:00Z"), card: { producers: [{ a: A("B"), own: "5", entry: true, fpct: "1", void: false, credited: "2", expected: "3" }, { a: A("A"), own: "5", entry: true, fpct: null, void: true, credited: "0", expected: "1" }, { a: A("C"), own: "9", entry: false, credited: "0", expected: "0" }] }, nodes: [A("A"), A("B"), A("Z")] }));
  const card = JSON.stringify({ producers: [{ a: A("B"), own: "5", entry: true, fpct: "1", void: false, credited: "2", expected: "3" }, { a: A("A"), own: "5", entry: true, fpct: null, void: true, credited: "0", expected: "1" }, { a: A("C"), own: "9", entry: false, credited: "0", expected: "0" }] });
  assert.deepEqual(got.set, { ...RL.RULER, pooled: [...RL.RULER.pooled] });
  assert.equal(got.lead, RL.FIELD_LEAD_MS); assert.deepEqual(got.blocks, [RL.CARD_BLOCKS, RL.FIELD_BLOCKS]);
  const t = Date.parse("2026-11-17T15:00:00Z");
  assert.equal(got.hr, RL.hourRound(t)); assert.equal(got.fr, RL.fieldRound(t));
  assert.deepEqual(got.hw, RL.hourWindow(5000, 6199)); assert.deepEqual(got.fw, RL.fieldWindow(9000));
  assert.deepEqual(got.s, RL.settingsFor("7", RL.hourWindow(5000, 6199), true));
  assert.deepEqual(got.field, RL.fieldOf(card)); assert.deepEqual(got.rows, RL.rowsOf(card, [A("A"), A("B"), A("Z")]));
});

test("ruler: the vhp_ruler.py embedded in lastnode.yml is the repository's file, byte for byte", () => {
  const m = yml.match(/\n( +)# BEGIN vhp_ruler\.py\n([\s\S]*?)\n +# END vhp_ruler\.py\n/);
  assert.ok(m, "the embed markers are in lastnode.yml");
  const body = m[2].split("\n").map((l) => (l.startsWith(m[1]) ? l.slice(m[1].length) : l.trim() === "" ? "" : l)).join("\n") + "\n";
  assert.equal(body, fs.readFileSync(path.resolve(APP, "ruler/vhp_ruler.py"), "utf8"), "run: node tools/lastnode-ruler-embed.mjs");
});

withPython("N-8: js_round and h_int are JavaScript's Math.round, including 0.49999999999999994 and halves", () => {
  const xs = [0.49999999999999994, 0.5, 1.5, 2.5, -0.5, 1e4 * 4.9999999999999996e-5, 12345.5, 0.1 + 0.2, 4503599627370495.5];
  const got = JSON.parse(py(["js_round"], "[js_round(x) for x in json.load(sys.stdin)]", xs));
  assert.deepEqual(got, xs.map((x) => Math.round(x) + 0));   // + 0: JSON has no -0
});

withPython("Free play: the publish job's free_prizes and free_places give the recorder's first and second (400 random boards)", async () => {
  const { freePlaces } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
  const R = L.rng(9), boards = [];
  for (let k = 0; k < 400; k++) {
    const n = 1 + Math.floor(R.next() * 30);
    const rows = Array.from({ length: n }, (_, i) => ({ a: "1" + (i.toString(36) + "w".repeat(40)).slice(0, 33), pts: Math.floor(R.next() * 6), rides: Math.floor(R.next() * 2), jumps: Math.floor(R.next() * 2), events: 1 + Math.floor(R.next() * 7) }))
      .sort((x, y) => y.pts - x.pts || y.rides - x.rides || x.jumps - y.jumps || (x.a < y.a ? -1 : 1));
    const ok = rows.filter(() => R.next() < 0.7).map((r) => r.a);
    // Fix-check LN3-2: score times (some equal, some missing) for D-159's cut of a tie of more than 10.
    const reached = Object.fromEntries(rows.filter(() => R.next() < 0.9).map((r) => [r.a, 1000 + Math.floor(R.next() * 4)]));
    boards.push({ rows, ok, reached });
  }
  // Big ties on purpose (15 tied for 1st; 1 then 14 tied for 2nd), with some score times equal.
  for (const lead of [0, 1]) {
    const rows = Array.from({ length: 15 }, (_, i) => ({ a: "1" + ("t" + i.toString(36) + "u".repeat(40)).slice(0, 33), pts: lead && i === 0 ? 5 : 3, rides: 0, jumps: 0, events: 4 }));
    boards.push({ rows, ok: rows.map((r) => r.a), reached: Object.fromEntries(rows.map((r, i) => [r.a, 2000 + (i % 3)])) });
  }
  const want = boards.map(({ rows, ok, reached }) => { const s = new Set(ok); const p = freePlaces(L.freePrizes(rows.map((r) => ({ ...r, player: r.a })), (a) => s.has(a)), new Map(Object.entries(reached))); return [p.first, p.second]; });
  const got = JSON.parse(py(["free_prizes", "free_places", "FREE_MIN_EVENTS", "FREE_AMOUNTS"], "[list(free_places(free_prizes(b['rows'], lambda a, s=set(b['ok']): a in s), b['reached'])) for b in json.load(sys.stdin)]", boards));
  assert.deepEqual(got, want);
  assert.ok(want.filter(([f, s]) => f.length >= 2).length >= 5 && want.filter(([f, s]) => s.length >= 2).length >= 5, "ties in both places are in the sample");
  assert.ok(want.some(([f, s]) => f.length === 10 || s.length === 10), "a tie of more than 10, cut to exactly 10, is in the sample");
});

withPython("Free play: the publish job's reached_of gives the recorder's reachedOf (D-159's score time, 300 random weeks)", async () => {
  const { reachedOf } = await import(pathToFileURL(path.resolve(APP, "bot/games/lastnode.ts")).href);
  const R = L.rng(11), weeks = [];
  const who = Array.from({ length: 12 }, (_, i) => "1" + (i.toString(36) + "v".repeat(40)).slice(0, 33));
  for (let k = 0; k < 300; k++) weeks.push(Array.from({ length: 1 + Math.floor(R.next() * 7) }, () => {
    const ps = who.filter(() => R.next() < 0.6);
    return { players: ps.map((a) => ({ a, points: Math.floor(R.next() * 3) })), picks: { "0": ps.map((a) => [a, who[0], Math.floor(R.next() * 1e6)]) }, ...(R.next() < 0.1 ? { void: "never recorded" } : {}) };
  }));
  const want = weeks.map((w) => Object.fromEntries([...reachedOf(w)].sort()));
  const got = JSON.parse(py(["reached_of"], "[dict(sorted(reached_of(w).items())) for w in json.load(sys.stdin)]", weeks));
  assert.deepEqual(got, want);
});
