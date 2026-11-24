// Admin page: current rules and tools (Library M-593, D-790). The page must carry the agreed sponsor numbers (D-772) and
// never offer `mana-report --save`; it must have the new Picks, vault, This week, recorder-health and site-data screens;
// and nothing on it may send without the same preview first.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { ACTIONS, AREAS, commandFor } from "../../ops/admin/actions.ts";
import { OTHER_GAMES, VARIABLES, LAUNCH } from "../../ops/admin/switches.ts";
import { judge, siteRows, checkCalendar, readCalendar, RECORDERS } from "../../ops/admin/health.ts";

const A = (id: string) => ACTIONS.find((a) => a.id === id)!;

test("D-772: no button saves the Mana report's suggestions (2.24 / 2.0)", () => {
  assert.equal(ACTIONS.find((a) => a.id === "sponsor-report-save"), undefined, "the save button is gone");
  for (const a of ACTIONS) if (a.args.includes("mana-report")) assert.ok(!a.args.includes("--save"), `${a.id}: mana-report never with --save`);
  assert.equal(A("sponsor-report").sends, false); assert.equal(A("sponsor-report").effect, "none");
  assert.match(A("sponsor-report").what, /NOT the ones to set/);
});

test("D-772: the sponsor area shows the agreed numbers and the cards are filled in with them", () => {
  const sp = AREAS.find((a) => a.id === "sponsor")!;
  const nums = sp.numbers!.map((n) => `${n.label}: ${n.value}`).join("\n");
  for (const re of [/per-tx cap\): 4\.5/, /Picks pick row.*: 1\.5/, /Race pick row: 1\.3/, /answer row: 1\.2/, /rcLimit and rcLimitOther: 4\.5 and 4\.5/,
    /0\.9 fixed \+ 0\.25 a Picks pick \(0\.3 a Race pick\) \+ 0\.5 margin/, /40 a wallet a day, 280 a week; 5,000 .*2,000/, /25,000 KOIN; about 55 Mana/, /Never: npm run sponsor -- mana-report --save/]) assert.match(nums, re);
  assert.match(sp.numbers!.find((n) => /batch/.test(n.label))!.note!, /n × its row, and never more than 4\.5/);
  const caps = Object.fromEntries((A("sponsor-caps").params ?? []).map((p) => [p.name, p.value]));
  assert.deepEqual(caps, { tx: "4.5", day: "40", week: "280", all: "5000", free: "2000", minvhp: "1" });
  assert.deepEqual((commandFor(A("sponsor-per-tx"), { tx: "4.5" }) as any).argv, ["config", "--keep-caps", "--per-tx", "4.5"]);
  assert.deepEqual(A("sponsor-picks-limit").args.slice(0, 2), ["mana-limit", "picks:pick"]); assert.equal(A("sponsor-picks-limit").args[A("sponsor-picks-limit").args.indexOf("--limit") + 1], "1.5");
  assert.deepEqual(A("sponsor-race-limit").args.slice(0, 2), ["mana-limit", "race:pick"]); assert.equal(A("sponsor-race-limit").args[A("sponsor-race-limit").args.indexOf("--limit") + 1], "1.3");
  for (const id of ["sponsor-picks-limit", "sponsor-race-limit"]) assert.equal(A(id).effect, "files", `${id}: writes files on this PC only`);
});

test("the Picks contract area: status, announce, apply, upgrade-clear and the hand-over, all for mainnet", () => {
  for (const id of ["picks-status-p", "picks-announce", "picks-apply", "picks-upgrade-clear", "picks-owner-propose", "picks-owner-accept", "picks-owner-cancel", "picks-pause"]) {
    const a = A(id); assert.equal(a.area, "picks", id); assert.equal(a.tool, "picks", id);
    assert.ok(a.args.includes("--mainnet"), `${id}: mainnet (the tool needs --mainnet for a mainnet send)`);
    assert.ok(!a.args.includes("--send"), `${id}: --send is added only by the server, after a preview`);
  }
  assert.deepEqual((commandFor(A("picks-apply"), { game: "18" }) as any).argv, ["apply", "18", "--mainnet"]);
  assert.ok("error" in commandFor(A("picks-apply"), {}), "no default game: the owner types it");
  assert.deepEqual(A("picks-upgrade-clear").args, ["upgrade-clear", "--mainnet", "--code", "92d555d0"]);
  assert.ok("error" in commandFor(A("picks-owner-propose"), { address: "not an address" }));
  assert.match(A("picks-apply").when!, /18 and 19.*Mon 30 Nov/);
  assert.match(A("vault-game-apply").when!, /4 Fantasy and 13 Last Node: Tue 24 Nov.*8 Combo and 16 Over Under: Mon 30 Nov/);
  assert.match(A("bot-mana").what, /LAST line/); assert.equal(A("bot-mana").sends, false);
});

