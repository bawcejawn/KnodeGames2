// Over/Under on the kit: the GameModule against a fake ruler (cards built from given rows) and a fake block clock.
// The end-to-end week (real ruler chain, two nodes, the real publish check) is the conformance sample (`npm run game:check`).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { game, CARD, type Inputs } from "../recorder.ts";
import { PENDING, NotYet } from "../../../kit/recorder/types.ts";
import * as F from "../math.js";

const DAY = 86400000, MON = Date.UTC(2026, 10, 16);
const WEEK = { week: 4, start: MON, end: MON + 7 * DAY };
const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", C = "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const D = "1DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD", E = "1EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
const S = "1SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS", T = "1TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT", U = "1UUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU";
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BLOCK0 = 1000000, T0 = Date.UTC(2026, 9, 1);
const clock = (upTo = Infinity) => async (ms: number) => { if (ms > upTo) throw new NotYet("not yet: not irreversible"); return BLOCK0 + Math.ceil((ms - T0) / 3000); };
type Row = { credited: number; expected: number; void?: boolean; entry?: boolean; quality?: "ok" | "flagged" };
function fakeVhp(rowsFor: (round: string) => Record<string, Row> | null) {
  const asked: any[] = [];
  return {
    asked, ruleVersion: 4, to: 0,
    card(s: any) {
      asked.push(s);
      const rows = rowsFor(s.round);
      if (!rows) throw new NotYet(`not yet: ${s.round}`);
      return { ruleVersion: 4, game: s.game, round: s.round, producers: Object.entries(rows).map(([a, r]) => ({ a, credited: String(r.credited * 1e6), expected: String(r.expected * 1e6), void: !!r.void, entry: r.entry ?? true, quality: r.quality ?? "ok" })) };
    },
  };
}
const base = (): Record<string, Row> => ({ [A]: { credited: 20, expected: 20.4 }, [B]: { credited: 30, expected: 30.4 }, [C]: { credited: 40, expected: 40.4 }, [D]: { credited: 50, expected: 50.4, entry: false }, [E]: { credited: 60, expected: 60.4, void: true } });
const ctxOf = (vhp: unknown, blockAt: unknown = clock(), extra: object = {}) => ({ now: MON, vhp, blockAt, ...extra } as any);
const roster = async (): Promise<Inputs> => (await game.inputsFor!(WEEK, ctxOf(fakeVhp(base)))) as Inputs;

test("rounds: Monday to Sunday, two a UTC day (A rows 0-31, B rows 32-63), 12-hour Picks rounds, day = dayOf(locksAt)", () => {
  const rs = game.roundsFor(WEEK, { now: MON });
  assert.equal(rs.length, 14);
  assert.deepEqual(rs.map((x) => x.id), ["d20261116", "d20261116b", "d20261117", "d20261117b", "d20261118", "d20261118b", "d20261119", "d20261119b", "d20261120", "d20261120b", "d20261121", "d20261121b", "d20261122", "d20261122b"]);
  for (const x of rs) { assert.equal(x.locksAt, x.day + 1); assert.equal(x.resolvesAt, x.day + DAY); assert.equal(x.pickRound, F.pickRoundOf(x.day, F.halfOfId(x.id))); }
  assert.equal(new Set(rs.map((x) => x.pickRound)).size, 14, "every round its own Picks round");
  assert.equal(rs[0].pickRound, MON / DAY * 2);
  assert.equal(rs[1].pickRound, MON / DAY * 2 - 1);
});

test("manifest: Picks game 16 and vault game 16, kind of inputs, and the roster is made at least a day before the first picks open", () => {
  const m = JSON.parse(fs.readFileSync(new URL("../game.json", import.meta.url), "utf8"));
  assert.equal(m.vaultGameId, 16);
  assert.deepEqual(m.picks, { contract: "picks", gameId: 16 });
  assert.equal(game.slug, m.slug);
  assert.equal(m.inputsFile, true);
  assert.equal(m.freePrizeDefault, "on", "D-290");
  assert.equal(m.maxRoundPoints, F.HALF);
  // D-284: the roster is published BEFORE picks open. Monday's picks open F.AHEAD (2 days) before the week; the roster
  // is made inputsLeadHours before it. The roster must exist, with a margin of at least a day, before that moment.
  assert.ok(m.inputsLeadHours * 3600000 >= F.AHEAD + DAY, `inputsLeadHours ${m.inputsLeadHours} h is not at least ${(F.AHEAD + DAY) / 3600000} h`);
});

