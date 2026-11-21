// kit-games.yml publish-kit (Fri 20 Nov 2026): a publish list with no parts-week folder (only a price list, a vault file
// or a board) must not end the job. Before the fix, `grep` found no match, `set -euo pipefail` stopped the step, and
// Fantasy's week-5 price list (fantasy/inputs/W5.json) was never published. Runs the rendered lines in bash.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/kit-games.yml"), "utf8").split("\n");
const at = yml.findIndex((l) => l.includes("# KG parts v1: a parts week published again"));
const end = yml.findIndex((l, i) => i > at && /^\s*done\s*$/.test(l));
const block = yml.slice(at, end + 1).map((l) => l.replace(/^ {10}/, "")).join("\n");

function run(list, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitpub-"));
  try {
    const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
    git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
    for (const f of files) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), "{}\n"); }
    if (files.length) { git("add", "-A"); git("commit", "-q", "-m", "seed"); }
    fs.writeFileSync(path.join(dir, "list.txt"), list.map((l) => l + "\n").join(""));
    const out = execFileSync("bash", ["-e", "-c", `set -euo pipefail\nLIST=list.txt\n${block}\necho REACHED\ngit ls-files`], { cwd: dir, encoding: "utf8" });
    return out;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("the rendered block is the fixed one", () => {
  assert.ok(at > 0 && end > at, "block found in kit-games.yml");
  assert.match(block, /\{ grep -oE '\^\[a-z\]\[a-z0-9-\]\{1,23\}\/W\(\[0-9\]\{3\}\|\[1-9\]\[0-9\]\{3\}\)\/' "\$LIST" \|\| true; \} \| sort -u \| while IFS= read -r dir; do/);
  assert.match(fs.readFileSync(path.join(ROOT, "kit/publish/render.mjs"), "utf8"), /\{ grep -oE .*"\$LIST" \|\| true; \} \| sort -u \| while IFS= read -r dir; do/);
});

test("a list with only a price list goes on (was: the step stopped, nothing published)", () => {
  assert.match(run(["fantasy/inputs/W5.json"], []), /REACHED/);
  assert.match(run([], []), /REACHED/, "an empty list too");
  assert.match(run(["fantasy/vault/W4.json", "fantasy/board.json"], ["fantasy/board.json"]), /REACHED/);
});

test("a week folder is still cleared before it is published again", () => {
  const out = run(["fantasy/W004/manifest.json", "fantasy/inputs/W5.json"], ["fantasy/W004/manifest.json", "fantasy/W004/d1.aaaaaaaaaaaa.json", "fantasy/inputs/W4.json"]);
  assert.match(out, /REACHED/);
  assert.doesNotMatch(out, /fantasy\/W004\//, "the old folder's files are removed from the index");
  assert.match(out, /fantasy\/inputs\/W4\.json/, "files outside the folder stay");
});
