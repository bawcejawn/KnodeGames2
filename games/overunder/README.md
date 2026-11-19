# Over/Under (game 16)

Every day each block producer on the week's roster has a line at half a block, set by the VHP Ruler. Players pick Over or Under on any rows (a blank row is no pick); a day's picks are two 64-bit numbers on the Picks contract (2 bits a row in roster order; rows 1 to 32 and rows 33 to 64, two 12-hour Picks rounds, up to 64 producers). A row is right if the producer's credited blocks are above (Over) or below (Under) the line: 1 point a row; void or exactly-on-the-line rows are skipped. Weekly board and prizes. The scoring is `math.js`, used by both the page and the recorder.

- **Rules (the one home):** `docs/games/OverUnder.md`
- **Settings:** `game.json` (checked by `npm run game:check -- overunder`)
- **Week, finals, claims, prizes:** `.ai/standards/WEEK_CYCLE.md`
- **Going live:** `.ai/standards/NEW_GAME.md` → `.ai/standards/GO_LIVE_CHECKLIST.md`
- **Owner chat:** see `game.json` → `ownerChat`
