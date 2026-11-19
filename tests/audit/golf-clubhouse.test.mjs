// Block Golf's Clubhouse hole (owner, 6 Nov; accumulating, 15 Nov; claude/golf/CLUBHOUSE-BUILD-PLAN-2026-11-15.md):
// a hole scored by how many different Knode Games features a wallet has used. Each feature is earned once, the first
// week it is seen, and kept for good. Strokes come from a fixed ladder of the features earned by the end of the week.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = process.env.APP || ".";
const { run, loadClub, growClub, CLUB_SOURCE, JOIN_FROM } = await import(path.resolve(APP, "bot/games/golf.ts"));
const G = globalThis.KGolf, M = globalThis.KRaceMath;
const H = 3600000, DAY = 24 * H;
const W = 3, START = M.weekStart(W), END = M.weekStart(W + 1);
process.env.CHECK_NOW_MS ??= String(END + 7 * DAY);
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const write = (dir, name, j) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), typeof j === "string" ? j : JSON.stringify(j)); };
const P = Array.from({ length: 8 }, (_, i) => "1" + "ABCDEFGHJKLMNPQRSTUVWXYZ"[i].repeat(33));
const Q = (w) => ({ closed: true, questions: 2, resolved: 2, rows: P.slice(0, 6).map((a, i) => ({ a, pts: 10 - i, answered: 2 })) });
const SRC = [{ id: "questions", name: "Daily Questions", reader: "questions", live: true }, CLUB_SOURCE];
const prevWith = ({ club, course = { questions: W, clubhouse: W }, weeks = [], files = {} } = {}) => {
  const d = tmp("golf-prev-");
  write(d, "index.json", { v: 1, updated: "", weeks, course, stakedFromWeek: null });
  if (club) write(d, "clubhouse.json", club);
  for (const [f, j] of Object.entries(files)) write(d, f, j);
  return d;
};
const base = (o) => ({ sources: SRC, questionsOf: async (_n, w) => Q(w), p: "main", check: "check", stakedFromWeek: null, fresh: false,
  deskOf: async () => ({ total: 0, accounts: [] }), vaultOf: async () => new Map(), ...o });
const club = (out) => JSON.parse(fs.readFileSync(path.join(out, "clubhouse.json"), "utf8"));
const week = (out, w = W) => JSON.parse(fs.readFileSync(path.join(out, `W${String(w).padStart(3, "0")}.json`), "utf8"));
const hole = (out, w = W) => week(out, w).holes.find((h) => h.id === "clubhouse");

test("the ladder: 0 = lost ball, 1 = 6, 2 = 5, 3-4 = par, 5-6 = 3, 7-8 = 2, 9+ = hole in one", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15].map(G.clubStrokes), [7, 6, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
  const s = G.scoreClub([{ a: P[0], score: 3, scored: true, ranked: true }, { a: P[1], score: 9, scored: true, ranked: true }]);
  assert.equal(s.skipped, false);                                   // never skipped for a small field
  assert.equal(s.results[P[0]].strokes, 4); assert.equal(s.results[P[1]].strokes, 1);
  assert.equal(G.scoreHoleFor("clubhouse", [{ a: P[0], score: 1, scored: true, ranked: true }]).results[P[0]].strokes, 6);
  assert.equal(G.COURSE_ORDER.at(-1), "clubhouse"); assert.equal(JOIN_FROM.clubhouse, 6);
});

test("a card with the Clubhouse: the mulligan can drop it like any hole", () => {
  const holes = [{ id: "questions", skipped: false, results: { [P[0]]: { place: 1, of: 3, strokes: 1 } } },
    { id: "clubhouse", skipped: false, results: { [P[0]]: { place: 1, of: null, strokes: 6 } } },
    { id: "race", skipped: false, results: { [P[0]]: { place: 2, of: 3, strokes: 4 } } }];
  const c = G.card(holes, P[0]);
  assert.equal(c.mulligan, "clubhouse"); assert.equal(c.strokes, 5);
});

