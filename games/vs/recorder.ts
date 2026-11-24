// Knode Games VS (game 17): the game's own part of the recorder, a GameModule on the Shared Game Kit (D-146).
// One round a day (UTC). The pool node plays every roster producer; a pick is one number (bit i = producer i beats the pool
// node, 0 = "Knode Games vs All"). Every rule lives in math.js; this file only asks the kit for the data.
//
// RESULT: the day's ruler card (CARD below, window from block heights): every roster producer's fpct and the pool node's.
// INPUTS: the week's seven rosters, one write-once inputs file made before picks open (inputsLeadHours 48). Each day's roster
//   is the same list for the whole week, taken from one ruler card that ends 48 h before the week starts (see STAND-INS).
//
// STAND-INS (#33 is merged, but the kit does not yet hand a game the Ruler's list helpers or the noVoid card key):
//   (1) the roster list is "producers in the card's field" (card entry flag, minK 10), to become listAt when the kit exposes it
//       (Ruler's helper); (2) the pool node's row is read from the same card (row missing = PENDING, VS-2); (3) card settings are the
//       Ruler's list for game 17 (c "500000", minK 10, poolRule "min", ownRule "spot", paying true, pooled = the Vault) WITHOUT
//       noVoid: the kit's card-setting key sets (kit/publish/check.inline.mjs) don't allow it yet, so a producer the card voids
//       has no fpct and its matchup is skipped (D-317 wants it scored). Asked of Architecture. Unreliable producers stay on the
//       TEST list (D-398), so VS needs no isUnreliable. games/vs/tests/ruler-swap.test.ts pins the settings to the Ruler's list.
import { PENDING, VOID, NotYet, type GameModule, type Round, type Score, type Pick } from "../../kit/recorder/types.ts";
import type { RawPick } from "../../kit/recorder/sources/picks-contract.ts";
import * as V from "./math.js";

const POOL = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
const DAY = V.DAY;
const CARD_BLOCKS = 7200;                                      // the card's size window: the 6 hours before the lock
const DAY_BLOCKS = 28800;                                      // one block every 3 s: 28,800 blocks a day (VS-9)
const CARD = Object.freeze({ game: V.GAME, c: "500000", minK: 10, poolRule: "min", ownRule: "spot", paying: true, pooled: [POOL] });

export type DayResult = { round: string; node: string | null; rows: Record<string, string | null> };
export type VsInputs = { week: number; rosters: Record<string, any> };

const ymd = (day: number) => new Date(day).toISOString().slice(0, 10).replaceAll("-", "");
/** An fpct as whole-number text for the result (VS-3): numbers and BigInts only through BigInt, so a fraction stops loudly and a
 *  large number never turns into "1e+21". */
const fp = (x: unknown) => (x === null || x === undefined ? null : BigInt(x as any).toString());

async function settingsFor(day: number, blockAt: (ms: number) => Promise<number>) {
  const S0 = await blockAt(day);
  const S1 = (await blockAt(day + DAY)) - 1;
  const L = (await blockAt(V.locksAt(day))) - 1;
  if (!(Number.isSafeInteger(S0) && Number.isSafeInteger(S1) && Number.isSafeInteger(L) && L < S0 && S0 <= S1)) throw new Error(`VS: bad block heights for ${ymd(day)}`);
  return { game: CARD.game, round: Number(ymd(day)), window: { W0: L - CARD_BLOCKS + 1, W1: L, L, S0, S1 },
    c: CARD.c, minK: CARD.minK, poolRule: CARD.poolRule, ownRule: CARD.ownRule, paying: CARD.paying, pooled: [...CARD.pooled] };
}

