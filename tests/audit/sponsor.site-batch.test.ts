// D-211 pick batching, site-limits step 1 (Block X chat): the batch numbers the website reads
// (game-data/deployment.json sponsor.batch) and the guard that no batch can ask for more than rcLimitOther.
// The numbers below are EXAMPLES for the parser. The real ones come from the mainnet batch measurement (D-252, D-254).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { batchFromFlags, batchWorst, manaToBase, setSiteBatch, MAX_BATCH } from "../../bot/sponsor.ts";

const PICKS = "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm", RACE = "1EN7xU8R9tQXjHvrX79qZvvvGkkKWVnB5K";
const SP = { picks: PICKS, race: RACE, rcLimitOther: "240000000" };
const EX = ["--batch-fixed", "0.10", "--batch-per-op", "picks:pick=0.03", "--batch-margin", "0.10"];

test("O-29: at most 10 picks per send", () => assert.equal(MAX_BATCH, 10));

test("manaToBase: 8 decimals, exact, refuses anything else", () => {
  assert.equal(manaToBase("0.03", "x"), "3000000");
  assert.equal(manaToBase("0.1", "x"), "10000000");
  assert.equal(manaToBase("2", "x"), "200000000");
  assert.equal(manaToBase("0.00000001", "x"), "1");
  for (const bad of ["", "-1", "1e3", "0.000000001", "abc", ".5"]) assert.throws(() => manaToBase(bad, "x"));
});

test("example numbers: fixed 0.10 + 0.03 per Picks pick + 0.10 margin; 10 picks ask at most 0.50", () => {
  const b = batchFromFlags(EX, SP)!;
  assert.deepEqual(b, { fixed: "10000000", perOp: { [`${PICKS}:8ce33c6c`]: "3000000" }, margin: "10000000" });
  assert.equal(batchWorst(b), 50000000n);
});

test("no batch flags: nothing changes; some but not all: refused", () => {
  assert.equal(batchFromFlags(["--send"], SP), null);
  assert.throws(() => batchFromFlags(["--batch-fixed", "0.1"], SP), /all three/);
});

test("a batch that could ask for more than rcLimitOther is refused (the page would cap it and the send would run out)", () => {
  assert.throws(() => batchFromFlags(["--batch-fixed", "0.5", "--batch-per-op", "picks:pick=0.2", "--batch-margin", "0.1"], SP), /more than the site's limit/);
  assert.throws(() => batchFromFlags(EX, { picks: PICKS }), /No rcLimitOther/);
});

test("only known actions with their contract; a zero row is refused", () => {
  assert.throws(() => batchFromFlags(["--batch-fixed", "0.1", "--batch-per-op", "game:answer=0.03", "--batch-margin", "0.1"], SP), /must be picks:pick or race:pick/);
  assert.throws(() => batchFromFlags(EX, { rcLimitOther: "240000000" }), /must be picks:pick/);
  assert.throws(() => batchFromFlags(["--batch-fixed", "0.1", "--batch-per-op", "picks:pick=0", "--batch-margin", "0.1"], SP), /more than 0/);
  const both = batchFromFlags(["--batch-fixed", "0.1", "--batch-per-op", "picks:pick=0.03,race:pick=0.04", "--batch-margin", "0.1"], SP)!;
  assert.equal(both.perOp[`${RACE}:8ce33c6c`], "4000000");
  assert.equal(batchWorst(both), 60000000n, "worst case uses the largest row");
});

test("setSiteBatch writes only the batch block and keeps the rest of the file", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "batch-")), "deployment.json");
  fs.writeFileSync(f, JSON.stringify({ v: 1, sponsor: { address: "1X", rcLimitOther: "240000000", batch: {} }, other: 7 }));
  assert.equal(setSiteBatch(batchFromFlags(EX, SP)!, f), true);
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.equal(d.other, 7);
  assert.equal(d.sponsor.address, "1X");
  assert.equal(d.sponsor.batch.fixed, "10000000");
  const g = path.join(path.dirname(f), "nosponsor.json");
  fs.writeFileSync(g, JSON.stringify({ v: 1 }));
  assert.equal(setSiteBatch(batchFromFlags(EX, SP)!, g), false);
});

test("step 1 on main: selfPayMin 25 Mana and an empty batch block (batching stays off until step 2)", () => {
  const sp = JSON.parse(fs.readFileSync(path.resolve(process.env.APP || ".", "game-data/deployment.json"), "utf8")).sponsor;
  assert.equal(sp.selfPayMin, "2500000000");
  assert.deepEqual(sp.batch, {});
  assert.ok(BigInt(sp.rcLimitOther) >= 50000000n, "rcLimitOther is above the example 10-pick ask of 0.50");
});

// Repo Lens R3-2.1: site-limits end to end (the chain read is stubbed; the files are copies in a temp folder).
import { siteLimits } from "../../bot/sponsor.ts";
const HERE = process.cwd();
const copyOf = (f: string) => fs.readFileSync(path.join(HERE, f), "utf8");
async function inTemp(fn: (read: (f: string) => any, raw: (f: string) => string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-limits-"));
  for (const f of ["game-data/deployment.json", "desk-data/deployment.json", "sponsor-data/mana-limits.json"]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), copyOf(f));
  }
  const log = console.log; console.log = () => {};
  process.chdir(dir);
  try { await fn((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), (f) => fs.readFileSync(path.join(dir, f), "utf8")); }
  finally { process.chdir(HERE); console.log = log; }
}
const chain = async () => ({ max_mana_per_tx: "240000000", mana_caps: [] });
const FLAGS = ["--batch-fixed", "0.10", "--batch-per-op", "picks:pick=0.03", "--batch-margin", "0.10"];

test("R3-2.1: without --send nothing is written, flags or not", async () => {
  await inTemp(async (_, raw) => {
    const before = [raw("game-data/deployment.json"), raw("desk-data/deployment.json")];
    await siteLimits(false, FLAGS, chain);
    assert.deepEqual([raw("game-data/deployment.json"), raw("desk-data/deployment.json")], before);
  });
});

test("R3-2.1: --send with the flags writes the batch block into the game file only", async () => {
  await inTemp(async (read) => {
    await siteLimits(true, FLAGS, chain);
    const g = read("game-data/deployment.json");
    assert.deepEqual(g.sponsor.batch, { fixed: "10000000", perOp: { [`${PICKS}:8ce33c6c`]: "3000000" }, margin: "10000000" });
    assert.equal(read("desk-data/deployment.json").sponsor?.batch, undefined, "desk pages never batch");
  });
});

test("R3-2.1: --send without the flags leaves the batch block as it is (empty: batching stays off)", async () => {
  await inTemp(async (read) => {
    await siteLimits(true, [], chain);
    assert.deepEqual(read("game-data/deployment.json").sponsor.batch, {});
  });
});

test("R3-2.1: a refused batch (over rcLimitOther) writes nothing even with --send", async () => {
  await inTemp(async (_, raw) => {
    const before = [raw("game-data/deployment.json"), raw("desk-data/deployment.json")];
    await assert.rejects(() => siteLimits(true, ["--batch-fixed", "0.5", "--batch-per-op", "picks:pick=0.2", "--batch-margin", "0.1"], chain), /more than the site's limit/);
    assert.deepEqual([raw("game-data/deployment.json"), raw("desk-data/deployment.json")], before);
  });
});
