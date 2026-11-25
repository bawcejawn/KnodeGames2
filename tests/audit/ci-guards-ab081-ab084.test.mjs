// Audit AB-081 (a skipped vault test passed CI) and AB-084 (the timer lint missed crons not in double quotes).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const run = (args, env = {}) => spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, ...env } });

test("AB-081: the vault test runner fails when a test is skipped, and CI's test:vault uses it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ab081-"));
  const skips = path.join(dir, "skips.test.mjs"), passes = path.join(dir, "passes.test.mjs");
  fs.writeFileSync(skips, 'import { test } from "node:test";\ntest("needs the build", { skip: "build missing" }, () => {});\ntest("ok", () => {});\n');
  fs.writeFileSync(passes, 'import { test } from "node:test";\ntest("ok", () => {});\n');
  const a = run(["tools/ci/run-no-skip.mjs", skips]);
  assert.equal(a.status, 1, "a skipped test fails the run");
  assert.match(a.stderr, /1 skipped .* A skip is not a pass \(audit AB-081\)/);
  assert.match(a.stderr, /npm run build:sim/);
  const b = run(["tools/ci/run-no-skip.mjs", passes]);
  assert.equal(b.status, 0, b.stderr); assert.match(b.stdout, /1 vault tests ran, none skipped/);
  assert.equal(run(["tools/ci/run-no-skip.mjs"]).status, 2, "no files named");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["test:vault"], /^node tools\/ci\/run-no-skip\.mjs /);
  for (const f of ["bot/vault.test.ts", "bot/vault-fuzz.test.ts", "bot/chain-keyorder.test.ts", "bot/free-prizes.test.ts"]) assert.ok(pkg.scripts["test:vault"].includes(f), f);
  assert.match(fs.readFileSync(".github/workflows/ci.yml", "utf8"), /run: npm run test:vault/, "CI runs it");
});

function lintWith(workflows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ab084-"));
  fs.mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  fs.mkdirSync(path.join(root, "web"));
  fs.writeFileSync(path.join(root, "web/index.html"), '<script src="early-view.js"></script>');
  fs.writeFileSync(path.join(root, "web/fairness.html"), "");
  for (const [name, text] of Object.entries(workflows)) fs.writeFileSync(path.join(root, ".github/workflows", name), text);
  return run(["tools/ci/lint.mjs"], { LINT_ROOT: root });
}
const ok = 'name: race\non:\n  schedule:\n    - cron: "37 * * * *"\n  workflow_dispatch:\njobs: {}\n';

test("AB-084: every cron counts, however it is written", () => {
  assert.equal(lintWith({ "race.yml": ok }).status, 0, "the allowed timer passes");
  for (const [what, text] of [
    ["an extra single-quoted cron", ok.replace('    - cron: "37 * * * *"\n', "    - cron: \"37 * * * *\"\n    - cron: '5 * * * *'\n")],
    ["an unquoted cron", ok.replace('"37 * * * *"', "37 * * * *").replace("37 * * * *", "5 * * * *")],
    ["a flow-style cron", ok.replace('    - cron: "37 * * * *"\n', "    - { cron: '5 * * * *' }\n")],
  ]) {
    const r = lintWith({ "race.yml": text });
    assert.equal(r.status, 1, what); assert.match(r.stderr, /race\.yml: timers .*5 \* \* \* \*/, what);
  }
  const r = lintWith({ "race.yml": ok, "sneaky.yml": "on:\n  schedule:\n    - cron: '*/5 * * * *'\njobs: {}\n" });
  assert.equal(r.status, 1); assert.match(r.stderr, /sneaky\.yml: timers/, "a timer in a file with no allowed timers");
  const bad = lintWith({ "race.yml": ok, "broken.yml": "on: [push\n" });
  assert.equal(bad.status, 1); assert.match(bad.stderr, /broken\.yml: not valid YAML/);
});
