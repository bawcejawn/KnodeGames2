# Last Node Standing (Knode Games, game 13): how it works

A daily game with Staked and Free play boards. Pick a block producer ("node"). Every hour the node with the worst luck that hour is knocked out. Before the start you pick your node and an optional backup; if your node goes, the backup takes over (one jump). Ride the last node standing to win.

**Status:** not launched. Target: live from **vault week 5 = players' Week 2, first event Tuesday 24 November 2026, 9 AM ET** (round 20781; owner D-352/D-364; fallback week 6, first event Mon 30 Nov with `LASTNODE_FROM_WEEK` = 6). Mon 23 Nov (also in week 5) is recorded as a normal day with no players: Picks game 13 is applied only late that day (48 hours after the announce). The real game is measured **only** by the shared VHP Ruler (`docs/VHP-RULER.md`, RULE_VERSION 4) from its first live week; there is no switch variable and no older method on mainnet. Testnet practice is not in this repository yet (a later small PR).

## The rules (owner, 27 Oct – 11 Nov 2026; on the VHP Ruler from 12 Nov)
- **Event:** daily at 14:00 UTC (block timestamps). One cut an hour until one node is left: up to 22 hours with the largest field (23 nodes).
- **Measuring: the VHP Ruler** (owner, 11 Nov: every size-handicapped game moves onto it). Each card gives, per producer: `own` (its size), `entry`, `expected` (follows its VHP block by block, capped at the card's size), `credited`, `void` and `fpct` (its luck against the round's whole field, so size doesn't matter). The ruler's fairness runs cleared 1-hour rounds at 0.93–1.06 of fair (`claude/ruler/FAIR-RULES-EVERY-LENGTH-2026-11-11.md`). Last Node's settings (never read from a card): game 13, `c` 500000, `minK` 10, `poolRule` min, `ownRule` spot, pooled [the Knode Games Pool] (`bot/games/lastnode-ruler.ts` `RULER`; the publish job's `RULER_SET`, tested equal).
- **Field (the field card):** a ruler card, not paying, made from the 1,200 blocks before **10:00 UTC the day before** (picks open at 13:55 UTC; the ruler's data runs about 1–2 hours behind). The field is every producer with `entry` on it (at least 10 expected blocks an hour, form ≥ 0.80 or steady, 1 day of history), the biggest **23** by `own` (equal: by address). Fewer than 2: the event is void. No card by the lock (the ruler's data didn't reach it): void. The field never changes after it is published.
- **Each hour (the hour cards):** one paying ruler card per hour: scoring window = the hour's own blocks (by block time, read on both nodes), card window = the 1,200 blocks just before it. One card per round, no rebalance inside an hour: VHP added during an hour counts from the next hour's card.
- **The cut** (`rulerCutsFrom` in `lastnode-math.js`; Python port `ruler_cuts_from` in the publish job, tested equal). Each hour, among the nodes still standing:
  - a node that is **void** that hour (its VHP left the 1-hour band: down 5% or up 25%), or has **no entry** that hour, or no `fpct`, goes;
  - of the rest, if 2 or more, the lowest `fpct` goes (equal: the larger address);
  - all of an hour's cuts leave together. One node left wins. **None left** (every node still standing out in the same hour): no winner, the event is void: no one scores and nothing is returned (a pick costs no tokens).
  - **No ruler card 48 hours after an hour** (the fallback rule, owner 13 and 14 Nov 2026): the day's event is void the same way, recorded, with a warning and one red publish run (the owner is emailed).
- **Defaults taken for two open owner questions (12 Nov; each a small change):** (1) each hour stands on its own (not a running total since the start); (2) a void is a cut, so the backup takes over as on any cut ("a pick on a voided producer counts as a loss", D-164, unless the backup saves it).
- **Watch-and-hold (owner, 2026-10-29; fix-checks LNF-8/9, N-6/9/10):** each field node's `credited` against `expected` over the hours it raced in each finished event, with the noise measured from the other nodes that week (over-dispersion, at least Poisson). Flagged at z ≥ 3.4 over the week with at least 2 wins, or z ≥ 5 in one event it won. A flagged week's vault file is held: `vault/HOLD-W<week>.json` is published instead and the run fails so you get an email. Release it with `gh variable set LASTNODE_RELEASE_WEEKS --body "<week>"` (digits and commas) inside the Vault's 3 days. The publish job runs the same rule itself (`watch_week`, tested equal to `watchWeek`).
- **Picks (Picks contract, game 13; owner, 2026-10-29):**
  - One pick per event, made before it starts: your node and an optional backup.
  - Settings: a list of up to 2 producers (kind 2, list_size 2), TIME lock, one round a day (round_size 86,400,000 ms), round_offset 50,100,000 (13:55 UTC), lead 300,000, ahead 86,400,000, at most 5 changes, at most 10 picks a day.
  - Picks open at 13:55 UTC the day before and lock at 13:50 UTC, 10 minutes before the start. Nothing can be picked or changed during the race.
  - **Backup:** the first time your node is cut, the backup takes over automatically if it is still standing then (a jump; one per event). No backup, a backup already cut, or a cut of the node you jumped to, and you're out.
  - The cut where your backup takes over doesn't count as a cut survived (your node was cut); the backup's later cuts do. On the ruler several nodes can go in one hour: they leave together, so the backup must still be standing after the whole hour, and the other cuts of that hour count as survived.
- **Points:**
  - 1 for each node cut while yours is still in;
  - +5 for riding the last node without jumping, +3 after a jump.
- **Board:** points, then rides, then fewer jumps; exact ties share the place.
- **Two boards (owner, 3 Nov; D-081, D-082):**
  - **Staked:** wallets with at least the vault's minimum (1 VHP) staked in game 13 at any time that week (the vault's rule: `peak_stake`, else `active_stake`). They share the game's weekly bucket.
  - **Free play:** everyone else, guests included, on its own board.
  - **Free prize switch: OFF.** The published switch (`prize-settings` branch, `free-prizes.json`, game 13) has been off since vault week 3 (set 3 Nov), and the platform rule (owner, 10 Nov) is that a new game ships with its free prize off. So the Free play board pays nothing for now. The recorder still works out 1st and 2nd (below) and writes them in the vault file; while the switch is off the vault bot posts no free winners and the prize stays in the pool. The owner can turn it on with `npm run prizes -- on 13 --send`, which counts from the next vault week. If it is turned on, it pays **2 VHP for 1st, 1 VHP for 2nd** by the rules below.
  - **Who can win the free prize:** not staked in game 13 that week, at least **3 of the week's events** entered, at least 1 point, and the wallet **holds 1 VHP or has 1 VHP staked in Knode Games** (owner, 3 Nov: "require at least 1 VHP"; makes farming with many empty wallets cost something).
  - **Places** follow the board's order among the wallets that can win. **Ties** split the places they cover, as Who Signs Block X: two tied for 1st get 1.5 VHP each and 2nd is empty; a tie for 2nd splits 1 VHP. Up to 10 wallets are paid per place; if more than 10 tie, exactly 10 are paid (D-159): the ones that reached their score first (the time of their pick in the last event that gave them points), then by address. A place is never left empty because of the limit; wallets cut by it get nothing and don't move to 2nd.
  - **Re-reads:** a day's staked flags are read while the day is recorded, and the whole week is read again once, in the run that makes it final.
  - **The page** shows both boards, the shared stake panel and the staked / free status bar, and last week's free winners (`board.json` → `lastWeek.prizes`).

