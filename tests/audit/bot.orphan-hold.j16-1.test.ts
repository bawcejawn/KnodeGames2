// Repo Lens J16-1 (KnodeGames2 #10): after a run's publish fails, the next run starts from older files and would void
// the questions that run posted. A question id newer than the bot's own trusted saved state that matches no question
// file is now HELD (run ends red, nothing voided, id left unchecked) until its file is back or the owner sets
// BOT_VOID_ORPHANS. Harness copied from tests/audit/orphan-outcome.ins2.test.ts (in-memory fake chain, throwaway key).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Signer } from "koilib";
import { tick, paths } from "../../bot/bot.ts";
import { paramsHashOf } from "../../questions/resolver.ts";

const day = JSON.parse(fs.readFileSync("tests/audit/fixtures/W000-D3.at-6b37c46.json", "utf8"));
const HOUR = 3_600_000, DAY = 24 * HOUR, WEEK = 7 * DAY, GENESIS = 1_792_368_000_000, CD = 12 * HOUR;

function M9() {
  const q = structuredClone(day.questions.find((x: any) => x.template === "M9"));
  for (const k of ["chainId", "chainOutcome", "result", "vhpEnd", "corrections", "postSkipped"]) delete q[k];
  if (q.model) { delete q.model.vhp; delete q.model.vhpHeight; delete q.model.voidVhpSwing; }
  q.paramsHash = paramsHashOf(q);
  return q;
}
function csvFor(q: any) {
  const width = q.windowEnd - q.windowStart + 1, [who] = q.subjects, n = Math.round(width * q.model.rates[who]);
  const sig = new Array(width).fill("1Filler");
  for (let j = 0; j < n; j++) sig[Math.floor(((j + 0.5) * width) / n)] = who;
  return sig.map((s, i) => `${q.windowStart + i},${1_792_627_200_000 + i * 3000},${s},0,0`).join("\n") + "\n";
}
const onchainFor = (q: any, outcome = 0, dataHash = "ab".repeat(32)) =>
  ({ week: "0", k: 4, window_end: String(q.windowEnd), outcome, params_hash: "0x" + q.paramsHash, data_hash: "0x" + dataHash });

type S = { time: number; height: number; config: any; week: any; upgrade: any; seed_withdrawal: any; closed: number; finalized: number };

function world(o: { questions?: any[]; onchain?: any[]; deployment?: any; s?: Partial<S>; botState?: any } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-ins2-" + Math.random().toString(36).slice(2, 6) + "-"));
  const P = paths(dir);
  fs.mkdirSync(P.questions, { recursive: true });
  if (o.questions) fs.writeFileSync(path.join(P.questions, "W000-D3.json"), JSON.stringify({ ...day, questions: o.questions }));
  if (o.questions?.length) fs.writeFileSync(path.join(dir, "blocks.csv"), csvFor(o.questions[0]));
  fs.writeFileSync(P.deployment, JSON.stringify(o.deployment ?? { owner: "1Owner", operator: "1Op" }));
  if (o.botState) fs.writeFileSync(P.botState, JSON.stringify(o.botState));      // what main's bot-state.json says
  const onchain = o.onchain ?? [];
  const sent: any[] = [];
  const s: S = {
    time: GENESIS + 3 * DAY, height: (o.questions?.[0]?.windowEnd ?? 40_000_000) + 500,
    config: {}, week: {}, upgrade: {}, seed_withdrawal: {}, closed: 0, finalized: 0, ...o.s,
  };
  const chain: any = {
    kind: "sim", contractId: "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr",
    async head() { return { height: s.height, lib: s.height - 100 }; },
    async mana() { return 10n ** 12n; },
    async read(method: string, args: any) {
      if (method === "get_state") return {
        height: String(s.height), time: String(s.time),
        config: { owner: "1Owner", operator: "1Op", genesis_time: String(GENESIS), week_length: String(WEEK), close_delay: String(CD),
          min_stake: "100000000", max_sponsor_rc: "200000000", ...s.config },
        totals: { weeks_closed: String(s.closed), weeks_finalized: String(s.finalized), next_question_id: onchain.length },
        upgrade: s.upgrade, seed_withdrawal: s.seed_withdrawal, koin_balance: "0", mana: "0",
      };
      if (method === "get_week") {
        if (Number(args.week) < s.closed) return { week: { closed: true, finalized: Number(args.week) < s.finalized, settle_start: "0", settle_end: "1" } };
        return { week: { questions: onchain.length, resolved: onchain.filter((x) => x.outcome).length, ...s.week } };
      }
      if (method === "get_question") return { question: onchain[Number(args.id)] };
      if (method === "list_players") return { rows: [] };
      return {};
    },
    async send(calls: any[]) {
      for (const c of calls) {
        sent.push(c);
        if (c.method === "resolve_question") { const x = onchain[Number(c.args.id)]; x.outcome = c.args.outcome === 1000 ? 1000 : c.args.outcome + 1; }
        if (c.method === "close_week") s.closed++;
        if (c.method === "finalize_week") s.finalized++;
      }
      return { ok: true };
    },
  };
  const run = async (extra: any = {}) => {
    const ctx: any = { chain, operator: Signer.fromSeed("bot-ins2-test-only"), P, dryRun: false, problems: [] as string[],
      generator: () => ({ ok: true, output: "" }), checkpoint: () => {}, quiet: true, ...extra };
    await tick(ctx);
    return ctx.problems as string[];
  };
  return { s, onchain, sent, run, P };
}

