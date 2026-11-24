// The recorder's course comes from the site's games list. Since the KnodeGames2 layout it lives at web/games.json;
// reading the old root path found nothing, so every hole said "its game has no reader on this recorder" and week 5 had
// no holes (Golf chat, M-500, Mon 23 Nov 2026). This pins the default path to the real file.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.env.APP || ".";
const { sourcesFromGames } = await import(path.resolve(APP, "bot/games/golf.ts"));

test("sourcesFromGames() with no argument reads the real web/games.json: Questions, Race, Block X and Bracket are there", () => {
  const ids = sourcesFromGames().map((s) => s.id);
  for (const id of ["questions", "race", "blockx", "bracket"]) assert.ok(ids.includes(id), `${id} is on the course (got ${ids.join(", ") || "nothing"})`);
  assert.ok(!ids.includes("golf"), "Golf never scores itself");
});

test("every game web/games.json opts in with \"golf\": \"standard\" is on the course, and the same list as reading the file by path", () => {
  const file = path.resolve(APP, "web/games.json");
  assert.ok(fs.existsSync(file));
  assert.deepEqual(sourcesFromGames(), sourcesFromGames(file));
  const std = JSON.parse(fs.readFileSync(file, "utf8")).games.filter((g) => g.golf === "standard").map((g) => g.id);
  for (const id of std) assert.ok(sourcesFromGames().some((s) => s.id === id && s.reader === "standard"), id);
});
