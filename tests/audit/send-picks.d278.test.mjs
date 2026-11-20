// The shared "Send my picks" card (D-255 / D-256 / D-278), Architecture.
//   D-255: before a pick is sent, the player sees "your pick this round" and confirms a change.
//   D-256: every kit game page sends picks only through web/js/lib/send-picks.js (game:check rule).
//   D-278: a pick CHANGE is never paid by the Knode Mana sponsor: it goes alone, with the player's own Mana.
// Run: node --test tests/audit/send-picks.d278.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as SP from "../../web/js/lib/send-picks.js";
import { sendPicksProblems, checkSendPicks, SEND_PICKS, SEND_PICKS_ALLOW } from "../../tools/game-check.mjs";

const op = (n) => ({ call_contract: { contract_id: "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm", entry_point: 1, args: `a${n}` } });

// ── the planner ──
test("plan: no pick on chain = new; same pick = no-op; different pick = change; locked = refused", () => {
  const p = SP.plan([
    { key: "a", label: "A", op: op(1), existing: null, wanted: ["x"], open: true },
    { key: "b", label: "B", op: op(2), existing: [], wanted: ["x"], open: true },
    { key: "c", label: "C", op: op(3), existing: ["x", "y"], wanted: ["x", "y"], open: true },
    { key: "d", label: "D", op: op(4), existing: ["x"], wanted: ["z"], open: true },
    { key: "e", label: "E", op: op(5), existing: ["x"], wanted: ["z"], open: false },
    { key: "f", label: "F", op: null, existing: null, wanted: ["z"], open: true },
  ]);
  assert.deepEqual(p.fresh.map((x) => x.key), ["a", "b"]);
  assert.deepEqual(p.same.map((x) => x.key), ["c"]);
  assert.deepEqual(p.changes.map((x) => x.key), ["d"]);
  assert.deepEqual(p.refused.map((x) => [x.key, x.why]), [["e", "locked"], ["f", "nothing to send"]]);
});

test("plan: order matters for a team (the first is the captain), and max_changes refuses a change the contract would", () => {
  assert.equal(SP.plan([{ key: "a", op: op(1), existing: ["x", "y"], wanted: ["y", "x"] }]).changes.length, 1);
  const p = SP.plan([{ key: "a", label: "A", op: op(1), existing: ["x"], wanted: ["y"] }], { maxChanges: 1, changesUsed: { a: 1 } });
  assert.deepEqual(p.refused.map((x) => x.why), ["no changes left"]);
  const q = SP.plan([{ key: "a", label: "A", op: op(1), existing: ["x"], wanted: ["y"] }], { maxChanges: 3, changesUsed: { a: 1 } });
  assert.equal(q.changes[0].changesLeft, 2);
});

test("D-255: the card names your pick this round, the new one, and says a change uses your own Mana", () => {
  const p = SP.plan([{ key: "a", label: "Fantasy team", op: op(1), existing: ["x", "y"], wanted: ["x", "z"] }]);
  const lines = SP.confirmLines(p, (a) => a.toUpperCase());
  assert.match(lines[0], /your pick this round is X, Y\. Change it to X, Z\?/);
  assert.match(lines.join(" "), /paid with your own Mana/);
});

test("D-255: a new pick needs no extra question; a change asks, and No sends nothing", async () => {
  let asked = 0;
  const fresh = SP.plan([{ key: "a", op: op(1), existing: null, wanted: ["x"] }]);
  assert.equal(await SP.confirm(fresh, () => { asked++; return true; }), true);
  assert.equal(asked, 0);
  const change = SP.plan([{ key: "a", op: op(1), existing: ["y"], wanted: ["x"] }]);
  assert.equal(await SP.confirm(change, async () => { asked++; return false; }), false);
  assert.equal(asked, 1);
});

