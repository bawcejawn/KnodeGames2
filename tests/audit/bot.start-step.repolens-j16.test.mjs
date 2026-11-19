// Repo Lens #J-16 (KnodeGames2 PR #10 @ e23af20), J16-2 (Low, test). Place in tests/audit/.
// Run from the repository root: TZ=UTC node --test tests/audit/bot.start-step.repolens-j16.test.mjs
// bot.reads-game-data.test.mjs checks the start step's TEXT. This test RUNS the step's own script (taken from bot.yml)
// against a local stand-in for the game-data branch (git's url.insteadOf points https://github.com/ at a local folder),
// so each guard is shown to work: the four files are copied, start = the data head, and a missing file, a symlink or a
// missing branch stops the run with exit 1. Needs bash, git and GNU find (as on the GitHub runner).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import yaml from "yaml";

const y = yaml.parse(fs.readFileSync(".github/workflows/bot.yml", "utf8"));
const step = y.jobs.tick.steps.find((s) => s.id === "start");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A bare "GitHub" holding owner/repo with a game-data branch built by `fill(dir)`; returns the root to point at. */
function fakeGithub(fill) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "j16-gh-")), work = fs.mkdtempSync(path.join(os.tmpdir(), "j16-w-"));
  git(work, "init", "-q", "-b", "game-data");
  fill(work);
  git(work, "add", "-A"); git(work, "-c", "user.email=a@b", "-c", "user.name=t", "commit", "-qm", "data");
  fs.mkdirSync(path.join(root, "owner"), { recursive: true });
  git(root, "clone", "-q", "--bare", work, path.join(root, "owner", "repo.git"));
  return { root, head: git(work, "rev-parse", "HEAD") };
}
const good = (w) => {
  fs.mkdirSync(path.join(w, "game-data", "questions"), { recursive: true });
  fs.writeFileSync(path.join(w, "game-data", "questions", "2026-11-18.json"), '{"questions":[]}');
  for (const f of ["index.json", "state.json", "bot-state.json"]) fs.writeFileSync(path.join(w, "game-data", f), "{}");
};
/** Runs the start step in a fresh "main" checkout (with a stale questions folder) and returns { code, out, ws }. */
function runStep(gh) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "j16-ws-")), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "j16-rt-"));
  fs.mkdirSync(path.join(ws, "game-data", "questions"), { recursive: true });
  fs.writeFileSync(path.join(ws, "game-data", "questions", "stale.json"), "{}");
  fs.writeFileSync(path.join(ws, "game-data", "deployment.json"), '{"main":true}');
  const outFile = path.join(tmp, "out");
  const env = { PATH: `/usr/bin:/bin:${path.dirname(execFileSync("which", ["git"], { encoding: "utf8" }).trim())}`, HOME: tmp,
    GITHUB_REPOSITORY: "owner/repo", RUNNER_TEMP: tmp, GITHUB_OUTPUT: outFile, ...step.env,
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.file://${gh.root}/.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/" };
  const r = spawnSync("bash", ["-e", "-c", step.run], { cwd: ws, env, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || ""), ws, output: fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "" };
}

test("start step: copies the four, replaces main's stale questions, keeps main's deployment.json, start = the data head", () => {
  const gh = fakeGithub(good), r = runStep(gh);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(fs.readdirSync(path.join(r.ws, "game-data", "questions")), ["2026-11-18.json"], "stale question files from main are gone");
  for (const f of ["index.json", "state.json", "bot-state.json"]) assert.ok(fs.existsSync(path.join(r.ws, "game-data", f)), f);
  assert.equal(fs.readFileSync(path.join(r.ws, "game-data", "deployment.json"), "utf8"), '{"main":true}', "main's deployment.json is kept");
  assert.equal(r.output.trim(), `sha=${gh.head}`);
});

for (const [name, fill] of [
  ["a missing state.json", (w) => { good(w); fs.rmSync(path.join(w, "game-data", "state.json")); }],
  ["a missing questions folder", (w) => { good(w); fs.rmSync(path.join(w, "game-data", "questions"), { recursive: true }); }],
  ["a symlink in game-data", (w) => { good(w); fs.symlinkSync("/etc/passwd", path.join(w, "game-data", "questions", "x.json")); }],
]) test(`start step: ${name} stops the run (exit 1) and writes no start`, () => {
  const r = runStep(fakeGithub(fill));
  assert.equal(r.code, 1, r.out);
  assert.equal(r.output, "");
});

test("start step: no game-data branch stops the run (exit 1)", () => {
  const gh = fakeGithub(good);
  git(path.join(gh.root, "owner", "repo.git"), "branch", "-m", "game-data", "other");
  const r = runStep(gh);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Could not read the game-data branch/);
});