test("features are earned once and stamped with the week first seen; the record only grows", () => {
  const problems = [];
  const a = growClub(null, new Map([["swap", new Set([P[0]])], ["name", new Set([P[0], P[1]])]]), 3, END, problems);
  assert.deepEqual(a.wallets[P[0]], { name: 3, swap: 3 });
  const b = growClub(a, new Map([["swap", new Set([P[0]])], ["staked", new Set([P[0]])]]), 5, END, problems);
  assert.deepEqual(b.wallets[P[0]], { name: 3, staked: 5, swap: 3 });   // swap keeps week 3; doing it again adds nothing
  const c = growClub(b, new Map(), 6, END, problems);                    // nothing seen: nothing removed
  assert.deepEqual(c.wallets, b.wallets);
});

test("a run collects every feature it can read and writes the record; the hole counts the features by the week", async () => {
  const names = tmp("names-"); write(names, "names.json", { v: 1, nicknames: { [P[2]]: "two" } });
  const games = tmp("games-"); write(path.join(games, "blockx"), "board.json", { v: 1, week: { week: W, start: START, rows: [{ a: P[4], pts: 1, days: 3, ranked: true }, { a: P[5], pts: 1, days: 2, ranked: true }] }, lastWeek: null });
  // Last week's recorded holes (a week keeps the holes it was first recorded with, so this week is fresh).
  const prev = prevWith({ club: { v: 1, updated: "", wallets: { [P[0]]: { name: 1, swap: 2 } } }, weeks: [W - 1], course: { questions: W - 1, clubhouse: W },
    files: { "W002.json": { v: 1, week: W - 1, start: M.weekStart(W - 1), end: START, final: true, practice: true, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 6, rows: P.slice(0, 6).map((a, i) => [a, 10 - i, 1, 1]) }], cards: [], notFree: [], check: null } } });
  const out = tmp("golf-");
  const r = await run(base({ now: START + 3 * DAY, prev, out, namesDir: names, gamesDir: games,
    deskOf: async () => ({ total: 7, accounts: [P[1]] }), vaultOf: async (_n, who) => new Map(who.map((a) => [a, { staked: a === P[0], games: a === P[0] ? 2 : 0, claimed: false }])) }));
  const c = club(out).wallets;
  assert.deepEqual(c[P[0]], { name: 1, "play-questions": W, staked: W, swap: 2, "two-games": W });
  assert.equal(c[P[1]].swap, W); assert.equal(c[P[2]].name, W);
  assert.equal(c[P[4]]["blockx-3-days"], W); assert.equal(c[P[5]]["blockx-3-days"], undefined);
  const h = hole(out);
  assert.equal(h.status, "live");
  assert.equal(h.rows.find((x) => x[0] === P[0])[1], 5);           // name, swap, play-questions, staked, two-games
  assert.equal(club(out).desk, 7);
  assert.deepEqual(r.problems.filter((p) => p.startsWith("clubhouse")), []);
});

test("a finished week's Clubhouse is final, and a feature seen after it counts only from the next week", async () => {
  const prev = prevWith({ club: { v: 1, updated: "", wallets: Object.fromEntries(P.slice(0, 4).map((a) => [a, { name: 1, swap: 2, staked: W }])) } });
  const mid = tmp("golf-"), out = tmp("golf-");
  const o = { deskOf: async () => ({ total: 1, accounts: [P[0]] }), vaultOf: async (_n, who) => new Map(who.map((a) => [a, { staked: true, games: 0, claimed: true }])) };
  await run(base({ ...o, now: END + 20 * H, prev, out: mid }));
  await run(base({ ...o, now: END + 21 * H, prev: mid, out }));
  const h = hole(out, W);
  assert.equal(h.status, "final");
  assert.equal(h.rows.find((x) => x[0] === P[0])[1], 3);           // claimed (seen in week 4) is not in week 3
  assert.equal(club(out).wallets[P[0]].claimed, W + 1);
  const wf = week(out, W);
  assert.equal(wf.final, true);
  const card = wf.cards.find((x) => x.a === P[0]);
  assert.deepEqual(card.holes.find((x) => x[0] === "clubhouse"), ["clubhouse", 4, 3, null]);   // 3 features = par
});

