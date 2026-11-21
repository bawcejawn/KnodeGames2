// Policy lint for the rebuild. It does not restyle the ported games.
// It fails if a workflow can start itself, if agent notes are committed, or if the
// website folder contains the testnet pages.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const problems = [];
const TIMERS = {
  "bot.yml": ["7 * * * *", "48 11 * * 1-6", "48 23 * * 0-5"],
  "race.yml": ["37 * * * *"], "games.yml": ["47 * * * *"], "combo.yml": ["52 * * * *"], "golf.yml": ["57 * * * *"],
  "kit-games.yml": ["27,57 * * * *"], "vhp-ruler.yml": ["12 * * * *"], "names.yml": ["4 * * * *"], "stats.yml": ["17 */2 * * *"],
  "race-samples.yml": ["*/15 * * * *"], "watch.yml": ["*/30 * * * *"], "capacity.yml": ["23 13 * * *"],
  // Last Node Standing (game 13): every 5 minutes during the event and its late cuts, hourly overnight (as in the old repository).
  "lastnode.yml": ["2-57/5 13-23 * * *", "2-57/5 0-3 * * *", "7 4-12 * * *"],
};
const say = (m) => problems.push(m);

if (fs.existsSync(path.join(root, ".ai"))) say(".ai/ must not be in this repository");
if (fs.existsSync(path.join(root, "site"))) say("site/ redirects were removed; the folder must stay gone");

const wf = path.join(root, ".github/workflows");
for (const f of fs.readdirSync(wf).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
  const text = fs.readFileSync(path.join(wf, f), "utf8");
  // Timers (D-240, cutover Sun 22 Nov): only these files, only these times, exactly the old repository's. Any other
  // schedule, or a changed time, fails here. docs/WORKFLOWS.md lists them.
  const crons = [...text.matchAll(/^\s+- cron: "([^"]+)"/gm)].map((m) => m[1]);
  const want = TIMERS[f] ?? [];
  if (/^ {2}schedule:/m.test(text) !== want.length > 0 || crons.join("|") !== want.join("|")) say(`${f}: timers ${JSON.stringify(crons)}; allowed ${JSON.stringify(want)} (tools/ci/lint.mjs TIMERS)`);
  if (/pull_request_target|workflow_run/.test(text)) say(`${f} uses a privileged trigger`);
  if (/permissions:\s*(?:[>|][+-]?\s*)?["']?write-all/i.test(text)) say(`${f} asks for every permission`);
}

const web = path.join(root, "web");
for (const name of ["blockx-testnet.html", "stake-testnet.html", "testnet-wallet.js"]) {
  if (fs.existsSync(path.join(web, name))) say(`web/${name} would be published. Testnet pages live in ops/testnet/.`);
}

if (!fs.existsSync(path.join(web, "index.html")) || !fs.readFileSync(path.join(web, "index.html"), "utf8").includes('src="early-view.js"')) {
  say("web/index.html must load early-view.js");
}
if (!fs.existsSync(path.join(web, "fairness.html"))) say("web/fairness.html is missing");
// L7b-1: the site build copies game files a page imports by a plain string; a template-string import under ./games/
// would not be copied and would 404 on the site.
for (const f of fs.readdirSync(web).filter((n) => n.endsWith(".js"))) {
  if (/\bimport\s*\(\s*`[^`]*games\//.test(fs.readFileSync(path.join(web, f), "utf8"))) say(`web/${f} imports from ./games/ with a template string; name the file in a plain string`);
}

if (problems.length) {
  console.error(problems.map((p) => "lint: " + p).join("\n"));
  process.exit(1);
}
console.log("lint: policy checks passed");
