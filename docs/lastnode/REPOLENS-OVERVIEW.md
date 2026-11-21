# Last Node Standing (game 13): Repo Lens overview

The high-level view of the Last Node Standing area for reviewers and the other Knode Games chats: what was built, how it is put together, why, what is left, and where it touches the rest of the platform. The rules in detail are in `docs/lastnode/README.md`.

*Last Node chat, Thu 12 Nov 2026. Branch `lastnode`; head as packed for Repo Lens round 4.*

## 1. What was built

**The game.**
- One event a day at 14:00 UTC, for up to 23 block producers.
- Every hour, the node still standing with the worst luck that hour is knocked out.
- A player picks a node and an optional backup before the start. Points for every node cut while theirs is in, plus +5 for riding the winner (+3 after a jump).
- Two weekly boards:
  - **Staked:** wallets staked in game 13. They share the game's weekly bucket from the Knode Games vault.
  - **Free play:** everyone else. Its 2 + 1 VHP prize is switched OFF for now.

**What is in the branch (all reviewed or in review):**

| Part | State |
|---|---|
| Rules and scoring (`lastnode-math.js`) | Built; on the VHP Ruler (`rulerCutsFrom`) |
| Recorder (`bot/games/lastnode.ts`, `bot/games/lastnode-ruler.ts`) | Built; reads ruler cards, two-node blocks and picks |
| Record and publish workflow (`.github/workflows/lastnode.yml`) | Built; off until `LASTNODE_ENABLED=true` |
| Page (`lastnode.html`, `lastnode.js`, `lastnode.css`) | Built; ruler view on mainnet |
| Weekly vault file, watch-and-hold, free play | Built (fix-checks 1–3) |
| Capacity: 60% warning, own row past the 2,000-row board, loud picks limit | Built (Capacity chat, 12 Nov) |
| Testnet practice (games 94 and 33) | Built; still the old method, pays nothing |
| Tests | 1,800+ in the suite; Last Node's run on Linux and Windows (bash steps skipped there) |

## 2. Architecture

```
vhp-data (VHP Ruler's data, verified by the ruler's own job)     Picks contract (game 13)
        │                                                              │
        ▼                                                              ▼
 record job (no secrets) ── bot/games/lastnode.ts ──────────── two mainnet nodes (blocks, picks)
        │   field card (not paying, 10:00 UTC the day before)
        │   one hour card per race hour (paying) ── lastnode-ruler.ts ── vhp-ruler.js
        │   cuts: lastnode-math.js rulerCutsFrom
        ▼
 files: D<day>.json, R<day>.json, index.json, board.json, me/<n>.json, vault/W<week>.json | HOLD-W<week>.json
        │
        ▼
 publish job (runs no repository code; holds the write token)
   1. shape check (Python)
   2. histcheck.py: rebuilds every new card from vhp-data with the embedded vhp_ruler.py and Last Node's own
      settings; reads the new hours' edge blocks, the field card's block and hour-0 picks on two nodes; replays
      cuts, players, board, me/ rows and the vault file; watch-and-hold; void rules; reads stakes and free
      status on two nodes
   3. pushes games-data/lastnode only
        │
        ▼
 games-data/lastnode ──► page (lastnode.js)          ──► vault bot (W<week>.json, hourly; holds while HOLD)
```

## 3. Key decisions

