// Growth counts (M-610, owner OK M-638, kg:remind M-653): seven plain PostHog counts with no addresses, and Vault's five
// conditions on the wallet.js signal (M-643). Run from the repo root: node --test tests/audit/site.growth-counts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";

const APP = path.resolve(process.env.APP || path.join(path.dirname(new URL(import.meta.url).pathname), "..", ".."));
const koilib = createRequire(APP + "/")("koilib");
const analyticsSrc = fs.readFileSync(`${APP}/web/analytics.js`, "utf8");
const guestSrc = fs.readFileSync(`${APP}/web/guest.js`, "utf8");
const walletSrc = fs.readFileSync(`${APP}/web/wallet.js`, "utf8");
const MAINNET = "EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==";
const GAME = "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr", DESK = "1FKTpXBhhHEbu5vVchM8UsVbAvPArJsRmR";
const RACE = "1EN7xU8R9tQXjHvrX79qZvvvGkkKWVnB5K", PICKS = "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm";
const VHP = "12Y5vW6gk8GceH53YfRkRre2Rrcsgw7Naq", KOIN = "19GYjDBVXU7keLbYvMLazsGQn3GTWHjHkK";
const SPONSOR = "1ByDDSBUzy5zkRceELc54Jh8i41yNRoKt8";
const ANSWER = 0x0db52f40, CLAIM = 0xdd1b3c31, PICK = 0x8ce33c6c, APPROVE = 0x74e21680, STAKE = 0x7bb5c436;
const ADDR = /1[1-9A-HJ-NP-Za-km-z]{25,34}/;
const ALLOWED = {
  first_visit: ["page"], first_pick_sent: ["game", "wallet", "secs"], pick_sent: ["game", "wallet", "n"],
  came_back: ["day", "picked_before"], share_tapped: ["game"], wallet_connected: ["wallet", "new_guest"], reminder_set: ["game", "reminder"],
};
const strip = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
class FakeEvent { constructor(type, o) { this.type = type; this.detail = o && o.detail; } }
function fakeDocument() {
  const ls = {};
  return { ls, addEventListener(t, f) { (ls[t] ||= []).push(f); }, dispatchEvent(e) { for (const f of ls[e.type] || []) { try { f(e); } catch { /* like a browser */ } } return true; } };
}

// ── analytics.js run in a sandbox ──
function page({ host = "knodegames.com", path: p = "/blockx.html", local = memStorage(), session = memStorage(), now = new Date(2026, 11, 1, 10, 0, 0) } = {}) {
  const captured = [];
  const document = fakeDocument();
  const posthog = { init() {}, capture(name, props) { captured.push(JSON.parse(JSON.stringify({ name, props }))); } };
  const RealDate = Date;
  const FixedDate = class extends RealDate { constructor(...a) { super(...(a.length ? a : [now.getTime()])); } static now() { return now.getTime(); } };
  const win = { posthog, localStorage: local, sessionStorage: session };
  const ctx = { window: win, document, location: { hostname: host, pathname: p }, Date: FixedDate, Math, Number, String, Object, Array, JSON, CustomEvent: FakeEvent };
  vm.createContext(ctx);
  vm.runInContext(analyticsSrc, ctx);
  const fire = (type, detail) => document.dispatchEvent(new FakeEvent(type, { detail }));
  return { captured, fire, local, session };
}
const names = (c) => c.map((x) => x.name);

