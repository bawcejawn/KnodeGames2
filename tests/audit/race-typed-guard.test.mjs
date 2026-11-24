// M-493 (Mon 23 Nov 2026): the first daily race (D-2026-11-23) was held on every run. The recorder counts a producer's
// blocks only in the hours it is in that hour's typed field (KRaceMath.ledgerStandings over typeCard); the publish job
// summed every hour's blocks, so a producer that dropped out of the field for an hour but still signed blocks made the
// T file "not the ledger's counts" for good. The publish job now builds each hour's typed field the same way and sums
// only those hours. This test runs the publish job's own lines (race.yml, M-493 BEGIN/END) against the page/recorder
// math on random weeks, and checks the old rule would have held them.
// Run: TZ=UTC node --import tsx --test tests/audit/race-typed-guard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.env.APP || ".";
await import(path.resolve(APP, "web/race-math.js"));
const M = globalThis.KRaceMath;
const yml = fs.readFileSync(path.join(APP, ".github/workflows/race.yml"), "utf8");
const H = 3600000, RACE = 6 * H;
const ADDRS = Array.from({ length: 30 }, (_, i) => `1P${String(i).padStart(31, "x")}`);

function pyBlock() {
  const lines = yml.split("\n"), i = lines.findIndex((l) => l.includes("# M-493 BEGIN")), j = lines.findIndex((l) => l.includes("# M-493 END"));
  assert.ok(i > 0 && j > i, "the M-493 block is in race.yml");
  const ind = lines[i].match(/^ */)[0].length;
  return lines.slice(i, j + 1).map((l) => l.slice(ind)).join("\n");
}
/** A random week: 6-hour races with 6 hourly cards (some producers near the field line), and an hour ledger. */
function week(seed) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const start = M.weekStart(5), races = [], hours = [];
  for (let r = 0; r < 8; r++) {
    const cards = Array.from({ length: 6 }, (_, leg) => {
      if (rnd() < 0.05) return null;   // a missed leg: cardForLeg falls back
      const vhp = ADDRS.map((a, k) => [a, k < 8 ? 1e6 * (1 + rnd()) : k < 20 ? 2e5 * rnd() * rnd() : (rnd() < 0.3 ? 0 : 3e4 * rnd())]);
      return M.makeCard(vhp, 7000 + 400 * rnd(), start + r * RACE + leg * H, 1);
    });
    races.push({ id: M.raceId(M.raceIndex(start + r * RACE)), start: start + r * RACE, end: start + (r + 1) * RACE, cards });
  }
  for (let t = start; t < start + 48 * H; t += H) {
    const n = {}; for (const a of ADDRS) { const v = Math.floor(rnd() * rnd() * 60); if (v) n[a] = v; }
    hours.push({ t, n, l: Object.fromEntries(Object.keys(n).map((a) => [a, t + 1000])), c: [1, 1, 1, 1] });
  }
  return { wj: { week: 5, races }, hours, start };
}

test("the publish job's typed field and block sums are the recorder's, on random weeks", () => {
  const code = pyBlock();
  const py = `${code}\nimport json,sys\nd=json.loads(sys.stdin.read())\nbyt={h["t"]:h for h in d["hours"]}\nout=[]\nfor ty,st,en,addrs in d["races"]:\n    hrs=list(range(st,en,3600000))\n    out.append([sum(byt[t0]["n"].get(a,0) for t0 in hrs if a in typed_field(base_card_at(d["wj"],t0),ty)) for a in addrs])\nprint(json.dumps(out))\n`;
  let checked = 0, oldWouldHold = 0;
  for (const seed of [3, 11, 29, 47, 83]) {
    const { wj, hours, start } = week(seed), led = new Map(hours.map((h) => [h.t, h]));
    const raceById = (id) => wj.races.find((r) => r.id === id) || null;
    const base = (t) => { const r = raceById(M.raceAt(t).id); return r ? M.cardForLeg(r.cards, M.legOf(r.start, t, M.legsOf(r.cards))) : null; };
    const races = [], want = [];
    for (const [ty, len, step] of [[1, H, H], [2, 2 * H, 2 * H], [3, 24 * H, 24 * H]]) {
      for (let st = start; st + len <= start + 48 * H; st += step) {
        const st6 = M.ledgerStandings(led, { start: st, end: st + len }, (h) => { const b = base(h), x = led.get(h); return b && x ? M.typeCard(b, ty, x.c[ty - 1]) : null; });
        if (!st6) continue;
        races.push([ty, st, st + len, st6.map((e) => e.a)]); want.push(st6.map((e) => e.blocks));
        if (st6.some((e) => e.blocks !== hours.filter((h) => h.t >= st && h.t < st + len).reduce((s, h) => s + (h.n[e.a] || 0), 0))) oldWouldHold++;
      }
    }
    const r = spawnSync("python3", ["-I", "-c", py], { input: JSON.stringify({ wj, hours, races }), encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), want, `seed ${seed}`);
    checked += races.length;
  }
  assert.ok(checked > 100, `races checked: ${checked}`);
  assert.ok(oldWouldHold > 0, "the old rule (every hour's blocks) would have held some of these races");
});

test("the guard sums only the hours each producer raced (pin)", () => {
  assert.match(yml, /e\.get\("blocks"\) == sum\(byt\[t0\]\["n"\]\.get\(e\.get\("a"\), 0\) for t0 in hrs if e\.get\("a"\) in field_at\(r\["type"\], t0\)\)/);
  assert.doesNotMatch(yml, /e\.get\("blocks"\) == sum\(byt\[t0\]\["n"\]\.get\(e\.get\("a"\), 0\) for t0 in hrs\) for e in/);
});
