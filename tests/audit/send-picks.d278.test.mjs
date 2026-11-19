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
import { sendPicksProblems, checkSendPicks, SEND_PICKS } from "../../tools/game-check.mjs";

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
  await assert.rejects(SP.send(W, p), /guest wallet has none/);
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

test("Fantasy: both sends go through the card and read the pick on chain first", () => {
  const f = fs.readFileSync("web/fantasy.js", "utf8");
  assert.match(f, /import \* as SP from "\.\/js\/lib\/send-picks\.js";/);
  assert.equal((f.match(/sendOne\(/g) || []).length, 3, "defined once, used by saveTeam and sendRival");
  assert.match(f, /const existing = await getPick\(game, round\);/);
  assert.doesNotMatch(f, /\bW\.send\(/);
});
