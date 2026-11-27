/* Seed Sponsor page. It reads the seed and the Seed Sponsor list from the vault. The Donate and Support buttons open only
   when BOTH are true: the owner's switch window.KG.seedSponsor.live (js/lib/config.js) is on, and the vault answers the
   Seed Sponsor calls (vault v6.2). Withdraw never depends on the switch (Vault review B-1, rule 1: withdraw any time):
   your record and its Withdraw show whenever the vault answers and your support is above 0.
   Rules and words: seed-sponsor-math.js. The calls and transactions: seed-sponsor-chain.js. Sending: KWallet.send, always
   with the Seed Sponsor's own Mana (noSponsor: the Knode Games Mana service never pays for Seed Sponsor). Everything is set as
   textContent; no wallet address is ever shown. */
(() => {
  "use strict";
  const S = window.KSeedSponsor, C = window.KSeedSponsorChain;
  if (typeof document === "undefined" || !S || !C || !document.getElementById("ss-total")) return;

  const lib = window.koilib || window.koinos || window;
  // Free read split, as on the other pages: start on one public node at random; the other is the failover.
  const RPCS = ["https://koinos.armana.io", "https://api.koinosblocks.com"];
  if (Math.random() < 0.5) RPCS.reverse();
  const $ = (id) => document.getElementById(id);
  const fetchJson = async (url) => { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const reserved = window.KNames && window.KNames.rules ? window.KNames.rules.reserved : null;
  const Wallet = () => window.KWallet;

  const st = { k: null, vault: null, chainUnits: null, chainReady: false, kind: null, pending: null, mine: null };
  const minVhp = () => S.minVhp(window.KG, st.chainUnits);
  const ready = () => S.liveOn(window.KG) && chainReady();
  function chainReady() { return st.chainReady; }

  function say(text, bad) { const n = $("ss-status"); n.textContent = text || ""; n.classList.toggle("bad", !!bad); }
  function showMinimum() {
    for (const n of document.querySelectorAll("[data-ss-min]")) n.textContent = S.fmtVhp(BigInt(minVhp()) * S.UNIT);
  }

  function showList(records) {
    const { donors, supporters } = S.listRows(records, reserved);
    for (const [id, rows, empty] of [["ss-donors", donors, "No donations yet."], ["ss-supporters", supporters, "No support deposits yet."]]) {
      const ul = $(id);
      if (!rows.length) { ul.replaceChildren(el("li", "ss-empty", empty)); continue; }
      ul.replaceChildren(...rows.map((r) => {
        const li = el("li");
        li.append(el("span", "ss-name", r.name));
        if (r.amount) li.append(el("span", "ss-amt", r.amount));
        return li;
      }));
    }
  }

  /** Who may use the buttons now. Returns a sentence for the page when they can't, or "" when they can. */
  function whyNot() {
    const w = Wallet();
    if (!w || !w.address) return "Connect your wallet (top right) to donate or add support.";
    if (w.kind === "guest") return "Seed Sponsor needs your own wallet (Kondor or KOIN Vault). A guest wallet can't be used.";
    return "";
  }

  function paintButtons() {
    const on = ready();
    const [give, keep] = document.querySelectorAll(".ss-go");
    give.disabled = keep.disabled = !on;
    give.setAttribute("aria-disabled", String(!on));
    keep.setAttribute("aria-disabled", String(!on));
    give.textContent = on ? "Donate" : "Donate · coming soon";
    keep.textContent = on ? "Add support" : "Support · coming soon";
    $("ss-soon").hidden = on;
  }

  // ── the form, then the confirm screen ──
  function openForm(kind) {
    const why = whyNot();
    if (why) { say(why, true); return; }
    say("");
    st.kind = kind;
    $("ss-form-h").textContent = kind === "donate" ? "Donate (cannot be withdrawn)" : "Support (withdraw any time)";
    $("ss-form-err").textContent = "";
    $("ss-confirm").hidden = true;
    $("ss-form").hidden = false;
    $("ss-amount").focus();
  }

  function readChoices(nickId, hideId, showId, errId) {
    const hide = $(hideId).checked;
    let nickname = "";
    if (!hide) {
      const n = S.checkNickname($(nickId).value, reserved);
      if (!n.ok) { $(errId).textContent = n.reason + " Or tick “Don't show me on this page”."; return null; }
      nickname = n.name;
    }
    return { nickname, showAmount: !hide && $(showId).checked };
  }

  function toConfirm() {
    const amt = S.checkAmount($("ss-amount").value, minVhp());
    if (!amt.ok) { $("ss-form-err").textContent = amt.reason; return; }
    const ch = readChoices("ss-nick", "ss-hide-me", "ss-show-amt", "ss-form-err");
    if (!ch) return;
    st.pending = { action: st.kind, units: amt.units, ...ch };
    confirmScreen(S.confirmText(st.kind, amt.units, ch.nickname, ch.showAmount), st.kind !== "donate");
  }

  function confirmScreen(c, keep) {
    $("ss-confirm-h").textContent = c.title;
    $("ss-confirm-list").replaceChildren(...c.lines.map((l) => el("li", null, l)));
    $("ss-confirm-go").textContent = c.button;
    $("ss-confirm-err").textContent = "";
    $("ss-confirm").classList.toggle("keep", !!keep);
    $("ss-form").hidden = true;
    $("ss-confirm").hidden = false;
    $("ss-confirm-h").focus && $("ss-confirm-h").setAttribute("tabindex", "-1");
    $("ss-confirm-h").focus();
  }

  async function sendPending() {
    const p = st.pending, w = Wallet();
    if (!p || !(p.action === "withdraw" ? chainReady() : ready())) return;
    const why = whyNot();
    if (why) { $("ss-confirm-err").textContent = why; return; }
    const go = $("ss-confirm-go");
    go.disabled = true;
    try {
      const ops = await C.buildOps(st.k, p.action, { player: w.address, units: p.units, nickname: p.nickname, showAmount: p.showAmount });
      const label = p.action === "donate" ? "Seed Sponsor donation" : p.action === "support" ? "Seed Sponsor support" : "Seed Sponsor withdrawal";
      await window.KWallet.send(label, ops, { noSponsor: true });
      $("ss-confirm").hidden = true;
      st.pending = null;
      say(p.action === "withdraw" ? `Done: ${S.fmtVhp(p.units)} is on its way back to your wallet.` : `Thank you. ${S.fmtVhp(p.units)} is in the Seed.`);
      await refresh();
    } catch (e) {
      $("ss-confirm-err").textContent = `Not sent: ${(e && e.message) || e}`;
    } finally {
      go.disabled = false;
    }
  }

  // ── your record: withdraw, and your choices ──
  async function paintMine() {
    // Not behind the owner's switch: only the vault (v6.2) and a real wallet are needed (Vault review B-1).
    const box = $("ss-mine"), w = Wallet();
    if (!chainReady() || !w || !w.address || w.kind === "guest") { box.hidden = true; return; }
    try {
      const r = await C.readMine(st.vault, w.address);
      st.mine = r;
      const support = BigInt(r.support || 0), donated = BigInt(r.donated || 0);
      if (support === 0n && donated === 0n) { box.hidden = true; return; }
      $("ss-mine-support").textContent = S.fmtVhp(support);
      $("ss-mine-donated").textContent = S.fmtVhp(donated);
      $("ss-withdraw-box").hidden = support === 0n;
      $("ss-p-nick").value = r.nickname || "";
      $("ss-p-hide").checked = !r.nickname;
      $("ss-p-show").checked = !!r.show_amount;
      $("ss-mine-err").textContent = "";
      box.hidden = false;
    } catch {
      box.hidden = true;
    }
  }

  function withdraw() {
    const s = (st.mine && BigInt(st.mine.support || 0)) || 0n;
    const amt = S.checkAmount($("ss-w-amount").value, 1);
    if (!amt.ok) { $("ss-mine-err").textContent = "Type a whole number of VHP to withdraw."; return; }
    if (amt.units > s) { $("ss-mine-err").textContent = `That is more than your support (${S.fmtVhp(s)}).`; return; }
    st.pending = { action: "withdraw", units: amt.units };
    confirmScreen(S.confirmText("withdraw", amt.units), true);
  }

  async function saveChoices() {
    const w = Wallet(), why = whyNot();
    if (why) { $("ss-mine-err").textContent = why; return; }
    const ch = readChoices("ss-p-nick", "ss-p-hide", "ss-p-show", "ss-mine-err");
    if (!ch) return;
    const btn = $("ss-p-save");
    btn.disabled = true;
    try {
      const ops = await C.buildOps(st.k, "profile", { player: w.address, ...ch });
      await window.KWallet.send("Seed Sponsor choices", ops, { noSponsor: true });
      say("Your choices are saved.");
      await refresh();
    } catch (e) {
      $("ss-mine-err").textContent = `Not sent: ${(e && e.message) || e}`;
    } finally {
      btn.disabled = false;
    }
  }

  // ── reading the vault ──
  async function refresh() {
    const { result } = await st.vault.functions.get_state({});
    const total = S.seedTotal(result);
    if (total === null) throw new Error("no totals");
    $("ss-total").textContent = S.fmtVhp(total);
    st.chainUnits = result.config && result.config.min_sponsor_vhp;
    showMinimum();
    const t = Number(result.time || 0);
    $("ss-asof").textContent = t > 0 ? `Read from the chain at ${new Date(t).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (your time).` : "Read from the chain just now.";
    // The vault answers list_sponsors only from v6.2. Before that the list stays empty and the buttons stay off.
    try {
      showList(S.fromChain(await C.readAll(st.vault)));
      st.chainReady = true;
    } catch {
      st.chainReady = false;
    }
    paintButtons();
    await paintMine();
  }

  async function start() {
    showMinimum();
    showList([]);
    paintButtons();
    if (!lib.Contract || !lib.Provider) { $("ss-total").textContent = "–"; $("ss-asof").textContent = "Couldn't load the Koinos library. Refresh the page to try again."; return; }
    try {
      const dep = await fetchJson("game-data/deployment.json");
      st.k = { lib, dep: { contract: dep.contract, vhp: dep.vhp }, provider: new lib.Provider(RPCS) };
      st.vault = C.vaultOf(st.k);
      await refresh();
    } catch {
      $("ss-total").textContent = "–";
      $("ss-asof").textContent = "Couldn't read the seed right now. Refresh the page to try again.";
      $("ss-asof").classList.add("bad");
    }
  }

  const [give, keep] = document.querySelectorAll(".ss-go");
  give.addEventListener("click", () => ready() && openForm("donate"));
  keep.addEventListener("click", () => ready() && openForm("support"));
  $("ss-form-back").addEventListener("click", () => { $("ss-form").hidden = true; });
  $("ss-form-next").addEventListener("click", toConfirm);
  $("ss-confirm-back").addEventListener("click", () => { $("ss-confirm").hidden = true; if (st.pending && st.pending.action !== "withdraw") $("ss-form").hidden = false; });
  $("ss-confirm-go").addEventListener("click", sendPending);
  $("ss-w-all").addEventListener("click", () => { const s = st.mine ? BigInt(st.mine.support || 0) : 0n; $("ss-w-amount").value = String(s / S.UNIT); });
  $("ss-w-go").addEventListener("click", withdraw);
  $("ss-p-save").addEventListener("click", saveChoices);
  for (const [hide, nick, show] of [["ss-hide-me", "ss-nick", "ss-show-amt"], ["ss-p-hide", "ss-p-nick", "ss-p-show"]]) {
    $(hide).addEventListener("change", () => { $(nick).disabled = $(hide).checked; $(show).disabled = $(hide).checked; });
  }
  if (window.KWallet && window.KWallet.subscribe) window.KWallet.subscribe(() => { if (st.vault) paintMine(); });
  start();
})();