test("a feature that can't be read is said aloud and tried again; nothing earned is lost", async () => {
  const prev = prevWith({ club: { v: 1, updated: "", wallets: { [P[0]]: { name: 1, swap: 2 } } } });
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev, out, deskOf: async () => { throw new Error("node down"); }, namesDir: tmp("empty-") }));
  assert.equal(club(out).wallets[P[0]].swap, 2); assert.equal(club(out).wallets[P[0]].name, 1);
  assert.ok(r.problems.some((p) => /clubhouse swap desk: node down/.test(p)));
  assert.ok(r.problems.some((p) => /clubhouse @names: names.json can't be read/.test(p)));
});

test("two nodes that disagree add nothing from that source", async () => {
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev: prevWith(), out, deskOf: async (n) => ({ total: 1, accounts: n === "main" ? [P[0]] : [P[1]] }) }));
  assert.equal(club(out).wallets[P[0]]?.swap, undefined); assert.equal(club(out).wallets[P[1]]?.swap, undefined);
  assert.ok(r.problems.some((p) => /swap desk: the two nodes don't agree/.test(p)));
});

test("more than 20 swaps since the last run is reported (the desk keeps only its newest 20)", async () => {
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev: prevWith({ club: { v: 1, updated: "", wallets: {}, desk: 5 } }), out, deskOf: async () => ({ total: 40, accounts: [P[0]] }) }));
  assert.ok(r.problems.some((p) => /35 swaps since the last run/.test(p)));
  assert.equal(club(out).desk, 40);
});

test("vault facts are read for a few players a run (the budget), only for those still missing one", async () => {
  const asked = [];
  const prev = prevWith({ weeks: [W], club: { v: 1, updated: "", wallets: { [P[0]]: { staked: 1, "two-games": 1, claimed: 1 } } },
    files: { "W003.json": { v: 1, week: W, start: START, end: END, final: false, practice: true, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 6, rows: P.slice(0, 6).map((a, i) => [a, 10 - i, 1, 1]) }], cards: [], notFree: [], check: null } } });
  await run(base({ now: START + DAY, prev, out: tmp("golf-"), clubBudget: 2, vaultOf: async (_n, who) => { asked.push(who); return new Map(); } }));
  assert.equal(asked.length, 2);                                     // main and check
  assert.equal(asked[0].length, 2); assert.ok(!asked[0].includes(P[0]));
});

test("a record that is there but can't be read stops the run (never a fresh start)", async () => {
  const prev = prevWith(); write(prev, "clubhouse.json", "{broken");
  await assert.rejects(() => run(base({ now: START + DAY, prev, out: tmp("golf-") })), /clubhouse.json is there but can't be read/);
  const p2 = prevWith({ club: { v: 1, updated: "", wallets: { [P[0]]: { "Bad Feature": 1 } } } });
  assert.throws(() => loadClub(p2), /bad feature/);
});

test("the Clubhouse joins like a game: not before its join week", async () => {
  const out = tmp("golf-");
  await run(base({ now: START + DAY, prev: prevWith({ course: { questions: W } }), out }));
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, "index.json"), "utf8")).course.clubhouse, Math.max(W + 1, 6));
  assert.equal(hole(out), undefined);
});

