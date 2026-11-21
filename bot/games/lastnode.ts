/**
 * Last Node Standing recorder (run every 5 minutes during event hours by .github/workflows/lastnode.yml; read-only on
 * the chain, holds no key). The rules are in lastnode-math.js, the same file the page runs.
 *
 * Each run, for every event from 3 days ago to tomorrow:
 *  1. The field. From the Producer Race card of the 12:00 UTC leg the day before (race-data; if that leg has none,
 *     the 13:00 leg's if it was taken before picks open at 13:55, never a later one), and each node's form (48 hours
 *     of blocks before the card), calibrated once and kept: nodes at 20+ blocks an hour, their handicaps and the c. Published as soon as the card exists, so the
 *     field is known when picks open (24 hours ahead). An event that has started with no card is void.
 *  2. The hours. Hour i (start + i h to start + (i + 1) h, block timestamps) is recorded once the first block at or
 *     after its end is irreversible, and every block in it matches on two independent nodes (RPC and RPC_CHECK).
 *     Only each field node's block count is kept. After each hour the cut is worked out; the event stops at the last
 *     cut.
 *  3. The picks. One round per event (owner, 2026-10-29): each wallet's pick is its start node and an optional backup,
 *     locked 10 minutes before the start. It is read with hour 0 (so it is final and irreversible), on both nodes,
 *     which must agree. Other rounds are never read.
 *  4. Every player's event (start, the backup taking over at the first cut of the start node, cuts survived, points)
 *     and whether the wallet may be ranked (1 VHP or a
 *     Knode stake, as the race board; staked prizes are decided by the vault).
 *  5. Leaderboards (board.json): Today (today's event), This week, Last week (final 12 hours after the week ends when
 *     every event in it is finished or void) and All time.
 *  6. Writes games-data/lastnode/index.json, D<yyyy-mm-dd>.json and board.json; the publish job puts them on the
 *     games-data branch.
 *
 *   RPC, RPC_CHECK ("off" to skip the second node), LASTNODE_PREV, LASTNODE_OUT, RACE_DATA.
 *   npm run lastnode      (or: npx tsx bot/games/lastnode.ts)
 */
import { Provider, Contract } from "koilib";
import { nodeProvider } from "../node.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { readVhp, MAINNET_VHP, withRetry } from "../../questions/common.ts";
// The vault (v6) stake reader Who Signs Block X uses (audited there: BX-61, BX-63, BX-82): get_game_player per wallet,
// peak and counted stake, v6-live check, nothing cached on a failed read.
import { vaultReader, stakedSet } from "./blockx.ts";
import * as RL from "./lastnode-ruler.ts";
await import("../../web/race-math.js");
await import("../../web/lastnode-math.js");
const M: any = (globalThis as any).KRaceMath;
const L0: any = (globalThis as any).KLastNode;
/** The rules for the game this run records: the real game (13) unless run() is given other settings (testnet). */
let L: any = L0;

const E = process.env;
const RPC = E.RPC || "https://koinos.armana.io";
/** The same node however it is spelled (case, a trailing slash, a default port): fix-check, as picks.ts's sameNode. */
/** Fix-check LNF-13: http and https, a trailing dot, the default port and letter case name the same node. (Two host
 *  names for one machine still can't be told apart from here; use two different providers.) */
export const nodeKey = (u: string) => { try { const x = new URL(String(u).trim()); return `${x.hostname.toLowerCase().replace(/\.$/, "")}:${x.port || "443"}${x.pathname.replace(/\/+$/, "")}`; } catch { return String(u).trim().toLowerCase().replace(/\/+$/, ""); } };
const RPC_CHECK = E.RPC_CHECK && E.RPC_CHECK !== "off" && nodeKey(E.RPC_CHECK) !== nodeKey(RPC) ? E.RPC_CHECK : "";
export const BOARD_ROWS = 2000;                     // rows kept in each shown board list (fix-check LNF-7)
const LOOKBACK_MS = 3 * 86400000;           // an event not finished 3 days after its start is closed as void
/** The ruler's grace (owner, 13 Nov 2026): an hour whose ruler card is still missing 48 hours after the hour ended makes the
 *  day's event void (the fallback rule, owner 14 Nov). The publish job accepts this void only at or after that time. */
export const RULER_GRACE_MS = 48 * 3600000;
export const NOCARD_48H = "no ruler card for an hour within 48 hours";
const MAX_HOURS_PER_RUN = 30;               // a long outage catches up over a few runs
const CORRECTION_MS = 12 * 3600000;         // a week is final 12 hours after it ends
const ONE_VHP = 100000000n;
const isAddr = (a: unknown) => typeof a === "string" && /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a);
/** An event id of this game: "YYYY-MM-DD" (daily game) or "YYYY-MM-DDTHH" (the testnet fast game). */
const isDay = (d: unknown) => typeof d === "string" && !!L.eventOf(d);

/** A recorded pick: [player, producer, pick time (ms)]. */
/** [player, start node, pick time, backup node] (the backup only when the pick names one; owner, 2026-10-29). */
type Pick = [string, string, number] | [string, string, number, string];
/** card: the race card (its time) whose VHP the window was checked against; hh: multipliers it lowered (LNF-3). */
/** blocks / card / hh: the old method (testnet practice only). rows: the hour's ruler card rows for the field nodes
 *  (mainnet, the VHP ruler: KLastNode.rulerCutsFrom). */
type Hour = { i: number; from: number; to: number; blocks?: Record<string, number>; rows?: Record<string, RL.Row>; checked: number; card?: number | null; hh?: Record<string, number> };
type PlayerRow = { a: string; start: string; jumpTo: string | null; out: number; survived: number; rode: boolean; jumped: boolean; points: number; ranked: boolean };
export type DayFile = {
  v: 1; day: string; start: number; week: number;
  field: any | null; void?: string;
  hours: Hour[]; picks: Record<string, Pick[]>;
  cuts: { at: number; a: string; steps: number; blocks: number }[]; standing: string[]; winner: string | null; done: boolean;
  players: PlayerRow[];
};
/** One hour's blocks as read from a node: the first and last height, and each signer's count. */
export type Window = { from: number; to: number; counts: Record<string, number> };
type Opts = {
  p: any; check: any | null; prev?: string; out?: string; raceDir?: string;
  game?: any;                                                             // other settings (testnet); default the real game
  pp?: any; pcheck?: any | null;                                          // where the picks are read (default p and check)
  practice?: boolean;                                                     // testnet: start from the event running at the first run
  picksContract?: string | null;
  now?: { time: number; libTime: number };                                // for the tests
  windowOf?: (node: any, t0: number, t1: number) => Promise<Window>;
  /** Form: blocks per hour on a node over [t0, t0 + n h) (tests pass fake nodes). */
  hoursOf?: (node: any, t0: number, n: number, signal?: AbortSignal) => Promise<Record<string, number>[]>;
  picksOf?: (node: any, round: number) => Promise<Pick[]>;
  /** The wallets STAKED in this game for a week (the Staked board; owner, 3 Nov): peak stake at least the vault's
   *  minimum (Free play is everyone else). Tests pass a fake; the default reads the vault. */
  rankedOf?: (who: string[], week: number) => Promise<Set<string>>;
  /** Free play prize (owner, 3 Nov): for a week's candidates, who was staked in this game (peak, both nodes) and who
   *  may win (holds 1 VHP, or 1 VHP staked in Knode Games; both nodes). Tests pass a fake. */
  freeOf?: (week: number, who: string[]) => Promise<{ staked: Set<string>; ok: Set<string> }>;
  /** Vault v6: the wallets with at least 1 VHP staked in this game for a vault week (null = can't tell yet). */
  stakedOf?: (week: number, who: string[]) => Promise<Set<string> | null>;
  trials?: number;
  /** Fix-check LNF-4: folder of VHP sample files (race-samples snapshots, vhp-samples.json shape); default LASTNODE_SAMPLES. */
  samplesDir?: string;
  /** Watch-and-hold (owner, 2026-10-29): weeks the owner released after review (LASTNODE_RELEASE_WEEKS, e.g. "3,7"). */
  releaseWeeks?: number[];
  /** Fix-check LNF-6: the most time the 48 h form read may take in one run (default 4 minutes). */
  formDeadlineMs?: number;
  /** Fix-check N-10 launch gate: may a field be set without form? Default: testnet practice, or LASTNODE_ALLOW_NO_FORM=true. */
  allowNoForm?: boolean;
  /** The VHP ruler (owner, 11 Nov; Library, 12 Nov): the event's field and cuts from the ruler's cards. Default: on for
   *  the real game (mainnet), off for testnet practice (its old method). */
  ruler?: boolean;
  /** The ruler's data: a vhp-data folder (default LASTNODE_VHP_DATA), or a ledger the tests made (null = unavailable). */
  vhpData?: string; rulerLedger?: any;
  /** The launch gate (Last Node chat, 14 Nov 2026): the first vault week the real game records (LASTNODE_FROM_WEEK, e.g. 6).
   *  Events of earlier weeks are never read or written, so switching the recorder on a day early can't fill a week the
   *  vault doesn't pay. Unset: no gate (the workflow itself refuses to run on mainnet without it). Testnet practice: none. */
  fromWeek?: number | null;
};

