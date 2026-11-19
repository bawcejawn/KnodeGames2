/**
 * Audit AB-061 (Audit Bot QA audit of a8d0569, 16 Nov 2026), owner's choice O-31 option A (16 Nov): winners stay the
 * top 30% of staked wallets by score, so one player who copies the same picks into many wallets can take extra seats.
 * The owner wants to see it: once a week is sealed, the bot compares the picks of the week's staked wallets with points
 * and emails the owner once per game-week if two or more made exactly the same picks. Nothing is held or changed: it is
 * a notice for the owner's review month.
 *
 * The picks come from each game's own published week file, next to its vault folder (race-data:W004.json,
 * games-data:bracket/W004.json). Games whose week file doesn't list every wallet's picks yet are not covered (COVERED).
 */

/** A wallet's picks for the week as one comparable text, per game id. Unknown shape → empty map (nothing compared). */
export const PICKS_OF: Record<number, (weekFile: any) => Map<string, string>> = {
  // Producer Race: races[].result.picks = [player, horse, time, won, 0, show]; a wallet's week = every (race, horse).
  7: (wf) => {
    const by = new Map<string, string[]>();
    for (const [i, race] of (Array.isArray(wf?.races) ? wf.races : []).entries()) {
      const id = String(race?.start ?? i);
      for (const p of Array.isArray(race?.result?.picks) ? race.result.picks : []) {
        if (!Array.isArray(p) || typeof p[0] !== "string" || typeof p[1] !== "string") continue;
        (by.get(p[0]) ?? by.set(p[0], []).get(p[0])!).push(`${id}:${p[1]}`);
      }
    }
    return new Map([...by].map(([a, l]) => [a, l.sort().join(",")]));
  },
  // Producer Bracket: picks.rows = [player, bracket number, time]; the number is the whole bracket.
  9: (wf) => new Map((Array.isArray(wf?.picks?.rows) ? wf.picks.rows : [])
    .filter((r: any) => Array.isArray(r) && typeof r[0] === "string" && r[1] !== undefined && r[1] !== null)
    .map((r: any) => [r[0], String(r[1])] as [string, string])),
};
export const COVERED = Object.keys(PICKS_OF).map(Number);

/** The game's week file next to its vault folder: "race-data:vault" → "race-data:W004.json". */
export function weekFileSpec(source: string, w: number): string {
  const i = source.indexOf(":"), branch = source.slice(0, i), dir = source.slice(i + 1).replace(/\/+$/, "");
  const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/") + 1) : "";
  return `${branch}:${parent}W${String(w).padStart(3, "0")}.json`;
}

/** Groups of two or more of `wallets` whose picks are exactly the same (wallets with no picks are left out),
 *  largest group first. */
export function identicalGroups(picks: Map<string, string>, wallets: string[]): string[][] {
  const by = new Map<string, string[]>();
  for (const a of new Set(wallets)) {
    const p = picks.get(a);
    if (!p) continue;
    (by.get(p) ?? by.set(p, []).get(p)!).push(a);
  }
  return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort()).sort((x, y) => y.length - x.length || (x[0] < y[0] ? -1 : 1));
}

/** The owner's notice for one game-week, or "" when there's nothing to report. */
export function identicalNotice(name: string, w: number, groups: string[][]): string {
  if (!groups.length) return "";
  const shown = groups.slice(0, 5).map((g) => `${g.length} wallets (${g.slice(0, 6).join(", ")}${g.length > 6 ? " …" : ""})`).join("; ");
  return `${name} week ${w}: some winning wallets may be playing as one: ${groups.length} group(s) made exactly the same picks: ${shown}${groups.length > 5 ? " …" : ""}. Nothing is held (audit AB-061, owner's option A): look at them, and say in the Library chat if the rules should change.`;
}
