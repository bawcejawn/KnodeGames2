/* Knode Games visit counting (owner, 4 Nov: PostHog, cookieless). Counts page views, visits and a few plain counts:
   - cookieless_mode "always": PostHog stores nothing in the visitor's browser (no cookies, no local storage), so no banner;
     PostHog counts a visitor from a daily-changing server-side hash, so daily counts are accurate and weekly / monthly
     "unique" counts run high (a returning visitor counts again each day).
   - Growth counts (M-610, owner OK M-638): this file keeps three values in the visitor's own browser, never sent with
     anything that identifies them: the date of the first visit, the date of the last visit and "has picked" (plus the
     start time of this visit in the tab's sessionStorage). They let us count "first pick sent" and "came back the next
     day" without any ID. Seven counts only (COUNTS below), each with a few fixed-value properties; no address, pick,
     answer, stake, amount or transaction id. The page events come from wallet.js (kg:sent, kg:wallet, after the action
     went through) and from share / remind buttons (kg:share, kg:remind).
   - no autocapture, no session recordings, heatmaps, surveys, experiments or extra downloads: only "page viewed" and
     "page left", with the page's address (any wallet in it blanked, audit AB-063). Wallets, answers, stakes and keys are
     never sent.
   - the library is our own pinned copy (vendor/posthog-1.438.13.js, sha256 checked by the tests), never loaded from
     PostHog, so no outside code runs on pages where wallets sign; only the counts go to us.i.posthog.com.
   - only knodegames.com counts: local copies, previews and tests send nothing. */
(() => {
  "use strict";
  const ph = window.posthog;
  if (!ph || typeof ph.init !== "function") return;
  if (!/(^|\.)knodegames\.com$/.test(location.hostname)) return;
  // Audit AB-063: some page addresses carry a wallet (node.html?a=…, mana.html?addr=…, bracket.html?follow=…), and
  // PostHog sends the page address, the referrer and the first page with each view. Every Koinos-address-shaped run in
  // any text the event carries becomes "[wallet]" before it leaves the browser, so no wallet reaches PostHog.
  const ADDR = /1[1-9A-HJ-NP-Za-km-z]{25,34}/g;
  const clean = (v, depth) => {
    if (typeof v === "string") return v.replace(ADDR, "[wallet]");
    if (!v || typeof v !== "object" || depth > 4) return v;
    if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
    const out = {};
    for (const k of Object.keys(v)) out[k] = clean(v[k], depth + 1);
    return out;
  };
  const scrub = (event) => {
    if (!event || typeof event !== "object") return event;
    for (const k of ["properties", "$set", "$set_once"]) if (event[k]) event[k] = clean(event[k], 0);
    return event;
  };
  ph.init("phc_mheGAgU6GBELm26daB9BuW7tuYeQT9fNsvV3MJQLQpFZ", {   // the project's public key (meant to be in pages)
    api_host: "https://us.i.posthog.com",
    cookieless_mode: "always",
    person_profiles: "identified_only",   // no one is ever identified
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_performance: false,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    before_send: scrub,
  });

  // ── Growth counts (M-610 / M-653; MEASUREMENT-PLAN.md) ──
  const COUNTS = {
    first_visit: ["page"],
    first_pick_sent: ["game", "wallet", "secs"],
    pick_sent: ["game", "wallet", "n"],
    came_back: ["day", "picked_before"],
    share_tapped: ["game"],
    wallet_connected: ["wallet", "new_guest"],
    reminder_set: ["game", "reminder"],
  };
  const KINDS = ["guest", "kondor", "vault"];
  const count = (name, props) => {
    try {
      const keys = COUNTS[name];
      if (!keys) return;
      const out = {};
      for (const k of keys) if (props && props[k] !== undefined) out[k] = props[k];
      ph.capture(name, out);
    } catch { /* counting never breaks a page */ }
  };
  const get = (st, k) => { try { return st.getItem(k); } catch { return null; } };
  const put = (st, k, v) => { try { st.setItem(k, v); } catch { /* private mode or full: count less, never fail */ } };
  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const daysBetween = (a, b) => {
    const t = (v) => { const [y, m, d] = v.split("-").map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / 86400000);
  };
  const dayBucket = (n) => (n <= 1 ? "1" : n <= 6 ? "2-6" : n <= 13 ? "7-13" : "14+");
  const game = () => {
    const f = (location.pathname.split("/").pop() || "").replace(/\.html$/, "");
    if (!f || f === "index") return "questions";
    return /^[a-z0-9-]{1,24}$/.test(f) ? f : "other";
  };
  const kind = (v) => (KINDS.includes(v) ? v : "other");
  let LS = null, SS = null;
  try { LS = window.localStorage; SS = window.sessionStorage; } catch { /* storage blocked: only page views count */ }

  const today = dayOf(new Date());
  if (LS) {
    const first = get(LS, "kg-first-day"), last = get(LS, "kg-last-day");
    if (!isDay(first)) {
      put(LS, "kg-first-day", today); put(LS, "kg-last-day", today);
      count("first_visit", { page: game() === "questions" ? "home" : game() });   // Home lands as "home"; its answers count as "questions"
    } else if (today !== first && today !== last) {
      const n = daysBetween(first, today);
      if (n >= 1) count("came_back", { day: dayBucket(n), picked_before: get(LS, "kg-picked") === "1" });
      put(LS, "kg-last-day", today);
    }
  }
  if (SS && !/^\d+$/.test(get(SS, "kg-visit-start") || "")) put(SS, "kg-visit-start", String(Date.now()));

  const secsBucket = () => {
    const first = LS && get(LS, "kg-first-day");
    if (isDay(first) && first !== today) return "later_day";
    const start = Number(SS && get(SS, "kg-visit-start"));
    if (!start) return "120+";
    const s = (Date.now() - start) / 1000;
    return s < 30 ? "<30" : s < 60 ? "30-60" : s < 120 ? "60-120" : "120+";
  };
  const on = (type, f) => { try { document.addEventListener(type, (e) => { try { f((e && e.detail) || {}); } catch { /* never breaks a page */ } }); } catch { /* no document */ } };
  on("kg:sent", (d) => {
    const n = Math.max(1, Math.min(10, Math.floor(Number(d.n)) || 1)), wallet = kind(d.wallet), g = game();
    if (LS && get(LS, "kg-picked") !== "1") {
      put(LS, "kg-picked", "1");
      count("first_pick_sent", { game: g, wallet, secs: secsBucket() });
    }
    count("pick_sent", { game: g, wallet, n });
  });
  on("kg:wallet", (d) => count("wallet_connected", { wallet: kind(d.wallet), new_guest: d.new_guest === true }));
  on("kg:share", () => count("share_tapped", { game: game() }));
  on("kg:remind", (d) => { if (d.reminder === "result" || d.reminder === "daily") count("reminder_set", { game: game(), reminder: d.reminder }); });
})();