/** The roster list for a week: producers in the field of a card that ends 48 h before the week (STAND-IN 1). */
export async function listFor(week: { start: number }, ctx: any): Promise<string[]> {
  if (!ctx?.vhp || typeof ctx.blockAt !== "function") throw new NotYet("VS: no ruler data or block heights yet");
  const t0 = week.start - 2 * DAY;
  // VS-9: the card's entry gate (k >= minK, 10 blocks) is measured over the card's scored range, so the range must be a
  // game's size: one day, the 28,800 blocks that end just before t0 (a one-block range gave every producer k < 1 block,
  // so nobody had entry and the week-5 roster came out empty). The ruler only makes a card whose whole range is in the
  // data, so the range sits in the past, with the size window (W) the 7,200 blocks before it.
  const S1 = (await ctx.blockAt(t0)) - 1, S0 = S1 - DAY_BLOCKS + 1, L = S0 - 1;
  const card = ctx.vhp.card({ game: CARD.game, round: 10_000_000_000 + Number(ymd(t0)), window: { W0: L - CARD_BLOCKS + 1, W1: L, L, S0, S1 }, c: CARD.c, minK: CARD.minK,
    poolRule: CARD.poolRule, ownRule: CARD.ownRule, paying: CARD.paying, pooled: [...CARD.pooled] });
  return (card.producers as any[]).filter((p) => p.entry && p.a !== POOL).map((p) => p.a as string);
}

export const game: GameModule<RawPick, DayResult, VsInputs> = {
  slug: "vs",
  picks: { source: "picks-contract", gameId: V.GAME },

  // locksAt is the day's END, not the contract's real lock (5 minutes before the day, math.js locksAt): the kit wants a round's day
  // to be dayOf(locksAt) (KC-30; a time exactly at midnight belongs to the day before). The contract itself refuses later picks, so
  // no real pick is dropped by this.
  roundsFor(week): Round[] {
    const out: Round[] = [];
    for (let d = week.start; d < week.end; d += DAY) out.push({ id: `d${ymd(d)}`, day: d, locksAt: d + DAY, resolvesAt: d + DAY, pickRound: Math.floor(d / DAY) });
    return out;
  },

  async inputsFor(week, ctx) {
    const producers = await listFor(week, ctx);
    // R5-16: too short a list is "not yet", not a crash: the kit keeps recording the current week, warns, and turns it into an
    // owner error 6 h before the week (runtime: NotYet in the inputs step). makeRoster's own check stays as the backstop.
    if (new Set(producers).size < V.MIN_ROWS) throw new NotYet(`VS: only ${new Set(producers).size} producer(s) qualify for week ${week.week}'s list, at least ${V.MIN_ROWS} are needed; retried next run`);
    const rosters: Record<string, any> = {};
    for (let d = week.start; d < week.end; d += DAY) rosters[String(d)] = V.makeRoster({ week: week.week, day: d, pool: POOL, producers, madeAt: week.start - 2 * DAY });
    return { week: week.week, rosters };
  },

  async resultOf(round, _read, inputs, ctx) {
    const roster = inputs?.rosters?.[String(round.day)];
    if (!roster || !V.checkRoster(roster).ok) throw new Error(`VS: round ${round.id} has no valid roster in the inputs`);
    if (!ctx?.vhp || typeof ctx.blockAt !== "function") return PENDING;
    const card = ctx.vhp.card(await settingsFor(round.day, ctx.blockAt));
    const by = new Map<string, any>((card.producers as any[]).map((p) => [p.a, p]));
    const rows: Record<string, string | null> = {};
    for (const a of roster.rows) rows[a] = fp(by.get(a)?.fpct);
    // VS-2: no row for the pool node in the card is "not decided yet", never "everyone scores 0".
    if (!by.has(POOL)) return PENDING;
    return { round: ymd(round.day), node: fp(by.get(POOL)?.fpct), rows };
  },

  scoreRound(round, picks: Pick<RawPick>[], result, inputs): Score {
    const roster = inputs?.rosters?.[String(round.day)];
    if (!roster || !V.checkRoster(roster).ok) throw new Error(`VS: round ${round.id} has no valid roster in the inputs`);
    const out: Score = new Map();
    // VS-1: a pick for Monday or Tuesday is made before the week starts (picks open 2 days ahead); the kit refuses a score time
    // outside the week, so the time is clamped into [week start, the round's day] (as Fantasy does).
    const weekStart = Math.min(...Object.keys(inputs!.rosters).map(Number));
    for (const p of picks) {
      const n = (p.pick as any)?.number;
      const points = n === undefined ? 0 : V.scorePick(roster, n, { node: result.node, rows: result.rows });
      out.set(p.wallet, { points, at: points > 0 ? Math.min(round.day, Math.max(weekStart, p.at)) : 0 });
    }
    return out;
  },
};
void VOID;
