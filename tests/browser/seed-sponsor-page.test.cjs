// Seed Sponsor page in a real browser (Chromium via Playwright), at the two phone widths the owner asked for (320 and
// 390 px). The site is assembled first (dist-site/), koilib comes from node_modules, and a fake Koinos node answers the
// vault's get_state. No network. Not part of npm test (it needs Playwright's Chromium): node --test tests/browser/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process");
const { chromium } = require(process.env.PW || "/opt/npm-tools/node_modules/playwright");
const ROOT = path.resolve(__dirname, "../..");
const { Serializer, utils } = require(path.join(ROOT, "node_modules/koilib"));
const abi = require(path.join(ROOT, "contracts/vault/abi/kpred.koilib.json"));
const ser = new Serializer(abi.koilib_types);
const getState = abi.methods.get_state;
const SITE = "https://knodegames.com/";
const UNIT = 100000000n;
const NODES = ["https://koinos.armana.io", "https://api.koinosblocks.com"];
const cors = { "access-control-allow-origin": "*" };

execFileSync(process.execPath, [path.join(ROOT, "tools/ci/assemble-site.mjs")], { cwd: ROOT, stdio: "ignore" });
const DIST = path.join(ROOT, "dist-site");

/** Open the page. opts.seedVhp: the seed's VHP the fake node reports; opts.nodeDown: every node read fails. */
async function open(width, opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const sent = [];
  await page.route("**/*", async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.href.startsWith("https://cdn.jsdelivr.net/npm/koilib@9.4.1/")) return route.fulfill({ body: fs.readFileSync(path.join(ROOT, "node_modules/koilib/dist/koinos.min.js")), contentType: "text/javascript", headers: cors });
    if (u.href.startsWith("https://cdn.jsdelivr.net/npm/kondor-js")) return route.fulfill({ body: "window.kondor={getAccounts:async()=>[],getSigner:()=>null};", contentType: "text/javascript", headers: cors });
    if (NODES.includes(u.origin)) {
      const body = JSON.parse(req.postData() || "{}");
      sent.push(body.method);
      if (opts.nodeDown) return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "node busy" } }) });
      let result = {};
      if (body.method === "chain.read_contract" && (body.params.entry_point >>> 0) === (getState.entry_point >>> 0)) {
        const out = { time: String(Date.UTC(2026, 10, 25, 23, 0)), totals: { seed_vhp: String(BigInt(opts.seedVhp ?? 21050) * UNIT), total_stake: String(5000n * UNIT) } };
        result = { result: utils.encodeBase64url(await ser.serialize(out, getState.return)) };
      }
      return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
    }
    if (u.href.startsWith(SITE)) {
      const rel = u.pathname.slice(1) || "index.html";
      const f = path.join(DIST, rel);
      if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: "" });
      const ct = rel.endsWith(".html") ? "text/html" : rel.endsWith(".js") ? "text/javascript" : rel.endsWith(".css") ? "text/css" : rel.endsWith(".json") ? "application/json" : undefined;
      return route.fulfill({ body: fs.readFileSync(f), contentType: ct });
    }
    return route.abort();
  });
  await page.goto(SITE + "seed-sponsor.html");
  await page.waitForFunction(() => !/Reading/.test(document.getElementById("ss-asof").textContent), null, { timeout: 15000 });
  return { browser, page, sent };
}

for (const width of [320, 390]) {
  test(`${width} px: the seed total is read from the chain, nothing overflows, both buttons stay off`, async () => {
    const { browser, page, sent } = await open(width, { seedVhp: 21050 });
    try {
      const m = await page.evaluate(() => ({
        total: document.getElementById("ss-total").textContent,
        asof: document.getElementById("ss-asof").textContent,
        scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
        mins: [...document.querySelectorAll("[data-ss-min]")].map((n) => n.textContent),
        buttons: [...document.querySelectorAll(".ss-go")].map((b) => b.disabled),
        donors: document.getElementById("ss-donors").textContent.trim(),
      }));
      assert.equal(m.total, "21,050 VHP");
      assert.match(m.asof, /^Read from the chain/);
      assert.equal(m.scroll, m.client, "no sideways scroll");
      assert.deepEqual(m.mins, ["1,000 VHP", "1,000 VHP"]);
      assert.deepEqual(m.buttons, [true, true]);
      assert.equal(m.donors, "No donations yet.");
      assert.ok(sent.every((x) => x === "chain.read_contract"), `only reads: ${sent.join(", ")}`);
    } finally { await browser.close(); }
  });
}

test("a node that cannot be read shows a plain error, not a number", async () => {
  const { browser, page } = await open(390, { nodeDown: true });
  try {
    assert.equal(await page.textContent("#ss-total"), "–");
    assert.match(await page.textContent("#ss-asof"), /Couldn't read the seed right now/);
  } finally { await browser.close(); }
});
