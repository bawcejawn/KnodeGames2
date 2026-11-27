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
// The vault v6.2 ABI (Seed Sponsor calls), from PR C (seedsponsor/vault-c).
const abi62 = require(path.join(ROOT, "tests/fixtures/seed-sponsor/kpred-v62.koilib.json"));
const ser62 = new Serializer(abi62.koilib_types);
const EP = (m) => abi62.methods[m].entry_point >>> 0;
const { Signer } = require(path.join(ROOT, "node_modules/koilib"));
const ME = Signer.fromSeed("seed sponsor browser test").getAddress();
const OTHER = Signer.fromSeed("seed sponsor browser test 2").getAddress();
// A stand-in wallet: connected Kondor-style, it records what the page asks it to send and signs nothing.
const FAKE_WALLET = `window.KWallet = { address: ${JSON.stringify(ME)}, kind: "kondor", sent: [], subscribe() { return () => {}; },
  init() {}, setGuestConfig() {}, manageGuest() {}, switchTo() {}, forget() {}, connect: async () => {}, disconnect() {},
  label: () => "your wallet", accounts: () => [{ kind: "kondor", address: ${JSON.stringify(ME)} }],
  async send(label, ops, opts) { this.sent.push({ label, ops, opts }); return "0x1220test"; } };`;
const SITE = "https://knodegames.com/";
const UNIT = 100000000n;
const NODES = ["https://koinos.armana.io", "https://api.koinosblocks.com"];
const cors = { "access-control-allow-origin": "*" };

execFileSync(process.execPath, [path.join(ROOT, "tools/ci/assemble-site.mjs")], { cwd: ROOT, stdio: "ignore" });
const DIST = path.join(ROOT, "dist-site");

/** Open the page. opts.seedVhp: the seed's VHP the fake node reports; opts.nodeDown: every node read fails;
 *  opts.v62: the vault answers the Seed Sponsor calls; opts.live: the owner's switch is on; opts.wallet: a stand-in wallet. */
async function open(width, opts = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const sent = [];
  await page.route("**/*", async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.href.startsWith("https://cdn.jsdelivr.net/npm/koilib@9.4.1/")) return route.fulfill({ body: fs.readFileSync(path.join(ROOT, "node_modules/koilib/dist/koinos.min.js")), contentType: "text/javascript", headers: cors });
    if (u.href.startsWith("https://cdn.jsdelivr.net/npm/kondor-js")) return route.fulfill({ body: "window.kondor={getAccounts:async()=>[],getSigner:()=>null};", contentType: "text/javascript", headers: cors });
    if (opts.wallet && u.href === SITE + "wallet.js") return route.fulfill({ body: FAKE_WALLET, contentType: "text/javascript" });
    if (opts.live && u.href === SITE + "js/lib/config.js") {
      const src = fs.readFileSync(path.join(DIST, "js/lib/config.js"), "utf8").replace("live: false", "live: true");
      return route.fulfill({ body: src, contentType: "text/javascript" });
    }
    if (NODES.includes(u.origin)) {
      const body = JSON.parse(req.postData() || "{}");
      sent.push(body.method);
      if (opts.nodeDown) return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "node busy" } }) });
      let result = {};
      const ep = body.method === "chain.read_contract" ? body.params.entry_point >>> 0 : -1;
      if (ep === (getState.entry_point >>> 0)) {
        const out = { time: String(Date.UTC(2026, 10, 25, 23, 0)), totals: { seed_vhp: String(BigInt(opts.seedVhp ?? 21050) * UNIT), total_stake: String(5000n * UNIT) } };
        if (opts.v62) out.totals.support_vhp = String(1500n * UNIT);
        result = { result: utils.encodeBase64url(await (opts.v62 ? ser62 : ser).serialize(out, (opts.v62 ? abi62 : abi).methods.get_state.return)) };
      } else if (opts.v62 && ep === EP("list_sponsors")) {
        const rows = [
          { address: ME, sponsor: { support: String(1500n * UNIT), donated: "0", nickname: "Helper", show_amount: true } },
          { address: OTHER, sponsor: { support: "0", donated: String(2000n * UNIT), nickname: "Big Giver", show_amount: false } },
        ];
        result = { result: utils.encodeBase64url(await ser62.serialize({ rows }, abi62.methods.list_sponsors.return)) };
      } else if (opts.v62 && ep === EP("get_sponsor")) {
        const sp = { support: String(1500n * UNIT), donated: "0", nickname: "Helper", show_amount: true };
        result = { result: utils.encodeBase64url(await ser62.serialize({ sponsor: sp }, abi62.methods.get_sponsor.return)) };
      } else if (ep !== -1 && ep !== (getState.entry_point >>> 0)) {
        // The live v6.1 vault doesn't know the Seed Sponsor calls: the node reports a contract error.
        return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "unknown entry point" } }) });
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
      assert.deepEqual(m.mins, ["1,000 VHP", "1,000 VHP", "1,000 VHP"]);   // the two boxes and the form
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

