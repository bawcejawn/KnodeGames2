# kit-rolling-example (TEST FIXTURE, not a game)
The smallest rolling-rounds GameModule (game.json `rolling`, PR #38), used by the kit's conformance test. A round every
30 minutes on the vault's grid; its schedule body is `{ n, line }`; the result is 1 (Over) on even rounds and 2 (Under)
on odd ones, decided from the round's own schedule. Runs in no workflow, publishes nothing.