// ── files ──
function readJson(dir: string | undefined, name: string): any {
  if (!dir) return null;
  const f = path.join(dir, name);
  try { if (fs.lstatSync(f).isSymbolicLink()) return null; return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
}
const dName = (day: string) => `D${day}.json`;
const wName = (w: number) => `W${String(w).padStart(3, "0")}.json`;
function freshDay(day: string): DayFile {
  const ev = L.eventOf(day);
  return { v: 1, day: ev.day, start: ev.start, week: L.weekOf(ev.start), field: null, hours: [], picks: {}, cuts: [], standing: [], winner: null, done: false, players: [] };
}
/** Last run's file for a day, taken only if it has the expected shape (anything else starts the day fresh). */
function loadDay(dir: string | undefined, day: string): DayFile {
  const f = freshDay(day), o = readJson(dir, dName(day));
  if (!o || o.v !== 1 || o.day !== f.day || o.start !== f.start) return f;
  // Fix-check N-2: a published field is carried through exactly as published (vt, form and all), so a rerun writes the
  // same field back and the publish job's "a field never changes" check passes. A field of another shape starts fresh.
  const decText = (x: any) => typeof x === "string" && /^(0|[1-9][0-9]{0,40})$/.test(x);
  // The VHP ruler's field (nodes with own, from the field card) or the old method's (nodes with h and vhp: practice).
  const rulerField = (fd: any) => fd && decText(fd.round) && fd.window && typeof fd.window === "object" && Number.isInteger(fd.at) && Array.isArray(fd.nodes) && fd.nodes.every((n: any) => isAddr(n?.a) && decText(n.own));
  if (o.field && Array.isArray(o.field.nodes) && o.field.nodes.length >= 2 && o.field.nodes.length <= L.MAX_FIELD && (rulerField(o.field) || o.field.nodes.every((n: any) => isAddr(n?.a) && Number.isFinite(n.h) && n.h > 0 && Number.isFinite(n.vhp))))
    f.field = JSON.parse(JSON.stringify(o.field));
  const rowOk = (r: any) => r && typeof r === "object" && (r.fpct === null || decText(r.fpct)) && typeof r.entry === "boolean" && typeof r.void === "boolean" && decText(r.credited) && decText(r.expected);
  if (typeof o.void === "string") f.void = o.void.slice(0, 200);
  if (Array.isArray(o.hours)) for (const [k, h] of o.hours.entries()) {
    if (!h || h.i !== k || !Number.isInteger(h.from) || !Number.isInteger(h.to)) break;
    // The ruler's hour: its rows as published (each a field node's row on the hour card).
    if (h.rows && typeof h.rows === "object") {
      const rows = Object.fromEntries(Object.entries(h.rows).filter(([a, r]) => isAddr(a) && rowOk(r)).map(([a, r]: [string, any]) => [a, { fpct: r.fpct, entry: r.entry, void: r.void, credited: r.credited, expected: r.expected }]));
      f.hours.push({ i: k, from: h.from, to: h.to, rows, checked: h.checked === 2 ? 2 : 1 });
      continue;
    }
    if (typeof h.blocks !== "object" || h.blocks === null) break;
    const hh = h.hh && typeof h.hh === "object" ? Object.fromEntries(Object.entries(h.hh).filter(([a, n]) => isAddr(a) && Number.isInteger(n) && (n as number) >= 1)) : null;
    f.hours.push({ i: k, from: h.from, to: h.to, blocks: Object.fromEntries(Object.entries(h.blocks).filter(([a, n]) => isAddr(a) && Number.isInteger(n) && (n as number) >= 0)) as any, checked: h.checked === 2 ? 2 : 1,
      // N-2: "card": null (no race card for that window) is kept as null, not dropped.
      ...(Number.isFinite(h.card) ? { card: Number(h.card) } : h.card === null ? { card: null } : {}), ...(hh && Object.keys(hh).length ? { hh } : {}) });
  }
  if (o.picks && typeof o.picks === "object") for (const [k, rows] of Object.entries(o.picks))
    if (k === "0" && Array.isArray(rows)) f.picks[k] = (rows as any[]).filter((x) => Array.isArray(x) && (x.length === 3 || (x.length === 4 && isAddr(x[3]) && x[3] !== x[1])) && isAddr(x[0]) && isAddr(x[1]) && Number.isFinite(x[2]))
      .map((x) => (x.length === 4 ? [x[0], x[1], Number(x[2]), x[3]] : [x[0], x[1], Number(x[2])]) as Pick);
  if (Array.isArray(o.players)) f.players = o.players.filter((x: any) => x && isAddr(x.a) && x.ranked === true).map((x: any) => ({ a: x.a, ranked: true } as any));
  return f;
}
function defaultPicksContract(): string | null {
  try { const d = JSON.parse(fs.readFileSync(new URL("../../picks-data/deployment.json", import.meta.url), "utf8")); return isAddr(d.contract) ? d.contract : null; } catch { return null; }
}

// ── the race card the field comes from ──
function cardAt(raceDir: string | undefined, t: number, opens: number): any | null {
  const ra = M.raceAt(t);
  const wf = readJson(raceDir, wName(M.weekOf(ra.start)));
  const race = wf && Array.isArray(wf.races) ? wf.races.find((r: any) => r && r.id === ra.id) : null;
  if (!race || !Array.isArray(race.cards)) return null;
  // That leg's card, else the next hour's, only if it was taken before picks opened (13:15 the day before); never a
  // later one, so the field can't change after people have picked.
  const n = M.legsOf(race.cards), leg = M.legOf(ra.start, t, n);
  for (const l of [leg, leg + 1]) {
    const c = race.cards[l];
    if (c && Array.isArray(c.field) && c.field.length && Number(c.at) < opens) return c;
  }
  return null;
}

/** Form (owner, 2026-10-29): each hour's VHP shares from the race card in force at that hour (the latest one taken at
 *  or before the hour's start), every producer on the card counted (field and paddock). null for an hour with no card. */
function cardsIn(raceDir: string | undefined, t0: number, t1: number): any[] {
  const out: any[] = [];
  for (let w = M.weekOf(t0) - 1; w <= M.weekOf(t1); w++) {
    if (w < 0) continue;
    const wf = readJson(raceDir, wName(w));
    // Fix-check LNF-18: only cards of the race recorder's shape (a bad one is skipped, never stalls the field).
    const rowOk = (x: any) => x && typeof x === "object" && isAddr(x.a) && Number.isFinite(x.vhp) && x.vhp >= 0;
    if (wf && Array.isArray(wf.races)) for (const r of wf.races) for (const c of Array.isArray(r?.cards) ? r.cards : [])
      if (c && Number.isFinite(Number(c.at)) && Array.isArray(c.field) && c.field.every(rowOk) && (c.paddock === undefined || c.paddock === null || (Array.isArray(c.paddock) && c.paddock.every(rowOk)))) out.push(c);
  }
  return out.sort((a, b) => Number(a.at) - Number(b.at));
}
export function sharesByHour(cards: any[], t0: number, hours: number): (Record<string, number> | null)[] {
  const out: (Record<string, number> | null)[] = [];
  for (let k = 0; k < hours; k++) {
    const t = t0 + k * 3600000;
    let c: any = null;
    for (const x of cards) { if (Number(x.at) <= t) c = x; else break; }
    // Not older than 3 hours: a gap in the race recorder is left out, not filled with an old card.
    if (!c || t - Number(c.at) > 3 * 3600000) { out.push(null); continue; }
    const all = [...c.field, ...(Array.isArray(c.paddock) ? c.paddock : [])].filter((x: any) => x && isAddr(x.a) && Number.isFinite(x.vhp) && x.vhp > 0);
    const tot = all.reduce((s: number, x: any) => s + x.vhp, 0);
    out.push(tot > 0 ? Object.fromEntries(all.map((x: any) => [x.a, x.vhp / tot])) : null);
  }
  return out;
}

/** Every VHP sample in a folder of race-samples snapshots (vhp-samples.json shape), once each, oldest first. A sample
 *  the two nodes disputed (audit BX-86: `flagged` / `high`) is kept with disputed: true. */
export function samplesIn(dir: string): { at: number; vhp: Record<string, number>; disputed?: boolean }[] {
  if (!dir) return [];
  const by = new Map<number, { vhp: Record<string, number>; disputed: boolean }>();
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^[\w.-]+\.json$/.test(f)).sort(); } catch { return []; }
  for (const f of files) {
    const j = readJson(dir, f);
    if (!j || j.v !== 1 || !Array.isArray(j.samples)) continue;
    for (const x of j.samples) {
      if (!x || !Number.isInteger(x.at) || !x.vhp || typeof x.vhp !== "object" || by.has(x.at)) continue;
      const v: Record<string, number> = {};
      for (const [a, n] of Object.entries(x.vhp)) if (isAddr(a) && typeof n === "string" && /^\d{1,20}$/.test(n)) v[a] = Number(n) / 1e8;
      by.set(x.at, { vhp: v, disputed: x.flagged !== undefined || x.high !== undefined });
    }
  }
  return [...by.entries()].sort((p, q) => p[0] - q[0]).map(([at, x]) => ({ at, vhp: x.vhp, ...(x.disputed ? { disputed: true } : {}) }));
}
/** Each hour's VHP shares from its samples: every producer's average over the hour's samples (absent = 0), ÷ the sum.
 *  Fix-check N-5: only samples both nodes agreed on (a disputed one is left out), and only samples whose total VHP is
 *  within 2% of the hour's median total (the network's VHP barely moves in an hour; VHP swapped between addresses
 *  keeps the total, while one node reading producers as 0, or an inserted huge value, doesn't). null for an hour with
 *  fewer than 6 such samples. Exported for the tests. */
export function sharesFromSamples(all: { at: number; vhp: Record<string, number>; disputed?: boolean }[], t0: number, hours: number): (Record<string, number> | null)[] {
  const out: (Record<string, number> | null)[] = [];
  for (let k = 0; k < hours; k++) {
    const a = t0 + k * 3600000;
    const in1 = all.filter((x) => x.at >= a && x.at < a + 3600000 && !x.disputed);
    const tots = in1.map((x) => Object.values(x.vhp).reduce((s, v) => s + v, 0));
    const sorted = [...tots].sort((p, q) => p - q), med = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
    const keep = in1.filter((_, i) => med > 0 && Math.abs(tots[i] - med) <= med * 0.02);
    if (keep.length < 6) { out.push(null); continue; }
    const sum: Record<string, number> = {};
    for (const x of keep) for (const [p, v] of Object.entries(x.vhp)) sum[p] = (sum[p] || 0) + v;
    const tot = Object.values(sum).reduce((s, v) => s + v, 0);
    out.push(tot > 0 ? Object.fromEntries(Object.entries(sum).map(([p, v]) => [p, v / tot])) : null);
  }
  return out;
}

