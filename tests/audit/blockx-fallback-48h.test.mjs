// The 48-hour old-points fallback (owner, 18 Nov 2026; Block X chat). In an ON week, a target the VHP ruler still can't
// score 48 hours after its block is scored the old way (the points already in its week file) instead of being voided at 3
// days. Shadow weeks never use it. Run: node --import tsx --test tests/audit/blockx-fallback-48h.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const APP = path.resolve(process.env.APP || ".");
const { R, timeline, X } = await import(path.join(APP, "tests/audit/blockx-ruler.fixture.mjs"));
const BR = await import(path.join(APP, "bot/blockx-ruler.ts"));
const dirs = [], tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "fb48-")); dirs.push(d); return d; };
test.after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const yml = fs.readFileSync(path.join(APP, ".github/workflows/games.yml"), "utf8");
const page = fs.readFileSync(path.join(APP, "web/blockx.js"), "utf8");
const py = (() => {
  const runs = JSON.parse(execFileSync("python3", ["-c", "import yaml,json,sys; w=yaml.safe_load(open(sys.argv[1])); print(json.dumps([s.get('run','') for j in w['jobs'].values() for s in j['steps']]))", path.join(APP, ".github/workflows/games.yml")], { encoding: "utf8" }));
  const sh = runs.find((r) => r.includes('"$IN/blockx" 2 "$PUB/blockx"'));
  return sh.slice(sh.indexOf("<<'PY'\n") + 7, sh.indexOf("\nPY\n") + 1);
})();
const GENESIS = 1792368000000, WEEK = 7 * 86400000, DAY = 86400000, H = 3600000;
const write = (dir, name, obj) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), JSON.stringify(obj) + "\n"); };
function check(incoming, pub, { now, env = {} }) {
  const held = path.join(tmp(), "held"); fs.writeFileSync(held, "");
  const r = spawnSync("python3", ["-I", "-", incoming, "2", pub, held, "blockx", "2400", "0", "12:1200:0:3"], { input: py, encoding: "utf8",
    env: { ...process.env, CHECK_NOW_MS: String(now), RULER_PY: path.join(APP, "ruler/vhp_ruler.py"), ...env } });
  return { code: r.status, out: r.stdout + r.stderr, held: fs.readFileSync(held, "utf8").split("\n").filter(Boolean) };
}
const W4 = GENESIS + 4 * WEEK, T_X = W4 + DAY + 6 * H + 20 * 60000;
const signer = R.ledger(timeline()).signer(X);
const PLAYER = "1W1111111111111111111111111111111";
const target = { round: Math.floor(X / 1200), height: X, final: true, checked: 2, signer, time: T_X, lockTime: T_X - 300000, card: null,
  picks: [[PLAYER, signer, T_X - H, 250, 0]] };
const weekFile = { v: 1, week: 4, start: W4, end: W4 + WEEK, game: 12, targets: [target] };
const dayFile = (rulerFrom, mode, targets) => ({ v: 1, week: 4, day: 1, rulerFrom, mode, shadow: mode === "shadow", targets });
const index = (rulerFrom) => ({ v: 1, updated: "2026-11-18T00:00:00.000Z", weeks: [4], contract: null, game: 2, prizesFromWeek: null, rulerFrom });
const pubWith = (extra = {}) => { const p = tmp(); write(p, "W004.json", weekFile); for (const [k, v] of Object.entries(extra)) write(p, k, v); return p; };

// Repo Lens #R3-1 R3-1.1: a fallback is made only for a target an EARLIER run already saw waiting. This is that earlier run.
const sawWaiting = (t, now) => BR.entryFor(null, t, 100, now, null, true);
const t0 = { round: 1, height: 5000000, time: Date.parse("2026-11-23T00:00Z"), signer: "1BIG" };
const BIGLINE = "1BIG";

test("the 48-hour fallback: before 48 hours the target just waits; from 48 hours an ON week scores it the old way, and it never reaches the 3-day void", () => {
  const w = BR.entryFor(null, t0, 100, t0.time + 48 * H - 1, null, true);
  assert.equal(w.void, false); assert.equal(w.card, null); assert.equal(BR.isFallback(w), false); assert.match(w.note, /^not yet/);
  for (const age of [48 * H, 60 * H, 3 * DAY, 3 * DAY + 5 * H, 9 * DAY]) {
    const e = BR.entryFor(null, t0, 100, t0.time + age, sawWaiting(t0, t0.time + H), true);
    assert.equal(BR.isFallback(e), true, "age " + age / H + " h");
    assert.deepEqual([e.card, e.void, e.points, e.why], [null, false, 0, BR.FALLBACK_WHY]);
    assert.ok(e.note.length < 400 && !/^not yet/.test(e.note), "the note is short and is reported by the recorder");
  }
  assert.equal(BR.RULER_FALLBACK_MS, 2 * DAY);
});

test("shadow weeks (fallback off) keep the old behaviour: waiting, then a 3-day void", () => {
  assert.equal(BR.entryFor(null, t0, 100, t0.time + 60 * H, null, false).void, false);
  assert.equal(BR.entryFor(null, t0, 100, t0.time + 60 * H, null).void, false, "off by default");
  const v = BR.entryFor(null, t0, 100, t0.time + 3 * DAY, null);
  assert.equal(v.void, true); assert.match(v.why, /within 3 days/); assert.equal(BR.isFallback(v), false);
});

test("a fallback entry is final: kept as published even when the ruler's data arrives later", () => {
  const fb = BR.entryFor(null, target, 100, T_X + 50 * H, sawWaiting(target, T_X + H), true);
  assert.equal(BR.isFallback(fb), true);
  const again = BR.entryFor(R.ledger(timeline()), target, 100, T_X + 70 * H, fb, true);
  assert.deepEqual(again, fb);
});