// ── the publish job's own checks (taken from golf.yml), on what the recorder writes ──
import { execFileSync } from "node:child_process";
function checks() {
  const y = fs.readFileSync(path.join(APP, ".github/workflows/golf.yml"), "utf8");
  return [...y.matchAll(/<<'PY'\n([\s\S]*?)\n\s*PY\n/g)].map((m) => {
    const f = path.join(tmp("chk-"), "check.py");
    fs.writeFileSync(f, m[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n"));
    return f;
  });
}
const py = (args, now) => execFileSync("python3", args, { encoding: "utf8", stdio: "pipe", env: { ...process.env, CHECK_NOW_MS: String(now) } });
const copyDir = (from) => { const d = tmp("copy-"); fs.cpSync(from, d, { recursive: true }); return d; };
const edit = (dir, f, fn) => { const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); fn(j); fs.writeFileSync(path.join(dir, f), JSON.stringify(j) + "\n"); };
async function finalWeek() {
  const prev = prevWith({ club: { v: 1, updated: "", wallets: Object.fromEntries(P.slice(0, 5).map((a, i) => [a, { name: 1, swap: 2, ...(i < 2 ? { staked: W } : {}) }])) } });
  const mid = tmp("golf-"), out = tmp("golf-");
  const o = { deskOf: async () => ({ total: 3, accounts: [P[6]] }) };
  await run(base({ ...o, now: END + 20 * H, prev, out: mid }));
  await run(base({ ...o, now: END + 21 * H, prev: mid, out }));
  return { mid, out };
}

test("the publish job accepts the recorder's Clubhouse files and re-scores the hole by the ladder", async (t) => {
  try { execFileSync("python3", ["--version"]); } catch { t.skip("no python3 here"); return; }
  const [shape, history] = checks();
  const { mid, out } = await finalWeek();
  assert.equal(week(out).final, true);
  assert.match(py([shape, out], END + 22 * H), /golf files ok/);
  assert.match(py([history, out, mid], END + 22 * H), /golf history ok/);
  // A Clubhouse row that doesn't match the record is refused.
  const b1 = copyDir(out); edit(b1, "W003.json", (j) => { j.holes.find((h) => h.id === "clubhouse").rows[0][1] += 1; });
  assert.throws(() => py([shape, b1], END + 22 * H), /scorecards don't match|Clubhouse hole doesn't match/);
  // A record with an extra feature for an ended week is refused by the shape check (the hole no longer matches).
  const b2 = copyDir(out); edit(b2, "clubhouse.json", (j) => { j.wallets[P[0]].producer = W; });
  assert.throws(() => py([shape, b2], END + 22 * H), /Clubhouse hole doesn't match/);
  // A bad feature name, or a week from the future, is refused.
  const b3 = copyDir(out); edit(b3, "clubhouse.json", (j) => { j.wallets[P[0]]["Bad Name"] = W + 1; });
  assert.throws(() => py([shape, b3], END + 22 * H), /clubhouse.json: wallets/);
});

test("the publish job's history check: an earned feature can't be removed or restamped, and a new one is this week's", async (t) => {
  try { execFileSync("python3", ["--version"]); } catch { t.skip("no python3 here"); return; }
  const [, history] = checks();
  const { mid, out } = await finalWeek();
  const gone = copyDir(out); edit(gone, "clubhouse.json", (j) => { delete j.wallets[P[0]].name; });
  assert.throws(() => py([history, gone, mid], END + 22 * H), /can't be removed or restamped/);
  const moved = copyDir(out); edit(moved, "clubhouse.json", (j) => { j.wallets[P[0]].name = 2; });
  assert.throws(() => py([history, moved, mid], END + 22 * H), /can't be removed or restamped/);
  const back = copyDir(out); edit(back, "clubhouse.json", (j) => { j.wallets[P[7]] = { swap: W - 2 }; });
  assert.throws(() => py([history, back, mid], END + 22 * H), /must be stamped with this week/);
  const lost = copyDir(out); fs.rmSync(path.join(lost, "clubhouse.json"));
  assert.throws(() => py([history, lost, mid], END + 22 * H), /published before and is missing now/);
  const desk = copyDir(out); edit(desk, "clubhouse.json", (j) => { j.desk = 0; });
  assert.throws(() => py([history, desk, mid], END + 22 * H), /swap count can't go down/);
});

test("only the week's players play the Clubhouse: features alone never make a scorecard", async () => {
  const outsider = "1" + "Z".repeat(33);
  const prev = prevWith({ club: { v: 1, updated: "", wallets: { [outsider]: { name: 1, swap: 1, producer: 1 }, [P[0]]: { name: 1 } } } });
  const out = tmp("golf-");
  await run(base({ now: START + DAY, prev, out }));
  const h = hole(out);
  assert.ok(h.rows.some((r) => r[0] === P[0]));
  assert.ok(!h.rows.some((r) => r[0] === outsider), "a wallet that played no game this week has no Clubhouse row");
  assert.ok(!week(out).cards.some((c) => c.a === outsider));
  assert.ok(club(out).wallets[outsider], "its features are still kept");
});

// Producers (Ruler chat, 15 Nov): signers = the distinct addrs[sig[i]] of each hour file that passes vhp-data.js
// checkHour against the file before it; the oldest file is only the first link; tail.sig isn't counted.
const { makeChain } = await import(path.resolve(APP, "tests/audit/vhp-ruler.fixture.mjs"));
test("producer: the signers of hour files that pass checkHour (the oldest file is only the first link)", async () => {
  const ch = makeChain({ seed: 7, hours: 3, np: 4 });
  const vhp = tmp("vhp-");
  ch.texts.forEach((t, i) => write(path.join(vhp, "h"), `${ch.n0 + i}.json`, t));
  const want = new Set(ch.texts.slice(1).flatMap((t) => { const j = JSON.parse(t); return j.sig.map((k) => j.addrs[k]); }));
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev: prevWith(), out, vhpDir: vhp }));
  const got = new Set(Object.entries(club(out).wallets).filter(([, f]) => f.producer === W).map(([a]) => a));
  assert.deepEqual([...got].sort(), [...want].sort());
  assert.ok(want.size >= 1);
  assert.deepEqual(r.problems.filter((p) => /clubhouse producers/.test(p)), []);
  // A changed file fails checkHour: it (and the file after it, whose chain it breaks) isn't used, and that's reported.
  const bad = tmp("vhp-");
  ch.texts.forEach((t, i) => write(path.join(bad, "h"), `${ch.n0 + i}.json`, i === 1 ? t.replace(/"kind":"live"/, '"kind":"chained"') : t));
  const r2 = await run(base({ now: START + DAY, prev: prevWith(), out: tmp("golf-"), vhpDir: bad }));
  assert.ok(r2.problems.some((p) => /clubhouse producers: 2 vhp-data hour file\(s\) didn't pass checkHour/.test(p)));
});

// ── features from a wallet's own transactions (account_history; owner's node check 15 Nov; Swap desk: Get VHP = burn) ──
const { historyFacts, POB_CONTRACT } = await import(path.resolve(APP, "bot/games/golf.ts"));
const { Contract, Signer } = await import("koilib");
// Real addresses (koilib checks the checksum when it encodes an operation).
const R = Array.from({ length: 4 }, (_, i) => Signer.fromSeed(`golf clubhouse test ${i}`).getAddress());
const VAULT = Signer.fromSeed("golf clubhouse test vault").getAddress();
const ADDR_T = { type: "bytes", options: { "(koinos.btype)": "ADDRESS" } }, U64_T = { type: "uint64", options: { jstype: "JS_STRING" } };
const pobAbi = { methods: {
  burn: { entry_point: 0x859facc5, argument: "p.burn_arguments", return: "p.empty", read_only: false },
  register_public_key: { entry_point: 0x53192be1, argument: "p.register_public_key_arguments", return: "p.empty", read_only: false } },
  koilib_types: { nested: { p: { nested: {
    burn_arguments: { fields: { token_amount: { ...U64_T, id: 1 }, burn_address: { ...ADDR_T, id: 2 }, vhp_address: { ...ADDR_T, id: 3 } } },
    register_public_key_arguments: { fields: { producer: { ...ADDR_T, id: 1 }, public_key: { type: "bytes", id: 2 } } },
    empty: { fields: {} } } } } } };
const pob = new Contract({ id: POB_CONTRACT, abi: pobAbi });
const vault = new Contract({ id: VAULT, abi: JSON.parse(fs.readFileSync(path.join(APP, "contracts/vault/abi/kpred.koilib.json"), "utf8")) });
const other = new Contract({ id: Signer.fromSeed("golf clubhouse test other").getAddress(), abi: JSON.parse(fs.readFileSync(path.join(APP, "contracts/vault/abi/kpred.koilib.json"), "utf8")) });
/** An account_history transaction entry (koilib's encodeOperation already gives args as base64url, like the node's JSON). */
async function trx(seq, ops, reverted = false) {
  const operations = [];
  for (const o of ops) { const e = await o; assert.equal(typeof e.call_contract.args, "string"); operations.push({ call_contract: { ...e.call_contract } }); }
  return { seq_num: String(seq), trx: { transaction: { id: "0x" + seq, operations }, receipt: { id: "0x" + seq, ...(reverted ? { reverted: true } : {}) } } };
}
const burnOp = (a, amount = "100000000") => pob.encodeOperation({ name: "burn", args: { token_amount: amount, burn_address: a, vhp_address: a } });
const keyOp = (a) => pob.encodeOperation({ name: "register_public_key", args: { producer: a, public_key: "AiAeY4PIK6GLlepslYHfS0_gFgRaYIfqarbOEIuo0Qc" } });
const moveOp = (c, a) => c.encodeOperation({ name: "move_stake", args: { player: a, from_game: 1, to_game: 2, amount: "100000000" } });

test("history: a burn, a key registration and a stake move each count only when they act for this wallet", async () => {
  const a = R[0], b = R[1];
  assert.deepEqual(await historyFacts(a, [await trx(1, [burnOp(a)])], VAULT), { burn: true, move: false, key: false });
  assert.deepEqual(await historyFacts(a, [await trx(1, [burnOp(b)])], VAULT), { burn: false, move: false, key: false });
  assert.deepEqual(await historyFacts(a, [await trx(1, [keyOp(a)])], VAULT), { burn: false, move: false, key: true });
  assert.deepEqual(await historyFacts(a, [await trx(1, [moveOp(vault, a)])], VAULT), { burn: false, move: true, key: false });
  assert.deepEqual(await historyFacts(a, [await trx(1, [moveOp(other, a)])], VAULT), { burn: false, move: false, key: false }, "move_stake on another contract");
  assert.deepEqual(await historyFacts(a, [await trx(1, [burnOp(a), keyOp(a)], true)], VAULT), { burn: false, move: false, key: false }, "a reverted transaction");
  assert.deepEqual(await historyFacts(a, [{ seq_num: "1", block: { header: { signer: a }, receipt: { events: [] } } }], VAULT), { burn: false, move: false, key: false }, "block entries never count");
  // D-244 (J13-3): a burn counts only at 1 VHP or more.
  assert.deepEqual(await historyFacts(a, [await trx(1, [burnOp(a, "99999999")])], VAULT), { burn: false, move: false, key: false }, "a burn under 1 VHP");
  assert.deepEqual(await historyFacts(a, [await trx(1, [burnOp(a, "100000000")])], VAULT), { burn: true, move: false, key: false }, "a burn of exactly 1 VHP");
});

test("history (D-244, J13-3): a registered producer key counts only once the wallet has signed a block", async () => {
  const pages = { [R[0]]: [await trx(0, [keyOp(R[0])])], [R[1]]: [await trx(0, [keyOp(R[1])])] };
  const histOf = async (n, a, seq) => (pages[a] ?? []).filter((e) => Number(e.seq_num) >= seq);
  // R[1] already has "producer" (signed a block before); R[0] doesn't.
  const prev = prevWith({ weeks: [W - 1], course: { questions: W - 1, clubhouse: W }, club: { v: 1, updated: "", wallets: { [R[1]]: { producer: W - 1 } } },
    files: { "W002.json": { v: 1, week: W - 1, start: M.weekStart(W - 1), end: START, final: true, practice: true, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 4, rows: R.map((a, i) => [a, 10 - i, 1, 1]) }], cards: [], notFree: [], check: null } } });
  const out = tmp("golf-");
  await run(base({ now: START + DAY, prev, out, histOf, knodeGame: VAULT, histBudget: 20 }));
  const c = club(out);
  assert.equal(c.wallets[R[1]]["producer-key"], W, "key + signed a block: counts");
  assert.equal(c.wallets[R[0]]?.["producer-key"], undefined, "key but no block signed: doesn't count");
});

test("history in a run: read forward from the saved place, on two nodes, a few wallets a run", async () => {
  const pages = { [R[0]]: [await trx(0, [burnOp(R[0])]), await trx(1, [moveOp(vault, R[0])])], [R[1]]: [await trx(0, [keyOp(R[1])])] };
  const asked = [];
  const histOf = async (n, a, seq) => { asked.push([n, a, seq]); return (pages[a] ?? []).filter((e) => Number(e.seq_num) >= seq); };
  const prev = prevWith({ weeks: [W - 1], course: { questions: W - 1, clubhouse: W }, club: { v: 1, updated: "", wallets: { [R[1]]: { producer: W - 1 } }, hist: { [R[1]]: 0 } },
    files: { "W002.json": { v: 1, week: W - 1, start: M.weekStart(W - 1), end: START, final: true, practice: true, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 6, rows: R.map((a, i) => [a, 10 - i, 1, 1]) }], cards: [], notFree: [], check: null } } });
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev, out, histOf, knodeGame: VAULT, histBudget: 20 }));
  const c = club(out);
  assert.equal(c.wallets[R[0]].burn, W); assert.equal(c.wallets[R[0]]["move-stake"], W); assert.equal(c.wallets[R[1]]["producer-key"], W);
  assert.equal(c.hist[R[0]], 2); assert.equal(c.hist[R[1]], 1);
  assert.ok(asked.some(([n]) => n === "check"), "read on the second node too");
  assert.deepEqual(r.problems.filter((p) => /transactions/.test(p)), []);
  // The next run starts where this one stopped.
  asked.length = 0;
  if (!fs.existsSync(path.join(out, "W002.json"))) fs.copyFileSync(path.join(prev, "W002.json"), path.join(out, "W002.json"));   // last week's players
  await run(base({ now: START + DAY + H, prev: out, out: tmp("golf-"), histOf, knodeGame: VAULT, histBudget: 20 }));
  assert.ok(asked.filter(([, a]) => a === R[0]).length >= 1 && asked.filter(([, a]) => a === R[0]).every(([, , s]) => s === 2));
});

