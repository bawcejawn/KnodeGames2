# GitHub Actions

Every workflow is manual. None of them has a `schedule:`. None of them runs because someone opened a pull request, except CI.

CI (`.github/workflows/ci.yml`) runs on a pull request. It installs from the lockfile with scripts off, lints, runs the tests, audits dependencies, and builds the five contracts. It cannot write to the repository.

## Turning the website on

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**. Not "Deploy from a branch". A branch deploy would publish the whole repository, including tests.
2. Settings → Secrets and variables → Actions → Variables → New repository variable. Name `KG_ENABLE_PAGES`. Value `true`.
3. Actions → Publish the website → Run workflow, on `main`.

Until step 2, the Run button starts a workflow whose job is skipped.

To turn it off, set `KG_ENABLE_PAGES` to anything other than `true`, or delete the variable.

## Turning the bot on

The bot workflow is `bot.yml`. Its jobs already refuse to run unless:

- you pressed Run workflow, and
- the variable `BOT_ENABLED` is `true`, and
- the run is on `main`.

The operator key belongs in an environment named `bot`, with a deployment branch rule of only `main`. Do not put `OPERATOR_WIF` in a normal repository secret.

There is still no timer. A manual run does one tick. To run every hour, after you have watched a few manual runs, add the cron lines back to the `on:` block of that one file and open a pull request. The crons that the old site used were `7 * * * *`, `48 11 * * 1-6`, and `48 23 * * 0-5`. Do not add them until the data branch exists ([DATA.md](DATA.md)).

## The other workflows

`games.yml`, `race.yml`, `golf.yml`, `combo.yml`, `kit-games.yml`, `names.yml`, `stats.yml`, `vhp-ruler.yml`, `watch.yml`, `capacity.yml`, and the contract-test workflows are the same: Run workflow only, no timer. Most of them also look for their own `*_ENABLED` variable and skip if it is missing. Leave those variables unset until that game's cutover in [GO-LIVE.md](GO-LIVE.md).

`games-testnet.yml` is manual and the testnet pages are not in `web/`.

## What you should not turn on

- A `schedule:` before you have read a successful manual run.
- Pages set to "Deploy from a branch".
- `pull_request_target` or a workflow that has `write-all`. CI will fail the policy lint if those appear.
