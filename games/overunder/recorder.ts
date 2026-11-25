// Over Under (game 16, TEST): the game's own part of the recorder, a rolling GameModule on the Shared Game Kit (#38).
// A new game starts every 30 minutes (:00 and :30 UTC): one producer, 14,400 blocks from blockAt(start), one Picks round.
// Picks 1 = Over, 2 = Under; no changes. The kit makes each round's write-once schedule file (3 h 33 min to 2 h 20 min before
// the start) from scheduleFor: who plays (the queue, math.js step; the queue travels in every file) and the line
// (form-based, D-383). A round with no file by 2 h 15 min before its start is cancelled for everyone by the kit (D-344).
// Every rule is in math.js.
//
// STAND-INS (marked; a test pins each equal to the Ruler's): a game module can't load the Ruler's helpers (the kit gives it
// the ruler only as ctx.vhp.card), so: (1) the list = producers with the card's entry flag (minK 10), not the pool node;
// the Ruler's listAt needs the kit to expose it; (2) Unreliable producers (form below 80%, the Ruler's isUnreliable) are
// left out, always (math.js EXCLUDE_UNRELIABLE): a module can't read a GitHub variable, so the switch
// OVERUNDER_EXCLUDE_UNRELIABLE needs kit support first; (3) forecastExpected and medianLineHalves in math.js are copies of
// the Ruler's; (4) the card settings are the Ruler's for game 16 (c "500000", minK 10, poolRule "min", ownRule "spot",
// paying true, pooled = the Vault), without noVoid (the kit's card settings don't allow it yet).
import { PENDING, VOID, NotYet, type GameModule, type Round, type Score, type Pick } from "../../kit/recorder/types.ts";
import type { RawPick } from "../../kit/recorder/sources/picks-contract.ts";
import { rollingRounds } from "../../kit/recorder/clock.ts";
import * as R from "./math.js";

const POOL = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
const CARD_BLOCKS = 7200;                                       // the card's size window: the 6 hours before the lock
const CARD = Object.freeze({ game: R.GAME, c: "500000", minK: 10, poolRule: "min", ownRule: "spot", paying: true, pooled: [POOL] });
const ROLLING = { roundMin: 30, gameMin: 720, leadMin: 5, scheduleFromMin: R.SCHEDULE_FROM_MIN, scheduleToMin: R.SCHEDULE_TO_MIN, cancelAfterMin: R.CANCEL_AFTER_MIN };
const SIX_H = 6 * 3_600_000;
/** The kit's grid (kit/recorder/clock.ts rollingRounds): round n starts at genesis + n x 30 min, id r#####, counted for the
 *  UTC day and the vault week of its START. Its Picks round is the contract's own: game 16 has round_size 30 min and
 *  offset 0, so the round of a start is start / 30 min (math.js roundOfStart), not n. */
export const gridRounds = (span: { start: number; end: number }): Round[] =>
  rollingRounds(span, { genesis: R.WEEK0, rolling: ROLLING }, (_n, start) => R.roundOfStart(start));

export type OUResult = { outcome: "over" | "under" | "skip"; producer: string; line: number };

/** One run's cards, by their settings (a card is a pure function of the run's ruler data and its settings, so making it
 *  twice gives the same bytes): the same card asked for again in the same run is not made again. Keyed by the run's
 *  ctx.vhp, so nothing is kept from one run to the next. */
/** The 6-hour mark a start's schedule card ends at (see scheduleFor). */
export const markOf = (start: number) => Math.floor((start - (R.SCHEDULE_FROM_MIN + 30) * R.MIN) / SIX_H) * SIX_H;
const made = new WeakMap<object, Map<string, any>>();
function cardAt(ctx: any, n: number, w0: number, w1: number, l: number, s0: number, s1: number) {
  if (!ctx?.vhp) throw new NotYet("Over Under: no ruler data yet");
  const settings = { game: CARD.game, round: n, window: { W0: w0, W1: w1, L: l, S0: s0, S1: s1 }, c: CARD.c, minK: CARD.minK,
    poolRule: CARD.poolRule, ownRule: CARD.ownRule, paying: CARD.paying, pooled: [...CARD.pooled] };
  let run = made.get(ctx.vhp);
  if (!run) { run = new Map(); made.set(ctx.vhp, run); }
  const key = JSON.stringify(settings);
  if (!run.has(key)) run.set(key, ctx.vhp.card(settings));      // a NotYet or a read failure is never kept
  return run.get(key);
}
const asBig = (x: unknown) => BigInt(x as any);

