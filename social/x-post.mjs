#!/usr/bin/env node
// Knode Games X poster. Three steps, run by .github/workflows/x-post.yml as three separate jobs:
//   plan    (no secrets)  choose the due approved posts, write an INTENT line to the log, hand the list on
//   send    (secrets)     send each post once with no retries, write the result file
//   record  (no secrets)  write the results to the log
// Off unless the repository variable X_POSTING_ENABLED is the exact text "true". Dry run unless X_DRY_RUN is the exact text "false".
// It never reads the log from main, never pushes to main, and never prints a key.
import fs from "node:fs";
import { plan, wordingProblems, LIMITS } from "./lib.mjs";
import { authHeader } from "./x-oauth1.mjs";

export const X_URL = "https://api.x.com/2/tweets";
export const isEnabled = (env) => env.X_POSTING_ENABLED === "true";
export const isDry = (env) => env.X_DRY_RUN !== "false";

export function runPlan({ queue, events, env, nowMs = Date.now() }) {
  if (!isEnabled(env)) return { enabled: false, dry: isDry(env), send: [], missed: [], events: [] };
  const r = plan({ queue, events, nowMs });
  const ts = new Date(nowMs).toISOString();
  const dry = isDry(env);
  const out = [];
  if (r.pause) { if (!dry && r.pause !== "paused") out.push({ kind: "pause", id: "-", ts, why: r.pause }); return { enabled: true, dry, send: [], missed: [], events: out, pause: r.pause }; }
  // A dry run writes nothing to the log, so it can never block the real run.
  if (!dry) {
    for (const id of r.missed) out.push({ kind: "missed", id, ts });
    for (const p of r.send) out.push({ kind: "intent", id: p.id, ts });
  }
  return { enabled: true, dry, send: r.send, missed: r.missed, events: out };
}

/** Sends in order; stops at the first problem; never retries. Returns the result events. */
export async function runSend({ posts, env, fetchFn = fetch, nowMs = Date.now() }) {
  const out = [];
  const dry = isDry(env);
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const ts = new Date(nowMs).toISOString();
    const bad = wordingProblems(p.text);
    if (bad.length) { out.push({ kind: "skipped", id: p.id, ts, why: bad.join("; ") }); continue; }
    if (dry) { out.push({ kind: "skipped", id: p.id, ts, why: "dry run" }); continue; }
    const creds = { apiKey: env.X_API_KEY, apiSecret: env.X_API_SECRET, accessToken: env.X_ACCESS_TOKEN, accessTokenSecret: env.X_ACCESS_TOKEN_SECRET };
    if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
      out.push({ kind: "error", id: p.id, ts, why: "keys missing" });
      for (const q of posts.slice(i + 1)) out.push({ kind: "skipped", id: q.id, ts, why: "stopped after an error" });
      break;
    }
    let res;
    try {
      res = await fetchFn(X_URL, { method: "POST", headers: { Authorization: authHeader({ method: "POST", url: X_URL, creds }), "Content-Type": "application/json" }, body: JSON.stringify({ text: p.text }) });
    } catch (e) {
      // We do not know whether X got it: never retry.
      out.push({ kind: "unknown", id: p.id, ts, why: "network error" });
      for (const q of posts.slice(i + 1)) out.push({ kind: "skipped", id: q.id, ts, why: "stopped after an error" });
      break;
    }
    if (res.status === 201) {
      let tid = null; try { tid = (await res.json())?.data?.id ?? null; } catch {}
      out.push({ kind: "sent", id: p.id, ts, tweet_id: tid });
    } else {
      out.push({ kind: "error", id: p.id, ts, status: res.status });
      out.push({ kind: "pause", id: "-", ts, why: `X answered ${res.status}` });
      for (const q of posts.slice(i + 1)) out.push({ kind: "skipped", id: q.id, ts, why: "stopped after an error" });
      break;
    }
  }
  return out;
}

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const env = process.env;
  if (cmd === "plan") {            // plan <queue.json> <log.json>; writes plan.json, new-events.json
    const r = runPlan({ queue: readJson(a, []), events: readJson(b, { events: [] }).events ?? [], env });
    fs.writeFileSync("plan.json", JSON.stringify(r));
    fs.writeFileSync("new-events.json", JSON.stringify(r.events));
    console.log(`enabled=${r.enabled} dry=${r.dry} due=${r.send.map((p) => p.id).join(",") || "none"} missed=${r.missed.join(",") || "none"}${r.pause ? " PAUSED: " + r.pause : ""}`);
  } else if (cmd === "send") {     // send <plan.json>; writes results.json
    const r = readJson(a, { send: [] });
    const out = await runSend({ posts: r.send ?? [], env });
    fs.writeFileSync("results.json", JSON.stringify(out));
    for (const e of out) console.log(`${e.kind} ${e.id}${e.why ? " (" + e.why + ")" : ""}`);
  } else { console.error("usage: x-post.mjs plan|send"); process.exit(2); }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("x-post stopped:", e?.message ?? e); process.exit(1); });
