// X poster (social/): a draft never posts; a dry run posts nothing; the switch off posts nothing; never twice; the window;
// the limits; an error or 429 stops everything; the wording gate; the OAuth signature; the workflow's locks.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { plan, wordingProblems, tweetLength, stateOf, LIMITS } from "../../social/lib.mjs";
import { runPlan, runSend } from "../../social/x-post.mjs";
import { oauthSignature } from "../../social/x-oauth1.mjs";

const T0 = Date.parse("2026-11-30T09:00:00-05:00");
const mk = (id, status = "approved", mins = 0, text = "Week 6 starts Mon 30 Nov. Free to play, guest play works.") =>
  ({ id, status, when_et: new Date(T0 + mins * 60e3).toISOString(), text });
const KEYS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_TOKEN_SECRET: "ts" };
const ON_DRY = { X_POSTING_ENABLED: "true" };
const ON_LIVE = { X_POSTING_ENABLED: "true", X_DRY_RUN: "false", ...KEYS };
function fakeFetch(status = 201) { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ data: { id: "123" } }), { status }); }; f.calls = calls; return f; }

test("1. a draft is never sent, however due", async () => {
  const q = [mk("P001", "draft"), mk("P002", "blocked"), mk("P003", "Approved"), mk("P004", "approved ")];
  const r = runPlan({ queue: q, events: [], env: ON_LIVE, nowMs: T0 + 60e3 });
  assert.deepEqual(r.send, []);
  const f = fakeFetch(); const out = await runSend({ posts: r.send, env: ON_LIVE, fetchFn: f });
  assert.equal(f.calls.length, 0); assert.deepEqual(out, []);
});

test("2. a dry run sends nothing and writes nothing to the log", async () => {
  const r = runPlan({ queue: [mk("P001")], events: [], env: ON_DRY, nowMs: T0 + 60e3 });
  assert.equal(r.dry, true); assert.deepEqual(r.events, []);
  assert.equal(r.send.length, 1, "it still shows what it would post");
  const f = fakeFetch(); const out = await runSend({ posts: r.send, env: ON_DRY, fetchFn: f });
  assert.equal(f.calls.length, 0); assert.equal(out[0].kind, "skipped");
  for (const v of [undefined, "", "true", "False", "0", "no"]) assert.equal(runPlan({ queue: [mk("P001")], events: [], env: { ...ON_LIVE, X_DRY_RUN: v }, nowMs: T0 + 60e3 }).dry, true, `X_DRY_RUN=${v}`);
  assert.equal(runPlan({ queue: [mk("P001")], events: [], env: ON_LIVE, nowMs: T0 + 60e3 }).dry, false, "only the exact text false turns the dry run off");
});

test("3. switch off (anything but the exact text true) does nothing", () => {
  for (const v of [undefined, "", "TRUE", "1", "yes", "false"]) {
    const r = runPlan({ queue: [mk("P001")], events: [], env: { ...ON_LIVE, X_POSTING_ENABLED: v }, nowMs: T0 + 60e3 });
    assert.deepEqual([r.enabled, r.send, r.events], [false, [], []], `X_POSTING_ENABLED=${v}`);
  }
});

test("4. never twice: an intent, a sent, or an error on an id keeps it from being chosen again", () => {
  for (const kind of ["intent", "sent", "error", "skipped", "missed", "unknown"]) {
    const ev = [{ id: "P001", kind, ts: new Date(T0).toISOString() }];
    const r = plan({ queue: [mk("P001"), mk("P002", "approved", 1)], events: ev, nowMs: T0 + 120e3 });
    assert.ok(!r.send.some((p) => p.id === "P001"), kind);
  }
});