// ── chain reads ──
async function headOf(node: any) {
  const h: any = await withRetry("head", () => node.getHeadInfo());
  return { id: h.head_topology.id as string, height: Number(h.head_topology.height), time: Number(h.head_block_time), lib: Number(h.last_irreversible_block) };
}
async function blocksAt(node: any, headId: string, from: number, n: number) {
  const res: any = await withRetry(`blocks at ${from}`, () => node.call("block_store.get_blocks_by_height", { head_block_id: headId, ancestor_start_height: String(from), num_blocks: n, return_block: true, return_receipt: false }));
  const items = res?.block_items ?? [];
  if (!items.length) throw new Error(`no blocks returned at ${from}`);
  if (items.length > n) throw new Error(`more blocks returned than asked at ${from}`);
  return items.map((it: any, k: number) => {
    if (Number(it.block_height) !== from + k) throw new Error(`blocks out of order at ${from}`);
    return { h: from + k, signer: String(it.block.header.signer), time: Number(it.block.header.timestamp) };
  });
}
/** A node's window reader: the blocks with time in [t0, t1), all at or below its irreversible block. */
function windowReader(node: any) {
  let headP: Promise<any> | null = null;
  const head = () => (headP ??= headOf(node));
  const timeOf = async (h: number) => (await blocksAt(node, (await head()).id, h, 1))[0].time;
  const firstAtOrAfter = async (t: number, lo: number, hi: number) => {
    while (lo < hi) { const m = Math.floor((lo + hi) / 2); if ((await timeOf(m)) < t) lo = m + 1; else hi = m; }
    return lo;
  };
  return async (t0: number, t1: number): Promise<Window> => {
    const hd = await head();
    const libT = await timeOf(hd.lib);
    if (libT < t1) throw new Error("not irreversible yet");
    let lo = Math.max(1, hd.lib - Math.ceil((libT - t0) / 3000) - 1200);
    while (lo > 1 && (await timeOf(lo)) >= t0) lo = Math.max(1, lo - 1200);
    const a = await firstAtOrAfter(t0, lo, hd.lib), b = (await firstAtOrAfter(t1, a, hd.lib)) - 1;
    const counts: Record<string, number> = {};
    // Fix-check LNF-17: move on by what the node returned (it may send fewer than asked), so no block is skipped.
    for (let s = a; s <= b;) {
      const got = await blocksAt(node, hd.id, s, Math.min(200, b - s + 1));
      for (const x of got) {
        if (x.time < t0 || x.time >= t1) throw new Error(`block ${x.h} outside the hour`);
        counts[x.signer] = (counts[x.signer] || 0) + 1;
      }
      s += got.length;
    }
    return { from: a, to: b, counts };
  };
}
/** Blocks signed per hour over [t0, t0 + n hours), irreversible only, in one pass (for the form). */
function hourlyReader(node: any) {
  let headP: Promise<any> | null = null;
  const head = () => (headP ??= headOf(node));
  const timeOf = async (h: number) => (await blocksAt(node, (await head()).id, h, 1))[0].time;
  const firstAtOrAfter = async (t: number, lo: number, hi: number) => {
    while (lo < hi) { const m = Math.floor((lo + hi) / 2); if ((await timeOf(m)) < t) lo = m + 1; else hi = m; }
    return lo;
  };
  return async (t0: number, n: number, signal?: AbortSignal): Promise<Record<string, number>[]> => {
    const t1 = t0 + n * 3600000, hd = await head(), libT = await timeOf(hd.lib);
    if (libT < t1) throw new Error("not irreversible yet");
    let lo = Math.max(1, hd.lib - Math.ceil((libT - t0) / 3000) - 2400);
    while (lo > 1 && (await timeOf(lo)) >= t0) lo = Math.max(1, lo - 2400);
    const a = await firstAtOrAfter(t0, lo, hd.lib), b = (await firstAtOrAfter(t1, a, hd.lib)) - 1;
    const out: Record<string, number>[] = Array.from({ length: n }, () => ({}));
    for (let s = a; s <= b;) {
      // Fix-check N-12: a read that lost to the form deadline stops here instead of running on in the background.
      if (signal?.aborted) throw new Error("the 48-hour block read was stopped (deadline)");
      const got = await blocksAt(node, hd.id, s, Math.min(200, b - s + 1));
      for (const x of got) {
        const k = Math.floor((x.time - t0) / 3600000);
        if (k < 0 || k >= n) throw new Error(`block ${x.h} outside the form window`);
        out[k][x.signer] = (out[k][x.signer] || 0) + 1;
      }
      s += got.length;
    }
    return out;
  };
}
const PICKS_ABI = () => JSON.parse(fs.readFileSync(new URL("../../contracts/picks/abi/picks.koilib.json", import.meta.url), "utf8"));
/** Fix-check LNF-22: the game as registered must be this game's shape before any of its picks are counted. */
const shapeChecked = new WeakMap<object, Set<string>>();
export async function checkRegistration(c: any, node: any, contract: string) {
  const seen = shapeChecked.get(node) ?? new Set<string>();
  if (seen.has(contract)) return;
  const g: any = (await withRetry(`game ${L.GAME_ID}`, () => c.functions.get_game({ game: L.GAME_ID })))?.result?.game;
  const want = L.PICKS_GAME;
  if (!g || Number(g.kind) !== want.kind || Number(g.list_size) !== want.list_size || Number(g.lock_mode) !== want.lock_mode
    || String(g.round_size) !== String(want.round_size) || String(g.round_offset) !== String(want.round_offset)
    // Fix-check L-5: and the lock and opening (lead, ahead), so a pick can't be made later or earlier than the rules say.
    || String(g.lead) !== String(want.lead) || String(g.ahead) !== String(want.ahead))
    throw new Error(`game ${L.GAME_ID} isn't registered with this game's rules in the Picks contract; its picks aren't counted`);
  seen.add(contract); if (typeof node === "object" && node) shapeChecked.set(node, seen);
}
async function readPicks(node: any, contract: string, round: number): Promise<Pick[]> {
  const c = new Contract({ id: contract, abi: PICKS_ABI(), provider: node });
  await checkRegistration(c, node, contract);
  return pagePicks(`event round ${round}`, round, async (after) => {
    const r: any = await withRetry(`picks for round ${round}`, () => (c.functions as any).list_picks({ game: L.GAME_ID, round: String(round), ...(after ? { start_after: after } : {}), limit: 100 }));
    return r?.result?.rows ?? [];
  });
}
/** The most pages (of 100 picks) read for one event: 100,000 picks. */
export const READ_PICKS_PAGES = 1000;
/** Every pick of an event, page by page (100 a page). Capacity chat (12 Nov), as the Race's: past READ_PICKS_PAGES pages
 *  the event's picks would be cut short in silence, so it stops loudly instead: the run fails, nothing is scored or paid
 *  from a partial list, and the owner gets the failed-run email. Exported for the tests. */
export async function pagePicks(what: string, round: number, page: (after: string | undefined) => Promise<any[]>, pages = READ_PICKS_PAGES): Promise<Pick[]> {
  const out: Pick[] = [];
  let after: string | undefined;
  for (let n = 0; n < pages; n++) {
    const rows = await page(after);
    for (const x of rows) {
      const ps = x.pick?.producers;
      // One pick per event: [start] or [start, backup] (the contract keeps them distinct).
      // Fix-check L-5: only a pick made before the round locked counts (the contract enforces it; this makes sure).
      if (Number(x.pick?.time || 0) >= L.lockTime(round)) continue;
      if (isAddr(x.player) && Array.isArray(ps) && (ps.length === 1 || ps.length === 2) && ps.every(isAddr) && ps[0] !== ps[1])
        out.push(ps.length === 2 ? [x.player, ps[0], Number(x.pick.time || 0), ps[1]] : [x.player, ps[0], Number(x.pick.time || 0)]);
    }
    if (rows.length < 100) return out;
    after = rows[rows.length - 1].player;
  }
  throw new Error(`${what} has more than ${pages * 100} picks: the recorder won't score it from a partial list (tell the Last Node chat)`);
}
const GAME = (() => { try { return JSON.parse(fs.readFileSync(new URL("../../game-data/deployment.json", import.meta.url), "utf8")).contract as string; } catch { return ""; } })();
const GAME_ABI = () => JSON.parse(fs.readFileSync(new URL("../../contracts/vault/abi/kpred.koilib.json", import.meta.url), "utf8"));
/** Who may be ranked: at least 1 VHP, or a Knode stake (as the race and Block X boards). */
/** Vault v6 (owner's player rule, 2026-10-28): a staked player in this game is a wallet whose stake in THIS game counts
 *  for that week (week_stake, at least the vault's minimum stake for that week: 1 VHP unless the owner changes it).
 *  Returns null while the game contract has no per-game stakes (before v6), so no vault file is written on a guess.
 *  Audit LN-12: the minimum is the vault's own for that week (get_state), not a number in this file. */
/** The vault's minimum stake for a week, from get_state's config (as the vault bot's minStakeFor). Exported for the tests. */
export function minStakeOf(cf: any, week: number): bigint {
  const next = BigInt(cf?.min_stake_next || "0");
  return next > 0n && week >= Number(cf?.min_stake_next_week || 0) ? next : BigInt(cf?.min_stake || "0");
}
export async function readStakedV6(node: any, week: number, who: string[], game = GAME, abiOf = GAME_ABI): Promise<Set<string> | null> {
  if (!game) return null;
  const abi = abiOf();
  if (!abi?.methods?.get_game_player || !abi?.methods?.get_state) return null;
  const c = new Contract({ id: game, abi, provider: node });
  const st: any = await withRetry("the vault's settings", () => (c.functions as any).get_state({}));
  const min = minStakeOf(st?.result?.config ?? {}, week);
  if (min <= 0n) throw new Error("the vault's minimum stake could not be read (0)");
  const out = new Set<string>();
  for (const a of who) {
    const r: any = await withRetry(`stake of ${a} in game ${L.GAME_ID}`, () => (c.functions as any).get_game_player({ player: a, game: L.GAME_ID, week: String(week) }));
    if (BigInt(r?.result?.week_stake || "0") >= min) out.add(a);
  }
  return out;
}
/** Audit LN-2: who is staked, read on BOTH mainnet nodes; any difference holds the vault file (tried again next run).
 *  An empty answer reads as "no stake", so one faulty node could otherwise drop staked wallets from a file that is
 *  never replaced. Exported for the tests. */
