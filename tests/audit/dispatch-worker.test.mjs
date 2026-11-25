// The Cloudflare Worker "kg-dispatch" (ops/cloudflare/kg-dispatch-worker.js): a backstop for GitHub's timer. It starts
// vhp-ruler.yml at :22, race.yml at :41, games.yml at :51, and race-samples.yml and kit-games.yml at :07 and :37, only
// when no run of that workflow on main was created in its window (30 minutes; 25 for kit-games.yml, which runs at :27 and :57).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const M = await import(pathToFileURL(path.resolve("ops/cloudflare/kg-dispatch-worker.js")).href);
const TOKEN = "github_pat_" + "x".repeat(40);
const NOW = Date.UTC(2026, 10, 14, 14, 41, 0);
function gh(total, { listStatus = 200, dispatchStatus = 204 } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers, body: init.body });
    const n = typeof total === "function" ? total(url) : total;
    if (url.includes("/runs?")) return new Response(JSON.stringify({ total_count: n, workflow_runs: Array.from({ length: n }, () => ({ conclusion: "success" })) }), { status: listStatus });
    return new Response(null, { status: dispatchStatus });
  };
  return { f, calls };
}

test("kg-dispatch: no run this hour -> starts the workflow once on main", async () => {
  const { f, calls } = gh(0);
  const [r] = await M.runJob("41 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW);
  assert.deepEqual([r.workflow, r.dispatched], ["race.yml", true]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/api\.github\.com\/repos\/bawcejawn\/KnodeGames2\/actions\/workflows\/race\.yml\/runs\?branch=main&per_page=5&created=%3E%3D2026-11-14T14%3A11%3A00Z$/);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].url, "https://api.github.com/repos/bawcejawn/KnodeGames2/actions/workflows/race.yml/dispatches");
  assert.deepEqual(JSON.parse(calls[1].body), { ref: "main" });
  assert.equal(calls[1].headers.Authorization, "Bearer " + TOKEN);
});

test("kg-dispatch: :22 starts vhp-ruler.yml when it hasn't run (the Ruler chat, 14 Nov)", async () => {
  const { f, calls } = gh(0);
  const [r] = await M.runJob("22 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW);
  assert.deepEqual([r.workflow, r.dispatched], ["vhp-ruler.yml", true]);
  assert.equal(calls[1].url, "https://api.github.com/repos/bawcejawn/KnodeGames2/actions/workflows/vhp-ruler.yml/dispatches");
});

test("kg-dispatch: :07 and :37 start race-samples.yml when it hasn't run in 30 minutes (Block X chat, 15 Nov)", async () => {
  const { f, calls } = gh((u) => (u.includes("race-samples") ? 0 : 1));
  const [r, k] = await M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, Date.UTC(2026, 10, 15, 14, 37, 0));
  assert.deepEqual([r.workflow, r.dispatched], ["race-samples.yml", true]);
  assert.deepEqual([k.workflow, k.dispatched], ["kit-games.yml", false]);
  assert.match(calls[0].url, /workflows\/race-samples\.yml\/runs\?branch=main&per_page=5&created=%3E%3D2026-11-15T14%3A07%3A00Z$/);
  assert.equal(calls[1].url, "https://api.github.com/repos/bawcejawn/KnodeGames2/actions/workflows/race-samples.yml/dispatches");
  const busy = gh(1);
  const out = await M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, busy.f, NOW);
  assert.deepEqual(out.map((x) => x.dispatched), [false, false, false, false, false, false, false]);
  assert.equal(busy.calls.length, 7, "all ran recently: seven lists, nothing started");
});

