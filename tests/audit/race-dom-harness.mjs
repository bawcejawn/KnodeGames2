// Repo Lens #G-72: a small jsdom harness for race.html + race.js (no network, no wallet, fixed clock).
// boot({ app, now, files }) loads the page with: the real race-math.js and ruler-void.js, a fake chain (KBlocks),
// fake VHP reads, and fetch answered from `files` (name -> JSON, or the strings "404" / "500").
// Returns { win, doc, tick(ms), viewRace(id), lanes() }.
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

export const addr = (ch) => "1" + ch.repeat(33);
export const A = addr("A"), Bp = addr("B"), C = addr("C"), D = addr("D");
const HOUR = 3600000;

export function card(field, at = 0) {
  // field: [[address, vhp, h]]; k = 20 for all (all in the field)
  return { at, blocksPerRace: 7200, c: 1, field: field.map(([a, vhp, h]) => ({ a, vhp, k: 20, h })), paddock: [] };
}
export const cards6 = (field, at) => Array.from({ length: 6 }, (_, l) => card(field, at + l * HOUR));
export const pad3 = (w) => String(w).padStart(3, "0");

// D-743: `race` = { wallet, kind, mana, picks: { [race number]: { horse, changes } }, sent: [] } mocks the Race contract and a connected
// Kondor wallet: get_pick / get_usage read `picks`, and W.send records each send (label, opts) and stores the pick.
export async function boot({ app, now, files = {}, vhp = {}, blocks = null, type = null, wallet = null, view = null, race = null }) {
  const html = fs.readFileSync(`${app}web/race.html`, "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const errors = [], vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(String(e && (e.detail && e.detail.stack || e.stack || e.message) || e)));
  const dom = new JSDOM(html, { url: "https://knodegames.example/race.html", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window;
  let T = now;
  win.Date.now = () => T;
  const intervals = [];
  win.setInterval = (fn) => { intervals.push(fn); return intervals.length; };
  win.scrollTo = () => {};
  win.fetch = async (url) => {
    const name = String(url).split("/").pop();
    const v = Object.prototype.hasOwnProperty.call(files, name) ? files[name] : "404";
    if (v === "hang") return new Promise(() => {});   // never answers (the ruler's files not loaded yet)
    if (v === "404" || v === "500") return { ok: false, status: Number(v), json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(typeof v === "function" ? v() : v)) };
  };
  if (race) files = { ...files, "deployment.json": { contract: addr("R") }, "race.koilib.json": {} };
  win.koilib = {
    Provider: class { constructor() {} async getAccountRc() { return String(Math.round(((race && race.mana) ?? 10) * 1e8)); } },
    Contract: class { constructor() { this.functions = { balance_of: async ({ owner }) => ({ result: { value: String(Math.round((vhp[owner] || 0) * 1e8)) } }),
      ...(race ? {
        get_pick: async ({ race: r }) => ({ result: race.picks[String(r)] ? { pick: { ...race.picks[String(r)] } } : {} }),
        get_usage: async () => ({ result: { picks_today: 0 } }),
        pick: async (args) => ({ operation: { call_contract: { contract_id: addr("R") }, args } }),
      } : {}) }; } },
  };
  if (race) {
    race.sent = race.sent || [];
    win.KWallet = { address: race.wallet, kind: race.kind || "kondor", init() {}, connect() { race.connects = (race.connects || 0) + 1; }, label: () => "Kondor", batchReady: () => false,
      send: async (label, ops, opts = {}) => { race.sent.push({ label, opts }); for (const o of ops) { const k = String(o.args.race), old = race.picks[k]; race.picks[k] = { horse: o.args.horse, changes: old ? (old.changes || 0) + 1 : 0 }; } return "0x1220aa"; } };
  }
  const B = blocks || { ts: [T - 1000], sig: [0], signers: [A], from: 1, top: 1 };
  win.KBlocks = { ensure: async () => ({ B: typeof B === "function" ? B(T) : B }), isAddr: race ? (a) => typeof a === "string" && /^1[1-9A-Za-z]{33}$/.test(a) : () => false };
  if (type != null) win.localStorage.setItem("pr-type", String(type));   // open on that race length's tab
  if (view != null) win.localStorage.setItem("pr-view", view);   // M-448: Whole race is the default; "pack" opens in Pack view
  // M-375: a connected guest wallet (read-only: it sends nothing), for the page's "counted N of 24" line.
  if (wallet) win.KWallet = { address: wallet, kind: "guest", init() {}, connect() {}, label: () => "guest", batchReady: () => false };
  win.eval(fs.readFileSync(`${app}web/ruler-void.js`, "utf8"));
  win.eval(fs.readFileSync(`${app}web/race-math.js`, "utf8"));
  win.eval(fs.readFileSync(`${app}web/race.js`, "utf8"));
  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  return {
    win, doc: win.document, settle, errors,
    async tick(ms) { T += ms; for (const fn of intervals.slice()) { try { fn(); } catch { /* a timer that needs more than we fake */ } } await settle(); },
    async viewRace(id) {
      const btn = [...win.document.querySelectorAll("#hist-rows tr")].find((tr) => tr.textContent.length && tr.querySelector("button") && tr === findRow(win, id));
      if (!btn) throw new Error(`no View button for ${id}`);
      btn.querySelector("button").click(); await settle();
    },
    lanes() {
      return [...win.document.querySelectorAll("#track .pr-lane")].filter((l) => l.dataset.addr).map((l) => ({
        a: l.dataset.addr, rank: l.querySelector(".pr-rank")?.textContent, gap: l.querySelector(".pr-gap")?.textContent,
        win: l.classList.contains("win"), aria: l.getAttribute("aria-label") || "",
      }));
    },
    typedLanes() {
      return [...win.document.querySelectorAll("#rt-track .pr-lane[data-addr]")].map((l) => ({
        a: l.dataset.addr, rank: l.querySelector(".pr-rank")?.textContent, gap: l.querySelector(".pr-gap")?.textContent, win: l.classList.contains("win"),
      }));
    },
    note: () => win.document.getElementById("track-note").textContent,
    trackText: () => win.document.getElementById("track").textContent + "|" + win.document.getElementById("track-note").textContent + "|" + [...win.document.querySelectorAll("#track .pr-lane")].map((l) => l.className).join(","),
  };
}
// The history row for a race id: rows are in time order, newest first; match on the start time shown.
function findRow(win, id) {
  const t = Date.parse(`${id}:00:00Z`);
  const want = new win.Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return [...win.document.querySelectorAll("#hist-rows tr")].find((tr) => tr.firstChild && tr.firstChild.textContent === want);
}

/** A week file with one finished race (final standings: A most steps, then B, then C) and the live race after it. */
export function weekFile(week, finishedId, liveId, standings, field) {
  const s0 = Date.parse(`${finishedId}:00:00Z`), s1 = Date.parse(`${liveId}:00:00Z`);
  return {
    v: 1, week,
    races: [
      { id: finishedId, cards: cards6(field, s0), result: { final: true, standings, picks: [], line: 20 } },
      { id: liveId, cards: cards6(field, s1) },
    ],
  };
}
export const rulerEntry = (id, placings, producers) => ({ id, card: JSON.stringify({ producers }), placings });
export const rulerFile = (week, mode, rulerFrom, races) => ({ v: 1, week, rulerFrom, mode, shadow: mode === "shadow", races });
