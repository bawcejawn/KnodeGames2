// Repo Lens #R2-1 (Last Node round 4 @ 0d3483a8), finding LN4-1: the publish job's Python ruler_cuts_from is never tested on
// EQUAL fpct. lastnode-ports.test.mjs draws fpct uniformly from 1,000,000 values, so a tie almost never happens, and the
// JS tie rule (equal fpct: the larger address is cut) is pinned only by lastnode-ruler.test.mjs, not by the Python port.
// Place in tests/audit/. Run: node --import tsx --test tests/audit/repolens-lastnode4-pytie.test.mjs
// Proof: passes on 0d3483a8; fails (1 of 1) when the Python tie-break is reversed (sort key (-fpct, reversed address)).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PY, withPython } from "./lib/platform.mjs";
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
await import(path.resolve(APP, "web/lastnode-math.js"));
const L = globalThis.KLastNode;
const yml = fs.readFileSync(path.resolve(APP, ".github/workflows/lastnode.yml"), "utf8");
const hist = yml.match(/<<'HIST'\n([\s\S]*?)\n\s*HIST\n/)[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
const py = (names, call, input) => execFileSync(PY, ["-I", "-c", `
import ast, datetime, json, math, re, sys
src = sys.argv[1]; names = set(json.loads(sys.argv[2]))
tree = ast.parse(src)
keep = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in names) or (isinstance(n, ast.Assign) and any(e.id in names for t in n.targets for e in ([t] if isinstance(t, ast.Name) else getattr(t, 'elts', []))))]
g = {"math": math, "json": json, "sys": sys, "re": re, "datetime": datetime, "H": 3600000, "DAY": 86400000, "errs": []}
exec(compile(ast.Module(body=keep, type_ignores=[]), "histcheck", "exec"), g)
print(json.dumps(eval(${JSON.stringify(call)}, g)))`, hist, JSON.stringify(names)], { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 1 << 26 });

const A = (c) => "1" + c.repeat(33);
const NAMES = ["A", "B", "C", "D", "E", "F"].map(A);

withPython("LN4-1: ruler_cuts_from cuts the LARGER address on equal fpct, as rulerCutsFrom does (heavy ties on purpose)", () => {
  const R = L.rng(4), cases = [];
  for (let k = 0; k < 300; k++) {
    const n = 3 + Math.floor(R.next() * 4), nodes = NAMES.slice(0, n);
    const field = { at: 0, round: "1", window: { W0: 0, W1: 0, L: 0, S0: 0, S1: 0 }, nodes: nodes.map((a) => ({ a, own: "1" })) };
    // fpct from only three values, so most hours have several nodes tied at the bottom
    const hours = Array.from({ length: n - 1 }, (_, i) => ({ i, from: 0, to: 0, checked: 2, rows: Object.fromEntries(nodes.map((a) => [a,
      { fpct: String(Math.floor(R.next() * 3) * 1000), entry: true, void: false, credited: "0", expected: "1" }])) }));
    cases.push({ field, hours });
  }
  const want = cases.map((c) => L.rulerCutsFrom(c.field, c.hours));
  const got = JSON.parse(py(["DEC", "dec", "ruler_cuts_from"], "[ruler_cuts_from(c['field'], c['hours']) for c in json.load(sys.stdin)]", cases));
  assert.deepEqual(got, want);
  assert.ok(want.some((r) => r.cuts.some((c) => c.why === "luck")), "the sample has luck cuts");
});
