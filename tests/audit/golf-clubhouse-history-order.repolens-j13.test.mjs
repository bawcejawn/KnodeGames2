// Repo Lens #J-13 (Golf Clubhouse history features, patch 24843ee → 4d04f12), J13-1 (Medium). Place in tests/audit/.
// Test 1 fails on the patch as sent. Run from the repository root:
//   TZ=UTC node --import tsx --test --test-concurrency=1 tests/audit/golf-clubhouse-history-order.repolens-j13.test.mjs
//
// The three history features are read from the OLDEST entry up (ascending from clubhouse.json hist), 300 entries per
// wallet per turn, and a wallet gets a turn about every (players needing one ÷ 10) hourly runs. A feature counts from
// the week Golf first reads it. So two wallets that both burned KOIN for VHP this week are treated differently by how
// long their histories are: a new wallet's burn counts this week; a wallet with a long history (every Knode pick, every
// block it signed, is an entry) gets it weeks or months later. Real numbers: a producer with 85,000 entries needs 284
// turns; with 100 players needing a turn that is every 10 h → ~118 days. In a staked week this moves a stroke on the
// Clubhouse at the ladder's steps, and so the Staked board order the vault pays by.
// Here: wallet A (1 entry: a burn) and wallet B (900 block entries, then a burn), three runs in week W, then the week ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = process.env.APP || ".";
const { run, CLUB_SOURCE, POB_CONTRACT } = await import(path.resolve(APP, "bot/games/golf.ts"));
const { Contract, Signer } = await import("koilib");
const M = globalThis.KRaceMath;
const H = 3600000, DAY = 24 * H;
const W = 3, START = M.weekStart(W), END = M.weekStart(W + 1);
process.env.CHECK_NOW_MS ??= String(END + 7 * DAY);
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const write = (dir, name, j) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), typeof j === "string" ? j : JSON.stringify(j)); };
const P = Array.from({ length: 6 }, (_, i) => Signer.fromSeed(`j13 player ${i}`).getAddress());
const [A, B] = P;
const Q = () => ({ closed: true, questions: 2, resolved: 2, rows: P.map((a, i) => ({ a, pts: 10 - i, answered: 2 })) });
const SRC = [{ id: "questions", name: "Daily Questions", reader: "questions", live: true }, CLUB_SOURCE];
const ADDR_T = { type: "bytes", options: { "(koinos.btype)": "ADDRESS" } }, U64_T = { type: "uint64", options: { jstype: "JS_STRING" } };
const pob = new Contract({ id: POB_CONTRACT, abi: { methods: { burn: { entry_point: 0x859facc5, argument: "p.burn_arguments", return: "p.empty", read_only: false } },
  koilib_types: { nested: { p: { nested: { burn_arguments: { fields: { token_amount: { ...U64_T, id: 1 }, burn_address: { ...ADDR_T, id: 2 }, vhp_address: { ...ADDR_T, id: 3 } } }, empty: { fields: {} } } } } } } });
const burnTrx = async (seq, a) => ({ seq_num: String(seq), trx: { transaction: { id: "0x" + seq, operations: [{ call_contract: { ...(await pob.encodeOperation({ name: "burn", args: { token_amount: "100000000", burn_address: a, vhp_address: a } })).call_contract } }] }, receipt: { id: "0x" + seq } } });
const blockEntry = (seq, a) => ({ seq_num: String(seq), block: { header: { signer: a }, receipt: { events: [] } } });
// Both burned this week. A is a new wallet; B has 900 older entries (blocks it signed) before its burn.
const HISTORY = { [A]: [await burnTrx(0, A)], [B]: [...Array.from({ length: 900 }, (_, i) => blockEntry(i, B)), await burnTrx(900, B)] };
/** account_history as a node answers it: ascending from seq, or (newest) the newest page, newest first. */
const histOf = async (_n, a, seq, newest = false) => { const h = HISTORY[a] ?? []; return newest ? h.slice(-100).reverse() : h.filter((e) => Number(e.seq_num) >= seq).slice(0, 100); };

test("J13-1: two wallets that burned in the same week get the burn in the same week, whatever their history length", async () => {
  const prev = tmp("golf-prev-");
  write(prev, "index.json", { v: 1, updated: "", weeks: [W], course: { questions: W, clubhouse: W }, stakedFromWeek: W });
  write(prev, "clubhouse.json", { v: 1, updated: "", wallets: {} });
  write(prev, "W003.json", { v: 1, week: W, start: START, end: END, final: false, practice: false, holes: [{ id: "questions", name: "Daily Questions", status: "live", why: "", field: 6, rows: P.map((a, i) => [a, 10 - i, 1, 2]) }, { id: "clubhouse", name: "Clubhouse", status: "live", why: "", field: 0, rows: [] }], cards: [], notFree: [], check: null });
  const o = { sources: SRC, questionsOf: async () => Q(), p: "main", check: "check", stakedFromWeek: W, fresh: false, histOf, histBudget: 10,
    golfStakersOf: async (_n, who) => new Map(who.map((a) => [a, 2])),
    deskOf: async () => ({ total: 0, accounts: [] }), vaultOf: async (_n, who) => new Map(who.map((a) => [a, { staked: true, games: 0, claimed: false }])) };
  let dir = prev;
  for (const t of [START + 5 * DAY, START + 5 * DAY + H, START + 5 * DAY + 2 * H, END + 20 * H, END + 21 * H]) { const out = tmp("golf-"); await run({ ...o, now: t, prev: dir, out }); dir = out; }
  const c = JSON.parse(fs.readFileSync(path.join(dir, "clubhouse.json"), "utf8"));
  assert.equal(c.wallets[A].burn, W, "A's burn counts this week");
  assert.equal(c.wallets[B].burn, W, `B burned in the same week, but its burn is stamped week ${c.wallets[B].burn} (history read up to ${c.hist?.[B]} of 901 entries by the week's end)`);
});
