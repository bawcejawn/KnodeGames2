// M-822 / M-828 (Thu 26 Nov): games-data has several writers (Last Node, Golf, Combo, the kit, games.yml) that push in the
// same minutes. games.yml's publish now retries a refused push like kit-games.yml (#164): the checked game folders go on
// the new tip, everything else stays as the tip has it, and a change to one of its own folders refuses the push.
// This runs the committed loop itself against a local repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const NO_BASH = process.platform === "win32" ? "runs bash (the CI runner is Linux)" : false;
const sh = (cwd, s) => spawnSync("bash", ["-euo", "pipefail", "-c", s], { cwd, encoding: "utf8",
  env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });

function retryLoop(file) {
  const y = fs.readFileSync(path.join(".github/workflows", file), "utf8");
  const m = y.match(/\n( *)for try in 1 2 3; do\n(?:(?!\n\1done\n)[\s\S])*?git push -q "\$remote" "\$commit:refs\/heads\/games-data"[\s\S]*?\n\1done\n/);
  assert.ok(m, `${file}: the retry loop around the games-data push`);
  return m[0];
}

function run(loop, mine, otherPath) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "games-retry-"));
  assert.equal(sh(d, `git init -q --bare r.git && git init -q s && cd s && mkdir -p ${mine} lastnode && echo 1 > ${mine}/board.json && echo 1 > lastnode/board.json && git add . && git commit -qm i && git push -q ../r.git HEAD:refs/heads/games-data`).status, 0);
  const r = sh(d, `remote="file://${d}/r.git"; mkdir w && cd w && git init -q && git fetch -q --depth 1 "$remote" games-data && parent=$(git rev-parse FETCH_HEAD) && git read-tree "$parent"
    echo 2 > ../new && git update-index --add --cacheinfo "100644,$(git hash-object -w ../new),${mine}/board.json"; tree=$(git write-tree); commit=$(git commit-tree "$tree" -p "$parent" -m mine)
    (cd ../s && echo x > ${otherPath} && git commit -qam other && git push -q ../r.git HEAD:refs/heads/games-data)
    sleep() { :; }
    ${loop}`);
  const show = (f) => sh(d, `git --git-dir=r.git show games-data:${f}`).stdout.trim();
  return { r, mine: show(`${mine}/board.json`), other: show("lastnode/board.json") };
}

for (const [file, mine] of [["games.yml", "blockx"]]) {   // kit-games.yml has the same loop and its own test (#164, kit/tests/render.test.ts)
  test(`${file}: a refused games-data push is retried on the new tip; the other recorder's file is kept`, { skip: NO_BASH }, () => {
    const ok = run(retryLoop(file), mine, "lastnode/board.json");
    assert.equal(ok.r.status, 0, ok.r.stderr + ok.r.stdout);
    assert.match(ok.r.stdout, /Retrying the push on the new tip/);
    assert.deepEqual([ok.mine, ok.other], ["2", "x"]);
  });
  test(`${file}: if one of its own folders changed meanwhile, nothing is pushed over it`, { skip: NO_BASH }, () => {
    const bad = run(retryLoop(file), mine, `${mine}/board.json`);
    assert.equal(bad.r.status, 1);
    assert.match(bad.r.stdout, new RegExp(`${mine} changed on games-data while this run checked it`));
    assert.equal(bad.mine, "x");
  });
}
