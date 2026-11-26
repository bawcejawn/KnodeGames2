/* Seed Sponsor page. This version only reads the chain: it shows the seed's VHP and the minimum. The Donate and
   Support buttons stay "coming soon" until the vault upgrade that keeps Seed Sponsor records is live. The rules are in
   seed-sponsor-math.js; the minimum is the one setting in js/lib/config.js. Read-only: no wallet, no transactions. */
(() => {
  "use strict";
  const S = window.KSeedSponsor;
  if (typeof document === "undefined" || !S || !document.getElementById("ss-total")) return;

  const lib = window.koilib || window.koinos || window;
  // Free read split, as on the other pages: start on one public node at random; the other is the failover.
  const RPCS = ["https://koinos.armana.io", "https://api.koinosblocks.com"];
  if (Math.random() < 0.5) RPCS.reverse();
  const $ = (id) => document.getElementById(id);
  const fetchJson = async (url) => { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function showMinimum(chainUnits) {
    const min = S.minVhp(window.KG, chainUnits);
    for (const n of document.querySelectorAll("[data-ss-min]")) n.textContent = S.fmtVhp(BigInt(min) * S.UNIT);
  }

  function showList(records) {
    const { donors, supporters } = S.listRows(records);
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

  async function start() {
    showMinimum();
    showList([]);
    if (!lib.Contract || !lib.Provider) { $("ss-total").textContent = "–"; $("ss-asof").textContent = "Couldn't load the Koinos library. Refresh the page to try again."; return; }
    try {
      const dep = await fetchJson("game-data/deployment.json");
      const abi = await fetchJson("game/abi/kpred.koilib.json");
      const vault = new lib.Contract({ id: dep.contract, abi, provider: new lib.Provider(RPCS) });
      const { result } = await vault.functions.get_state({});
      const total = S.seedTotal(result);
      if (total === null) throw new Error("no totals");
      $("ss-total").textContent = S.fmtVhp(total);
      if (result.config && result.config.min_sponsor_vhp) showMinimum(result.config.min_sponsor_vhp);
      const t = Number(result.time || 0);
      $("ss-asof").textContent = t > 0 ? `Read from the chain at ${new Date(t).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (your time).` : "Read from the chain just now.";
    } catch {
      $("ss-total").textContent = "–";
      $("ss-asof").textContent = "Couldn't read the seed right now. Refresh the page to try again.";
      $("ss-asof").classList.add("bad");
    }
  }
  start();
})();
