/* Knode Games visit counting (owner, 4 Nov: PostHog, cookieless). Counts page views and visits only:
   - cookieless_mode "always": nothing is stored in the visitor's browser (no cookies, no local storage), so no banner;
     PostHog counts a visitor from a daily-changing server-side hash, so daily counts are accurate and weekly / monthly
     "unique" counts run high (a returning visitor counts again each day).
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
})();