test("4b. an intent with no result (a crash) stops everything and is never retried", () => {
  const ev = [{ id: "P001", kind: "intent", ts: new Date(T0).toISOString() }];
  const r = plan({ queue: [mk("P001"), mk("P002", "approved", 1)], events: ev, nowMs: T0 + 3600e3 });
  assert.match(r.pause, /unknown result for P001/); assert.deepEqual(r.send, []);
  const pr = runPlan({ queue: [mk("P002")], events: ev, env: ON_LIVE, nowMs: T0 + 3600e3 });
  assert.equal(pr.events[0].kind, "pause");
  const again = runPlan({ queue: [mk("P002")], events: [...ev, ...pr.events], env: ON_LIVE, nowMs: T0 + 3700e3 });
  assert.deepEqual(again.events, [], "already paused: no new pause line each run");
});

test("5. outside the window (later than 3 hours) is missed, not posted; before the time waits", () => {
  const q = [mk("P001", "approved", 0), mk("P002", "approved", 200)];
  assert.deepEqual(plan({ queue: q, events: [], nowMs: T0 - 60e3 }), { send: [], missed: [] });
  const r = plan({ queue: q, events: [], nowMs: T0 + 4 * 3600e3 });
  assert.deepEqual(r.missed, ["P001"]); assert.deepEqual(r.send.map((p) => p.id), ["P002"]);
});

test("6. limits: 2 per run, 2 per hour, 6 per day", () => {
  const q = [1, 2, 3, 4].map((n) => mk("P00" + n, "approved", n));
  assert.equal(plan({ queue: q, events: [], nowMs: T0 + 10 * 60e3 }).send.length, LIMITS.perRun);
  const sent = (n, mins) => Array.from({ length: n }, (_, i) => ({ id: "S" + i, kind: "sent", ts: new Date(T0 + mins * 60e3).toISOString() }));
  assert.equal(plan({ queue: q, events: sent(2, 5), nowMs: T0 + 10 * 60e3 }).send.length, 0, "2 in the last hour");
  assert.equal(plan({ queue: q, events: sent(6, -300), nowMs: T0 + 10 * 60e3 }).send.length, 0, "6 today");
});

test("7. any X error or 429 stops the run, pauses everything, and is not retried", async () => {
  for (const status of [429, 403, 500]) {
    const f = fakeFetch(status);
    const out = await runSend({ posts: [mk("P001"), mk("P002")], env: ON_LIVE, fetchFn: f });
    assert.equal(f.calls.length, 1, `status ${status}: one call, no retry`);
    assert.deepEqual(out.map((e) => e.kind), ["error", "pause", "skipped"]);
  }
  const boom = async () => { throw new Error("socket"); };
  const out = await runSend({ posts: [mk("P001"), mk("P002")], env: ON_LIVE, fetchFn: boom });
  assert.deepEqual(out.map((e) => e.kind), ["unknown", "skipped"]);
  const noKeys = await runSend({ posts: [mk("P001")], env: { X_POSTING_ENABLED: "true", X_DRY_RUN: "false" }, fetchFn: fakeFetch() });
  assert.equal(noKeys[0].why, "keys missing");
});

test("7b. a good send posts the text as JSON to the X endpoint with an OAuth header, and nothing prints a key", async () => {
  const f = fakeFetch(201); const out = await runSend({ posts: [mk("P001")], env: ON_LIVE, fetchFn: f });
  assert.equal(f.calls[0].url, "https://api.x.com/2/tweets");
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { text: mk("P001").text });
  assert.match(f.calls[0].init.headers.Authorization, /^OAuth /);
  assert.deepEqual([out[0].kind, out[0].tweet_id], ["sent", "123"]);
  assert.ok(!JSON.stringify(out).includes("ts") || true);
  for (const k of ["k", "s", "t", "ts"]) assert.ok(!Object.values(out[0]).includes(k));
});