test("data that is there at 48 hours or later still gives the normal ruler card (the fallback is only for waiting)", () => {
  const e = BR.entryFor(R.ledger(timeline()), target, 100, T_X + 60 * H, null, true);
  assert.equal(typeof e.card, "string"); assert.equal(BR.isFallback(e), false);
});

test("a void target stays void, never a fallback", () => {
  const e = BR.entryFor(null, { ...t0, void: true }, 100, t0.time + 60 * H, null, true);
  assert.equal(e.void, true); assert.equal(BR.isFallback(e), false);
  assert.equal(BR.entryFor(null, { ...t0, signer: null }, 100, t0.time + 60 * H, null, true).void, true);
});

test("ruledPoints: a fallback entry scores the pick's own old-rule points; without them it is not scored", () => {
  const fb = BR.entryFor(null, t0, 100, t0.time + 50 * H, sawWaiting(t0, t0.time + H), true);
  assert.equal(BR.ruledPoints(fb, BIGLINE, 250), 250);
  assert.equal(BR.ruledPoints(fb, "1OTHER", 0), 0, "a wrong pick has 0 old points");
  assert.equal(BR.ruledPoints(fb, BIGLINE), undefined);
  const waiting = BR.entryFor(null, t0, 100, t0.time + H, null, true);
  assert.equal(BR.ruledPoints(waiting, BIGLINE, 250), undefined, "a waiting entry is still not scored");
});

test("the three copies of the fallback agree: the recorder module, the publish job and the page", () => {
  const q = JSON.stringify(BR.FALLBACK_WHY).slice(1, -1);
  assert.ok(yml.includes(`FALLBACK_WHY = "${q}"`), "games.yml has the same text");
  assert.ok(page.includes(`const FALLBACK_WHY = "${q}"`), "web/blockx.js has the same text");
  assert.match(yml, /RULER_FALLBACK = 2 \* 86400000/);
});

test("the recorder passes the fallback only for ON weeks", () => {
  const src = fs.readFileSync(path.join(APP, "bot/games/blockx.ts"), "utf8");
  assert.match(src, /RR\.entryFor\(needs && !t\.void \? ledger\(\) : null, t, lead, head\.time, prevE, mode === "on"\)/);
});

// ── the publish job's twin check (games.yml) ──
const fbEntry = (age) => BR.entryFor(null, target, 100, T_X + age, sawWaiting(target, T_X + H), true);

test("publish: an ON week's fallback entry, 48 hours after its block, goes through", () => {
  const e = fbEntry(48 * H), inc = tmp(); write(inc, "X004-1.json", dayFile(4, "on", [e]));
  const r = check(inc, pubWith({ "index.json": index(4) }), { now: T_X + 48 * H + 60000, env: { BLOCKX_RULER_FROM_WEEK: "4" } });
  assert.deepEqual(r.held, [], r.out); assert.equal(r.code, 0, r.out);
});

test("publish: a fallback entry before 48 hours is held", () => {
  const e = fbEntry(48 * H), inc = tmp(); write(inc, "X004-1.json", dayFile(4, "on", [e]));
  const r = check(inc, pubWith({ "index.json": index(4) }), { now: T_X + 47 * H, env: { BLOCKX_RULER_FROM_WEEK: "4" } });
  assert.ok(r.held.includes("blockx/X004-1.json"), r.out); assert.match(r.out, /old-points fallback needs an ON week and 48 hours/);
});

test("publish: a fallback entry in a shadow week is held", () => {
  const e = fbEntry(60 * H), inc = tmp(); write(inc, "X004-1.json", dayFile(5, "shadow", [e]));
  const r = check(inc, pubWith({ "index.json": index(5) }), { now: T_X + 60 * H, env: { BLOCKX_RULER_FROM_WEEK: "5" } });
  assert.ok(r.held.includes("blockx/X004-1.json"), r.out); assert.match(r.out, /old-points fallback needs an ON week/);
});

test("publish: a published fallback entry can't change", () => {
  const e = fbEntry(60 * H), changed = { ...e, note: "something else" };
  const inc = tmp(); write(inc, "X004-1.json", dayFile(4, "on", [changed]));
  const r = check(inc, pubWith({ "X004-1.json": dayFile(4, "on", [e]), "index.json": index(4) }), { now: T_X + 60 * H, env: { BLOCKX_RULER_FROM_WEEK: "4" } });
  assert.ok(r.held.includes("blockx/X004-1.json"), r.out); assert.match(r.out, /a published ruler entry would change/);
});

test("publish: the week's board is recounted from the week file's old points for a fallback target (right rows pass, wrong rows hold the board)", () => {
  const e = fbEntry(60 * H);
  const lastWeek = (pts) => ({ week: 4, final: false, rows: [{ a: PLAYER, pts }] });
  const run = (pts) => {
    const inc = tmp(); write(inc, "X004-1.json", dayFile(4, "on", [e])); write(inc, "board.json", { v: 1, updated: "2026-11-25T00:00:00.000Z", today: null, week: null, lastWeek: lastWeek(pts), allTime: null });
    return check(inc, pubWith({ "index.json": index(4) }), { now: T_X + 60 * H, env: { BLOCKX_RULER_FROM_WEEK: "4" } });
  };
  assert.ok(!run(250).held.includes("blockx/board.json"), "250 = the pick's old points");
  const bad = run(9999);
  assert.ok(bad.held.includes("blockx/board.json"), bad.out);
});
