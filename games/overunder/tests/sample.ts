// Over Under (TEST FIXTURE): the conformance sample for `npm run game:check -- overunder`. Vault week 6 (Mon 30 Nov - Sun 6 Dec
// 2026) on a made-up ruler chain: the kit's generator (kit/testing/ruler-fixture.ts, one block every 3 s from block 100,000)
// with 16 producers of equal VHP instead of five. Each producer's k is then about 900 blocks a game, under the luck cap
// (1,000), so no card needs the cap's per-block draws and the check runs in seconds (with five producers every card is
// drawn block by block and the sandbox runs out of time). Wallet S picks Over, F picks Under in two Wednesday games.
import { fakeNode, world, type World } from "../../../kit/testing/fake-nodes.ts";
import { at, DAY, HOUR } from "../../../kit/testing/fake-clock.ts";
import { createHash } from "node:crypto";
import { FROM } from "../../../kit/testing/ruler-fixture.ts";
import { rulerLib } from "../../../kit/recorder/sources/vhp-ruler.ts";
import type { Sample } from "../../../kit/testing/conformance.ts";

const LETTERS = "ABCDEFGHJKLMNPQR";
export const PRODUCERS = [...LETTERS].map((c) => "1" + c.repeat(33));
const UNIT = 10n ** 15n, BURN = 408000000n, PRE = 15 * 28800, VHP = 100;
function ledger(extraBlocks: number): any {
  const N = PRE + extraBlocks, n = PRODUCERS.length;
  let s = 7n;
  const next = () => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number(s >> 11n) / 2 ** 53; };
  const who: string[] = new Array(N), ids: string[] = new Array(N);
  const bal = new Map(PRODUCERS.map((a) => [a, BigInt(VHP) * UNIT])), deltas: any[] = [];
  for (let i = 0; i < N; i++) {
    who[i] = PRODUCERS[Math.min(n - 1, Math.floor(next() * n))];
    ids[i] = "0x1220" + createHash("sha256").update(`kit ruler block ${FROM + i}`).digest("hex");
    deltas.push({ h: FROM + i, a: who[i], d: -BURN, inc: 0n });
    bal.set(who[i], bal.get(who[i])! - BURN);
  }
  const to = FROM + N - 1;
  return rulerLib().ledger({ from: FROM, to, signers: who, ids, deltas, anchors: Object.fromEntries([...bal].map(([a, v]) => [a, { h: to, v }])), bad: [], rebuilt: [], pending: [] });
}

export const S = "1SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS", F = "1FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
// A paying card needs 14 d 6 h of data before its moment, and a schedule card's moment is about 16 h before its start,
// so the chain starts 17 days before the week; it runs 10 days past its 15-day history, to past Sunday's last game.
const WEEK = 6, BLOCK = 3000, T_FROM = at(WEEK) - 17 * DAY;      // block FROM's time
const blockOf = (t: number) => FROM + Math.floor((t - T_FROM) / BLOCK);
const EXTRA = 10 * 28800;
const LAST = FROM + PRE + EXTRA - 1;
const SAT_END = at(WEEK) + 7 * DAY;
const SLOT = 1800000, WEEK0 = 1792368000000;
const N0 = Math.round((at(WEEK) + 2 * DAY + 10 * HOUR - WEEK0) / SLOT);   // Wed 2 Dec, 10:00 UTC
const startOf = (n: number) => WEEK0 + n * SLOT;

export function sampleWorld(t: number, decided: boolean): World {
  const wd = world(t);
  const pick = (who: string, n: number, x: string) => ({ player: who, pick: { producers: [], number: x, time: String(startOf(n) - 10 * 60000) } });
  const pr = (n: number) => startOf(n) / SLOT;                     // the Picks contract round of a start (round_size 30 min, offset 0)
  wd.picks = { [`16:${pr(N0)}`]: [pick(S, N0, "1"), pick(F, N0, "2")], [`16:${pr(N0 + 1)}`]: [pick(S, N0 + 1, "2")] };
  wd.gamePlayers = { [S]: { week_stake: "500000000", peak_stake: "500000000" }, [F]: { week_stake: "0", peak_stake: "0" } };
  const top = decided ? t : Math.min(t, SAT_END - 60000);
  wd.lib = Math.min(LAST, blockOf(top));
  wd.blockT0 = T_FROM - FROM * BLOCK;
  return wd;
}

export function sample(): Sample {
  let decided = false;
  const now = { t: 0 };
  const w = () => sampleWorld(now.t, decided);
  // hours 0 and 1 are inside the schedule windows of N0 and N0 + 1 (213 to 140 minutes before their starts); then the week ends
  const chain = (i: number) => (i === 0 ? startOf(N0) - 200 * 60000 : i === 1 ? startOf(N0 + 1) - 200 * 60000 : at(WEEK + 1, 0, 1) + (i - 2) * HOUR);
  return {
    week: WEEK,
    nodes: (t) => { now.t = t; return [fakeNode("a", w), fakeNode("b", w)]; },
    vhpLedger: ledger(EXTRA),
    checkAt: chain(2),                                   // the direct checks run after the week
    undecided: [],
    hours: { chain, job: (i) => chain(i) + 5 * 60000, count: 8, decideAfter: 3, decide: () => { decided = true; } },
  };
}
