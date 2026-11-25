// D-278 on the Producer Bracket page (P3; the harness is site.bracket-confirm.test.mjs's): a first bracket may be paid by
// the Knode Games Mana sponsor and is sent exactly as before; a CHANGE goes out with the player's own Mana (noSponsor,
// never the sponsor); a guest wallet can't change a bracket, and is told before anything is built or signed. The words
// are the shared card's own (web/js/lib/send-picks.js). Also: the phone round stepper's short names, and no request for
// next week's file before it is seeded. Behaviour, not regexes.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const APP = process.env.APP || fileURLToPath(new URL("../..", import.meta.url));
const read = (f) => {
  const direct = path.join(APP, f);
  const nested = path.join(APP, "web", f);
  return fs.readFileSync(fs.existsSync(direct) ? direct : nested, "utf8");
};
await import(path.resolve(APP, "web/vhp-standard.js")); await import(path.resolve(APP, "web/bracket-math.js"));
const BM = globalThis.KBracketMath;
const PINNED = "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm";
const ALICE = "1A1iceAAAAAAAAAAAAAAAAAAAAAAAAAAAA", BOB = "1BobBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const seeds = Array.from({ length: 8 }, (_, i) => "1Seed" + "ABCDEFGH"[i] + "x".repeat(28));
const windows = [];
after(() => { for (const w of windows) w.close(); });   // the page's refresh timers would keep the test alive
const flush = async (w, n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => w.setTimeout(r, 0)); };

async function openPage({ now, chainNow = now, picksDeployment = PINNED, kind = "kondor", sentBefore = null } = {}) {
  const W = 4;   // shown week: seeded Sunday, picks until Monday 23:55
  const weekFile = { v: BM.FILE_V, week: W, start: BM.weekStart(W), end: BM.weekStart(W + 1), status: "open",
    seeding: { at: BM.seedTime(W), cardAt: 1, size: 8, seeds, vhp: seeds.map((_, i) => 8 - i), totalVhp: 36, out: [], outVhp: [], raw: {}, pooled: [], hash: "x" },
    picks: null, days: [[], [], []].map(() => new Array(24).fill(null)), results: null, points: [], staked: null };
  const dom = new JSDOM(read("web/bracket.html"), { runScripts: "outside-only", url: "https://knodegames.com/bracket.html" });
  const w = dom.window; windows.push(w);
  w.Date.now = () => now;
  const sent = [], picks = [];
  let chainPick = sentBefore;
  const asked = [];
  w.fetch = async (u) => {
    const s = String(u); asked.push(s);
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (s.endsWith("picks-data/deployment.json")) return json({ contract: picksDeployment });
    if (s.endsWith("game-data/deployment.json")) return json({ chainId: "x" });
    if (s.endsWith("contracts/picks/abi/picks.koilib.json")) return json({ methods: {} });
    if (s.endsWith(`W00${W}.json`)) return json(weekFile);
    return { ok: false, status: 404, json: async () => null };
  };
  w.koilib = {
    Provider: class { async getHeadInfo() { return { head_block_time: String(chainNow) }; } },
    Contract: class {
      constructor(o) {
        this.id = o.id;
        this.functions = {
          get_pick: async () => ({ result: chainPick === null ? {} : { pick: { number: String(chainPick), time: "1" } } }),
          pick: async (args) => { picks.push({ ...args, contract: o.id }); return { operation: { args } }; },
        };
      }
    },
  };
  const listeners = new Set();
  const wallet = { address: ALICE, kind };
  w.KWallet = {
    get address() { return wallet.address; }, get kind() { return wallet.kind; }, label: () => "Kondor",
    init() {}, subscribe: (f) => listeners.add(f),
    async send(what, ops, ...rest) { sent.push({ what, ops, from: wallet.address, opts: rest }); chainPick = Number(ops[0].args.number); return "0xtx"; },
  };
  for (const f of ["web/vhp-standard.js", "web/bracket-math.js", "web/bracket.js"]) w.eval(read(f));
  await flush(w, 20);
  const $ = (id) => w.document.getElementById(id);
  const modal = () => w.document.querySelector(".pk-modal");
  const modalText = () => (modal() && !modal().hidden ? modal().textContent : "");
  const button = (text) => [...w.document.querySelectorAll(".pk-modal button")].find((b) => b.textContent === text);
  return {
    w, $, modal, modalText, button, sent, picks, wallet, asked,
    switchAccount: async (a, notify = true) => { wallet.address = a; if (notify) for (const f of listeners) f(); await flush(w); },
    fill: async () => { $("bk-fill-chalk").click(); await flush(w); },
    review: async () => { $("bk-submit").click(); await flush(w); },
    confirm: async () => { const b = button("Confirm in wallet"); assert.ok(b, "a Confirm button: " + modalText()); b.click(); await flush(w, 30); },
  };
}
const SUNDAY = BM.seedTime(4) + 3 * 3600000;   // picks open


