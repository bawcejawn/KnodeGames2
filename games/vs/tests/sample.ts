// Knode Games VS (TEST FIXTURE): the conformance sample for `npm run game:check -- vs`. Vault week 6 (Mon 30 Nov - Sun 6 Dec
// 2026) on the kit's made-up ruler chain (kit/testing/ruler-fixture.ts: five producers, one block every 3 s from block
// 100,000). The pool node is not on that chain, so its row is empty and every matchup is skipped: the fixture proves the
// plumbing (rosters in the inputs file, the day's card, the pick number), not the scoring (games/vs/tests/math.test.mjs).
// Wallet S (staked) picks number 3; F (free) picks number 0 ("Knode Games vs All") on the first two days.
import { fakeNode, world, type World } from "../../../kit/testing/fake-nodes.ts";
import { at, DAY, HOUR } from "../../../kit/testing/fake-clock.ts";
import { createHash } from "node:crypto";
import { P, FROM } from "../../../kit/testing/ruler-fixture.ts";
import { rulerLib } from "../../../kit/recorder/sources/vhp-ruler.ts";
import type { Sample } from "../../../kit/testing/conformance.ts";

/** The kit's ruler fixture (five producers, a block every 3 s, a deterministic generator), four more made-up producers (M-748)
 *  and the pool node (the Vault) as the tenth producer, so the day's card has the pool node's row. Same generator as kit/testing/ruler-fixture.ts. */
const POOL = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
// M-748: four more producers (made-up addresses), so the week's list reaches V.MIN_LIST (8): 9 producers + the pool node.
const MORE = ["1GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", "1HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH", "1JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ", "1KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK"];
const PRODUCERS = [...P, ...MORE, POOL], VHPS = [400, 250, 200, 140, 1, 120, 110, 100, 90, 150];
const UNIT = 10n ** 15n, BURN = 408000000n, PRE = 15 * 28800;
function ledger(extraBlocks: number): any {
  const N = PRE + extraBlocks, tot = VHPS.reduce((a, b) => a + b);
  let s = 7n;
  const next = () => { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number(s >> 11n) / 2 ** 53; };
  const who: string[] = new Array(N), ids: string[] = new Array(N);
  const bal = new Map(PRODUCERS.map((a, i) => [a, BigInt(VHPS[i]) * UNIT])), deltas: any[] = [];
  for (let i = 0; i < N; i++) {
    let x = next() * tot, j = 0;
    while (x >= VHPS[j]) { x -= VHPS[j]; j++; }
    who[i] = PRODUCERS[j];
    ids[i] = "0x1220" + createHash("sha256").update(`kit ruler block ${FROM + i}`).digest("hex");
    deltas.push({ h: FROM + i, a: who[i], d: -BURN, inc: 0n });
    bal.set(who[i], bal.get(who[i])! - BURN);
  }
  const to = FROM + N - 1;
  return rulerLib().ledger({ from: FROM, to, signers: who, ids, deltas, anchors: Object.fromEntries([...bal].map(([a, v]) => [a, { h: to, v }])), bad: [], rebuilt: [], pending: [] });
}

export const S = "1SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS", F = "1FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
const WEEK = 6, BLOCK = 3000, T_FROM = at(WEEK) - 19 * DAY;      // block FROM's time
const blockOf = (t: number) => FROM + Math.floor((t - T_FROM) / BLOCK);
const EXTRA = 12 * 28800;                                           // ledger: 15 + 12 days from FROM, to a day after the week
const LAST = FROM + 15 * 28800 + EXTRA - 1;   // the list card (a paying card) needs 14 d 6 h of data before its moment (about 3 d 6 h before the week: its scored range is the day before week start - 2 d), so the chain starts 19 days before the week
const SAT_END = at(WEEK) + 7 * DAY;

export function sampleWorld(t: number, decided: boolean): World {
  const wd = world(t);
  const d0 = Math.floor(at(WEEK) / DAY);
  const pick = (who: string, d: number, n: string) => ({ player: who, pick: { producers: [], number: n, time: String((d0 + d) * DAY - HOUR) } });
  wd.picks = {};
  const sPicks = ["3", "3", "3", "3", "3", "3", "3"];
  sPicks.forEach((a, d) => { (wd.picks![`17:${d0 + d}`] ??= []).push(pick(S, d, a)); });
  (wd.picks[`17:${d0}`] ??= []).push(pick(F, 0, "0"));
  (wd.picks[`17:${d0 + 1}`] ??= []).push(pick(F, 1, "0"));
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
  const chain = (i: number) => (i === 0 ? at(WEEK) - 47 * HOUR : at(WEEK + 1, 0, 1) + (i - 1) * HOUR);   // hour 0: the roster file is made 47 h before the week
  return {
    week: WEEK,
    nodes: (t) => { now.t = t; return [fakeNode("a", w), fakeNode("b", w)]; },
    vhpLedger: ledger(EXTRA),
    checkAt: chain(1),                                   // the direct checks run after the week (hour 0 is before it)
    undecided: ["d20261206"],
    hours: { chain, job: (i) => chain(i) + 5 * 60000, count: 8, decideAfter: 2, decide: () => { decided = true; } },
  };
}
