// Last Node Standing's made-up chain for the VHP ruler (publish and recorder tests): the 11 test nodes (NODES, equal
// VHP), one block every 3 s from 20 Oct 2026, signers in turn. In every event hour i (14:00 UTC + i h, i < 10) the node
// CUT_ORDER[i] signs at half its rate, so the ruler's hour card gives it the lowest fpct and it is cut: the old fixed history
// (one cut an hour in CUT_ORDER, NODES[0] wins) comes out of real ruler cards. `boost` gives a node more blocks in event
// hours (a node doing better than expected, for watch-and-hold). Pure test code.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
await import(pathToFileURL(path.resolve(APP, "ruler/vhp-ruler.js")).href);
await import(pathToFileURL(path.resolve(APP, "web/lastnode-math.js")).href);
export const R = globalThis.KRuler, L = globalThis.KLastNode;
export const A = (c) => "1" + c.repeat(33);
export const NODES = Array.from({ length: 11 }, (_, i) => A("ABCDEFGHJKL"[i]));
export const CUT_ORDER = NODES.slice(1), WINNER = NODES[0];
export const T_FIRST = Date.parse("2026-10-20T00:00:00Z"), T_END = Date.parse("2026-11-24T00:00:00Z"), FROM = 2000000;
export const N = (T_END - T_FIRST) / 3000;
export const UNIT = 10n ** 14n, BURN = 408000000n;   // the network total (11 × 1,000 × UNIT) stays inside the ruler's 64-bit sums
const H = 3600000;
/** Block index of the first block at or after time t. */
export const idxAt = (t) => Math.max(0, Math.ceil((t - T_FIRST) / 3000));
export const heightAt = (t) => FROM + idxAt(t);
/** The hour index of an event hour at time t (14:00 UTC start, hours 0..9), or -1. */
const eventHour = (t) => { const s = t - (Math.floor(t / 86400000) * 86400000 + 14 * H); return s >= 0 && s < 10 * H ? Math.floor(s / H) : -1; };
const cache = new Map();
/** The chain for a boost ({ node: blocks an hour, of 100 normal }): signers, ids. */
export function chainOf(boost = {}) {
  const key = JSON.stringify(boost);
  if (cache.has(key)) return cache.get(key);
  const who = new Array(N), ids = new Array(N);
  let cur = -2, seq = [], k = 0;
  for (let i = 0; i < N; i++) {
    const t = T_FIRST + i * 3000, hr = eventHour(t), hid = Math.floor(t / H);
    if (hid !== cur) {
      cur = hid; k = 0;
      // the hour's turn order: each node `w` slots (cut node 5, boosted node boost/100 × 10, others 10)
      seq = [];
      for (const a of NODES) { const w = hr >= 0 ? (a === CUT_ORDER[hr] ? 5 : Math.round(((boost[a] ?? 100) / 100) * 10)) : 10; for (let j = 0; j < w; j++) seq.push(a); }
      // spread the slots evenly (interleave by position) so every node signs steadily through the hour
      seq = seq.map((a, j) => [a, (j % 10) * 1000 + Math.floor(j / 10)]).sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1)).map((x) => x[0]);
    }
    who[i] = seq[k++ % seq.length];
    ids[i] = "0x1220" + crypto.createHash("sha256").update(`lastnode block ${FROM + i}`).digest("hex");
  }
  const out = { who, ids };
  cache.set(key, out);
  return out;
}
/** The ruler's timeline of a chain (each node starts with 1,000 VHP, less each block's burn). */
export function timelineOf(boost = {}) {
  const c = chainOf(boost), bal = new Map(NODES.map((a) => [a, 1000n * UNIT])), deltas = [];
  for (let i = 0; i < N; i++) { deltas.push({ h: FROM + i, a: c.who[i], d: -BURN, inc: 0n }); bal.set(c.who[i], bal.get(c.who[i]) - BURN); }
  const to = FROM + N - 1;
  return { from: FROM, to, signers: c.who.slice(), ids: c.ids.slice(), deltas, anchors: Object.fromEntries([...bal].map(([a, v]) => [a, { h: to, v }])), bad: [], rebuilt: [], pending: [] };
}
const ledgers = new Map(), tlFiles = new Map();
// Each timeline file is ~185 MB: remove their folders when the test process exits (24 Nov: every run left them in
// /tmp and filled a 1 GB disk after a few dozen runs).
process.on("exit", () => { for (const f of tlFiles.values()) { try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch { /* best effort */ } } });
export function ledgerOf(boost = {}) { const k = JSON.stringify(boost); if (!ledgers.has(k)) ledgers.set(k, R.ledger(timelineOf(boost))); return ledgers.get(k); }
/** The timeline as a JSON file for the publish job's Python ruler (LASTNODE_RULER_TL). */
export function tlFileOf(boost = {}) {
  const k = JSON.stringify(boost);
  if (!tlFiles.has(k)) { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ln-tl-")), "tl.json"); fs.writeFileSync(f, JSON.stringify(timelineOf(boost), (_, v) => (typeof v === "bigint" ? v.toString() : v))); tlFiles.set(k, f); }
  return tlFiles.get(k);
}
/** The fake node's view of this chain: every height has its time (signers aren't read by the publish job). */
export const linear = () => ({ from: FROM, to: FROM + N - 1, t0: T_FIRST, dt: 3000 });
