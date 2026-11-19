// Audit Bot QA audit of a8d0569 (16 Nov 2026), the three Low site/docs findings:
//   AB-062 name spoofing (Unicode lookalikes in pool names), AB-063 wallet addresses in PostHog page addresses,
//   AB-064 SECURITY.md / fairness page saying every upgrade waits.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── AB-062 ──
await import(path.join(ROOT, "web/names.js"));
const R = globalThis.KNames.rules;

test("AB-062: Knode Games / Koinos lookalikes in other scripts, full width, accents or hidden marks are reserved", () => {
  for (const n of ["Кnode Games", "Knоde pool", "Ｋｎｏｄｅ Games", "K~node Games", "Kno­de Games", "Κοινος", "Koinos⁠ Team", "Kóinos Team", "Knode‍Swap"]) {
    assert.equal(R.reserved(n), true, `${JSON.stringify(n)} should be reserved`);
    assert.equal(R.okPool(n), false, `${JSON.stringify(n)} should not be shown as a pool name`);
  }
});

test("AB-062: a pool name mixing Latin with Cyrillic or Greek, or holding a format character, is not shown", () => {
  for (const n of ["Armаna", "JGA Pοol", "Burn⁠Pool", "Pool﻿1", "Pool Two", "Poolx"]) assert.equal(R.okPool(n), false, JSON.stringify(n));
});

test("AB-062: real pool names still show (one script, plain spaces), and Blocknode is not Knode", () => {
  for (const n of ["Armana", "JGA Pool #2", "Пул Москва", "Βουνό Pool".replace("Pool", "Πισίνα"), "Blocknode", "Fogata Pool 7", "café pool"]) assert.equal(R.okPool(n), true, JSON.stringify(n));
  assert.equal(R.checkName("Blocknode"), null);
});

test("AB-062: the bot's names.json filter drops the same lookalikes", () => {
  const db = R.cleanDb({ v: 1, names: {}, hidden: {}, nicknames: {}, pools: { "1BeEqQK6DbdbnAu4EeHrSrcxU8PRrVxY3F": "Кnode Games", "1MbsVfNw6yzQqA8499d1KDEufS8tWm8CzW": "JGA Pool #2" } });
  assert.deepEqual(db.pools, { "1MbsVfNw6yzQqA8499d1KDEufS8tWm8CzW": "JGA Pool #2" });
});

// ── AB-063 ──
function initConfig() {
  let cfg = null;
  const window = { posthog: { init: (_key, c) => { cfg = c; } } };
  vm.runInNewContext(read("web/analytics.js"), { window, location: { hostname: "knodegames.com" } });
  return cfg;
}

test("AB-063: analytics.js hands PostHog a before_send that blanks every wallet address", () => {
  const cfg = initConfig();
  assert.equal(typeof cfg.before_send, "function");
  const w = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr", w2 = "1MbsVfNw6yzQqA8499d1KDEufS8tWm8CzW";
  const ev = cfg.before_send({
    event: "$pageview",
    properties: { $current_url: `https://knodegames.com/node.html?a=${w}&w=28800&b=${w2}`, $pathname: "/node.html", $referrer: `https://knodegames.com/bracket.html?follow=${w}`,
      title: "Producer lookup", $lib_version: "1.438.13", nested: { list: [`x ${w}`] } },
    $set: { $initial_current_url: `https://knodegames.com/mana.html?addr=${w}` }, $set_once: { $initial_referrer: `?a=${w2}` },
  });
  const text = JSON.stringify(ev);
  assert.doesNotMatch(text, /1[1-9A-HJ-NP-Za-km-z]{25,34}/, "no wallet left");
  assert.equal(ev.properties.$current_url, "https://knodegames.com/node.html?a=[wallet]&w=28800&b=[wallet]");
  assert.equal(ev.properties.$pathname, "/node.html");
  assert.equal(ev.properties.$lib_version, "1.438.13");
  assert.equal(ev.event, "$pageview");
});

test("AB-063: an event with nothing to blank goes out unchanged", () => {
  const cfg = initConfig();
  const ev = { event: "$pageleave", properties: { $current_url: "https://knodegames.com/race.html", n: 3 } };
  assert.equal(JSON.stringify(cfg.before_send(structuredClone(ev))), JSON.stringify(ev));
  assert.equal(cfg.before_send(null), null);
});

test("AB-063: the pinned PostHog copy knows before_send (else the option would be ignored)", () => {
  assert.match(read("web/vendor/posthog-1.438.13.js"), /before_send/);
});

// ── AB-064 ──
test("AB-064: SECURITY.md and the fairness page no longer say every contract's upgrades wait", () => {
  const sec = read("SECURITY.md"), fair = read("web/fairness.html");
  assert.doesNotMatch(sec, /Owner changes and code upgrades are announced on chain and wait\./);
  assert.match(sec, /Race picks contract and the Mana sponsor do not wait/);
  assert.match(sec, /vault, the Swap Desk and Picks announce a code upgrade or an owner change on chain and wait/);
  assert.doesNotMatch(fair, /<b>Upgrades wait\.<\/b>/);
  assert.match(fair, /Race picks and the Mana sponsor can get new code at once/);
});

test("AB-064: the wait the pages state matches the contracts (Picks 48 h, Race has no upgrade wait)", () => {
  assert.match(read("contracts/picks/assembly/Picks.ts").replace(/\r/g, ""), /TIMELOCK_MS: u64 = 2 \* DAY_MS/);
  const race = fs.readdirSync(path.join(ROOT, "contracts/race/assembly")).filter((f) => f.endsWith(".ts")).map((f) => read(`contracts/race/assembly/${f}`)).join("\n");
  assert.doesNotMatch(race, /schedule_upgrade|timelock/i);
});