export async function stakedOnBoth(read: (node: any) => Promise<Set<string> | null>, p: any, check: any): Promise<Set<string> | null> {
  const a = await read(p);
  if (!check) throw new Error("no second node to check the stakes on (RPC_CHECK)");
  const b = await read(check);
  if (a === null || b === null) { if (a !== b) throw new Error("the stakes could be read on one node only"); return null; }
  const only = [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  if (only.length) throw new Error(`the two nodes disagree on who is staked (${only.length} wallet${only.length === 1 ? "" : "s"}, e.g. ${only[0]})`);
  return a;
}
/** Watch-and-hold (fix-check N-6/N-10): per field node, across a week's finished events, the blocks it signed in EVERY
 *  recorded window (also after its cut, so a long run doesn't count against it) against what its multiplier expected
 *  (kh, raised where a window lowered its multiplier). The noise is measured from the week itself: each node is judged
 *  against the other nodes' spread (leave-one-out over-dispersion, at least Poisson). Flags a node
 *   - z ≥ 3.4 over the week with at least 2 wins (steady over-signing), or
 *   - z ≥ 5 in one event it won (gaming a single day).
 *  On the round-2 reviewer's simulator: honest weeks held 1.5% (5% day-to-day spread) and 1.0% (no form); one gamed
 *  event caught 98%; a node 3% under its form caught 13% (a week of blocks can't show 3% much better). The publish job
 *  runs the same rule (histcheck watch_week). Exported for the tests. */
export const WATCH = Object.freeze({ weekZ: 3.4, weekWins: 2, eventZ: 5 });
export function watchWeek(events: DayFile[], cut = L.CUT): { a: string; q: number; wins: number; events: number }[] {
  const by = new Map<string, { got: number; exp: number; wins: number; events: number; chi: number; m: number; ev: [number, number, boolean][] }>();
  let chi = 0, m = 0;
  const evs = [...events].sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
  for (const df of evs) {
    if (df.void || !df.field || !df.done) continue;
    // The VHP ruler (field nodes without kh): credited against expected blocks from each hour card, over the hours the
    // node raced (up to and including the hour it went out). The old method: blocks against the handicap.
    const onRuler = df.field.nodes.length > 0 && df.field.nodes[0].kh === undefined;
    const outAt = new Map<string, number>(onRuler ? L.rulerCutsFrom(df.field, df.hours).cuts.map((c: any) => [c.a, c.at]) : []);
    for (const n of df.field.nodes) {
      const s = by.get(n.a) ?? { got: 0, exp: 0, wins: 0, events: 0, chi: 0, m: 0, ev: [] };
      let g = 0, e = 0;
      for (let i = 0; onRuler && i < df.hours.length && i < (outAt.get(n.a) ?? Infinity); i++) {
        const r = df.hours[i].rows && df.hours[i].rows![n.a];
        if (r && !r.void) { g += Number(BigInt(r.credited)) / 1e6; e += Number(BigInt(r.expected)) / 1e6; }
      }
      for (let i = 0; !onRuler && i < df.hours.length; i++) {
        const h = df.hours[i], base = L.hInt(n), used = h.hh && Number.isInteger(h.hh[n.a]) && h.hh[n.a] >= 1 && h.hh[n.a] < base ? h.hh[n.a] : base;
        g += Number(h.blocks![n.a]) || 0;
        e += n.kh * (cut / 3600000) * (base / used);
      }
      if (e > 0) { const c = (g - e) * (g - e) / e; chi += c; m++; s.chi += c; s.m++; }
      s.got += g; s.exp += e; s.events++;
      const won = df.winner === n.a;
      if (won) s.wins++;
      s.ev.push([g, e, won]);
      by.set(n.a, s);
    }
  }
  const out: { a: string; q: number; wins: number; events: number }[] = [];
  for (const [a, s] of by) {
    if (!(s.exp > 0)) continue;
    const phi = Math.max(1, m > s.m ? (chi - s.chi) / (m - s.m) : 1);
    const z = (s.got - s.exp) / Math.sqrt(phi * s.exp);
    const oneDay = s.ev.some(([g, e, won]) => won && e > 0 && (g - e) / Math.sqrt(phi * e) >= WATCH.eventZ);
    if ((s.wins >= WATCH.weekWins && z >= WATCH.weekZ) || oneDay) out.push({ a, q: Math.round((s.got / s.exp) * 1000) / 1000, wins: s.wins, events: s.events });
  }
  return out;
}
/** The vault file's scores: the week's board order (points, then rides, then fewer jumps) as whole numbers 1–255, ties
 *  kept. The real points when they already give that order and fit; else each tie group's rank counted from the bottom.
 *  ranked: board rows, best first, each { a, pts, rides, jumps }. Exported for the tests. */
export function vaultScores(ranked: { a: string; pts: number; rides: number; jumps: number }[]): { player: string; points: number }[] {
  const rows = ranked.filter((r) => r.pts >= 1);
  const key = (r: any) => `${r.pts}|${r.rides}|${r.jumps}`;
  const groups: string[] = [];
  for (const r of rows) if (groups[groups.length - 1] !== key(r)) groups.push(key(r));
  const pointsKeepOrder = rows.every((r, i) => i === 0 || (rows[i - 1].pts === r.pts) === (key(rows[i - 1]) === key(r))) && rows.every((r) => r.pts <= 255);
  if (pointsKeepOrder) return rows.map((r) => ({ player: r.a, points: r.pts }));
  // Audit LN-13: more than 255 different places: the top 254 places keep every tie-break (where the payouts are), and
  // only the tail below them shares the lowest score, 1.
  const rank = new Map(groups.map((g, i) => [g, Math.max(1, Math.min(255, groups.length) - i)]));
  return rows.map((r) => ({ player: r.a, points: rank.get(key(r))! }));
}
/** Free play prize (owner, 3 Nov: "require at least 1 VHP"): a free winner holds at least 1 VHP, or has at least
 *  1 VHP staked in Knode Games (get_player: stake + pending + stake_other, v6). A failed read is an error, never "no".
 *  Exported for the tests. */
export async function readFreeOk(node: any, who: string[], game = GAME, abiOf = GAME_ABI): Promise<Set<string>> {
  const out = new Set<string>();
  if (!who.length) return out;
  const vhp = (await readVhp(node, MAINNET_VHP, who)).values;
  const c = game ? new Contract({ id: game, abi: abiOf(), provider: node }) : null;
  for (const a of who) {
    if (BigInt(vhp[a] || "0") >= ONE_VHP) { out.add(a); continue; }
    if (!c) continue;
    const r: any = await withRetry(`Knode player ${a}`, () => (c.functions as any).get_player({ player: a, week: "0" }));
    if (!r || !("result" in r)) throw new Error(`no answer reading ${a}'s Knode Games stake`);
    const p = r.result?.player ?? {};
    if (BigInt(p.stake || "0") + BigInt(p.pending || "0") + BigInt(p.stake_other || "0") >= ONE_VHP) out.add(a);
  }
  return out;
}
/** The vault file's free places from a week's free prizes (as Who Signs Block X's vaultFile): 1st is every wallet at
 *  place 1 (two or more tied for 1st cover 2nd too, so 2nd is then empty). Fix-check LN3-2 (D-159, every standard): the
 *  vault takes up to 10 wallets a place; more than 10 tied pays exactly 10, by earlier score time (`reached`: the wallet's
 *  last scoring pick, see reachedOf), then address; never an empty place because of the cap. Exported for the tests. */
export const VAULT_MAX_PER_PLACE = 10;
export function freePlaces(prizes: { player: string; place: number }[], reached: Map<string, number> = new Map()): { first: string[]; second: string[]; problems: string[] } {
  const problems: string[] = [];
  const cap = (who: string[], place: string) => {
    if (who.length <= VAULT_MAX_PER_PLACE) return who;
    const at = (a: string) => reached.get(a) ?? Number.MAX_SAFE_INTEGER;
    const kept = [...who].sort((x, y) => at(x) - at(y) || (x < y ? -1 : x > y ? 1 : 0)).slice(0, VAULT_MAX_PER_PLACE).sort();
    problems.push(`${who.length} wallets tied for ${place}; the first ${VAULT_MAX_PER_PLACE} by score time, then address, are paid (D-159)`);
    return kept;
  };
  const first = cap([...new Set(prizes.filter((x) => x.place === 1).map((x) => x.player))].sort(), "1st");
  const tied1 = new Set(prizes.filter((x) => x.place === 1).map((x) => x.player)).size >= 2;
  const second = tied1 ? [] : cap([...new Set(prizes.filter((x) => x.place !== 1).map((x) => x.player))].sort(), "2nd");
  return { first, second, problems };
}
/** D-159's score time for Last Node: when a wallet reached its week score = the time of its pick in the last event
 *  (of the given days) that gave it points. Void days count nothing. */
export function reachedOf(dayFiles: { void?: string; players: { a: string; points: number }[]; picks: Record<string, any[]> }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const df of dayFiles) {
    if (df.void) continue;
    const t = new Map<string, number>();
    for (const x of (df.picks && df.picks["0"]) || []) if (Array.isArray(x) && typeof x[0] === "string" && Number.isSafeInteger(x[2])) t.set(x[0], Math.max(t.get(x[0]) ?? 0, x[2]));
    for (const p of df.players) if (p.points > 0 && t.has(p.a)) out.set(p.a, Math.max(out.get(p.a) ?? 0, t.get(p.a)!));
  }
  return out;
}
/** The week's free winners: the board's rows in order, each candidate (at least 3 events and 1 point) checked in
 *  batches of 25 until 1st and 2nd are settled (the next unchecked candidate can't tie the last winner). */
export async function freeWinners(rows: { a: string; pts: number; rides: number; jumps: number; events: number }[],
  status: (who: string[]) => Promise<{ staked: Set<string>; ok: Set<string> }>, reached: Map<string, number> = new Map()) {
  const cands = rows.filter((r) => r.pts >= 1 && r.events >= L.FREE_MIN_EVENTS).map((r) => ({ player: r.a, pts: r.pts, rides: r.rides, jumps: r.jumps, events: r.events }));
  const key = (r: any) => `${r.pts}|${r.rides}|${r.jumps}`;
  const known = new Map<string, boolean>();
  for (let n = 0; ; n += 25) {
    const chunk = cands.slice(n, n + 25).map((r) => r.player);
    if (chunk.length) { const st = await status(chunk); for (const a of chunk) known.set(a, !st.staked.has(a) && st.ok.has(a)); }
    const read = cands.slice(0, n + 25);
    const prizes = L.freePrizes(read, (a: string) => known.get(a) === true);
    const next = cands[read.length];
    const last = prizes.length ? read.find((r) => r.player === prizes[prizes.length - 1].player) : null;
    if (!next || (prizes.length >= L.FREE_AMOUNTS.length && last && key(next) !== key(last))) return { prizes, ...freePlaces(prizes, reached) };
  }
}
const sameCounts = (x: Window, y: Window) => x.from === y.from && x.to === y.to && JSON.stringify(Object.entries(x.counts).sort()) === JSON.stringify(Object.entries(y.counts).sort());
const samePicks = (x: Pick[], y: Pick[]) => { const k = (r: Pick[]) => JSON.stringify([...r].sort((u, v) => (u[0] < v[0] ? -1 : u[0] > v[0] ? 1 : 0))); return k(x) === k(y); };