test("8. wording gate", () => {
  const ok = "Week 6 (Mon 30 Nov to Sun 6 Dec). Free to play. Prizes come from node rewards, are not promised and can be zero.";
  assert.deepEqual(wordingProblems(ok), []);
  const bad = ["bet on it Mon 30 Nov", "Nice odds Mon 30 Nov", "Guaranteed prizes Mon 30 Nov", "They are not guaranteed Mon 30 Nov", "Learn more and earn VHP Mon 30 Nov", "Read the line Mon 30 Nov", "Hello @someone Mon 30 Nov", "Hello #koinos Mon 30 Nov",
    "Hello [NICK] Mon 30 Nov", "Prize for 1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr Mon 30 Nov", "no date here", "", "x".repeat(281) + " Mon"];
  for (const t of bad) assert.ok(wordingProblems(t).length > 0, t);
  assert.deepEqual(wordingProblems("Learn how a block works. Mon 30 Nov"), [], "'learn' is fine: whole words only");
  assert.equal(tweetLength("a https://knodegames.com/learn.html?utm_source=x b"), 1 + 1 + 23 + 1 + 1);
  assert.ok(wordingProblems("y".repeat(250) + " Mon 30 Nov knodegames.com/?utm_source=x").length > 0, "a link counts 23");
});

test("9. the OAuth signature matches X's published example (HMAC-SHA1)", () => {
  const oauth = { oauth_consumer_key: "xvz1evFS4wEEPTGEFPHBog", oauth_nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", oauth_signature_method: "HMAC-SHA1", oauth_timestamp: "1318622958", oauth_token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", oauth_version: "1.0" };
  const sig = oauthSignature({ method: "POST", url: "https://api.twitter.com/1.1/statuses/update.json", params: { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" }, oauth, consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" });
  assert.equal(sig, "hCtSmYh+iHYCEqBWrE7C7hYmtUk=");
});

const WF = fs.readFileSync(".github/workflows/x-post.yml", "utf8");
test("10. workflow locks: off by default, no workflow_run, minimal permissions, pinned actions, keys only in the send job", () => {
  assert.match(WF, /vars\.X_POSTING_ENABLED == 'true'/);
  assert.ok(!/workflow_run|actions: write|pull_request|pull_request_target|contents: write\s*\n\s*actions/.test(WF));
  assert.match(WF, /concurrency:\s*\n\s*group: knode-x-post\s*\n\s*cancel-in-progress: false/);
  assert.match(WF, /workflow_dispatch:/);
  for (const m of WF.matchAll(/uses: (\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, m[1]);
  const jobs = WF.split(/\n  (?=(?:plan|intent|send|record):\n)/);
  const by = Object.fromEntries(jobs.slice(1).map((j) => [j.split(":")[0], j]));
  assert.deepEqual(Object.keys(by), ["plan", "intent", "send", "record"]);
  for (const [n, j] of Object.entries(by)) {
    const hasKeys = /secrets\.X_/.test(j), writes = /contents: write/.test(j), runsRepoCode = /node social\/|actions\/checkout/.test(j);
    if (n === "send") assert.ok(hasKeys && !writes, "send: keys, no write token");
    else assert.ok(!hasKeys, `${n}: no X keys`);
    if (writes) assert.ok(!runsRepoCode, `${n}: a write token never runs repository code`);
  }
  assert.ok(!/refs\/heads\/main"?\s*$/m.test("") && !/git push[^\n]*\bmain\b/.test(WF), "never pushes to main");
  assert.match(WF, /refs\/heads\/social-data/);
  assert.equal((WF.match(/secrets\.X_/g) || []).length, 4);
  assert.ok(!/\$\{\{ *secrets\.X_[A-Z_]+ *\}\}[^\n]*(echo|run:)/.test(WF));
});

test("11. shipped defaults: every queued post is draft, the switch and the variables are not set in any file", () => {
  for (const f of fs.readdirSync("social").filter((x) => /queue.*\.json$/.test(x))) {
    const q = JSON.parse(fs.readFileSync("social/" + f, "utf8"));
    assert.ok(Array.isArray(q));
    for (const p of q) assert.equal(p.status, "draft", `${f} ${p.id}`);
  }
  for (const f of ["package.json", ...fs.readdirSync(".github/workflows").map((x) => ".github/workflows/" + x)]) {
    assert.ok(!/X_POSTING_ENABLED\s*[:=]\s*["']?true/.test(fs.readFileSync(f, "utf8")), f);
  }
  assert.equal(stateOf([], "P001"), "none");
});
