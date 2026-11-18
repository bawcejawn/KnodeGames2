# Still to do

This pull request is the first slice. The live games are copied into the new folders. They are not all re-tested here. Do not point knodegames.com at this repository until [GO-LIVE.md](GO-LIVE.md) is done.

The single source of truth for the next builder is [../HANDOFF.md](../HANDOFF.md).

## In this pull request

- The folders: `web/`, `contracts/`, `bot/`, `kit/`, `games/`, `questions/`, `ruler/`, `ops/`, `tools/`, `tests/`, `docs/`.
- The home page loads `early-view.js` again, before the stylesheet.
- A public fairness page (`web/fairness.html`).
- Question files are not on `main`. The bot publish job is aimed at a branch named `game-data`. That branch is not created yet. See [DATA.md](DATA.md).
- A new desk deploy refuses to use the owner address as the treasury. The live desk is not changed.
- Workflows have no timer and do not run on a pull request, except CI. The website publish job stays off until `KG_ENABLE_PAGES` is `true`.
- Agent notes (`.ai/`) are not in this repository. Old `/site/` redirects are gone. Finished one-off fund-moving and v6 rehearsal scripts are gone. See [DROPPED.md](DROPPED.md).
- CI job name: **`ci`**. That is the check to require on `main`.

## Not done yet

1. **The old test suite is not the CI gate.** Hundreds of tests still look for files at the old paths, or expect a timer in a workflow. `npm test` here runs only the checks that match this layout: the question scorer, the early-view tag, the desk treasury rule, the workflow guard, the capacity timer check, the VHP-swing wording, the font check, and the static page check. The rest stay in `tests/` for the next pass.
2. **Contract builds are in CI** (`npm run test:hashes`, `contracts/hashes.json`). Four match the chain. Picks source is v2, not yet live: after its upload, set `picks.live` to `source`. Any contract change updates `source` in the same PR. The contracts' own unit tests (`npm run test:contracts`) stop at start-up (`binaryen` RuntimeError, Node 20 and 22): fix that before v6.2.
3. **The bot is still one large file** (`bot/bot.ts`). It is not split into commands yet.
4. **Games are not on the shared kit yet**, except Fantasy, which already was. Golf, Bracket, Combo, Block X, Race, and Questions still use their old recorders.
5. **The two new games are not built.** The shape is in [NEXT-GAMES.md](NEXT-GAMES.md): Over/Under, and Knode Games VS.
6. **Page scripts are not split** into `web/js/lib` and `web/js/pages`. They sit in `web/` with the same names the pages already use. `web/js/lib/config.js` is only the data-branch setting.
7. **The data branch has no files.** Create it once, as [DATA.md](DATA.md) says, before any bot run.
8. **Keys are not moved.** [KEYS.md](KEYS.md) is the runbook. Nothing in this pull request sends a transaction.
9. **GitHub Pages is not switched on.** [WORKFLOWS.md](WORKFLOWS.md) says how.
10. **Moderate `npm audit` findings remain** in the contract test tools. Critical and high are cleared. Do not downgrade `@koinos/sdk-as` to clear the rest.

## Later phases (from the audit plan)

Shared site helpers, one contract toolchain (the folders are moved; the five copies of protobuf files are not merged), workflows with no embedded copies, split the bot, move each game onto the kit with a shadow week, then clean the tests so they check behaviour rather than file paths.
