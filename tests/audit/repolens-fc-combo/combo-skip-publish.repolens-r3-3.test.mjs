// Repo Lens #R3-3 (Combo B, KG2 #26 @ 6f0c33c): the publish job's own copy of the Race's skip rule (race_skipped /
// race_final in combo.yml) must be as strict as combo-score.mjs raceSkipped / ruledGiveUp. Each case below was a
// mutation of combo.yml that no test caught: no "final", no week check, no race id check, no "race is final" at the edge.
// Lives in tests/audit/repolens-fc-combo/ so the Combo run line's existing glob (repolens-fc-combo/*.test.mjs) runs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.env.APP ||= fileURLToPath(new URL("../../../", import.meta.url));
const F = await import(path.join(process.env.APP, "tests/audit/repolens-fc-combo/D-R.fixtures.mjs"));
const { run, M, C, H1, H2, H3, H4, ALICE, BOB, W3, heightAt, raceDir, blockxDir, node, quiet, read, tmp, VAULT, PICKS } = F;
const S = await import(path.join(process.env.APP, "bot/games/combo-score.mjs"));
const { RULER_GRACE } = await import(path.join(process.env.APP, "bot/race.ts"));
const YML = fs.readFileSync(path.join(process.env.APP, ".github/workflows/combo.yml"), "utf8");
const D3 = C.utcDay(W3), S0 = C.slotRound(D3, 0), dn = (d) => `D${String(d).padStart(5, "0")}.json`;
const early = D3 * 4 + 1, rf = D3 * 4 + 3, sent = D3 * M.DAY + 2 * 3600000;
const SKIP_AT = M.weekStart(4) + RULER_GRACE;
const cards = (r) => (r === S0 ? [
  { player: ALICE, legs: [{ code: C.SHOW, round: rf, producer: H4 }, { code: C.WIN, round: rf + 1, producer: H3 }], time: sent, height: heightAt(sent), changes: 0 },
  { player: BOB, legs: [{ code: C.WIN, round: early, producer: H1 }, { code: C.SHOW, round: early, producer: H2 }], time: sent, height: heightAt(sent), changes: 0 },
] : []);
const cardText = JSON.stringify({ producers: [[H1, 900], [H2, 800], [H3, 700], [H4, 600]].map(([a, f]) => ({ a, entry: true, void: false, fpct: String(f), signed: 5 })) });
function rulerUntil(dir, until) {
  const races = [];
  for (let t = M.weekStart(3); t < M.weekStart(4); t += M.RACE) {
    const i = M.raceIndex(t);
    races.push({ id: M.raceId(i), round: "x", window: { W0: 1, W1: 2, L: 2, S0: 3, S1: 4 }, card: i < until ? cardText : null, note: i < until ? null : "not yet: the ruler's data isn't available this run", placings: i < until ? [H1, H2, H3, H4] : [] });
  }
  fs.writeFileSync(path.join(dir, "R003.json"), JSON.stringify({ v: 1, week: 3, rulerFrom: 3, mode: "on", shadow: false, races }));
  return dir;
}
const idsFrom = (from) => { const ids = []; for (let t = M.weekStart(3); t < M.weekStart(4); t += M.RACE) { const i = M.raceIndex(t); if (i >= from) ids.push(M.raceId(i)); } return ids; };
const vaultFile = (dir, vf) => { fs.mkdirSync(path.join(dir, "vault"), { recursive: true }); fs.writeFileSync(path.join(dir, "vault", "W3.json"), JSON.stringify({ game: 3, week: 3, final: true, rows: [], first: [], second: [], skipped: [], ...vf })); };
function publish(IN, remote, now) {
  const y = YML.split("\n");
  const i = y.findIndex((l) => l.includes("Push games-data/combo (and nothing else)")), j = y.findIndex((l, k) => k > i && l.trim() === "run: |");
  const body = y.slice(j + 1).map((l) => (l.startsWith("          ") ? l.slice(10) : l)).join("\n").replace(/remote="https:[^\n]*"/, 'remote="$REMOTE"');
  const sh = path.join(tmp(), "p.sh"); fs.writeFileSync(sh, "set -euo pipefail\n" + body);
  try { return { ok: true, out: execFileSync("bash", [sh], { env: { ...process.env, IN, REMOTE: remote, RUNNER_TEMP: tmp(), CHECK_NOW_MS: String(now), RACE_RULER_FROM_WEEK: "3", COMBO_RULER_FROM_WEEK: "3" }, cwd: tmp(), stdio: ["ignore", "pipe", "pipe"] }).toString() }; }
  catch (e) { return { ok: false, out: String(e.stdout) + String(e.stderr) }; }
}
function remoteWith(race) {
  const T = tmp(), remote = path.join(T, "r.git"); execFileSync("git", ["init", "-q", "--bare", remote]);
  const g = (s, ...a) => execFileSync("git", ["-C", s, "-c", "user.name=t", "-c", "user.email=t@t", ...a]);
  const s = path.join(T, "s"); fs.mkdirSync(s); fs.writeFileSync(path.join(s, "x"), "");
  g(s, "init", "-q"); g(s, "add", "-A"); g(s, "commit", "-qm", "s"); g(s, "push", "-q", remote, "HEAD:refs/heads/games-data");
  const r = path.join(T, "race"); fs.cpSync(race, r, { recursive: true });
  g(r, "init", "-q"); g(r, "add", "-A"); g(r, "commit", "-qm", "r"); g(r, "push", "-q", remote, "HEAD:refs/heads/race-data");
  return remote;
}
const asIncoming = (out) => { const IN = tmp(); fs.cpSync(out, path.join(IN, "combo"), { recursive: true }); return IN; };
const pubAlice = (remote) => {
  let t = null; try { t = execFileSync("git", ["--git-dir", remote, "show", `games-data:combo/${dn(D3)}`]).toString(); } catch { return null; }
  return JSON.parse(t).slots.find((s) => s.round === S0).cards.find((c) => c.player === ALICE);
};
async function aliceAt(at, vf) {
  const out = tmp(), race = rulerUntil(raceDir(), rf); if (vf) vaultFile(race, vf);
  await quiet(() => run({ p: node({ t: at, cards }), check: node({ t: at, cards }), out, raceDir: race, blockxDir: blockxDir(), picksContract: PICKS, knodeGame: VAULT, now: at, vhpMovesOf: async () => 0n, rulerFrom: 3, raceRulerFrom: 3 }));
  return { out, race };
}
const held = (out, race, now) => { const r = remoteWith(race), a = publish(asIncoming(out), r, now), c = pubAlice(r); return { c, a }; };