test("inputsFor: the newest ruler card (Thursday), Over/Under's own settings, roster = entry and not void, lines from expected; the recount is byte-equal", async () => {
  const vhp = fakeVhp(base);
  const inp = (await game.inputsFor!(WEEK, ctxOf(vhp))) as Inputs;
  assert.deepEqual(vhp.asked.map((s) => s.round), ["20261112"], "one card, the newest");
  assert.ok(vhp.asked.every((s) => s.game === 16 && s.minK === CARD.minK && s.ownRule === "spot" && s.poolRule === "min"));
  assert.equal(inp.start, MON);
  assert.equal(inp.roster.cardRound, "20261112");
  assert.deepEqual(inp.roster.rows, [{ a: A, line: 41 }, { a: B, line: 61 }, { a: C, line: 81 }], "D has no entry, E is void; 20.4 → 20.5, 30.4 → 30.5, 40.4 → 40.5");
  F.checkRoster(inp.roster, MON);
  const again = (await game.inputsFor!(WEEK, ctxOf(fakeVhp(base)))) as Inputs;
  assert.equal(JSON.stringify(again), JSON.stringify(inp));
});

test("inputsFor: a flagged newest card is passed over for the next one; every card flagged or no data waits (NotYet), never a guess", async () => {
  const flaggedRows = (): Record<string, Row> => Object.fromEntries(Object.entries(base()).map(([a, r]) => [a, { ...r, quality: "flagged" as const }]));
  const vhp = fakeVhp((round) => (round === "20261112" ? flaggedRows() : base()));
  const inp = (await game.inputsFor!(WEEK, ctxOf(vhp))) as Inputs;
  assert.deepEqual(vhp.asked.map((s) => s.round), ["20261112", "20261111"]);
  assert.equal(inp.roster.cardRound, "20261111");
  await assert.rejects(() => game.inputsFor!(WEEK, ctxOf(fakeVhp(flaggedRows))), NotYet);
  await assert.rejects(() => game.inputsFor!(WEEK, ctxOf(undefined)), NotYet);
  await assert.rejects(() => game.inputsFor!(WEEK, ctxOf(fakeVhp(base), null)), NotYet, "before the kit's block clock");
  await assert.rejects(() => game.inputsFor!(WEEK, ctxOf(fakeVhp(() => null))), NotYet, "no card yet");
});

test("resultOf: each roster producer's [credited, expected, void] from the day's card; asked with the roster as `include`", async () => {
  const inp = await roster(), [mon] = game.roundsFor(WEEK, { now: MON });
  const vhp = fakeVhp(() => ({ ...base(), [A]: { credited: 21, expected: 20.4 } }));
  const r: any = await game.resultOf(mon, {} as any, inp, ctxOf(vhp));
  assert.equal(r.round, "20261116");
  assert.deepEqual(Object.keys(r.rows).sort(), [A, B, C]);
  assert.deepEqual(r.rows[A], [String(21e6), String(20.4e6), false]);
  assert.deepEqual(vhp.asked[0].include, [A, B, C]);
  assert.equal(vhp.asked[0].game, 16);
});

test("resultOf: waits (PENDING / NotYet) while there is no roster, no data, the day isn't irreversible, or a roster producer has no row", async () => {
  const inp = await roster(), [mon] = game.roundsFor(WEEK, { now: MON });
  assert.equal(await game.resultOf(mon, {} as any, undefined, ctxOf(fakeVhp(base))), PENDING);
  await assert.rejects(() => game.resultOf(mon, {} as any, inp, ctxOf(fakeVhp(() => null))), NotYet);
  await assert.rejects(() => game.resultOf(mon, {} as any, inp, ctxOf(fakeVhp(base), clock(MON))), NotYet, "the day's last block isn't irreversible");
  const missing = fakeVhp(() => { const b = base(); delete b[B]; return b; });
  assert.equal(await game.resultOf(mon, {} as any, inp, ctxOf(missing)), PENDING, "B has no row: wait, never a silent skip");
});

