// Repo Lens R1-12 (away window): the node watchdog must not stay silent when it can't read the chain. A read error
// was only a warning, so a dead PC was never reported while the public node refused the watchdog. Now: a warning at
// first, an alarm (failed run = GitHub email) after 3 hours of failed reads in a row, a reminder every 3 hours, and a
// good read clears it. watch.yml reads from RPC_CHECK (the independent second node), not the stopgap RPC.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WATCH = path.join(ROOT, "bot/watch.mjs");
const ADDR = "1" + "A".repeat(33);

/** A fake Koinos node: "fail" answers 403; "ok" serves a head and blocks all signed by ADDR. */
function node(mode) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      seen.push(req.headers["user-agent"] || "");
      if (mode === "fail") { res.writeHead(403); res.end("Forbidden"); return; }
      const j = JSON.parse(b), now = Date.now();
      let result;
      if (j.method === "chain.get_head_info") result = { head_topology: { height: "100", id: "0xabc" }, head_block_time: String(now) };
      else {
        const start = Number(j.params.ancestor_start_height), n = j.params.num_blocks;
        result = { block_items: Array.from({ length: n }, (_, i) => ({ block_height: String(start + i), block: { header: { signer: ADDR, height: String(start + i), timestamp: String(now - (100 - start - i) * 3000) } } })) };
      }
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: j.id, result }));
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => srv.close() })));
}
function run(rpc, dir, state) {
  if (state !== undefined) fs.writeFileSync(path.join(dir, "watch-state.json"), JSON.stringify(state));
  return new Promise((r) => {
    const p = spawn(process.execPath, [WATCH], { cwd: dir, env: { PATH: process.env.PATH, RPC: rpc, WATCH_PRODUCER: ADDR, WATCH_MINUTES: "30" } });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => r({ code, out, state: JSON.parse(fs.readFileSync(path.join(dir, "watch-state.json"), "utf8")) }));
  });
}
const H = 3600_000;

test("watchdog: failed reads warn at first, alarm after 3 hours, remind every 3 hours; a good read clears it", async () => {
  const bad = await node("fail"), good = await node("ok");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-"));
  try {
    const a = await run(bad.url, dir, {});
    assert.equal(a.code, 0, a.out);
    assert.match(a.out, /::warning title=Node watchdog::Couldn't read blocks/);
    assert.ok(Number(a.state.readFailSince) > 0, "the first failed read is remembered");

    const b = await run(bad.url, dir, { readFailSince: Date.now() - 3 * H - 60000 });
    assert.equal(b.code, 1, "after 3 hours of failed reads the run fails (GitHub emails)");
    assert.match(b.out, /::error title=Watchdog can't see the chain::/);
    assert.ok(Number(b.state.readFailAlert) > 0);

    const c = await run(bad.url, dir, { readFailSince: Date.now() - 4 * H, readFailAlert: Date.now() - H });
    assert.equal(c.code, 0, "no second email within 3 hours");
    assert.match(c.out, /already emailed/);

    const d = await run(bad.url, dir, { readFailSince: Date.now() - 7 * H, readFailAlert: Date.now() - 3 * H - 60000 });
    assert.equal(d.code, 1, "a reminder after 3 hours");

    const e = await run(good.url, dir, { readFailSince: Date.now() - 7 * H, readFailAlert: Date.now() - H });
    assert.equal(e.code, 0, e.out);
    assert.match(e.out, /Reading the chain again/);
    assert.equal(e.state.readFailSince, undefined, "a good read clears the failed-read state");
    assert.ok(good.seen.every((u) => u === "knode-node-watchdog"), "it names itself (public nodes refuse some default user-agents)");
  } finally { bad.close(); good.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("watch.yml reads from RPC_CHECK (not the stopgap RPC), falling back to koinosblocks when it is empty or off", () => {
  const y = fs.readFileSync(path.join(ROOT, ".github/workflows/watch.yml"), "utf8");
  assert.ok(y.includes("RPC: ${{ (vars.RPC_CHECK != '' && vars.RPC_CHECK != 'off') && vars.RPC_CHECK || 'https://api.koinosblocks.com' }}"));
  assert.ok(!/RPC: \$\{\{ vars\.RPC \|\|/.test(y), "not the stopgap RPC");
});