/** One run. Exported for the tests, which pass fake nodes. */
export async function run(o: Opts) {
  L = o.game ? L0.forGame(o.game) : L0;
  const OUT = o.out ?? E.LASTNODE_OUT ?? "games-data/lastnode";
  const RULER = o.ruler ?? !o.practice;
  /** The event's result: the ruler's cuts (mainnet) or the old handicap cuts (testnet practice). */
  const cutsOf = (field: any, hours: Hour[]) => (RULER ? L.rulerCutsFrom(field, hours) : L.cutsFrom(field, hours));
  let ledger: any = o.rulerLedger;
  const rulerData = () => {
    if (ledger !== undefined) return ledger;
    const dir = o.vhpData ?? E.LASTNODE_VHP_DATA ?? "";
    if (!dir) { ledger = null; problems.push("the VHP ruler's data (LASTNODE_VHP_DATA) isn't available this run: the ruler's cards wait"); return ledger; }
    try { ledger = RL.loadLedger(dir); } catch (e) { ledger = null; problems.push(`the VHP ruler's data can't be read (${(e as Error).message}): the ruler's cards wait`); }
    return ledger;
  };
  const rdays = new Map<string, RL.RulerDay>();
  const rday = (day: string) => { let r = rdays.get(day); if (!r) { r = RL.readRulerDay(PREV, day); rdays.set(day, r); } return r; };
  const PREV = o.prev ?? E.LASTNODE_PREV ?? "";
  const fromWeek = o.practice ? null : o.fromWeek !== undefined ? o.fromWeek : E.LASTNODE_FROM_WEEK ? Number(E.LASTNODE_FROM_WEEK) : null;
  if (fromWeek !== null && !(Number.isInteger(fromWeek) && fromWeek >= 1)) throw new Error(`LASTNODE_FROM_WEEK must be a vault week number (it is ${E.LASTNODE_FROM_WEEK}); nothing was recorded`);
  /** An event the real game records: of week fromWeek or later. */
  const live = (t: number) => fromWeek === null || L.weekOf(L.eventOf(t).start) >= fromWeek;
  const RACE = o.raceDir ?? E.RACE_DATA ?? "";
  const problems: string[] = [];
  const contract = o.picksContract === undefined ? defaultPicksContract() : o.picksContract;
  let cardsCache: any[] | null = null, samplesCache: any[] | null = null;
  const samples = () => (samplesCache ??= samplesIn(o.samplesDir ?? E.LASTNODE_SAMPLES ?? ""));
  const raceCards = () => (cardsCache ??= cardsIn(RACE, (o.now?.time ?? Date.now()) - 5 * L.DAY, (o.now?.time ?? Date.now()) + L.DAY));

  // Now and the irreversible time: both nodes, the earlier of the two.
  let now: { time: number; libTime: number };
  if (o.now) now = o.now;
  else {
    const h = await headOf(o.p);
    const libT = (await blocksAt(o.p, h.id, h.lib, 1))[0].time;
    let libTime = libT;
    if (o.check) { const c = await headOf(o.check); libTime = Math.min(libTime, (await blocksAt(o.check, c.id, c.lib, 1))[0].time); }
    now = { time: h.time, libTime };
  }
  const winP = o.windowOf ? (a: number, b: number) => o.windowOf!(o.p, a, b) : windowReader(o.p);
  const winC = o.check ? (o.windowOf ? (a: number, b: number) => o.windowOf!(o.check, a, b) : windowReader(o.check)) : null;
  // With fake block windows (the tests) and no fake hours, the form is read hour by hour from those windows.
  const viaWindows = (node: any) => async (a: number, n: number) => { const out = []; for (let k = 0; k < n; k++) out.push((await o.windowOf!(node, a + k * 3600000, a + (k + 1) * 3600000)).counts); return out; };
  const hoursFor = (node: any) => (o.hoursOf ? (a: number, n: number, sig?: AbortSignal) => o.hoursOf!(node, a, n, sig) : o.windowOf ? viaWindows(node) : hourlyReader(node));
  const hrsP = hoursFor(o.p), hrsC = o.check ? hoursFor(o.check) : null;
  const allowNoForm = o.allowNoForm ?? (!!o.practice || E.LASTNODE_ALLOW_NO_FORM === "true");
  /** The form for an event's field (owner, 2026-10-29): the 48 hours before its card, irreversible blocks, matching on
   *  both nodes, against each hour's race card. "wait": try again next run (until an hour after picks open, then the
   *  field is set without form so the event still runs); otherwise { form, info } (form null: not enough race cards). */
  async function formFor(ev: any): Promise<"wait" | { form: Record<string, number> | null; info: any }> {
    const t1 = ev.cardTime, t0 = t1 - L.FORM_HOURS * 3600000;
    // Fix-check LNF-16: a field without form only 3 hours after picks open (a node that disagrees can't force it sooner).
    const late = now.time >= ev.opens + 3 * 3600000;
    // Fix-check N-10/N-11 (launch gate): on mainnet a field is never set without form unless the owner allows it
    // (LASTNODE_ALLOW_NO_FORM=true); otherwise the field waits, and an event whose form can't be measured before its
    // picks lock is void. Testnet practice may run without form.
    const giveUp = (why: string, hours = 0, warn = true): "wait" | { form: null; info: any } => {
      if (!allowNoForm) { problems.push(`${ev.day}: form not measured (${why}); the field waits (LASTNODE_ALLOW_NO_FORM is off)`); return "wait"; }
      (warn ? (x: string) => problems.push(x) : console.log)(`${ev.day}: form not measured (${why}); field set without it`);
      return { form: null, info: { hours, note: why.slice(0, 120) } };
    };
    if (now.libTime < t1) return late ? giveUp("blocks not irreversible") : "wait";
    let a: Record<string, number>[], b: Record<string, number>[] | null = null;
    try {
      // Fix-check LNF-6: both reads together under one deadline, so a slow node can't hold up the run (the running
      // event's hours are recorded first, and this is tried again next run).
      const ms = o.formDeadlineMs ?? 4 * 60000;
      let timer: any;
      const stop = new AbortController();
      const deadline = new Promise<never>((_, rej) => { timer = setTimeout(() => { stop.abort(); rej(new Error(`the 48-hour block read took over ${Math.round(ms / 1000)} s`)); }, ms); });
      const reads = Promise.all([hrsP(t0, L.FORM_HOURS, stop.signal), hrsC ? hrsC(t0, L.FORM_HOURS, stop.signal) : Promise.resolve(null)]);
      reads.catch(() => { /* a read stopped after the deadline: already reported */ });
      try { [a, b] = await Promise.race([reads, deadline]); }
      finally { clearTimeout(timer); }
    } catch (e: any) { if (late) return giveUp(`couldn't read the blocks: ${e.message}`); problems.push(`${ev.day}: form: ${e.message} (tried again next run)`); return "wait"; }
    if (b && JSON.stringify(a.map((x) => Object.entries(x).sort())) !== JSON.stringify(b.map((x) => Object.entries(x).sort()))) {
      if (late) return giveUp("the two nodes disagree about the blocks");
      problems.push(`${ev.day}: form: the two nodes disagree about the blocks; tried again next run`); return "wait";
    }
    // Fix-check LNF-4 (owner, 2026-10-29): each hour's VHP shares are the hour's AVERAGE from the 5-minute samples, so
    // VHP moved back and forth between addresses counts once (the hourly card shows the 6-hour high on both).
    let shares = sharesFromSamples(samples(), t0, L.FORM_HOURS);
    // Testnet practice only: until the race-samples branch is running, the hourly race cards stand in (mainnet never
    // falls back to them: there, no samples means a field without form).
    if (o.practice && shares.filter(Boolean).length < L.FORM_MIN_HOURS) shares = sharesByHour(cardsIn(RACE, t0, t1).filter((c) => Number(c.at) < ev.opens), t0, L.FORM_HOURS);
    const hours = a.map((blocks, k) => ({ blocks, shares: shares[k] }));
    const used = hours.filter((h) => h.shares && Object.values(h.blocks).some((x) => x > 0)).length;
    const form = L.formOf(hours);
    if (form) return { form, info: { hours: used, from: t0, to: t1 } };
    const note = `VHP samples for only ${used} of ${L.FORM_HOURS} hours`;
    // N-11: too few samples this run is a wait (the samples may be late), not a field without form at once.
    // Allowed to run without form: at once when there are no samples at all (no race-samples data yet, the launch
    // state), or in testnet practice; samples that exist but are too few wait as above.
    if (allowNoForm && (o.practice || !samples().length)) { console.log(`${ev.day}: no form (${note}); field set without it`); return { form: null, info: { hours: used, note } }; }
    if (!late) { problems.push(`${ev.day}: form: ${note} (tried again next run)`); return "wait"; }
    return giveUp(note, used, false);
  }
  const picksRead = o.picksOf ?? (contract ? (node: any, r: number) => readPicks(node, contract, r) : null);
  const pMain = o.pp ?? o.p, pCheck = o.pp ? (o.pcheck ?? null) : o.check;
  // The Staked board (owner, 3 Nov): staked in THIS game that week (peak stake at least the vault's minimum, as the
  // vault decides who may win the free prize). Everyone else is Free play. One vault reader per run (cached reads).
  const vaultOnce = vaultReader(GAME || null, L.GAME_ID);
  const rankedRead = o.rankedOf ?? (async (who: string[], week: number) => stakedSet(await vaultOnce(o.p, who, week)));
  const freeStatus = o.freeOf ?? (async (week: number, who: string[]) => {
    const staked = await stakedOnBoth(async (n) => stakedSet(await vaultOnce(n, who, week)), o.p, o.check);
    const ok = await stakedOnBoth((n) => readFreeOk(n, who), o.p, o.check);
    return { staked: staked ?? new Set<string>(), ok: ok ?? new Set<string>() };
  });
  console.log(`now ${new Date(now.time).toISOString()}, irreversible to ${new Date(now.libTime).toISOString()}`);

  const idx = readJson(PREV, "index.json");
  const known = new Set<string>(Array.isArray(idx?.days) ? idx.days.filter(isDay) : []);
  // Testnet practice starts with the event running at the first run (index "since"); nothing earlier is read.
  const since = o.practice ? (Number.isFinite(idx?.since) ? Number(idx.since) : L.eventOf(now.time).start) : -Infinity;
  if (o.practice) for (const d of [...known]) if (L.eventOf(d).start < since) known.delete(d);
  // The game's first recorded day: days before it are never filled in as void (the game wasn't running yet).
  const firstStart = known.size ? L.eventOf([...known].sort()[0]).start : o.practice ? since : Infinity;
  const days = new Map<string, DayFile>();
  const touched = new Set<string>();
  const today = L.eventOf(now.time);
  // Events from 3 days ago to the next one (its field is published when its picks open).
  for (let t = Math.max(today.start - 3 * L.DAY, since); t <= today.start + L.PERIOD; t += L.PERIOD) if (live(t)) days.set(L.eventOf(t).day, loadDay(PREV, L.eventOf(t).day));
  for (const d of known) if (!days.has(d)) days.set(d, loadDay(PREV, d));
  // Every day of last week and this week (up to today), so a day the recorder never saw is closed as void.
  for (let t = L.weekStart(Math.max(0, L.weekOf(now.time) - 1)); t <= today.start; t += L.PERIOD) { const d = L.eventOf(t).day; if (!days.has(d) && t >= firstStart && live(t)) days.set(d, loadDay(PREV, d)); }

  let hoursRead = 0;
  for (const df of days.values()) {
    if (df.start > today.start + L.PERIOD || df.void) continue;
    if (df.start < today.start - 3 * L.DAY) {                     // older events are settled; one never finished is void
      if (!cutsOf(df.field || { nodes: [] }, df.hours).done && now.time - df.start > LOOKBACK_MS && df.start >= firstStart) { df.void = df.field ? "not recorded within 3 days" : "never recorded"; touched.add(df.day); }
      continue;
    }
    const ev = L.eventOf(df.day);
    try {
      // ── 1. the field (the VHP ruler: the field card) ──
      if (!df.field && RULER) {
        const ft = RL.fieldTime(df.start);
        if (now.libTime >= ft) {
          // The last block before the field time, by block time, on both nodes.
          const w = await winP(ft - L.HOUR, ft);
          if (winC) { const w2 = await winC(ft - L.HOUR, ft); if (w2.to !== w.to) { problems.push(`${df.day}: the two nodes disagree about the field card's last block; tried again next run`); continue; } }
          const win = RL.fieldWindow(w.to), round = RL.fieldRound(df.start), got = RL.cardFor(rulerData(), round, win, false);
          if ("card" in got) {
            const nodes = RL.fieldOf(got.card);
            if (nodes.length >= 2) {
              df.field = { at: ft, round, window: win, nodes };
              rday(df.day).field = { round, window: win, card: got.card };
              touched.add(df.day); console.log(`${df.day}: field of ${nodes.length} from the ruler's field card (blocks ${win.W0}-${win.W1})`);
            } else if (now.time >= ev.lock) { df.void = "fewer than 2 nodes with entry on the ruler's field card"; touched.add(df.day); }
          } else {
            if (!/^not yet/.test(got.note)) problems.push(`${df.day}: field card: ${got.note}`);
            else console.log(`${df.day}: field card ${got.note}`);
            if (now.time >= ev.lock) { df.void = "no ruler card for the field"; touched.add(df.day); }
          }
        } else if (now.time >= ev.lock) { df.void = "no ruler card for the field"; touched.add(df.day); }
        if (!df.field) continue;
      }
      if (!df.field) {
        const card = cardAt(RACE, ev.cardTime, ev.opens);
        if (card) {
          const fm = await formFor(ev);
          if (fm === "wait") {
            if (now.time >= ev.lock) { df.void = "form couldn't be measured before picks locked"; touched.add(df.day); }
            continue;
          }
          const f = L.makeField(card, o.trials, fm.form, fm.info);
          if (f && !fm.form) f.form = fm.info;          // says why there is no form
          if (f) { df.field = f; touched.add(df.day); console.log(`${df.day}: field of ${f.nodes.length}, c = ${f.c}${fm.form ? `, form over ${fm.info.hours} h: ${f.nodes.map((x: any) => x.r).join(" ")}` : `, no form (${fm.info.note})`}`); }
          else if (now.time >= ev.lock) { df.void = "fewer than 2 nodes at 20 blocks an hour"; touched.add(df.day); }
        } else if (now.time >= ev.lock) { df.void = "no race card for the field"; touched.add(df.day); }
        if (!df.field) continue;
      }
      // ── 2–3. hours and picks ──
      let res = cutsOf(df.field, df.hours);
      while (!res.done && hoursRead < MAX_HOURS_PER_RUN) {
        const i = df.hours.length, t0 = df.start + i * L.CUT, t1 = t0 + L.CUT;
        if (now.libTime < t1) break;
        if (RULER) {
          // The VHP ruler: the hour's own blocks (by block time, both nodes), then its card (made and scored once the
          // ruler's data has the hour; "not yet" waits for the next run).
          // The day's ruler file must hold exactly one card per recorded hour (else the cards and rows would drift apart).
          if (rday(df.day).hours.length !== df.hours.length) { problems.push(`${df.day}: its ruler file has ${rday(df.day).hours.length} hour cards for ${df.hours.length} recorded hours; not recording more (tell the Last Node chat)`); break; }
          const w = await winP(t0, t1);
          let checked = 1;
          if (winC) { const w2 = await winC(t0, t1); if (!sameCounts(w, w2)) { problems.push(`${df.day} hour ${i}: the two nodes disagree about the blocks; tried again next run`); break; } checked = 2; }
          const win = RL.hourWindow(w.from, w.to), round = RL.hourRound(t0), got = RL.cardFor(rulerData(), round, win, true);
          if (!("card" in got)) {
            // The fallback after the 48-hour grace (owner, 13 and 14 Nov 2026): no card for an hour 48 hours after it ended
            // makes the day's event void. No one scores and nothing is returned (a pick costs no tokens). Recorded and alerted.
            if (now.time >= t1 + RULER_GRACE_MS) {
              df.void = NOCARD_48H; touched.add(df.day);
              problems.push(`${df.day} hour ${i}: no ruler card 48 hours after the hour (${got.note}); the event is void (fallback rule)`);
              break;
            }
            if (!/^not yet/.test(got.note)) problems.push(`${df.day} hour ${i}: ${got.note}`); else console.log(`${df.day} hour ${i}: card ${got.note}`);
            break;
          }
          const offsets = i === 0 ? [0] : [];
          const got2: Record<string, Pick[]> = {};
          if (picksRead) {
            let ok = true;
            for (const off of offsets) {
              const mine = await picksRead(pMain, ev.round + off);
              if (pCheck) { const theirs = await picksRead(pCheck, ev.round + off); if (!samePicks(mine, theirs)) { ok = false; break; } }
              got2[off] = mine;
            }
            if (!ok) { problems.push(`${df.day} hour ${i}: the two nodes disagree about the picks; tried again next run`); break; }
          }
          df.hours.push({ i, from: w.from, to: w.to, rows: RL.rowsOf(got.card, df.field.nodes.map((n: any) => n.a)), checked });
          rday(df.day).hours.push({ round, window: win, card: got.card });
          for (const [k, v] of Object.entries(got2)) df.picks[k] = v;
          hoursRead++; touched.add(df.day);
          res = cutsOf(df.field, df.hours);
          console.log(`${df.day} hour ${i}: blocks ${w.from}-${w.to}, out ${res.cuts.filter((c: any) => c.at === i + 1).map((c: any) => `${c.a} (${c.why})`).join(", ") || "none"}, ${res.standing.length} standing`);
          continue;
        }
        // Fix-check N-4 (LNF-3): the window is checked against the FIRST race card taken at or after its end, whose VHP
        // covers the whole window (VHP moved in after the window started is seen); a node that gained VHP since the
        // field's card has its multiplier lowered for this window. The hour waits for that card; only if race-data has
        // none 2 hours after the window ends, the latest card taken by its end (never older than the field's).
        const after = raceCards().find((c) => Number(c.at) >= t1);
        if (!after && now.time < t1 + 2 * 3600000) { console.log(`${df.day} hour ${i}: waiting for the race card after it`); break; }
        const rc = after || raceCards().filter((c) => Number(c.at) < t1 && Number(c.at) >= Number(df.field.at)).pop() || null;
        const w = await winP(t0, t1);
        let checked = 1;
        if (winC) {
          const w2 = await winC(t0, t1);
          if (!sameCounts(w, w2)) { problems.push(`${df.day} hour ${i}: the two nodes disagree about the blocks; tried again next run`); break; }
          checked = 2;
        }
        // The event's one round, read with its first hour (it locked before the start, so it is final by then).
        const offsets = i === 0 ? [0] : [];
        const got: Record<string, Pick[]> = {};
        if (picksRead) {
          let ok = true;
          for (const off of offsets) {
            const mine = await picksRead(pMain, ev.round + off);
            if (pCheck) { const theirs = await picksRead(pCheck, ev.round + off); if (!samePicks(mine, theirs)) { ok = false; break; } }
            got[off] = mine;
          }
          if (!ok) { problems.push(`${df.day} hour ${i}: the two nodes disagree about the picks; tried again next run`); break; }
        }
        const inField = new Set(df.field.nodes.map((n: any) => n.a));
        const blocks: Record<string, number> = {};
        for (const [a, n] of Object.entries(w.counts)) if (inField.has(a)) blocks[a] = n;
        const hh = rc ? L.raceCut(df.field, rc) : {};
        df.hours.push({ i, from: w.from, to: w.to, blocks, checked, card: rc ? Number(rc.at) : null, ...(Object.keys(hh).length ? { hh } : {}) });
        for (const [k, v] of Object.entries(got)) df.picks[k] = v;
        hoursRead++; touched.add(df.day);
        res = L.cutsFrom(df.field, df.hours);
        const cut = res.cuts[res.cuts.length - 1];
        console.log(`${df.day} hour ${i}: blocks ${w.from}-${w.to}, cut ${cut?.a}, ${res.standing.length} standing, checked on ${checked} node(s)`);
      }
    } catch (e) { problems.push(`${df.day}: ${(e as Error).message} (tried again next run)`); }
    if (df.field && !df.void && !cutsOf(df.field, df.hours).done && now.time - df.start > LOOKBACK_MS) { df.void = "not recorded within 3 days"; touched.add(df.day); }
  }

  // ── 4. results and players ──
  for (const df of days.values()) {
    if (!df.field || df.void) { df.cuts = []; df.standing = []; df.winner = null; df.players = []; continue; }
    const res = cutsOf(df.field, df.hours);
    // The ruler: every node still standing out in the same hour leaves no winner: the event is void (no one scores; nothing is returned).
    if (res.done && res.winner === null) { df.void = "every node still standing went out in the same hour"; touched.add(df.day); df.cuts = []; df.standing = []; df.winner = null; df.players = []; continue; }
    df.cuts = res.cuts; df.standing = res.standing; df.winner = res.winner; df.done = res.done;
    // Each player's one pick for the event (the contract keeps one pick per wallet per round): start and backup.
    const by = new Map<string, { start: string; backup: string | null }>();
    for (const row of df.picks["0"] || []) by.set(row[0], { start: row[1], backup: row[3] ?? null });
    const entrants = [...by.entries()].filter(([, m]) => m.start);
    // Ranked flags are read again whenever the event moved this run, else kept from the last run.
    const ranked = touched.has(df.day) && entrants.length ? await rankedRead(entrants.map(([a]) => a), df.week) : new Set<string>((df.players || []).filter((p) => p.ranked).map((p) => p.a));
    df.players = entrants.map(([a, m]) => ({ a, r: L.playerResult(df.field, res, m) })).filter((x) => x.r.entered).map(({ a, r }) => ({
      a, start: r.start, jumpTo: r.jumpTo, out: r.out, survived: r.survived, rode: r.rode, jumped: r.jumped, points: r.points, ranked: ranked.has(a),
    })).sort((x, y) => y.points - x.points || (x.a < y.a ? -1 : 1));
  }

  // ── 5. leaderboards ──
  const rowsOf = (pred: (df: DayFile) => boolean) => {
    const rows: any[] = [];
    for (const df of days.values()) if (pred(df) && !df.void) for (const p of df.players) rows.push({ player: p.a, points: p.points, rode: p.rode, jumped: p.jumped, ranked: p.ranked });
    return rows;
  };
  const view = (rows: any[]) => {
    const rk = new Set(rows.filter((x) => x.ranked).map((x) => x.player));
    return L.places(L.board(rows)).map((x: any) => ({ a: x.player, place: x.place, pts: x.pts, rides: x.rides, jumps: x.jumps, events: x.events, ranked: rk.has(x.player) }));
  };
  const nowW = L.weekOf(now.time), lw = nowW - 1;
  const inWeek = (w: number) => (df: DayFile) => df.week === w && df.start < now.time;
  let lastWeek: any = null, lwRows: any[] = [];
  if (lw >= 0) {
    const evs = [...days.values()].filter(inWeek(lw));
    const complete = evs.length > 0 && evs.every((df) => df.done || df.void) && coversWeek(evs, lw, firstStart);
    const willBeFinal = now.time >= L.weekStart(nowW) + CORRECTION_MS && complete;
    // Free play (owner, 3 Nov): the Staked board is whoever was staked in this game at any time that week (the vault's
    // rule). A day's flags are read while it is recorded, so a wallet that staked later in the week is read again here,
    // once, in the run that makes the week final (the final board is frozen after that).
    const prevBoard = readJson(PREV, "board.json"), prevFinal = prevBoard?.lastWeek?.week === lw && prevBoard?.lastWeek?.final === true;
    if (willBeFinal && !prevFinal) {
      const who = [...new Set(evs.flatMap((df) => (df.void ? [] : df.players.map((p) => p.a))))];
      if (who.length) {
        try {
          const st = await rankedRead(who, lw);
          for (const df of evs) if (!df.void) for (const p of df.players) if (p.ranked !== st.has(p.a)) { p.ranked = st.has(p.a); touched.add(df.day); }
        } catch (e) { problems.push(`week ${lw}: the Staked board couldn't be read again (${(e as Error).message}); tried again next run`); }
      }
    }
    lwRows = view(rowsOf(inWeek(lw)));
    // Fix-check L-4: board.json shows last week's top 2,000 too; the vault file is built from the whole list (and the
    // publish job checks it against the day files, not against board.json).
    lastWeek = { week: lw, start: L.weekStart(lw), final: willBeFinal, rows: lwRows.slice(0, BOARD_ROWS) };
  }
  const full = { today: view(rowsOf((df) => df.day === today.day)), week: view(rowsOf(inWeek(nowW))), allTime: view(rowsOf((df) => df.start < now.time)) };
  const board = {
    v: 1, updated: new Date(now.time).toISOString(),
    // Fix-check LNF-7: the shown lists keep their top 2,000 rows, so board.json stays under the publish job's 2 MB
    // however many wallets ever played (last week too: L-4).
    today: { day: today.day, rows: full.today.slice(0, BOARD_ROWS) },
    week: { week: nowW, start: L.weekStart(nowW), rows: full.week.slice(0, BOARD_ROWS) },
    lastWeek,
    allTime: { rows: full.allTime.slice(0, BOARD_ROWS) },
  };
  // Capacity chat (12 Nov): a player ranked below a list's 2,000 rows still sees their own score. The rows past the cap
  // go to small files by the address's second character (me/<its char code>.json), each with that character's rows and
  // their true places; the page reads yours only when you're not in the list it has.
  const shards = meShards({ today: { day: today.day, rows: full.today }, week: { week: nowW, rows: full.week }, lastWeek: lastWeek ? { week: lastWeek.week, rows: lwRows } : null, allTime: { rows: full.allTime } }, new Date(now.time).toISOString());

  // ── the vault file (hand-off from the Vault v6 chat, 2026-10-28) ──
  // Once last week is final (12 h after it ends, inside the Vault's 3-day window): one file for the hourly bot to post.
  // rows: wallets staked in this game for that week with at least 1 point, scores keeping the board's order and ties.
  // first / second: the Free play board's 1st and 2nd (owner, 3 Nov). Not on the testnet (practice has no vault).
  let vault: any = null;
  if (!o.practice && lastWeek && lastWeek.final && now.time < L.weekStart(nowW) + 3 * L.DAY) {
    const players = lwRows.filter((r: any) => r.pts >= 1).map((r: any) => r.a);
    const staked = await (o.stakedOf ? o.stakedOf(lw, players) : stakedOnBoth((n) => readStakedV6(n, lw, players), o.p, o.check)).catch((e: Error) => { problems.push(`vault file for week ${lw}: ${e.message} (tried again next run)`); return null; });
    if (staked) {
      // Free play prize (owner, 3 Nov; D-081, D-082): 2 + 1 VHP to the week's best free players, from the start.
      const fw = await freeWinners(lwRows.filter((r: any) => !staked.has(r.a)), (who) => freeStatus(lw, who), reachedOf([...days.values()].filter(inWeek(lw)))).catch((e: Error) => { problems.push(`vault file for week ${lw}: free winners: ${e.message} (tried again next run)`); return null; });
      if (fw) {
        for (const pr of fw.problems) problems.push(`vault file for week ${lw}: ${pr}`);
        vault = { game: L.GAME_ID, week: lw, final: true, rows: vaultScores(lwRows.filter((r: any) => staked.has(r.a))), first: fw.first, second: fw.second };
        // The page's medals: the free winners as settled here (only what the vault file pays).
        const paid = new Set([...fw.first, ...fw.second]);
        lastWeek.prizes = fw.prizes.filter((x: any) => paid.has(x.player)).map((x: any) => ({ player: x.player, place: x.place, vhp: x.vhp }));
      }
    }
    else if (!o.stakedOf) console.log(`week ${lw} is final; no vault file yet (the game contract has no per-game stakes before v6)`);
  }
  // ── watch-and-hold (owner, 2026-10-29; fix-check LNF-8/LNF-9) ──
  // A node that signed well above what its multiplier expected across last week's races AND won at least 2 of them
  // holds the week's vault file for the owner's review (vault/HOLD-W<week>.json is published instead). The owner
  // releases a reviewed week with the repository variable LASTNODE_RELEASE_WEEKS (e.g. "3,7").
  let hold: any = null;
  if (vault) {
    const flags = watchWeek([...days.values()].filter(inWeek(lw)));
    const released = (o.releaseWeeks ?? String(E.LASTNODE_RELEASE_WEEKS || "").split(",").map((x) => Number(x.trim())).filter(Number.isInteger)).includes(lw);
    if (flags.length && !released) {
      hold = { game: L.GAME_ID, week: lw, nodes: flags, why: "signed well above its multiplier across the week's races and won at least 2: held for the owner's review" };
      problems.push(`week ${lw}'s vault file is HELD for review: ${flags.map((f) => `${f.a} (${f.q}× expected, ${f.wins} wins)`).join("; ")}. Release it with: gh variable set LASTNODE_RELEASE_WEEKS --body "${lw}"`);
      vault = null;
      if (lastWeek) delete lastWeek.prizes;         // no medals while the week is held
    }
  }
  // The medals stay for the rest of the week once the vault file's window has passed (the same winners).
  if (lastWeek && !lastWeek.prizes && !hold) {
    const pb = readJson(PREV, "board.json")?.lastWeek;
    if (pb && pb.week === lw && Array.isArray(pb.prizes) && pb.prizes.length && !o.practice) lastWeek.prizes = pb.prizes;
  }

  // ── 6. write ──
  fs.mkdirSync(OUT, { recursive: true });
  for (const df of days.values()) {
    if (!df.field && !df.void) continue;
    known.add(df.day);
    fs.writeFileSync(path.join(OUT, dName(df.day)), JSON.stringify(df) + "\n");
    // The ruler's cards of the day (mainnet), beside it.
    if (RULER && (df.field || rdays.has(df.day))) { const rd = rday(df.day); if (rd.field || rd.hours.length) fs.writeFileSync(path.join(OUT, `R${df.day}.json`), JSON.stringify(rd) + "\n"); }
  }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ v: 1, updated: new Date(now.time).toISOString(), days: [...known].sort(), contract: contract || null, game: L.GAME_ID, ...(o.practice ? { since } : {}) }) + "\n");
  fs.writeFileSync(path.join(OUT, "board.json"), JSON.stringify(board) + "\n");
  if (shards.size) fs.mkdirSync(path.join(OUT, "me"), { recursive: true });
  for (const [k, v] of shards) fs.writeFileSync(path.join(OUT, "me", `${k}.json`), JSON.stringify(v) + "\n");
  // Capacity chat (12 Nov): warn in every run when a file is past 60% of the publish job's 2 MB limit, weeks before it bites.
  for (const f of sizeWatch(OUT)) problems.push(f);
  if (vault) { fs.mkdirSync(path.join(OUT, "vault"), { recursive: true }); fs.writeFileSync(path.join(OUT, "vault", `W${vault.week}.json`), JSON.stringify(vault) + "\n"); }
  if (hold) { fs.mkdirSync(path.join(OUT, "vault"), { recursive: true }); fs.writeFileSync(path.join(OUT, "vault", `HOLD-W${hold.week}.json`), JSON.stringify(hold) + "\n"); }
  for (const pr of problems) console.log(`::warning::${pr}`);
  return { problems, days, board, vault, hold };
}