test("Over Under (16) and VS (17) are on the page with their status; the old Race 'Week 1' wording is gone", () => {
  assert.deepEqual(OTHER_GAMES.map((g) => g.id), [16, 17]);
  assert.equal(OTHER_GAMES[0].players, "More or Fewer");
  assert.match(OTHER_GAMES[1].vault, /Not a vault game/);
  const ou = AREAS.find((a) => a.id === "overunder")!, vs = AREAS.find((a) => a.id === "vs")!;
  assert.match(ou.what, /More or Fewer/); assert.match(vs.what, /Not a vault game/); assert.match(vs.what, /prizes tool \(game 17\)/);
  for (const id of ["combo", "lastnode", "survivor"]) assert.notEqual(AREAS.find((a) => a.id === id)!.status, "planned", `${id}: its current status`);
  assert.match(AREAS.find((a) => a.id === "survivor")!.later!, /K9\/K1b/);
  assert.doesNotMatch(JSON.stringify(VARIABLES.find((v) => v.name === "RACE_RULER_FROM_WEEK")), /Week 1/);
  assert.doesNotMatch(LAUNCH.find((l) => l.game === 7)!.steps[0].text, /Week 1/);
  for (const g of OTHER_GAMES) for (const id of ["prizes-on", "prizes-off"]) assert.deepEqual((commandFor(A(id), { game: String(g.id) }) as any).argv, [id === "prizes-on" ? "on" : "off", String(g.id)]);
});

test("This week: calendar.json is valid, names only real cards, and a broken file is reported plainly", () => {
  const { error, calendar } = readCalendar(".");
  assert.equal(error, ""); assert.ok(calendar.items.length >= 10);
  for (const it of calendar.items) if (it.card) assert.ok(A(it.card), `calendar names card ${it.card}`);
  const txt = JSON.stringify(calendar);
  for (const re of [/apply 8/, /9:35 AM/, /7:10 to 7:15 PM/, /RPC_SPARE/, /CONFIRM_MAINNET/, /Before 8 PM/, /payout freeze/i, /apply 18/]) assert.match(txt, re);
  assert.doesNotMatch(txt, /_WIF|--send/, "the calendar names cards; it carries no keys and no send commands");
  assert.match(checkCalendar({ updated: "x", items: [{ date: "25 Nov", time: "1", what: "hello", kind: "info" }] }), /date must look like/);
  assert.match(checkCalendar({ updated: "x", items: [{ date: "2026-11-25", time: "1", what: "hello", kind: "party" }] }), /kind must be one of/);
  assert.match(checkCalendar({ items: [] }), /updated/);
});

test("recorder health: OK within 90 minutes, LATE after, no file = not started, unreadable = error", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  assert.deepEqual(judge(now, "2026-11-25T11:00:00Z", 200), { state: "ok", ageMin: 60 });
  assert.deepEqual(judge(now, "2026-11-25T10:29:00Z", 200), { state: "late", ageMin: 91 });
  assert.deepEqual(judge(now, null, 404), { state: "none", ageMin: null });
  assert.deepEqual(judge(now, null, "error"), { state: "error", ageMin: null });
  assert.deepEqual(judge(now, "not a date", 200), { state: "error", ageMin: null });
  assert.deepEqual(RECORDERS.map((r) => r.id), ["lastnode", "combo", "race", "blockx"]);
});

test("site data: board and results entries from web/games.json; the free-prize switch per week", () => {
  const games = JSON.parse(fs.readFileSync("web/games.json", "utf8"));
  const sw: any = { v: 1, games: { "16": [{ from: 6, on: false, set: "2026-11-23T14:43:18.929Z" }], "9": [{ from: 4, on: false, set: "2026-11-11T04:00:52.037Z" }, { from: 5, on: true, set: "2026-11-16T00:52:12.095Z" }] } };
  const rows = siteRows(games, sw, Date.parse("2026-11-25T12:00:00Z"));       // vault week 5
  const R = (id: string) => rows.find((r) => r.id === id)!;
  assert.equal(R("race").board, true); assert.equal(R("race").results, true);
  assert.equal(R("survivor").board, false);
  assert.equal(R("overunder").prizeNextWeek, "OFF"); assert.match(R("overunder").prizeThisWeek, /^ON/);
  assert.equal(R("bracket").prizeThisWeek, "ON");
  assert.match(R("vs").prizeThisWeek, /^none/);
  assert.equal(siteRows(games, null)[0].prizeThisWeek, "could not read");
});

