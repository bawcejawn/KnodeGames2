# Over/Under (game 16)

> **Sources:** owner decisions D-266, D-267, D-272, D-277, D-278, D-284 to D-290 (`claude/library/DECISIONS-2026-11-19.md`); design note `claude/newgames/DESIGN-OVERUNDER-VS-2026-11-19.md`; code `games/overunder/`.
> **Status:** building (not launched). Nothing here is wired into a workflow until the owner sets `OVERUNDER_ENABLED`.

## Purpose
Every day, every block producer on the week's roster has a line: a number of blocks, at half a block (28.5, 29.5, …). Pick Over or Under on any rows you like. A row you leave blank is no pick.

## Gameplay
- **The roster and the lines** are published once, before the week's picks open, and never change (FC-9, D-284). The roster is the producers that pass the VHP Ruler's entry gate (not in ramp-up) and are not void on the card it is made from; there are at most 64 (D-296). If more than 64 qualify the roster is not made and the run stops with a loud error: nothing is cut silently.
- **The line is shown** as soon as the Ruler publishes it with the sealed roster, before picks open, and stays visible (D-311). Only Knode Games VS hides its numbers until picks lock (D-309).
- **The line** is the producer's expected blocks on that card, from the VHP Ruler, rounded to the half block (floor + 0.5). Nobody types it.
- **A pick** is two numbers per day (D-296): 2 bits a row in roster order (00 blank, 01 Over, 10 Under); number A is rows 1 to 32, number B rows 33 to 64. They are two Picks rounds of 12 hours each. Both go in one approval. Picks open 2 days ahead (D-285). Number A locks 5 minutes before the UTC day starts; **number B locks 12 hours earlier** (5 minutes before noon UTC the day before).
- **Changes:** a pick, then up to 2 changes before the lock, each paid by the player's own Mana (D-278, D-286). A played day can't be re-picked; no pick is ever given back.

## Scoring
- Measured by the VHP Ruler (RULE_VERSION 4), one daily card per UTC day, **credited** blocks (never raw).
- **1 point for each row you called right** (D-277): Over when credited blocks are above the line, Under when below.
- **A producer that is void that day is skipped:** no win, no loss (D-287). A credited count exactly on the line is skipped too.
- **A flagged day** waits until Tuesday 00:00 UTC after the week; if still flagged, every row is skipped. **No ruler card at all** for a day: after 48 hours every row is skipped, recorded and alerted.
- Week = Monday to Saturday play days; **Sunday is the fun round** (Today and All time only, D-150). Weekly leaderboard and prizes (D-272). Final from Mon 00:00 UTC after the kit's re-read on both nodes.

## Rewards
- **Free play:** a free board, **free prizes ON** at launch: 2 VHP first, 1 VHP second (D-290).
- **Staked:** D-152, from the staked board when the vault is ready.

## Dependencies
- **Picks contract:** game 16, kind 3 (number 0 to 18,446,744,073,709,551,615), time lock, **round size 43,200,000 (12 hours)**, offset 0, lead 300,000, ahead 172,800,000, max_changes 2, 20 picks a day. A day's number A is Picks round 2×(day number), number B is round 2×(day number) − 1. `bot/picks.ts` must first accept a number_max above 2^31 − 1. 48-hour announce, then apply.
- **Vault:** `game-add 16 "Over Under" --staked --free --season 1`, apply after 48 hours.
- **Switches:** `OVERUNDER_ENABLED`, `OVERUNDER_PRIZES_FROM_WEEK`, `OVERUNDER_RULER_FROM_WEEK` = the game's first vault week, set before that week starts (no shadow week, D-289).
- **Shared:** the "Send my picks" card (batching, D-211) and the "your pick this round + confirm before changing" piece (D-255), owned by Architecture.