const SP = await import(path.resolve(APP, "web/js/lib/send-picks.js"));
const ownMana = SP.confirmLines({ fresh: [], changes: [{ label: "x", changesLeft: null }], same: [], refused: [] }, () => "").find((l) => /own Mana/.test(l));

test("D-278: the Bracket uses the shared card's own words", () => {
  const js = read("web/bracket.js");
  assert.ok(js.includes(JSON.stringify(SP.GUEST_CHANGE)), "GUEST_CHANGE, word for word");
  assert.ok(ownMana && js.includes(JSON.stringify(ownMana)), "the own-Mana line, word for word");
});

test("D-278: a first bracket is sent exactly as before (no options, so the sponsor may pay)", async () => {
  const p = await openPage({ now: SUNDAY });
  await p.fill(); await p.review();
  assert.match(p.modalText(), /Check your bracket/); assert.doesNotMatch(p.modalText(), /own Mana/);
  await p.confirm();
  assert.equal(p.sent.length, 1); assert.deepEqual(p.sent[0].opts, [], "W.send(label, [op]) with nothing else");
});

test("D-278: a change says so, and goes out with the player's own Mana (noSponsor), never the sponsor", async () => {
  const p = await openPage({ now: SUNDAY, sentBefore: 5 });   // a bracket (number 5) is already on chain
  await p.fill(); await p.review();
  const text = p.modalText();
  assert.match(text, /Check your change/); assert.ok(text.includes(ownMana), "the own-Mana line"); assert.match(text, /uses one of your 20 changes/);
  await p.confirm();
  assert.equal(p.sent.length, 1); assert.equal(JSON.stringify(p.sent[0].opts), JSON.stringify([{ noSponsor: true }]), "noSponsor: true, the only option");
  assert.match(p.sent[0].what, /change/);
});

test("D-278: a guest can't change a bracket: told at once; nothing is built or signed", async () => {
  const p = await openPage({ now: SUNDAY, kind: "guest", sentBefore: 5 });
  await p.fill(); await p.review();
  assert.ok(p.modalText().includes(SP.GUEST_CHANGE)); assert.equal(p.button("Confirm in wallet"), undefined);
  assert.equal(p.sent.length, 0); assert.equal(p.picks.length, 0);
});

test("D-278: a guest's FIRST bracket is still free (sponsored), as before", async () => {
  const p = await openPage({ now: SUNDAY, kind: "guest" });
  await p.fill(); await p.review(); await p.confirm();
  assert.equal(p.sent.length, 1); assert.deepEqual(p.sent[0].opts, []);
});

test("phones: the round stepper shows short names (R16 · QF · SF · Final), the full name stays for screen readers", async () => {
  const p = await openPage({ now: SUNDAY });   // 8 producers: Quarterfinals, Semifinals, Final
  const tabs = [...p.$("bk-rounds").querySelectorAll("button")];
  assert.deepEqual(tabs.map((b) => b.querySelector("span").textContent), ["QF", "SF", "Final"]);
  assert.deepEqual(tabs.map((b) => b.getAttribute("aria-label")), ["Quarterfinals", "Semifinals", "Final"]);
});

test("no request for next week's file before its seeding (no 404 on every load)", async () => {
  const p = await openPage({ now: SUNDAY });   // during week 4: week 5 is seeded only at BM.seedTime(5)
  assert.ok(SUNDAY < BM.seedTime(5));
  assert.equal(p.asked.some((u) => u.endsWith("W005.json")), false);
  assert.ok(p.asked.some((u) => u.endsWith("W004.json")));
});
