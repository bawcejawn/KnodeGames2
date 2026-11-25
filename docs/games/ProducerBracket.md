# Producer Bracket (game 9)

> **Sources:** the code on `main` (`web/bracket-math.js`, `web/bracket.js`, `bot/games/bracket.ts`, `bot/games/bracket-ruler.ts`, the `record_bracket` job and the publish job's Bracket check in `.github/workflows/games.yml`), the live `games-data:bracket/` files, `DECISIONS.md` (D-019, D-058, D-062, D-086, D-087, D-125, D-141), and the Bracket chat's notes in the Claude project (`claude/bracket/`). **Last updated:** Wed 25 Nov 2026 (Bracket chat). It replaces the 5 Nov version, which described the pre-launch schedule (Saturday seeding, Sunday lock, rounds from Monday).
> **Legend:** ✅ verified in the code or live data · 💬 from a chat · 👤 owner

## Purpose
A weekly knockout of Koinos block producers, like a March Madness bracket. A player picks the winner of every matchup before the week starts; one round is played each day on real blocks. This chat also built the platform-wide **VHP standard** that every game uses to measure VHP the same way (D-058).

## The week (all times UTC; ET in brackets) ✅ `bracket-math.js`, `bracket.js`
| When | What |
|---|---|
| **Sun 00:00** (Sat 7 PM) | **Seeding**, once that block is irreversible, read on two nodes that must agree. Never changed afterwards (it is stored with a sha256). Not seeded within 24 h → the week is **void**. |
| **Sun 02:00** (Sat 9 PM) | **Picks open.** Picks game 9's `ahead` is 46 h before Tue 00:00 UTC, so picks open 2 h after the seeding. |
| **Mon 23:55** (Mon 6:55 PM) | **Picks lock** for every size (the Picks game's 5-minute `lead` before Tuesday). |
| **Tue–Sat** | One round per UTC day. The final is always on **Saturday**: 32 producers → 5 rounds Tue–Sat; 16 → 4 rounds Wed–Sat; 8 → 3 rounds Thu–Sat. |
| Sun | Review day: nothing is played. |
| **Mon 00:00 after the week** at the earliest | **Final**, once every hour has been read twice and the end-of-week stakes are in. Then the Vault file is written. |
| **Thu 00:00 after the week** (Wed 7 PM) | The Vault's **backstop**. Not final by then → closed without a Vault file (`vault: "missed"`), or void if its results could never be completed. |

## The field and seeding ✅ `bracket-math.js`
- **Seeding VHP:** each producer's exact effective VHP, averaged over the 28,800 blocks (about a day) before the seeding. It counts at the **lower** of that average and its average at last week's seeding, so VHP lent for one day buys nothing (Repo Lens #E-3 M-6).
- **Field:** producers that signed in that day and would expect at least 10 blocks in a 6-hour race, biggest first (equal: address order). Every producer that meets the rule plays, Knode Games' own nodes included (D-086). The page shows a disclosure line when a Knode Games node is in the bracket.
- **Size:** the largest power of two that fits: 32 or more → 32; 16–31 → the top 16; 8–15 → the top 8; under 8 → no bracket that week. **No byes.**

## Matchups
- **From vault week 5 (the week of Mon 23 Nov), the VHP ruler decides** ✅ (`BRACKET_RULER_FROM_WEEK` = 5; `bracket-ruler.ts`, phase 2 #285). Week 4 was the shadow week.
  - One ruler card per matchup day, with every producer on one card, scored over that day's own blocks. The card moment is drawn by the ruler in the 6 hours before the day. Settings: `ownRule "spot"`, `minK 10`, `poolRule "min"`, `c 500000`, the Knode Games Pool as `pooled`, `paying: true`.
  - **The higher luck percentile (`fpct`) wins.** An exact tie goes to the lower seed (the underdog).
  - **Void:** a producer whose VHP moves outside −12% / +50% of its card size during the day, or that signs no block all day, or that isn't in the card's field, loses that matchup (a pick on it counts as a loss). If both are void, the day index decides.
  - A day whose card isn't made yet **waits**, never falling back to the day index. Alerts start 3 h after the day; the week waits up to its backstop.
  - The publish job rebuilds every card from `vhp-data` with the embedded `vhp_ruler.py` and holds the week if anything differs (held weeks stay unpaid; owner accepted).
- **Forfeits still come first** (D-086, Repo Lens #E-3 H-5): a seed whose effective VHP **averaged over its round's day** is under half its seeding VHP loses, whatever the ruler says. If both forfeit, the day index decides. Pooled producers (the Knode Games Pool, whose VHP is players' stakes) never forfeit.
- **The day index** (the rule before week 5, and still the tie-breaker when both seeds are void or both forfeit): credited blocks ÷ expected blocks on the VHP standard; pooled producers use a rate index that no deposit or withdrawal can move (Repo Lens #E-3 H-4).
- **Scoring mode (A–D) and rule version:** `BRACKET_RULER_MODE` is **unset**, so the cards carry no mode and are rule version 4. The all-games `RULER_MODE` / `RULER_VERSION` wiring is **not built yet** (see Open items). Leave every `*_RULER_MODE` / `*_RULER_VERSION` variable unset until it is. Never unset or move `BRACKET_RULER_FROM_WEEK`.

## The pick ✅ `bracket-math.js`, `bracket.js`
- **One number for the whole bracket**, sent as one Picks operation in **one transaction** (one wallet approval a week). Bit n says who wins matchup n in the player's own bracket: 0 = the better (smaller) seed, 1 = the other. Every number below 2^(size − 1) is a whole, consistent bracket.
- Picks game 9: NUMBER kind, weekly rounds, `ahead` 46 h, 5-minute `lead`, 20 picks a day, **20 changes a week**.
- **Changes (D-278):** a change is paid with the player's own Mana, and a guest wallet can't change a bracket. This applies once the page moves to the shared send code (P3); today's page still sends changes like a first bracket.

## Scoring and ranking ✅
- **Points:** 1 / 2 / 4 / 8 / 16 by round, +2 for the right champion (at most 14 / 34 / 82 for 8 / 16 / 32 producers).
- **Ranking:** points, then a right champion, then more right winners, then the **earlier** bracket (the time of its last change). Identical brackets sent in the same block share the place (D-087, Repo Lens #E-3 H-6). All-time boards have no pick time: ties share there.

## Rewards ✅
- **Staked board:** players with at least the week's minimum (1 VHP) staked in game 9 share the game's weekly bucket. The Vault file's rows are the staked players with at least 1 point, valued so the Vault's top-30% cutoff pays exactly the earners (#E-3 C-1).
- **Free play board:** **ON from vault week 5** 👤 (owner 14 Nov; switch sent 15 Nov). 1st and 2nd at the end of the week win 2 and 1 VHP, with at least 1 point; ties share the place (D-019, D-062). Guests are eligible. Players the Vault counts as staked (`held`) can't take a free prize.
- **Practice weeks:** vault weeks 3–4 counted for nothing (`BRACKET_PRIZES_FROM_WEEK` = 5).

## Data and pages ✅
- **Data branch `games-data`, folder `bracket/`:** `index.json` (weeks, `rulerFrom`, `prizesFromWeek`), `W<week>.json` (the week file: seeding, picks, hours, results, points, stakes), `board.json` (Staked and Free play boards), `ruler/` (the day cards and each week's summary), `vault/W<week>.json` (read by the Vault).
- **Readers:** the Vault (`vault/`), Block Golf (`W<week>.json`, never `board.json`), the Leaderboard and Results pages, and Hub's Producer lookup 💬.
- **Page `bracket.html`** (game page standard, PR #128): the box, the bracket, two closed rows ("For the curious", "Rules and how points work"), a links row (Leaderboard, Results) and one stake line.
- **Jobs:** the hourly `record_bracket` job (read-only on the chain, holds no key) and the publish job's Bracket check.

## Open items (25 Nov) 💬 `claude/bracket/REMAINING-BRACKET-2026-11-25.md`
- **P3:** the page on the shared send code (D-278), short round labels, the sticky-bar overlap, the stats line hidden on phones. Merge after Mon 30 Nov 6:55 PM ET.
- **Results page:** the Bracket tab (Hub, week of Mon 30 Nov).
- **The all-games ruler mode/version wiring,** or its replacement by the move onto the kit.
- **Moving onto the kit** (HANDOFF item 5: replay, then two shadow weeks).
- **Block Golf:** `golf.ts` has the Bracket joining from vault week 6 (Mon 30 Nov), "owner to confirm".

## Known risks
- **Few players:** week 4 had 2 brackets. That's a marketing point, not a fault.
- **Late ruler data:** cards wait (alerts after 3 h); the week can wait up to its backstop.
- **A file refused by the publish allowlist** holds every Bracket file ("files held" in the run). The fix is matching the new name in `games.yml`'s publish patterns.
- **A whale withdrawing mid-day** can sink the Knode Games Pool's matchup (inherent, disclosed).
- **F-2 (accepted):** hiding VHP on seeding day lowers a producer's forfeit bar.
