/* Over Under: the game page (Koinos MAINNET, Picks game 16), a rolling game on the Shared Game Kit.
 *
 * A new game starts every 30 minutes (:00 and :30 UTC). Each game is one producer and its line, in half blocks. Picks open
 * 2 hours before the start and lock 5 minutes before it, so 3 or 4 games are open at any time, never more than 4. A pick
 * is one number per game: 1 = Over, 2 = Under. No changes.
 *
 * Reads (games-data branch, overunder/ folder, written by the kit's recorder and checked by its publish job):
 *   schedule/r#####.json   each game's write-once schedule file: who plays and the line (made 3 h 33 min to 3 h 3 min
 *                          before the start, so it is public before picks open). A game with no file is cancelled.
 *   board.json, alltime.json   the boards.
 * and your picks from the Picks contract. The rules are games/overunder/math.js, the same file the recorder uses. Picks go
 * out only through the shared "Send my picks" card (js/lib/send-picks.js). Everything on screen is built with textContent. */
import * as F from "./games/overunder/math.js";
import * as SP from "./js/lib/send-picks.js";

const $ = (id) => document.getElementById(id);
if (typeof document !== "undefined" && $("ou-games")) start();

function start() {
  "use strict";
  const lib = window.koilib || window.koinos || window;
  const ROOT = new URL("./", location.href);
  const DATA = "https://raw.githubusercontent.com/bawcejawn/KnodeGames2/games-data/overunder/";
  const RPC = ["https://api.koinos.io", "https://api.koinosblocks.com"];
  const GAME = F.GAME, BATCH = 10, READ_FAILED = "couldn't check your current pick";
  const NAMES = { "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr": "Knode pool", "1FKTpXBhhHEbu5vVchM8UsVbAvPArJsRmR": "Knode Swap" };

  // ── small helpers ──
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); } for (const c of kids) if (c != null) e.append(c); return e; };
  const nameOf = (a) => (!F.isAddr(a) ? "–" : window.KNames && typeof window.KNames.of === "function" ? window.KNames.of(a) : NAMES[a] || a.slice(0, 5) + "…" + a.slice(-4));
  const dur = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
  const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const lineText = (line) => `${Math.floor(line / 2)}.5`;
  const say = (t) => { $("status").textContent = t; $("status").hidden = !t; };
  const idOf = (start) => "r" + String(Math.round((start - F.WEEK0) / F.SLOT)).padStart(5, "0");
  async function fetchJson(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

  // ── network and wallet ──
  let provider = null, W = null, picks = null;
  const me = () => (W && W.address) || null;
  async function boot() {
    let dep = null, gd = null;
    try { dep = await fetchJson(new URL("picks-data/deployment.json", ROOT)); } catch { /* not live yet */ }
    try { gd = await fetchJson(new URL("game-data/deployment.json", ROOT)); } catch { /* defaults */ }
    const PICKS = dep && F.isAddr(dep.contract) ? dep.contract : null;
    provider = new lib.Provider(RPC);
    W = window.KWallet || null;
    if (window.KStake && typeof window.KStake.mount === "function" && $("ou-stake")) window.KStake.mount($("ou-stake"), { game: GAME });
    if (window.KStake && typeof window.KStake.badge === "function" && $("stake-badge")) window.KStake.badge($("stake-badge"), { game: GAME });
    if (W && W.init && PICKS) W.init({ provider, chainId: gd && gd.chainId, payer: gd && gd.payer, sponsor: gd && gd.sponsor, onChange: () => refreshMine() });
    if (PICKS) picks = new lib.Contract({ id: PICKS, abi: await fetchJson(new URL("contracts/picks/abi/picks.koilib.json", ROOT)), provider });
  }

  // ── the schedule files ──
  /** start → the checked schedule entry (who plays, the line), or null: no file yet, or one that fails its check (never shown). */
  const games = new Map();
  /** The game's schedule file, only if it is exactly what the kit publishes for that start and its entry passes math.js's check. */
  function checked(j, start) {
    if (!j || j.v !== 1 || j.game !== GAME || j.round !== idOf(start) || j.start !== start || !j.body) return null;
    const e = j.body.entry;
    return e && F.checkEntry(e).ok && e.start === start ? e : null;
  }
  async function loadGames(now = Date.now()) {
    const want = F.openStarts(now);
    for (const s of [...games.keys()]) if (!want.includes(s)) games.delete(s);
    await Promise.all(want.filter((s) => !games.get(s)).map(async (s) => {
      let j = null; try { j = await fetchJson(DATA + `schedule/${idOf(s)}.json`); } catch { /* not out (yet) */ }
      games.set(s, checked(j, s));
    }));
  }

  // ── your picks (Picks contract) ──
  /** Your saved pick for the game at `start` ("1" Over, "2" Under), or null. A failed read THROWS: never "no pick". */
  async function readPick(start) {
    const who = me();
    if (!who || !picks) return null;
    const x = await picks.functions.get_pick({ game: GAME, round: String(F.roundOfStart(start)), player: who });
    const p = x && x.result && x.result.pick;
    if (!p) return null;
    const n = p.number == null ? "0" : String(p.number);
    return Number(p.time || 0) > 0 || n !== "0" ? n : null;
  }
  const saved = new Map(), unread = new Set();      // start → "1" | "2"; starts whose pick couldn't be read
  const draft = new Map();                          // start → 1 | 2 (not sent yet)
  let sending = false;
  async function refreshMine() {
    saved.clear(); unread.clear();
    if (me() && picks) await Promise.all([...games.keys()].map(async (s) => {
      try { const n = await readPick(s); if (n) saved.set(s, n); } catch { unread.add(s); }
    }));
    for (const s of saved.keys()) draft.delete(s);
    render();
  }

  // ── the games ──
  const open = (s, now = Date.now()) => now >= F.opensAt(s) && F.locksAt(s) - now >= 60000;
  function choose(s, c) {
    if (!open(s) || saved.has(s)) return;
    if (draft.get(s) === c) draft.delete(s); else draft.set(s, c);
    render();
  }
  function render() {
    const now = Date.now(), starts = [...games.keys()].sort((a, b) => a - b), box = $("ou-games");
    if (!starts.length) { box.replaceChildren(el("p", { class: "ou-none", text: "No game is open right now. A new game starts every 30 minutes; picks open 2 hours before the start." })); }
    else box.replaceChildren(...starts.map((s) => {
      const e = games.get(s), mine = saved.get(s), want = draft.get(s), lk = F.locksAt(s) - now;
      const head = el("div", { class: "ou-g-head" },
        el("span", { class: "ou-g-when", text: `Starts ${hm(s)}` }),
        el("span", { class: "ou-g-lock", text: lk < 60000 ? "Locked" : `Locks in ${dur(lk)}` }));
      if (!e) return el("article", { class: "ou-g" }, head, el("p", { class: "ou-none", text: "No game at this start: it was cancelled for everyone (no schedule file)." }));
      const label = F.formLabel(e.form);
      const btn = (c, txt, cls) => el("button", { type: "button", class: cls, "aria-pressed": String((mine ? Number(mine) : want) === c),
        "aria-label": `${txt} ${lineText(e.line)} for ${nameOf(e.producer)}`, disabled: !open(s, now) || !!mine ? "" : null, onclick: () => choose(s, c) }, txt);
      return el("article", { class: "ou-g" + (want ? " on" : "") }, head,
        el("p", { class: "ou-g-who" }, el("b", { text: nameOf(e.producer) }), el("span", { class: "ou-form", text: ` · ${label}` })),
        el("p", { class: "ou-g-line" }, el("span", { text: "Line: " }), el("b", { text: `${lineText(e.line)} blocks` }), el("span", { text: " in its next 14,400 blocks" })),
        el("div", { class: "ou-btns" }, btn(F.OVER, "Over", "ou-o"), btn(F.UNDER, "Under", "ou-u")),
        el("p", { class: "ou-small", text: mine ? `Your pick: ${mine === "1" ? "Over" : "Under"}. No changes.` : unread.has(s) ? "Couldn't read your pick for this game. Nothing is sent for it until it reads." : "" }));
    }));
    const n = [...draft.keys()].filter((s) => open(s, now) && games.get(s) && !unread.has(s)).length;
    $("ou-send").disabled = sending || !picks || n === 0;
    $("ou-send").textContent = !me() ? "Connect to send" : n > 1 ? `Send my ${n} picks` : "Send my pick";
    $("ou-check").textContent = !me() ? "Connect a wallet to send picks." : n ? "A first pick is free: Knode's Mana sponsor pays. Picks can't be changed once sent." : "Tap Over or Under on any open game.";
    renderLeague();
  }

  function pop(title, lines = []) {
    const box = $("ou-pop");
    box.replaceChildren(el("h3", { text: title }), ...lines.map((l) => el("p", { text: l })), el("button", { type: "button", class: "btn", onclick: () => { box.hidden = true; } }, "OK"));
    box.hidden = false;
  }
  async function send() {
    if (!me()) { if (W && W.connect) W.connect(); else say("Connect a wallet first."); return; }
    if (sending || !draft.size || !picks) return;
    sending = true; render();
    try {
      const items = [];
      for (const [s, c] of draft) {
        if (!open(s) || !games.get(s) || unread.has(s)) continue;
        const number = String(c), round = String(F.roundOfStart(s));
        let existing = null; try { existing = await readPick(s); } catch { throw new Error(READ_FAILED); }
        const { operation } = await picks.functions.pick({ player: me(), game: GAME, round, producers: [], number }, { onlyOperation: true });
        items.push({ key: `${GAME}:${s}`, label: `Over Under, game at ${hm(s)}`, op: operation, existing, wanted: number, open: open(s) });
      }
      const p = SP.plan(items, { maxChanges: F.MAX_CHANGES });
      if (!p.fresh.length) { pop("Nothing to send", p.same.length ? ["Those picks are already on chain."] : ["Those games have locked, or already have a pick (no changes in this game)."]); return; }
      const batch = p.fresh.slice(0, BATCH);
      say(W.kind === "guest" ? "Sending…" : `Confirm in ${W.label ? W.label() : "your wallet"}.`);
      await SP.send(W, { ...p, changes: [], fresh: batch }, { label: "Over Under picks", stillOpen: (it) => open(Number(String(it.key).split(":")[1])) });
      for (const it of batch) draft.delete(Number(String(it.key).split(":")[1]));
      say("");
      pop("Picks sent", ["Your picks are in. No changes in this game."]);
    } catch (e) {
      const m = String((e && e.message) || e);
      say("");
      pop("Not sent", [/reject|denied|cancel/i.test(m) ? "Cancelled in your wallet. Nothing was sent."
        : m === READ_FAILED ? "Couldn't check your current pick, so nothing was sent. Try again in a moment."
        : /locked/i.test(m) ? "That game has locked: picks close 5 minutes before it starts."
        : `Not sent: ${m.slice(0, 200)}`]);
    } finally { sending = false; await refreshMine(); }
  }

  // ── the league (board.js) ──
  const files = { board: null, alltime: null };
  let lb = null;
  async function loadBoards() {
    const get = async (name) => { try { return await fetchJson(DATA + name); } catch { return null; } };
    const [b, a] = await Promise.all([get("board.json"), get("alltime.json")]);
    files.board = b && b.v === 1 ? b : null; files.alltime = a && a.v === 1 ? a : null;
  }
  function boardData() {
    const b = files.board && files.board.lastWeek, at = files.alltime;
    const row = (x) => ({ a: x.a, pts: x.pts, boardPlace: x.place, ranked: x.board === "staked", earns: 0 });
    const week = b ? { week: b.week, start: b.start, rows: b.rows.map(row) } : null;
    const allTime = at ? { rows: (at.rows || []).map((x, i) => ({ a: x.a, pts: x.pts, weeks: x.weeks, boardPlace: i + 1, ranked: true })) } : null;
    return { week: b && !b.final ? week : null, lastWeek: b && b.final ? week : null, allTime };
  }
  function renderLeague() {
    if (!window.KBoard || !$("ou-board")) return;
    if (!lb) lb = window.KBoard.create($("ou-board"), {
      label: "Over Under leaderboard", hide: ["today"], columns: [{ key: "pts", label: "Points", d: 0 }],
      summary: (r) => `${r.pts} pts`, scored: (r) => r.pts > 0, name: nameOf,
      unranked: "The Staked board is for wallets with at least 1 VHP staked in Over Under that week.",
      free: { show: 6, prize: "The Free play board pays no VHP prize for now." },
    });
    lb.set(boardData()); lb.setMe(me() || "");
  }

  // ── start ──
  $("ou-send").addEventListener("click", send);
  (async () => {
    try { await boot(); await Promise.all([loadGames(), loadBoards()]); say(picks ? "" : "Over Under isn't live yet: its Picks game hasn't been added. You can read the rules below."); }
    catch (e) { say("Couldn't load the game files. Try again in a moment."); }
    await refreshMine();
    // every minute: the clock moves (locks, new games); a new game's file is fetched when it opens
    setInterval(async () => { if (sending) return; const before = [...games.keys()].join(); await loadGames(); if ([...games.keys()].join() !== before) await refreshMine(); else render(); }, 60000);
  })();
}