// ── sending (a fake KWallet records how each pick went out) ──
function fakeWallet(kind = "kondor") {
  const calls = [];
  return {
    kind, calls,
    async send(label, ops, opts = {}) { calls.push({ how: "send", ops, opts }); return `tx${calls.length}`; },
    async sendBatch(label, ops, opts = {}) { const live = ops.filter((o) => opts.stillOpen(o)); calls.push({ how: "batch", ops: live, opts }); return { id: `tx${calls.length}`, sent: live.length, dropped: ops.length - live.length }; },
  };
}

test("D-278: a change goes alone with noSponsor, never in the batch; new picks keep today's sponsored path", async () => {
  const W = fakeWallet();
  const p = SP.plan([
    { key: "a", op: op(1), existing: null, wanted: ["x"] },
    { key: "b", op: op(2), existing: null, wanted: ["x"] },
    { key: "c", op: op(3), existing: ["y"], wanted: ["x"] },
  ]);
  const r = await SP.send(W, p, { label: "picks" });
  assert.deepEqual(r, { sent: 2, changed: 1, skipped: 0, ids: ["tx1", "tx2"] });
  const [batch, change] = W.calls;
  assert.equal(batch.how, "batch");
  assert.deepEqual(batch.ops, [op(1), op(2)]);
  assert.ok(!batch.opts.noSponsor, "new picks are not forced off the sponsor");
  assert.equal(change.how, "send");
  assert.deepEqual(change.ops, [op(3)], "the change is alone");
  assert.equal(change.opts.noSponsor, true, "the change never uses the sponsor");
  for (const c of W.calls) if (c.how === "batch") assert.ok(!c.ops.includes(op(3)));
});

