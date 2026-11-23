// Owner, Mon 23 Nov 2026 (M-375): new Race points and weekly caps from vault week 6 (Week 3, Sun 29 Nov 7 PM ET).
//   1-hour: only 1st scores, 2 points; at most 24 wins (48 points) a wallet a week count.
//   2-hour: 1st 2, 2nd 1; at most 60 points a wallet a week count.
//   6-hour: 3 / 2 / 1 (was 4 / 2 / 1), no cap. Daily 6 / 3 / 2 and weekly 12 / 6 / 4 unchanged.
// Monday to Saturday count; Sunday fun races count for no week and use no cap; the earliest races count first; a result
// over a cap counts nothing (no points, no win, no show). Week 5 and earlier are never rescored.
// The recorder (bot/race.ts scoreRaces), the page (race-math.js) and the publish job (race.yml) use the same rule.
// Run: TZ=UTC node --import tsx --test tests/audit/race-points-v3.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = process.env.APP || ".";
await import(path.resolve(APP, "web/race-math.js"));
const M = globalThis.KRaceMath;
const R = await import(path.resolve(APP, "bot/race.ts"));
const yml = fs.readFileSync(path.join(APP, ".github/workflows/race.yml"), "utf8");
const H = 3600000, DAY = 24 * H;
const A = "1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B = "1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const P1 = "1PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP1", P2 = "1PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP2", P3 = "1PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP3";
const ST = [{ a: P1 }, { a: P2 }, { a: P3 }];
/** A final race of `type` at `start` with picks [who, place 1/2/3/0, at]. */
function race(type, start, picks) {
  return { type, start, result: { final: true, standings: ST, picks: picks.map(([who, place, at]) => [who, place === 0 ? "1Z" : [P1, P2, P3][place - 1], at ?? start + 60000, place === 1 ? 1 : 0, 0, place === 2 || place === 3 ? 1 : 0]) } };
}
const countsForWeek = (r) => !M.restRace(r.start);
const score = (races, from = 0, to = Infinity, weekly = false) => R.scoreRaces(races, from, to, weekly ? countsForWeek : null, 4, 5, countsForWeek);
const W6 = M.weekStart(6), W5 = M.weekStart(5);

