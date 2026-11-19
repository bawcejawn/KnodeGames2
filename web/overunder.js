/* Over/Under: the game page (Koinos MAINNET, Picks game 16), on the Shared Game Kit's files.
 *
 * Reads (games-data branch, overunder/ folder, written by the kit's recorder and checked by its publish job):
 *   inputs/W<w>.json   the week's write-once roster with each producer's line (published Friday 00:00 UTC before the week;
 *                      FC-9, D-284: before any pick for the week can open)
 *   board.json         the Staked / Free play board of the latest week
 *   alltime.json       every final week, added up
 * and your picks from the Picks contract. It sends one number a day (Picks game 16, round = the UTC day number): two bits a
 * row in roster order, 01 Over, 10 Under, 00 blank. The rules and the number's layout are games/overunder/math.js, the same
 * file the recorder uses. Everything on screen is built with textContent: no HTML strings. */
import * as F from "./games/overunder/math.js";

const $ = (id) => document.getElementById(id);
if (typeof document !== "undefined" && $("ou-rows")) start();

function start() {
  "use strict";
  const lib = window.koilib || window.koinos || window;
  const ROOT = new URL("./", location.href);
  const DATA = "https://raw.githubusercontent.com/bawcejawn/KnodeGames/games-data/overunder/";
  const RPC = ["https://koinos.armana.io", "https://api.koinosblocks.com"];
  const DAY = F.DAY, LEAD = F.LEAD, AHEAD = F.AHEAD, GAME = F.GAME;
  let GENESIS = window.KWeeks ? window.KWeeks.GENESIS_MS : 1792368000000, WEEK = 7 * DAY;
  const NAMES = { "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr": "Knode pool", "1FKTpXBhhHEbu5vVchM8UsVbAvPArJsRmR": "Knode Swap" };

  // ── small helpers ──
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); } for (const c of kids) if (c != null) e.append(c); return e; };
  const isAddr = F.isAddr;
  const nameOf = (a) => (!isAddr(a) ? "–" : window.KNames && typeof window.KNames.of === "function" ? window.KNames.of(a) : NAMES[a] || a.slice(0, 5) + "…" + a.slice(-4));
  const WL = (w) => (window.KWeeks ? window.KWeeks.label(w) : `Week ${w - 3}`);
  const dur = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`; };
  const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const when = (t) => new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  const dayLabel = (d) => new Date(d * DAY).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const lineText = (line) => `${Math.floor(line / 2)}.5`;
  const say = (t) => { $("status").textContent = t; $("status").hidden = !t; };
  async function fetchJson(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

  // ── the clock ──
  const weekStart = (w) => GENESIS + w * WEEK;
  const weekOf = (t) => Math.floor((t - GENESIS) / WEEK);
  const dayNo = (t) => Math.floor(t / DAY);
  const lockOf = (d) => d * DAY - LEAD;
  const opensOf = (d) => d * DAY - AHEAD;

  // ── network and wallet ──
  let provider = null, W = null, picks = null, PICKS = null;
  const me = () => (W && W.address) || null;
  async function setupNet() {
    let dep = null, gd = null;
    try { dep = await fetchJson(new URL("picks-data/deployment.json", ROOT)); } catch { /* not live yet */ }
    try { gd = await fetchJson(new URL("game-data/deployment.json", ROOT)); } catch { /* defaults */ }
    if (gd && Number(gd.genesisTime) > 0) GENESIS = Number(gd.genesisTime);
    if (gd && Number(gd.weekLength) > 0) WEEK = Number(gd.weekLength);
    PICKS = dep && isAddr(dep.contract) ? dep.contract : null;
    provider = new lib.Provider(RPC);
    W = window.KWallet || null;
    if (window.KStake && typeof window.KStake.mount === "function" && $("ou-stake")) window.KStake.mount($("ou-stake"), { game: GAME });
    if (window.KStake && typeof window.KStake.badge === "function" && $("stake-badge")) window.KStake.badge($("stake-badge"), { game: GAME });
    if (W && W.init && PICKS) W.init({ provider, chainId: gd && gd.chainId, payer: gd && gd.payer, sponsor: gd && gd.sponsor, onChange: () => refresh() });
    if (PICKS) {
      const abi = await fetchJson(new URL("contracts/picks/abi/picks.koilib.json", ROOT));
      picks = new lib.Contract({ id: PICKS, abi, provider });
    }
  }

  // ── the kit's files ──
  const files = { board: null, alltime: null, rosters: new Map() };
  async function loadFiles() {
    const wNow = weekOf(Date.now());
    const get = async (name) => { try { return await fetchJson(DATA + name); } catch { return null; } };
    const [board, alltime] = await Promise.all([get("board.json"), get("alltime.json")]);
    files.board = board && board.v === 1 ? board : null;
    files.alltime = alltime && alltime.v === 1 ? alltime : null;
    await Promise.all([wNow, wNow + 1].map(async (w) => {
      const inp = await get(`inputs/W${w}.json`);
      let roster = null;
      // The roster is used only if it is exactly the published one: checkRoster refuses anything else (D-284).
      try { if (inp && inp.week === w && inp.data && inp.data.start === weekStart(w)) roster = F.checkRoster(inp.data.roster, weekStart(w)); } catch (e) { say(`The roster for ${WL(w)} did not pass its check (${String((e && e.message) || e).slice(0, 100)}). Picks for that week are switched off on this page.`); }
      if (roster) files.rosters.set(w, roster); else files.rosters.delete(w);
    }));
  }
  const rosterOf = (d) => files.rosters.get(weekOf(d * DAY)) || null;

  // ── your picks (Picks contract) ──
  /** { number, changes } of your saved pick for a day, or null. */
  async function getPick(d) {
    const who = me();
    if (!who || !picks) return null;
    try {
      const x = await picks.functions.get_pick({ game: GAME, round: String(d), player: who });
      const p = x.result && x.result.pick;
      return p && p.number != null && String(p.number) !== "0" ? { number: String(p.number), changes: Number(p.changes || 0) } : null;
    } catch { return null; }
  }
  /** The days you can pick for now: opened (2 days ahead), not locked (a minute to spare), in a week whose roster is out. */
  function openDays(now = Date.now()) {
    const out = [];
    for (let d = dayNo(now); d <= dayNo(now) + 3; d++) if (now >= opensOf(d) && lockOf(d) - now >= 60000 && rosterOf(d)) out.push(d);
    return out;
  }
  const nextDay = (now = Date.now()) => { let d = dayNo(now); while (lockOf(d) - now < 60000) d++; return d; };

  let st = { open: [], sel: null, saved: new Map(), now: 0 };           // saved: day → { number, changes }
  let draft = new Map();                                                  // day → { address: "over" | "under" }
  let sending = false, armed = false;
  const draftOf = (d) => draft.get(d) || {};
  const savedChoices = (d) => { const s = st.saved.get(d), r = rosterOf(d); return s && r ? F.decodePick(r, s.number) : {}; };
  const sameChoices = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
  const dirty = (d) => draft.has(d) && !sameChoices(draftOf(d), savedChoices(d));

  async function refresh() {
    const now = Date.now(), open = openDays(now);
    st = { open, sel: open.includes(st.sel) ? st.sel : open[0] ?? null, saved: new Map(), now };
    if (me() && picks) await Promise.all(open.map(async (d) => { const p = await getPick(d); if (p) st.saved.set(d, p); }));
    for (const d of open) if (!draft.has(d)) draft.set(d, { ...savedChoices(d) });
    render();
  }

  // ── the sheet ──
  function setRow(a, c) {
    const d = st.sel, cur = { ...draftOf(d) };
    if (cur[a] === c) delete cur[a]; else cur[a] = c;
    draft.set(d, cur); armed = false; render();
  }
  function render() { renderPlan(); renderSheet(); renderLeague(); }
  function renderPlan() {
    const box = $("ou-plan");
    box.hidden = st.open.length < 2;
    box.replaceChildren(el("span", { class: "lbl", text: "Day:" }), ...st.open.map((d) => el("button", { type: "button", "aria-pressed": String(d === st.sel),
      onclick: () => { st.sel = d; armed = false; render(); } }, el("span", { class: "d", text: dayLabel(d) }), el("span", { class: "s", text: st.saved.has(d) ? "picks sent" : dirty(d) ? "not sent" : "no picks" }))));
  }
  function waitText() {
    const w = weekOf(nextDay() * DAY), t = weekStart(w) - 3 * DAY;
    return Date.now() < t ? `The roster and lines for ${WL(w)} come out ${when(t)}. Picks open 2 days before each day.` : "Waiting for the recorder to publish the roster and lines (it checks every hour).";
  }
  function renderSheet() {
    const d = st.sel, r = d == null ? null : rosterOf(d), tbody = $("ou-rows");
    $("ou-send").hidden = !r;
    if (!r) {
      $("ou-for").textContent = "Over/Under";
      $("ou-lock").replaceChildren();
      tbody.replaceChildren(el("tr", {}, el("td", { colspan: "3", class: "ou-none", text: waitText() })));
      $("ou-check").textContent = ""; $("ou-saved").textContent = "";
      return;
    }
    const lock = lockOf(d), cur = draftOf(d), saved = st.saved.get(d), changesLeft = F.MAX_CHANGES - (saved ? saved.changes : 0);
    $("ou-for").textContent = `Picks for ${dayLabel(d)} (UTC day)`;
    $("ou-lock").replaceChildren(el("span", { text: "Locks in " }), el("b", { text: dur(lock - Date.now()) }), el("span", { text: ` at ${hm(lock)}, the day runs ${hm(d * DAY)} to ${hm(d * DAY + DAY)}` }));
    tbody.replaceChildren(...r.rows.map((x) => el("tr", { class: cur[x.a] ? "on" : null },
      el("td", {}, el("span", { class: "ou-name", text: nameOf(x.a) })),
      el("td", { class: "num", text: lineText(x.line) }),
      el("td", { class: "ou-btns" },
        el("button", { type: "button", class: "ou-o", "aria-pressed": String(cur[x.a] === "over"), "aria-label": `Over ${lineText(x.line)} for ${nameOf(x.a)}`, onclick: () => setRow(x.a, "over") }, "Over"),
        el("button", { type: "button", class: "ou-u", "aria-pressed": String(cur[x.a] === "under"), "aria-label": `Under ${lineText(x.line)} for ${nameOf(x.a)}`, onclick: () => setRow(x.a, "under") }, "Under")))));
    const n = Object.keys(cur).length, isChange = !!saved && dirty(d);
    let msg = "", ok = false;
    if (!me()) msg = "Connect a wallet to send picks.";
    else if (!dirty(d)) msg = saved ? "These are your saved picks." : "Tap Over or Under on any rows. A row you leave blank is no pick.";
    else if (saved && changesLeft <= 0) msg = "You have used both changes for this day. Your saved picks stand.";
    else if (n === 0 && !saved) msg = "Choose at least one row.";
    else { ok = true; msg = isChange ? `This is change ${saved.changes + 1} of ${F.MAX_CHANGES} for this day, paid with your own Mana (not free). ${n} row${n === 1 ? "" : "s"}.` : `${n} row${n === 1 ? "" : "s"}, sent in one approval. The first send is free (the Knode Mana sponsor pays).`; }
    $("ou-check").textContent = msg; $("ou-check").className = "ou-check" + (ok ? " ok" : "");
    $("ou-send").disabled = sending || !picks || !ok;
    $("ou-send").textContent = !me() ? "Connect to send" : armed ? "Tap again to confirm the change" : isChange ? "Change my picks" : "Send my picks";
    $("ou-reset").hidden = !dirty(d);
    $("ou-saved").textContent = saved ? `Saved on chain for this day: ${Object.keys(savedChoices(d)).length} rows, ${changesLeft} change${changesLeft === 1 ? "" : "s"} left.` : "";
    if (r.dropped.length) $("ou-dropped").textContent = `${r.dropped.length} producer${r.dropped.length === 1 ? "" : "s"} above the 32-row limit are not offered this week: ${r.dropped.map(nameOf).join(", ")}.`;
    $("ou-dropped").hidden = !r.dropped.length;
    $("ou-roster").textContent = `Roster id ${r.id}, from the ruler card of ${r.cardRound}. Published once for ${WL(weekOf(d * DAY))}; it never changes.`;
  }
  const why = (e) => {
    const m = String((e && e.message) || e);
    return /locked/i.test(m) ? "That day has locked: picks close 5 minutes before it starts."
      : /not open yet/i.test(m) ? "That day isn't open yet."
      : /used up/i.test(m) ? "Today's picks are used up. More after 00:00 UTC."
      : /already your pick/i.test(m) ? "That is already your pick."
      : /closed|switched off/i.test(m) ? "This game is switched off right now."
      : /reject|denied|cancel/i.test(m) ? "Cancelled in your wallet. Nothing was sent."
      : `Not sent: ${m.slice(0, 200)}`;
  };
  async function confirmPick(d, number) {
    for (let t = 0; t < 10; t++) { const p = await getPick(d); if (p && p.number === number) return true; await new Promise((r) => setTimeout(r, 3000)); }
    return false;
  }
  async function send() {
    if (!me()) { if (W && W.connect) W.connect(); else say("Connect a wallet first."); return; }
    const d = st.sel, r = rosterOf(d);
    if (d == null || !r || sending || !picks || !dirty(d)) return;
    const saved = st.saved.get(d), isChange = !!saved;
    if (isChange && !armed) { armed = true; render(); return; }               // a change costs your own Mana and one of 2: ask twice
    if (isChange && W.kind === "guest") { $("ou-check").textContent = "Connect a wallet to change a pick."; armed = false; return; }
    if (lockOf(d) - Date.now() < 60000) { say("That day locks in under a minute. Try the next one."); await refresh(); return; }
    const number = F.encodePick(r, draftOf(d));
    sending = true; armed = false; render();
    say(W.kind === "guest" ? "Saving your picks…" : `Confirm in ${W.label ? W.label() : "your wallet"}: ${dayLabel(d)}`);
    try {
      const { operation } = await picks.functions.pick({ player: me(), game: GAME, round: String(d), producers: [], number }, { onlyOperation: true });
      const id = await W.send(`Over/Under picks for ${dayLabel(d)}`, [operation], isChange ? { ownMana: true } : {});
      say("Sent. Checking the chain…");
      const ok = await confirmPick(d, number);
      say(ok ? `Saved. You can change it until ${when(lockOf(d))} (${F.MAX_CHANGES} changes).` : `Sent${id ? ` (${String(id).slice(0, 12)}…)` : ""}, not seen yet. It usually shows within a minute.`);
    } catch (e) { say(why(e)); }
    finally { sending = false; await refresh(); }
  }

  // ── the league (board.js, D-081) ──
  let lb = null;
  function boardData() {
    const b = files.board && files.board.lastWeek, at = files.alltime;
    const row = (x) => ({ a: x.a, pts: x.pts, boardPlace: x.place, ranked: x.board === "staked", earns: 0 });
    const week = b ? { week: b.week, start: b.start, rows: b.rows.map(row) } : null;
    const allTime = at ? { rows: (at.rows || []).map((x, i) => ({ a: x.a, pts: x.pts, weeks: x.weeks, boardPlace: i + 1, ranked: true })) } : null;
    return { week: b && !b.final ? week : null, lastWeek: b && b.final ? week : null, allTime };
  }
  function renderLeague() {
    if (!window.KBoard || !$("ou-board")) return;
    if (!lb) {
      lb = window.KBoard.create($("ou-board"), {
        label: "Over/Under leaderboard", hide: ["today"],
        columns: [{ key: "pts", label: "Points", d: 0 }],
        summary: (r) => `${r.pts} pts`, scored: (r) => r.pts > 0, name: nameOf,
        unranked: "The Staked board is for wallets with at least 1 VHP staked in Over/Under that week.",
        free: { show: 6, prize: "Free play prizes: 2 VHP for first, 1 VHP for second." },
      });
    }
    lb.set(boardData()); lb.setMe(me() || "");
  }

  // ── start ──
  $("ou-send").addEventListener("click", send);
  $("ou-reset").addEventListener("click", () => { const d = st.sel; draft.set(d, { ...savedChoices(d) }); armed = false; render(); });
  (async () => {
    try { await setupNet(); await loadFiles(); await refresh(); say(picks ? "" : "Over/Under isn't live yet: its Picks game hasn't been added. You can read the rules below."); }
    catch (e) { say(`Couldn't load: ${String((e && e.message) || e).slice(0, 120)}`); }
    setInterval(() => { if (!sending) render(); }, 30000);
  })();
}