/** The rows past BOARD_ROWS of each list, by the address's second character (its char code): { k → file }. Exported for
 *  the tests; the publish job rebuilds last week's from the day files. */
export function meShards(lists: Record<string, any>, updated: string): Map<string, any> {
  const out = new Map<string, any>();
  const file = (k: string) => { let f = out.get(k); if (!f) { f = { v: 1, updated, today: { day: lists.today.day, rows: [] }, week: { week: lists.week.week, rows: [] }, lastWeek: lists.lastWeek ? { week: lists.lastWeek.week, rows: [] } : null, allTime: { rows: [] } }; out.set(k, f); } return f; };
  for (const part of ["today", "week", "lastWeek", "allTime"]) {
    const l = lists[part];
    if (!l) continue;
    // boardPlace: the row's place on its own board (Staked: ranked rows; Free play: the rest), as board.js counts them.
    let nr = 0, nf = 0;
    l.rows.forEach((r: any, i: number) => { const bp = r.ranked ? ++nr : ++nf; if (i >= BOARD_ROWS) file(String(r.a.charCodeAt(1)))[part].rows.push({ ...r, boardPlace: bp }); });
  }
  return out;
}
/** The files in the output past 60% of the publish job's 2 MB limit (Capacity chat, 12 Nov). */
export const SIZE_LIMIT = 2048 * 1024, SIZE_WARN = Math.floor(SIZE_LIMIT * 0.6);
export function sizeWatch(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, rel + f.name + "/"); else { const n = fs.statSync(p).size; if (n > SIZE_WARN) out.push(`${rel}${f.name} is ${(n / 1048576).toFixed(2)} MB, past 60% of the 2 MB publish limit: tell the Last Node chat (compact the rows; Capacity chat, 12 Nov)`); } } };
  if (fs.existsSync(dir)) walk(dir, "");
  return out;
}

