# Over Under (game 16)

A rolling game on the Shared Game Kit: a new game every 30 minutes, one producer and a line in half blocks (from the VHP Ruler). Players pick Over (1) or Under (2) on the Picks contract, one number per game, no changes. 1 point a game called right; void and cancelled games are skipped. Weekly board and prizes. The rules are `math.js`, used by both the page and the recorder; `recorder.ts` is the kit's part (schedule files, results, scores).

- **Rules (the one home):** `docs/games/OverUnder.md`
- **Settings:** `game.json` (checked by `npm run game:check -- overunder`)
- **Week, finals, claims, prizes:** `.ai/standards/WEEK_CYCLE.md`
- **Going live:** `.ai/standards/NEW_GAME.md` → `.ai/standards/GO_LIVE_CHECKLIST.md`
- **Owner chat:** see `game.json` → `ownerChat`
