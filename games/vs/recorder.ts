// Knode Games VS (game 17): the game's own part of the recorder, a GameModule on the Shared Game Kit (D-146).
// One round a day (UTC). The pool node plays every roster producer; a pick is one number (bit i = producer i beats the pool
// node, 0 = "Knode Games vs All"). Every rule lives in math.js; this file only asks the kit for the data.
//
// RESULT: the day's ruler card (CARD below, window from block heights): every roster producer's fpct and the pool node's.
// INPUTS: the week's seven rosters, one write-once inputs file made before picks open (inputsLeadHours 48). Each day's roster
//   is the same list for the whole week, taken from one ruler card that ends 48 h before the week starts (see STAND-INS).
//
// STAND-INS (marked, swapped when the Ruler's #33 merges; a test pins the swap): (1) the roster list is "producers in the
//   card's field" (card entry flag, minK 10); the Ruler's listAt/isUnreliable replace it. (2) the pool node's row is read from
//   the same card; the Ruler's noVoid replaces it. (3) the card settings (c, poolRule, ownRule) are copied from Survivor's
//   card and wait for the Ruler's confirmation.
import { PENDING, VOID, NotYet, type GameModule, type Round, type Score, type Pick } from "../../kit/recorder/types.ts";
import type { RawPick } from "../../kit/recorder/sources/picks-contract.ts";
import * as V from "./math.js";

const POOL = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
const DAY = V.DAY;
const CARD_BLOCKS = 7200;                                      // the card's size window: the 6 hours before the lock
const CARD = Object.freeze({ game: V.GAME, c: "500000", minK: 10, poolRule: "min", ownRule: "spot", paying: false, pooled: [POOL] });

export type DayResult = { round: string; node: string | null; rows: Record<string, string | null> };
export type VsInputs = { week: number; rosters: Record<string, any> };

const ymd = (day: number) => new Date(day).toISOString().slice(0, 10).replaceAll("-", "");
const fp = (x: unknown) => (x === null || x === undefined ? null : String(x));

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
  const S0 = await ctx.blockAt(t0), L = S0 - 1;
  const card = ctx.vhp.card({ game: CARD.game, round: 10_000_000_000 + Number(ymd(t0)), window: { W0: L - CARD_BLOCKS + 1, W1: L, L, S0, S1: S0 }, c: CARD.c, minK: CARD.minK,
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
    return { round: ymd(round.day), node: fp(by.get(POOL)?.fpct), rows };
  },

  scoreRound(round, picks: Pick<RawPick>[], result, inputs): Score {
    const roster = inputs?.rosters?.[String(round.day)];
    if (!roster || !V.checkRoster(roster).ok) throw new Error(`VS: round ${round.id} has no valid roster in the inputs`);
    const out: Score = new Map();
    for (const p of picks) {
      const n = (p.pick as any)?.number;
      const points = n === undefined ? 0 : V.scorePick(roster, n, { node: result.node, rows: result.rows });
      out.set(p.wallet, { points, at: points > 0 ? p.at : 0 });
    }
    return out;
  },
};
void VOID;
