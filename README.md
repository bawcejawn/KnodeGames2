# Knode Games

Free and staked prediction games on the Koinos blockchain. Players pick block producers, blocks and races. Correct calls climb a weekly leaderboard for each game. The website is [knodegames.com](https://knodegames.com), and it is published from this repository.

Nothing here deploys, spends or moves funds by itself. Every command that changes the chain is a dry run until the owner adds `--send` (and, on mainnet, `CONFIRM_MAINNET=yes` in a local `.env` that is never committed).

## How the money flows

1. **Stakers deposit VHP into one vault** (`1Mpmf2…`). Only the vault holds tokens. The vault's VHP produces blocks on our own node.
2. **Each week**, the vault's block rewards, minus a flat **5% platform fee**, are shared out:
   - first, the free-play prizes: **2 VHP and 1 VHP** for the top two free players of each game whose free prize is on;
   - the rest is split across the staked games by each game's share of the stake, and paid to that game's weekly winners.
3. **Stakes can always be withdrawn.** A stake counts from the next vault week (Sunday 7 PM ET).
4. **Players don't need KOIN for fees.** The Mana sponsor (`1ByDDS…`) pays their transaction Mana, within daily caps.

**The Swap Desk is separate.** Knode Swap (`1FKTpX…`) turns VHP into KOIN at 1:1 minus its own fee. That fee is set on chain by the owner: **10% today**, the most the contract allows. The desk is an owner-run app. Its KOIN, VHP and fees never mix with the vault, the stakes or the 5% platform fee. See [contracts/desk/README.md](contracts/desk/README.md).

## The games

What is live, in practice, or not open yet is decided by the site's game list, [`web/games.json`](web/games.json). Which games take a stake is decided by the vault (the Stake page lists them). This table only explains the games: for today's state, check those two sources.

| Game | What you pick | Stake |
|---|---|---|
| Daily Questions | answers to quick questions about block producers | staked + free play |
| Who Signs Block X | the producer that signs a target block | staked + free play |
| Producer Race | the producer that wins each 6-hour race | staked + free play |
| Producer Bracket | the winners of a weekly head-to-head knockout of producers | staked + free play |
| Fantasy Producers | a team of 5 producers under a salary cap, with a captain | staked + free play |
| Last Node Standing | a node that survives the hourly knock-outs | staked + free play |
| More or Fewer | whether a producer signs more or fewer blocks than the line | free play; staking once the vault applies it |
| Combo Card | a card of 2 to 10 calls from the races and Block X; every leg must hit | free play; staking once the vault applies it |
| Survivor | one producer a day, two lives, each producer once | free play only, for now |
| Knode Games VS | which producers beat our node, one call a day | free play only (never a vault game) |
| Block Golf | nothing: every game is a hole, and your board places set your strokes | stopped in the vault; free play may continue |

## What is where

| Folder | What it is |
|---|---|
| `web/` | The website. The only thing that is published. |
| `contracts/` | The five contracts: vault, desk, sponsor, picks, race. The source matches the live builds. |
| `bot/` | The operator bot and the owner's commands. |
| `kit/` | The shared game kit. New games are built on it. |
| `games/` | One folder per game on the kit. |
| `questions/` | Daily Questions: make them, score them, check them. |
| `ruler/` | The shared way every game measures producers. |
| `ops/` | The owner's PC scripts, the Cloudflare worker, the local admin page and the testnet pages. Not published. |
| `tools/` | Dev tools and the scripts CI runs. |
| `tests/` | The regression tests. |
| `docs/` | The guides. |

Bot-written data lives on data branches, not on `main`. See [docs/DATA.md](docs/DATA.md).

## Run the tests

From this folder, with Node 22:

```bash
npm ci --ignore-scripts
npm test              # the fast set CI runs on every pull request; touches no chain
npm run lint          # policy checks (timers, privileged triggers, site rules)
npm run test:audit    # the full audit suite (slow)
```

- `npm run test:vault` runs the bot against the vault's TEST build. Build it first: `cd contracts/vault`, then `npm run build:sim`. A skipped test fails this run.
- `npm run test:contracts` builds and tests the five contracts (slower).
- `node tools/ci/assemble-site.mjs` writes `dist-site/`, the website and nothing else. Don't commit `dist-site/`.

Read-only checks against the live chain (no key needed):

```bash
npm run bot -- chain-check
npm run desk -- status
npm run picks -- status
```

Never run `keys`: it creates new wallets.

## Check the contracts yourself

Anyone can rebuild the five contracts and compare their fingerprints (SHA-256) with the code on chain:

```
npm ci --ignore-scripts
npm run test:hashes
```

`test:hashes` builds each contract and fails if a build doesn't match the `source` fingerprint in [`contracts/hashes.json`](contracts/hashes.json). CI runs it on every pull request. To compare with the chain itself (read-only): `npm run bot -- chain-check`.

| Contract | Address | Live code (sha256) |
|---|---|---|
| Vault | `1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr` | `11043e1fde1d8d7dbac75e9e5e788d058a7116b0dab6149fc09ecdc7b1c4258b` |
| Knode Swap (desk) | `1FKTpXBhhHEbu5vVchM8UsVbAvPArJsRmR` | `309506ccfaadd3427e937aa88cd34c9ea2a9e6088e49e51f014d546489dd5f35` |
| Picks | `1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm` | `92d555d0680157854452e35162c1b1c5c100904996194b8c1c848df50e5e1c3d` |
| Race picks | `1EN7xU8R9tQXjHvrX79qZvvvGkkKWVnB5K` | `9993581baf822cd070331008441c5ad974f5c0b134520dfb7422b9efd1873864` |
| Mana sponsor | `1ByDDSBUzy5zkRceELc54Jh8i41yNRoKt8` | `b84e1add3ffa14a7d1933d5ce5a4ad33caa4bca887a489f87f710b3c121c83a6` |

The site's **Trust** page shows the live numbers.

## Read next

1. [SECURITY.md](SECURITY.md): how to report a problem, and the risks that are still open.
2. [docs/KEYS.md](docs/KEYS.md) and [docs/WALLETS.md](docs/WALLETS.md): who controls what.
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces connect.
4. [docs/WORKFLOWS.md](docs/WORKFLOWS.md): the GitHub Actions and their timers.
5. [docs/REMAINING-WORK.md](docs/REMAINING-WORK.md): what is still open.
6. [HANDOFF.md](HANDOFF.md): the handoff for the next builder.

## How the VHP-swing rule is applied

A question can be voided on purpose, late in its window, by moving VHP. The producer the question is about can move its own VHP. Anyone else can do it too: a third party can send or burn VHP to that producer, or swap VHP into the Knode Swap desk when the desk is a subject. That is part of an open network. The last hourly reading can land near the end of the window, when most of the window is already public. A reading after the window's last block never voids. The numbers are saved with the question. The full rule is in `questions/resolver.ts`.
