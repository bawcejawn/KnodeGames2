# Over/Under line forecast against real blocks, and 48-card timing (Ruler, Sat 21 Nov 2026)

Read-only, from the `vhp-data` branch (841 block-hours, 19 Oct to 21 Nov 2026). Nothing here changes a rule.

## What was measured
For each hour as a game start (439 starts, 18 producers on the card's list, 7,679 games): the line is the form-based forecast
`forecastExpected(row)` (D-383) from a card whose window ends 3 hours before the start (game 16 settings, c 500000, minK 10,
poolRule min, ownRule spot, not paying), turned into a line with `medianLineHalves`. The actual is the producer's real signed
blocks in the next 12 hours (14,400 blocks). Over if actual is above the line, Under if below.
The roster here is the card's `entry` flag, not `listAt`. Games start every hour, so neighbouring games overlap: the games are
not independent, and the real number of independent 12-hour windows is about 36 per producer.

## Result 1: the 1,000-block cap breaks the line for big producers
| Group | Games | Over | Mean actual / mean line (blocks) |
|---|---|---|---|
| Forecast under 1,000 blocks (uncapped) | 5,384 | 53.8% | 330 / 326 |
| Forecast capped at 1,000 | 2,295 (30%) | **99.1%** | 1,926 / 1,000 |

`forecastExpected` stops at LUCK_CAP (1,000 blocks). Six producers on today's card expect more than 1,000 blocks in 12 hours
(their real averages are 1,000 to 2,700), so their line is stuck at 1,000 and Over almost always wins. Uncapped lines are fair
(Over 53.8%, mean error +4 blocks). Before Over/Under pays, either the cap comes off the forecast or those producers stay off
the paying game's roster. This is a Library/owner decision (D-383); the code change is one line in each of the two ruler files.

## Result 2: by form (uncapped games only)
| Form | Games | Over | Mean actual / line |
|---|---|---|---|
| On form (97% or more) | 3,016 | 52.9% | 303 / 297 |
| A little behind (90 to 96.9%) | 1,024 | 61.4% | 301 / 297 |
| Behind (80 to 89.9%) | 1,316 | 50.5% | 412 / 411 |
| Unreliable (under 80%) | 28 (all games) | Under 67.9% | about -9 blocks error |

No rule-sized bias except the 90 to 96.9% group (Over 61.4%); these games overlap, so a gap of this size over a month is a
caution, not a result. The mean error of uncapped producers below 97% form is close to zero (+4 blocks).

## Result 3: timing of 48 cards (one day of rolling games)
48 cards on the same data, one every 30 minutes, each with its 12-hour window and 6-hour card window:
| | Load the data and build the ledger | 48 cards | Per card |
|---|---|---|---|
| JavaScript (`vhp-ruler.js`) | 3.6 s | 3.1 s | about 64 ms |
| Python (`vhp_ruler.py`) | 9.5 s | 5.0 s | about 104 ms |
Both are far inside any workflow time limit; a recorder can build a whole day of Over/Under cards in one run.

## Not covered
Sudden stops of signing inside a game (Vault's simulation), the `listAt` roster, lines made 3 h 3 min to 3 h 33 min before the
start (this used exactly 3 hours), and games that start at :30.
