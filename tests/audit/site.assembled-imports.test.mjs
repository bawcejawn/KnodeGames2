// Every file a page script imports by a relative path (./x.js, ./js/lib/y.js, ./games/<slug>/z.js) must be in the
// assembled site. Found before cutover: the Fantasy page imports ./games/fantasy/math.js and parts-web.js, and the
// site build didn't copy games/, so the page's main script would not have loaded on the new site.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
// Its own temp folder, so other tests building the site at the same time cannot collide with it.
const DIST = fs.mkdtempSync(path.join(os.tmpdir(), "kg-dist-imports-"));
process.on("exit", () => fs.rmSync(DIST, { recursive: true, force: true }));

test("every relative import in the built site's scripts resolves inside dist-site", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/ci/assemble-site.mjs"), DIST], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const missing = [], seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return; seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      const t = path.resolve(path.dirname(file), m[1]);
      if (!t.startsWith(DIST + path.sep) || !fs.existsSync(t)) missing.push(`${path.relative(DIST, file)} → ${m[1]}`);
      else walk(t);
    }
  };
  for (const f of fs.readdirSync(DIST).filter((n) => n.endsWith(".js"))) walk(path.join(DIST, f));
  assert.ok(seen.has(path.join(DIST, "games/fantasy/math.js")), "Fantasy's rules file is in the site");
  assert.deepEqual(missing, [], "imports that would 404 on the site");
});

test("only the imported game files are published from games/ (no tests, recorders or json)", () => {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out.push(path.relative(DIST, p)); } };
  if (fs.existsSync(path.join(DIST, "games"))) walk(path.join(DIST, "games"));
  for (const f of out) assert.match(f, /^games\/[a-z0-9-]+\/[a-z0-9-]+\.js$/, f);
});
