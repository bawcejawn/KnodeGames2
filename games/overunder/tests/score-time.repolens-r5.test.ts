// Repo Lens 5, #22 (OU-1): an Over Under score time must lie in the vault week [start, results deadline) (kit/recorder/runtime.ts:638, NK-19).
// The Picks contract opens a game's pick 2 hours before its start (bot/picks.ts OVERUNDER_GAME ahead), so a pick for a game that
// starts in the first 2 hours of the week (Mon 00:00 to 01:59 UTC) is made BEFORE the week begins; its time is before the week.
// Ships as games/overunder/tests/score-time.repolens-r5.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { game, gridRounds } from "../recorder.ts";
import * as R from "../math.js";

const W = "1WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
const MON = Date.UTC(2026, 10, 30);                          // week 6 starts Mon 30 Nov 2026 00:00 UTC

test("Over Under: a pick for a game in the first 2 hours of the week keeps a score time inside the week", () => {
  const span = { start: MON, end: MON + 7 * 86400000 };
  const rounds = gridRounds(span);
  assert.ok(rounds.length > 300, "a week of rounds");
  const result: any = { outcome: "over", producer: "1PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP", line: 100 };
  for (const round of rounds.slice(0, 4)) {                   // the starts Mon 00:00, 00:30, 01:00, 01:30
    const start = Number(round.pickRound) * R.SLOT;
    const pickedAt = start - 2 * 3600000 + 60000;             // the earliest the contract allows (2 h ahead, plus a minute)
    const s = game.scoreRound(round, [{ wallet: W, round: String(round.pickRound), pick: { number: "1" } as any, at: pickedAt }], result, undefined as any);
    const row = s.get(W)!;
    assert.ok(row.points > 0, "a correct Over scores");
    assert.ok(row.at >= span.start && row.at < span.end + 86400000, `start ${new Date(start).toISOString()}: score time ${new Date(row.at).toISOString()} is before the week starts: the kit stops the whole run (NK-19)`);
  }
});
