// Repo Lens 2 (#70): the publish job's week-6 switch and its "reached" rule were not pinned exactly. With
// `rw >= POINTS_V3_FROM - 1` (caps from week 5) or `reached` set by any win or show (over-cap ones too), every test passed.
// These lines decide the vault's order inside a tied group, so they must match bot/race.ts scoreRaces exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const yml = fs.readFileSync(path.join(process.env.APP || ".", ".github/workflows/race.yml"), "utf8");
const lines = yml.split("\n").map((l) => l.trim());
const once = (s, why) => assert.equal(lines.filter((l) => l === s).length, 1, why);

test("the publish job switches to the new points from POINTS_V3_FROM exactly (never a week earlier)", () => {
  once("POINTS_V3_FROM_WEEK = 6   # = M.POINTS_V3_FROM_WEEK (owner, 23 Nov, M-375: vault week 6; a test checks they match)", "the week-6 constant");
  once("v3 = not legacy and rw >= POINTS_V3_FROM", "v3 from POINTS_V3_FROM, not before");
  once('cap = CAPS_V3.get(r.get("type")) if v3 else None', "caps only in a v3 week");
});

test("the publish job's reached (vault tie order) counts only a result that scored after the cap, like scoreRaces", () => {
  once("if n > 0 and (who not in reached or x[2] > reached[who]): reached[who] = x[2]", "reached only when n > 0");
  assert.equal(lines.filter((l) => l.startsWith("if (right or show) and (who not in reached")).length, 0, "the old rule is gone");
});
