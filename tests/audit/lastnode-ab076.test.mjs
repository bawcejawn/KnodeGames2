// AB-076 (owner D3, option B; Library M-581): from vault week 7 a node that goes void (or loses its entry) in the final
// hour can't hand the win to the other node. If cutting it would leave at most one node, it stays in that hour's luck cut:
// of all those nodes, only the lowest fpct is cut. Before week 7 nothing changes. The publish job's Python port decides
// exactly the same (taken from lastnode.yml's histcheck heredoc by name).
import "./lib/quiet.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PY, withPython } from "./lib/platform.mjs";
const APP = fileURLToPath(new URL("../..", import.meta.url));
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const L = globalThis.KLastNode;
const A = (c) => "1" + c.repeat(33);
const field = (...cs) => ({ nodes: cs.map((c) => ({ a: A(c) })) });
const row = (fpct, o = {}) => ({ fpct: fpct === null ? null : String(fpct), entry: true, void: false, ...o });
const hour = (m) => ({ rows: Object.fromEntries(Object.entries(m).map(([c, r]) => [A(c), r])) });
const brief = (res) => ({ cuts: res.cuts.map((c) => [c.at, c.a.slice(1, 2), c.why]), winner: res.winner && res.winner.slice(1, 2), done: res.done });

const CASES = [
  // 1. Final hour, the luckier node goes void: before week 7 it hands the win away; from week 7 the luck cut decides.
  { f: ["a", "b"], h: [{ a: row(900000, { void: true }), b: row(100000) }] },
  // 2. Final hour, the unluckier node goes void: the same winner either way.
  { f: ["a", "b"], h: [{ a: row(100000, { void: true }), b: row(900000) }] },
  // 3. Three left, two go void with their luck: from week 7 all three are in the luck cut, only the lowest goes.
  { f: ["a", "b", "c"], h: [{ a: row(500000, { void: true }), b: row(200000, { void: true }), c: row(300000) }] },
  // 4. A void node with no fpct is still cut as before (nothing to rank it by); the other two race on.
  { f: ["a", "b", "c"], h: [{ a: row(null, { void: true }), b: row(200000), c: row(300000) }] },
  // 5. Two left, both void: from week 7 the luck cut still runs between them.
  { f: ["a", "b"], h: [{ a: row(400000, { void: true }), b: row(600000, { void: true }) }] },
  // 6. A tie in luck after a void: the larger address is cut, as in every luck cut.
  { f: ["a", "b"], h: [{ a: row(500000, { void: true }), b: row(500000) }] },
  // 7. Plenty left (4 standing, 1 void): voids are cut as before, plus the normal luck cut.
  { f: ["a", "b", "c", "d"], h: [{ a: row(900000, { void: true }), b: row(100000), c: row(500000), d: row(700000) }] },
  // 8. No entry (fewer than 10 expected blocks) but an fpct, in the final hour: treated like a void.
  { f: ["a", "b"], h: [{ a: row(800000, { entry: false }), b: row(300000) }] },
].map((c) => ({ field: field(...c.f), hours: c.h.map(hour) }));

test("before week 7 the rule is unchanged (with or without a week)", () => {
  for (const c of CASES) {
    const old = brief(L.rulerCutsFrom(c.field, c.hours));
    assert.deepEqual(brief(L.rulerCutsFrom(c.field, c.hours, 6)), old);
    assert.deepEqual(brief(L.rulerCutsFrom(c.field, c.hours, 5)), old);
  }
  assert.deepEqual(brief(L.rulerCutsFrom(CASES[0].field, CASES[0].hours, 6)), { cuts: [[1, "a", "void"]], winner: "b", done: true });
});

test("from week 7 a final-hour void can't hand the win away", () => {
  const w = (i) => brief(L.rulerCutsFrom(CASES[i].field, CASES[i].hours, 7));
  assert.equal(L.FINAL_LUCK_FROM_WEEK, 7);
  assert.deepEqual(w(0), { cuts: [[1, "b", "luck"]], winner: "a", done: true });
  assert.deepEqual(w(1), { cuts: [[1, "a", "luck"]], winner: "b", done: true });
  assert.deepEqual(w(2), { cuts: [[1, "b", "luck"]], winner: null, done: false });
  assert.deepEqual(w(3), { cuts: [[1, "a", "void"], [1, "b", "luck"]], winner: "c", done: true });
  assert.deepEqual(w(4), { cuts: [[1, "a", "luck"]], winner: "b", done: true });
  assert.deepEqual(w(5), { cuts: [[1, "b", "luck"]], winner: "a", done: true });
  assert.deepEqual(w(6), { cuts: [[1, "a", "void"], [1, "b", "luck"]], winner: null, done: false });
  assert.deepEqual(w(7), { cuts: [[1, "b", "luck"]], winner: "a", done: true });
  assert.deepEqual(brief(L.rulerCutsFrom(CASES[0].field, CASES[0].hours, 9)), w(0));
});

test("the page, the recorder and the publish job pass the event's week", () => {
  const js = fs.readFileSync(path.resolve(APP, "web/lastnode.js"), "utf8");
  const ts = fs.readFileSync(path.resolve(APP, "bot/games/lastnode.ts"), "utf8");
  const yml = fs.readFileSync(path.resolve(APP, ".github/workflows/lastnode.yml"), "utf8");
  assert.match(js, /L\.rulerCutsFrom\(df\.field, df\.hours \|\| \[\], df\.week\)/);
  assert.doesNotMatch(ts, /cutsOf\(df\.field(?: \|\| \{ nodes: \[\] \})?, df\.hours\)/);
  assert.doesNotMatch(ts, /L\.rulerCutsFrom\(df\.field, df\.hours\)/);
  assert.doesNotMatch(yml, /ruler_cuts_from\(j\["field"\], j\["hours"\]\)/);
});

withPython("the publish job's ruler_cuts_from decides exactly as rulerCutsFrom, weeks 5 to 8", () => {
  const yml = fs.readFileSync(path.resolve(APP, ".github/workflows/lastnode.yml"), "utf8");
  const hist = yml.match(/<<'HIST'\n([\s\S]*?)\n\s*HIST\n/)[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  const input = [];
  for (const c of CASES) for (const wk of [null, 5, 6, 7, 8]) input.push({ field: c.field, hours: c.hours, week: wk });
  const want = input.map((x) => L.rulerCutsFrom(x.field, x.hours, x.week === null ? undefined : x.week));
  const got = JSON.parse(execFileSync(PY, ["-I", "-c", `
import ast, json, re, sys
src = sys.argv[1]; names = {"DEC", "dec", "ruler_cuts_from", "FINAL_LUCK_FROM_WEEK"}
tree = ast.parse(src)
keep = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in names) or (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets))]
g = {"json": json, "sys": sys, "re": re}
exec(compile(ast.Module(body=keep, type_ignores=[]), "histcheck", "exec"), g)
print(json.dumps([g["ruler_cuts_from"](x["field"], x["hours"], x["week"]) for x in json.load(sys.stdin)]))`, hist], { input: JSON.stringify(input), encoding: "utf8" }));
  assert.deepEqual(got, want);
});

test("the page's rules say it, with the start date", () => {
  const html = fs.readFileSync(path.resolve(APP, "web/lastnode.html"), "utf8");
  assert.match(html, /From week 7 \(events from Monday 7 December 2026\), a void or no-entry node that still has its luck that hour can't end the event by itself/);
});
