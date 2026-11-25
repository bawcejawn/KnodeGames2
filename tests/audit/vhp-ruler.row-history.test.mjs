// Knode Games — VHP ruler: the opt-in row history setting (rowHistory; M-731, for More or Fewer's "every producer" list).
// A card made with rowHistory: true carries history (true/false) on each row: the value newcomer() already computes and
// the entry bar already uses. It changes no number. A card without it stays byte for byte as before: the golden hashes
// are the never-void test's, made from the ruler on main before this change. JS = Python.
// Run: node --import tsx --test tests/audit/vhp-ruler.row-history.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { R, PY, toJson } from "./vhp-ruler.fixture.mjs";
import { chain, game } from "./vhp-ruler.repolens-b10-chain.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vhp-rh-"));
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
const py = (code, data) => { const f = path.join(dir, `in${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, toJson(data)); return PY(`j = json.load(open(${JSON.stringify(f)}))\n${code}`); };
const js = (o) => JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString(10) : v));   // the ruler runs in its own realm: compare as text
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const free = { ...game, paying: false };
const pyCard = (tl, g) => py(`L = V.Ledger(j["tl"]); g = j["g"]
sys.stdout.write(V.card_json(V.score_card(L, V.make_card(L, g["game"], g["round"], g["window"], g["c"], g["ownRule"], g["paying"], g["pooled"], g["minK"], g["poolRule"], g.get("mode"), g.get("include"), g.get("version", 4), g.get("noVoid") is True, g.get("rowHistory") is True))))`, { tl, g });

test("cards without rowHistory are byte for byte as before (the never-void test's golden hashes)", () => {
  const { tl, ps } = chain({ extra: [] }), L = R.ledger(tl);
  assert.equal(sha(R.cardJson(R.scoreCard(L, R.makeCard(L, free)))), "af86a7a415c2456672206b22a0df067a4e4120512f2358a2de47e9b716ff0ada");
  { const c2 = chain(), L2 = R.ledger(c2.tl); assert.equal(sha(R.cardJson(R.makeCard(L2, { ...game, include: [c2.ps[1]] }))), "67f60e3aea20c55214ce50292dbe8f4d84e6f22fd946d93b46490e24bfe27b10"); }
  const text = R.cardJson(R.scoreCard(L, R.makeCard(L, free)));
  assert.equal(text.includes("rowHistory") || text.includes('"history"'), false, "no new key on a card that doesn't ask for it");
  assert.equal(pyCard(tl, free), text, "JS = Python");
  assert.ok(ps.length > 0);
});

test("rowHistory: every row gets history (= newcomer's), placed after isNew; every other number is the same; JS = Python; pinned hash", () => {
  const { tl } = chain({ extra: [] }), L = R.ledger(tl);
  const plain = R.scoreCard(L, R.makeCard(L, free)), rh = R.scoreCard(L, R.makeCard(L, { ...free, rowHistory: true }));
  assert.equal(rh.rowHistory, true);
  assert.equal(rh.producers.length, plain.producers.length);
  for (let i = 0; i < rh.producers.length; i++) {
    const p = rh.producers[i], q = plain.producers[i];
    assert.equal(typeof p.history, "boolean");
    assert.equal(p.history, R.newcomer(L, p.a, rh.T).history, "the same value newcomer() gives");
    const keys = Object.keys(p);
    assert.equal(keys[keys.indexOf("isNew") + 1], "history", "history sits right after isNew");
    const { history, ...rest } = p;
    assert.equal(js(rest), js(q), "no other field changes");
    if (q.entry) assert.equal(history, true, "entry needs history, so a producer with entry has history");
  }
  const { rowHistory, producers, ...card } = rh, { producers: p0, ...card0 } = plain;
  assert.equal(js(card), js(card0), "no other card field changes");
  const text = R.cardJson(rh);
  assert.equal(pyCard(tl, { ...free, rowHistory: true }), text, "JS = Python");
  assert.equal(sha(text), "2fe3779cb7370b9eebd48b2e7f7f910c17ff69baa7cdd8e550a64b2ca6474f63", "pinned: a rowHistory card's bytes");
});

test("settings: rowHistory must be true when present; recompute rebuilds a rowHistory card and refuses a game that says otherwise; JS = Python", () => {
  const { tl } = chain({ extra: [] }), L = R.ledger(tl), g = { ...free, c: "400000" }, gh = { ...g, rowHistory: true };
  const text = R.cardJson(R.scoreCard(L, R.makeCard(L, gh))), plainText = R.cardJson(R.scoreCard(L, R.makeCard(L, g)));
  assert.equal(R.recompute(L, text, gh).same, true);
  assert.equal(R.recompute(L, R.cardDigest(R.scoreCard(L, R.makeCard(L, gh))), gh).same, true, "the compact card too");
  assert.match(R.recompute(L, text, g).diff, /setting rowHistory/, "the game has no rowHistory, the card says true");
  assert.match(R.recompute(L, plainText, gh).diff, /setting rowHistory/, "the game says rowHistory, the card has none");
  assert.match(R.recompute(L, text, { ...gh, rowHistory: false }).diff, /rowHistory must be true/);
  assert.throws(() => R.makeCard(L, { ...free, rowHistory: false }), /rowHistory must be true/);
  const res = py(`L = V.Ledger(j["tl"])
a = V.recompute(L, j["t"], j["gh"]); b = V.recompute(L, j["t"], j["g"]); c = V.recompute(L, j["p"], j["gh"]); d = V.recompute(L, j["t"], dict(j["gh"], rowHistory=False))
print(json.dumps([a[0], b[1][:25], c[1][:25], d[1][:34]]))`, { tl, t: text, p: plainText, g, gh });
  assert.deepEqual(JSON.parse(res), [true, "setting rowHistory: the c", "setting rowHistory: the c", "the game's settings: rowHistory mu"]);
});