test("resultOf: a flagged day waits until Tuesday 00:00 UTC after the week, then every row is skipped; a day with no card at all skips every row after 48 h, alerted", async () => {
  const inp = await roster(), [mon] = game.roundsFor(WEEK, { now: MON });
  const flaggedVhp = fakeVhp(() => Object.fromEntries(Object.entries(base()).map(([a, r]) => [a, { ...r, quality: "flagged" as const }])));
  await assert.rejects(() => game.resultOf(mon, {} as any, inp, ctxOf(flaggedVhp, clock(F.flaggedCutoff(MON) - DAY))), NotYet);
  const f: any = await game.resultOf(mon, {} as any, inp, ctxOf(flaggedVhp, clock()));
  assert.equal(f.flagged, true);
  assert.ok(Object.values(f.rows).every((r: any) => r[2] === true));
  const out = F.dayOutcomes(inp.roster, f.rows);
  assert.ok(Object.values(out).every((o) => o === "skip"));
  const said: string[] = [];
  const none = fakeVhp(() => null);
  await assert.rejects(() => game.resultOf(mon, {} as any, inp, ctxOf(none, clock(mon.day + DAY + F.NO_CARD_GRACE - 1), { fallback: async (w: string) => { said.push(w); } })), NotYet, "inside the 48 hours");
  const g: any = await game.resultOf(mon, {} as any, inp, ctxOf(none, clock(), { fallback: async (w: string) => { said.push(w); } }));
  assert.equal(g.fallback, true);
  assert.equal(said.length, 1);
  assert.match(said[0], /Over\/Under 20261116/);
  await assert.rejects(() => game.resultOf(mon, {} as any, inp, ctxOf(none, clock())), NotYet, "no fallback available: waits");
});

test("scoreRound: 1 point a right row for every wallet that picked, 0 included; the score time is the pick's, kept inside the week", async () => {
  const inp = await roster(), [mon] = game.roundsFor(WEEK, { now: MON });
  const result = { round: "20261116", rows: { [A]: [String(21e6), "0", false], [B]: [String(29e6), "0", false], [C]: [String(40.5e6), "0", false] } } as any;
  // lines: A 20.5 (21 → over), B 30.5 (29 → under), C 40.5 (40.5 → tie: skipped)
  const pick = (wallet: string, choices: Record<string, "over" | "under">, at: number) => ({ wallet, round: "d", pick: { number: F.encodePick(inp.roster, choices) }, at });
  const picks = [
    pick(S, { [A]: "over", [B]: "under", [C]: "over" }, MON - 600000),
    pick(T, { [A]: "under", [B]: "over" }, MON - 500000),
    { wallet: U, round: "d", pick: { number: "garbage" }, at: MON - 100 },
  ] as any;
  const s = game.scoreRound(mon, picks, result, inp);
  assert.deepEqual([...s.entries()], [[S, { points: 2, at: MON }], [T, { points: 0, at: 0 }], [U, { points: 0, at: 0 }]]);
  // a Tuesday-round pick from Sunday: still inside the week, never before its start
  const tue = game.roundsFor(WEEK, { now: MON })[2];
  const s2 = game.scoreRound(tue, [pick(S, { [A]: "over" }, MON - 2 * DAY)] as any, result, inp);
  assert.equal(s2.get(S)!.at, MON);
  const s3 = game.scoreRound(tue, [pick(S, { [A]: "over" }, tue.day + 5000)] as any, result, inp);
  assert.equal(s3.get(S)!.at, tue.day, "never later than the round's own day start");
});

