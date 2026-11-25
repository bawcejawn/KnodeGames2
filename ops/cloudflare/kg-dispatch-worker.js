// Knode Games Cloudflare Worker "kg-dispatch-2" (KnodeGames2; the old "kg-dispatch" keeps its code, triggers off): a backstop for GitHub's own timer (Block X incident, Sat 14 Nov 2026).
// GitHub doesn't guarantee scheduled runs: under load it delays or drops them, and on Fri 13 / Sat 14 Nov it dropped
// most of race.yml's hourly runs, so the current race had no card and the Block X page had no producers.
// Source of truth: this file. To change the live Worker: Cloudflare -> Compute (Workers) -> kg-dispatch-2 -> Edit code ->
// paste this whole file -> Deploy. Owner steps: docs/ops/RECORDER-BACKSTOP.md. Tests: tests/audit/dispatch-worker.test.mjs.
//
// What it does, and only this: on its four Cron Triggers (five jobs) it asks GitHub whether the job already ran recently, and
// if not, starts it once (workflow_dispatch on main), like the owner pressing "Run workflow" by hand.
//   - :22 every hour -> vhp-ruler.yml (GitHub's own timer is :12; every ruler game's cards wait on it; Ruler chat, 14 Nov)
//   - :41 every hour -> race.yml   (GitHub's own timer is :37; the card must be taken before each leg at :00)
//   - :51 every hour -> games.yml  (GitHub's own timer is :47; after the race recorder)
//   - :07 and :37    -> race-samples.yml (GitHub's own timer is every 15 minutes; it ran only 3 times on Sun 15 Nov, so
//                       the race cards had 9-10 samples, not 12, and Block X had no usable card; Block X chat, 15 Nov).
//                       One run takes up to 12 samples over up to 48 minutes; checking twice an hour keeps a gap without
//                       samples to about 30 minutes. One Cron Trigger with two minutes ("7,37 * * * *").
//                    -> and kit-games.yml (the Shared Game Kit's games, Fantasy; GitHub's own timer is :27 and :57, D-355).
//                       Its jobs were inside games.yml until Mon 16 Nov (#351: games.yml passed GitHub's 500 KB limit).
//                       Its window is 25 minutes: the normal run 10 minutes before each check (:57 before :07, :27 before
//                       :37) is seen, so nothing is doubled; a dropped run leaves only the one 40 minutes earlier, so one
//                       is started (Repo Lens #J-8 J8-1, #24). It shares the existing trigger (one Worker, 4 triggers).
// "Already ran": a run of that workflow on main created in the window (queued, running or finished), from GitHub's
// timer, a manual run or this Worker. The GitHub timers stay on as they are; the workflows' concurrency groups
// (knode-vhp-ruler, knode-race, knode-games for games.yml and kit-games.yml, knode-race-samples) mean two runs never
// overlap. It never changes a file, a setting or a workflow. A trigger it doesn't know is an error (J5-1), so a
// mistyped trigger shows as a failed run in Cloudflare instead of doing nothing quietly.
// The only secret is GH_DISPATCH_TOKEN, a Worker secret (a fine-grained GitHub token for this one repository with
// "Actions: Read and write" and nothing else). It is never in this file, never logged, never sent anywhere but GitHub.
const REPO = "bawcejawn/KnodeGames2";
// Cutover day (Fri 20 Nov 2026): GitHub's own timers did not start in KnodeGames2 after #9, so the Worker also backs up
// the hourly bot, names and golf (window 50: the :07 check starts one if none ran in the last 50 minutes, and the :37
// check then sees it) and stats (every 2 hours, window 110). Same 4 triggers; when GitHub's timers run, the Worker
// sees their runs and starts nothing. A duplicate is harmless: each workflow's concurrency group queues it.
export const JOBS = {
  "22 * * * *": [
    { workflow: "vhp-ruler.yml", windowMin: 30 }, { workflow: "stats.yml", windowMin: 110 },
    { workflow: "combo.yml", windowMin: 50 }, { workflow: "lastnode.yml", windowMin: 10 },
  ],
  "41 * * * *": [{ workflow: "race.yml", windowMin: 30 }],
  "51 * * * *": [{ workflow: "games.yml", windowMin: 30 }],
  "7,37 * * * *": [
    { workflow: "race-samples.yml", windowMin: 30 }, { workflow: "kit-games.yml", windowMin: 25, ownOnly: true },
    { workflow: "bot.yml", windowMin: 50 }, { workflow: "names.yml", windowMin: 50 }, { workflow: "golf.yml", windowMin: 50 },
    { workflow: "lastnode.yml", windowMin: 10 },
  ],
};
// Tue 24 Nov (AB-072): GitHub's own timer started combo.yml once and lastnode.yml twice in 14 hours on Mon 23, so the
// Worker starts them too: Combo once an hour at :22 (after the race at :37/:41 and Block X at :51 of the hour before;
// none of the knode-games queue runs then), Last Node three times an hour (:07, :22, :37), as its own timer intends.
// A cancelled run (a waiting run pushed out of a concurrency queue) does not count as "ran" (J8b-1, AB-072).
// ownOnly (kit-games.yml, Mon 23 Nov): count only this Worker's own runs (event workflow_dispatch). GitHub's timer (:27,
// :57) can start a run very late (21:44 UTC for 21:27 on Mon 23), and that late run made the 22:07 check skip, so no kit
// run happened between 21:44 and 22:37 and an Over Under round was cancelled (D-344). Rolling games need every :07 and
// :37 run; a GitHub-timer run in between is extra and harmless (the concurrency group queues it).
const API = "https://api.github.com/repos/" + REPO + "/actions/workflows/";

