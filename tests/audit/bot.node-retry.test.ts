// bot/node.ts (M-272, approved M-275; Vault M-273 §3): the bot's and the hourly recorders' node reads retry a web page
// (4 tries, 2/4/8 s), then take one go on RPC_SPARE after a node error; a send is never retried or moved; a contract's
// refusal is never retried; the spare is never the same host as RPC or RPC_CHECK; only the RPC side gets it (D-539).
import test from "node:test";
import assert from "node:assert/strict";
import { guardCall, usableSpare, spareFor, hostKey, nodeProvider, SUBMIT, READS, PAGE_TRIES, PAGE_WAITS_MS } from "../../bot/node.ts";

const PAGE = "invalid json response body at https://api.koinos.io/ reason: Unexpected token '<', \"<html>\" is not valid JSON";
const noSleep = async () => {};
/** A node that fails its first `bad` calls with `err`, then answers. */
const node = (bad: number, err: string) => { const calls: string[] = []; let n = 0; return { calls, call: async (m: string) => { calls.push(m); if (n++ < bad) throw new Error(err); return { ok: m }; } }; };

test("node: a web page is retried, 4 tries in all, waiting 2, 4 and 8 s", async () => {
  const a = node(3, PAGE), waits: number[] = [];
  const g = guardCall(a.call, null, { sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(await g("chain.get_head_info", {}), { ok: "chain.get_head_info" });
  assert.equal(a.calls.length, 4);
  assert.deepEqual(waits, [2000, 4000, 8000]);
  const b = node(9, PAGE);
  await assert.rejects(guardCall(b.call, null, { sleep: noSleep })("chain.get_head_info", {}), /invalid json response body/);
  assert.equal(b.calls.length, PAGE_TRIES, "bounded: exactly 4 tries");
});

test("node: a contract's refusal and other errors are not retried here (the callers' own rules apply, as before)", async () => {
  const a = node(1, '{"error":"reverted: not the owner"}');
  await assert.rejects(guardCall(a.call, node(0, "").call, { sleep: noSleep })("chain.read_contract", {}), /reverted/);
  assert.equal(a.calls.length, 1, "no retry, and no spare for a refusal");
  const b = node(1, "fetch failed");
  await assert.rejects(guardCall(b.call, null, { sleep: noSleep })("chain.read_contract", {}), /fetch failed/);
  assert.equal(b.calls.length, 1, "a plain network error is left to the caller's retry loop (unchanged)");
});

test("node: after the tries, one go on the spare (a network error or a page); logged once", async () => {
  const a = node(99, "fetch failed"), s = node(0, ""), logs: string[] = [];
  const g = guardCall(a.call, s.call, { sleep: noSleep, log: (x) => logs.push(x), spareLabel: "S" });
  assert.deepEqual(await g("chain.get_head_info", {}), { ok: "chain.get_head_info" });
  assert.deepEqual(await g("chain.read_contract", {}), { ok: "chain.read_contract" });
  assert.deepEqual(s.calls, ["chain.get_head_info", "chain.read_contract"]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /RPC_SPARE \(S\) stands in/);
  const p = node(99, PAGE), s2 = node(0, "");
  await guardCall(p.call, s2.call, { sleep: noSleep })("chain.get_head_info", {});
  assert.equal(p.calls.length, PAGE_TRIES, "the page is retried on the main node first");
  assert.equal(s2.calls.length, 1);
});

test("node: a send (chain.submit_transaction) is never retried and never moved to the spare", async () => {
  const a = node(1, PAGE), s = node(0, "");
  await assert.rejects(guardCall(a.call, s.call, { sleep: noSleep })(SUBMIT, {}), /invalid json/);
  assert.deepEqual(a.calls, [SUBMIT]);
  assert.deepEqual(s.calls, []);
});

test("node: RPC_SPARE is used only when it is a different host from RPC and RPC_CHECK", () => {
  assert.equal(hostKey(" https://API.koinos.io/x "), "api.koinos.io");
  const env = { RPC: "https://api.koinos.io", RPC_CHECK: "https://api.koinosblocks.com" };
  assert.equal(usableSpare({ ...env, RPC_SPARE: "https://koinos.armana.io" }), "https://koinos.armana.io");
  assert.equal(usableSpare({ ...env, RPC_SPARE: "https://API.koinos.io/" }), null, "same host as RPC");
  assert.equal(usableSpare({ ...env, RPC_SPARE: "https://api.koinosblocks.com/x" }), null, "same host as RPC_CHECK");
  assert.equal(usableSpare({ ...env, RPC_SPARE: "   " }), null);
  assert.equal(usableSpare(env), null);
  assert.equal(usableSpare({ RPC: "https://a.io", RPC_CHECK: "off", RPC_SPARE: "https://b.io" }), "https://b.io", "one node configured: the spare may stand in");
  assert.equal(usableSpare({ RPC: "https://a.io", RPC_SPARE: "https://api.koinosblocks.com" }), null, "RPC_CHECK unset counts as its default node");
  assert.equal(usableSpare({ RPC_CHECK: "https://b.io", RPC_SPARE: "https://koinos.armana.io" }), null, "RPC unset counts as its default node");
});

test("node: the numbers are pinned: 4 tries, waits 2, 4, 8 s (J55-3)", () => {
  assert.equal(PAGE_TRIES, 4);
  assert.deepEqual(PAGE_WAITS_MS, [2000, 4000, 8000]);
});

test("node: only listed reads are guarded; chain.submit_block and unknown methods pass straight through (J55-2)", async () => {
  assert.ok(READS.has("chain.get_head_info") && READS.has("block_store.get_blocks_by_height"));
  for (const m of [SUBMIT, "chain.submit_block", "chain.invoke_system_call", "something.new"]) {
    assert.ok(!READS.has(m), m);
    const a = node(1, PAGE), s = node(0, "");
    await assert.rejects(guardCall(a.call, s.call, { sleep: noSleep })(m, {}), /invalid json/);
    assert.deepEqual(a.calls, [m], `${m}: one call, no retry`);
    assert.deepEqual(s.calls, [], `${m}: never the spare`);
  }
});

test("node: two nodes disagreeing is not failed over: both answers come back as they are (J55-2)", async () => {
  const s = node(0, "");
  const a = guardCall(async () => ({ head: 100 }), s.call, { sleep: noSleep });
  const b = guardCall(async () => ({ head: 250 }), null, { sleep: noSleep });
  assert.notDeepEqual(await a("chain.get_head_info", {}), await b("chain.get_head_info", {}));
  assert.deepEqual(s.calls, [], "a disagreement never reaches the spare");
});

test("node: only the RPC side gets the spare; RPC_CHECK, other nodes and the spare's own URL never do (D-539, J55-1, J55-3)", () => {
  const env = { RPC: "https://a.example", RPC_CHECK: "https://b.example", RPC_SPARE: "https://c.example" };
  assert.equal(spareFor("https://A.example/", env), "https://c.example");
  assert.equal(spareFor("https://b.example", env), null, "RPC_CHECK: no spare");
  assert.equal(spareFor("https://other.example", env), null, "a node that is neither: no spare");
  assert.equal(spareFor("https://c.example", { ...env, RPC: "https://c.example" }), null, "never for the spare's own URL");
  assert.equal(spareFor("https://a.example", { ...env, RPC_CHECK: "https://a.example" }), null, "RPC = RPC_CHECK: no spare");
  assert.equal(spareFor("https://koinos.armana.io", { RPC_CHECK: "https://b.example", RPC_SPARE: "https://c.example" }), "https://c.example", "RPC unset: its default is the RPC side");
  assert.equal((nodeProvider("https://b.example", env, () => {}) as any).spareUrl, null);
  assert.equal((nodeProvider("https://c.example", { ...env, RPC: "https://c.example" }, () => {}) as any).spareUrl, null);
});

test("node: both mains down, one spare: the RPC side answers, the RPC_CHECK side throws (J55-1)", async () => {
  const env = { RPC: "https://a.example", RPC_CHECK: "https://b.example", RPC_SPARE: "https://c.example" };
  const s = node(0, ""), down = () => node(99, "fetch failed");
  const mk = (url: string) => guardCall(down().call, spareFor(url, env) ? s.call : null, { sleep: noSleep });
  assert.deepEqual(await mk(env.RPC)("chain.get_head_info", {}), { ok: "chain.get_head_info" });
  await assert.rejects(mk(env.RPC_CHECK)("chain.get_head_info", {}), /fetch failed/);
  assert.equal(s.calls.length, 1, "the spare answered exactly once: for RPC only");
});

test("node: nodeProvider guards the Provider's own call (koilib routes every read and send through it)", async () => {
  const p: any = nodeProvider("https://a.example", { RPC: "https://a.example", RPC_CHECK: "https://b.example", RPC_SPARE: "https://c.example" }, () => {});
  assert.notEqual(p.call, Object.getPrototypeOf(p).call, "the instance's call is the guarded one");
  assert.equal(typeof p.getHeadInfo, "function");
  assert.equal(p.spareUrl, "https://c.example");
});