test("scoreRound refuses any roster that is not exactly the published one, and any day outside its week (D-284)", async () => {
  const inp = await roster(), [mon] = game.roundsFor(WEEK, { now: MON });
  const result = { round: "20261116", rows: { [A]: ["1", "0", false], [B]: ["1", "0", false], [C]: ["1", "0", false] } } as any;
  const p = [{ wallet: S, round: "d", pick: { number: "5" }, at: MON }] as any;
  assert.doesNotThrow(() => game.scoreRound(mon, p, result, inp));
  const changed = JSON.parse(JSON.stringify(inp)) as Inputs; changed.roster.rows[0].line += 2;
  assert.throws(() => game.scoreRound(mon, p, result, changed), /id does not match/, "a changed line");
  const swapped = JSON.parse(JSON.stringify(inp)) as Inputs; swapped.roster.rows.reverse();
  assert.throws(() => game.scoreRound(mon, p, result, swapped), /sorted/, "a reordered roster");
  const other = (await game.inputsFor!({ ...WEEK, start: MON + 7 * DAY, end: MON + 14 * DAY }, ctxOf(fakeVhp(base)))) as Inputs;
  assert.throws(() => game.scoreRound(mon, p, result, other), /not in the roster's week/, "next week's roster for this week's day");
  assert.throws(() => game.scoreRound(mon, p, result, undefined), /no roster/);
  const wrong = { ...inp, start: MON + DAY } as Inputs;
  assert.throws(() => game.scoreRound(mon, p, result, wrong), /roster: for the week starting|id does not match/);
});

test("round B scores rows 32 to 63 from its own number; round A ignores them; a wallet that only picked A has no entry in B", () => {
  const adr = (i: number) => "1" + CH[i % CH.length].repeat(33 - Math.floor(i / CH.length)) + "Z".repeat(Math.floor(i / CH.length));
  const roster = F.makeRoster(MON, "20261112", Array.from({ length: 40 }, (_, i) => ({ a: adr(i), expected: "20400000", entry: true, void: false })));
  const inp = { start: MON, roster } as any;
  const rows = Object.fromEntries(roster.rows.map((x: any) => [x.a, ["25000000", "0", false]])) as any;   // every row: over (line 20.5)
  const [a, b] = game.roundsFor(WEEK, { now: MON });
  assert.equal(b.id, "d20261116b");
  const all = Object.fromEntries(roster.rows.map((x: any) => [x.a, "over"])) as Record<string, "over">;
  const [na, nb] = F.encodePicks(roster, all);
  const mkPick = (wallet: string, number: string) => ({ wallet, round: "x", pick: { number }, at: MON - 1000 });
  const sa = game.scoreRound(a, [mkPick(S, na)] as any, { round: "20261116", rows } as any, inp);
  const sb = game.scoreRound(b, [mkPick(S, nb)] as any, { round: "20261116", rows } as any, inp);
  assert.equal(sa.get(S)!.points, 32);
  assert.equal(sb.get(S)!.points, 8, "rows 32 to 39");
  // B's number read as A (or the reverse) can't give the other half's points
  assert.equal(game.scoreRound(a, [mkPick(S, nb)] as any, { round: "20261116", rows } as any, inp).get(S)!.points, 8, "the same bits mean rows 0 to 7 in A: that is what the round says");
  assert.equal(game.scoreRound(b, [mkPick(S, "0")] as any, { round: "20261116", rows } as any, inp).get(S)!.points, 0);
});

test("inputsFor: more than 64 qualifying producers stops the roster loudly (D-296): not NotYet, nothing cut", async () => {
  const adr = (i: number) => "1" + CH[i % CH.length].repeat(33 - Math.floor(i / CH.length)) + "Z".repeat(Math.floor(i / CH.length));
  const many = (): Record<string, Row> => Object.fromEntries(Array.from({ length: 65 }, (_, i) => [adr(i), { credited: 20, expected: 20.4 }]));
  await assert.rejects(() => game.inputsFor!(WEEK, ctxOf(fakeVhp(many))), (e: any) => !(e instanceof NotYet) && /65 producers qualify, the limit is 64/.test(e.message));
});