test("the owner's switch is off: even a v6.2 vault shows the list but keeps both buttons off", async () => {
  const { browser, page } = await open(390, { v62: true, wallet: true });
  try {
    await page.waitForFunction(() => document.getElementById("ss-supporters").textContent.includes("Helper"));
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".ss-go")].map((b) => b.disabled)), [true, true]);
    assert.equal(await page.textContent("#ss-total"), "22,550 VHP");          // seed 21,050 + support 1,500
    assert.equal(await page.isVisible("#ss-mine"), false);
    const list = await page.textContent(".ss-list");
    assert.match(list, /Big Giver/);
    assert.doesNotMatch(list, /2,000 VHP/, "Big Giver didn't tick Show my amount");
    assert.match(list, /1,500 VHP/);
    assert.doesNotMatch(await page.innerHTML("main"), new RegExp(`${ME}|${OTHER}`), "no wallet address in the Seed Sponsor content (the site header shows your own connected wallet, as on every page)");
  } finally { await browser.close(); }
});

test("the switch is on but the vault is still v6.1: the buttons stay off", async () => {
  const { browser, page } = await open(390, { live: true, wallet: true });
  try {
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".ss-go")].map((b) => b.disabled)), [true, true]);
  } finally { await browser.close(); }
});

for (const width of [320, 390]) {
  test(`${width} px, switch on and v6.2: Donate → form → a big confirm screen → the wallet is asked for 2 operations, own Mana`, async () => {
    const { browser, page } = await open(width, { live: true, v62: true, wallet: true });
    try {
      await page.waitForFunction(() => !document.querySelector(".ss-go").disabled);
      await page.click(".ss-kind.give .ss-go");
      await page.fill("#ss-amount", "999");
      await page.fill("#ss-nick", "Node Fan");
      await page.click("#ss-form-next");
      assert.match(await page.textContent("#ss-form-err"), /at least 1,000 VHP/);
      await page.fill("#ss-nick", "Knode Games");
      await page.fill("#ss-amount", "1500");
      await page.click("#ss-form-next");
      assert.match(await page.textContent("#ss-form-err"), /reserved/);
      await page.fill("#ss-nick", "Node Fan");
      await page.check("#ss-show-amt");
      await page.click("#ss-form-next");
      assert.equal(await page.textContent("#ss-confirm-h"), "You are DONATING 1,500 VHP");
      const big = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("ss-confirm-h")).fontSize));
      assert.ok(big >= 24, `the title is big (${big}px)`);
      assert.match(await page.textContent("#ss-confirm-list"), /you can't take it back/);
      const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.equal(m.scroll, m.client, "no sideways scroll on the confirm screen");
      await page.click("#ss-confirm-go");
      await page.waitForFunction(() => window.KWallet.sent.length === 1);
      const sent = await page.evaluate(() => window.KWallet.sent.map((x) => ({ label: x.label, n: x.ops.length, opts: x.opts, eps: x.ops.map((o) => o.call_contract.entry_point >>> 0) })));
      assert.deepEqual(sent, [{ label: "Seed Sponsor donation", n: 2, opts: { noSponsor: true }, eps: [0x74e21680, EP("seed_donate")] }]);
      assert.match(await page.textContent("#ss-status"), /Thank you\. 1,500 VHP is in the Seed\./);
    } finally { await browser.close(); }
  });
}

test("your record: withdraw part of your support, with its own confirm screen; more than your support is refused", async () => {
  const { browser, page } = await open(390, { live: true, v62: true, wallet: true });
  try {
    await page.waitForSelector("#ss-mine:not([hidden])");
    assert.equal(await page.textContent("#ss-mine-support"), "1,500 VHP");
    await page.fill("#ss-w-amount", "2000");
    await page.click("#ss-w-go");
    assert.match(await page.textContent("#ss-mine-err"), /more than your support/);
    await page.fill("#ss-w-amount", "250");
    await page.click("#ss-w-go");
    assert.equal(await page.textContent("#ss-confirm-h"), "Withdraw 250 VHP of your support");
    await page.click("#ss-confirm-go");
    await page.waitForFunction(() => window.KWallet.sent.length === 1);
    const eps = await page.evaluate(() => window.KWallet.sent[0].ops.map((o) => o.call_contract.entry_point >>> 0));
    assert.deepEqual(eps, [EP("support_withdraw")].map(Number));
  } finally { await browser.close(); }
});
