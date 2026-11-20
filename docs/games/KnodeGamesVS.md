# Knode Games VS (game 17)

Status: building. TEST only (no vault prizes) until the owner says otherwise.

**What it is.** One round a day (UTC). The Knode Games pool node plays every producer on that day's roster. In each matchup
the higher `fpct` for the day wins; exactly equal is a tie and scores nothing; a matchup with no measure for one side is
skipped for everyone. One point per matchup called right.

**A pick** is one number (Picks kind 3, 0 to 18446744073709551615). Bit i set means "producer i beats the pool node"; every
unticked producer counts as "the pool node beats it". Number 0 is "Knode Games vs All". No pick changes. Picks open 2 days
before the round and lock 5 minutes before it.

**The roster** is up to 64 producers sorted by address, never the pool node, published once (write-once) before picks open.
More than 64 stops the recorder loudly; nothing is cut. Lines and multipliers stay hidden until picks lock; names only before.

**Standings of the pool node** (W-L-T): monthly, all-time and per producer, from final day files only, append-only.
Two no-skill baselines are shown next to each player's score: "pool node beats all" and "every producer beats the pool node".

All rules live in `games/vs/math.js`; the recorder is `games/vs/recorder.ts`. Rules stand-ins waiting for the Ruler's #33 are
listed at the top of `recorder.ts`.