function get(port: number, path: string, key?: string) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}`, ...(key ? { "x-admin-key": key } : {}) } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j: any = b; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode!, body: j }); });
    }).on("error", reject);
  });
}
function post(port: number, key: string, body: unknown) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/run", method: "POST", headers: { host: `127.0.0.1:${port}`, "x-admin-key": key, "content-type": "application/json" } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { let j: any = b; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode!, body: j }); });
    });
    req.on("error", reject); req.write(JSON.stringify(body)); req.end();
  });
}
/** A value that passes the parameter's own check (its default, a choice, or a common sample). */
const sample = (p: any) => [p.value, ...(p.choices ?? []), "8", "1", "on", "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr", "Test", "node", "koin", "sponsor", "2026-12-01"].find((v) => v !== undefined && p.pattern.test(v));

test("the server: nothing sends without the same preview first (every send card), and the new screens need the key", async () => {
  // A fake public data branch, so the health and site rows are tested without the internet.
  const now = Date.now();
  const files: Record<string, unknown> = {
    "/games-data/lastnode/index.json": { updated: new Date(now - 20 * 60_000).toISOString() },
    "/race-data/index.json": { updated: new Date(now - 3 * 3_600_000).toISOString() },
    "/games-data/blockx/board.json": { updated: new Date(now - 5 * 60_000).toISOString() },
    "/prize-settings/free-prizes.json": { v: 1, games: { "16": [{ from: 6, on: false, set: "2026-11-23T14:43:18.929Z" }] } },
  };
  const fake = http.createServer((req, res) => { const f = files[req.url ?? ""]; res.writeHead(f ? 200 : 404, { "content-type": "application/json" }); res.end(f ? JSON.stringify(f) : "404: Not Found"); });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(fake.address() as any).port}/`;
  const port = 20000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["--import", "tsx", "ops/admin/server.ts"], { env: { ...process.env, ADMIN_PORT: String(port), ADMIN_NO_BROWSER: "1", ADMIN_DATA_BASE: base } });
  let out = ""; child.stdout.on("data", (b) => (out += b));
  try {
    for (let i = 0; i < 100 && !/#([0-9a-f]{48})/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
    const key = out.match(/#([0-9a-f]{48})/)![1];
    // Every card that can change something: a send without its preview is refused, and nothing runs.
    const senders = ACTIONS.filter((a) => a.sends);
    assert.ok(senders.length >= 60);
    for (const a of senders) {
      const values = Object.fromEntries((a.params ?? []).map((p) => [p.name, sample(p)]));
      assert.ok("argv" in commandFor(a, values), `${a.id}: the sample values pass (${JSON.stringify(values)})`);
      const r = await post(port, key, { action: a.id, values, send: true });
      assert.equal(r.status, 409, `${a.id}: a send without a preview is refused`);
      assert.match(r.body.error, /preview it first/, a.id);
    }
    // read-only cards can never send
    for (const a of ACTIONS.filter((x) => !x.sends).slice(0, 5)) assert.equal((await post(port, key, { action: a.id, values: {}, send: true })).status, 400, a.id);
    // the new screens: key needed, read-only answers
    for (const p of ["/api/calendar", "/api/health", "/api/site"]) assert.equal((await get(port, p)).status, 401, `${p} needs the key`);
    const cal = await get(port, "/api/calendar", key); assert.equal(cal.status, 200); assert.equal(cal.body.error, ""); assert.ok(cal.body.calendar.items.length);
    const h = await get(port, "/api/health", key); assert.equal(h.status, 200);
    const st = Object.fromEntries(h.body.rows.map((r: any) => [r.id, r.state]));
    assert.deepEqual(st, { lastnode: "ok", combo: "none", race: "late", blockx: "ok" });
    const site = await get(port, "/api/site", key); assert.equal(site.status, 200); assert.equal(site.body.prizesRead, true);
    assert.equal(site.body.rows.find((r: any) => r.id === "overunder").game, 16);
    assert.doesNotMatch(JSON.stringify([cal.body, h.body, site.body]), /_WIF|PRIVATE|password/i, "no key or secret in any answer");
  } finally { child.kill(); fake.close(); }
});

test("the page: the new screens only read; the branch banner says main; no key or token anywhere", () => {
  const page = fs.readFileSync("ops/admin/index.html", "utf8");
  for (const p of ["/api/calendar", "/api/health", "/api/site"]) assert.match(page, new RegExp(`api\\("${p.replace(/\//g, "\\/")}"\\)`), `${p} is a plain GET (no body)`);
  assert.doesNotMatch(page, /kept on picks/); assert.match(page, /git checkout main, git pull, npm ci, npm run admin/);
  assert.doesNotMatch(page, /type="password"|name="token"|ghp_|github_pat_/);
  const health = fs.readFileSync("ops/admin/health.ts", "utf8");
  assert.doesNotMatch(health, /_WIF|child_process|"\.env|\.env"/, "health.ts reads public files only and runs nothing");
});

