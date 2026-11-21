// Repo Lens #L-9 (L9-1 to L9-3): three more ops\node\ scripts took the repository folder as the parent of their own
// folder, which was right in the old repo (node\) and is one level short in KnodeGames2 (ops\node\). Written by the
// Vault chat for the three fixes in candidate-fix-l9.diff (Repo Lens's own L9 test file was not available).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const TWO_UP = "Split-Path -Parent (Split-Path -Parent $PSScriptRoot)";

test("L9-1: the producer-key backup's repository-folder guard guards the whole repository", () => {
  const src = read("ops", "node", "backup-producer-keys.ps1");
  assert.ok(src.includes(`$Repo = ${TWO_UP}`), "$Repo is two folders up from ops\\node\\");
  assert.match(src, /\$Repo\b[\s\S]*refus|refus[\s\S]*\$Repo\b/i, "the script still refuses a destination inside $Repo");
});

test("L9-2: the volume move takes the same repair lock as the self-heal (<repo>\\node\\repair.lock)", () => {
  const src = read("ops", "node", "move-node-to-volume.ps1");
  assert.ok(src.includes(`Join-Path (${TWO_UP}) "node"`), "default lock folder is <repo>\\node");
  assert.match(src, /"repair\.lock"/);
  const heal = read("bot", "heal.mjs");
  assert.match(heal, /const DIR = process\.env\.HEAL_DIR \|\| path\.join\(ROOT, "node"\)/, "heal.mjs: <repo>/node unless HEAL_DIR");
  assert.match(heal, /const LOCK = path\.join\(DIR, "repair\.lock"\)/, "heal.mjs: the lock is DIR/repair.lock");
  assert.match(src, /\$env:HEAL_DIR/, "the move honours HEAL_DIR like heal.mjs");
});

test("L9-3: setup-node -RestoreKey checks the key from the repository folder", () => {
  const src = read("ops", "node", "setup-node.ps1");
  assert.ok(src.includes(`Push-Location (${TWO_UP})`), "Push-Location to the repository folder");
});

test("no ops\\ script takes the repository folder as only one level above ops\\<folder>\\", () => {
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ps1") && path.dirname(path.relative(ROOT, p)).split(path.sep).length === 2) {
        // Scripts directly in ops\<folder>\: every $PSScriptRoot parent lookup must go two levels up.
        const txt = fs.readFileSync(p, "utf8");
        for (const [i, line] of txt.split("\n").entries())
          if (/Split-Path\s+(-Parent\s+)?\$PSScriptRoot(\s+-Parent)?/.test(line) && !line.includes(TWO_UP)) bad.push(`${path.relative(ROOT, p)}:${i + 1}`);
      }
    }
  };
  walk(path.join(ROOT, "ops"));
  assert.deepEqual(bad, []);
});

test("I-1: no ops\\ script tells you to run from the old folder C:\\kprediction or from node\\ (the old repository's layout)", () => {
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ps1")) {
        const txt = fs.readFileSync(p, "utf8");
        for (const [i, line] of txt.split("\n").entries())
          if (/C:\\kprediction/i.test(line) || /-File node\\/.test(line)) bad.push(`${path.relative(ROOT, p)}:${i + 1}`);
      }
    }
  };
  walk(path.join(ROOT, "ops"));
  assert.deepEqual(bad, []);
});
