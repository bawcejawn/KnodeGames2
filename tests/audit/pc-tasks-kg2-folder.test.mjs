// Repo Lens J14-2 / Vault: the PC's scheduled tasks (self-heal, question release, live uploader) must run from the
// KnodeGames2 folder. Their installers live in ops/node/, two folders below it (the old repo had node/, one below).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const installers = { "install-heal.ps1": "bot\\heal.mjs", "install-release-kick.ps1": "bot\\release-kick.mjs", "install-live-uploader.ps1": "tools\\capacity-live\\uploader.mjs" };

for (const [file, target] of Object.entries(installers)) {
  test(`${file} finds the repository folder and ${target}`, () => {
    const src = fs.readFileSync(path.join(ROOT, "ops", "node", file), "utf8");
    assert.match(src, /\$root = Split-Path -Parent \(Split-Path -Parent \$PSScriptRoot\)/, "two levels up from ops\\node\\");
    assert.ok(src.includes(`Join-Path $root "${target}"`), `the task runs ${target} under the repository folder`);
    assert.ok(fs.existsSync(path.join(ROOT, ...target.split("\\"))), `${target} exists`);
    assert.match(src, /New-Item -ItemType Directory -Force -Path \(Join-Path \$root "node"\)/, "creates node\\ for logs and state");
    assert.ok(!/kprediction/i.test(src), "no old folder name left");
  });
}

test("heal.mjs's repair script default is the one in ops/node/", () => {
  const src = fs.readFileSync(path.join(ROOT, "bot", "heal.mjs"), "utf8");
  assert.match(src, /path\.join\(ROOT, "ops", "node", "repair-node-data\.ps1"\)/);
  assert.ok(fs.existsSync(path.join(ROOT, "ops", "node", "repair-node-data.ps1")));
});