/** Every event of a week from the game's first recorded day on is present (recorded, finished or void); a week the
 *  game started in mid-week needs only its days from the first one. */
function coversWeek(evs: DayFile[], w: number, firstStart: number): boolean {
  const want = new Set<string>();
  const first = Math.min(firstStart, ...evs.map((e) => e.start));
  for (let t = L.weekStart(w); t < L.weekStart(w + 1); t += L.PERIOD) { const ev = L.eventOf(t); if (ev.start >= first && ev.start < L.weekStart(w + 1)) want.add(ev.day); }
  return [...want].every((d) => evs.some((e) => e.day === d));
}

// ── the testnet (testnet/lastnode.json) ──
export const MAINNET_CHAIN_ID = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
/** The testnet settings, checked: the testnet chain (never mainnet), and games the Picks contract (time lock) accepts. */
export function readNetConfig(file: URL | string = new URL("../../ops/testnet/config/lastnode.json", import.meta.url)) {
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!c || c.v !== 1 || c.network !== "koinos-foundation-testnet" || !Array.isArray(c.games) || !c.games.length) throw new Error("testnet/lastnode.json is not a testnet Last Node Standing config");
  if (c.chainId === MAINNET_CHAIN_ID) throw new Error("testnet/lastnode.json names the MAINNET chain id: refusing");
  for (const g of c.games) L0.forGame(g);   // throws on settings the contract would refuse
  return c;
}
/** The testnet Picks contract: the one Who Signs Block X's testnet settings name (one contract for both games). */
export function testnetPicks(file: URL | string = new URL("../../ops/testnet/config/blockx.json", import.meta.url)): string | null {
  try { const b = JSON.parse(fs.readFileSync(file, "utf8")); return b && b.network === "koinos-foundation-testnet" && isAddr(b.picks) ? b.picks : null; } catch { return null; }
}
/** The race cards for the field, copied from the public race-data branch into dir (only plain week files). */
/** Testnet: add the published VHP samples to a local cache file (only well-formed samples, 60 hours kept). */
async function cacheSamples(url: string, dir: string, now: number) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cache.json");
  const have = new Map<number, any>();
  for (const x of readJson(dir, "cache.json")?.samples ?? []) if (x && Number.isInteger(x.at)) have.set(x.at, x);
  try {
    const r = await fetch(url, { cache: "no-store" } as any);
    const j: any = r.ok ? await r.json() : null;
    for (const x of j?.samples ?? []) if (x && Number.isInteger(x.at) && x.at <= now + 600000 && x.vhp && typeof x.vhp === "object") have.set(x.at, { at: x.at, height: Number(x.height) || 0, vhp: x.vhp });
  } catch { /* none this run */ }
  const samples = [...have.values()].filter((x) => x.at > now - 60 * 3600000).sort((a, b) => a.at - b.at);
  fs.writeFileSync(file, JSON.stringify({ v: 1, updated: new Date(now).toISOString(), samples }));
}
async function fetchRaceCards(base: string, dir: string, t: number) {
  fs.mkdirSync(dir, { recursive: true });
  const w = M.weekOf(t);
  for (const k of [w - 1, w, w + 1]) {
    if (k < 0) continue;
    try {
      const r = await fetch(`${base}${wName(k)}`, { cache: "no-store" } as any);
      if (!r.ok) continue;
      const j: any = await r.json();
      if (j && j.v === 1 && j.week === k && Array.isArray(j.races)) fs.writeFileSync(path.join(dir, wName(k)), JSON.stringify(j));
    } catch { /* that week isn't published */ }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.includes("--testnet")) return run({ p: nodeProvider(RPC), check: RPC_CHECK ? nodeProvider(RPC_CHECK) : null });
  // Testnet practice: picks on the testnet Picks contract (test KOIN); the race on the real MAINNET producers, read only
  // (the testnet has a single producer). Never writes outside testnet-data/.
  const cfg = readNetConfig();
  const i = argv.indexOf("--game"), id = i >= 0 ? Number(argv[i + 1]) : cfg.games[0].id;
  const game = cfg.games.find((g: any) => g.id === id);
  if (!game) throw new Error(`game ${id} is not in testnet/lastnode.json`);
  const picks = testnetPicks();
  if (!picks) throw new Error("testnet/blockx.json has no testnet Picks contract yet (npm run picks -- upload --testnet --send)");
  const tp = new Provider([E.TESTNET_RPC || cfg.rpc]);
  const tChain = await withRetry("testnet chain id", () => tp.getChainId());
  if (tChain === MAINNET_CHAIN_ID || (cfg.chainId && tChain !== cfg.chainId)) throw new Error(`the node at ${cfg.rpc} is on chain ${tChain}, not the testnet in testnet/lastnode.json`);
  // The mainnet nodes for the blocks (MAINNET_RPC / MAINNET_RPC_CHECK, never .env.testnet's RPC).
  const mr = E.MAINNET_RPC || cfg.mainnet.rpc, mc = E.MAINNET_RPC_CHECK || cfg.mainnet.check;
  const p = new Provider([mr]), check = mc && mc !== "off" && nodeKey(mc) !== nodeKey(mr) ? new Provider([mc]) : null;
  for (const [node, url] of [[p, mr], [check, mc]] as const) if (node && (await withRetry("mainnet chain id", () => node.getChainId())) !== MAINNET_CHAIN_ID) throw new Error(`${url} is not a Koinos mainnet node (the race is read from mainnet)`);
  // Audit LN-26: the testnet's own names (TESTNET_…), so a mainnet LASTNODE_OUT / LASTNODE_PREV / RACE_DATA left in the
  // shell can't redirect it, and every folder must be inside testnet-data/.
  const inTestData = (d: string) => { const r = path.relative(path.resolve("testnet-data"), path.resolve(d)); if (!r || r.startsWith("..") || path.isAbsolute(r)) throw new Error(`${d} is not inside testnet-data/`); return d; };
  const raceDir = inTestData(E.TESTNET_RACE_DATA || "testnet-data/race-cards");
  await fetchRaceCards(cfg.mainnet.raceData, raceDir, Date.now());
  // Fix-check LNF-4 on the testnet: the published file keeps 8 hours of VHP samples, so each run adds them to a local
  // cache (60 hours kept); form starts once it holds 48 hours.
  const samplesDir = inTestData(E.TESTNET_SAMPLES || "testnet-data/vhp-samples");
  await cacheSamples(cfg.mainnet.samples || "https://raw.githubusercontent.com/bawcejawn/KnodeGames2/race-samples/vhp-samples.json", samplesDir, Date.now());
  const koin = new Contract({ id: cfg.koin, abi: (await import("koilib")).utils.tokenAbi, provider: tp });
  // Ranked on the testnet: holds at least 1 test KOIN (test wallets have no VHP).
  const rankedOf = async (who: string[]) => {
    const out = new Set<string>();
    for (const a of who) { try { const b: any = await (koin.functions as any).balanceOf({ owner: a }); if (BigInt(b?.result?.value || "0") >= ONE_VHP) out.add(a); } catch { /* not ranked */ } }
    return out;
  };
  const dir = `testnet-data/lastnode-${id}`;
  return run({ p, check, pp: tp, pcheck: null, game, practice: true, picksContract: picks, rankedOf, raceDir, samplesDir, out: inTestData(E.TESTNET_LASTNODE_OUT || dir), prev: inTestData(E.TESTNET_LASTNODE_PREV || dir) });
}

/** Fix-check N-12: the process ends as soon as a run has written its files (a read that lost to a deadline, or a
 *  socket left open, can't keep the job running into its timeout). Exported for the tests. */
export function finish(p: Promise<unknown>) {
  return p.then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) finish(main());
