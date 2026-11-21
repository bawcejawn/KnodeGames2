// Block X board on KG parts (Block X chat; the shape is claude/blockx/BLOCKX-BOARD-PARTS-SHAPE-2026-11-13.md).
// The board's four lists (today, week, lastWeek, allTime) each get a parts folder holding EVERY row: `top` (the top 100,
// for pages only) and 16 player shards p/0..p/f. board.json v2 keeps only the top 100 per list plus `players`, `parts` and
// `hash`. This module is pure (no network): the recorder calls it only when BLOCKX_PARTS=on, so board.json stays v1
// until the owner switches it (after Golf's reader and the Vault fallback reader are merged).
import * as fs from "node:fs";
import * as path from "node:path";
import * as KP from "../../kit/parts/parts.inline.mjs";

export const GAME = "blockx";
export const TOP_ROWS = 100;
export const SHARDS = 16;
/** The row columns, the same names as the v1 rows (v1's `a` is `player`); pts is in hundredths, ranked is 0/1. */
export const COLS: [string, string][] = [["player", "a"], ["place", "i"], ["boardPlace", "i"], ["pts", "i"], ["correct", "i"], ["picks", "i"], ["days", "i"], ["lastCorrect", "i"], ["ranked", "b"]];
export const EXPECT17: string[] = [...Array.from({ length: SHARDS }, (_, i) => `p/${i.toString(16)}`), "top"];

/** The folder of a list: week N -> BW005 (3 digits), a UTC day -> BD-20261123, all time -> BA. */
export const weekFolder = (week: number) => `BW${String(week).padStart(3, "0")}`;
export const dayFolder = (day: string) => `BD-${day.replace(/-/g, "")}`;
export const ALL_TIME_FOLDER = "BA";

type ViewRow = { a: string; place: number; boardPlace: number; pts: number; correct: number; picks: number; days: number; lastCorrect: number; ranked: boolean };
const toRow = (x: ViewRow) => [x.a, x.place, x.boardPlace, x.pts, x.correct, x.picks, x.days, x.lastCorrect, x.ranked ? 1 : 0];

/** The 17 encoded parts of one list. Every part exists, even with no rows (a reader never has to guess). */
export function encodeList(file: string, rows: ViewRow[]) {
  const shards: any[][] = Array.from({ length: SHARDS }, () => []);
  const seen = new Set<string>();
  for (const x of rows) {
    if (seen.has(x.a)) throw new Error(`${file}: ${x.a} is in the board twice`);
    seen.add(x.a);
    shards[parseInt(KP.shardOf(x.a, SHARDS), 16)].push(toRow(x));
  }
  const parts = shards.map((r, i) => KP.encodePart({ game: GAME, file, part: `p/${i.toString(16)}`, cols: COLS, rows: r }));
  parts.push(KP.encodePart({ game: GAME, file, part: "top", cols: COLS, rows: rows.slice(0, TOP_ROWS).map(toRow) }));
  return parts;
}

/** Writes one list's folder under `outDir` (<outDir>/<file>/...). state is "final" only for a final lastWeek. Returns the manifest hash and any size warnings. */
export function writeList(outDir: string, file: string, week: number, state: "pending" | "final", rows: ViewRow[], writtenAt: number) {
  const r = KP.writeParts(path.join(outDir, file), { game: GAME, file, week, state, unit: "p", expect: EXPECT17, shards: SHARDS, writtenAt }, encodeList(file, rows));
  return { hash: r.manifest.hash as string, warnings: (r.warnings ?? []).map((w: any) => w.message as string) };
}

/** What a list carries in board.json v2, besides its v1 fields. */
const withParts = (list: any, folder: string, hash: string, rows: ViewRow[]) => ({ ...list, players: rows.length, parts: folder, hash, rows: rows.slice(0, TOP_ROWS) });

/**
 * board v1 -> board v2, and the four folders written. `board` is the recorder's v1 board (full rows in each list).
 * A list with no rows is written too (empty top and 16 empty shards). lastWeek may be null (nothing to write for it).
 */
export function writeBoardV2(outDir: string, board: any, writtenAt: number) {
  const warnings: string[] = [];
  const put = (list: any, folder: string, week: number, state: "pending" | "final") => {
    const rows: ViewRow[] = list.rows ?? [];
    const w = writeList(outDir, folder, week, state, rows, writtenAt);
    warnings.push(...w.warnings);
    return withParts(list, folder, w.hash, rows);
  };
  const v2: any = { v: 2, updated: board.updated };
  v2.today = put(board.today, dayFolder(board.today.day), 0, "pending");
  v2.week = put(board.week, weekFolder(board.week.week), board.week.week, "pending");
  v2.lastWeek = board.lastWeek ? put(board.lastWeek, weekFolder(board.lastWeek.week), board.lastWeek.week, board.lastWeek.final ? "final" : "pending") : board.lastWeek;
  v2.allTime = put(board.allTime, ALL_TIME_FOLDER, 0, "pending");
  return { board: v2, warnings };
}

/**
 * The reader's steps (shape doc section 5) for one list of a v2 board, from a checked-out games-data directory:
 * the manifest's hash equals the list's `hash`; a final list's manifest is final; the rows are the 16 shards only;
 * each address is in exactly one shard, the right one; the total equals `players`. Anything else is a failed read
 * (an Error): never the 100 `top` rows used as the field. Returns the rows with `a` = player and ranked as a boolean.
 */
export function readList(baseDir: string, list: any, week: number) {
  const fail = (m: string) => { throw new Error(`blockx ${list?.parts}: ${m}`); };
  if (!list || typeof list.parts !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(list.parts)) fail("the list names no parts folder");
  const dir = path.join(baseDir, list.parts);
  let m: any;
  try { m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")); } catch { fail("manifest.json is missing or unreadable"); }
  if (m.game !== GAME || m.file !== list.parts || m.week !== week) fail("the manifest is for another game, file or week");
  if (m.hash !== list.hash) fail("the manifest hash is not the board's hash (the board and the folder are from different runs)");
  if (list.final === true && m.state !== "final") fail("the list is final but its folder is not");
  const want = new Set(EXPECT17);
  const got = new Set<string>((m.parts ?? []).map((p: any) => p.part));
  for (const p of want) if (!got.has(p)) fail(`part ${p} is missing`);
  const out: any[] = [], seen = new Set<string>();
  for (const e of m.parts) {
    if (!e.part.startsWith("p/")) continue;
    const text = fs.readFileSync(path.join(dir, e.name), "utf8");
    const d = KP.decodePart(text);
    for (const r of d.rows) {
      if (KP.shardOf(r.player, SHARDS) !== e.part.slice(2)) fail(`${r.player} is in the wrong shard`);
      if (seen.has(r.player)) fail(`${r.player} is in the folder twice`);
      seen.add(r.player);
      out.push({ ...r, a: r.player, ranked: r.ranked === 1 });
    }
  }
  if (out.length !== list.players) fail(`${out.length} rows in the shards, the board says ${list.players}`);
  return out.sort((x, y) => x.place - y.place || (x.a < y.a ? -1 : 1));
}
