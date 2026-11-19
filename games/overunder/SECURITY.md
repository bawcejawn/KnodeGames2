# Over/Under — security checklist

Fill in every line before the first Repo Lens review; keep it current after each review.

| Check | Answer |
|---|---|
| Holds tokens? | No (games never hold tokens; payouts only through the vault) |
| Keys used by the recorder | None (read-only) |
| Chain data read, and from which two nodes | The vault (stakes), the Picks contract (game 16 picks) and the block clock, on the kit's two nodes; the ruler's published `vhp-data` branch (read-only). The kit holds the run when the nodes disagree. |
| Files it writes (data branch and folder) | `games-data` branch, `overunder/`: `inputs/W<w>.json` (the write-once roster), week files, `board.json`, `alltime.json`, `vault/W<w>.json`, HOLD files. Nothing on `main`. |
| Workflow permissions (must match the CI guard's list) | The kit's generated `record-overunder` job: `contents: read`; the shared `publish-kit` job pushes only the data branch. Off unless `OVERUNDER_ENABLED` is `true`. |
| What a wrong run can do at worst | Publish a wrong week file. The kit's publish check, the two-run stability wait and the end-of-week recount hold it; nothing pays from a file that isn't final. |
| What stops it (holds, two-node check, recompute at publish, finals locked) | Two-node agreement; write-once roster with its checksum (`checkRoster` refuses any other roster before a pick is decoded); the ruler's cards rebuilt in the publish job; finals locked; a roster over 64 rows is a loud error that stops the roster, never a silent cut. |
| Sponsor rows and their measured Mana | The shared Picks `pick` row (1.3, to be re-measured with a 64-bit number pick on mainnet before launch; Vault/Block X). One pick a day, so one operation. Changes are the player's own Mana (D-278). |
| Handicap source (only the VHP ruler) | The VHP Ruler: the line is the card's expected blocks rounded to a half block; results use credited blocks. No operator-typed number. |
| Repo Lens reviews (ids, verdicts, commits) | Not yet reviewed (PR opened Fri 20 Nov). |
| Accepted risks (owner decisions, D-xxx) | D-284 packed number pick; D-287 void rows skipped; D-286 two changes; picks are public on chain before the lock; the chain cannot check a number against the roster (the recorder does, and bad bits read as blank). |
