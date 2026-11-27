/* Seed Sponsor page: the rules, as plain functions the page and the tests share. No page, no chain, no wallet here.
   Owner's spec (Wed 25 Nov 2026): a Donation cannot be withdrawn and its nickname may stay; a Support deposit can be
   withdrawn any time and its nickname shows only while VHP is still in. Nicknames only, never wallet addresses; a
   Seed Sponsor may opt out, may tick "Show my amount", and the owner may hide a rude name. Every deposit and donation is at
   least the minimum (one setting in js/lib/config.js). */
(function () {
  "use strict";
  const UNIT = 100000000n;            // 1 VHP = 10^8 units
  const DEFAULT_MIN_VHP = 1000;
  const MAX_UNITS = 18446744073709551615n;   // the chain keeps amounts as u64
  // Owner (Wed 25 Nov, 8:11 PM ET): a name the owner hides shows as "Anonymous Donor" on a donation and
  // "Anonymous Sponsor" on a support deposit. These two labels are the owner's own words.
  const HIDDEN = { donation: "Anonymous Donor", support: "Anonymous Sponsor" };
  const ADDRESS_LIKE = /1[1-9A-HJ-NP-Za-km-z]{20,}/;

  const big = (x) => { try { return BigInt(x ?? 0); } catch { return null; } };
  const groups = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  /** The minimum in whole VHP. The vault's own value (units, as text) wins once it exists; otherwise the page setting;
   *  a broken or missing value falls back to 1,000, never to 0. */
  function minVhp(kg, chainUnits) {
    const c = big(chainUnits);
    if (c && c > 0n && c % UNIT === 0n) return Number(c / UNIT);
    const v = kg && kg.seedSponsor ? kg.seedSponsor.minVhp : undefined;
    return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : DEFAULT_MIN_VHP;
  }

  /** An amount typed by the Seed Sponsor: whole VHP, commas allowed only as thousands separators, at least `min`. */
  function checkAmount(text, min) {
    const s = String(text ?? "").trim();
    if (!/^(\d{1,3}(,\d{3})+|\d+)$/.test(s)) return { ok: false, reason: "Type a whole number of VHP, for example 1000." };
    const units = BigInt(s.replace(/,/g, "")) * UNIT;
    if (units > MAX_UNITS) return { ok: false, reason: "That is more VHP than a wallet can hold." };
    if (units < BigInt(min) * UNIT) return { ok: false, reason: `Each deposit or donation must be at least ${groups(min)} VHP.` };
    return { ok: true, units };
  }

  /** A nickname: 3 to 20 letters, digits, spaces, - or _ (the vault checks the same). Spaces are trimmed and squeezed.
   *  `reserved` (KNames.rules.reserved, from names.js) refuses names that look like Knode Games or Koinos (AB-062). */
  function checkNickname(text, reserved) {
    const name = String(text ?? "").trim().replace(/ {2,}/g, " ");
    if (!/^[A-Za-z0-9 _-]{3,20}$/.test(name)) return { ok: false, reason: "Use 3 to 20 letters, digits, spaces, - or _." };
    if (typeof reserved === "function" && reserved(name)) return { ok: false, reason: "That name is reserved. Please choose another." };
    return { ok: true, name };
  }

  /** Whole VHP for the page: "21,050 VHP". */
  function fmtVhp(units) {
    const u = big(units);
    return u === null ? "" : `${groups(u / UNIT)} VHP`;
  }

  /** The seed's VHP, from the vault's get_state (plus support deposits once the vault keeps them). null if unread. */
  function seedTotal(state) {
    const t = state && state.totals;
    if (!t || t.seed_vhp === undefined) return null;
    return (big(t.seed_vhp) || 0n) + (big(t.support_vhp) || 0n);
  }

  /** The public list. Each record: { kind: "donation" | "support", units, nickname, showAmount, hidden }.
   *  Opted out (no nickname) → not shown. Support at 0 → not shown. Hidden by the owner → "Anonymous Donor" / "Anonymous Sponsor".
   *  The amount only when the Seed Sponsor ticked "Show my amount". Biggest first. Nothing else from a record is used. */
  function listRows(records, reserved) {
    const donors = [], supporters = [];
    for (const r of records || []) {
      const units = big(r && r.units);
      if (!units || units <= 0n) continue;
      const nick = checkNickname(r.nickname);
      if (!nick.ok && !r.hidden) continue;
      const looksOfficial = nick.ok && typeof reserved === "function" && reserved(nick.name);
      const name = r.hidden || looksOfficial || ADDRESS_LIKE.test(nick.name) ? HIDDEN[r.kind] : nick.name;
      const row = { name, amount: r.showAmount ? fmtVhp(units) : null, units };
      if (r.kind === "donation") donors.push(row);
      else if (r.kind === "support") supporters.push(row);
    }
    const order = (a, b) => (a.units === b.units ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.units > b.units ? -1 : 1);
    const out = (rows) => rows.sort(order).map(({ name, amount }) => ({ name, amount }));
    return { donors: out(donors), supporters: out(supporters) };
  }

  /** The vault's records (list_sponsors rows) as list entries: one wallet can be a donor and a supporter. The address
   *  is dropped here and never reaches the page. */
  function fromChain(rows) {
    const out = [];
    for (const row of rows || []) {
      const r = (row && row.sponsor) || {};
      const base = { nickname: r.nickname || "", showAmount: !!r.show_amount, hidden: !!r.hidden };
      if (big(r.donated) > 0n) out.push({ kind: "donation", units: String(r.donated), ...base });
      if (big(r.support) > 0n) out.push({ kind: "support", units: String(r.support), ...base });
    }
    return out;
  }

  // The owner's and Vault's exact words for the confirm screens (M-820, M-821).
  const DONATION_WORDS = "A donation becomes part of the Knode Games seed, owned by the platform. It can be used for the platform, including moving it out of the vault, and you can't take it back.";
  const SUPPORT_ONLY_YOU = "Only you can withdraw your support: any amount, any time.";
  const REWARD_WORDS = "Your VHP produces blocks for the vault. Its rewards pay the weekly free prizes first, and the rest is shared by the players who stake. You receive none of them.";

  /** The confirm screen: a big title naming the kind, the plain words, and the button's words. */
  function confirmText(kind, units, nickname, showAmount) {
    const amt = fmtVhp(units);
    const shown = nickname ? `You will be shown as “${nickname}”${showAmount ? ", with the amount" : ", without the amount"}.` : "You are not shown on this page.";
    if (kind === "donate") {
      return { title: `You are DONATING ${amt}`, lines: [DONATION_WORDS, REWARD_WORDS, shown, "Nobody plays with this VHP, and you cannot win prizes with it."], button: `Donate ${amt}. I can't take it back` };
    }
    if (kind === "support") {
      return { title: `You are adding SUPPORT: ${amt}`, lines: [SUPPORT_ONLY_YOU, REWARD_WORDS, shown, "Nobody plays with this VHP, and you cannot win prizes with it."], button: `Add ${amt} of support` };
    }
    if (kind === "withdraw") {
      return { title: `Withdraw ${amt} of your support`, lines: ["The VHP goes back to the wallet that added it."], button: `Withdraw ${amt}` };
    }
    throw new Error(`unknown kind ${kind}`);
  }

  /** The owner's switch for the buttons (js/lib/config.js). Only a real `true` turns it on. */
  function liveOn(kg) {
    return !!(kg && kg.seedSponsor && kg.seedSponsor.live === true);
  }

  window.KSeedSponsor = { UNIT, DEFAULT_MIN_VHP, HIDDEN, minVhp, checkAmount, checkNickname, fmtVhp, seedTotal, listRows, fromChain, confirmText, liveOn, DONATION_WORDS, SUPPORT_ONLY_YOU, REWARD_WORDS };
})();