test("D-278: a guest can't change a pick (no Mana of its own): refused before anything is signed", async () => {
  const W = fakeWallet("guest");
  const p = SP.plan([{ key: "a", op: op(1), existing: null, wanted: ["x"] }, { key: "c", op: op(3), existing: ["y"], wanted: ["x"] }]);
  await assert.rejects(SP.send(W, p), /guest wallet can't change a pick/);
  assert.equal(W.calls.length, 0, "nothing sent, not even the new pick");
  const fresh = SP.plan([{ key: "a", op: op(1), existing: null, wanted: ["x"] }]);
  await SP.send(W, fresh);
  assert.equal(W.calls.length, 1, "a guest's new pick still goes, sponsored as today");
});

test("a round that locks between the card and the signature is skipped (new picks and changes)", async () => {
  const W = fakeWallet();
  const p = SP.plan([{ key: "a", op: op(1), existing: null, wanted: ["x"] }, { key: "c", op: op(3), existing: ["y"], wanted: ["x"] }]);
  const r = await SP.send(W, p, { stillOpen: () => false });
  assert.deepEqual({ sent: r.sent, changed: r.changed, skipped: r.skipped }, { sent: 0, changed: 0, skipped: 2 });
  assert.equal(W.calls.length, 0);
});

// ── the wallet: noSponsor really means the player's own Mana ──
const w = fs.readFileSync("web/wallet.js", "utf8");
function fnSrc(name) {
  const i = w.indexOf(`async function ${name}(`);
  assert.ok(i > 0, name);
  const j = w.indexOf("\n  }\n", i);
  return w.slice(i, j + 4);
}

test("D-278: KWallet sendKondor with noSponsor never asks the sponsor and names the player as payer", async () => {
  const seen = { sponsorFor: 0, with: [] };
  const make = new Function("env", `const { W, ANSWER, PICK } = env; const sponsorFor = (...a) => env.sponsorFor(...a);
    const hasOwnMana = async () => false, rcFor = (s, o, d) => d, gamesOfOps = () => [], sponsorAnswer = async () => ({ ok: true });
    const sendKondorWith = async (label, ops, opts) => { env.with.push(opts); return "id"; };
    ${fnSrc("sendKondor")}; return sendKondor;`);
  const env = { W: { address: "1Player", provider: { getAccountRc: async () => "500000000" } }, ANSWER: 0, PICK: 1,
    sponsorFor: () => { seen.sponsorFor++; return { address: "1Sponsor", covers: ["v"], picks: "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm" }; }, with: seen.with };
  const sendKondor = make(env);
  await sendKondor("change", [op(1)], { noSponsor: true });
  assert.equal(seen.sponsorFor, 0, "the sponsor is never asked");
  assert.equal(seen.with.length, 1);
  assert.equal(seen.with[0].ownMana, true);
  assert.equal(seen.with[0].sponsor, undefined);
  // Mutation check: the same call without noSponsor does go to the sponsor (so the test above can fail).
  await sendKondor("new pick", [op(1)], {});
  assert.equal(seen.sponsorFor, 1);
  assert.equal(seen.with[1].sponsor, "1Sponsor");
});

test("D-278: KWallet send refuses noSponsor for a guest, and sendBatch refuses a change in a batch", async () => {
  const sendSrc = fnSrc("send");
  assert.match(sendSrc, /if \(opts\.noSponsor && W\.kind === "guest"\) throw/);
  assert.ok(sendSrc.indexOf("opts.noSponsor && W.kind") < sendSrc.indexOf("return sendGuest"), "refused before the guest path");
  assert.match(fnSrc("sendBatch"), /if \(opts\.noSponsor\) throw/);
  assert.match(fnSrc("sendKondor"), /let sp = !opts\.gamePays && !opts\.noSponsor \? sponsorFor\(ops\) : null;/);
});

test("D-278: the KOIN Vault path never asks the Knode sponsor, so a change sent there is never sponsored by Knode", () => {
  const v = fnSrc("sendVault");
  assert.doesNotMatch(v, /sponsorFor\(/, "sendVault never picks the Knode sponsor");
  assert.doesNotMatch(v, /1ByDDSBUzy5zkRceELc54Jh8i41yNRoKt8|W\.sponsor\b/, "no Knode sponsor address in the request");
  assert.match(v, /operations, mana: "auto"/, "KOIN Vault decides its own funding");
  assert.match(v, /opts\.noSponsor \? h\("p", \{\}, "This is a change to a pick: Knode's Mana sponsor doesn't pay for it\."\)/);
  // The only callers of sponsorFor are the guest and Kondor paths (the guest refuses noSponsor before it).
  const callers = [...w.matchAll(/(?<!function )sponsorFor\(ops\)/g)].length;
  assert.equal(callers, 2);
});

test("D-278 guest: no Change button; the card shows the connect note and sends nothing", async () => {
  const p = SP.plan([{ key: "a", label: "Day 3", op: op(1), existing: ["y"], wanted: ["x"] }]);
  let shown = null, asked = 0;
  const go = await SP.confirm(p, () => { asked++; return true; }, null, { guest: true, cannot: (l) => { shown = l; } });
  assert.equal(go, false);
  assert.equal(asked, 0, "never asked to change");
  assert.equal(shown.at(-1), "A guest wallet can't change a pick (a change uses your own Mana). Connect a wallet to change a pick.");
  assert.match(shown[0], /your pick this round is y/);
});

test("D-284: a packed pick (Picks kind 3, one number 0 to 2^64-1) plans, shows through the game's decode, and sends alone as a change", async () => {
  const MAX = "18446744073709551615";
  const decode = (n) => `decoded(${BigInt(n).toString(16)})`;
  assert.equal(SP.plan([{ key: "a", op: op(1), existing: "0", wanted: "0" }]).same.length, 1, "0 is a real pick");
  assert.equal(SP.plan([{ key: "a", op: op(1), existing: "07", wanted: "7" }]).same.length, 1, "by value");
  const p = SP.plan([{ key: "16:20410", label: "Over/Under", op: op(1), existing: MAX, wanted: "5" }], { maxChanges: 2, changesUsed: { "16:20410": 1 } });
  assert.equal(p.changes.length, 1);
  const lines = SP.confirmLines(p, decode);
  assert.match(lines[0], /your pick this round is decoded\(ffffffffffffffff\)\. Change it to decoded\(5\)\? This uses 1 of your 1 change left\./);
  assert.equal(SP.plan([{ key: "k", op: op(1), existing: "1", wanted: "2" }], { maxChanges: 2, changesUsed: { k: 2 } }).refused[0].why, "no changes left");
  const W = fakeWallet();
  await SP.send(W, p);
  assert.deepEqual(W.calls.map((c) => [c.how, c.opts.noSponsor]), [["send", true]]);
  const fresh = SP.plan([{ key: "a", op: op(1), existing: null, wanted: "0" }]);
  assert.equal(fresh.fresh.length, 1, "no pick on chain (null) is new, even when the new pick is 0");
});

test("D-294: one copy of selfPayMin: the wallet reads the sponsor's (game-data/deployment.json), the card and page keep none", () => {
  assert.match(fnSrc("hasOwnMana"), /const v = sp && sp\.selfPayMin;/);
  assert.match(fnSrc("sendKondor"), /if \(sp && await hasOwnMana\(sp\)\) \{ sp = null;/, "25+ Mana of its own: the wallet pays");
  for (const f of ["web/js/lib/send-picks.js", "web/fantasy.js"]) {
    const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(src, /selfPayMin|\b25\s*Mana|2500000000\b/, `${f} keeps no copy of the self-pay line`);
  }
});

test("#R5-1: a pick above 2^53 is refused unless the Long library is loaded; small picks never need it", async () => {
  const big = SP.plan([{ key: "16:1", op: op(1), existing: null, wanted: "9007199254740993" }]);
  assert.equal(SP.needsLong(big), true);
  const W = fakeWallet();
  await assert.rejects(SP.send(W, big, { Long: undefined }), /Long library isn't loaded/);
  assert.equal(W.calls.length, 0);
  await SP.send(W, big, { Long: function Long() {} });
  assert.equal(W.calls.length, 1);
  assert.equal(SP.needsLong(SP.plan([{ key: "9:1", op: op(1), existing: null, wanted: "2147483647" }])), false, "Bracket's range is safe");
  assert.equal(SP.needsLong(SP.plan([{ key: "4:1", op: op(1), existing: null, wanted: ["1Abc"] }])), false);
});

test("#R5-1: pages that send picks above 2^53 load long@5.3.2 before koilib; Bracket stays under 2^53", () => {
  const BIG = ["overunder.html", "vs.html"];   // Picks kind 3, number_max 2^64-1 (D-284)
  for (const f of BIG) {
    const p = path.join("web", f);
    if (!fs.existsSync(p)) continue;   // added by its own PR (#22 for Over/Under)
    const h = fs.readFileSync(p, "utf8"), l = h.search(/<script[^>]+npm\/long@5\.3\.2\//), k = h.search(/<script[^>]+npm\/koilib@/);
    assert.ok(l >= 0 && k > l, `${f}: long@5.3.2 before koilib`);
  }
  const bm = fs.readFileSync("web/bracket-math.js", "utf8");
  assert.match(bm, /MAX_SIZE = 32, NUMBER_MAX = 2 \*\* \(MAX_SIZE - 1\) - 1;/, "Bracket's number stays at most 2^31 - 1, so it needs no Long");
});

// ── game:check (D-256) ──
test("D-256 game:check: a page that builds picks must use the shared card, not the wallet directly", () => {
  const imp = `import * as SP from "${SEND_PICKS}";\n`;
  assert.deepEqual(sendPicksProblems("const a = 1; W.send(x, [y]);"), [], "a page with no picks is not checked");
  assert.equal(sendPicksProblems("picks.functions.pick({});\nW.send(l, [o]);").length, 2, "no import + a direct send");
  assert.equal(sendPicksProblems(imp + "picks.functions.pick({});\nKWallet.sendBatch(l, [o]);").length, 1);
  assert.equal(sendPicksProblems(imp + "picks.functions.pick({});\nW.send(l, [o]); // game:check send-ok: a stake, not a pick").length, 0);
  assert.equal(sendPicksProblems(imp + "picks.functions.pick({});\nawait SP.send(W, p);").length, 0);
});

test("D-256 game:check: Fantasy passes, and a copy that sends a pick itself fails", () => {
  const m = JSON.parse(fs.readFileSync("games/fantasy/game.json", "utf8"));
  const real = checkSendPicks(m);
  assert.equal(real.length, 1);
  assert.ok(real[0].pass, real[0].msg);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sendpicks-"));
  fs.mkdirSync(path.join(tmp, "web"));
  const bad = fs.readFileSync("web/fantasy.js", "utf8").replace("return SP.send(W, p, { label, stillOpen: open });", "return W.send(label, [operation]);");
  assert.notEqual(bad, fs.readFileSync("web/fantasy.js", "utf8"), "mutation applied");
  fs.writeFileSync(path.join(tmp, "web", "fantasy.js"), bad);
  const res = checkSendPicks(m, tmp);
  assert.ok(res.some((r) => !r.pass && r.required && /calls the wallet directly/.test(r.msg)));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("D-256 allowance: only web/survivor.js, shown as a note (not a failure), and only that file", () => {
  assert.deepEqual(Object.keys(SEND_PICKS_ALLOW), ["web/survivor.js"]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sendpicks-"));
  fs.mkdirSync(path.join(tmp, "web"));
  const page = "picksContract.functions.pick({});\nawait W.send(label, [operation]);\n";
  fs.writeFileSync(path.join(tmp, "web", "survivor.js"), page);
  fs.writeFileSync(path.join(tmp, "web", "other.js"), page);
  const s = checkSendPicks({ page: "survivor.html" }, tmp);
  assert.equal(s.length, 1);
  assert.equal(s[0].required, false, "Survivor: a note until its follow-up PR");
  assert.match(s[0].msg, /allowed for now/);
  const o = checkSendPicks({ page: "other.html" }, tmp);
  assert.ok(o.every((r) => !r.pass && r.required), "any other page still fails");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Vault page fallback (D-294 §2): the sponsor turns a sponsored send down -> one retry with the player's own Mana; a cancel is never retried", async () => {
  const mk = (first) => {
    const env = { with: [] };
    const make = new Function("env", `const { W, ANSWER, PICK } = env; const sponsorFor = () => ({ address: "1Sponsor", covers: ["v"], picks: "1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm" });
      const hasOwnMana = async () => false, rcFor = (s, o, d) => d, gamesOfOps = () => [], sponsorAnswer = async () => ({ ok: true });
      const sendKondorWith = async (label, ops, opts) => { env.with.push(opts); if (env.with.length === 1) throw env.first; return "id"; };
      ${fnSrc("sendKondor")}; return sendKondor;`);
    env.W = { address: "1Player", provider: { getAccountRc: async () => "500000000" } }; env.ANSWER = 0; env.PICK = 1; env.first = first;
    return { env, sendKondor: make(env) };
  };
  const refused = Object.assign(new Error("payer refused: sponsor says this wallet pays its own"), { sponsorSend: true });
  const a = mk(refused);
  assert.equal(await a.sendKondor("pick", [op(1)], {}), "id");
  assert.deepEqual(a.env.with.map((o) => [o.sponsor || null, !!o.ownMana]), [["1Sponsor", false], [null, true]], "sponsor once, then own Mana once");
  const b = mk(new Error("Cancelled in Kondor"));
  await assert.rejects(b.sendKondor("pick", [op(1)], {}), /Cancelled/);
  assert.equal(b.env.with.length, 1, "a cancel is not retried");
});

test("Fantasy: both sends go through the card and read the pick on chain first", () => {
  const f = fs.readFileSync("web/fantasy.js", "utf8");
  assert.match(f, /import \* as SP from "\.\/js\/lib\/send-picks\.js";/);
  assert.equal((f.match(/sendOne\(/g) || []).length, 3, "defined once, used by saveTeam and sendRival");
  assert.match(f, /const cur = await readPick\(game, round\);/, "R4-2.1: the read before a send is strict");
  assert.doesNotMatch(f, /\bW\.send\(/);
});
