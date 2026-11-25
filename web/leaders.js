/* The Leaderboards page (index.html#leaderboard): one tab per game, each with its own players and points.
   "Daily Questions" is the question game's own table (drawn by app.js from the chain). Every other live game in
   games.json that names a `board` gets the shared Knode Games leaderboard (board.js) fed with that game's recorder
   file (its board.json on the race-data or games-data branch). A new game shows up here by adding `board` to its
   games.json entry, plus its data branch in index.html's connect-src (race-data is there; games-data is added by
   the first game that publishes to it).
   Links: index.html#leaderboard (questions), index.html#leaderboard/race, …/blockx and so on.
   Read-only: no transaction, no storage, nothing built from HTML. */
(() => {
  "use strict";
  const host = document.getElementById("lb-games");
  if (!host || !window.KBoard) return;
  const W = window.KWallet;
  const RAW = "https://raw.githubusercontent.com/bawcejawn/KnodeGames2/";
  const EXPLORER = "https://koinosscan.com/address/";
  const $ = (id) => document.getElementById(id);
  const fmt = (x, d = 0) => (typeof x === "number" && isFinite(x) ? x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
  const short = (a) => (typeof a === "string" && a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : String(a || ""));
  const me = () => (W && W.address) || "";

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    for (const c of kids) if (c) e.append(c);
    return e;
  }
  async function fetchJson(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

  /** A game's `board` from games.json, checked: a recorder file on this repo's data branches, plain column keys and labels. */
  function boardOf(g) {
    const b = g && g.board;
    if (!b || typeof b !== "object") return null;
    if (typeof b.data !== "string" || !/^(race-data|games-data)\/([a-z0-9-]{1,24}\/)?board\.json$/.test(b.data)) return null;
    const cols = Array.isArray(b.columns) ? b.columns.filter((c) => c && /^[a-z]{1,12}$/.test(c.key) && typeof c.label === "string" && c.label.length <= 20).slice(0, 6) : [];
    if (!cols.length) return null;
    return {
      url: RAW + b.data,
      columns: cols.map((c) => ({ key: c.key, label: c.label, wide: c.wide === true })),
      unit: typeof b.unit === "string" && b.unit.length <= 12 ? b.unit : "pts",
      // `soon`: a line shown instead of a load error while the game's data file doesn't exist yet (remove it once the game is live).
      soon: typeof b.soon === "string" && b.soon.length <= 100 ? b.soon : "",
      unranked: typeof b.unranked === "string" && b.unranked.length <= 160 ? b.unranked : "",
      // `scale`: the recorder stores the points column in whole hundredths (Block X: pts 179 = 1.79 points). Only 100 is
      // allowed; the points column (the first) is divided by it and shown with 2 decimals. Count columns stay as they are.
      scale: b.scale === 100 ? 100 : 1,
      // Free play: wallets without VHP or a stake get their own board, top `show` listed (3 to 10), the rest private.
      // The board names (Staked / Free play) are fixed in board.js for every game; games.json can't change them.
      free: b.free && typeof b.free === "object" ? {
        show: Number.isInteger(b.free.show) && b.free.show >= 3 && b.free.show <= 10 ? b.free.show : 6,
        prize: typeof b.free.prize === "string" && b.free.prize.length <= 160 ? b.free.prize : "",
        // `minDays`: a free medal this week needs picks on at least this many days (Block X: 3), as in the game's prize rule.
        minDays: Number.isInteger(b.free.minDays) && b.free.minDays >= 1 && b.free.minDays <= 7 ? b.free.minDays : 0,
        // `byPlace`: medals by the row's own-board place (boardPlace, ties share it) as the game's prize rule ranks
        // them, instead of points/correct/lastCorrect (Block Golf: points, lost balls, under par, best hole).
        byPlace: b.free.byPlace === true,
      } : null,
      main: cols[0].key,
      // `earns`: the recorder marks who earns on each row (1 / 2 the free prize's 1st / 2nd, 3 a share of the staked
      // bucket; leaderboard standard §4), so the medals follow the game's own rules and tie-breaks exactly.
      earns: b.earns === true,
      // `hide`: period tabs the game doesn't have (e.g. the Bracket has no "Today").
      hide: Array.isArray(b.hide) ? b.hide.filter((m) => m === "today" || m === "last" || m === "all") : [],
    };
  }

  /** Free-play medals (1st / 2nd), the same rule as the game's own page (blockx.js freeWinners, audit BX-14):
      a final last week → the recorder's frozen prize list (lastWeek.prizes); otherwise the rows as they stand now,
      counting only rows with more than 0 points (and picks on minDays+ days when set); ties share a place. */
  function freeWinnersFor(cfg) {
    return (part, rows, weekly) => {
      const m = new Map();
      if (!weekly) return m;
      if (part && part.final === true && Array.isArray(part.prizes)) {
        for (const p of part.prizes) if (p && typeof p.player === "string") m.set(p.player, Math.min(2, Math.max(1, Number(p.place) || 2)));
        return m;
      }
      // Days played: `days` (Block X), or `events` (Last Node Standing: one event a day).
      const ok = rows.filter((r) => (Number(r[cfg.main]) || 0) > 0 && (!cfg.free.minDays || (Number(r.days ?? r.events) || 0) >= cfg.free.minDays));
      if (cfg.free.byPlace) {
        // Golf's rule (golf-math.js freeMedals, the vault file's first/second): 1st = the first place's wallets; 2nd
        // only when 1st is a single wallet; a place shared by more than 10 is left empty.
        const groups = [];
        for (const r of ok.filter((x) => Number.isInteger(x.boardPlace))) { const g = groups[groups.length - 1]; if (g && g[0].boardPlace === r.boardPlace) g.push(r); else groups.push([r]); }
        const first = groups[0] || [], second = first.length === 1 ? groups[1] || [] : [];
        if (first.length <= 10) for (const r of first) m.set(r.a, 1);
        if (second.length <= 10) for (const r of second) m.set(r.a, 2);
        return m;
      }
      let place = 0;
      ok.forEach((r, i) => {
        const p = ok[i - 1];
        if (!p || p[cfg.main] !== r[cfg.main] || p.correct !== r.correct || p.lastCorrect !== r.lastCorrect) place = i + 1;
        if (place <= 2) m.set(r.a, place);
      });
      return m;
    };
  }
  /** Board data with the points column divided by `scale` (the board then shows it with 2 decimals). */
  function scaled(d, cfg) {
    if (cfg.scale === 1 || !d) return d;
    const fix = (part) => (part && Array.isArray(part.rows) ? { ...part, rows: part.rows.map((r) => (r && typeof r === "object" ? { ...r, [cfg.main]: (Number(r[cfg.main]) || 0) / cfg.scale } : r)) } : part);
    return { ...d, today: fix(d.today), week: fix(d.week), lastWeek: fix(d.lastWeek), allTime: fix(d.allTime) };
  }

  let games = [{ id: "questions", name: "Daily Questions", href: "#play" }];
  let current = "questions";
  const boards = new Map();   // id → { lb, data, loaded }
  const panel = $("lb-game"), qPart = $("lb-q");

  function buttons() {
    host.replaceChildren(...games.map((g) => {
      // Icon from games.json (D-748), drawn as text and hidden from screen readers; the name stays the button label.
      const b = el("button", { type: "button", "aria-pressed": String(g.id === current), class: g.id !== "questions" && !g.cfg ? "soon" : null },
        g.icon ? el("span", { class: "mi", "aria-hidden": "true", text: g.icon }) : null, g.name);
      b.addEventListener("click", () => { if (location.hash !== `#leaderboard/${g.id}`) location.hash = g.id === "questions" ? "#leaderboard" : `#leaderboard/${g.id}`; else show(g.id); });
      return b;
    }));
  }

  /** The three tabs (Questions | Leaderboard | Results) follow the chosen game: "Play" opens that game's page. */
  function tabs(g) {
    const nav = document.querySelector && document.querySelector("#view-leaderboard .qtabs"), first = nav && nav.querySelector('a[data-view="play"]');
    if (!first) return;
    const q = g.id === "questions";
    nav.setAttribute("aria-label", g.name);
    first.textContent = q ? "Questions" : "Play";
    first.setAttribute("href", q || !/^[a-z0-9-]+\.html(#[a-z0-9-]+)?$/.test(g.href || "") ? "#play" : g.href);
  }

  async function show(id) {
    if (!games.some((g) => g.id === id)) id = "questions";
    current = id;
    buttons();
    const q = id === "questions";
    qPart.hidden = !q; panel.hidden = q;
    const gg = games.find((x) => x.id === id);
    tabs(gg);
    $("lb-title").textContent = q ? "Leaderboard · Daily Questions" : `Leaderboard · ${gg.name}`;
    if (q) return;
    const g = gg, cfg = g.cfg;
    if (!cfg) {
      // No board for this game yet: say so and point to its page, instead of hiding it.
      panel.replaceChildren(el("div", { class: "empty" },
        el("p", { text: `${g.name}'s board opens soon. Until then, its points are on its own page.` }),
        /^[a-z0-9-]+\.html(#[a-z0-9-]+)?$/.test(g.href || "") ? el("p", {}, el("a", { class: "btn btn-primary", href: g.href, text: `Open ${g.name}` })) : null));
      return;
    }
    let b = boards.get(id);
    if (!b) {
      const box = el("div");
      const note = el("p", { class: "muted lb-game-note", text: "Points count when each result is final. Each game has its own players and points." });
      b = {
        box, note, data: null,
        lb: window.KBoard.create(box, {
          label: `${g.name} leaderboard`, columns: cfg.columns.map((c, i) => (i === 0 && cfg.scale === 100 ? { ...c, d: 2 } : c)), name: (a) => (window.KNames ? window.KNames.of(a) : short(a)), link: (a) => EXPLORER + a,
          scored: (r) => (r[cfg.main] ?? 0) > 0,
          summary: (r) => `${fmt(r[cfg.main] ?? 0, cfg.scale === 100 ? 2 : 0)} ${cfg.columns[0].label.toLowerCase()}`,
          me: (r, place) => `${place ? `You: #${place} with` : "Your score (only you see this):"} ${fmt(r[cfg.main] ?? 0, cfg.scale === 100 ? 2 : 0)} ${cfg.columns[0].label.toLowerCase()}.`,
          unranked: cfg.unranked,
          free: cfg.free ? { show: cfg.free.show, prize: cfg.free.prize } : null,
          freeWinners: cfg.free ? (cfg.earns ? (part, free, weekly) => new Map(weekly ? free.filter((r) => r.earns === 1 || r.earns === 2).map((r) => [r.a, r.earns]) : []) : freeWinnersFor(cfg)) : undefined,
          earned: cfg.earns ? (r, weekly) => weekly && r.earns === 3 : undefined,
          hide: cfg.hide,
        }),
      };
      boards.set(id, b);
    }
    panel.replaceChildren(b.note, b.box);
    b.lb.setMe(me());
    try { const d = await fetchJson(cfg.url); if (d && d.v === 1) { b.data = d; b.lb.set(scaled(d, cfg)); } }
    catch { if (!b.data) b.note.textContent = cfg.soon || "Couldn't load this leaderboard right now. Trying again when you come back to it."; }
  }

  function route() {
    const [view, sub] = (location.hash || "").slice(1).split("/");
    if (view === "leaderboard") show(sub || "questions");
  }

  /** A game's icon from games.json (D-748): a short emoji, checked; "" when missing or not an emoji. */
  const iconOf = (g) => (g && typeof g.icon === "string" && g.icon.length >= 1 && g.icon.length <= 8 && !/[<>&"'A-Za-z0-9\s]/.test(g.icon) ? g.icon : "");
  async function load() {
    try {
      const list = (await fetchJson("games.json")).games;
      // Every live or preview game, in the games list's order; a game with no board yet is greyed, not hidden.
      const extra = (Array.isArray(list) ? list : []).filter((g) => g && (g.status === "live" || g.status === "preview") && g.id !== "questions"
        && typeof g.id === "string" && /^[a-z0-9-]{1,24}$/.test(g.id) && typeof g.name === "string" && g.name.length <= 40)
        .map((g) => ({ id: g.id, name: g.name, icon: iconOf(g), href: typeof g.href === "string" ? g.href : "", cfg: g.status === "live" ? boardOf(g) : null }));
      games = [{ ...games[0], icon: iconOf((Array.isArray(list) ? list : []).find((g) => g && g.id === "questions")) }, ...extra];
    } catch { /* only the question game */ }
    buttons();
    route();
  }

  window.addEventListener("hashchange", route);
  if (W && W.subscribe) W.subscribe(() => { for (const b of boards.values()) b.lb.setMe(me()); });
  setInterval(() => { const cur = games.find((g) => g.id === current); if (!document.hidden && cur && cur.cfg && current !== "questions" && !panel.hidden) show(current); }, 300000);
  load();
})();