| When / who | Decision |
|---|---|
| 27–29 Oct, owner | Daily event at 14:00 UTC, hourly cuts, max 23 nodes, one pick + backup (one jump), picks open 24 h ahead and lock at 13:50 UTC. |
| D-055, owner | Watch-and-hold: a suspicious week is held until the owner releases it (`LASTNODE_RELEASE_WEEKS`). |
| D-081 / D-082, 3 Nov | Staked and Free play boards. The free prize is **OFF** (published switch off from week 3; platform rule 10 Nov). |
| D-159 | A free-prize tie of more than 10 pays exactly 10: earlier score time, then address. |
| 11 Nov, owner | Every size-handicapped game moves onto the shared VHP Ruler. |
| 12 Nov, Library | Last Node is **ruler-only** from its first live week; no switch variable. Target was vault week 6; moved by the owner to vault week 5 = Week 2, **first event Tue 24 Nov 2026** (D-352, D-364; fallback week 6, first event Mon 30 Nov). No `game-add 13` before it is ready. |
| 12 Nov defaults, **confirmed by the owner 14 Nov** | (1) Each hour stands on its own (lowest `fpct` that hour), not a running total. (2) A void is a cut, so the backup takes over. |
| 13–14 Nov, owner | **Every producer void = the race is void:** no one scores, nothing is returned (a pick costs no tokens). **Fallback after the 48-hour grace:** an hour with no ruler card 48 hours after it ended voids the day's event, recorded, warned, one red publish run (the owner is emailed). |
| 14 Nov, owner | Launch as soon as the build is complete and Repo Lens gives a GO (not parked). Picks game 13 is its own small PR (`picks-game13`). |
| 19 Nov, owner and Library (D-350, D-352, D-364, D-365) | Launch **Tue 24 Nov** (vault week 5; fallback Mon 30 Nov, `LASTNODE_FROM_WEEK` = 6). Picks game 13 is announced and applied by the **CURRENT** Picks owner (D-350; replaces D-191's "new owner"), once the `picks-game13` PR has merged: announce by Sat 21 Nov ~8 PM ET, apply 48 h later (Mon 23). The Picks owner handover waits until game 13 is applied. Vault `game-add 13` without `--free` (D-365). |
| 14 Nov, Last Node chat | **Launch gate `LASTNODE_FROM_WEEK`** (6): events of earlier vault weeks are never recorded or published; the workflow doesn't run without it. So the recorder can be switched on Sunday morning (Monday's field is set when picks open) without filling week 5. |
| 12 Nov, Capacity chat | 60% file-size warning; your own row past the 2,000-row board; `readPicks` stops loudly past 100,000. Row compaction waits until after launch. |
| Settings (Last Node's, never a card's) | game 13, c 500000, minK 10, poolRule min, ownRule spot, pooled [Knode Games Pool]; card window 1,200 blocks; field card from the 1,200 blocks before 10:00 UTC the day before. |

**Why ruler-only:** Last Node never scored a live week, so there was no old method to switch away from. One method means less to audit. The ruler also removes what rounds 1–3 found hardest to trust: the race-card rule, the sampler, the form multiplier and `c`.

**Why hourly, not cumulative:** the ruler's fairness runs cover independent 1-hour rounds (0.93–1.06 of fair). `fpct` is luck against the whole network, so every node has the same chance each hour whatever its size.

## 4. Remaining gaps and technical debt

1. (Done 14 Nov) the owner confirmed both defaults; the 48-hour fallback and the launch gate are built.
2. **Ruler chat answers** (`claude/lastnode/PLAN-LASTNODE-ON-RULER-2026-11-11.md`): the card window for 1-hour cards, `c` / `ownRule` for 1-hour cards, and whether a non-paying field card the day before is fine. The current values copy the Race's.
3. **The ruler's newer options are not used yet.**
   - Last Node passes no scoring `mode`: `main`'s modes A–D, from `<GAME>_RULER_MODE`, are optional, and a card without one scores exactly as RULE_VERSION 4.
   - It pins RULE_VERSION 4. Version 5 is the Ruler chat's plan for vault week 6.
   - Following either needs the shared schedule code (`modeAt` / `modeChange`, or `versionChange`) in the recorder and the publish job: a small PR after launch, if the owner wants Last Node on it.
4. **Testnet practice** still uses the old method and its code (race cards, form). Moving practice onto the ruler is possible: practice reads mainnet producers. Planned after launch.
5. **Row compaction** (Capacity): the day file reaches 2 MB at about 5,900 players in one event. The recorder now warns at 60%. Compact rows after launch.
6. **Never run on a real node:** the publish job's chain client. Watch the first live day.
7. **The publish job's ledger load** (about 8 s on the 35-day test chain) grows with vhp-data. Watch the run time.
8. **Page:** the live luck during an hour is an estimate (field-card VHP, not yet irreversible blocks), clearly labelled; the hour's card decides.
9. **I3-3 (Info):** free-play medals show while the prize is off (the text promises nothing).

## 5. How it fits the platform

