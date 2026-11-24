/* Knode Games VS (game 17, TEST): the page. Reads the kit's files from the games-data branch (vs/ folder) and sends picks through
 * the shared card (web/js/lib/send-picks.js). Every rule is in ./games/vs/math.js (the recorder uses the same file).
 *   inputs/W<w>.json  the week's rosters (write-once, public before picks open): data.rosters[<day start ms>] = { rows, sum, ... }
 *   W<w>.json         the week's results file (rounds, players)
 * A pick is ONE number: bit i = "producer i beats the pool node"; 0 = "Knode Games vs All". No pick changes (max_changes 0).
 * Lines and multipliers are never shown before picks lock: names only. */
import * as V from "./games/vs/math.js";
import * as SP from "./js/lib/send-picks.js";

const $ = (id) => document.getElementById(id);
if (typeof document !== "undefined" && $("days")) start();

function start() {
  "use strict";
  const lib = window.koilib || window.koinos || window;
  const ROOT = new URL("./", location.href);
  const DATA = "https://raw.githubusercontent.com/bawcejawn/KnodeGames2/games-data/vs/";
  const RPC = ["https://koinos.armana.io", "https://api.koinosblocks.com"];
  const DAY = V.DAY, GAME = V.GAME;
  const GENESIS = window.KWeeks ? window.KWeeks.GENESIS_MS : 1792368000000, WEEK = 7 * DAY;
  const NAMES = { "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr": "Knode Games pool node" };
  const weekOf = (t) => Math.floor((t - GENESIS) / WEEK);
  const pad = (w) => String(w).padStart(3, "0");
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of kids) e.append(c); return e; };
  const isAddr = V.isAddr;
  const nameOf = (a) => (!isAddr(a) ? "–" : window.KNames && typeof window.KNames.of === "function" ? window.KNames.of(a) : NAMES[a] || a.slice(0, 5) + "…" + a.slice(-4));
  const say = (t) => { $("status").textContent = t; $("status").hidden = !t; };
  const dayLabel = (d) => new Date(d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }) + " (UTC)";
  async function fetchJson(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

  let W = null, picks = null, provider = null;
  const me = () => (W && W.address) || null;
  const files = { rosters: new Map(), weeks: new Map() };
  const mine = new Map();           // day → { number: string | null, ok: bool }
  const draft = new Map();          // day → Set of ticked producers (dirty days only)

  /** The days that take picks now: picks open 2 days ahead and lock 5 minutes before the day starts. */
  function openDays(t) {
    const out = [];
    for (let d = Math.floor(t / DAY) * DAY + DAY; d - V.AHEAD <= t; d += DAY) if (V.opensAt(d) <= t && t < V.locksAt(d)) out.push(d);
    return out;
  }

  async function boot() {
    let dep = null, gd = null;
    try { dep = await fetchJson(new URL("picks-data/deployment.json", ROOT)); } catch { /* not live yet */ }
    try { gd = await fetchJson(new URL("game-data/deployment.json", ROOT)); } catch { /* defaults */ }
    const PICKS = dep && isAddr(dep.contract) ? dep.contract : null;
    provider = new lib.Provider(RPC);
    W = window.KWallet || null;
    if (W && W.init && PICKS) W.init({ provider, chainId: gd && gd.chainId, payer: gd && gd.payer, sponsor: gd && gd.sponsor, onChange: () => refreshMine() });
    if (PICKS) {
      const abi = await fetchJson(new URL("contracts/picks/abi/picks.koilib.json", ROOT));
      picks = new lib.Contract({ id: PICKS, abi, provider });
    }
  }
  async function loadFiles() {
    const w0 = weekOf(Date.now());
    await Promise.all([w0 - 1, w0, w0 + 1].filter((w) => w >= 0).map(async (w) => {
      const get = async (n) => { try { return await fetchJson(DATA + n); } catch { return null; } };
      const [inp, wf] = await Promise.all([get(`inputs/W${w}.json`), get(`W${pad(w)}.json`)]);
      const rosters = inp && inp.week === w ? ((inp.data && inp.data.rosters) || inp.rosters) : null;
      if (rosters) for (const [d, r] of Object.entries(rosters)) if (V.checkRoster(r).ok) files.rosters.set(Number(d), r);
      if (wf && wf.week === w) files.weeks.set(w, wf);
    }));
  }

  const READ_FAILED = "couldn't check your current pick";
  async function readPick(day) {
    const who = me();
    if (!who || !picks) throw new Error(READ_FAILED);
    let x; try { x = await picks.functions.get_pick({ game: GAME, round: String(Math.floor(day / DAY)), player: who }); } catch { throw new Error(READ_FAILED); }
    if (!x || typeof x !== "object") throw new Error(READ_FAILED);
    const pk = x.result && x.result.pick;
    return pk && pk.number !== undefined && pk.time !== undefined && Number(pk.time) > 0 ? String(pk.number) : null;
  }
  async function refreshMine() {
    mine.clear();
    if (me() && picks) for (const d of openDays(Date.now())) { try { mine.set(d, { number: await readPick(d), ok: true }); } catch { mine.set(d, { number: null, ok: false }); } }
    render();
  }

  const EMPTY_NOTE = "No producers on this day's list, so you can only pick the pool node against all, and nothing scores.";   // date-free (Repo Lens 5 R5-13-2)
  function dayCard(d) {
    const roster = files.rosters.get(d);
    const box = el("div", { class: "vs-day" }, el("h3", { text: dayLabel(d) }));
    if (!roster) { box.append(el("p", { class: "note", text: "The producer list for this day isn't published yet." })); return box; }
    const have = mine.get(d);
    if (have && have.number !== null) {
      const set = V.decodePick(roster, have.number);
      box.append(el("p", { class: "vs-mine", text: set === null ? "You have a pick for this day." : set.size === 0 ? "Your pick: Knode Games vs All (the pool node beats every producer)." : `Your pick: ${set.size} producer${set.size === 1 ? "" : "s"} beat the pool node. No changes.` }));
      if (set && set.size) box.append(el("p", { class: "note", text: [...set].map(nameOf).join(", ") }));
      return box;
    }
    const ticked = draft.get(d) || new Set();
    const list = el("div", { class: "vs-list", role: "group", "aria-label": "Producers that beat the pool node" });
    for (const a of roster.rows) {
      const cb = el("input", { type: "checkbox", id: `p-${d}-${a}` });
      cb.checked = ticked.has(a);
      cb.addEventListener("change", () => { const s = draft.get(d) || new Set(); if (cb.checked) s.add(a); else s.delete(a); if (s.size === 0) draft.delete(d); else draft.set(d, s); sendBtn(); });   // VS-4: unticking the last producer drops the draft; only the "vs All" button makes an empty one
      list.append(el("label", { class: "vs-prod", for: cb.id }, cb, el("span", { text: nameOf(a) })));
    }
    box.append(roster.rows.length === 0   // week 5's roster is empty (VS-9): say so where the list would be, not "Tick the producers"
      ? el("p", { class: "note vs-empty", text: EMPTY_NOTE })
      : el("p", { class: "note", text: "Tick the producers that beat the Knode Games pool node. Leave a producer unticked to say the pool node beats it." }), list,
      el("button", { type: "button", class: "btn", onclick: () => { draft.set(d, new Set()); render(); } }, "Knode Games vs All (pool node beats everyone)"));
    if (draft.has(d)) box.append(el("p", { class: "vs-ready", text: "Ready to send." }));
    return box;
  }
  function sendBtn() { const b = $("send"); if (b) b.disabled = draft.size === 0; }
  function render() {
    const days = openDays(Date.now());
    $("days").replaceChildren(...(days.length ? days.map(dayCard) : [el("p", { class: "note", text: "No day is open for picks right now." })]),
      el("p", {}, el("button", { type: "button", class: "btn btn-primary", id: "send", onclick: send }, me() ? "Send my picks" : "Connect a wallet")));
    sendBtn(); if (!me()) $("send").disabled = false;
    renderResults();
  }
  function renderResults() {
    const out = [];
    for (const [w, wf] of [...files.weeks.entries()].sort((a, b) => b[0] - a[0])) {
      const idx = me() ? (wf.players || []).findIndex((p) => p[0] === me()) : -1;
      for (const r of (wf.rounds || []).slice().reverse()) {
        const [, day, , status, rows] = r;
        const x = idx >= 0 ? (rows || []).find((q) => q[0] === idx) : null;
        out.push(el("tr", {}, el("td", { text: dayLabel(day) }), el("td", { text: status === "s" ? "Decided" : "Not decided yet" }), el("td", { text: status === "s" && x ? String(x[1]) : "–" })));
      }
    }
    if (out.length) $("results").replaceChildren(el("table", { class: "vs-t" }, el("thead", {}, el("tr", {}, el("th", { text: "Day" }), el("th", { text: "Status" }), el("th", { text: "Your points" }))), el("tbody", {}, ...out)));
  }

  // ── sending: through the shared card; no pick changes in this game (max_changes 0) ──
  let sending = false, modal = null;
  function pop(title, lines = [], actions = []) {
    if (!modal) { modal = el("div", { class: "vs-modal", role: "dialog", "aria-modal": "true" }); modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; }); document.body.append(modal); }
    modal.replaceChildren(el("div", { class: "vs-box" }, el("h3", { text: title }), ...lines.map((l) => el("p", { text: l })), el("div", {}, ...(actions.length ? actions : [el("button", { type: "button", class: "btn btn-primary", onclick: () => { modal.hidden = true; } }, "OK")]))));
    modal.hidden = false;
  }
  async function send() {
    if (!me()) { if (W && W.connect) W.connect(); else say("Connect a wallet first."); return; }
    if (sending || !draft.size) return;
    sending = true;
    try {
      const items = [];
      for (const [d, set] of draft) {
        const roster = files.rosters.get(d);
        if (!roster || Date.now() >= V.locksAt(d) - 60000) continue;
        const number = V.encodePick(roster, set).toString();
        const { operation } = await picks.functions.pick({ player: me(), game: GAME, round: String(Math.floor(d / DAY)), producers: [], number }, { onlyOperation: true });
        let existing = null; try { existing = await readPick(d); } catch (e) { throw new Error(READ_FAILED); }
        items.push({ key: `${GAME}:${d}`, label: dayLabel(d), op: operation, existing, wanted: number, open: Date.now() < V.locksAt(d) - 60000 });
      }
      const p = SP.plan(items, { maxChanges: V.MAX_CHANGES });
      if (!p.fresh.length) { pop("Nothing to send", p.same.length ? ["Those picks are already on chain."] : ["The days you chose have locked, or already have a pick (no changes in this game)."]); return; }
      const batch = p.fresh.slice(0, 10);
      pop(W.kind === "guest" ? "Sending…" : `Confirm in ${W.label ? W.label() : "your wallet"}`, ["A first pick is free: Knode's Mana sponsor pays, unless your wallet has enough Mana of its own."]);
      await SP.send(W, { ...p, fresh: batch }, { label: "Knode Games VS picks", stillOpen: (it) => Date.now() < V.locksAt(Number(String(it.key).split(":")[1])) - 60000 });
      for (const it of batch) draft.delete(Number(String(it.key).split(":")[1]));
      pop("Picks sent", ["Your picks are in. No changes in this game."]);
      await refreshMine();
    } catch (e) {
      const m = String((e && e.message) || e);
      pop("Not sent", [/reject|denied|cancel/i.test(m) ? "Cancelled in your wallet. Nothing was sent." : /couldn't check/.test(m) ? "Couldn't check your current pick, so nothing was sent. Try again in a moment." : `Not sent: ${m.slice(0, 200)}`]);
    } finally { sending = false; }
  }

  (async () => {
    try { await boot(); await loadFiles(); } catch (e) { say("Couldn't load the game files. Try again in a moment."); }
    say(""); render(); refreshMine();
    setInterval(() => { render(); }, 60000);
  })();
}
