# Over Under — security checklist

Fill in every line before the first Repo Lens review; keep it current after each review.

| Check | Answer |
|---|---|
| Holds tokens? | No (games never hold tokens; payouts only through the vault) |
| Keys used by the recorder | None (read-only) |
| Chain data read, and from which two nodes | The vault (stakes), the Picks contract (game 16 picks, one Picks round per game: start ÷ 30 min) and the block clock, on the kit's two nodes; the ruler's published `vhp-data` branch (read-only). The kit holds the run when the nodes disagree. |
| Files it writes (data branch and folder) | `games-data` branch, `overunder/`: `schedule/r#####.json` (each game's write-once schedule file: who plays, the line, the queue, and the ruler card it used), week files, `board.json`, `alltime.json`, `vault/W<w>.json`, HOLD files. Nothing on `main`. |
| Workflow permissions (must match the CI guard's list) | The kit's generated `record-overunder` job: `contents: read`; the shared `publish-kit` job pushes only the data branch. Off unless `OVERUNDER_ENABLED` is `true`. |
| What a wrong run can do at worst | Publish a wrong schedule or week file. A schedule file is write-once and must agree on both nodes; the publish job rebuilds its ruler card before it accepts it, and refuses one outside its window. A game whose line doesn't match its scored card is cancelled, never scored. Nothing pays from a week that isn't final. |
| What stops it (holds, two-node check, recompute at publish, finals locked) | Two-node agreement; write-once schedule files with a checksum (`checkEntry`); a queue state that isn't exactly the expected shape stops the run loudly (`checkState`); the line re-checked on the scored card (`lineMatches`); the ruler's cards rebuilt in the publish job; finals locked. |
| Sponsor rows and their measured Mana | The shared Picks `pick` row (1.3). One pick per game, no changes. |
| Handicap source (only the VHP ruler) | The VHP Ruler: the line is the card's k scaled by form, capped at 1,000 blocks, as a half-block median line (the Ruler's `forecastExpected` and `medianLineHalves`, copied and pinned equal by a test); results use credited blocks. No operator-typed number. |
| Repo Lens reviews (ids, verdicts, commits) | KR-1 (Repo Lens 5, 20 Nov): the queue must stay right when an earlier schedule file is missing; fixed (each file carries the queue; tests in `tests/recorder.test.ts`). |
| Accepted risks (owner decisions, D-xxx) | D-344 a game with no schedule file is cancelled for everyone; void producers and lines exactly met are skipped; picks are public on chain before the lock; the line comes from a card whose moment is about 16 to 28 hours before the start (the ruler only makes a card once its scored range is in the data). |
