/* Shared addresses for the website. data-source.js repeats these defaults so a page still works if this
   file is not loaded. Change the questions block in both places, then follow docs/DATA.md. */
(function () {
  "use strict";
  window.KG = window.KG || {};
  // Question files are not on the website and not on main. They are on the game-data branch.
  // The branch keeps the game-data/ folder, so the raw URL has that name twice.
  window.KG.questions = window.KG.questions || {
    repo: "bawcejawn/KnodeGames2",
    ref: "game-data",
    prefix: "game-data/",
  };
  // Seed Sponsor page (seed-sponsor.html). The owner's one setting: the smallest deposit or donation, in whole VHP.
  // Every deposit and every donation must be at least this much, top-ups included. Change the number here only; the
  // page and its tests read it from here. Once the vault keeps its own minimum, the vault's value is used instead.
  // `live`: the owner's switch for the Donate, Support and Withdraw buttons. Leave it false until vault v6.2 is uploaded,
  // the dry run is done and counsel has read the page text (M-821). Even when true, the buttons open only if the vault
  // answers the Seed Sponsor calls.
  window.KG.seedSponsor = window.KG.seedSponsor || {
    minVhp: 1000,
    live: false,
  };
})();
