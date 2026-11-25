/**
 * Read-only rows for the admin page's Health checks area (M-593 items 6 and 7) and its "This week" calendar (item 5).
 *
 * Nothing here signs, sends or holds a key or a token:
 *   - recorders: when each recorder last published, read from its public file on the data branches
 *     (raw.githubusercontent.com, no token), and a warning when that is more than 90 minutes ago;
 *   - site data: which games have a board and results entry in web/games.json (this PC's copy) and which have the
 *     free-prize switch ON (the public prize-settings file);
 *   - calendar: ops/admin/calendar.json, a plain file a chat changes by a small pull request.
 */
import fs from "node:fs";
import path from "node:path";
import { switchFor, weekOf, type Switches } from "../../bot/free-prizes.ts";

/** The public data branches, read without a token. ADMIN_DATA_BASE replaces it in tests only. */
export const DATA_BASE = "https://raw.githubusercontent.com/bawcejawn/KnodeGames2/";
export const LATE_MIN = 90;

/** Each recorder and the public file it rewrites when it publishes (its "updated" field is the time it was written). */
export const RECORDERS = [
  { id: "lastnode", name: "Last Node Standing", file: "games-data/lastnode/index.json", runs: "3 times an hour (:02, :22, :42), started by the Worker once #103 is live; until then by hand (D-799)" },
  { id: "combo", name: "Combo Card", file: "games-data/combo/index.json", runs: "hourly at :52, once COMBO_ENABLED is on (by Sun 29 Nov)" },
  { id: "race", name: "Producer Race", file: "race-data/index.json", runs: "hourly at :37" },
  { id: "blockx", name: "Who Signs Block X", file: "games-data/blockx/board.json", runs: "hourly at :47" },
] as const;

export type RecorderState = "ok" | "late" | "none" | "error";
/** ok: published in the last 90 minutes; late: older; none: no file yet (not started); error: could not read it. */
export function judge(now: number, updated: string | null | undefined, status: number | "error", lateMin = LATE_MIN): { state: RecorderState; ageMin: number | null } {
  if (status === 404) return { state: "none", ageMin: null };
  if (status !== 200) return { state: "error", ageMin: null };
  const t = Date.parse(String(updated ?? ""));
  if (!Number.isFinite(t)) return { state: "error", ageMin: null };
  const ageMin = Math.max(0, Math.round((now - t) / 60_000));
  return { state: ageMin > lateMin ? "late" : "ok", ageMin };
}

async function getJson(url: string): Promise<{ status: number | "error"; body: any }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "cache-control": "no-cache" } });
    if (r.status !== 200) return { status: r.status, body: null };
    return { status: 200, body: await r.json() };
  } catch { return { status: "error", body: null }; }
}

export async function recorderRows(now = Date.now(), base = process.env.ADMIN_DATA_BASE || DATA_BASE) {
  return Promise.all(RECORDERS.map(async (r) => {
    const { status, body } = await getJson(base + r.file);
    const j = judge(now, body?.updated, status);
    return { id: r.id, name: r.name, file: r.file, runs: r.runs, updated: body?.updated ?? null, ...j };
  }));
}

/** web/games.json ids → game ids (the vault's, or the Picks game for the free-only ones). */
export const SITE_GAME_IDS: Record<string, number> = { questions: 1, blockx: 2, survivor: 3, fantasy: 4, golf: 6, race: 7, combo: 8, bracket: 9, lastnode: 13, overunder: 16, vs: 17 };
/** Games whose free prize follows their vault registration when no switch is set (all added with --free). */
const VAULT_FREE_DEFAULT = new Set([1, 2, 3, 4, 6, 7, 8, 9, 13, 16]);

export type SiteRow = { id: string; name: string; game: number | null; board: boolean; results: boolean; prizeThisWeek: string; prizeNextWeek: string };
export function siteRows(games: any, switches: Switches | null, now = Date.now()): SiteRow[] {
  const list: any[] = Array.isArray(games) ? games : Array.isArray(games?.games) ? games.games : [];
  const w = weekOf(now);
  const prize = (g: number | null, week: number) => {
    if (g === null) return "?";
    if (!switches) return "could not read";
    const v = switchFor(switches, g, week);
    if (v === true) return "ON";
    if (v === false) return "OFF";
    return VAULT_FREE_DEFAULT.has(g) ? "ON (no switch set: follows its vault registration)" : "none (no switch set)";
  };
  return list.map((x) => {
    const game = SITE_GAME_IDS[x.id] ?? null;
    return { id: String(x.id), name: String(x.name ?? x.id), game, board: !!x.board, results: x.results === true, prizeThisWeek: prize(game, w), prizeNextWeek: prize(game, w + 1) };
  });
}

export async function siteData(root: string, now = Date.now(), base = process.env.ADMIN_DATA_BASE || DATA_BASE) {
  let games: any = null, gamesError = "";
  try { games = JSON.parse(fs.readFileSync(path.join(root, "web", "games.json"), "utf8")); } catch (e: any) { gamesError = `web/games.json could not be read: ${e?.message ?? e}`; }
  const p = await getJson(base + "prize-settings/free-prizes.json");
  const switches = p.status === 200 && p.body && typeof p.body === "object" ? (p.body as Switches) : null;
  return { week: weekOf(now), rows: games ? siteRows(games, switches, now) : [], gamesError, prizesRead: !!switches };
}

/** ops/admin/calendar.json: checked so a broken edit shows a clear message instead of a blank screen. */
export type CalItem = { date: string; time: string; what: string; card?: string; kind: string };
export const CAL_KINDS = ["chain", "merge", "github", "check", "freeze", "away", "info"] as const;
export function checkCalendar(c: any): string {
  if (!c || typeof c !== "object" || !Array.isArray(c.items)) return "calendar.json must be an object with an items list";
  if (typeof c.updated !== "string" || !c.updated.trim()) return "calendar.json needs an \"updated\" line";
  for (const [i, it] of c.items.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(it?.date))) return `item ${i + 1}: date must look like 2026-11-25`;
    if (typeof it.time !== "string" || !it.time.trim()) return `item ${i + 1}: time is missing`;
    if (typeof it.what !== "string" || it.what.trim().length < 5) return `item ${i + 1}: what is missing`;
    if (!(CAL_KINDS as readonly string[]).includes(it.kind)) return `item ${i + 1}: kind must be one of ${CAL_KINDS.join(", ")}`;
    if (it.card !== undefined && typeof it.card !== "string") return `item ${i + 1}: card must be a card id`;
  }
  return "";
}
export function readCalendar(root: string): { error: string; calendar: any } {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, "ops", "admin", "calendar.json"), "utf8"));
    const error = checkCalendar(c);
    return { error, calendar: error ? null : c };
  } catch (e: any) { return { error: `ops/admin/calendar.json could not be read: ${e?.message ?? e}`, calendar: null }; }
}
