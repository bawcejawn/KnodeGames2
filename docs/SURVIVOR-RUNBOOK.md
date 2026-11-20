# Survivor runbook (game 3)

How to launch Survivor and look after it. The rules are in `docs/SURVIVOR.md`; the code in `games/survivor/`. Survivor runs on the Shared Game Kit: the hourly `games.yml` job records it and the kit's publish job publishes it to `games-data:survivor/`. Nothing here needs a key except the Picks and vault steps, which run on the owner's PC.

Every PowerShell block starts in the owner's folder and checks the branch, because several chats share it.

## Before launch (in order)
1. **The PR.** The Survivor PR on KnodeGames2 merges after cutover (D-221), on its Repo Lens GO and a green `ci`. The owner merges.
2. **Picks game 3 (announce Sun 22 Nov after cutover, apply Tue 24 Nov; D-246).** On `main`, dry run first:
   ```powershell
   cd C:\knodegames2
   git branch --show-current
   git pull
   npm run picks -- games
   ```
   Check game 3 isn't registered. The Block X / Picks chat gives the exact `announce 3` and `apply 3` commands with game 3's values (kind 1, list 1, lock mode 2, round 86,400,000 ms, offset 0, lead 300,000 ms, ahead 604,800,000 ms, 5 changes, 20 picks a day, enabled). Announce, wait 48 hours, apply, within 7 days. Registering a shape is permanent: compare every value with `docs/SURVIVOR.md` before sending. Applying on Tue 24 Nov opens day 1 (Mon 30 Nov) for picks; it must be applied before Sun 29 Nov 6:55 PM ET (day 1 locks then). The Picks owner handover comes only after the apply.
3. **Sponsor row** for Picks game 3 `pick` (the Mana sponsor chat).
4. **Free prize OFF** for game 3, before week 6 (by Sun 29 Nov 7 PM ET):
   ```powershell
   cd C:\knodegames2
   git branch --show-current
   npm run prizes -- off 3
   ```
   It prints what it would send. Then run it again with `--send`.
5. **Switch the recorder on:** GitHub, Settings, Secrets and variables, Actions, Variables: `SURVIVOR_ENABLED` = `true`. Weeks before week 6 are never recorded, so it can be set any time before Mon 30 Nov 00:00 UTC (Sun 29 Nov 7 PM ET).
6. **The page:** the Hub chat sets Survivor live in `games.json`, the menus and the sitemap.

## Season 2 (the first paid season): the vault
Vault's slots (Vault chat, 18 Nov). From Tue 24 Nov the vault owner is the cold key; Vault gives the signing steps. On the owner's PC:
1. **Add: Fri 4 Dec, from about 7:15 PM ET, not earlier.** An earlier add opens its apply window in week 6, and an apply there would earn from week 7, a Season 1 week.
   ```powershell
   cd C:\knodegames2
   git branch --show-current
   git pull
   npm run bot -- game-add 3 "Survivor" --staked --free --season 2
   ```
   Dry run first and show it to Vault; then `--send`. The dry run **must say it earns from vault week 8**. `game-add` has no week flag: the week comes from when the apply lands.
2. **Apply: Mon 7 Dec, about 11 AM ET** (`npm run bot -- game-apply 3`). Any time from Sun 6 Dec 7:15 PM to Sun 13 Dec 6:44 PM ET works (inside week 7), never in the 15 minutes before the week change. A game applied in week W earns from W + 1.
3. Check with `npm run bot -- games` that game 3 shows from week 8.
4. GitHub variable `SURVIVOR_PRIZES_FROM_WEEK` = `8`.

## Every week (nothing to do unless an email comes)
- Each play day's result is published the morning after (UTC) in the live week copy. Each week goes final from Monday about 02:00 UTC, after two runs at least 2 hours apart agree.
- The kit emails an alert when something needs you. The common ones:

| Alert | What it means | What to do |
|---|---|---|
| "no ruler card 48 h after it ended, so it was decided by the game's fallback rule" | The ruler's data stopped; that day doesn't count for anyone | Nothing for Survivor. Tell the Ruler chat the data stopped |
| "waits on week N, which isn't final" | The season's first week is held or pending, so its second week waits | Find out why week N isn't final (the email before this one) |
| "the kit's season … isn't math.js's" | The season start drifted (a reset or `firstWeek` changed) | Stop: ask the Survivor chat. Never guess a reset week |
| "week N is held … release it with SURVIVOR_RELEASE" | A final week reads differently on chain | Ask the Survivor chat to check it; only then set the release value it prints |

## Switches (the admin page lists each)
- `SURVIVOR_ENABLED`: `true` runs the recorder; `false` stops it (stakes are untouched).
- `SURVIVOR_HOLD_WEEKS`: weeks kept pending (nothing pays for them). A held first week also holds its season's second week.
- `SURVIVOR_RELEASE`: `<week>:<code>`, lets one held week through once.
- `SURVIVOR_RESET_FROM_WEEK`: a fresh season start, only at a season's first week (6, 8, 10 …). Ask the Survivor chat first.
- `SURVIVOR_PRIZES_FROM_WEEK`: the first week the vault pays (8).

## Changing the season dates
Only before Season 1 starts: `games/survivor/math.js` `FIRST_WEEK` and `games/survivor/game.json` `firstWeek` must change together (a test checks), in a reviewed PR. Once week 6 is recorded, never move `firstWeek` past it.