/** One Cron Trigger: runs each of its jobs and returns what each did ([{ workflow, dispatched, why }]). A trigger it
 *  doesn't know, or a missing token, throws at once. A GitHub error on one job doesn't stop the others: each is logged,
 *  then the run throws, so Cloudflare marks it failed. */
export async function runJob(cron, env, f = fetch, now = Date.now(), log = () => {}) {
  const jobs = JOBS[cron];
  if (!jobs) throw new Error(`no job for cron "${cron}": check the Cron Trigger's text in Cloudflare`);
  const token = env && env.GH_DISPATCH_TOKEN;
  if (typeof token !== "string" || token.length < 20) throw new Error("GH_DISPATCH_TOKEN isn't set (a Worker secret)");
  const out = [], errors = [];
  for (const job of jobs) {
    try { const r = await runOne(job, token, f, now); out.push(r); log(`kg-dispatch: ${r.workflow}: ${r.why}`); }
    catch (e) { errors.push(e); log(`kg-dispatch: ${job.workflow}: ERROR ${e.message}`); }
  }
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return out;
}

/** One workflow: start it on main unless a run of it was created in its window. */
async function runOne(job, token, f, now) {
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "kg-dispatch" };
  const since = new Date(now - job.windowMin * 60000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const list = await f(API + job.workflow + "/runs?branch=main&per_page=5" + (job.ownOnly ? "&event=workflow_dispatch" : "") + "&created=" + encodeURIComponent(">=" + since), { headers });
  if (!list.ok) throw new Error(`${job.workflow}: GitHub answered ${list.status} listing runs`);
  const j = await list.json();
  if (!j || !Array.isArray(j.workflow_runs)) throw new Error(`${job.workflow}: GitHub's run list had no workflow_runs`);
  const n = j.workflow_runs.filter((r) => r && r.conclusion !== "cancelled").length;
  if (n > 0) return { workflow: job.workflow, dispatched: false, why: `already ran in the last ${job.windowMin} minutes (${n} ${job.ownOnly ? "Worker " : ""}run(s) since ${since})` };
  const d = await f(API + job.workflow + "/dispatches", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main" }) });
  if (d.status !== 204) throw new Error(`${job.workflow}: GitHub answered ${d.status} to the dispatch`);
  return { workflow: job.workflow, dispatched: true, why: `no run since ${since}: started one` };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runJob(event.cron, env, fetch, Date.now(), (line) => console.log(line)));
  },
  // No web endpoint: nobody can start a run through this Worker's address.
  async fetch() { return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } }); },
};