const ORPHAN = (outcome = 0, window_end = "40000000") =>
  ({ week: "0", k: 4, window_end, outcome, params_hash: "0x" + "ee".repeat(32), data_hash: "0x" + "00".repeat(32) });
const held = (p: string[]) => p.filter((x) => /HELD, not voided/.test(x)).length;
const voids = (sent: any[]) => sent.filter((c) => c.method === "resolve_question" && c.args.outcome === 1000).length;

test("J16-1: a new orphan since the bot's own saved state is HELD (not voided, run ends red); BOT_VOID_ORPHANS releases it", async () => {
  const w = world({ onchain: [] });
  await w.run();                                                  // run 1: writes a sealed bot-state.json (checked up to #0)
  assert.ok(fs.existsSync(w.P.botState), "precondition: the bot saved its state");
  assert.equal(JSON.parse(fs.readFileSync(w.P.botState, "utf8")).checkedUpTo, 0);
  w.onchain.push(ORPHAN());                                       // a question posted by a run whose publish was lost
  const p2 = await w.run();
  assert.equal(held(p2), 1, p2.join("\n"));
  assert.equal(voids(w.sent), 0, "nothing voided");
  assert.equal(w.onchain[0].outcome, 0);
  assert.equal(JSON.parse(fs.readFileSync(w.P.botState, "utf8")).checkedUpTo, 0, "the id stays unchecked");
  assert.ok(!JSON.parse(fs.readFileSync(w.P.botState, "utf8")).orphans.includes(0), "not listed as an orphan");
  const p3 = await w.run();                                       // still held on the next run
  assert.equal(held(p3), 1); assert.equal(voids(w.sent), 0);
  process.env.BOT_VOID_ORPHANS = "0";                             // the owner OKs voiding #0
  try { const p4 = await w.run(); assert.equal(held(p4), 0, p4.join("\n")); assert.equal(voids(w.sent), 1, "voided once the owner said so"); }
  finally { delete process.env.BOT_VOID_ORPHANS; }
});

test("J16-1: with no trusted saved state (first run), an orphan is voided as before", async () => {
  const w = world({ onchain: [ORPHAN()] });
  const p = await w.run();
  assert.equal(held(p), 0);
  assert.equal(voids(w.sent), 1);
});

test("J16-1: a second copy of a posted question (F-10) is still voided, never held", async () => {
  const q = M9();
  const w = world({ questions: [{ ...q, chainId: 0 }], onchain: [onchainFor(q)] });
  await w.run();
  w.onchain.push(onchainFor(q));                                  // the retried post that landed twice
  const p = await w.run();
  assert.equal(held(p), 0, p.join("\n"));
});

// Repo Lens J16b-1: only a TRUSTED saved state arms the hold. A bot-state.json with a bad seal (edited by hand, an old
// copy, another key) starts afresh, so an orphan at or above its checkedUpTo is voided as before (and the state-reset
// alert is raised); a run with no seal key (noSealKey) never arms it either.
test("J16b-1: a bad seal on bot-state.json does not arm the hold: the orphan is voided, not held", async () => {
  const w = world({ onchain: [] });
  await w.run();                                                  // a sealed state at #0
  const st = JSON.parse(fs.readFileSync(w.P.botState, "utf8"));
  st.seal = "00".repeat(65);                                      // the seal no longer matches
  fs.writeFileSync(w.P.botState, JSON.stringify(st));
  w.onchain.push(ORPHAN());
  const p = await w.run();
  assert.equal(held(p), 0, p.join("\n"));
  assert.ok(p.some((x) => /was not written by this bot/.test(x)), "the state-reset alert is raised");
  assert.equal(voids(w.sent), 1, "voided as before");
});

test("J16b-1: with no seal key (noSealKey) the hold is not armed", async () => {
  const w = world({ onchain: [] });
  await w.run();
  w.onchain.push(ORPHAN());
  const p = await w.run({ noSealKey: true });
  assert.equal(held(p), 0, p.join("\n"));
  assert.equal(voids(w.sent), 1);
});