test("R3-3: the publish job takes a given-up card only on a FINAL Vault file for THIS week that lists THIS race", async () => {
  const at = SKIP_AT + 60000;
  const ok = await aliceAt(at, { skipped: idsFrom(rf) });
  assert.equal(held(ok.out, ok.race, at + 60000).c?.state, "final", "precondition: the honest skip publishes");
  for (const [why, vf] of [["file not final", { final: false, skipped: idsFrom(rf) }], ["another race listed", { skipped: idsFrom(rf + 1) }], ["another week", { week: 4, skipped: idsFrom(rf) }], ["skipped not a list", { skipped: M.raceId(rf) }]]) {
    const bad = tmp(); fs.cpSync(ok.race, bad, { recursive: true }); vaultFile(bad, vf);
    const h = held(ok.out, bad, at + 60000);
    assert.ok(h.c === null || h.c.state !== "final", `${why}: must be held. ` + h.a.out.slice(-300));
  }
});

test("R3-3: at Combo's edge the publish job still needs the race to be final in the W file", async () => {
  const late = S.comboVaultEdge(D3) + 60000, c = await aliceAt(late, null);
  assert.equal(held(c.out, c.race, late + 60000).c?.state, "final", "precondition: final race, edge passed: published");
  const w = path.join(c.race, "W003.json"), j = JSON.parse(fs.readFileSync(w, "utf8"));
  const e = j.races.find((r) => r.id === M.raceId(rf)); assert.ok(e, "the race is in W003.json");
  const bad = tmp(); fs.cpSync(c.race, bad, { recursive: true });
  const j2 = JSON.parse(JSON.stringify(j)); j2.races.find((r) => r.id === M.raceId(rf)).result = null;
  fs.writeFileSync(path.join(bad, "W003.json"), JSON.stringify(j2));
  const h = held(c.out, bad, late + 60000);
  assert.ok(h.c === null || h.c.state !== "final", "race not final in the W file: held even at the edge. " + h.a.out.slice(-300));
});
