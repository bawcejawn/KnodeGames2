/* Start sheet (Hub UI C). Tapping "Play free" on the home page (the big button or the one in the top banner) opens a small sheet: play as a guest (the Producer Race's picks),
   or connect a wallet. Free play is never gated: the guest button is a plain link, and if this script does not run, the home
   "Play free" button is still a plain link to the same place. It touches no wallet code: "Connect a wallet" only presses the
   page's own Connect button. Plain: no network, no storage. Esc, the backdrop and Close shut it; focus goes back to the button. */
(function () {
  "use strict";
  // The big "Play free" on the home page and the "Play free" button in the top banner open the same sheet.
  var triggers = [document.getElementById("welcome-go"), document.querySelector(".top .btn-play-free")].filter(Boolean);
  if (!triggers.length) return;
  var back = null, last = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function close() {
    if (!back) return;
    document.removeEventListener("keydown", onKey, true);
    back.remove();
    back = null;
    document.documentElement.classList.remove("sheet-open");
    if (last && last.focus) last.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab" || !back) return;
    var f = back.querySelectorAll("a, button");
    if (!f.length) return;
    var first = f[0], end = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  }
  function open() {
    if (back) return;
    last = document.activeElement;
    back = el("div", "ss-back");
    var card = el("div", "ss-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "ss-title");
    var h = el("h2", "", "Start playing");
    h.id = "ss-title";
    card.appendChild(h);
    card.appendChild(el("p", "", "Play free as a guest. No sign-up needed. Have a Koinos wallet? Connect it instead."));
    var go = el("a", "ss-go", "Play as a guest");
    go.href = "race.html#pick-zone";
    var wallet = el("button", "ss-wallet", "Connect a wallet");
    wallet.type = "button";
    wallet.addEventListener("click", function () {
      var real = document.getElementById("connect");
      close();
      if (real) real.click();
    });
    var x = el("button", "ss-close", "Close");
    x.type = "button";
    x.addEventListener("click", close);
    card.appendChild(go);
    card.appendChild(wallet);
    card.appendChild(x);
    back.appendChild(card);
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    document.documentElement.classList.add("sheet-open");
    document.addEventListener("keydown", onKey, true);
    go.focus();
  }
  triggers.forEach(function (t) {
    t.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open();
    });
  });
})();
