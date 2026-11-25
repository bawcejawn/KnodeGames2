// Audit AB-073: the admin page ran every command from the wrong folder. Its ROOT was ops/, not the repo, so each
// button looked for ops/bot/bot.ts (not there: "not on this copy yet") and would read ops/.env (no keys).
// Proved with a command that fails fast and offline: a testnet read with no testnet deployment folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

function post(port: number, key: string, body: unknown) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: "127.0.0.1", port, path: "/api/run", method: "POST",
      headers: { host: `127.0.0.1:${port}`, "x-admin-key": key, "content-type": "application/json" } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j: any = b; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode!, body: j }); });
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

test("AB-073: the admin page runs its commands from the repo folder, so the bot script is found", async () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["--import", "tsx", "ops/admin/server.ts"], {
    env: { ...process.env, ADMIN_PORT: String(port), ADMIN_NO_BROWSER: "1", GEN_DIR: "no-such-folder-ab073" } });
  let out = "";
  child.stdout.on("data", (b) => (out += b));
  try {
    for (let i = 0; i < 100 && !/#([0-9a-f]{48})/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
    const key = out.match(/#([0-9a-f]{48})/)![1];
    const r = await post(port, key, { action: "t-vault-games", values: {} });
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.body.output, /is not on this copy yet/, "the bot script must be found");
    assert.match(r.body.output, /no-such-folder-ab073[\\/]deployment\.json not found/, "the bot itself ran (and stopped: no testnet deployment)");
  } finally { child.kill(); }
});