test("only the seven counts, each with only its own properties", () => {
  const code = strip(analyticsSrc);
  assert.equal((code.match(/\.capture\(/g) || []).length, 1, "exactly one capture call, inside count()");
  assert.doesNotMatch(code, /\.identify\(|\.register\(|KWallet|\.address\b/, "no one is identified and no wallet is read");
  const p = page();
  p.fire("kg:sent", { n: 2, wallet: "guest" });
  p.fire("kg:wallet", { wallet: "kondor", new_guest: false });
  p.fire("kg:share");
  p.fire("kg:remind", { reminder: "daily" });
  for (const { name, props } of p.captured) {
    assert.ok(ALLOWED[name], `unknown count ${name}`);
    for (const k of Object.keys(props)) assert.ok(ALLOWED[name].includes(k), `${name} carries ${k}`);
  }
  assert.deepEqual(names(p.captured), ["first_visit", "first_pick_sent", "pick_sent", "wallet_connected", "share_tapped", "reminder_set"]);
});

test("an address in every field of a page event never reaches PostHog", () => {
  const a = koilib.Signer.fromSeed("growth test").getAddress();
  const p = page({ path: `/${a}.html` });
  p.fire("kg:sent", { n: a, wallet: a, address: a, id: a });
  p.fire("kg:wallet", { wallet: a, new_guest: a, address: a });
  p.fire("kg:remind", { reminder: a });
  p.fire("kg:share", { address: a });
  for (const { props } of p.captured) assert.doesNotMatch(JSON.stringify(props), ADDR);
  const sent = p.captured.find((c) => c.name === "pick_sent").props;
  assert.equal(sent.wallet, "other"); assert.equal(sent.n, 1); assert.equal(sent.game, "other");
});

test("first visit, same day, next day: first_visit once, then came_back with the day bucket", () => {
  const local = memStorage();
  const d1 = page({ local, now: new Date(2026, 11, 1, 9) });
  assert.deepEqual(names(d1.captured), ["first_visit"]);
  assert.deepEqual(d1.captured[0].props, { page: "blockx" });
  assert.deepEqual(page({ path: "/" }).captured[0].props, { page: "home" }, "Home lands as home");
  assert.deepEqual(names(page({ local, now: new Date(2026, 11, 1, 22) }).captured), [], "same day: nothing");
  const d2 = page({ local, now: new Date(2026, 11, 2, 7) });
  assert.deepEqual(d2.captured, [{ name: "came_back", props: { day: "1", picked_before: false } }]);
  assert.deepEqual(names(page({ local, now: new Date(2026, 11, 2, 20) }).captured), [], "once per day");
  assert.equal(page({ local, now: new Date(2026, 11, 9) }).captured[0].props.day, "7-13");
  assert.equal(page({ local, now: new Date(2026, 11, 20) }).captured[0].props.day, "14+");
});

test("first pick: once per browser, with a seconds bucket; every send counts as pick_sent with n 1 to 10", () => {
  const local = memStorage(), session = memStorage();
  const t0 = new Date(2026, 11, 1, 9, 0, 0);
  page({ local, session, now: t0 });                                   // first page of the visit
  const p = page({ local, session, now: new Date(t0.getTime() + 25000), path: "/index.html" });
  p.fire("kg:sent", { n: 1, wallet: "guest" });
  p.fire("kg:sent", { n: 40, wallet: "vault" });
  assert.deepEqual(p.captured, [
    { name: "first_pick_sent", props: { game: "questions", wallet: "guest", secs: "<30" } },
    { name: "pick_sent", props: { game: "questions", wallet: "guest", n: 1 } },
    { name: "pick_sent", props: { game: "questions", wallet: "vault", n: 10 } },
  ]);
  const next = page({ local, session: memStorage(), now: new Date(2026, 11, 2, 8) });
  assert.deepEqual(next.captured[0].props, { day: "1", picked_before: true });
  next.fire("kg:sent", { n: 1, wallet: "guest" });
  assert.deepEqual(names(next.captured), ["came_back", "pick_sent"], "no second first_pick_sent");
});

test("a first pick on a later day says later_day", () => {
  const local = memStorage();
  page({ local, now: new Date(2026, 11, 1, 9) });
  const p = page({ local, now: new Date(2026, 11, 3, 9) });
  p.fire("kg:sent", { n: 1, wallet: "kondor" });
  assert.equal(p.captured.find((c) => c.name === "first_pick_sent").props.secs, "later_day");
});

test("only three values in the browser: two dates and a flag; one start time in the tab", () => {
  const local = memStorage(), session = memStorage();
  const p = page({ local, session });
  p.fire("kg:sent", { n: 1, wallet: "guest" });
  assert.deepEqual([...local.m.keys()].sort(), ["kg-first-day", "kg-last-day", "kg-picked"]);
  assert.match(local.m.get("kg-first-day"), /^\d{4}-\d{2}-\d{2}$/); assert.match(local.m.get("kg-last-day"), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(local.m.get("kg-picked"), "1");
  assert.deepEqual([...session.m.keys()], ["kg-visit-start"]); assert.match(session.m.get("kg-visit-start"), /^\d+$/);
});

test("a bad reminder value, blocked storage and a throwing PostHog never break the page", () => {
  const p = page();
  p.fire("kg:remind", { reminder: "weekly" });
  assert.ok(!p.captured.some((c) => c.name === "reminder_set"));
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const q = page({ local: broken, session: broken });
  q.fire("kg:sent", { n: 1, wallet: "guest" });
  assert.ok(q.captured.some((c) => c.name === "pick_sent"));
  const document = fakeDocument();
  const ctx = { window: { posthog: { init() {}, capture() { throw new Error("down"); } }, localStorage: memStorage(), sessionStorage: memStorage() },
    document, location: { hostname: "knodegames.com", pathname: "/race.html" }, Date, Math, Number, String, Object, Array, JSON };
  vm.createContext(ctx);
  assert.doesNotThrow(() => vm.runInContext(analyticsSrc, ctx));
  assert.doesNotThrow(() => document.dispatchEvent(new FakeEvent("kg:sent", { detail: { n: 1, wallet: "guest" } })));
});

test("local copies, previews and tests count nothing", () => {
  const p = page({ host: "localhost" });
  p.fire("kg:sent", { n: 1, wallet: "guest" });
  assert.deepEqual(p.captured, []);
});

// ── wallet.js: Vault's five conditions (M-643) ──
function world({ sendFails = null } = {}) {
  const all = [];
  const mk = (tag) => {
    const e = { tag, attrs: {}, kids: [], listeners: {}, style: {}, hidden: false, textContent: "", value: "", isConnected: true,
      setAttribute(k, v) { this.attrs[k] = v; if (k === "hidden") this.hidden = true; },
      addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
      append(...k) { for (const c of k) this.kids.push(c); },
      remove() { this.isConnected = false; },
      get text() { return [this.textContent, ...this.kids.map((c) => (typeof c === "string" ? c : c.text))].join(" "); },
      click() { return Promise.all((this.listeners.click || []).map((f) => f({ target: this }))); },
    };
    all.push(e);
    return e;
  };
  const events = [];
  const document = { createElement: mk, getElementById: () => null, head: mk("head"), body: mk("body"), documentElement: { style: {} },
    listeners: [], dispatchEvent(e) { events.push({ type: e.type, detail: e.detail === undefined ? undefined : JSON.parse(JSON.stringify(e.detail)) }); for (const f of this.listeners) f(e); return true; } };
  const provider = {
    getChainId: async () => MAINNET, getNextNonce: async () => "KAE", getAccountRc: async () => "0",
    readContract: async () => ({ result: koilib.utils.encodeBase64url(new Uint8Array([0x08, 0x01])) }),
    sendTransaction: async (tx) => { if (sendFails) throw new Error(sendFails); return { transaction: { ...tx, wait: async () => ({}) }, receipt: {} }; },
    wait: async () => ({}),
  };
  const storage = memStorage();
  const win = { location: { protocol: "https:", hostname: "knodegames.com" }, koilib, crypto: webcrypto, localStorage: storage, confirm: () => true, navigator: {} };
  win.top = win; win.self = win;
  const ctx = { window: win, document, localStorage: storage, sessionStorage: memStorage(), navigator: { userAgent: "test", maxTouchPoints: 0, platform: "x" },
    crypto: webcrypto, console, setTimeout, clearTimeout, Promise, URL, URLSearchParams, JSON, BigInt, Uint8Array, Array, Number, String, Object, Map, Set, Error, Math, Date,
    CustomEvent: FakeEvent };
  vm.createContext(ctx);
  vm.runInContext(guestSrc, ctx);
  vm.runInContext(walletSrc, ctx);
  win.KWallet.init({ provider, chainId: MAINNET, payer: "sponsor", toast: () => {}, status: () => {},
    sponsor: { address: SPONSOR, covers: [GAME, DESK, VHP, KOIN], tokens: [VHP, KOIN], rcLimit: "100000000", guest: true }, onChange: () => {} });
  const op = (c, e) => ({ call_contract: { contract_id: c, entry_point: e, args: "" } });
  const find = (re) => all.filter((e) => e.tag === "button" && re.test(e.text));
  return { KW: win.KWallet, document, events, op, find };
}
async function connectAsGuest(w) { const p = w.KW.connect(); w.find(/Play as a guest/)[0].click(); return p; }
const sentEvents = (w) => w.events.filter((e) => e.type === "kg:sent");

test("Vault 1: fire and forget; a throwing listener never changes what send() returns, a failed send counts nothing", async () => {
  const ok = world();
  await connectAsGuest(ok);
  ok.document.listeners.push(() => { throw new Error("listener blew up"); });
  const id = await ok.KW.send("answer", [ok.op(GAME, ANSWER)]);
  assert.equal(typeof id === "string" || id === null, true, "send() still resolves as before");
  assert.equal(sentEvents(ok).length, 1);
  const bad = world({ sendFails: "node said no" });
  await connectAsGuest(bad);
  const err = await bad.KW.send("answer", [bad.op(GAME, ANSWER)]).catch((e) => e);
  assert.ok(err instanceof Error, "the error still reaches the page");
  assert.equal(sentEvents(bad).length, 0, "a send that threw counts nothing");
  const code = strip(walletSrc);
  const fn = code.match(/function countSent\(ops\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /^function countSent\(ops\) \{\s*try \{/, "the whole signal is inside try");
  assert.doesNotMatch(fn, /await/, "never awaited");
});

// Run countSent on its own against each kind of operation (the guest path refuses most of them before any send).
function countSentAlone(ops) {
  const src = strip(walletSrc).match(/function countSent\(ops\) \{[\s\S]*?\n  \}\n/)[0];
  const events = [];
  const ctx = { document: { dispatchEvent: (e) => events.push(e) }, CustomEvent: FakeEvent, W: { kind: "kondor" }, Array, Number,
    guestGame: () => GAME, guestRace: () => RACE, guestPicks: () => PICKS, ANSWER, PICK };
  vm.createContext(ctx);
  vm.runInContext(`${src}; countSent(${JSON.stringify(ops)});`, ctx);
  return events;
}
test("Vault 2: only picks (Race, Picks) and answers (game) count; stake, withdraw, claim, move, swap and approve send nothing", () => {
  const op = (c, e) => ({ call_contract: { contract_id: c, entry_point: e, args: "" } });
  assert.equal(countSentAlone([op(GAME, ANSWER)]).length, 1);
  assert.equal(countSentAlone([op(RACE, PICK)]).length, 1);
  assert.equal(countSentAlone([op(PICKS, PICK), op(PICKS, PICK)]).length, 1);
  for (const ops of [[op(GAME, CLAIM)], [op(GAME, STAKE)], [op(GAME, 0x5b0aaef8)], [op(GAME, 0x7c268e69)], [op(GAME, 0x4107e3ab)],
    [op(VHP, APPROVE)], [op(DESK, ANSWER)], [op(GAME, ANSWER), op(GAME, CLAIM)], [op(RACE, ANSWER)], []])
    assert.equal(countSentAlone(ops).length, 0, JSON.stringify(ops));
  const fn = strip(walletSrc).match(/function countSent\(ops\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /guestGame\(\)/); assert.match(fn, /guestRace\(\)/); assert.match(fn, /guestPicks\(\)/);
  const guard = strip(walletSrc).match(/function checkGuestTx[\s\S]*?\n  \}\n/)[0];
  for (const ep of ["ANSWER", "0x8ce33c6c"]) assert.ok(guard.includes(ep), "checkGuestTx still allows the same entry points");
});

test("Vault 3: once per real send: the signal sits only in sendCounted (KWallet.send), after send() has its result; batches count per send", async () => {
  const code = strip(walletSrc);
  assert.equal((code.match(/"kg:sent"/g) || []).length, 1, "one place fires kg:sent");
  assert.equal((code.match(/countSent\(/g) || []).length, 2, "defined once, called once");
  assert.match(code, /async function sendCounted\(label, ops, opts = \{\}\) \{\s*const id = await send\(label, ops, opts\);\s*countSent\(ops\);\s*return id;\s*\}/);
  assert.match(code, /send: sendCounted,/, "KWallet.send is the counted one");
  const batch = code.match(/async function sendBatch[\s\S]*?\n  \}\n/)[0];
  assert.equal((batch.match(/await sendCounted\(/g) || []).length, 2, "sendBatch sends through the counted path");
  assert.doesNotMatch(batch, /await send\(/);
  assert.doesNotMatch(code.match(/async function sendKondor[\s\S]*?\n  \}\n/)[0], /countSent|kg:sent/, "the own-Mana retry inside sendKondor never counts");
  const w = world();
  await connectAsGuest(w);
  await w.KW.send("answer", [w.op(GAME, ANSWER)]);
  assert.equal(sentEvents(w).length, 1);
});

test("Vault 4: detail is exactly { n, wallet } for kg:sent and { wallet, new_guest } for kg:wallet", async () => {
  const w = world();
  await connectAsGuest(w);
  const wal = w.events.filter((e) => e.type === "kg:wallet");
  assert.equal(wal.length, 1);
  assert.deepEqual(Object.keys(wal[0].detail).sort(), ["new_guest", "wallet"]);
  assert.deepEqual(wal[0].detail, { wallet: "guest", new_guest: true });
  await w.KW.send("answer", [w.op(GAME, ANSWER)]);
  const [s] = sentEvents(w);
  assert.deepEqual(Object.keys(s.detail).sort(), ["n", "wallet"]);
  assert.deepEqual(s.detail, { n: 1, wallet: "guest" });
  for (const e of w.events) assert.doesNotMatch(JSON.stringify(e.detail), ADDR, "no address in any event");
});

test("Vault 5: wallet.js adds no storage; the counting keys live only in analytics.js", () => {
  const code = strip(walletSrc);
  for (const name of ["countSent", "countWallet"]) {
    const fn = code.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];
    assert.doesNotMatch(fn, /localStorage|sessionStorage|indexedDB|store\./, `${name} stores nothing`);
  }
  assert.doesNotMatch(code, /kg-first-day|kg-last-day|kg-picked|kg-visit-start/);
  const a = strip(analyticsSrc);
  for (const k of ["kg-first-day", "kg-last-day", "kg-picked"]) assert.ok(a.includes(k));
  assert.match(a, /const get = \(st, k\) => \{ try \{/); assert.match(a, /const put = \(st, k, v\) => \{ try \{/);
});

test("share buttons send kg:share with no detail", () => {
  for (const f of ["app.js", "combo.js", "bracket.js"]) {
    const js = fs.readFileSync(`${APP}/web/${f}`, "utf8");
    assert.match(js, /try \{ document\.dispatchEvent\(new CustomEvent\("kg:share"\)\); \} catch/, `${f}: share counted`);
  }
});

test("Terms say what the counts are and what the browser keeps", () => {
  const t = fs.readFileSync(`${APP}/web/terms.html`, "utf8");
  assert.match(t, /We count visits without cookies/);
  assert.match(t, /your browser keeps the date of your first and last visit and whether you have made a pick/);
  assert.match(t, /No wallet address, name, pick or answer is sent/);
});
