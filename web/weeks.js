/* Knode Games: what players call a week (D-063, changed 21 Nov 2026 by the owner). A week is the platform's vault week
   number everywhere: on chain, in every file and on the site. Counted from Mon 19 Oct 2026 00:00 UTC (week 0), so the
   week of Mon 16 Nov is Week 4, Mon 23 Nov is Week 5, and so on. The week of Mon 9 Nov (vault week 3) keeps the label
   "Test week": it paid nothing and its rewards rolled into Week 4's pool. Earlier weeks are shown by their date
   ("Week of 2 Nov") so nobody reads them as paying weeks. The table of all labels is in .ai/platform/KOINOS.md → Time.
   KWeeks.label(w) → "Week 4" / "Test week" / "Week of 2 Nov"; KWeeks.short(w) → "4" / "Test" / "2 Nov" (for
   "This week (…)" buttons). KWeeks.isTest(w): the test week. */
(() => {
  "use strict";
  const G = typeof window !== "undefined" ? window : globalThis;
  const GENESIS_MS = 1792368000000;            // Mon 19 Oct 2026 00:00 UTC, vault week 0
  const WEEK_MS = 7 * 86400000;
  const FIRST = 4;                             // vault week 4 = Mon 16 Nov 2026 = "Week 1"
  const TEST = 3;                              // vault week 3 = Mon 9 Nov 2026 = "Test week" (pays nothing)
  const n = (w) => { const x = Number(w); return Number.isFinite(x) ? Math.trunc(x) : NaN; };
  const date = (w) => new Date(GENESIS_MS + n(w) * WEEK_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const isTest = (w) => n(w) === TEST;
  const short = (w) => (!Number.isFinite(n(w)) ? "?" : n(w) >= FIRST ? String(n(w)) : isTest(w) ? "Test" : date(w));
  const label = (w) => (!Number.isFinite(n(w)) ? "Week" : n(w) >= FIRST ? `Week ${n(w)}` : isTest(w) ? "Test week" : `Week of ${date(w)}`);
  /** The vault week a time falls in. */
  const of = (ms) => Math.floor((Number(ms) - GENESIS_MS) / WEEK_MS);
  G.KWeeks = { label, short, of, isTest, FIRST, TEST, GENESIS_MS, WEEK_MS };
})();
