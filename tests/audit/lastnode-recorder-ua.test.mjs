// Last Node recorder, 23 Nov 2026 (M-416/M-423): every chain call in lastnode.yml's Python sends a User-Agent (without one,
// koinos.armana.io answered 403 and every run from Sun 22 Nov failed), and the timer is the plain three-an-hour one.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
const yml = fs.readFileSync(new URL("../../.github/workflows/lastnode.yml", import.meta.url), "utf8");

test("every urllib request in lastnode.yml sends a User-Agent", () => {
  const reqs = yml.split("\n").filter((l) => l.includes("urllib.request.Request("));
  assert.ok(reqs.length >= 2, "expected the ruler and the publish-check chain calls");
  for (const l of reqs) assert.match(l, /["']user-agent["']\s*:/i, `no User-Agent: ${l.trim().slice(0, 120)}`);
});

test("the timer is three times an hour, all day, and can be started by hand", () => {
  const crons = [...yml.matchAll(/^\s*- cron: "([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(crons, ["2,22,42 * * * *"]);
  assert.match(yml, /^\s*workflow_dispatch:/m);
});
