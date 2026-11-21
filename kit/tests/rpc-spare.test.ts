// RPC_SPARE (D-480 plan, Fri 20 Nov): the kit reads RPC and RPC_CHECK; when one doesn't answer its head, RPC_SPARE
// stands in for it that run. Always two DIFFERENT nodes; every run logs whether the spare answered.
import test from "node:test";
import assert from "node:assert/strict";
import { pickNodes } from "../recorder/cli.ts";

const node = (url: string, ok: boolean) => ({ label: url, vault: { label: url, read: async () => ({}) }, contract: () => ({ label: url, read: async () => ({}) }), head: async () => { if (!ok) throw new Error(`${url} down`); return { height: 1, lib: 1, time: 1 }; } }) as any;
const run = async (up: Record<string, boolean>, rpc: string, check: string, spare?: string) => {
  const logs: string[] = [];
  try { const [a, b] = await pickNodes(async (_l, u) => node(u, up[u] ?? false), rpc, check, spare, (x) => logs.push(x)); return { used: [a.label, b.label], logs }; }
  catch (e) { return { error: (e as Error).message, logs }; }
};

test("RPC_SPARE: both nodes up → RPC and RPC_CHECK; the spare is only probed and logged", async () => {
  const r = await run({ A: true, B: true, S: false }, "A", "B", "S");
  assert.deepEqual(r.used, ["A", "B"]);
  assert.deepEqual(r.logs, ["RPC_SPARE (S) did NOT answer this run"]);
  assert.deepEqual((await run({ A: true, B: true }, "A", "B")).logs, [], "no spare set: nothing logged");
});

test("RPC_SPARE: stands in for whichever of the two isn't answering", async () => {
  let r = await run({ A: false, B: true, S: true }, "A", "B", "S");
  assert.deepEqual(r.used, ["S", "B"]);
  assert.match(r.logs.join("\n"), /RPC \(A\) isn't answering: RPC_SPARE \(S\) stands in/);
  r = await run({ A: true, B: false, S: true }, "A", "B", "S");
  assert.deepEqual(r.used, ["A", "S"]);
});

test("RPC_SPARE: never two copies of the same node, and a stop when two working nodes can't be had", async () => {
  assert.match((await run({ A: true, B: false }, "A", "B", "A")).error ?? "", /same node as the other one/);
  assert.match((await run({ A: false, B: true, S: false }, "A", "B", "S")).error ?? "", /RPC isn't answering, nor is RPC_SPARE/);
  assert.match((await run({ A: false, B: true }, "A", "B")).error ?? "", /RPC_SPARE isn't set/);
  assert.match((await run({ A: false, B: false, S: true }, "A", "B", "S")).error ?? "", /RPC and RPC_CHECK aren't answering/);
});
