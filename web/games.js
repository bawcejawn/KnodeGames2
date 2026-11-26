/* games.html: the All games page (UI lead PR B, D-742, D-788, D-794, owner card states Tue 24 Nov).
   One clean card per game from games.json: icon badge, name, tags from live data, one short line, the player's pick
   status (Hub's KPicked, when present), Play (and Stake for a real wallet). Leaderboards, Results, Where to stake and
   the live stats sit below, closed or as links.
   Read-only: no transaction, no storage. It reads games.json, the free-prize switches (prize-settings branch) and,
   through stake-panel.js, the vault's game list. Everything is built with textContent. */
(() => {
  "use strict";
  const M = window.KRaceMath;
  const W = window.KWallet;
  // The owner's free-prize switches (bot/free-prizes.ts), published on the prize-settings branch. Read-only.
  const PRIZE_URL = "https://raw.githubusercontent.com/bawcejawn/KnodeGames2/prize-settings/free-prizes.json";
  const $ = (id) => document.getElementById(id);

  // Card icons: the game's own emoji and tile colour from games.json ("icon", "accent"), the same as Home and the menus
  // (D-748; tests/audit/site.game-icons.test.mjs). Checked in clean(); drawn with textContent only.
  const ACCENTS = new Set(["blue", "violet", "mint", "sun", "hot"]);
  const KINDS = { free: "Free play", staked: "Staked" };
  /** Fixed card order (owner D-788: Producer Race first). Games not listed here follow in games.json order. */
  const ORDER = ["race", "blockx", "questions", "overunder", "vs", "lastnode", "bracket", "fantasy", "survivor", "golf", "combo"];
  /** Each game's id in the Knode Games vault (claude/knodegames-plan.md, game id registry). */
  const VAULT_IDS = { questions: 1, blockx: 2, survivor: 3, fantasy: 4, golf: 6, race: 7, combo: 8, bracket: 9, lastnode: 13, overunder: 16, vs: 17 };

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    for (const c of kids) if (c) e.append(c);
    return e;
  }
  const dur = (ms) => {
    if (!(ms > 0)) return "now";
    const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d ? `${d} d ${h} h` : h ? `${h} h ${m % 60} m` : `${m} m`;
  };
  async function fetchJson(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

  /** games.json, checked: only known kinds and statuses, plain text, and links to this site's own pages. */
  function clean(list) {
    const ok = (g) => g && typeof g.id === "string" && /^[a-z0-9-]{1,24}$/.test(g.id) && typeof g.name === "string" && g.name.length <= 40
      && typeof g.line === "string" && g.line.length <= 200 && Array.isArray(g.kinds) && g.kinds.length && g.kinds.every((k) => k in KINDS)
      && (g.status === "live" || g.status === "soon" || g.status === "preview") && typeof g.href === "string"
      && (g.status === "soon" ? g.href === "" : /^[a-z0-9-]+\.html(#[a-z/]+)?$/.test(g.href))
      && (g.opens === undefined || (typeof g.opens === "string" && g.opens.length <= 30))
      && (g.short === undefined || (typeof g.short === "string" && g.short.length <= 64))
      && typeof g.icon === "string" && g.icon.length >= 1 && g.icon.length <= 8 && !/[<>&"'A-Za-z0-9\s]/.test(g.icon)
      && typeof g.accent === "string" && ACCENTS.has(g.accent);
    return Array.isArray(list) ? list.filter(ok).slice(0, 40) : [];
  }
  const ordered = (games) => [...games].sort((a, b) => {
    const i = ORDER.indexOf(a.id), j = ORDER.indexOf(b.id);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  });

  // ── "Free prizes" tag: shown exactly when the owner's switch is ON for this week (same rule as bot/free-prizes.ts) ──
  let switches = null;   // the checked file, or null (unreachable or not the right shape: then no prize tag is drawn)
  function checkSwitches(s) {
    if (!s || s.v !== 1 || !s.games || typeof s.games !== "object" || Array.isArray(s.games)) return null;
    for (const list of Object.values(s.games)) if (!Array.isArray(list) || list.length > 200) return null;
    return s;
  }
  /** Is game `id`'s free prize on for vault week `w`? true / false, or null = no change counts (follow its registration). */
  function switchFor(id, w) {
    const K = window.KWeeks, list = switches && switches.games[String(id)];
    if (!K || !Array.isArray(list)) return null;
    let on = null;
    for (const c of list) {
      if (c && Number.isInteger(c.from) && typeof c.on === "boolean" && typeof c.set === "string" && c.from <= w && Date.parse(c.set) < K.GENESIS_MS + c.from * K.WEEK_MS) on = c.on;
    }
    return on;
  }
  /** "on" | "practice" | null (unknown: draw nothing rather than promise a prize). Before Week 1 nothing pays. */
  function prizeState(g, now) {
    const K = window.KWeeks, id = VAULT_IDS[g.id];
    if (!K || !id || g.status !== "live") return null;
    const w = K.of(now);
    if (w < K.FIRST) return "practice";
    if (!switches) return null;
    const on = switchFor(id, w);
    return on === null ? (g.freeReg === true ? "on" : "practice") : on ? "on" : "practice";
  }
  let gameList = [];
  function drawPrizeTags() {
    const now = Date.now();
    for (const b of document.querySelectorAll("[data-prize]")) {
      const g = gameList.find((x) => x.id === b.dataset.prize);
      b.hidden = !(g && prizeState(g, now) === "on");
    }
  }
  async function loadPrizes() {
    try { switches = checkSwitches(await fetchJson(PRIZE_URL)); } catch { switches = null; }
    drawPrizeTags();
  }

  // ── "Staked" tag: follows the vault's list_games, like the Stake page (D-768). Until the vault answers (or if it
  //    can't be read), the tag follows games.json's kinds. ──
  let stakeOpen = null;   // vault game ids that take stakes now, or null (not read)
  async function stakedTags(games) {
    const K = window.KStake;
    if (!K || !K.stakeable) return;
    let open;
    try { open = await K.stakeable(); } catch { return; }
    if (!Array.isArray(open)) return;
    stakeOpen = open;
    for (const g of games) {
      const vid = VAULT_IDS[g.id], tags = document.querySelector(`.g[data-game="${g.id}"] .g-tags`);
      if (!vid || !tags || g.status !== "live") continue;
      const tag = tags.querySelector(`[data-staked-pill="${g.id}"]`), on = open.includes(vid);
      if (tag && !on) tag.remove();
      else if (!tag && on) tags.append(el("span", { class: "pill staked", text: KINDS.staked, "data-staked-pill": g.id }));
    }
    drawButtons();
  }
  const takesStakes = (g) => VAULT_IDS[g.id] && g.status === "live" && (stakeOpen ? stakeOpen.includes(VAULT_IDS[g.id]) : g.kinds.includes("staked"));

  // ── Play / Stake buttons: a guest or a visitor with no wallet gets one "Play free" (guests never stake) ──
  function drawButtons() {
    const real = !!(W && W.address) && W.kind !== "guest";
    for (const box of document.querySelectorAll(".g-acts")) {
      const g = gameList.find((x) => x.id === box.dataset.acts);
      if (!g) continue;
      const stake = real && takesStakes(g);
      const kids = [el("a", { class: "btn g-play", href: g.href, text: g.status === "preview" ? "Take a look" : real ? "Play" : "Play free" })];
      if (stake) kids.push(el("a", { class: "btn g-stake", href: `stake.html#g${VAULT_IDS[g.id]}`, text: "Stake" }));
      box.classList.toggle("one", !stake);
      box.replaceChildren(...kids);
    }
  }

  // ── Pick status (D-742; Hub's pick-status data, window.KPicked.state(gameId) → "open" | "done" | "closed" or
  //    { state, nextOpen }). No KPicked, no answer or a guest with no state: no chip, a plain card. No counts. ──
  async function pickStatus() {
    const P = window.KPicked;
    for (const c of document.querySelectorAll(".g[data-game]")) {
      const st = c.querySelector(".g-st");
      let s = null;
      try { s = P && typeof P.state === "function" ? await P.state(c.dataset.game) : null; } catch { s = null; }
      const state = typeof s === "string" ? s : s && typeof s.state === "string" ? s.state : null;
      const nextOpen = s && typeof s === "object" && Number.isFinite(s.nextOpen) ? s.nextOpen : null;
      if (!st) continue;
      if (state !== "open" && state !== "done" && state !== "closed") { c.removeAttribute("data-pick"); st.replaceChildren(); continue; }
      c.setAttribute("data-pick", state);
      const later = nextOpen ? `Next opens in ${dur(nextOpen - Date.now())}` : "";
      if (state === "open") st.replaceChildren(el("span", { class: "chip", text: "● Open" }), el("span", { text: "Picks open now" }));
      else if (state === "done") st.replaceChildren(el("span", { class: "chip", text: "✓ Picked" }), later ? el("span", { text: later }) : null);
      else st.replaceChildren(el("span", { class: "chip", text: "Closed" }), later ? el("span", { text: later }) : null);
    }
  }

  // ── the week line ──
  function week() {
    if (!M) return;
    const now = Date.now(), w = M.weekOf(now), end = M.weekStart(w + 1);
    // The platform week number (the vault week, same as the labels everywhere else): week 5 starts Mon 23 Nov.
    $("wk-num").textContent = window.KWeeks ? window.KWeeks.short(w) : String(w);
    $("wk-left").textContent = dur(end - now);
  }

  function card(g) {
    const live = g.status === "live", preview = g.status === "preview";
    const tags = el("span", { class: "g-tags" },
      g.kinds.includes("free") ? el("span", { class: "pill free", text: KINDS.free }) : null,
      live ? el("span", { class: "pill prize", "data-prize": g.id, text: "Free prizes", hidden: "" }) : null,
      live && g.kinds.includes("staked") ? el("span", { class: "pill staked", text: KINDS.staked, "data-staked-pill": g.id }) : null,
      preview ? el("span", { class: "pill preview", text: g.opens ? `Preview · ${g.opens}` : "Preview" }) : null,
      !live && !preview ? el("span", { class: "pill soon", text: "Soon" }) : null);
    const ic = el("span", { class: `g-ic gi acc-${g.accent}`, "aria-hidden": "true", text: g.icon });
    const name = live || preview ? el("a", { class: "g-name", href: g.href, text: g.name }) : el("span", { class: "g-name", text: g.name });
    return el("div", { class: "g" + (preview ? " preview" : live ? "" : " soon"), "data-game": g.id },
      ic,
      el("span", { class: "g-hd" }, name, tags),
      el("span", { class: "g-line", text: typeof g.short === "string" ? g.short : g.line }),
      live ? el("span", { class: "g-st" }) : null,
      live || preview ? el("span", { class: "g-acts one", "data-acts": g.id }) : null);
  }

  async function main() {
    week();
    let games = [];
    try { games = clean((await fetchJson("games.json")).games); } catch { /* shown below */ }
    if (!games.length) { $("g-live").replaceChildren(el("p", { class: "note", text: "The games list couldn't load. Reload the page to try again." })); return; }
    gameList = ordered(games);
    // live games first in the fixed order, then preview (Combo) and soon at the end of the same list
    const shown = [...gameList.filter((g) => g.status === "live"), ...gameList.filter((g) => g.status === "preview"), ...gameList.filter((g) => g.status === "soon")];
    $("g-live").replaceChildren(...shown.map(card));
    drawButtons();
    stakedTags(gameList);
    loadPrizes();
    pickStatus();
    // "Where to stake": closed; the vault is read only when the player opens it (stake-panel.js).
    const fold = $("stake-fold"), stakeBox = $("stake-list");
    if (fold && stakeBox && window.KStake) {
      fold.addEventListener("toggle", () => {
        if (!fold.open || stakeBox.dataset.mounted) return;
        stakeBox.dataset.mounted = "1";
        const links = {};
        for (const g of gameList) if (g.status === "live" && VAULT_IDS[g.id]) links[VAULT_IDS[g.id]] = `stake.html#g${VAULT_IDS[g.id]}`;
        window.KStake.mountList(stakeBox, { links });
      });
    } else if (fold) fold.hidden = true;
    setInterval(() => { week(); pickStatus(); }, 60000);
    if (W && W.subscribe) W.subscribe(() => { drawButtons(); pickStatus(); });
    document.addEventListener("kg:picked", () => pickStatus());
  }
  main();
})();