test("the page draws This week, the recorders and the sponsor numbers (browser-like window)", async () => {
  const { JSDOM } = await import("jsdom");
  const cat = JSON.parse(JSON.stringify({ version: { branch: "main", commit: "abc", date: "" }, areas: AREAS, kinds: (await import("../../ops/admin/actions.ts")).KINDS, games: [], otherGames: OTHER_GAMES, launchAsOf: "x", variables: [], variablesUrl: "", standardSteps: [], launch: [],
    actions: ACTIONS.map(({ id, area, kind, label, what, when, signer, effect, timing, step, tool, params, sends, args, done }) => ({ id, area, kind, label, what, when, signer, effect, timing, step, sends, done, testnet: args.includes("--testnet"), command: `npm run ${tool} -- ${args.join(" ")}`, params: (params ?? []).map(({ name, label, hint, choices, value }) => ({ name, label, hint, choices, value })) })) }));
  const calendar = readCalendar(".");
  const seen: string[] = [];
  const dom = new JSDOM(fs.readFileSync("ops/admin/index.html", "utf8"), {
    url: "http://127.0.0.1:8787/#" + "a".repeat(48), runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w: any) {
      w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
      w.fetch = async (p: string, init: any = {}) => {
        seen.push(`${init.method || "GET"} ${p}`);
        const body = p === "/api/actions" ? cat : p === "/api/calendar" ? calendar
          : p === "/api/health" ? { rows: [{ id: "race", name: "Producer Race", file: "race-data/index.json", runs: "hourly", updated: "2026-11-25T08:00:00Z", state: "late", ageMin: 240 }] }
          : p === "/api/site" ? { week: 5, rows: [{ id: "race", name: "Producer Race", game: 7, board: true, results: true, prizeThisWeek: "ON", prizeNextWeek: "ON" }], gamesError: "", prizesRead: true } : {};
        return { ok: true, status: 200, json: async () => body };
      };
    },
  });
  const w: any = dom.window, doc = w.document, tick = () => new Promise((r) => setTimeout(r, 60));
  await tick(); await tick();
  const click = (re: RegExp) => { const b = [...doc.querySelectorAll(".area-btn")].find((x: any) => re.test(x.textContent)) as any; assert.ok(b, String(re)); b.click(); };
  click(/This week/); await tick(); await tick();
  const main = () => doc.querySelector("#main").textContent;
  assert.match(main(), /Picks apply 8 \(Combo Card\)/); assert.match(main(), /Open the card: /);
  click(/Health checks/); await tick(); await tick();
  assert.match(main(), /Late: Producer Race/); assert.match(main(), /Leaderboard entry/);
  click(/Mana sponsor/);
  assert.match(main(), /Agreed value/); assert.match(main(), /4\.5/); assert.doesNotMatch(main(), /save the report's suggestions/);
  // Owner, 24 Nov: long pages grouped. A jump bar with counts; every card one line until opened.
  assert.ok(doc.querySelector("#main nav.jump"), "jump bar"); assert.match(doc.querySelector("#main nav.jump").textContent, /Check \(read-only\) \(\d+\)/);
  const cards = [...doc.querySelectorAll("#main details.card")] as any[];
  assert.ok(cards.length >= 10 && cards.every((c) => !c.open), "every card starts closed");
  [...doc.querySelectorAll("#main nav.jump button")].find((b: any) => /Open all/.test(b.textContent))!.dispatchEvent(new w.Event("click"));
  assert.ok(cards.every((c) => c.open), "Open all opens every card");
  // a step already taken sits in the closed Done group at the bottom
  click(/Picks contract/);
  const done = doc.querySelector("#kind-done") as any;
  assert.ok(done && !done.open && done.querySelector('[data-card="picks-upload"]'), "the 30 Oct upload is in Done");
  assert.ok(!doc.querySelector('#main .kind [data-card="picks-upload"]') || doc.querySelector('#kind-done [data-card="picks-upload"]'));
  // the calendar's button opens its card
  click(/This week/); await tick(); await tick();
  [...doc.querySelectorAll("#main button")].find((b: any) => /Open the card: Clear the v2/.test(b.textContent))!.dispatchEvent(new w.Event("click"));
  assert.equal((doc.querySelector('[data-card="picks-upgrade-clear"]') as any).open, true, "Open the card opens it");
  assert.ok(seen.every((x) => x.startsWith("GET ")), "opening these screens only reads: " + seen.join(", "));
  w.close();
});
