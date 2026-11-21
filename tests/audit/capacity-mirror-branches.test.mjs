// The page mirrors a data branch only if the Cloudflare data Worker serves it. A branch the page mirrors but the
// Worker refuses would come back 404 from data.knodegames.com, and the page returns a 404 as is (it only falls back to
// GitHub on other errors), so those files would never load. Found before cutover: game-data (the question files)
// was in web/data-source.js but not in ops/cloudflare/kg-data-worker.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const setOf = (src, re) => { const m = src.match(re); assert.ok(m, String(re)); return [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]).sort(); };

test("the page's mirrored branches are exactly the data Worker's branches", () => {
  const page = setOf(fs.readFileSync("web/data-source.js", "utf8"), /var BRANCHES = \{([^}]*)\}/);
  const worker = setOf(fs.readFileSync("ops/cloudflare/kg-data-worker.js", "utf8"), /const BRANCHES = new Set\(\[([^\]]*)\]\)/);
  assert.deepEqual(page, worker);
  assert.ok(page.includes("game-data"), "the question files are mirrored too");
});

test("both point at this repository", () => {
  assert.match(fs.readFileSync("web/data-source.js", "utf8"), /var RAW = "https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/";/);
  assert.match(fs.readFileSync("ops/cloudflare/kg-data-worker.js", "utf8"), /const ORIGIN = "https:\/\/raw\.githubusercontent\.com\/bawcejawn\/KnodeGames2\/";/);
});
