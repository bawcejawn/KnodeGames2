# Over Under (game 16)

> **Sources:** owner decisions D-342 to D-370 (rolling games), D-344 (a game with no schedule file is cancelled), D-383 (the form-based line), M-120 (Unreliable producers left out); code `games/overunder/` (the rules: `math.js`; the kit's part: `recorder.ts`).
> **Status:** building, TEST. Nothing runs until the owner sets `OVERUNDER_ENABLED`. No prizes until `OVERUNDER_PRIZES_FROM_WEEK` is set.

## Purpose
A new game every 30 minutes. Each game is one block producer and a line, in half blocks. Call Over or Under. One point for each game you call right.

## Gameplay
- **Starts:** a game starts at every :00 and :30 UTC (the kit's rolling grid, round id `r#####`). It runs for the **14,400 blocks** from the block at its start (about 12 hours).
- **Who plays:** the producer whose last game started longest ago plays next. A producer with 2 games running is passed over for that start. A new producer on the list goes to the bottom. **Unreliable** producers (form below 80%) and the pool node (the Vault) never play. If nobody can play, there is no game at that start.
- **The list:** producers with the VHP Ruler's entry on the schedule card (stand-in for the Ruler's `listAt` until the kit exposes it), minus Unreliable ones.
- **The line:** the producer's forecast blocks for the game: its card's k (its VHP share of a game's 14,400 blocks), scaled by its form, with form counted up to 104% and no block cap (`forecastExpected`, D-584, D-588), as the Poisson median half-line (`medianLineHalves`: 1 below 0.15 blocks, otherwise 2 × floor(e − 0.15) + 1 half blocks). Nobody types a line.
- **The schedule file:** the kit writes each game's write-once file `schedule/r#####.json` between 3 h 33 min and 3 h 3 min before the start, on both nodes (they must agree). It holds who plays, the line and the queue. **A game with no file by 2 h 15 min before its start is cancelled for everyone** (D-344); the queue is then exactly as if that start never happened.
- **The schedule card:** the ruler can only make a card once its whole scored range is in the data, so the line comes from a card in the past: its scored range is the 14,400 blocks ending at the last 6-hour mark (00, 06, 12, 18 UTC) at least 4 h 3 min before the start, and its size window is the 7,200 blocks before that. All starts with the same mark use the same card.
- **A pick:** one number per game on the Picks contract: **1 = Over, 2 = Under.** Picks open **2 hours** before the start and lock **5 minutes** before it, so 3 or 4 games are open at a time, never more than 4. **No changes.**

## Scoring
- The game is scored on a ruler card with the **same card round and size window** as its schedule card and the game's own 14,400 blocks, so it has the same k and form. The line in the file must equal the line from this scored card's row; if not, the game is cancelled.
- **Over wins** if credited blocks × 2 > the line (in half blocks); otherwise Under wins. A void producer is skipped (no win, no loss).
- **1 point** for each game called right. A game counts for the **week it starts in** (Monday 00:00 UTC starts a new week). Every day counts, Sunday too.
- Weekly leaderboard; final after the last game of the week is decided (a game started late on Sunday ends about 12 hours later, on Monday), then the kit's re-read on both nodes.

## Form labels
On form: 97% or more. A little behind: 90% to 96.9%. Behind: 80% to 89.9%. Unreliable: below 80%.

## Rewards
- **Free play:** free to play; no free prizes for now (D-576: held off by Vault's prize switch, not closed for good). Staking comes later, once Over Under is proven (D-612).
- **Staked:** D-152, from the staked board when staking is on.

## Dependencies
- **Picks contract:** game 16, kind 3 (number 1 to 2), time lock, round size 1,800,000 (30 minutes), offset 0, lead 300,000, ahead 7,200,000, max_changes 0, 50 picks a day. A game's Picks round is its start ÷ 30 minutes.
- **Vault:** game 16 added (`game-add`), then applied after its announce.
- **Switches (GitHub variables):** `OVERUNDER_ENABLED`, `OVERUNDER_PRIZES_FROM_WEEK`; the kit's `OVERUNDER_HOLD_WEEKS`, `OVERUNDER_RELEASE`, `OVERUNDER_RESET_FROM_WEEK`. Leaving Unreliable producers out is always on for now: a game module can't read a GitHub variable, so a switch for it needs kit support first.
- **Shared:** the "Send my picks" card (`web/js/lib/send-picks.js`).
