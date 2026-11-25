# X posting (social/): plain-words guide

Status: built, **off**. Nothing is posted until the owner turns it on. Design: `claude/marketing/X-POSTING-SYSTEM-DESIGN-2026-11-25.md` (project docs). Owner steps: `X-OWNER-STEPS-2026-11-25.md`.

## What it does
Every 30 minutes (GitHub timer at :02 and :32, backed up by the kg-dispatch Worker at :07 and :37) it looks at `social/queue.json` and posts a post only if **all** of these hold:
- the repository variable `X_POSTING_ENABLED` is exactly `true` (anything else, or unset: it does nothing, and its jobs are skipped);
- the post's `status` is exactly `approved` (every shipped post is `draft`);
- its time (`when_et`) has come, and is less than 3 hours ago (later: logged `missed`, never posted);
- it has no earlier line in the log (intent, sent, error, skipped, missed, unknown all count: **never twice**);
- the wording gate passes at send time: at most 280 characters (a link counts 23), none of the banned words (bet, odds, wager, gambl*, jackpot, returns, APY, profit, get rich, passive income, line, spread, earn*; guaranteed (say "not promised")), no wallet address, no @mention, no hashtag, no `[slot]`, and a date in the text;
- limits: 2 per run, 2 per hour, 6 per ET day.

It is a **dry run** (prints what it would post; posts nothing; writes nothing) until `X_DRY_RUN` is exactly `false`.

## Safety
- **Four jobs.** `plan` and `send` run the repository code; `intent` and `record` write the log and run no repository code. Only `send` holds the four X keys and it has `contents: read` only. Only `intent` and `record` have a write token, and they write only the `social-data` branch, never `main`.
- **At most once.** The intent line is pushed to `social-data` before anything is sent. If a run crashes after sending, the intent has no result; the next run sees it, writes a `pause` line and stops. It is never retried. (Resuming is a manual step: see the owner steps.)
- **Any X error, 429 or network failure stops the run and pauses everything.** No retries on sends.
- The log is `social-data:log.json` (`{"events":[...]}`), so a merge to `main` can never overwrite it.
- v1 is text only, top-level posts only (the thread is three top-level posts at 9:00, 9:07, 9:37 each carrying its own date). No replies, no DMs, no likes, no follows.
- Keys: four secrets `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` (OAuth 1.0a User Context, Read and Write, no DMs). Never in a chat, a file or a log.

## Turn it off
Set `X_POSTING_ENABLED` to anything other than `true` (or delete it). Next run does nothing. To stop one post: change its status back to `draft` in `social/queue.json` (or do not approve it).

## Files
`social/lib.mjs` (rules), `social/x-post.mjs` (plan and send), `social/x-oauth1.mjs` (signing), `social/queue.json` (the posts; PR B), `.github/workflows/x-post.yml`, one line in `ops/cloudflare/kg-dispatch-worker.js` (`x-post.yml`, window 25), `tests/audit/social.x-post.test.mjs`.
