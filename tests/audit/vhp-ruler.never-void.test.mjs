// Knode Games — VHP ruler: the never-void setting (noVoid; D-312/D-317, Knode Games VS) and the Over/Under helpers
// (weekOfStart, forecastExpected, medianLineHalves, listAt, isUnreliable; D-314, D-325 to D-337, D-383), JS = Python.
// A card without noVoid stays byte for byte as before (golden hashes made from the ruler on main before this change).
// Run: node --import tsx --test tests/audit/vhp-ruler.never-void.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { R, PY, toJson } from "./vhp-ruler.fixture.mjs";
import { chain, game, win, FROM } from "./vhp-ruler.repolens-b10-chain.mjs";

const M = 1000000n, dir = fs.mkdtempSync(path.join(os.tmpdir(), "vhp-nv-"));
const py = (code, data) => { const f = path.join(dir, `in${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, toJson(data)); return PY(`j = json.load(open(${JSON.stringify(f)}))\n${code}`); };
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const free = { ...game, paying: false };
const BIG_MOVE = [{ h: win.S1 - 1, i: 4, v: -(10n ** 15n * 66n) / 100n }];   // an 11%+ move in the race's last blocks (void in the band)
const pyCard = (tl, g) => py(`L = V.Ledger(j["tl"]); g = j["g"]
sys.stdout.write(V.card_json(V.score_card(L, V.make_card(L, g["game"], g["round"], g["window"], g["c"], g["ownRule"], g["paying"], g["pooled"], g["minK"], g["poolRule"], g.get("mode"), g.get("include"), g.get("version", 4), g.get("noVoid") is True))))`, { tl, g });

test("cards without noVoid are byte for byte as before (golden hashes from the ruler on main)", () => {
  const out = [];
  const run = (g, extra) => { const { tl } = chain({ extra }), L = R.ledger(tl); return sha(R.cardJson(R.scoreCard(L, R.makeCard(L, g)))); };
  out.push(run(free, []), run(free, BIG_MOVE), run({ ...free, mode: "B", version: 5 }, []));
  { const { tl, ps } = chain(), L = R.ledger(tl); out.push(sha(R.cardJson(R.makeCard(L, { ...game, include: [ps[1]] })))); }
  assert.deepEqual(out, ["af86a7a415c2456672206b22a0df067a4e4120512f2358a2de47e9b716ff0ada", "a3764606cafdc6d41857d2d50a4b59d1740af2950387343b7ef92ba70db88add",
    "7228d1eab281403a5715faeef445106744bc5c07b5a51801054be36b2d06e05b", "67f60e3aea20c55214ce50292dbe8f4d84e6f22fd946d93b46490e24bfe27b10"]);
  const { tl } = chain({ extra: BIG_MOVE }), L = R.ledger(tl), text = R.cardJson(R.scoreCard(L, R.makeCard(L, free)));
  assert.equal(text.includes("noVoid") || text.includes("outOfBand"), false, "no new key on a card that doesn't ask for it");
  assert.equal(pyCard(tl, free), text, "JS = Python");
});

test("noVoid: a producer whose VHP leaves the band is not void; every number is the same; outOfBand says what the band would have done; JS = Python", () => {
  const { tl, ps } = chain({ extra: BIG_MOVE }), L = R.ledger(tl), a = ps[4];
  const plain = R.scoreCard(L, R.makeCard(L, free)), nv = R.scoreCard(L, R.makeCard(L, { ...free, noVoid: true }));
  assert.equal(nv.noVoid, true);
  const pp = plain.producers.find((p) => p.a === a), pn = nv.producers.find((p) => p.a === a);
  assert.equal(pp.void, true, "precondition: the plain card voids it");
  assert.equal(pn.void, false); assert.equal(pn.moves, null); assert.equal(pn.outOfBand, true);
  for (const p of plain.producers) {
    const q = nv.producers.find((r) => r.a === p.a);
    for (const k of ["own", "k", "form", "expected", "credited", "signed", "pct"]) assert.equal(String(q[k]), String(p[k]), `${k} is the same`);
    if (p.a !== a) { assert.equal(q.outOfBand, false); assert.equal(q.void, p.void); }
  }
  assert.equal(pyCard(tl, { ...free, noVoid: true }), R.cardJson(nv), "JS = Python");
  // and a quiet chain: nobody is out of band
  const { tl: t2 } = chain({ extra: [] }), L2 = R.ledger(t2), q2 = R.scoreCard(L2, R.makeCard(L2, { ...free, noVoid: true }));
  assert.ok(q2.producers.every((p) => p.outOfBand === false && p.void === false));
});

test("credit above the card's size gives no extra (and a drop below it is credited in full): per block credit is at most 1", () => {
  const o = 1000n * 10n ** 8n;
  assert.equal(R.creditOf(o, o), M);
  assert.equal(R.creditOf(o, 2n * o), M / 2n, "twice the VHP: half a credit a block, so adding VHP never adds credit");
  assert.equal(R.creditOf(o, 4n * o), M / 4n);
  assert.equal(R.creditOf(o, o / 2n), M, "below the card's size: full credit a block");
  const { tl, ps } = chain({ extra: [{ h: win.S0 + 3000, i: 2, v: 5n * 10n ** 15n }] }), L = R.ledger(tl);
  const s = R.scoreCard(L, R.makeCard(L, { ...free, noVoid: true })), p = s.producers.find((x) => x.a === ps[2]);
  assert.ok(p.credited <= BigInt(p.signed) * M, "credited never exceeds signed blocks even after VHP is added in the race");
  assert.equal(p.outOfBand, true);
});

test("settings: noVoid must be true when present; recompute rebuilds a noVoid card, and a game that says otherwise is refused; JS = Python", () => {
  const { tl } = chain({ extra: [] }), L = R.ledger(tl), g = { ...free, c: "400000" }, gv = { ...g, noVoid: true };
  const card = R.scoreCard(L, R.makeCard(L, gv)), text = R.cardJson(card);
  assert.equal(R.recompute(L, text, gv).same, true);
  assert.match(R.recompute(L, text, g).diff, /setting noVoid/, "the game has no noVoid, the card says true");
  const plainText = R.cardJson(R.scoreCard(L, R.makeCard(L, g)));
  assert.match(R.recompute(L, plainText, gv).diff, /setting noVoid/, "the game says noVoid, the card has none");
  assert.match(R.recompute(L, text, { ...gv, noVoid: false }).diff, /noVoid must be true/);
  assert.throws(() => R.makeCard(L, { ...free, noVoid: false }), /noVoid must be true/);
  const res = py(`L = V.Ledger(j["tl"])
a = V.recompute(L, j["t"], j["gv"]); b = V.recompute(L, j["t"], j["g"]); c = V.recompute(L, j["p"], j["gv"]); d = V.recompute(L, j["t"], dict(j["gv"], noVoid=False))
print(json.dumps([a[0], b[1][:21], c[1][:21], d[1][:29]]))`, { tl, t: text, p: plainText, g, gv });
  assert.deepEqual(JSON.parse(res), [true, "setting noVoid: the c", "setting noVoid: the c", "the game's settings: noVoid m"]);
});

test("weekOfStart: the week a game STARTS in; Mon 00:00 UTC is a new week, Sun 23:30 UTC is the old one; JS = Python", () => {
  const G = 1792368000000n, W = 604800000n, cases = [[G, 0], [G + W - 1n, 0], [G + W, 1], [G + 5n * W, 5], [G + 5n * W - 1800000n, 4], [G + 5n * W + 1800000n, 5], [G + 6n * W - 1n, 5]];
  for (const [t, w] of cases) assert.equal(R.weekOfStart(t), w);
  assert.throws(() => R.weekOfStart(G - 1n), /week 0/);
  for (const bad of ["1792368000000", 1792368000000.5, NaN, null, undefined, true]) assert.throws(() => R.weekOfStart(bad), /whole number/, `JS refuses ${String(bad)}`);   // J33-2: only a whole number or a BigInt
  assert.equal(R.weekOfStart(1792368000000), 0, "a whole Number is fine");
  assert.throws(() => py(`V.week_of_start("1792368000000")`, {}), /whole number/, "Python refuses the string too");
  const r = JSON.parse(py(`print(json.dumps([V.week_of_start(int(t)) for t in j["t"]]))`, { t: cases.map((c) => c[0].toString()) }));
  assert.deepEqual(r, cases.map((c) => c[1]));
  assert.throws(() => py(`V.week_of_start(${(G - 1n).toString()})`, {}), /week 0/);
});

test("forecastExpected: k scaled by form (never up), at most the luck cap; medianLineHalves: the Poisson median half-line; isUnreliable at the 80% gate; JS = Python", () => {
  const fc = [[700n * M, 900000n, 630n * M], [700n * M, 1200000n, 700n * M], [700n * M, M, 700n * M], [2000n * M, M, 1000n * M], [700n * M, 0n, 0n], [10n * M, 970000n, 9700000n], [0n, M, 0n]];
  for (const [k, form, want] of fc) assert.equal(R.forecastExpected({ k, form }), want);
  assert.throws(() => R.forecastExpected({ k: -1n, form: M }), /negative/);
  const md = [[0n, 1n], [149999n, 1n], [150000n, 1n], [1149999n, 1n], [1150000n, 3n], [10n * M, 19n], [300n * M, 599n], [1000n * M, 1999n]];
  for (const [e, h] of md) assert.equal(R.medianLineHalves(e), h);
  assert.equal(R.isUnreliable({ form: 799999n }), true); assert.equal(R.isUnreliable({ form: 800000n }), false); assert.equal(R.isUnreliable({ form: 1500000n }), false);
  const r = JSON.parse(py(`print(json.dumps([[str(V.forecast_expected({"k": int(k), "form": int(f)})) for k, f in j["fc"]], [str(V.median_line_halves(int(e))) for e in j["md"]], [V.is_unreliable({"form": int(f)}) for f in j["u"]]]))`,
    { fc: fc.map((c) => [c[0], c[1]]), md: md.map((c) => c[0]), u: [799999n, 800000n, 1500000n] }));
  assert.deepEqual(r[0], fc.map((c) => String(c[2]))); assert.deepEqual(r[1], md.map((c) => String(c[1]))); assert.deepEqual(r[2], [true, false, false]);
  assert.throws(() => py(`V.forecast_expected({"k": -1, "form": 1000000})`, {}), /negative/);
});

test("listAt (D-334): signed in the last 6 hours AND at least 10 blocks in 24 hours; sorted; JS = Python", () => {
  const { tl } = chain({ np: 6, units: [1, 1, 1, 1, 1, 1], signerOf: (k, ps) => (k >= 2000000 + 445000 + 7000 ? ps[(k * 7 + (k >> 5)) % 4] : ps[(k * 7 + (k >> 5)) % 6]) }), L = R.ledger(tl), H = win.L;
  const got = R.listAt(L, H);
  const brute = L.active(H).filter((a) => L.signedIn(a, H - 28800, H - 1) >= 10).sort();
  assert.deepEqual([...got], [...brute]); assert.ok(got.length >= 1);
  const dropped = L.active(H).length - got.length;
  assert.ok(dropped >= 0);
  assert.deepEqual(JSON.parse(py(`L = V.Ledger(j["tl"]); print(json.dumps(V.list_at(L, j["H"])))`, { tl, H })), [...got]);
  for (let i = 1; i < got.length; i++) assert.ok(got[i - 1] < got[i], "rising order");
});

test("listAt boundaries (J33-1): exactly 9 blocks out, exactly 10 in, 11 in; last block at H-7200 in, at H-7201 out; JS = Python; the near-miss rules all fail", () => {
  const H = win.L, mk = (base, n, off) => new Set(Array.from({ length: n }, (_, i) => base - off - 200 * i));
  const rows = [null, mk(H, 10, 1), mk(H, 9, 2), mk(H, 11, 3), mk(H - 7200, 20, 1), mk(H - 7200, 12, 0)];   // ps[1]: 10 blocks, ps[2]: 9, ps[3]: 11, ps[4]: last block H-7201, ps[5]: last block H-7200
  const { tl, ps } = chain({ np: 6, signerOf: (k, ps) => { for (let j = 1; j < 6; j++) if (rows[j].has(FROM + k)) return ps[j]; return ps[0]; } }), L = R.ledger(tl);   // signerOf gets the index from FROM, not the height
  const want = [ps[0], ps[1], ps[3], ps[5]].sort();   // ps[0] signs the rest; 9 blocks is out; 10 and 11 are in; H-7200 is the last block still inside the 6 hours; H-7201 is outside
  const got = [...R.listAt(L, H)];
  assert.deepEqual(got, want);
  const count = (a, h0, h1) => L.signedIn(a, h0, h1);
  assert.equal(count(ps[1], H - 28800, H - 1), 10); assert.equal(count(ps[2], H - 28800, H - 1), 9); assert.equal(count(ps[3], H - 28800, H - 1), 11);
  assert.equal(count(ps[5], H - 7200, H - 1), 1); assert.equal(count(ps[4], H - 7200, H - 1), 0); assert.equal(count(ps[4], H - 7201, H - 1), 1);
  // the near-miss rules each give a different list, so the test fails every one of them
  const atLeast = (n, Hh) => [...L.active(Hh)].filter((a) => L.signedIn(a, H - 28800, H - 1) >= n).sort();
  assert.notDeepEqual(atLeast(9, H), want, ">= 9 would list the 9-block producer"); assert.notDeepEqual(atLeast(11, H), want, ">= 11 would drop the 10-block producer");
  assert.notDeepEqual(atLeast(10, H + 1), want, "active(H + 1) would drop the producer whose last block is H - 7200");
  assert.notDeepEqual(atLeast(10, H - 1), want, "active(H - 1) would add the producer whose last block is H - 7201");
  assert.deepEqual(JSON.parse(py(`L = V.Ledger(j["tl"]); print(json.dumps(V.list_at(L, j["H"])))`, { tl, H })), want, "JS = Python");
});