export const game: GameModule<RawPick, OUResult, unknown> = {
  slug: "overunder",
  picks: { source: "picks-contract", gameId: R.GAME },

  roundsFor(week) { return gridRounds(week); },

  async scheduleFor(n, start, ctx) {
    if (typeof ctx.blockAt !== "function") throw new NotYet("Over Under: no block heights yet");
    // Everything is read at fixed times, never "the latest". The ruler only makes a card once its whole scored range is
    // in the data, so the card this file is made from sits in the past. Its scored range is the 14,400 blocks that end at
    // the last 6-hour mark (00, 06, 12, 18 UTC) at least 4 h 3 min before the start (30 minutes before the window opens);
    // its size window is the 7,200 blocks before that. Every start with the same mark uses the same card (one card per
    // 6 hours, card round = the mark's number). Its k and form make the line; the game is scored later on a card with
    // the same size window and the game's own 14,400 blocks (resultOf), which gives the same k and form, so the line in
    // the file can be re-checked from the scored card.
    const mark = markOf(start);
    const s1 = (await ctx.blockAt(mark)) - 1;
    const s0 = s1 - R.GAME_BLOCKS + 1, l = s0 - 1, w1 = l, w0 = l - CARD_BLOCKS + 1;
    const card = cardAt(ctx, mark / SIX_H, w0, w1, l, s0, s1);
    const listed: string[] = (card.producers as any[]).filter((p) => p.entry && p.a !== POOL && !(R.EXCLUDE_UNRELIABLE && R.isUnreliable(p))).map((p) => p.a);
    // The queue (Repo Lens 5 KR-1): every schedule file carries the queue as it stood after its own game. This start
    // continues from the LATEST earlier file that exists, so a missing file (a cancelled start, D-344) changes nothing:
    // the queue is exactly as if that start never happened. Running games come from every earlier file.
    const bodies = [...(ctx.schedules ?? new Map()).values()]
      .filter((b: any) => b && b.entry && R.checkEntry(b.entry).ok && b.entry.start < start)
      .sort((a: any, b: any) => a.entry.start - b.entry.start);
    const games = bodies.map((b: any) => ({ producer: b.entry.producer, start: b.entry.start }));
    const prev: any = bodies.length ? bodies[bodies.length - 1] : null;
    const state = prev ? R.checkState(prev.state) : R.emptyState();
    const r = R.step(state, listed, start, games);
    if (r.producer === null) throw new NotYet("Over Under: nobody can play this start");
    const row = (card.producers as any[]).find((p) => p.a === r.producer);
    if (!row) throw new Error(`Over Under: ${r.producer} is not in the card`);
    const form = asBig(row.form);
    const line = Number(R.medianLineHalves(R.forecastExpected({ k: asBig(row.k), form })));
    const entry = R.makeEntry({ start, producer: r.producer, w0, w1, l, line, form: Number(form), madeAt: ctx.now });
    return { entry, state: r.state };
  },

  async resultOf(round, _read, _inputs, ctx): Promise<OUResult | typeof PENDING | typeof VOID> {
    const e = (ctx as any)?.schedule?.entry;
    if (!e || !R.checkEntry(e).ok) return VOID;                                   // no valid schedule file: cancelled
    if (!ctx?.vhp || typeof ctx.blockAt !== "function") return PENDING;
    const s0 = await ctx.blockAt(e.start);
    // The same card round as the schedule card (the ruler draws the card's moment from the round), so the same size
    // window gives the same moment, k and form, over the game's own blocks.
    const card = cardAt(ctx, markOf(e.start) / SIX_H, e.w0, e.w1, e.l, s0, s0 + R.GAME_BLOCKS - 1);
    const row = (card.producers as any[]).find((p) => p.a === e.producer);
    if (!row) return VOID;
    // The line in the file must be the helper's value from this SCORED card's row; otherwise the game is cancelled.
    const helper = Number(R.medianLineHalves(R.forecastExpected({ k: asBig(row.k), form: asBig(row.form) })));
    if (!R.lineMatches(e, helper)) return VOID;
    if (row.credited === null || row.credited === undefined) return PENDING;
    return { outcome: R.outcomeOf(asBig(row.credited), e.line, row.void === true), producer: e.producer, line: e.line } as OUResult;
  },

  scoreRound(round: Round, picks: Pick<RawPick>[], result): Score {
    const out: Score = new Map();
    for (const p of picks) {
      const points = R.pointOf(Number((p.pick as any)?.number), result.outcome);
      // NK-19: a score time must lie inside the vault week, but a pick for a game in the week's first 2 hours is made before it.
      out.set(p.wallet, { points, at: points > 0 ? Math.max(p.at, R.WEEK0 + R.weekOfStart(Number(round.pickRound) * R.SLOT) * R.WEEK_MS) : 0 });
    }
    return out;
  },
};
