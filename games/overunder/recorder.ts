// Over/Under (game 16) on the Shared Game Kit. The kit does the reading, stakes, clock, files, pending → final, holds,
// boards, all-time, the vault file and alerts; this module supplies the week's rounds, the write-once roster with each
// producer's line (made 72 hours before the week from the VHP Ruler's cards), each day's result from the ruler, and the
// scoring. Every rule is in math.js; how a UTC day becomes a ruler card is in ruler-view.ts.
//
// Rounds: Monday to Saturday play days, then Sunday's fun round (Today and All time only), two kit rounds a day (A: rows
// 0 to 31, B: rows 32 to 63). Picks game 16: kind 3 number, time lock, round size 12 hours, lead 5 min, ahead 2 days.
// A day's picks are TWO numbers per wallet (D-296), decoded against the week's roster; there is no other way to read a
// pick (D-284).
// Nothing is ever guessed: while the ruler data or the block clock doesn't reach a day, the kit's NotYet keeps the round
// PENDING (or the roster waiting); a flagged card, or a roster producer missing from a card, stays PENDING too.
import { DAY } from "../../kit/recorder/clock.ts";
import { PENDING, NotYet, type GameModule, type Round, type Score } from "../../kit/recorder/types.ts";
import type { RawPick } from "../../kit/recorder/sources/picks-contract.ts";
import * as F from "./math.js";
import { CARD, dayCard, flagged, rowsOf, sourcesOf } from "./ruler-view.ts";

export const VAULT_GAME = F.GAME;            // one constant: Picks game 16 and vault game 16 are the same id (D-266)
export { CARD };

/** The week's write-once inputs (FC-9): the roster, with each producer's line, and where it came from. */
export type Roster = { v: number; start: number; cardRound: string; rows: { a: string; line: number }[]; id: string };
export type Inputs = { start: number; roster: Roster };
/** A day's result: its ruler round and each roster producer's [credited, expected, void] (millionths of a block).
 *  `flagged` / `fallback`: no usable card; every row is skipped that day. */
export type DayResult = { round: string; rows: Record<string, [string, string, boolean]>; flagged?: true; fallback?: true };

export const game: GameModule<RawPick, DayResult, Inputs> = {
  slug: "overunder",
  picks: { source: "picks-contract", gameId: VAULT_GAME },

  roundsFor(week): Round[] {
    // Two kit rounds a day (D-296): A holds the pick number for rows 0 to 31, B the number for rows 32 to 63, each its own
    // 12-hour Picks round (math.js pickRoundOf). locksAt = 1 ms into the day (the kit's dayOf rule; see Fantasy KC-30);
    // both numbers lock in the Picks contract before the day starts.
    return F.weekDays(week.start).flatMap((day) => [0, 1].map((half) => ({ id: F.roundIdOf(day, half), day, locksAt: day + 1, resolvesAt: day + DAY, pickRound: F.pickRoundOf(day, half) })));
  },

  /** The write-once roster (FC-9), made 72 hours before the week (Friday 00:00 UTC), so it is published a day before
   *  the first picks open (Saturday 00:00 UTC, Picks `ahead` = 2 days): a pick can never come before the roster that
   *  gives it meaning (D-284). The lines come from the newest ruler day card that isn't flagged, Thursday back to
   *  Friday before the week. A card that isn't ready throws the kit's NotYet (the roster waits and the next run tries
   *  again). The kit re-makes it at the week's end: the same cards must give the same bytes, else the week is held. */
  async inputsFor(week, ctx) {
    const src = sourcesOf(ctx);
    for (const day of F.rosterDays(week.start)) {
      const c = await dayCard(day, src);
      if (flagged(c)) continue;
      const roster = F.makeRoster(week.start, c.round, c.producers.map((p) => ({ a: p.a, expected: p.expected, entry: p.entry, void: p.void })));
      return { start: week.start, roster };
    }
    throw new NotYet(`not yet: roster for week ${week.week}: all ${F.rosterDays(week.start).length} candidate ruler cards are flagged`);
  },

  /** A day's result from its ruler card, for the roster's producers only. PENDING while a roster producer has no row
   *  (the ruler's `include` gives every listed producer one; until then such a day waits, never a silent skip). A
   *  FLAGGED card waits until Tuesday 00:00 UTC after the week; if it is still flagged then, every row is skipped. */
  async resultOf(round, _read, inputs, ctx) {
    if (!inputs) return PENDING;
    const roster = F.checkRoster(inputs.roster, inputs.start);
    const src = sourcesOf(ctx), pool = roster.rows.map((r) => r.a);
    const zeros = () => Object.fromEntries(pool.map((a) => [a, ["0", "0", true] as [string, string, boolean]]));
    let c;
    try { c = await dayCard(round.day, src, CARD, pool); }
    catch (e) {
      // No ruler card at all: after the 48-hour grace the day is skipped for every row, recorded and alerted by the kit
      // (ctx.fallback). Within the grace, or while the kit has no fallback, or when this run has no ruler data, it waits.
      if (!(e instanceof NotYet) || !src.fallback || !src.loaded) throw e;
      await src.blockAt(round.day + DAY + F.NO_CARD_GRACE);
      await src.fallback(`Over/Under ${F.ymd(round.day)}: no VHP Ruler card 48 hours after the day; every row is skipped`);
      return { round: F.ymd(round.day), fallback: true, rows: zeros() };
    }
    if (flagged(c)) {
      await src.blockAt(F.flaggedCutoff(inputs.start));
      return { round: c.round, flagged: true, rows: zeros() };
    }
    const by = rowsOf(c), rows: DayResult["rows"] = {};
    for (const a of pool) {
      const r = by[a];
      if (!r) return PENDING;
      rows[a] = [String(r.credited), String(r.expected), r.void === true];
    }
    return { round: c.round, rows };
  },

  /** Points for every wallet that picked that day (0 included): 1 per row the wallet called right. The score time (the
   *  D-152 tie-break) is the pick's time when it scored, else 0, kept inside the week (a pick made before the week
   *  opens counts from its start: the kit's NK-19 window; the same rule as Fantasy). The roster is the week's write-once one and nothing
   *  else: checkRoster refuses anything that is not exactly the published roster for this week. */
  scoreRound(round, picks, result, inputs): Score {
    if (!inputs) throw new Error("scoreRound: no roster (inputs)");
    const roster = F.checkRoster(inputs.roster, inputs.start);
    if (round.day < inputs.start || round.day >= inputs.start + F.PLAY_DAYS * DAY) throw new Error(`scoreRound: day ${F.ymd(round.day)} is not in the roster's week`);
    const outcomes = F.dayOutcomes(roster, Object.fromEntries(Object.entries(result.rows)));
    const half = F.halfOfId(round.id), out: Score = new Map();
    for (const p of picks) {
      const points = F.scorePick(roster, (p.pick as RawPick)?.number as string | number | undefined, outcomes, half);
      out.set(p.wallet, { points, at: points > 0 ? Math.min(round.day, Math.max(inputs.start, p.at)) : 0 });
    }
    return out;
  },
};
