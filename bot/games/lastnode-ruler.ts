// Knode Games — Last Node Standing on the shared VHP ruler (owner, 11 Nov 2026; Library, 12 Nov: ruler-only from the
// game's first live week, no switch variable; docs/VHP-RULER.md "How a game uses it").
//
// One event a day. Its ruler cards:
//   - the FIELD card (not paying): made from the hour of blocks before the field time (10:00 UTC the day before the
//     event, so it is published before picks open at 13:55). The field is every producer with `entry` on it, the
//     biggest 23 by the card's `own`. It decides only who is in the race; it scores nothing.
//   - one HOUR card (paying) for every hour of the race: scoring window [S0, S1] = the hour's own blocks (by block time,
//     read on both nodes), card window = the 1,200 blocks just before it (L = S0 − 1). No rebalance inside an hour; the
//     next hour has its own card (VHP added in an hour counts from the next hour's card).
// The cut rule is KLastNode.rulerCutsFrom (lastnode-math.js): each hour, every void node or node without entry goes, and
// of the rest the lowest fpct goes.
//
// R<day>.json (written next to D<day>.json): { v: 1, day, field: Entry | null, hours: Entry[] }, Entry = { round, window,
//   card (the ruler's canonical card JSON text) }. The day file keeps only what the page needs (the field's addresses
//   and own, each hour's rows for the field nodes); the publish job (lastnode.yml) rebuilds every card with
//   vhp_ruler.recompute from the settings below (its own copy, a test keeps them equal), never from the card, and checks
//   the day file against the cards.
import * as fs from "node:fs";
import * as path from "node:path";

await import("../../ruler/vhp-ruler.js");
await import("../../ruler/vhp-data.js");
const R: any = (globalThis as any).KRuler, D: any = (globalThis as any).KVhpData;

export const VAULT_ADDR = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr";
/** Last Node's ruler settings: never read from a card. lastnode.yml has the same values (tested). */
export const RULER = Object.freeze({ game: 13, c: "500000", minK: 10, poolRule: "min", ownRule: "spot", pooled: Object.freeze([VAULT_ADDR]) });
/** The card window: the 1,200 blocks (about an hour) just before the cards' scoring window. */
export const CARD_BLOCKS = 1200;
/** The field card's own scoring window is a stand-in hour of 1,200 blocks after it (only `entry` is read from it). */
export const FIELD_BLOCKS = 1200;
export const MAX_FIELD = 23;
/** The field time: 10:00 UTC the day before the event (picks open at 13:55 UTC; vhp-data runs about 1–2 hours behind). */
export const FIELD_LEAD_MS = 28 * 3600000;