## Weekly results to the Vault (v6)
- **File:** `games-data:lastnode/vault/W<week>.json` with `{ game: 13, week, final: true, rows, first, second }`. `first` / `second` are the Free play board's winners (above); a wallet is never in both `rows` and a free place. Register the game with `game-add 13 "Last Node Standing" --staked --free --season 1`; register it with `--free` so the prize can be switched on later; the switch itself stays **off** until the owner turns it on.
- **rows:** wallets whose `week_stake` in game 13 is at least the vault's minimum stake for that week (1 VHP unless you change it; vault `get_game_player` and `get_state`) and that have at least 1 point. Stakes are read on both mainnet nodes; any difference holds the file to the next run.
- **Scores:** whole numbers 1–255 that keep the board's order and ties. Over 255 different places, the top 254 keep their tie-breaks and the rest share 1.
- **When it is written:** once the week is final (12 h after it ends, every event of it finished or void), and only within the Vault's 3-day window. The publish job checks that finality itself (fix-check N-3) and publishes the vault file only in a **later** run than the final board, when last week's files are already on games-data and unchanged (so one run can't add hours and file the week together).
- **No file at all** while the game contract has no per-game stakes (before v6).
- **Publishing:** the publish step takes only last week's file, from 12 hours to 3 days after the week ends.
  - Its rows must be exactly what last week's day files give (`vaultScores` for the wallets it lists), and those day files are replayed and can't be rewritten once published (fix-check LNF-1, LNF-2).
  - It never replaces a published vault file; a different copy, a file that doesn't match, or no file by the end of the 3 days fails the run so you are told.
  - A file with no rows while staked players scored is not published (the recorder couldn't read the stakes; it tries again).
  - **The publish job reads the stakes itself** (3 Nov), on both nodes, with its own client:
    - the vault's `get_state` gives the minimum;
    - `get_game_player` (game 13, that week) gives each scoring wallet's counted and peak stake;
    - for free candidates: the VHP token's `balance_of`, and the vault's `get_player` (stake + pending + stake_other).
    - `rows`, `first` and `second` must be exactly what the day files and those reads give.
    - If the two nodes disagree, or a read fails, the file waits for the next run.
  - **Watch-and-hold holds the whole file:** no staked rows and no free winners until you release the week. If it isn't released within the vault's 3 days, the week's bucket stays in the game and its free prize goes back to the pool.

## Where the code is
| File | What |
|---|---|
| `lastnode-math.js` | The rules, shared by the page and the recorder: `rulerCutsFrom`, `playerResult`, the board. `KLastNode.forGame(settings)` gives testnet timings (the old `cutsFrom` / `makeField` stay for practice). |
| `bot/games/lastnode-ruler.ts` | The ruler glue: Last Node's settings, field and hour windows and rounds, `cardFor`, `fieldOf`, `rowsOf`, the vhp-data loader, `R<day>.json`. |
| `bot/games/lastnode.ts` | Recorder. Field and hour cards from the ruler (mainnet), each hour's blocks by block time on two nodes, picks on two nodes. Writes `D<day>.json`, `R<day>.json` (the day's ruler cards), `index.json`, `board.json`, `me/<n>.json` (rows past the board's 2,000), `vault/W<week>.json` or `HOLD-W<week>.json`. Warns at 60% of the 2 MB file limit. Reading an event's picks stops loudly past 100,000. |
| `.github/workflows/lastnode.yml` | Record job (no secrets, read-only token; reads games-data and vhp-data). Publish job (runs no repository code: Python shape check, then `histcheck.py`; embeds `vhp_ruler.py`, generated by `tools/lastnode-ruler-embed.mjs` and tested byte for byte; pushes only `games-data/lastnode/`). Off until `LASTNODE_ENABLED=true` **and** `LASTNODE_FROM_WEEK` is set (the launch gate: no event of an earlier vault week is ever recorded or published). |
| `lastnode.html`, `lastnode.js`, `lastnode.css` | The live page. Recorded cuts are final; the running hour shows an **estimate** of each node's luck from public blocks (the hour's card decides). |
| (not in this repository yet) | Testnet practice (old method, test KOIN only): a later small PR. |
| `bot/picks.ts` | Registers games on the Picks contract (game 13's shape is in the launch steps). |
| Tests | `tests/audit/lastnode-*.test.mjs`, `repolens-lastnode*.test.mjs`, `site.lastnode.test.mjs`. The ruler: `lastnode-ruler.test.mjs` (rules, capacity), `lastnode-ruler-run.test.mjs` (recorder on the Race's fixture chain), `lastnode-ruler-publish.test.mjs` (recorder → publish job end to end), `lastnode-ruler.fixture.mjs` (Last Node's fixture chain: its real ruler cards give the tests' fixed history). |

## Files on games-data/lastnode
- `D<day>.json`: the event (field: card round, window, nodes with `own`; hours: `from`, `to`, the field nodes' rows; picks; cuts with `why`; players).
- `R<day>.json`: the ruler's cards of the day (field card, one per recorded hour), canonical text; the publish job rebuilds each one.
- `board.json`: today, this week, last week (with `prizes`), all time; each list its top 2,000.
- `me/<n>.json`: rows past a list's 2,000, by the char code of the address's second character, with `boardPlace` (the place on its own board). The page reads yours only when you aren't in the list it has.
- `vault/W<week>.json`, `vault/HOLD-W<week>.json`: for the vault bot (below).

## Trust model
- **Nobody can sign for players except their own wallet.** The page sends exactly one kind of transaction: a Picks `pick` ([start] or [start, backup]) for game 13, for the connected wallet, and checks the round is still open a minute before its lock.
- **The recorder holds no keys.** Hours are irreversible blocks matching on two independent mainnet nodes; picks match on both nodes.
- **The publish job** checks the shape of every file it pushes, never lets the day list shrink, never replaces a published vault file; published fields, picks, hours, ruler cards, finished events and a final week can't change.
- **What a run adds is checked again by the publish job itself (fix-check N-1),** with its own Python (standard library and the embedded ruler, no repository code), on the two nodes `RPC` and `RPC_CHECK`:
  - a new field: the field card's last block is the last block before the field time on both nodes; the card is the one `vhp_ruler.recompute` rebuilds from vhp-data with Last Node's own settings, byte for byte; the nodes are the card's (entry, top 23 by own);
  - every new hour: its first and last block are the hour's on both nodes; its card is rebuilt the same way; its rows are the card's;
  - new hour-0 picks: exactly the Picks contract's `list_picks` for the round on both nodes (only before the lock);
  - the cuts and players replay from the field, hours and picks (`ruler_cuts_from`, `player_result`); last week's board, its `me/` rows past 2,000 and the vault file follow from the day files;
  - a new void: only a reason the recorder writes, at a time it would write it (fix-check LN3-1); a fresh cancel at the lock turns the run red once (LN3-3).
  - Anything it can't read refuses the run (tried again next run).
- **Trusted elsewhere (documented):** the ruler's data (vhp-data) is the VHP Ruler's, verified by its own publish job on two nodes (signers, balances, hash chain); Last Node trusts that branch as every ruler game does. The ruler's own limits (e.g. RULE_VERSION 5's core window, a planned change) are the Ruler chat's.
- **Known limits (documented):**
  - The page's live luck is an estimate from blocks that may not be irreversible yet, against the field card's VHP; the hour's card decides.
  - The chain client has never run on a real node (watch the first live day).
  - Testnet practice still runs the old method (race cards, form); it pays nothing.

## Earlier reviews
- **27 Oct:** independent audit, "fix first":
  - H-1: jumps locked 55 minutes into the deciding hour;
  - M-1: Jump box unreachable;
  - M-2: a failed data read could shorten the boards;
  - M-3: a mid-week launch never closed its week;
  - Lows.
  All fixed. Two fix-checks were clean (commits up to `f6a1e14`).
- **28 Oct:** Repo Lens audit of testnet practice, the page redesign and the vault file: 1 High, 3 Medium, 13 Low, 16 Info.
- **29 Oct:** all fixed or answered, and the branch rebuilt on the current `picks` with the site at the repo root. Tests in `tests/audit/lastnode-fixes.test.mjs`, `lastnode-vault.test.mjs`.
- **30 Oct:** fix-check round 2 (`FIXCHECK-LASTNODE-2.md`): 1 Critical, 5 High, 6 Medium, 12 Low, 9 Info. N-1 to N-12 fixed (N-6 as far as a week of blocks allows; the 3% case is an owner decision), the current `picks` merged in (L-11). Tests in `tests/audit/repolens-lastnode2-*.test.mjs`, `lastnode-ports.test.mjs`, and the publish tests now run against a fake two-node chain (`tests/audit/lib/fake-koinos-rpc.py`).
- **11 Nov:** fix-check round 3 (#G-18, `FIXCHECK-LASTNODE-3.md`, at `796a2cc`): 1 High (LN3-1), 3 Low, 6 Info. Fixed in `46bcd53` (LN3-1 to LN3-4; tests `repolens-lastnode3`, `lastnode-voids`).
- **12 Nov:** the move onto the VHP Ruler (owner 11 Nov; Library 12 Nov), the Capacity chat's 60% warning, own row past 2,000 and loud `readPicks` stop. Repo Lens round 4 covers it (`claude/lastnode/REPOLENS-LASTNODE-4-PROMPT.md`).
