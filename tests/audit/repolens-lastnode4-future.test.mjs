// Repo Lens #R2-2 (Last Node round 4, LN4-4): fix-check LN3-1b has no test. The publish job never publishes a day more than a
// day past the next event (a bad record run could otherwise fill the calendar). Real publish shell, Linux only (bash).
import "./lib/quiet.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withBash } from "./lib/platform.mjs";
const APP = fileURLToPath(new URL("../..", import.meta.url));
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
const { publisher, dayFile, idx } = await import("./lastnode-vault.helpers.mjs");
const linux = withBash;
const DAY = 86400000;
linux("LN4-4: a day three days past the clock is not published; the next event's day (field only) is", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  for (const [day, published] of [["2026-11-17", true], ["2026-11-19", false]]) {
    const pub = publisher();
    const f = dayFile(day, [], { hours: 0, extra: { picks: {} } });
    const r = pub.publish({ [`D${day}.json`]: f, "index.json": { ...idx, days: [day] } }, { KG_TEST_NOW: String(now) });
    const got = pub.show(`D${day}.json`);
    assert.equal(got !== null, published, `${day}: ${published ? "not published" : "published"}: ${r.out.split("\n").filter((l) => /::error|refus|Refus|rule|bad/i.test(l)).slice(0, 6).join(" | ")}`);
  }
});