export type Win = { W0: number; W1: number; L: number; S0: number; S1: number };
export type Entry = { round: string; window: Win; card: string };
export type RulerDay = { v: 1; day: string; field: Entry | null; hours: Entry[] };
export type Row = { fpct: string | null; entry: boolean; void: boolean; credited: string; expected: string };

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`; };
/** Rounds (decimal text, unique in game 13; they seed the card time): an hour card yyyymmddhh0 (the hour's start), the
 *  field card yyyymmdd991 (the event's day). */
export const hourRound = (t0: number) => `${ymd(t0)}${p2(new Date(t0).getUTCHours())}0`;
export const fieldRound = (start: number) => `${ymd(start)}991`;
/** The field time of an event that starts at `start`. */
export const fieldTime = (start: number) => start - FIELD_LEAD_MS;

/** An hour card's window from the hour's own blocks [S0, S1]. */
export function hourWindow(S0: number, S1: number): Win {
  if (!Number.isSafeInteger(S0) || !Number.isSafeInteger(S1) || S1 < S0) throw new Error("an hour's blocks [S0, S1] are needed");
  const L = S0 - 1;
  return { W0: L - CARD_BLOCKS + 1, W1: L, L, S0, S1 };
}
/** The field card's window from the last block before the field time (`last`). */
export function fieldWindow(last: number): Win {
  if (!Number.isSafeInteger(last) || last < CARD_BLOCKS) throw new Error("the field card needs the last block before its time");
  return { W0: last - CARD_BLOCKS + 1, W1: last, L: last, S0: last + 1, S1: last + FIELD_BLOCKS };
}
/** Last Node's settings for one card (what recompute needs: every key). The field card doesn't pay. */
export const settingsFor = (round: string, window: Win, paying: boolean) => ({ game: RULER.game, round, window, c: RULER.c, minK: RULER.minK, poolRule: RULER.poolRule, ownRule: RULER.ownRule, paying, pooled: [...RULER.pooled] });

/** The field from a field card: entry, the biggest MAX_FIELD by own (equal own: by address). */
export function fieldOf(cardText: string): { a: string; own: string }[] {
  const ps = (JSON.parse(cardText).producers || []).filter((p: any) => p.entry === true);
  ps.sort((x: any, y: any) => { const a = BigInt(x.own), b = BigInt(y.own); return a > b ? -1 : a < b ? 1 : x.a < y.a ? -1 : x.a > y.a ? 1 : 0; });
  return ps.slice(0, MAX_FIELD).map((p: any) => ({ a: p.a, own: String(p.own) }));
}
/** An hour's rows for the given nodes, from its scored card (a node not on the card has no row). */
export function rowsOf(cardText: string, nodes: string[]): Record<string, Row> {
  const by = new Map((JSON.parse(cardText).producers || []).map((p: any) => [p.a, p]));
  const out: Record<string, Row> = {};
  for (const a of nodes) {
    const p: any = by.get(a);
    if (p) out[a] = { fpct: p.fpct === null || p.fpct === undefined ? null : String(p.fpct), entry: p.entry === true, void: p.void === true, credited: String(p.credited), expected: String(p.expected) };
  }
  return out;
}

/** The vhp-data folder as a ruler ledger: every hour checked (hash chain, balances), as the ruler's own tools do. */
export function loadLedger(dir: string): any {
  const texts = new Map<number, string>();
  const dd = path.join(dir, "d"), hd = path.join(dir, "h");
  for (const f of fs.existsSync(dd) ? fs.readdirSync(dd) : []) {
    if (!/^(0|[1-9][0-9]*)\.json$/.test(f)) continue;
    const day = JSON.parse(fs.readFileSync(path.join(dd, f), "utf8"));
    day.hours.forEach((h: any, i: number) => texts.set(day.n * 24 + i, D.canon(h)));
  }
  for (const f of fs.existsSync(hd) ? fs.readdirSync(hd) : []) if (/^(0|[1-9][0-9]*)\.json$/.test(f)) texts.set(Number(f.slice(0, -5)), fs.readFileSync(path.join(hd, f), "utf8"));
  const ns = [...texts.keys()].sort((a, b) => a - b), hours: any[] = [], checks: any[] = [];
  if (!ns.length) throw new Error("the vhp-data folder has no hours");
  let prev = "";
  for (const n of ns) {
    const t = texts.get(n)!, c = prev === "" ? D.checkKept(t) : D.checkHour(prev, t);
    if (!c.ok) throw new Error(`vhp-data h/${n}: ${c.why}`);
    checks.push(c); hours.push(JSON.parse(t)); prev = t;
  }
  return R.ledger(D.timelineFrom(hours, checks));
}

/** A card, made (and scored when `score`), or why not yet: { card } | { note }. A note starting "not yet" is tried again
 *  next run; anything else is a real problem (reported). */
export function cardFor(L: any, round: string, window: Win, paying: boolean): { card: string } | { note: string } {
  if (!L) return { note: "not yet: the ruler's data isn't available this run" };
  const need = paying ? window.S1 + R.DELAY : window.L + R.SEED_AFTER;
  if (need > L.to) return { note: `not yet: the ruler's data reaches block ${L.to}, this card needs ${need}` };
  try {
    const made = R.makeCard(L, { ...settingsFor(round, window, paying), c: BigInt(RULER.c), pooled: [...RULER.pooled] });
    return { card: R.cardJson(paying ? R.scoreCard(L, made) : made) };
  } catch (e) {
    const m = (e as Error).message;
    return { note: /not yet/.test(m) ? m : `the ruler couldn't make this card: ${m}` };
  }
}

export const emptyRulerDay = (day: string): RulerDay => ({ v: 1, day, field: null, hours: [] });
export function readRulerDay(dir: string | undefined, day: string): RulerDay {
  if (!dir) return emptyRulerDay(day);
  const f = path.join(dir, `R${day}.json`);
  if (!fs.existsSync(f)) return emptyRulerDay(day);
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!j || j.v !== 1 || j.day !== day || !Array.isArray(j.hours)) throw new Error(`R${day}.json isn't a ruler day file`);
  return j;
}
