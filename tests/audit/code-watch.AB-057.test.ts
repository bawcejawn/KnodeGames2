// Audit AB-057: the hourly bot checks Race picks, Picks and the Mana sponsor's code too (bot/code-watch.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { watchedContracts, codeWatch } from "../../bot/code-watch.ts";

const readRepo = (f: string) => JSON.parse(fs.readFileSync(f, "utf8"));
const hashes = readRepo("contracts/hashes.json");
const meta = (sha: string, flags = { call: true, tx: true, upload: true }) => ({ exists: true, hash: `0x1220${sha}`, system: false, ...flags });

test("AB-057: the three deployment files on main give each contract's address and the live code's fingerprint", () => {
  const w = watchedContracts(readRepo);
  assert.deepEqual(w.missing, []);
  assert.deepEqual(w.list.map((c) => [c.name, c.address, c.sha]), [
    ["Race picks", hashes.race.address, hashes.race.live],
    ["Picks", hashes.picks.address, hashes.picks.live],
    ["Mana sponsor", hashes.sponsor.address, hashes.sponsor.live],
  ]);
});

test("AB-057: the code on chain as recorded raises nothing; another upload alerts with the contract and both fingerprints", async () => {
  const { list } = watchedContracts(readRepo);
  const chain: Record<string, any> = Object.fromEntries(list.map((c) => [c.address, meta(c.sha)]));
  const alerts: string[] = [];
  let seen = await codeWatch(list, async (a) => chain[a], {}, (_k, t) => alerts.push(t));
  assert.deepEqual(alerts, []);
  assert.equal(Object.keys(seen).length, 3, "switches noted on the first run");
  const race = list[0], other = "ab".repeat(32);
  chain[race.address] = meta(other);
  seen = await codeWatch(list, async (a) => chain[a], seen, (_k, t) => alerts.push(t));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], new RegExp(`Race picks ${race.address} runs code ${other}, not ${race.sha} as race-data/deployment\\.json records`));
});

test("AB-057: changed authorize switches alert (a re-upload of the same code with other switches)", async () => {
  const { list } = watchedContracts(readRepo);
  const sponsor = list[2];
  const chain: Record<string, any> = Object.fromEntries(list.map((c) => [c.address, meta(c.sha)]));
  const alerts: string[] = [];
  const seen = await codeWatch(list, async (a) => chain[a], {}, (_k, t) => alerts.push(t));
  chain[sponsor.address] = meta(sponsor.sha, { call: true, tx: false, upload: true });
  await codeWatch(list, async (a) => chain[a], seen, (_k, t) => alerts.push(t));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Mana sponsor .*authorize switches changed \(call=true tx=true upload=true → call=true tx=false upload=true\)/);
});

test("AB-057: a missing contract alerts; a read error doesn't (it's tried next hour); a broken deployment file is named", async () => {
  const { list } = watchedContracts(readRepo);
  const alerts: string[] = [], logs: string[] = [];
  await codeWatch(list, async (a) => { if (a === list[1].address) throw new Error("node down"); if (a === list[0].address) return { exists: false, hash: "", system: false, call: false, tx: false, upload: false }; return meta(list[2].sha); },
    {}, (_k, t) => alerts.push(t), (t) => logs.push(t));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Race picks .*no contract found on chain/);
  assert.match(logs.join("\n"), /Picks's code couldn't be read this run \(node down\)/);
  const w = watchedContracts((f) => (f.startsWith("picks") ? { contract: "nope" } : readRepo(f)));
  assert.deepEqual(w.missing, ["Picks (picks-data/deployment.json)"]);
});

test("AB-057: the hourly bot runs the code watch on the real chain", () => {
  const bot = fs.readFileSync("bot/bot.ts", "utf8");
  assert.match(bot, /bs\.codeFlags = await codeWatch\(w\.list, ctx\.metadata, bs\.codeFlags \?\? \{\}, ownerAlert/);
});
