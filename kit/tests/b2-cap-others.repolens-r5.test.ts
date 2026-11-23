// Repo Lens 5, #61 (#R5-10 M6): in a parts game, only the rebuilt WEEK files get the 16 MiB parts-week limit.
// Every other file (board.json, live.json, ...) still goes through parseCanon's 2 MB default. Before this test, making
// that default 16 MiB was caught only by "the workflow is out of date", not by any behaviour test.
// Ships as kit/tests/b2-cap-others.repolens-r5.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exampleCfg } from "../testing/example/index.ts";
import { at } from "../testing/fake-clock.ts";
import { checkGame, canon, MAX_FILE_BYTES } from "../publish/check.inline.mjs";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
test("B2 (1): in a parts game, board.json and live.json over 2 MB are held (only week files get the parts limit)", () => {
  const cfg = { ...exampleCfg(), slug: "example", parts: "d", liveBoard: true }, now = at(5, 2, 1);
  const rows = Array.from({ length: 60000 }, (_, i) => ({ a: A, pts: i }));
  const big = { v: 1, updated: new Date(now - 60000).toISOString(), live: { week: 5, start: at(5), final: false, complete: false, rows, prizes: [] } };
  const bigBoard = { v: 1, updated: new Date(now - 60000).toISOString(), lastWeek: { week: 4, rows } };
  assert.ok(canon(big).length > MAX_FILE_BYTES && canon(big).length < 16 * 1048576);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rl5-b2-")), inDir = path.join(root, "in"), pubDir = path.join(root, "pub");
  try {
    fs.mkdirSync(inDir); fs.mkdirSync(pubDir);
    fs.writeFileSync(path.join(inDir, "live.json"), canon(big));
    fs.writeFileSync(path.join(inDir, "board.json"), canon(bigBoard));
    const r = checkGame(cfg, inDir, pubDir, now);
    const why = (n: string) => r.held.find((x: any) => x.name === n)?.why;
    assert.equal(why("live.json"), "over 2 MB");
    assert.equal(why("board.json"), "over 2 MB");
    assert.ok(!r.publish.includes("live.json") && !r.publish.includes("board.json"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