test("kg-dispatch: :07 and :37 start kit-games.yml (Fantasy) only when it hasn't run in 25 minutes (D-355: runs at :27 and :57)", async () => {
  // :07 after a dropped :57 run: the window reaches back to :42, after the :27 run, so it starts one.
  const { f, calls } = gh((u) => (u.includes("kit-games") ? 0 : 1));
  const [, k] = await M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, Date.UTC(2026, 10, 16, 19, 7, 0));
  assert.deepEqual([k.workflow, k.dispatched], ["kit-games.yml", true]);
  assert.match(calls[1].url, /workflows\/kit-games\.yml\/runs\?branch=main&per_page=5&event=workflow_dispatch&created=%3E%3D2026-11-16T18%3A42%3A00Z$/);
  assert.equal(calls[2].url, "https://api.github.com/repos/bawcejawn/KnodeGames2/actions/workflows/kit-games.yml/dispatches");
  assert.deepEqual(JSON.parse(calls[2].body), { ref: "main" });
  // The window is 25 minutes and, since Mon 23 Nov, counts only the Worker's own runs (ownOnly): its previous run is 30
  // minutes back, outside the window, so every :07 and :37 starts one; the window only stops a double start.
  const kit = M.JOBS["7,37 * * * *"].find((j) => j.workflow === "kit-games.yml");
  assert.equal(kit.windowMin, 25);
  assert.ok(kit.windowMin < 30 && kit.ownOnly === true, "never sees its own previous run (30 minutes back); counts only its own runs");
});

test("kg-dispatch: an error on one job still runs the other, then the run fails (logged)", async () => {
  const lines = [];
  const f = async (url, init = {}) => {
    if (url.includes("race-samples")) return new Response("", { status: 502 });
    if (url.includes("/runs?")) return new Response(JSON.stringify({ total_count: 0, workflow_runs: [] }), { status: 200 });
    return new Response(null, { status: 204 });
  };
  await assert.rejects(M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW, (l) => lines.push(l)), /race-samples\.yml: GitHub answered 502 listing/);
  assert.deepEqual(lines, ["kg-dispatch: race-samples.yml: ERROR race-samples.yml: GitHub answered 502 listing runs", `kg-dispatch: kit-games.yml: no run since 2026-11-14T14:16:00Z: started one`,
    "kg-dispatch: bot.yml: no run since 2026-11-14T13:51:00Z: started one", "kg-dispatch: names.yml: no run since 2026-11-14T13:51:00Z: started one", "kg-dispatch: golf.yml: no run since 2026-11-14T13:51:00Z: started one", "kg-dispatch: lastnode.yml: no run since 2026-11-14T14:31:00Z: started one", "kg-dispatch: watch.yml: no run since 2026-11-14T14:16:00Z: started one"]);
});

