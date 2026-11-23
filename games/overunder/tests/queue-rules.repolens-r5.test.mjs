// Repo Lens 5, #22 delta (#R5-8b): a queue rule that no test pinned (the mutation survived on bd62cd0).
// Ships as games/overunder/tests/queue-rules.repolens-r5.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../math.js";

const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", C = "1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const T0 = Date.UTC(2026, 10, 30), S = R.SLOT;

test("Over Under queue: a producer that joins after the start goes to the bottom, it does not jump the queue (D-333)", () => {
  let st = R.emptyState(), r;
  r = R.step(st, [A, B], T0); assert.equal(r.producer, A); st = r.state;
  r = R.step(st, [A, B], T0 + S); assert.equal(r.producer, B); st = r.state;
  // C joins now (no games passed in, so nobody is blocked by running games).
  r = R.step(st, [A, B, C], T0 + 2 * S);
  assert.equal(r.producer, A, "A (oldest turn) plays next, not the new entrant C");
  r = R.step(r.state, [A, B, C], T0 + 3 * S); assert.equal(r.producer, B, "then B; C waits its turn at the bottom");
});
