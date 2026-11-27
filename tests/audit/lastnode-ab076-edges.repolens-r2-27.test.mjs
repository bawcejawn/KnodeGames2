// Repo Lens 2 (#145, M-782): three AB-076 edges the PR's tests left open. Each survived a hand change:
//  - 2 nodes with luck plus 1 void node with luck: the void is cut as before (the rule is only for the last 1 or 0);
//  - 1 void node with luck and the rest without any: nobody is left to race it, so the event is void as before;
//  - the recorder's cutsOf passes the week on to rulerCutsFrom.
// Every case also runs through the publish job's Python port.
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
  // A. Three left, one void WITH luck: two still race, so the void is cut as before, plus the normal luck cut.
  { f: ["a", "b", "c"], h: [{ a: row(900000, { void: true }), b: row(200000), c: row(300000) }] },
  // B. Two left, one void WITH luck, the other void WITHOUT: no luck cut can run with one node; the event is void as before.
  { f: ["a", "b"], h: [{ a: row(900000, { void: true }), b: row(null, { void: true }) }] },
  // C. Three left, one with luck, one void with luck, one no entry without an fpct: the two with luck race, the other is cut.
  { f: ["a", "b", "c"], h: [{ a: row(400000), b: row(700000, { void: true }), c: row(null, { entry: false }) }] },
].map((c) => ({ field: field(...c.f), hours: c.h.map(hour) }));

test("week 7: two nodes still racing means a void with luck is cut as before", () => {
  const w = brief(L.rulerCutsFrom(CASES[0].field, CASES[0].hours, 7));
  assert.deepEqual(w, { cuts: [[1, "a", "void"], [1, "b", "luck"]], winner: "c", done: true });
  assert.deepEqual(w, brief(L.rulerCutsFrom(CASES[0].field, CASES[0].hours, 6)));
});

test("week 7: one void with luck and nobody else with luck leaves no winner, as before", () => {
  const w = brief(L.rulerCutsFrom(CASES[1].field, CASES[1].hours, 7));
  assert.deepEqual(w, { cuts: [[1, "a", "void"], [1, "b", "void"]], winner: null, done: true });
  assert.deepEqual(w, brief(L.rulerCutsFrom(CASES[1].field, CASES[1].hours, 6)));
});

test("week 7: a void with luck races the one node left; a node with no fpct is still cut", () => {
  assert.deepEqual(brief(L.rulerCutsFrom(CASES[2].field, CASES[2].hours, 7)), { cuts: [[1, "c", "no entry"], [1, "a", "luck"]], winner: "b", done: true });
  assert.deepEqual(brief(L.rulerCutsFrom(CASES[2].field, CASES[2].hours, 6)), { cuts: [[1, "b", "void"], [1, "c", "no entry"]], winner: "a", done: true });
});

test("the recorder's cutsOf hands the week to rulerCutsFrom", () => {
  const ts = fs.readFileSync(path.resolve(APP, "bot/games/lastnode.ts"), "utf8");
  assert.match(ts, /const cutsOf = \(field: any, hours: Hour\[\], week\?: number\) => \(RULER \? L\.rulerCutsFrom\(field, hours, week\) :/);
});

withPython("the publish job's port decides these edges exactly as rulerCutsFrom", () => {
  const yml = fs.readFileSync(path.resolve(APP, ".github/workflows/lastnode.yml"), "utf8");
  const hist = yml.match(/<<'HIST'\n([\s\S]*?)\n\s*HIST\n/)[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  const input = [];
  for (const c of CASES) for (const wk of [null, 6, 7, 8]) input.push({ field: c.field, hours: c.hours, week: wk });
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