test("history: two nodes that disagree add nothing and don't move the saved place", async () => {
  const histOf = async (n, a) => (n === "main" ? [await trx(0, [burnOp(a)])] : []);
  const prev = prevWith({ weeks: [W - 1], course: { questions: W - 1, clubhouse: W },
    files: { "W002.json": { v: 1, week: W - 1, start: M.weekStart(W - 1), end: START, final: true, practice: true, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 4, rows: R.map((a, i) => [a, 10 - i, 1, 1]) }], cards: [], notFree: [], check: null } } });
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev, out, histOf, knodeGame: VAULT, histBudget: 1 }));
  assert.ok(r.problems.some((p) => /the two nodes don't agree yet on .*history/.test(p)));
  assert.equal(Object.values(club(out).wallets).some((f) => f.burn !== undefined), false);
  assert.equal(club(out).hist, undefined);
});

test("the publish job: a wallet's history place can't go backwards", async (t) => {
  try { execFileSync("python3", ["--version"]); } catch { t.skip("no python3 here"); return; }
  const [shape, history] = checks();
  const { mid, out } = await finalWeek();
  edit(mid, "clubhouse.json", (j) => { j.hist = { [P[0]]: 5 }; });
  edit(out, "clubhouse.json", (j) => { j.hist = { [P[0]]: 7 }; });
  assert.match(py([shape, out], END + 22 * H), /golf files ok/);
  assert.match(py([history, out, mid], END + 22 * H), /golf history ok/);
  const back = copyDir(out); edit(back, "clubhouse.json", (j) => { j.hist = { [P[0]]: 4 }; });
  assert.throws(() => py([history, back, mid], END + 22 * H), /history can't be read backwards/);
  const bad = copyDir(out); edit(bad, "clubhouse.json", (j) => { j.hist = { [P[0]]: -1 }; });
  assert.throws(() => py([shape, bad], END + 22 * H), /clubhouse.json: hist/);
});

test("history (Repo Lens #J-13 J13-2): two nodes agree when what Golf reads agrees, however each writes the rest", async () => {
  const { samePage } = await import(path.resolve(APP, "bot/games/golf.ts"));
  const e = await trx(7, [burnOp(R[0])]);
  const t = e.trx.transaction, rc = e.trx.receipt;
  // Same entry, written another way: fields in another order, an extra "reverted: false", an extra field.
  const f = { trx: { receipt: { ...rc, reverted: false, rc_used: "123" }, transaction: { operations: t.operations, id: t.id, header: { payer: R[0] } } }, seq_num: "7" };
  assert.equal(samePage([e], [f]), true);
  assert.equal(samePage([e], [{ ...f, seq_num: "8" }]), false, "a different seq_num");
  assert.equal(samePage([e], [{ ...f, trx: { ...f.trx, receipt: { ...rc, reverted: true } } }]), false, "reverted on one node");
  assert.equal(samePage([e], [await trx(7, [keyOp(R[0])])]), false, "a different operation");
  assert.equal(samePage([e], []), false, "a missing entry");
  assert.equal(samePage([{ seq_num: "1", block: { a: 1 } }], [{ block: { b: 2 }, seq_num: "1" }]), true, "block entries: only the seq_num matters");
});

test("history (Repo Lens #J-13 J13-5): the same node twice is no check, so nothing is read and it's said aloud", async () => {
  const asked = [];
  const histOf = async (n, a, seq) => { asked.push(a); return [await trx(0, [burnOp(a)])]; };
  const prev = prevWith({ weeks: [W - 1], course: { questions: W - 1, clubhouse: W },
    files: { "W002.json": { v: 1, week: W - 1, start: M.weekStart(W - 1), end: START, final: true, practice: true, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 4, rows: R.map((a, i) => [a, 10 - i, 1, 1]) }], cards: [], notFree: [], check: null } } });
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev, out, histOf, knodeGame: VAULT, histSame: true }));
  assert.ok(r.problems.some((p) => /history node and its check node are the same/.test(p)));
  assert.deepEqual(asked, []);
  assert.equal(Object.values(club(out).wallets).some((f) => f.burn !== undefined), false);
});

