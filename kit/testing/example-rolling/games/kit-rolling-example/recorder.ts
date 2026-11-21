// A TEST FIXTURE, not a game: the smallest rolling-rounds GameModule (PR #38), for the kit's conformance suite. Its
// settings are its game.json's; the grid starts at the vault's genesis (game-data/deployment.json).
import { rollingRounds } from "../../../../recorder/clock.ts";
import type { GameModule } from "../../../../recorder/types.ts";

const GRID = { genesis: 1792368000000, rolling: { roundMin: 30, gameMin: 720, leadMin: 5, scheduleFromMin: 213, scheduleToMin: 183, cancelAfterMin: 135 } };

export const game: GameModule<{ n?: number }, number, unknown> = {
  slug: "kit-rolling-example",
  picks: { source: "picks-contract", gameId: 249 },
  roundsFor(week) { return rollingRounds(week, GRID, (n) => n); },
  async scheduleFor(n, start, ctx) {
    const st = await ctx.read.read("get_state", {});
    // Not the previous round's file (Repo Lens 5 KR-1): only the count of earlier schedules, which a missing one can't break.
    return { n, start, line: 100 + (n % 7), owner: String(st?.config?.owner ?? ""), earlier: ctx.schedules ? ctx.schedules.size : 0 };
  },
  async resultOf(round, _read, _inputs, ctx) {
    const s = ctx?.schedule as { n: number } | undefined;
    if (!s) throw new Error(`round ${round.id}: no schedule`);
    return s.n % 2 === 0 ? 1 : 2;
  },
  scoreRound(round, picks, result) {
    return new Map(picks.map((p) => [p.wallet, Number(p.pick.n) === result ? { points: 1, at: round.locksAt } : { points: 0, at: 0 }]));
  },
};