test("the switch and the tables: race-math.js and race.yml agree (week 6; PTS_V3; CAPS_V3); the workflow never sets the test override", () => {
  assert.equal(M.POINTS_V3_FROM_WEEK, 6);
  assert.equal(new Date(W6).toISOString(), "2026-11-30T00:00:00.000Z", "Mon 30 Nov 00:00 UTC = Sun 29 Nov, 7 PM ET");
  assert.match(yml, /\n {10}POINTS_V3_FROM_WEEK = 6   # = M\.POINTS_V3_FROM_WEEK/);
  assert.doesNotMatch(yml, /RACE_POINTS_V3_FROM:/);
  const parse = (name) => JSON.parse(yml.match(new RegExp(`${name} = (\\{[^}]*\\})`))[1].replace(/\(/g, "[").replace(/\)/g, "]").replace(/(\d+):/g, '"$1":'));
  const pv3 = parse("PTS_V3"), caps = parse("CAPS_V3");
  for (const t of [0, 1, 2, 3, 4]) assert.deepEqual(pv3[t], [...M.PLACES_V3[t]], `PTS_V3 ${t}`);
  assert.deepEqual(caps, { 1: 48, 2: 60 }); assert.deepEqual({ ...M.CAPS_V3 }, { 1: 48, 2: 60 });
  assert.deepEqual([...M.PLACES_V3[1]], [2, 0, 0]); assert.deepEqual([...M.PLACES_V3[2]], [2, 1, 0]); assert.deepEqual([...M.PLACES_V3[0]], [3, 2, 1]);
  assert.deepEqual([...M.PLACES_V3[3]], [...M.TYPES[3].places]); assert.deepEqual([...M.PLACES_V3[4]], [...M.TYPES[4].places]);
  // whole numbers only, so the vault's places (1 to 255) and the board's points stay integers
  for (const t of [0, 1, 2, 3, 4]) for (const v of M.PLACES_V3[t]) assert.ok(Number.isInteger(v) && v >= 0);
});

test("the week 5 boundary: week 5 keeps D-173 (3 / 2 / 1, 4 / 2 / 1) with no cap; week 6 uses the new table and caps", () => {
  assert.deepEqual(M.pointsOf(1, 5, 4, 5), { win: 3, second: 2, third: 1, show: 2 });
  assert.deepEqual(M.pointsOf(0, 5, 4, 5), { win: 4, second: 2, third: 1, show: 2 });
  assert.deepEqual(M.pointsOf(1, 6, 4, 5), { win: 2, second: 0, third: 0, show: 0 });
  assert.deepEqual(M.pointsOf(2, 6, 4, 5), { win: 2, second: 1, third: 0, show: 1 });
  assert.deepEqual(M.pointsOf(0, 6, 4, 5), { win: 3, second: 2, third: 1, show: 2 });
  assert.equal(M.capOf(1, 5), null); assert.equal(M.capOf(1, 6), 48); assert.equal(M.capOf(2, 6), 60);
  for (const t of [0, 3, 4]) assert.equal(M.capOf(t, 6), null, `type ${t}: no cap`);
  // 30 one-hour wins in week 5 (Mon and Tue): all count at 3 each, no cap.
  const w5 = Array.from({ length: 30 }, (_, i) => race(1, W5 + i * H, [[A, 1]]));
  assert.deepEqual({ ...score(w5).get(A) }, { pts: 90, correct: 30, shows: 0, picks: 30, reached: W5 + 29 * H + 60000 });
});

test("a wallet at the 1-hour cap: 30 wins in week 6 → the first 24 count (48 points); 24 wins on one day are fine (the cap is weekly)", () => {
  const races = Array.from({ length: 30 }, (_, i) => race(1, W6 + i * H, [[A, 1]]));   // Mon 00:00 … Tue 05:00
  const a = score(races).get(A);
  assert.deepEqual({ ...a }, { pts: 48, correct: 24, shows: 0, picks: 30, reached: W6 + 23 * H + 60000 }, "24 wins counted, all on Monday");
  // The week board and a window on Tuesday: Tuesday's 6 wins come after the cap, so Tuesday shows 0 points.
  assert.equal(score(races, 0, Infinity, true).get(A).pts, 48);
  assert.deepEqual({ ...score(races, W6 + DAY, W6 + 2 * DAY).get(A) }, { pts: 0, correct: 0, shows: 0, picks: 6 });
  // Another wallet's cap is its own.
  const both = races.map((r, i) => (i < 5 ? race(1, r.start, [[A, 1], [B, 1]]) : r));
  assert.equal(score(both).get(B).pts, 10); assert.equal(score(both).get(A).pts, 48);
});

test("1-hour: a 2nd or 3rd scores nothing and is no show; 2-hour: 1st 2, 2nd 1, 3rd 0, capped at 60 points (a partial point counts)", () => {
  const one = score([race(1, W6, [[A, 2]]), race(1, W6 + H, [[A, 3]])]).get(A);
  assert.deepEqual({ ...one }, { pts: 0, correct: 0, shows: 0, picks: 2 });
  // 29 two-hour wins (58), then a 2nd (59), a 2nd (60), a win (0 left), a 3rd (0).
  const two = [...Array.from({ length: 29 }, (_, i) => race(2, W6 + i * 2 * H, [[A, 1]])), race(2, W6 + 58 * H, [[A, 2]]), race(2, W6 + 60 * H, [[A, 2]]), race(2, W6 + 62 * H, [[A, 1]]), race(2, W6 + 64 * H, [[A, 3]])];
  assert.deepEqual({ ...score(two).get(A) }, { pts: 60, correct: 29, shows: 2, picks: 33, reached: W6 + 60 * H + 60000 });
  // At 59 a win counts 1 (the cap is in points, so the total is exactly 60).
  const edge = [...Array.from({ length: 29 }, (_, i) => race(2, W6 + i * 2 * H, [[A, 1]])), race(2, W6 + 58 * H, [[A, 2]]), race(2, W6 + 60 * H, [[A, 1]])];
  assert.equal(score(edge).get(A).pts, 60); assert.equal(score(edge).get(A).correct, 30);
});

test("6-hour 3 / 2 / 1 with no cap; daily and weekly unchanged; most a wallet can score in a week is 228", () => {
  const six = Array.from({ length: 24 }, (_, i) => race(0, W6 + i * 6 * H, [[A, 1]]));   // Mon–Sat, every 6-hour race won
  assert.equal(score(six).get(A).pts, 72);
  assert.equal(score([race(0, W6, [[A, 2]]), race(0, W6 + 6 * H, [[A, 3]])]).get(A).pts, 3);
  const max = [...Array.from({ length: 144 }, (_, i) => race(1, W6 + i * H, [[A, 1]])), ...Array.from({ length: 72 }, (_, i) => race(2, W6 + i * 2 * H, [[A, 1]])), ...six,
    ...Array.from({ length: 6 }, (_, i) => race(3, W6 + i * DAY, [[A, 1]])), race(4, W6, [[A, 1]])];
  assert.equal(score(max, W6, W6 + 7 * DAY, true).get(A).pts, 48 + 60 + 72 + 36 + 12);
});

test("Sunday fun races: they count for no week and use no cap (Today and All time still score them)", () => {
  const capped = Array.from({ length: 24 }, (_, i) => race(1, W6 + i * H, [[A, 1]]));
  const sun = race(1, W6 + 6 * DAY + 3 * H, [[A, 1]]);   // Sunday 03:00 UTC of week 6
  assert.ok(M.restRace(sun.start));
  assert.equal(score([...capped, sun], 0, Infinity, true).get(A).pts, 48, "the week board leaves Sunday out");
  assert.equal(score([...capped, sun]).get(A).pts, 50, "All time counts the Sunday win: it used no cap");
  // A Sunday win before the wallet's weekday wins doesn't use the cap: 24 weekday wins still all count.
  const sunFirst = race(1, W6 + 6 * DAY, [[A, 1]]);
  assert.equal(score([sunFirst, ...capped], 0, Infinity, true).get(A).pts, 48);
});

test("the publish job's cap lines (race.yml take_cap) give exactly what M.capCounter gives, on 2,000 random results", () => {
  const block = yml.split("\n"), i = block.findIndex((l) => l.includes("# M-375 caps BEGIN")), j = block.findIndex((l) => l.includes("# M-375 caps END"));
  assert.ok(i > 0 && j > i);
  const ind = block[i].match(/^ */)[0].length, code = block.slice(i, j + 1).map((l) => l.slice(ind)).join("\n");
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const seq = Array.from({ length: 2000 }, () => [["A", "B", "C"][Math.floor(rnd() * 3)], 1 + Math.floor(rnd() * 2), [0, 1, 2][Math.floor(rnd() * 3)]]);
  const py = `${code}\nimport json,sys\nused={}\nout=[]\nfor who,ty,n in json.loads(sys.stdin.read()):\n    out.append(take_cap(used,(who,ty),n,CAPS_V3.get(ty)))\nprint(json.dumps(out))\n`;
  const r = spawnSync("python3", ["-I", "-c", py], { input: JSON.stringify(seq), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const c = M.capCounter(), js = seq.map(([who, ty, n]) => c.take(who, 6, ty, n));
  assert.deepEqual(JSON.parse(r.stdout), js);
  assert.ok(js.filter((x, k) => x < seq[k][2]).length > 0, "the caps were hit");
});

test("the publish job applies the caps in race order and only from POINTS_V3_FROM; a capped result is no win or show", () => {
  assert.match(yml, /for r in sorted\(six \+ tr, key=lambda q: \(q\.get\("start"\)/);
  assert.match(yml, /v3 = not legacy and rw >= POINTS_V3_FROM/);
  assert.match(yml, /cap = CAPS_V3\.get\(r\.get\("type"\)\) if v3 else None/);
  assert.match(yml, /n = take_cap\(capused, \(who, r\.get\("type"\)\), n, cap\)/);
  assert.match(yml, /c\[0\] \+= 1 if right and n > 0 else 0; c\[1\] \+= 1 if \(not right and show and n > 0\) else 0; c\[3\] \+= n/);
});

test("page: the chips and notes show the new table from week 6, and a connected wallet at the 1-hour cap reads 'counted 24 of 24'", async () => {
  const Hm = await import(path.resolve(APP, "tests/audit/race-dom-harness.mjs"));
  const now = W6 + 2 * DAY + 10 * H + 20 * 60000;   // Wed of week 6
  const ws = W6, hours = []; for (let t = ws; t < now - H; t += H) hours.push({ t, n: { [Hm.A]: 12, [Hm.Bp]: 6 }, l: { [Hm.A]: t + 1000, [Hm.Bp]: t + 2000 }, c: [0, 0, 0, 0] });
  // 30 one-hour races Mon 00:00 … Tue 05:00, the wallet picked Hm.A each time; the Ruler placed A 1st every time.
  const card = JSON.stringify({ producers: [{ a: Hm.A, signed: 5 }, { a: Hm.Bp, signed: 3 }] });
  const tr = Array.from({ length: 30 }, (_, i) => ({ type: 1, id: `H1-${new Date(ws + i * H).toISOString().slice(0, 13)}`, start: ws + i * H, end: ws + (i + 1) * H,
    result: { final: true, checked: 2, picks: [[B, Hm.A, ws + i * H - 60000, 0, 0, 0]] } }));
  const entries = tr.map((r) => ({ id: r.id, card, placings: [Hm.A, Hm.Bp] }));
  const files = { "W006.json": { v: 1, week: 6, races: [] }, "T006.json": { v: 1, week: 6, races: tr, hours },
    "R005.json": Hm.rulerFile(5, "on", 4, []), "R006.json": Hm.rulerFile(6, "on", 4, []), "R006-1.json": Hm.rulerFile(6, "on", 4, entries) };
  const blocks = (T) => { const ts = [], sig = []; for (let t = T - 7 * H, i = 0; t <= T; t += 20000, i++) { ts.push(t); sig.push(i % 3 ? 0 : 1); } return { ts, sig, signers: [Hm.A, Hm.Bp], from: 1, top: ts.length }; };
  const p = await Hm.boot({ app: path.resolve(APP) + "/", now, files, vhp: { [Hm.A]: 100, [Hm.Bp]: 300 }, blocks, type: 1, wallet: B });
  await p.tick(6000);
  const chips = p.doc.getElementById("race-types").textContent;
  assert.match(chips, /1-hour1st 2 · max 24 wins a week/); assert.match(chips, /2-hour1st 2 · 2nd 1 · max 60 pts a week/); assert.match(chips, /6-hour1st 3 · 2nd 2 · 3rd 1/);
  const note = p.doc.getElementById("rt-note").textContent;
  assert.match(note, /Only 1st scores: 2 points/); assert.match(note, /At most 24 wins a week count/);
  assert.match(note, /Your 1-hour wins counted this week: 24 of 24 \(cap reached: more 1-hour wins this week score nothing\)\./);
  assert.match(p.doc.getElementById("pts-note").textContent, /at most 24 wins a week count \(48 points\)/);
  assert.deepEqual(p.errors, []);
});

test("home page (index.html, owner M-379): the point spans and the 'planned' lines are filled by results.js from the switch; index.html itself is unchanged", () => {
  const js = fs.readFileSync(path.join(APP, "web/results.js"), "utf8"), html = fs.readFileSync(path.join(APP, "web/index.html"), "utf8");
  for (const id of ["rt-free-pts", "rt-short-pts", "rt-watch-pts", "rt-soon-2", "rt-soon-3"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(js, /const v3 = \(\) => M\.weekOf\(Date\.now\(\)\) >= M\.POINTS_V3_FROM_WEEK;/);
  assert.match(js, /set\("rt-free-pts", v3\(\) \?/); assert.match(js, /set\("rt-short-pts", v3\(\) \?/); assert.match(js, /set\("rt-watch-pts", v3\(\) \? PTS_TEXT_V3 : PTS_TEXT_D173\)/);
  assert.match(js, /p\.textContent = v3\(\) \? PTS_TEXT_V3 : PTS_TEXT_D173/, "rt-soon-2"); assert.match(js, /three\.hidden = true/, "rt-soon-3 hidden once the types are live");
  assert.match(js, /2 for a 1-hour win \(at most 24 wins a week\)/);
});