test("kg-dispatch: a run this hour (GitHub's timer, by hand, or ours) -> nothing started", async () => {
  const { f, calls } = gh(1);
  const [r] = await M.runJob("51 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW);
  assert.deepEqual([r.workflow, r.dispatched], ["games.yml", false]);
  assert.match(r.why, /^already ran in the last 30 minutes/, "the log says the real window (J5-3)");
  assert.equal(calls.length, 1, "only the list, no dispatch");
});

test("kg-dispatch: only its jobs; an unknown trigger, no token, a GitHub error or a bad answer stops without dispatching", async () => {
  const { f, calls } = gh(0);
  await assert.rejects(M.runJob("0 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW), /no job for cron "0 \* \* \* \*"/, "a mistyped trigger is an error, not a quiet no-op (J5-1)");
  await assert.rejects(M.runJob("37,7 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW), /no job for cron/);
  assert.equal(calls.length, 0);
  await assert.rejects(M.runJob("41 * * * *", {}, f, NOW), /GH_DISPATCH_TOKEN/);
  await assert.rejects(M.runJob("41 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, gh(0, { listStatus: 401 }).f, NOW), /401 listing/);
  const bad = async () => new Response("{}", { status: 200 });
  await assert.rejects(M.runJob("41 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, bad, NOW), /workflow_runs/);
  await assert.rejects(M.runJob("41 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, gh(0, { dispatchStatus: 403 }).f, NOW), /403 to the dispatch/);
  assert.deepEqual(Object.keys(M.JOBS), ["22 * * * *", "41 * * * *", "51 * * * *", "7,37 * * * *"], "four triggers: the account's 5th stays free (J5-2)");
  assert.deepEqual(Object.values(M.JOBS).flat().map((j) => j.workflow), ["vhp-ruler.yml", "stats.yml", "combo.yml", "lastnode.yml", "race.yml", "games.yml", "race-samples.yml", "kit-games.yml", "bot.yml", "names.yml", "golf.yml", "lastnode.yml", "watch.yml"]);
});

test("kg-dispatch: no web endpoint, and the token is never in the file", async () => {
  const r = await M.default.fetch(new Request("https://kg-dispatch.example/run"));
  assert.equal(r.status, 404);
  const fs = await import("node:fs");
  const src = fs.readFileSync(path.resolve("ops/cloudflare/kg-dispatch-worker.js"), "utf8");
  assert.ok(!/github_pat_|ghp_[A-Za-z0-9]{20}/.test(src));
});

test("kg-dispatch: the workflows it starts can be started by hand and never overlap (workflow_dispatch + concurrency)", async () => {
  const fs = await import("node:fs");
  for (const [f, g] of [["vhp-ruler.yml", "knode-vhp-ruler"], ["race.yml", "knode-race"], ["games.yml", "knode-games"], ["kit-games.yml", "knode-games"], ["race-samples.yml", "knode-race-samples"]]) {
    const y = fs.readFileSync(path.resolve(".github/workflows", f), "utf8");
    assert.match(y, /workflow_dispatch:/, f);
    assert.match(y, new RegExp(`concurrency:\\s*\\n\\s*group: ${g}\\s*\\n\\s*cancel-in-progress: false`), f);
  }
});

test("kg-dispatch: cutover backup (Fri 20 Nov): bot, names and golf at :07 and :37 with a 50-minute window; stats at :22 with 110", () => {
  const at = (cron, wf) => M.JOBS[cron].find((j) => j.workflow === wf);
  for (const wf of ["bot.yml", "names.yml", "golf.yml"]) {
    const j = at("7,37 * * * *", wf);
    assert.ok(j, wf);
    // An hourly workflow: the :37 check must see the run started at :07 (30 minutes), and the :07 check must not see the
    // previous hour's :07 run (60 minutes), so 30 < w < 60.
    assert.ok(30 < j.windowMin && j.windowMin < 60, wf);
  }
  const st = at("22 * * * *", "stats.yml");
  assert.ok(st && 60 < st.windowMin && st.windowMin < 120, "stats runs every 2 hours: seen within 2 h, never doubled hourly");
  for (const wf of Object.values(M.JOBS).flat().map((j) => j.workflow)) assert.ok(fs.existsSync(`.github/workflows/${wf}`), wf);
});

// Mon 23 Nov: GitHub's timer started the 21:27 UTC kit run at 21:44, the 22:07 check saw it and skipped, and no kit run
// happened until 22:37 (an Over Under round was cancelled). kit-games.yml now counts only the Worker's own runs.
test("kg-dispatch: kit-games.yml counts only its own (workflow_dispatch) runs, so a late GitHub-timer run can't skip a slot", async () => {
  const lateTimerRun = (url) => (url.includes("event=workflow_dispatch") ? 0 : 1);   // only a GitHub-timer run in the window
  const { f, calls } = gh(lateTimerRun);
  const out = await M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, Date.UTC(2026, 10, 23, 22, 7, 0));
  const kit = out.find((r) => r.workflow === "kit-games.yml");
  assert.equal(kit.dispatched, true, "a late timer run no longer suppresses the :07 / :37 kit run");
  assert.ok(calls.some((c) => c.url.includes("/kit-games.yml/runs?branch=main&per_page=5&event=workflow_dispatch&created=")));
  assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/kit-games.yml/dispatches")));
  for (const w of ["race-samples.yml", "bot.yml", "names.yml", "golf.yml"]) {
    assert.equal(out.find((r) => r.workflow === w).dispatched, false, `${w} still counts any run (unchanged)`);
    assert.ok(!calls.some((c) => c.url.includes(`/${w}/runs?`) && c.url.includes("event=")), `${w}'s query is unchanged`);
  }
  // its own run in the window still stops a second dispatch
  const own = gh(1);
  const [k2] = (await M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, own.f, Date.UTC(2026, 10, 23, 22, 7, 0))).filter((r) => r.workflow === "kit-games.yml");
  assert.equal(k2.dispatched, false);
  assert.match(k2.why, /already ran in the last 25 minutes \(1 Worker run\(s\)/);
});

// Tue 24 Nov (AB-072): GitHub's timer started combo.yml once and lastnode.yml twice in 14 hours, so the Worker starts
// them; and a run pushed out of a concurrency queue (cancelled) doesn't count as "ran".
test("kg-dispatch: :22 also starts combo.yml (window 50) and lastnode.yml (window 10); :07/:37 also lastnode.yml", async () => {
  const at22 = M.JOBS["22 * * * *"].map((j) => [j.workflow, j.windowMin]);
  assert.deepEqual(at22.filter(([w]) => w === "combo.yml" || w === "lastnode.yml"), [["combo.yml", 50], ["lastnode.yml", 10]]);
  assert.ok(M.JOBS["7,37 * * * *"].some((j) => j.workflow === "lastnode.yml" && j.windowMin === 10));
  assert.ok(!M.JOBS["7,37 * * * *"].some((j) => j.workflow === "combo.yml"), "Combo only at :22 (never beside kit games in the knode-games queue)");
  assert.ok(!M.JOBS["51 * * * *"].some((j) => j.workflow === "combo.yml"));
  const { f, calls } = gh(0);
  const out = await M.runJob("22 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW);
  assert.deepEqual(out.map((r) => [r.workflow, r.dispatched]), [["vhp-ruler.yml", true], ["stats.yml", true], ["combo.yml", true], ["lastnode.yml", true]]);
  assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/combo.yml/dispatches")));
});

test("kg-dispatch: a cancelled run in the window doesn't count as ran; any other run does", async () => {
  const list = (runs) => async (url, init = {}) => (url.includes("/runs?") ? new Response(JSON.stringify({ total_count: runs.length, workflow_runs: runs }), { status: 200 }) : new Response(null, { status: 204 }));
  const [a] = await M.runJob("51 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, list([{ conclusion: "cancelled" }]), NOW);
  assert.equal(a.dispatched, true, "only a cancelled run: start one");
  for (const c of [null, "success", "failure", "skipped"]) {
    const [b] = await M.runJob("51 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, list([{ conclusion: "cancelled" }, { conclusion: c }]), NOW);
    assert.equal(b.dispatched, false, `a ${c ?? "running"} run counts`);
  }
});

// Wed 25 Nov: GitHub's timer started watch.yml 3 times in 29 hours; the Worker starts it at :07 and :37.
test("kg-dispatch: the node watchdog (watch.yml) is started at :07 and :37 (window 25)", async () => {
  assert.ok(M.JOBS["7,37 * * * *"].some((j) => j.workflow === "watch.yml" && j.windowMin === 25 && !j.ownOnly));
  const { f, calls } = gh(0);
  const out = await M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, f, NOW);
  assert.equal(out.find((r) => r.workflow === "watch.yml").dispatched, true);
  assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/watch.yml/dispatches")));
  const busy = gh(1);
  const out2 = await M.runJob("7,37 * * * *", { GH_DISPATCH_TOKEN: TOKEN }, busy.f, NOW);
  assert.equal(out2.find((r) => r.workflow === "watch.yml").dispatched, false, "a run in the last 25 minutes: none started");
});