- **Vault (game 13):** the vault bot reads `games-data:lastnode/vault/W<week>.json` (`game-data/deployment.json` lists it). It refuses shadow rows; Last Node never writes any. Register with `game-add 13 "Last Node Standing" --staked --free --season 1` (48 h timelock), with the free-prize switch staying OFF.
- **Picks contract:** game 13 is kind 2, list_size 2, lock_mode 2, round_size 86,400,000, round_offset 50,100,000, lead 300,000, ahead 86,400,000, max_changes 5, max_picks_per_day 10. Announced by the Block X chat after a GO, with 48 h notice; **the shape can never change** after that.
- **VHP Ruler:** reads `vhp-ruler.js` / `vhp_ruler.py` and `vhp-data` as every ruler game does. Last Node changes none of the ruler's files.
- **Mana sponsor:** a Picks `pick` for game 13 needs a sponsor allowlist row (unverified whether rows are per game: Block X / Vault chat).
- **Site:** the shared nav, `board.js` (unchanged), `stake-panel.js`, names, PostHog, `leaders.js` (reads `events` for Last Node's free board).

## 6. Dependencies and integration points

| Needs | From | Status |
|---|---|---|
| A Repo Lens GO (round 4) | Repo Lens | Prompt: `claude/lastnode/REPOLENS-LASTNODE-4-PROMPT.md` |
| The two rule defaults confirmed | Owner | Done (14 Nov) |
| Card settings for 1-hour cards; field card OK | Ruler chat | Open |
| Picks game 13 entry (`picks-game13` PR), announce, then apply (48 h) | Block X chat + owner (the CURRENT Picks owner, D-350) | announce once `picks-game13` has merged, by Sat 21 Nov ~8 PM ET; apply 48 h later (Mon 23) |
| `game-add 13 --staked` (no `--free`, D-365), then `game-apply` (48 h) | Vault chat + owner | Add Fri 20 Nov right after cutover; apply **only after this PR has merged**: by Sun 22 Nov 6:44 PM ET for week 5, else by Sun 29 Nov (week 6; within 7 days of the 48 h) |
| Sponsor allowlist for `pick` on game 13 | Block X / Vault chat | Covered by the Picks `pick` row (Block X, 19 Nov) |
| `LASTNODE_FROM_WEEK=5` and `LASTNODE_ENABLED=true` | Owner | The day this PR merges (Sun 22 or Mon 23 Nov); Tuesday's picks open once Picks game 13 is applied (Mon 23) |
| `games.json` Last Node `"live"`, home tile, menus, sitemap, SEO | The Hub's own PR, the same day this PR merges | Prepared by the Hub |
| vhp-data recording hourly | Ruler chat | Live (checked 12 Nov) |

## 7. Launch steps (in order)

1. PR `picks-game13`: Repo Lens GO, one push, merge (Fri 20 Nov, after cutover). Then announce Picks game 13 (the CURRENT Picks owner, D-350; dry run first; latest Sat 21 Nov ~8 PM ET), apply 48 h later (Mon 23).
2. Repo Lens round 4 on `lastnode` → GO (fix-check if needed).
3. Tell the Library. Open the PR `lastnode` → `main`, pushed once; merge on the owner's GO.
4. Vault: free prize stays OFF; `game-add 13` without `--free` (Fri 20 Nov, right after cutover), 48 h; `game-apply` only after this PR has merged (by Sun 22 Nov 6:44 PM ET for week 5, else in week 5 for week 6).
5. The Hub's PR: `games.json` Last Node `"live"`, tile, menus, sitemap, SEO (same day, after this PR).
6. The day this PR merges: `LASTNODE_FROM_WEEK=5`, then `LASTNODE_ENABLED=true`.
7. Watch the first live day (Tue 24 Nov; Mon 23 is recorded with no players): the publish job's first real chain and ruler reads.
- **Fallback** if this PR can't merge by Mon 23 Nov ~6 PM ET: do the same steps a week later with `LASTNODE_FROM_WEEK=6` (first event Mon 30 Nov).

## 8. Where the unpushed work is (until the PR's one push)

- The branch lives in the Last Node chat's cloud workspace and is not pushed (GitHub rule: one push per PR, after a GO).
- A complete backup, `lastnode.bundle` (a git bundle of every commit after `origin/lastnode` = `796a2cc`), was sent to the owner in the Last Node chat. The project had no room for it.
- To restore it (PowerShell on the owner's PC; this only adds a new branch, `lastnode-restored`, and touches nothing else):

```
cd C:\kprediction
git branch --show-current
git fetch origin
git fetch "$HOME\Downloads\lastnode.bundle" lastnode:lastnode-restored
git log --oneline -3 lastnode-restored
```

- `lastnode-restored` is then the reviewed head (named in REVIEW-NOTES.md in the round-4 zip).