test("history (Repo Lens #J-13 J13-2): the newest page counts what both nodes show, so a node a block behind isn't a disagreement", async () => {
  const { newestBoth } = await import(path.resolve(APP, "bot/games/golf.ts"));
  const e9 = await trx(9, [burnOp(R[0])]), e8 = await trx(8, [keyOp(R[0])]), e7 = await trx(7, [moveOp(vault, R[0])]);
  // Node 2 hasn't got entry 9 yet: only 8 and 7 count.
  assert.deepEqual(newestBoth([e9, e8, e7], [e8, e7]).map((e) => e.seq_num), ["8", "7"]);
  assert.deepEqual(newestBoth([e8, e7], [e9, e8, e7]).map((e) => e.seq_num), ["8", "7"]);
  // An entry both show but differently: a disagreement.
  assert.equal(newestBoth([e9, e8], [await trx(9, [keyOp(R[0])]), e8]), null);
  // Nothing in common: nothing counts, no disagreement.
  assert.deepEqual(newestBoth([e9], [e7]), []);
  // In a run: the burn only node 1 shows on its newest page waits; the key both show counts.
  const pages = { main: [e9, e8], check: [e8] };
  const histOf = async (n, a, seq, newest) => (a !== R[0] ? [] : newest ? pages[n] : []);
  const prev = prevWith({ weeks: [W - 1], course: { questions: W - 1, clubhouse: W }, club: { v: 1, updated: "", wallets: { [R[0]]: { producer: W - 1 } } },
    files: { "W002.json": { v: 1, week: W - 1, start: M.weekStart(W - 1), end: START, final: true, practice: true, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 4, rows: R.map((a, i) => [a, 10 - i, 1, 1]) }], cards: [], notFree: [], check: null } } });
  const out = tmp("golf-");
  const r = await run(base({ now: START + DAY, prev, out, histOf, knodeGame: VAULT, histBudget: 20 }));
  assert.deepEqual(r.problems.filter((p) => /history/.test(p)), []);
  assert.equal(club(out).wallets[R[0]]["producer-key"], W);
  assert.equal(club(out).wallets[R[0]].burn, undefined);
});
