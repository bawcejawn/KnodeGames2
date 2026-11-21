// kit-rolling-example (TEST FIXTURE): the conformance sample. Vault week 4's last round (Sun 23:30 UTC, n = 4×336 + 335)
// gets its schedule file at the Sunday 20:00 run; A picks Under (2) and is right (odd round), B picks Over. Every other
// round of the week has no schedule file and is cancelled (void). Hourly to Monday 15:00, when the week goes final.
import { fakeNode, world } from "../../../../fake-nodes.ts";
import { at, HOUR } from "../../../../fake-clock.ts";
import type { Sample } from "../../../../conformance.ts";

export const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const N = 4 * 336 + 335, START = at(5) - 30 * 60000, LOCK = START - 5 * 60000;

export function sample(): Sample {
  const now = { t: 0 };
  const w = () => {
    const x = world(now.t);
    x.gamePlayers = { [A]: { week_stake: "500000000", peak_stake: "500000000" }, [B]: { week_stake: "0", peak_stake: "0" } };
    x.picks = { [`249:${N}`]: [{ player: A, pick: { n: 2, time: String(LOCK - 600000) } }, { player: B, pick: { n: 1, time: String(LOCK - 500000) } }] };
    return x;
  };
  const chain = (i: number) => at(5) - 4 * HOUR + i * HOUR;   // from Sun 22 Nov 20:00 UTC, hourly
  return {
    week: 4,
    nodes: (t) => { now.t = t; return [fakeNode("a", w), fakeNode("b", w)]; },
    undecided: [],
    hours: { chain, job: (i) => chain(i) + 5 * 60000, count: 21, decideAfter: 0, decide: () => {} },
  };
}
