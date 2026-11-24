/**
 * Everything the admin page can do, for the whole Knode Games platform.
 *
 * Each action runs one of the existing, tested commands (npm run bot / desk / sponsor / picks / racepicks / names) with
 * checked arguments: the page adds no new way to sign anything. Actions that send always run as a dry run first; the
 * page can send only the exact same action and values that were just previewed.
 *
 * HOW TO ADD A GAME'S CONTROLS (for each game's build chat; docs/ADMIN.md):
 *   1. Its area is already in AREAS below (by game id). Set `status` and `tool`, and fill `what` / `docs`.
 *   2. Add its actions with `area: "<its id>"`, the right `kind`, and every text field filled in plainly.
 *   3. `npm run test:audit` checks every action has all its fields and a known area and kind.
 */
export type Param = { name: string; label: string; pattern: RegExp; hint: string; choices?: string[]; value?: string };

/** What kind of control it is. The page shows an area's controls in this order, each under its own heading. */
export const KINDS = {
  check: { title: "Check (read-only)", blurb: "Looks only. Nothing here can change anything." },
  settings: { title: "Adjustable rules and settings", blurb: "The numbers and switches you tune while the game runs." },
  emergency: { title: "Emergency stop", blurb: "Use these if something looks wrong. Stopping is always allowed, at once." },
  money: { title: "Money in and out", blurb: "Fees, seed funds and withdrawals." },
  weekly: { title: "Weekly results", blurb: "Posting, sealing and finalizing a week's results. The hourly bot does these; run one by hand only if the bot missed it." },
  launch: { title: "Launch steps", blurb: "Done once (or once per new game), in the order shown." },
  upgrade: { title: "Upgrade the contract code", blurb: "New contract code. Game and Swap upgrades give players 48 hours' notice first; each card says what it needs." },
  ownership: { title: "Keys and ownership", blurb: "Hand-overs and changing which wallet does what. Rare; take your time." },
} as const;
export type Kind = keyof typeof KINDS;

/** Where on the platform an action belongs. `section` is the sidebar heading. */
export type Area = {
  id: string; name: string; section: "Start here" | "Platform" | "Games" | "Knode Swap" | "Testnet";
  status: "live" | "launching" | "planned" | "testnet";
  gameId?: number;          // the game id registry (claude/knodegames-plan.md)
  what: string;             // one or two plain sentences: what this part of the platform is
  contract?: string;        // which contract or wallet it runs on
  docs?: string;            // the runbook in the repository
  later?: string;           // planned games: what will appear here and when
  /** Steps the page can't run for you (GitHub settings): a numbered card with a button that opens the page to do them
   *  on. The link must be on this repository's GitHub (the page refuses any other). */
  guides?: { title: string; intro?: string; steps: string[]; link: { label: string; url: string } }[];
  /** Fixed numbers to show at the top of the area (e.g. the sponsor's agreed limits), with where each comes from. */
  numbers?: { label: string; value: string; note?: string }[];
};

export const AREAS: Area[] = [
  { id: "overview", name: "Health checks", section: "Start here", status: "live",
    what: "Quick read-only checks across the whole platform. A good first stop: nothing here can change anything. At the top: the recorders' health (when each last published) and what the site shows for each game (its boards, results and free-prize switch). Both read public files only: no key, no token." },
  { id: "thisweek", name: "This week", section: "Start here", status: "live",
    what: "The dates and times you need this week, in ET, with what to do at each. They come from a plain file (ops/admin/calendar.json), so a chat can change them by a small pull request without touching the page's code. Nothing here runs anything: each line names the card to use." },
  { id: "glance", name: "Games at a glance", section: "Start here", status: "live",
    what: "Every game on one screen: where it stands, its staking steps (add, apply, stop), its free-prize switch and its GitHub switches, with the exact command each one runs. Press Check everything to read the vault, the free-prize switches and each game's status in one go. Nothing here can change anything until you preview and send a card yourself." },
  { id: "switches", name: "All switches", section: "Start here", status: "live",
    what: "Every switch that is set on GitHub, for the whole platform and each game: what to type, what it does, when it takes effect and what cannot be undone. The page never holds a GitHub token, so each one opens GitHub's variables page for you to set." },

  { id: "sponsor", name: "Mana sponsor", section: "Platform", status: "live",
    what: "The wallet that pays players' Mana (transaction fees) for every Knode game, within daily caps. Free players share a pool released by the hour; players with a stake in a game get more. The numbers below are the agreed ones (D-772, Tue 24 Nov): the cards are filled in with them. There is no button that saves the Mana report's suggestions: those (2.24 / 2.0) must never be used.",
    contract: "Mana sponsor contract on the sponsor wallet (SPONSOR_WIF)", docs: "contracts/sponsor/README.md",
    numbers: [
      { label: "Most Mana for one transaction (per-tx cap)", value: "4.5", note: "D-772; a batch can never ask more than this" },
      { label: "Picks pick row (Block X, Combo, Fantasy, Over Under, VS, 18, 19)", value: "1.5", note: "most used 1.14 (mainnet batch test, 24 Nov)" },
      { label: "Race pick row", value: "1.3", note: "most used 1.00" },
      { label: "Daily Questions answer row", value: "1.2", note: "unchanged; most used 0.91" },
      { label: "Website: rcLimit and rcLimitOther", value: "4.5 and 4.5", note: "game-data/deployment.json, PR #109; main still says 1.3 / 2.4 until #109 merges" },
      { label: "Website: batch formula", value: "0.9 fixed + 0.25 a Picks pick (0.3 a Race pick) + 0.5 margin", note: "a batch of n picks may ask at most n × its row, and never more than 4.5" },
      { label: "Caps", value: "40 a wallet a day, 280 a week; 5,000 for everyone a day, of which 2,000 is the free pool", note: "on chain since 23 Nov" },
      { label: "Sponsor pool", value: "about 25,000 KOIN; about 55 Mana used a day", note: "Tue 24 Nov reading; it refills ~5,000 a day, so no top-up is needed" },
      { label: "Never", value: "npm run sponsor -- mana-report --save", note: "it would write 2.24 / 2.0 (D-772)" },
    ] },
  { id: "vault", name: "Knode Vault (v6)", section: "Platform", status: "live",
    what: "The one vault that holds every staked VHP, produces blocks with it as the Knode Games Pool, and pays each week's prizes after the flat 5% fee. Live since 2 Nov. Here: add a game (two steps, 48 hours apart), the free-prize switch, weekly results and corrections, the fees, the seed, pausing deposits, upgrades and the owner and bot wallets.",
    contract: "The vault contract (1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr); owner OWNER_WIF, bot OPERATOR_WIF, seed owner SEED_WIF", docs: "docs/WALLETS.md (keys and handovers), docs/UPGRADE-V6.md (upgrades and the emergency build)" },
  { id: "picks", name: "Picks contract", section: "Platform", status: "live",
    what: "The contract most games' picks go to (Block X 2 and 12, Survivor 3, Fantasy 4 and 5, Combo 8, Bracket 9, Last Node 13, Over Under 16, VS 17, Within 5 / 10 blocks 18 and 19). Here: its status, announcing and applying a game (48 hours apart), clearing the v2 upgrade announcement, and handing it to the cold wallet. Every step here is a dry run first; a mainnet send also needs CONFIRM_MAINNET=yes in .env.",
    contract: "Picks contract 1LmgqBGctL9F2YkyjTXgieTXwnYHh8Y6Pm (owner OWNER_WIF until the handover)", docs: "docs/blockx/MAINNET-LAUNCH.md" },
  { id: "names", name: "Wallet names", section: "Platform", status: "live",
    what: "Names on knodegames.com: each wallet's Koinos @name (players create theirs on names.html), and for producers that run a pool, the pool's name. The hourly workflow reads them from the chain. Use these to see what's shown, refresh at once, or hide an offensive name. Older Knode Games names (signed claims) are still honoured.",
    contract: "No contract: names-data/names.json on GitHub (needs your git login on this PC)", docs: "docs/NAMES.md" },

  { id: "question", name: "Question game", section: "Games", status: "live", gameId: 1,
    what: "The weekly block-producer questions. Players answer free or with a stake; correct answers climb the weekly board.",
    contract: "The vault contract, game 1 (the bot wallet OPERATOR_WIF posts and resolves; vault-wide controls are under Knode Vault)", docs: "bot/README.md" },
  { id: "blockx", name: "Who Signs Block X", section: "Games", status: "live", gameId: 2,
    what: "Every 2,400 blocks is a target: players pick the producer they think signs it. Runs on the Picks contract, which later carries other games too.",
    contract: "Picks contract (game 2)", docs: "docs/blockx/MAINNET-LAUNCH.md" },
  { id: "survivor", name: "Survivor", section: "Games", status: "launching", gameId: 3,
    what: "Two-week seasons: one producer pick a day, two lives, each producer only once. Free play now on Picks game 3 (in force since Sun 22 Nov; SURVIVOR_ENABLED is on). Season 1 starts Sun 29 Nov 7 PM ET (day 1 Mon 30 Nov).",
    contract: "Picks contract (game 3); not a vault game yet", docs: "docs/SURVIVOR-RUNBOOK.md",
    later: "Staking: Survivor stays out of the vault until K9/K1b (D-750, D8). Do not use Add a game for it until then. Free prize OFF." },
  { id: "fantasy", name: "Fantasy Producers", section: "Games", status: "launching", gameId: 4,
    what: "Pick a team of five producers each day (game 4), with a weekly rival (game 5, records only). Free play is on; staking opens with the vault apply.",
    contract: "Picks games 4 and 5; vault game 4",
    later: "Vault apply Tue 24 Nov from 6:21 PM ET (Knode Vault, Add a game, step 2): the dry run must say week 6. Then merge #45. Free prize OFF." },
  { id: "golf", name: "Block Golf", section: "Games", status: "live", gameId: 6,
    what: "The platform's golf course: every live game is a hole, and a player's place on that game's weekly board sets their strokes. Nothing to pick. STOPPED in the vault Sun 22 Nov (last week 4): it takes no new stakes and never earns; its staked 10 VHP can be withdrawn. Free play can go on. The launch cards below are kept only for the record: don't use them.",
    contract: "No contract: the hourly Block Golf recorder (.github/workflows/golf.yml) and its files on games-data/golf", docs: "docs/GOLF.md",
    guides: [{
      title: "GitHub switches for Block Golf (the admin page can't set these)",
      intro: "Each is a repository variable: Settings → Secrets and variables → Actions → Variables tab. The button opens that page.",
      steps: [
        "Turn the recorder on: New repository variable GOLF_ENABLED = true. Then Actions → \"Block Golf recorder\" → Run workflow; it should finish green. Then press Block Golf status on this page.",
        "Start staked play (once, only after the launch steps below are done and step 3 succeeded): New variable GOLF_STAKED_FROM_WEEK = the vault week Golf earns from (Vault: is Block Golf in? prints it; for an apply in vault week 4 it is 5). Set it before that week's first run, Monday 00:57 UTC (Sunday 7:57 PM ET in winter). Never change it afterwards: the publish job refuses a change.",
        "Hold a week (any time): variable GOLF_HOLD_WEEKS = the vault week, e.g. 3 (or 3,4). That week can't go final, so nothing is paid. To release it, delete the variable or remove the week. The vault takes results until Thursday 00:00 UTC; after that a held week rolls over. A value that isn't a plain list of numbers (e.g. W3) holds every week until fixed.",
        "Turn the recorder off: set GOLF_ENABLED to false. The site keeps the last published files; stakes are untouched.",
      ],
      link: { label: "Open GitHub repository variables", url: "https://github.com/bawcejawn/KnodeGames2/settings/variables/actions" },
    }] },
  { id: "race", name: "Producer Race", section: "Games", status: "live", gameId: 7,
    what: "Players pick the producers who sign the most blocks in a day (Win and Show). Cards and results are made automatically every few minutes.",
    contract: "Race picks contract (owner wallet OWNER_WIF)" },
  { id: "combo", name: "Combo Card", section: "Games", status: "launching", gameId: 8,
    what: "A card of several picks across games, scored together. Announced in the vault Mon 23 Nov (free prize OFF) and on Picks (game 8).",
    contract: "Picks contract (game 8, the v2 CARD code) and vault game 8", docs: "docs/combo",
    later: "Wed 25 Nov from ~9:35 AM ET: Picks apply 8 (Picks contract area), then upgrade-clear. By Sun 29 Nov 23:59 UTC: COMBO_RULER_FROM_WEEK and COMBO_ENABLED. Mon 30 Nov: vault apply 8 (its window ends Wed 2 Dec ~9:30 AM ET); earns from week 7 (Mon 7 Dec)." },
  { id: "bracket", name: "Producer Bracket", section: "Games", status: "live", gameId: 9,
    what: "A knockout bracket of producers. In the vault and earning from week 5; free prize ON from week 5.",
    contract: "Picks contract (game 9) and vault game 9", docs: "docs/bracket/README.md" },
  { id: "lastnode", name: "Last Node Standing", section: "Games", status: "live", gameId: 13,
    what: "Hourly rounds: the producers with the fewest blocks are cut until one is left. Free play is live (first event Tue 24 Nov 9 AM ET). GitHub's own timer skips runs, so until the Cloudflare Worker (#103) starts the recorder on time, run it by hand (D-799); the Health row on Health checks shows when it last published.",
    contract: "Picks contract (game 13) and vault game 13", docs: "docs/lastnode",
    later: "Vault apply Tue 24 Nov from 6:21 PM ET (Knode Vault, Add a game, step 2): the dry run must say week 6. Free prize OFF." },
  { id: "overunder", name: "Over Under (game 16)", section: "Games", status: "launching",
    what: "Players see it as \"More or Fewer\": will a producer sign more or fewer blocks than the line? Free play is live on Picks game 16. Announced in the vault Sun 22 Nov; free prize OFF from week 6.",
    contract: "Picks contract (game 16); vault game 16 once applied", docs: "games/overunder (New Games)",
    later: "Mon 30 Nov, after New Games' PR D (liveWeek) merges: vault apply 16 (Knode Vault, Add a game, step 2). Its window closes Tue 1 Dec ~6:26 PM ET; it earns from week 7 (Mon 7 Dec). It appears in Games at a glance under \"Not in the vault's list yet\" until Vault adds it to vaultGames." },
  { id: "vs", name: "Knode Games VS (game 17)", section: "Games", status: "live",
    what: "A free TEST since Sat 21 Nov. Not a vault game (Picks only, D-585): it is never added or applied in the vault, so it has no stake. Any free prize would come only from the prizes tool (game 17); there are none in the TEST.",
    contract: "Picks contract (game 17); recorder in kit-games.yml (VS_ENABLED)", docs: "games/vs (New Games)" },

  { id: "desk", name: "Knode Swap (Desk)", section: "Knode Swap", status: "live",
    what: "The VHP → KOIN swap desk, funded by the node. Players swap VHP for KOIN at the fee you set.",
    contract: "Desk contract v2 (owner wallet OWNER_WIF)", docs: "bot/README.md" },

  { id: "t-vault", name: "Vault v6 trial (local node)", section: "Testnet", status: "testnet",
    what: "Vault v6 on YOUR LOCAL Harbinger testnet node (ops/node/setup-testnet.ps1), with test VHP only: add a game, post a week, finalize. The public test copy on the Koinos Foundation testnet (1MXay5pSvPNzc8sBcZAMWfqaY4T9DkBvLn, played from knodegames.com/stake-testnet.html) belongs to the Vault chat's test wallet, so the Vault chat runs its steps.",
    contract: "Local testnet vault (OWNER_WIF / OPERATOR_WIF in .env.testnet)", docs: "docs/UPGRADE-V6.md" },
  { id: "t-sponsor", name: "Sponsor v3 trial", section: "Testnet", status: "testnet",
    what: "Sponsor v3 on the Koinos Foundation testnet with test KOIN only, played from the testnet Block X page. Do the numbered steps in order.",
    contract: "Testnet sponsor wallet (SPONSOR_WIF in .env.testnet)", docs: "docs/blockx/SPONSOR-TESTNET.md" },
];

export type Action = {
  id: string;
  area: string;            // an AREAS id
  kind: Kind;
  label: string;           // a short name: what you're doing
  what: string;            // what it does, in plain words
  when?: string;           // when (or why) you'd use it
  signer: string;          // which wallet signs, or "nobody (read-only)"
  effect: "none" | "chain" | "files";   // read-only / changes the blockchain / changes files on this PC
  timing?: string;         // when the change takes effect
  step?: number;           // for a numbered sequence inside an area
  tool: "bot" | "desk" | "sponsor" | "picks" | "racepicks" | "names" | "prizes" | "golf";
  args: string[];          // {name} is replaced by the parameter's value
  params?: Param[];
  sends: boolean;          // false = read-only, never takes --send
};

const ADDRESS: Omit<Param, "name" | "label"> = { pattern: /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/, hint: "a Koinos address (starts with 1)" };
const AMOUNT: Omit<Param, "name" | "label"> = { pattern: /^\d{1,12}(\.\d{1,8})?$/, hint: "a number, up to 8 decimals" };
const WHOLE: Omit<Param, "name" | "label"> = { pattern: /^[1-9]\d{0,11}$/, hint: "a whole number, at least 1" };
const INT: Omit<Param, "name" | "label"> = { pattern: /^\d{1,10}$/, hint: "a whole number" };
const PERCENT: Omit<Param, "name" | "label"> = { pattern: /^(10(\.0{1,2})?|\d(\.\d{1,2})?)$/, hint: "0 to 10, up to 2 decimals" };
const KEY: Omit<Param, "name" | "label"> = { pattern: /^(node|[A-Za-z0-9_\-+/=]{40,90})$/, hint: "the node's PUBLIC key, or: node" };
const ONOFF: Omit<Param, "name" | "label"> = { pattern: /^(on|off)$/, hint: "on or off", choices: ["on", "off"] };
const GAMEID: Omit<Param, "name" | "label"> = { pattern: /^[1-9]\d{0,2}$/, hint: "the Picks game id (2 Block X, 8 Combo, 18 Within 5 blocks, 19 Within 10 blocks)" };
// No word may start with "-", so a reason can never pass an option such as --send to the command.
const REASON: Omit<Param, "name" | "label"> = { pattern: /^(?!(.*\s)?-)[A-Za-z0-9 .,'()\-]{0,120}$/, hint: "letters, numbers and basic punctuation (no word starting with -)" };

const WEEK: Omit<Param, "name" | "label"> = { pattern: /^\d{1,5}$/, hint: "the vault week number (week 0 began Mon 19 Oct 2026)" };
const VGAME: Omit<Param, "name" | "label"> = { pattern: /^([2-9]|[1-9]\d{1,2})$/, hint: "the vault game id, 2 or more (4 Fantasy, 8 Combo, 13 Last Node, 16 Over Under)" };
/** The free-prize switch also takes game 1, Daily Questions (D-136: on the switch from v6.1's rule week, Mon 16 Nov). */
const PRIZEGAME: Omit<Param, "name" | "label"> = { pattern: /^([1-9]|[1-9]\d{1,2})$/, hint: "the game id (1 Questions, 2 Block X, 3 Survivor, 4 Fantasy, 7 Race, 8 Combo, 9 Bracket, 13 Last Node, 16 Over Under, 17 VS)" };
const SEASON: Omit<Param, "name" | "label"> = { pattern: /^([1-9]|1[0-2])$/, hint: "weeks per season: 1 (weekly prize) to 12; Survivor is 2" };
const GAMENAME: Omit<Param, "name" | "label"> = { pattern: /^[A-Za-z0-9][A-Za-z0-9 .'&]{0,39}$/, hint: "the game's name, up to 40 letters" };
// A claim as it is pasted into one line: the claim line, then "Signature: ..." (the line break becomes a space).

const RO = "Nobody (read-only)";
const FILES = "Nobody: it only edits files on this PC";
const OWNER = "Owner wallet (OWNER_WIF)";
const SPONSOR = "Sponsor wallet (SPONSOR_WIF)";
const OPERATOR = "Bot wallet (OPERATOR_WIF)";
const GIT = "Nobody on chain: your git login pushes names.json";
const GIT_PRIZES = "Nobody on chain: your git login pushes free-prizes.json (prize-settings branch)";
const TOWNER = "Testnet owner (OWNER_WIF in .env.testnet)";
const TOPERATOR = "Testnet bot wallet (OPERATOR_WIF in .env.testnet)";
const TSPONSOR = "Testnet sponsor wallet (SPONSOR_WIF in .env.testnet)";
const NEWOWNER = "The NEW owner (NEW_OWNER_WIF in .env, for this step only)";
const AT_ONCE = "At once";
const NOTICE = "After 48 hours' notice";

/** The sponsor caps on chain (D-772, 24 Nov: per transaction 4.5; 40 a wallet a day, 280 a week; 5,000 everyone a day, 2,000 free pool), shared by the mainnet and testnet forms. */
const CAPS_ARGS = ["--per-tx", "{tx}", "--per-player-day", "{day}", "--per-player-week", "{week}", "--per-day", "{all}", "--free-per-day", "{free}", "--min-vhp", "{minvhp}"];
const CAPS_PARAMS: Param[] = [
  { name: "tx", label: "Most Mana for one transaction", ...AMOUNT, value: "4.5" },
  { name: "day", label: "Most Mana per wallet per day (free or staked)", ...AMOUNT, value: "40" },
  { name: "week", label: "Most Mana per wallet per week", ...AMOUNT, value: "280" },
  { name: "all", label: "Most Mana for everyone per day (at most 5,000)", ...AMOUNT, value: "5000" },
  { name: "free", label: "Of that, the free players' pool per day", ...AMOUNT, value: "2000" },
  { name: "minvhp", label: "VHP a wallet must have staked in a game to count as a player", ...AMOUNT, value: "1" },
];

export const ACTIONS: Action[] = [
  // ════════ Start here: health checks ════════
  { id: "chain-check", area: "overview", kind: "check", label: "Contracts check", what: "Reads the question game's and the Desk's code fingerprints, safety switches, owners and anything announced, straight from the chain.", when: "Before and after any upgrade, or whenever something looks off.", signer: RO, effect: "none", tool: "bot", args: ["chain-check"], sends: false },
  { id: "game-status", area: "overview", kind: "check", label: "Question game status", what: "The question game right now: week, questions, players, pots and the bot's health.", signer: RO, effect: "none", tool: "bot", args: ["status"], sends: false },
  { id: "sponsor-status", area: "overview", kind: "check", label: "Mana sponsor status", what: "On or off, its caps, its KOIN and Mana, today's use, and who the website asks to pay.", signer: RO, effect: "none", tool: "sponsor", args: ["status"], sends: false },
  { id: "sponsor-watch", area: "overview", kind: "check", label: "Mana sponsor usage alerts", what: "Warns when free play (as released so far today) or everyone's total is past 80% of today's caps.", when: "The hourly bot runs this too; if it warns often, lower the caps in Mana sponsor.", signer: RO, effect: "none", tool: "sponsor", args: ["watch"], sends: false },
  { id: "picks-status", area: "overview", kind: "check", label: "Picks contract status (Block X)", what: "The Picks contract's code and safety switches, checked on two nodes; its owner; its games and anything announced.", signer: RO, effect: "none", tool: "picks", args: ["status", "--mainnet"], sends: false },
  { id: "race-status", area: "overview", kind: "check", label: "Race picks status", what: "The race contract's code, its settings and today's picks.", signer: RO, effect: "none", tool: "racepicks", args: ["status"], sends: false },
  { id: "desk-status", area: "overview", kind: "check", label: "Knode Swap status", what: "The Desk right now: KOIN available, VHP producing, swaps and settings.", signer: RO, effect: "none", tool: "desk", args: ["status"], sends: false },
  { id: "bot-mana", area: "overview", kind: "check", label: "Bot wallet Mana (the last line)", what: "The question game's status; its LAST line reads \"Bot wallet 1HsM… Mana …\": the Mana the hourly bot has to post results. Below 2 the bot alerts you. Vault reads it before the away window and sizes any KOIN top-up.", when: "Wed 25 Nov ~4 PM ET (send the line to Vault), and whenever the bot says it is low.", signer: RO, effect: "none", tool: "bot", args: ["status"], sends: false },

  // ════════ Games at a glance and All switches (read-only; the cards for each game's staking are the Knode Vault ones, pre-filled) ════════
  { id: "glance-vault", area: "glance", kind: "check", label: "Vault: every game's stake and state", what: "Every game in the vault: announced or applied, which week it earns from, its stake, prizes waiting and the 5% fee owed.", signer: RO, effect: "none", tool: "bot", args: ["games"], sends: false },
  { id: "glance-prizes", area: "glance", kind: "check", label: "Free prizes: which games pay them", what: "Each game's free 2 + 1 VHP prize switch, this week and next week.", signer: RO, effect: "none", tool: "prizes", args: ["list"], sends: false },
  { id: "glance-questions", area: "glance", kind: "check", label: "Daily Questions status", what: "Week, questions, players, pots, the v6.1 rule week and the bot's health.", signer: RO, effect: "none", tool: "bot", args: ["status"], sends: false },
  { id: "glance-picks", area: "glance", kind: "check", label: "Picks contract status (Block X and the Picks games)", what: "The Picks contract's code and safety switches, its games and anything announced.", signer: RO, effect: "none", tool: "picks", args: ["status", "--mainnet"], sends: false },
  { id: "glance-race", area: "glance", kind: "check", label: "Race status", what: "The race contract's code, its settings and today's picks.", signer: RO, effect: "none", tool: "racepicks", args: ["status"], sends: false },
  { id: "glance-golf", area: "glance", kind: "check", label: "Block Golf status", what: "Block Golf's course, each week's state, each hole and the switches the recorder sees.", signer: RO, effect: "none", tool: "golf", args: ["status"], sends: false },
  { id: "switches-prizes", area: "switches", kind: "check", label: "Free prizes: which games pay them", what: "The free-prize switches that are stored in the repository (the prize-settings branch), this week and next week. These two are the only switches the page can set by itself; every other one is a GitHub variable.", signer: RO, effect: "none", tool: "prizes", args: ["list"], sends: false },

  // ════════ Mana sponsor ════════
  { id: "sponsor-status-2", area: "sponsor", kind: "check", label: "Sponsor status", what: "On or off, its caps, its KOIN and Mana, today's use, and who the website asks to pay.", signer: RO, effect: "none", tool: "sponsor", args: ["status"], sends: false },
  { id: "sponsor-watch-2", area: "sponsor", kind: "check", label: "Usage alerts (80%)", what: "Warns when free play (as released so far today) or everyone's total is past 80% of today's caps.", signer: RO, effect: "none", tool: "sponsor", args: ["watch"], sends: false },
  { id: "sponsor-report", area: "sponsor", kind: "check", label: "Mana report: what each action really used", what: "Reads the last day of sponsored transactions on two nodes and shows, for each action, the typical and the most Mana used. Saves nothing. Its \"suggested\" limits (2 × the most used, e.g. 2.24 / 2.0) are NOT the ones to set: the agreed rows are at the top of this area (D-772). The page has no Save button for it on purpose.", when: "After a full day of real play, or when a pick fails for lack of Mana. Send the output to Vault.", signer: RO, effect: "none", tool: "sponsor", args: ["mana-report"], sends: false },
  { id: "sponsor-caps", area: "sponsor", kind: "settings", label: "Sponsor limits (caps)", what: "Sets every cap at once: per transaction, per wallet per day and week, for everyone per day, and the free players' pool (released by the hour). 1 Mana = 1 KOIN of Mana. Filled in with the caps on chain now (D-772). Knode Swap swaps are never sponsored.", when: "Rarely: to change more than one cap. To change only the per-transaction cap use the next card, which keeps the others exactly as they are on chain. Dry run to Vault first.", signer: SPONSOR, effect: "chain", timing: AT_ONCE, tool: "sponsor", args: ["config", ...CAPS_ARGS], params: CAPS_PARAMS, sends: true },
  { id: "sponsor-per-tx", area: "sponsor", kind: "settings", label: "Per-transaction cap only (keeps every other cap)", what: "Changes only the most Mana one transaction may use; every other cap stays exactly as it is on chain (--keep-caps). The agreed value is 4.5 (D-772): a batch of picks may ask up to 4.5.", when: "Set to 4.5 on Tue 24 Nov. Only if Vault gives a new number. Dry run to Vault first: it must show only the per-transaction line changing.", signer: SPONSOR, effect: "chain", timing: AT_ONCE, tool: "sponsor", args: ["config", "--keep-caps", "--per-tx", "{tx}"], params: [{ name: "tx", label: "Most Mana for one transaction", ...AMOUNT, value: "4.5" }], sends: true },
  { id: "sponsor-picks-limit", area: "sponsor", kind: "settings", label: "Per-action row: Picks pick at 1.5 Mana", what: "Writes the Picks pick row into sponsor-data/mana-limits.json on this PC: 1.5 Mana (D-772), from the most a Picks pick used on mainnet (1.142, batch test of 24 Nov). Nothing goes on chain: the next sponsor config send (dry run first) carries it. Then git restore the changed files, as Vault's steps say.", when: "Done Tue 24 Nov (Vault's steps). Only to write the row again.", signer: FILES, effect: "files", tool: "sponsor", args: ["mana-limit", "picks:pick", "1.14239333", "--source", "mainnet batch-test 24 Nov", "--limit", "1.5", "--save"], sends: false },
  { id: "sponsor-race-limit", area: "sponsor", kind: "settings", label: "Per-action row: Race pick at 1.3 Mana", what: "Writes the Race pick row into sponsor-data/mana-limits.json on this PC: 1.3 Mana (D-772), from the most a Race pick used (0.998, mana-report of 24 Nov). Nothing goes on chain: the next sponsor config send (dry run first) carries it.", when: "Done Tue 24 Nov (Vault's steps). Only to write the row again.", signer: FILES, effect: "files", tool: "sponsor", args: ["mana-limit", "race:pick", "0.99804662", "--source", "mainnet mana-report 24 Nov", "--limit", "1.3", "--save"], sends: false },
  { id: "sponsor-site-limits", area: "sponsor", kind: "settings", label: "Per-action rows: the website's copy", what: "Writes the rows into game-data and desk-data deployment.json on this PC. They reach the live site only through a pull request to main: PR #109 carries the agreed set (rows 1.5 / 1.3, rcLimit and rcLimitOther 4.5, the batch formula). After a preview, git restore the files unless a chat asks for them.", signer: FILES, effect: "files", tool: "sponsor", args: ["site-limits"], sends: true },
  { id: "sponsor-payer", area: "sponsor", kind: "settings", label: "Who the website asks to pay Mana", what: "For the game pages: sponsor = the website asks the Mana sponsor to pay; self = players pay their own. Knode Swap pages always use players' own Mana. Edits game-data and desk-data deployment.json on this PC; they reach the live site through a pull request to main.", signer: FILES, effect: "files", tool: "sponsor", args: ["payer", "{who}"], params: [{ name: "who", label: "Paid by", pattern: /^(sponsor|self)$/, hint: "sponsor or self", choices: ["sponsor", "self"] }], sends: true },
  { id: "sponsor-enable", area: "sponsor", kind: "settings", label: "Switch the sponsor on", what: "The sponsor starts paying. Every setting is rebuilt from this PC's files, keeping the caps exactly as they are on chain (0 stays 0); the preview shows every line old → new, and the vault switch as the game is now.", when: "After an emergency stop, once the cause is fixed. Check the caps with the sponsor's status first.", signer: SPONSOR, effect: "chain", timing: AT_ONCE, tool: "sponsor", args: ["enable"], sends: true },
  { id: "sponsor-disable", area: "sponsor", kind: "emergency", label: "Switch the sponsor off", what: "Stops the sponsor paying at once; players pay their own Mana. When the second node shows the same settings, only the switch changes. If the preview says it doesn't agree, use the next card instead.", when: "If Mana drains in a way it shouldn't.", signer: SPONSOR, effect: "chain", timing: AT_ONCE, tool: "sponsor", args: ["disable"], sends: true },
  { id: "sponsor-disable-rebuilt", area: "sponsor", kind: "emergency", label: "Switch the sponsor off (second node not agreeing)", what: "The same stop, for when the preview of \"Switch the sponsor off\" says the second node doesn't agree (or is down). It switches off AND rebuilds the settings from this PC's files: each cap the lower of the chain's and your default (never looser), and no per-action limits while off. The preview shows every line.", when: "Only if \"Switch the sponsor off\" refused for that reason.", signer: SPONSOR, effect: "chain", timing: AT_ONCE, tool: "sponsor", args: ["disable", "--rebuilt"], sends: true },
  { id: "sponsor-upload", area: "sponsor", kind: "upgrade", label: "Upload sponsor code (v3 upgrade)", what: "Puts the sponsor contract built on this PC (contracts/sponsor/build/release) onto the sponsor wallet. Only the audited build is accepted.", when: "Done 30 Oct (v3 is on mainnet). Only for a later upgrade, or to roll back to the v2 build.", signer: SPONSOR, effect: "chain", timing: AT_ONCE, tool: "sponsor", args: ["upload"], sends: true },

  // ════════ Question game (game 1) ════════
  { id: "game-status-2", area: "question", kind: "check", label: "Game status", what: "Week, questions, players, pots and the bot's health.", signer: RO, effect: "none", tool: "bot", args: ["status"], sends: false },
  { id: "verify", area: "question", kind: "check", label: "Recount results with my node", what: "Recounts recent results from your own node on this PC and compares them with what was published.", when: "Run git pull first.", signer: RO, effect: "none", tool: "bot", args: ["verify-results", "--days", "{days}"], params: [{ name: "days", label: "Days back", ...INT, value: "7" }], sends: false },
  { id: "min-stake", area: "vault", kind: "settings", label: "Minimum stake", what: "The fewest whole VHP a player can stake.", signer: OWNER, effect: "chain", timing: "From next week if that is at least 48 hours away, otherwise the week after", tool: "bot", args: ["min-stake", "{vhp}"], params: [{ name: "vhp", label: "VHP", ...WHOLE }], sends: true },
  { id: "sponsor", area: "vault", kind: "settings", label: "Vault's own Mana limit for others (0 = off)", what: "The most KOIN of Mana the vault contract itself pays for someone else's transaction. Owner, 4 Nov: set it to 0, so the vault keeps all its Mana for compounding; the Mana sponsor pays players instead. Change maxSponsorRc in game-data/deployment.json to the same value at the same time, or the bot sends a settings alert.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["sponsor-limit", "{max}"], params: [{ name: "max", label: "KOIN of Mana", ...AMOUNT }], sends: true },
  { id: "void", area: "question", kind: "settings", label: "Void a question", what: "Cancels a question's result, so it counts for nobody. The reason is public.", when: "Only if a question was wrong or unfair. Allowed until the week's correction time ends.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["void", "{id}", "{reason}"], params: [{ name: "id", label: "Question number (on chain)", ...INT }, { name: "reason", label: "Reason (public)", ...REASON }], sends: true },
  { id: "pause", area: "vault", kind: "emergency", label: "Pause new deposits", what: "Stops NEW deposits only. Withdrawals, answers and claims keep working. Choose off to resume.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["pause", "{state}"], params: [{ name: "state", label: "Pause", ...ONOFF }], sends: true },
  { id: "claim-fee", area: "vault", kind: "money", label: "Collect the 5% producer fee", what: "Sends the accumulated producer fee (KOIN) to the owner wallet.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["claim-fee"], sends: true },
  { id: "seed-vhp", area: "vault", kind: "money", label: "Add seed VHP", what: "Moves VHP from the seed owner's wallet into the vault's prize pool.", signer: "Seed owner (SEED_WIF, else OWNER_WIF)", effect: "chain", timing: AT_ONCE, tool: "bot", args: ["seed-vhp", "{amount}"], params: [{ name: "amount", label: "VHP", ...AMOUNT }], sends: true },
  { id: "seed-withdraw", area: "vault", kind: "money", label: "Seed withdrawal, step 1: announce", what: "Announces taking seed VHP/KOIN back out. Players see it on the Trust page during a 48-hour wait.", signer: "Seed owner (SEED_WIF, else OWNER_WIF)", effect: "chain", timing: "Starts the 48-hour wait", step: 1, tool: "bot", args: ["seed-withdraw", "{vhp}", "{koin}"], params: [{ name: "vhp", label: "VHP", ...AMOUNT }, { name: "koin", label: "KOIN", ...AMOUNT }], sends: true },
  { id: "seed-execute", area: "vault", kind: "money", label: "Seed withdrawal, step 2: carry it out", what: "Carries out the announced seed withdrawal.", when: "After the 48 hours, within 7 days.", signer: "Seed owner (SEED_WIF, else OWNER_WIF)", effect: "chain", timing: AT_ONCE, step: 2, tool: "bot", args: ["seed-withdraw", "execute"], sends: true },
  { id: "game-upgrade-status", area: "vault", kind: "upgrade", label: "Upgrade status", what: "Is an upgrade announced, and does it match the code built on this PC?", signer: RO, effect: "none", tool: "bot", args: ["upgrade", "status"], sends: false },
  { id: "game-upgrade-schedule", area: "vault", kind: "upgrade", label: "Upgrade, step 1: announce", what: "Announces the code built on this PC (contracts/vault/build/release). Players get 48 hours' notice.", signer: OWNER, effect: "chain", timing: "Starts the 48-hour notice", step: 1, tool: "bot", args: ["upgrade", "schedule"], sends: true },
  { id: "game-upgrade-apply", area: "vault", kind: "upgrade", label: "Upgrade, step 2: upload the announced code", what: "Uploads the announced code. The owner wallet signs and pays; the new fingerprint is written to deployment.json.", when: "After the 48 hours.", signer: OWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "bot", args: ["upgrade", "apply"], sends: true },
  { id: "game-upgrade-cancel", area: "vault", kind: "upgrade", label: "Upgrade, step 3: clear the announcement", what: "Clears an announced upgrade: to cancel it, or as the last step after a successful upload.", signer: OWNER, effect: "chain", timing: AT_ONCE, step: 3, tool: "bot", args: ["admin", "cancel_upgrade", "--as", "owner"], sends: true },
  { id: "set-operator", area: "vault", kind: "ownership", label: "Change the bot wallet (operator)", what: "Sets the wallet the hourly bot uses to post questions and results.", when: "Only on a Sunday after Saturday's windows end. Then update OPERATOR_WIF on GitHub and in .env.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["admin", "set_operator", "operator={address}", "--as", "owner"], params: [{ name: "address", label: "New operator address", ...ADDRESS }], sends: true },
  { id: "propose-owner", area: "vault", kind: "ownership", label: "Hand over the vault, step 1: propose", what: "Proposes a new owner for the vault (every game in it). Any announced upgrade is cleared when they accept.", signer: OWNER, effect: "chain", timing: "The new owner can accept about a day later", step: 1, tool: "bot", args: ["admin", "propose_owner", "new_owner={address}", "--as", "owner"], params: [{ name: "address", label: "New owner address", ...ADDRESS }], sends: true },
  { id: "accept-owner", area: "vault", kind: "ownership", label: "Hand over the vault, step 2: accept", what: "The new owner accepts and takes over the vault.", signer: NEWOWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "bot", args: ["admin", "accept_owner", "--as", "new"], sends: true },
  { id: "propose-seed", area: "vault", kind: "ownership", label: "Hand over the seed, step 1: propose", what: "Proposes a new seed owner. A pending seed withdrawal is cancelled when they accept.", signer: "Seed owner (SEED_WIF, else OWNER_WIF)", effect: "chain", timing: "The new seed owner can accept about a day later", step: 1, tool: "bot", args: ["admin", "propose_seed_owner", "new_seed_owner={address}", "--as", "seed"], params: [{ name: "address", label: "New seed owner address", ...ADDRESS }], sends: true },
  { id: "accept-seed", area: "vault", kind: "ownership", label: "Hand over the seed, step 2: accept", what: "The new seed owner accepts.", signer: NEWOWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "bot", args: ["admin", "accept_seed_owner", "--as", "new"], sends: true },

  // ════════ Who Signs Block X (game 2, Picks contract) ════════
  { id: "picks-status-2", area: "blockx", kind: "check", label: "Picks contract status", what: "Code fingerprint and the three safety switches, checked on two nodes; owner; games and anything announced.", signer: RO, effect: "none", tool: "picks", args: ["status", "--mainnet"], sends: false },
  { id: "picks-pause", area: "picks", kind: "emergency", label: "Pause a game now", what: "Switches the game off at once. Picks already made stay recorded. Switching it back on needs a new announcement and 48 hours.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "picks", args: ["pause", "{game}", "--mainnet"], params: [{ name: "game", label: "Game id", ...GAMEID }], sends: true },
  { id: "picks-upload", area: "picks", kind: "upgrade", label: "Upload the Picks contract (done 30 Oct)", what: "Puts the audited Picks contract onto the new Picks wallet (PICKS_WIF), once. Send that wallet no KOIN: the Mana is paid by PAYER_WIF (else OPERATOR_WIF).", when: "Done 30 Oct (the Picks contract is on mainnet). Never again for this wallet.", signer: "Picks wallet (PICKS_WIF) + payer (PAYER_WIF or OPERATOR_WIF)", effect: "chain", timing: AT_ONCE, tool: "picks", args: ["upload", "--mainnet"], sends: true },
  { id: "picks-announce", area: "picks", kind: "launch", label: "Add a Picks game, step 1: announce", what: "Announces a game on the Picks contract with its fixed rules (they are written in bot/picks.ts and can never change). Players get 48 hours' notice. The tool refuses a game it doesn't know.", when: "Only on Vault's word, with a dry run pasted to Vault first. 8, 18 and 19 are already announced (Mon 23 Nov): don't announce them again (a new announce restarts the 48 hours).", signer: OWNER, effect: "chain", timing: "Starts the 48-hour notice", step: 1, tool: "picks", args: ["announce", "{game}", "--mainnet"], params: [{ name: "game", label: "Game id", ...GAMEID }], sends: true },
  { id: "picks-apply", area: "picks", kind: "launch", label: "Add a Picks game, step 2: apply", what: "Puts an announced game in force; picks open. The dry run shows the exact rules first.", when: "8 (Combo): Wed 25 Nov from ~9:35 AM ET. 18 and 19 (Within 5 / 10 blocks): Mon 30 Nov, before the owner-propose (their window runs Wed 25 8:29 PM to Wed 2 Dec 8:29 PM ET). Dry run to Vault first.", signer: OWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "picks", args: ["apply", "{game}", "--mainnet"], params: [{ name: "game", label: "Game id", ...GAMEID }], sends: true },
  { id: "picks-status-p", area: "picks", kind: "check", label: "Picks contract status", what: "Code fingerprint (v2 92d555d0) and the three safety switches, checked on two nodes; the owner; every game in force and anything announced. After the Mon 30 applies it must show no \"Announced game\" lines before the owner-propose.", signer: RO, effect: "none", tool: "picks", args: ["status", "--mainnet"], sends: false },
  { id: "picks-upgrade-clear", area: "picks", kind: "upgrade", label: "Clear the v2 upgrade announcement (upgrade-clear)", what: "Clears the announced v2 code hash, so the same code can't be uploaded a second time. v2 is already uploaded (Sun 22 Nov). The send carries --code 92d555d0, the first 8 characters of v2's fingerprint, as the tool requires.", when: "Wed 25 Nov, after Picks apply 8 (Vault's steps); dry run to Vault first. Its announcement lapses by itself Sun 29 Nov 4:26 PM ET anyway.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "picks", args: ["upgrade-clear", "--mainnet", "--code", "92d555d0"], sends: true },
  { id: "picks-owner-propose", area: "picks", kind: "ownership", label: "Hand the Picks contract to the cold wallet, step 1: propose", what: "Proposes the new owner. The tool accepts only the address pinned as nextOwner in picks-data/deployment.json (PR #83), and refuses while any game announcement or upgrade is waiting.", when: "Mon 30 Nov, after apply 18 and 19, a clean status and #83 merged. Dry run to Vault first.", signer: OWNER, effect: "chain", timing: "The new owner can accept from 48 hours to 7 days later", step: 1, tool: "picks", args: ["owner-propose", "{address}", "--mainnet"], params: [{ name: "address", label: "New owner (the pinned cold wallet)", ...ADDRESS }], sends: true },
  { id: "picks-owner-accept", area: "picks", kind: "ownership", label: "Hand the Picks contract to the cold wallet, step 2: accept", what: "The new owner accepts and takes over the Picks contract. Signed by NEW_OWNER_WIF: put it in .env for this one command, then take it out. That wallet pays its own Mana, so it needs a little KOIN.", when: "48 hours to 7 days after the propose.", signer: NEWOWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "picks", args: ["owner-accept", "--mainnet"], sends: true },
  { id: "picks-owner-cancel", area: "picks", kind: "ownership", label: "Hand-over: cancel the proposal", what: "Withdraws a proposal that hasn't been accepted.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "picks", args: ["owner-cancel", "--mainnet"], sends: true },

  // ════════ Read-only checks in each game's own area (Survivor, Fantasy, Combo, Bracket, Last Node, Over Under, VS) ════════
  { id: "survivor-picks", area: "survivor", kind: "check", label: "Picks contract status (game 3 in force?)", what: "The Picks contract's games and anything announced: Survivor is game 3.", signer: RO, effect: "none", tool: "picks", args: ["status", "--mainnet"], sends: false },
  { id: "fantasy-vault", area: "fantasy", kind: "check", label: "Vault: is Fantasy in, and from which week?", what: "Every game in the vault. After the apply, game 4 must say it earns from week 6.", signer: RO, effect: "none", tool: "bot", args: ["games"], sends: false },
  { id: "combo-picks", area: "combo", kind: "check", label: "Picks contract status (game 8 applied?)", what: "The Picks contract's games and anything announced. After Wed's apply 8, game 8 is in the list and no \"Announced game 8\" line is left.", signer: RO, effect: "none", tool: "picks", args: ["status", "--mainnet"], sends: false },
  { id: "bracket-vault", area: "bracket", kind: "check", label: "Vault: the Bracket's stake and week", what: "Every game in the vault, the Bracket (game 9) included.", signer: RO, effect: "none", tool: "bot", args: ["games"], sends: false },
  { id: "lastnode-vault", area: "lastnode", kind: "check", label: "Vault: is Last Node in, and from which week?", what: "Every game in the vault. After the apply, game 13 must say it earns from week 6.", signer: RO, effect: "none", tool: "bot", args: ["games"], sends: false },
  { id: "overunder-vault", area: "overunder", kind: "check", label: "Vault: Over Under's announcement", what: "Every game in the vault: game 16 shows as announced until the Mon 30 apply, then \"from week 7\".", signer: RO, effect: "none", tool: "bot", args: ["games"], sends: false },
  { id: "vs-prizes", area: "vs", kind: "check", label: "Free prizes: every game's switch (VS is game 17)", what: "Each game's free 2 + 1 VHP prize switch, this week and next. VS has no prize in the TEST.", signer: RO, effect: "none", tool: "prizes", args: ["list"], sends: false },

  // ════════ Producer Race (game 7) ════════
  { id: "race-status-2", area: "race", kind: "check", label: "Race picks status", what: "The race contract's code, its settings and today's picks.", signer: RO, effect: "none", tool: "racepicks", args: ["status"], sends: false },
  { id: "race-limit", area: "race", kind: "settings", label: "Picks per wallet per day (0 = none)", what: "How many race picks one wallet may make a day. 0 means no per-game limit (the race types are live from vault week 5; the Mana sponsor's daily limit is the cap). Emergency only: 20, then 10, and only if the race types' file passes 60% (RUNBOOK §3); back to 0 after Mon 30 Nov.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "racepicks", args: ["limit", "{n}"], params: [{ name: "n", label: "Picks a day (0 = none, or 1 to 20)", pattern: /^(0|[1-9]|1\d|20)$/, hint: "0 to 20", value: "0" }], sends: true },
  { id: "race-enable", area: "race", kind: "settings", label: "Switch race picks on", what: "Players can make race picks again.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "racepicks", args: ["enable"], sends: true },
  { id: "race-disable", area: "race", kind: "emergency", label: "Switch race picks off", what: "Stops new race picks at once. Picks already made stay recorded.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "racepicks", args: ["disable"], sends: true },

  // ════════ Knode Swap (Desk) ════════
  { id: "desk-status-2", area: "desk", kind: "check", label: "Desk status", what: "KOIN available, VHP producing, swaps and settings.", signer: RO, effect: "none", tool: "desk", args: ["status"], sends: false },
  { id: "desk-key-status", area: "desk", kind: "check", label: "Node key on record", what: "Which block-producer key Proof-of-Burn has on record for the Desk.", signer: RO, effect: "none", tool: "desk", args: ["key-status"], sends: false },
  { id: "desk-fee", area: "desk", kind: "settings", label: "Swap fee", what: "The fee taken on each swap, in percent (0 to 10).", signer: OWNER, effect: "chain", timing: "Raising applies at once; lowering waits 48 hours (then Apply waiting settings)", tool: "desk", args: ["fee", "{percent}"], params: [{ name: "percent", label: "Fee %", ...PERCENT, value: "3" }], sends: true },
  { id: "desk-limits", area: "desk", kind: "settings", label: "Swap size limits", what: "The smallest and largest single swap, in VHP (largest 0 = no fixed cap).", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "desk", args: ["limits", "{min}", "{max}"], params: [{ name: "min", label: "Smallest swap (VHP)", ...AMOUNT }, { name: "max", label: "Largest swap (VHP, 0 = no cap)", ...AMOUNT }], sends: true },
  { id: "desk-cap", area: "desk", kind: "settings", label: "Daily payout cap", what: "The most KOIN swaps may pay out; room frees up at this much per 24 hours (0 = no cap). You chose no cap on 28 Oct.", signer: OWNER, effect: "chain", timing: "Lowering applies at once; raising or removing waits 48 hours", tool: "desk", args: ["daily-cap", "{koin}"], params: [{ name: "koin", label: "KOIN per 24 hours", ...AMOUNT, value: "0" }], sends: true },
  { id: "desk-settings-apply", area: "desk", kind: "settings", label: "Apply waiting settings", what: "Carries out a waiting fee cut, cap raise or node key.", when: "After their 48 hours.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "desk", args: ["settings", "apply"], sends: true },
  { id: "desk-settings-cancel", area: "desk", kind: "settings", label: "Cancel waiting settings", what: "Drops a waiting fee cut, cap raise or node key.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "desk", args: ["settings", "cancel"], sends: true },
  { id: "desk-key", area: "desk", kind: "settings", label: "Announce the node key", what: "The Desk node's PUBLIC key (or: node, to read it from the key file on this PC). Registered by Apply waiting settings after 48 hours.", signer: OWNER, effect: "chain", timing: NOTICE, tool: "desk", args: ["register-key", "{key}"], params: [{ name: "key", label: "Public key", ...KEY }], sends: true },
  { id: "desk-pause", area: "desk", kind: "emergency", label: "Pause swaps", what: "Stops swaps at once. Withdrawals to the treasury keep working. Choose off to resume.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "desk", args: ["pause", "{state}"], params: [{ name: "state", label: "Pause", ...ONOFF }], sends: true },
  { id: "desk-withdraw", area: "desk", kind: "money", label: "Withdraw to the treasury", what: "Takes KOIN or VHP out of the Desk. It can only ever go to the treasury address.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "desk", args: ["withdraw", "{token}", "{amount}"], params: [{ name: "token", label: "Token", pattern: /^(koin|vhp)$/, hint: "koin or vhp", choices: ["koin", "vhp"] }, { name: "amount", label: "Amount", ...AMOUNT }], sends: true },
  { id: "treasury-schedule", area: "desk", kind: "money", label: "Treasury address, step 1: announce", what: "Announces a new treasury address (your cold wallet).", signer: OWNER, effect: "chain", timing: "Starts the 48-hour wait", step: 1, tool: "desk", args: ["treasury", "schedule", "{address}"], params: [{ name: "address", label: "New treasury", ...ADDRESS }], sends: true },
  { id: "treasury-apply", area: "desk", kind: "money", label: "Treasury address, step 2: apply", what: "Makes the announced treasury address the real one.", when: "After the 48 hours.", signer: OWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "desk", args: ["treasury", "apply"], sends: true },
  { id: "treasury-cancel", area: "desk", kind: "money", label: "Treasury address: cancel", what: "Drops an announced treasury change.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "desk", args: ["treasury", "cancel"], sends: true },
  { id: "desk-upgrade-status", area: "desk", kind: "upgrade", label: "Upgrade status", what: "Is a Desk upgrade announced, and does it match the code built on this PC?", signer: RO, effect: "none", tool: "desk", args: ["upgrade", "status"], sends: false },
  { id: "desk-upgrade-schedule", area: "desk", kind: "upgrade", label: "Upgrade, step 1: announce", what: "Announces the Desk code built on this PC. 48 hours' notice.", signer: OWNER, effect: "chain", timing: "Starts the 48-hour notice", step: 1, tool: "desk", args: ["upgrade", "schedule"], sends: true },
  { id: "desk-upgrade-apply", area: "desk", kind: "upgrade", label: "Upgrade, step 2: upload the announced code", what: "Uploads the announced Desk code; the owner signs and pays.", when: "After the 48 hours.", signer: OWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "desk", args: ["upgrade", "apply"], sends: true },
  { id: "desk-upgrade-cancel", area: "desk", kind: "upgrade", label: "Upgrade, step 3: clear the announcement", what: "Clears the announcement: to cancel it, or as the last step after a successful upload.", signer: OWNER, effect: "chain", timing: AT_ONCE, step: 3, tool: "desk", args: ["upgrade", "cancel"], sends: true },
  { id: "desk-owner-propose", area: "desk", kind: "ownership", label: "Hand over the Desk, step 1: propose", what: "Proposes a new Desk owner.", signer: OWNER, effect: "chain", timing: "The new owner can accept after 48 hours", step: 1, tool: "desk", args: ["owner", "propose", "{address}"], params: [{ name: "address", label: "New owner address", ...ADDRESS }], sends: true },
  { id: "desk-owner-accept", area: "desk", kind: "ownership", label: "Hand over the Desk, step 2: accept", what: "The new owner accepts and takes over the Desk.", signer: NEWOWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "desk", args: ["owner", "accept"], sends: true },
  { id: "desk-owner-cancel", area: "desk", kind: "ownership", label: "Hand over the Desk: cancel", what: "Drops a proposed owner change.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "desk", args: ["owner", "cancel"], sends: true },

  // ════════ Knode Vault (v6) ════════
  { id: "vault-games", area: "vault", kind: "check", label: "Vault and games status", what: "Every game in the vault: its stake, this week's state, prizes waiting and the 5% fee owed.", signer: RO, effect: "none", tool: "bot", args: ["games"], sends: false },
  { id: "vault-game-add", area: "vault", kind: "launch", label: "Add a game, step 1: announce it", what: "Announces a game in the vault with a stake bucket and the free 2 + 1 VHP prize allowed. Players get 48 hours' notice. Whether the free prize is actually paid is the Free prize ON / OFF switch below (D-082): switch it OFF first for a game that shouldn't pay it yet.", when: "Once per game, after its own chat and Vault say it is ready. Already announced: 4 Fantasy, 13 Last Node (Sun 22 Nov), 16 Over Under (Sun 22 Nov), 8 Combo (Mon 23 Nov). Not now: 3 Survivor (after K9/K1b, D-750); 17 VS is never a vault game. The vault holds at most 12 games besides Questions.", signer: OWNER, effect: "chain", timing: "Starts the 48-hour notice", step: 1, tool: "bot", args: ["game-add", "{game}", "{name}", "--staked", "--free", "--season", "{season}"], params: [{ name: "game", label: "Game id", ...VGAME, value: "7" }, { name: "name", label: "Game name", ...GAMENAME, value: "Producer Race" }, { name: "season", label: "Weeks per season (1 for most games; Survivor 2)", ...SEASON, value: "1" }], sends: true },
  { id: "prizes-list", area: "vault", kind: "check", label: "Free prizes: which games pay them", what: "Each game's free 2 + 1 VHP prize switch, this week and next week. Changes nothing.", signer: RO, effect: "none", tool: "prizes", args: ["list"], sends: false },
  { id: "prizes-on", area: "vault", kind: "settings", label: "Free prize ON for a game (from next week)", what: "The bot posts that game's free-play winners again, from next Monday 00:00 UTC. This week stays as it is. Only works for a game added with the free prize (Add a game does that).", when: "When the seed can cover another game's free prize (D-082).", signer: GIT_PRIZES, effect: "files", timing: "From next Monday 00:00 UTC; never this week", tool: "prizes", args: ["on", "{game}"], params: [{ name: "game", label: "Game id", ...PRIZEGAME, value: "3" }], sends: true },
  { id: "prizes-off", area: "vault", kind: "settings", label: "Free prize OFF for a game (from next week)", what: "The bot stops posting that game's free-play winners from next Monday 00:00 UTC; the vault sends that prize back to the pool. Free play and its leaderboard stay. This week stays as it is.", when: "To take a game's free prize away (D-082).", signer: GIT_PRIZES, effect: "files", timing: "From next Monday 00:00 UTC; never this week", tool: "prizes", args: ["off", "{game}"], params: [{ name: "game", label: "Game id", ...PRIZEGAME, value: "3" }], sends: true },
  { id: "vault-game-apply", area: "vault", kind: "launch", label: "Add a game, step 2: switch it on (game-apply)", what: "Puts the announced game in force: players can stake in it from the staking page, and it appears there at once. A game applied in vault week W earns from week W + 1. The dry run names that week: if it isn't the one below, stop and ask Vault.", when: "After the 48 hours, within 7 days. 4 Fantasy and 13 Last Node: Tue 24 Nov from 6:21 PM ET (week 6). 8 Combo and 16 Over Under: Mon 30 Nov (week 7); 16's window closes Tue 1 Dec ~6:26 PM ET and 8's Wed 2 Dec ~9:30 AM ET. Dry run to Vault first; expect one red bot run after each apply.", signer: OWNER, effect: "chain", timing: "At once; stakes count from the next Monday", step: 2, tool: "bot", args: ["game-apply", "{game}"], params: [{ name: "game", label: "Game id", ...VGAME }], sends: true },
  { id: "vault-game-stop", area: "vault", kind: "emergency", label: "Stop a game", what: "The game takes no new stakes from now and earns through this week. Players keep full access to their stake and can still claim what they won.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-stop", "{game}"], params: [{ name: "game", label: "Game id", ...VGAME }], sends: true },
  { id: "vault-game-post", area: "vault", kind: "weekly", label: "Post a week's results", what: "Posts a game's week from its published results file, then seals it.", when: "Only if the hourly bot missed it.", signer: OPERATOR, effect: "chain", timing: AT_ONCE, step: 1, tool: "bot", args: ["game-post", "{game}", "{week}"], params: [{ name: "game", label: "Game id", ...VGAME }, { name: "week", label: "Week", ...WEEK }], sends: true },
  { id: "vault-game-seal", area: "vault", kind: "weekly", label: "Seal a week's results", what: "Seals a posted week so its results can no longer be added to (corrections stay possible until it is finalized).", signer: OPERATOR, effect: "chain", timing: AT_ONCE, step: 2, tool: "bot", args: ["game-seal", "{game}", "{week}"], params: [{ name: "game", label: "Game id", ...VGAME }, { name: "week", label: "Week", ...WEEK }], sends: true },
  { id: "vault-game-finalize", area: "vault", kind: "weekly", label: "Finalize a week", what: "Fixes the week's prizes so players can claim them.", when: "After the correction window.", signer: OPERATOR, effect: "chain", timing: AT_ONCE, step: 3, tool: "bot", args: ["game-finalize", "{game}", "{week}"], params: [{ name: "game", label: "Game id", ...VGAME }, { name: "week", label: "Week", ...WEEK }], sends: true },
  { id: "vault-game-correct", area: "vault", kind: "settings", label: "Correct a player's points", what: "Changes one player's points for a sealed week (0 removes them). Only before the week is finalized.", when: "Only if a result was wrong.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-correct", "{game}", "{week}", "{player}", "{points}"], params: [{ name: "game", label: "Game id", ...VGAME }, { name: "week", label: "Week", ...WEEK }, { name: "player", label: "Player address", ...ADDRESS }, { name: "points", label: "Points (0 removes them)", ...INT }], sends: true },
  { id: "vault-game-unprize", area: "vault", kind: "settings", label: "Remove a player's free prize", what: "Takes a free-game prize away from one player for a week (for example a farmed wallet). Only before the week is finalized.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-unprize", "{game}", "{week}", "{player}"], params: [{ name: "game", label: "Game id", ...VGAME }, { name: "week", label: "Week", ...WEEK }, { name: "player", label: "Player address", ...ADDRESS }], sends: true },
  { id: "vault-game-void", area: "vault", kind: "settings", label: "Void a game's week", what: "Cancels a week in one game: its bucket rolls over within the game and its free prize goes back to the pool.", when: "Only if the whole week was broken.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-void", "{game}", "{week}"], params: [{ name: "game", label: "Game id", ...VGAME }, { name: "week", label: "Week", ...WEEK }], sends: true },
  { id: "vault-fee-vhp", area: "vault", kind: "money", label: "Collect the 5% fee (VHP)", what: "Sends all of the vault's fee owed in VHP to the owner wallet.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["claim-fee-vhp", "all"], sends: true },

  // ════════ Block Golf (game 6; no contract: docs/GOLF.md; the Golf chat's spec claude/golf/TO-HUB-ADMIN-GOLF.md) ════════
  // Game 6 is fixed in each command (not a box to fill in), so none of these can touch another game by mistake.
  { id: "golf-status", area: "golf", kind: "check", label: "Block Golf status", what: "Reads Block Golf's published files from GitHub and prints the course, each week's state, each hole and why it waits, and the switches. Changes nothing.", when: "The first thing to press, and after any switch change.", signer: RO, effect: "none", tool: "golf", args: ["status"], sends: false },
  { id: "golf-games", area: "golf", kind: "check", label: "Vault: is Block Golf in?", what: "Every game in the vault. After the launch steps, expect \"Block Golf … staked + free prize, from week <n>\": that week number is what GOLF_STAKED_FROM_WEEK gets.", signer: RO, effect: "none", tool: "bot", args: ["games"], sends: false },
  { id: "golf-prize-off", area: "golf", kind: "launch", label: "Launch, step 1: free prize OFF for Block Golf (before adding it)", what: "Records that game 6 pays no 2 + 1 VHP free prize. Free play and its board stay.", when: "Send it the same week as step 2, or earlier. Otherwise game 6 pays the free prize: a game with no switch entry follows how it was added (with the free prize = ON).", signer: GIT_PRIZES, effect: "files", timing: "From next Monday 00:00 UTC; never this week", step: 1, tool: "prizes", args: ["off", "6"], sends: true },
  { id: "golf-game-add", area: "golf", kind: "launch", label: "Launch, step 2: add Block Golf to the vault (48-hour notice)", what: "Announces game 6, \"Block Golf\", in the vault: a stake bucket, the free prize allowed (switched off by step 1), a 1-week season. Players get 48 hours' notice.", when: "Latest Friday about noon PT to earn from the next Monday.", signer: OWNER, effect: "chain", timing: "Starts the 48-hour notice", step: 2, tool: "bot", args: ["game-add", "6", "Block Golf", "--staked", "--free", "--season", "1"], sends: true },
  { id: "golf-game-apply", area: "golf", kind: "launch", label: "Launch, step 3: switch Block Golf on in the vault", what: "Puts game 6 in force: players can stake in Block Golf from the staking page. Then press Vault: is Block Golf in? for the week it earns from.", when: "In the vault week BEFORE the one it should earn from (it earns from the next Monday), after the 48 hours and within 7 days. For Week 2 (vault week 5): after Sun 15 Nov 7 PM ET, before Sat 21 Nov 3:16 PM ET.", signer: OWNER, effect: "chain", timing: "At once; stakes count from the next Monday", step: 3, tool: "bot", args: ["game-apply", "6"], sends: true },
  { id: "golf-game-stop", area: "golf", kind: "emergency", label: "Stop Block Golf in the vault", what: "Game 6 takes no new stakes from now and earns through this week. Players keep full access to their stake and can still claim what they won.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-stop", "6"], sends: true },
  { id: "golf-game-correct", area: "golf", kind: "emergency", label: "Correct a player's Block Golf points", what: "Changes one player's points for a sealed Block Golf week (0 removes them). Only before the week is finalized.", when: "Only if a result was wrong. To stop a week being paid at all, hold it instead (GitHub switches, step 3).", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-correct", "6", "{week}", "{player}", "{points}"], params: [{ name: "week", label: "Week", ...WEEK }, { name: "player", label: "Player address", ...ADDRESS }, { name: "points", label: "Points (0 removes them)", ...INT }], sends: true },
  { id: "golf-game-void", area: "golf", kind: "emergency", label: "Void a Block Golf week", what: "Cancels a week in Block Golf: its bucket rolls over within the game.", when: "Only if the whole week was broken.", signer: OWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-void", "6", "{week}"], params: [{ name: "week", label: "Week", ...WEEK }], sends: true },

  // ════════ Wallet names (docs/NAMES.md) ════════
  { id: "names-list", area: "names", kind: "check", label: "Names on the site", what: "Every @name, pool name and hidden address now published.", signer: RO, effect: "none", tool: "names", args: ["list"], sends: false },
  { id: "names-hide", area: "names", kind: "emergency", label: "Hide a name", what: "The site shows that wallet's short address instead of its @name. The reason is public.", when: "For a rude or misleading name.", signer: GIT, effect: "files", tool: "names", args: ["hide", "{address}", "{reason}"], params: [{ name: "address", label: "Wallet address", ...ADDRESS }, { name: "reason", label: "Reason (public)", ...REASON }], sends: true },
  { id: "names-unhide", area: "names", kind: "settings", label: "Show a hidden name again", what: "Undoes Hide a name.", signer: GIT, effect: "files", tool: "names", args: ["unhide", "{address}"], params: [{ name: "address", label: "Wallet address", ...ADDRESS }], sends: true },
  { id: "names-nicknames", area: "names", kind: "settings", label: "Refresh @names and pool names now", what: "Reads every player's and producer's Koinos @name, and the producers' pool names, from the chain (two nodes must agree) and publishes them. The workflow does this every hour.", signer: GIT, effect: "files", tool: "names", args: ["nicknames"], sends: true },

  // ════════ Testnet: vault v6 trial ════════
  { id: "t-vault-games", area: "t-vault", kind: "check", label: "Testnet vault status", what: "Every game in the testnet vault, its stake and this week's state.", signer: RO, effect: "none", tool: "bot", args: ["games", "--testnet"], sends: false },
  { id: "t-vault-game-add", area: "t-vault", kind: "launch", label: "Trial, step 1: announce a game", what: "Announces a test game (both a stake bucket and the free prize).", signer: TOWNER, effect: "chain", timing: "Starts the testnet notice", step: 1, tool: "bot", args: ["game-add", "{game}", "{name}", "--staked", "--free", "--season", "{season}", "--testnet"], params: [{ name: "game", label: "Game id", ...VGAME, value: "7" }, { name: "name", label: "Game name", ...GAMENAME, value: "Producer Race" }, { name: "season", label: "Weeks per season", ...SEASON, value: "1" }], sends: true },
  { id: "t-vault-game-apply", area: "t-vault", kind: "launch", label: "Trial, step 2: switch the game on", what: "Puts the announced test game in force on the local node.", signer: TOWNER, effect: "chain", timing: AT_ONCE, step: 2, tool: "bot", args: ["game-apply", "{game}", "--testnet"], params: [{ name: "game", label: "Game id", ...VGAME, value: "7" }], sends: true },
  { id: "t-vault-game-post", area: "t-vault", kind: "launch", label: "Trial, step 3: post a week", what: "Posts and seals a test week from the game's results file.", signer: TOPERATOR, effect: "chain", timing: AT_ONCE, step: 3, tool: "bot", args: ["game-post", "{game}", "{week}", "--testnet"], params: [{ name: "game", label: "Game id", ...VGAME, value: "7" }, { name: "week", label: "Week", ...WEEK }], sends: true },
  { id: "t-vault-game-finalize", area: "t-vault", kind: "launch", label: "Trial, step 4: finalize the week", what: "Fixes the test week's prizes on the local node.", signer: TOPERATOR, effect: "chain", timing: AT_ONCE, step: 4, tool: "bot", args: ["game-finalize", "{game}", "{week}", "--testnet"], params: [{ name: "game", label: "Game id", ...VGAME, value: "7" }, { name: "week", label: "Week", ...WEEK }], sends: true },
  { id: "t-vault-game-stop", area: "t-vault", kind: "emergency", label: "Stop a test game", what: "The test game takes no new stakes.", signer: TOWNER, effect: "chain", timing: AT_ONCE, tool: "bot", args: ["game-stop", "{game}", "--testnet"], params: [{ name: "game", label: "Game id", ...VGAME }], sends: true },

  // ════════ Testnet: sponsor v3 trial (docs/blockx/SPONSOR-TESTNET.md) ════════
  { id: "t-sponsor-status", area: "t-sponsor", kind: "check", label: "Testnet sponsor status", what: "On or off, caps, test KOIN and Mana, today's use.", signer: RO, effect: "none", tool: "sponsor", args: ["status", "--testnet"], sends: false },
  { id: "t-picks-status", area: "t-sponsor", kind: "check", label: "Testnet Picks status", what: "The testnet Picks contract and its games.", signer: RO, effect: "none", tool: "picks", args: ["status", "--testnet"], sends: false },
  { id: "t-sponsor-watch", area: "t-sponsor", kind: "check", label: "Testnet usage alerts (80%)", what: "The 80% warnings, on the testnet sponsor.", signer: RO, effect: "none", tool: "sponsor", args: ["watch", "--testnet"], sends: false },
  { id: "t-sponsor-keys", area: "t-sponsor", kind: "launch", label: "Trial, step 1: new testnet sponsor wallet", what: "Adds SPONSOR_WIF to .env.testnet (once; never shown) and shows its address.", when: "Then send /faucet <address> to @KoinosTestnetFaucetBot in Telegram, a few times: the upload needs about 17 test KOIN.", signer: FILES, effect: "files", step: 1, tool: "sponsor", args: ["keys", "--testnet"], sends: false },
  { id: "t-sponsor-upload", area: "t-sponsor", kind: "launch", label: "Trial, step 2: upload sponsor v3", what: "Uploads the v3 build from contracts/sponsor/build/release (built in C:\\knode-build) to the testnet sponsor wallet, and writes its address into testnet/blockx.json so the testnet page asks it to pay.", signer: TSPONSOR, effect: "chain", timing: AT_ONCE, step: 2, tool: "sponsor", args: ["upload", "--testnet"], sends: true },
  { id: "t-sponsor-caps", area: "t-sponsor", kind: "launch", label: "Trial, step 3: testnet sponsor limits", what: "The same caps as mainnet, on the testnet sponsor.", signer: TSPONSOR, effect: "chain", timing: AT_ONCE, step: 3, tool: "sponsor", args: ["config", "--testnet", ...CAPS_ARGS], params: CAPS_PARAMS, sends: true },
  { id: "t-sponsor-enable", area: "t-sponsor", kind: "launch", label: "Trial, step 4: switch the testnet sponsor on", what: "It starts paying for testnet picks within its caps. Then play from a private window: npm run testnet-site -- --record.", signer: TSPONSOR, effect: "chain", timing: AT_ONCE, step: 4, tool: "sponsor", args: ["enable", "--testnet"], sends: true },
  { id: "t-sponsor-report", area: "t-sponsor", kind: "launch", label: "Trial, step 5: what sponsored picks really used", what: "After some picks on the testnet page: each action's real Mana, read from the chain. Send Claude the output.", signer: RO, effect: "none", step: 5, tool: "sponsor", args: ["mana-report", "--testnet", "--blocks", "{blocks}"], params: [{ name: "blocks", label: "Blocks back (28,800 = a day)", ...INT, value: "28800" }], sends: false },
  { id: "t-sponsor-disable", area: "t-sponsor", kind: "emergency", label: "Switch the testnet sponsor off", what: "Players pay their own test Mana again. Also the way to end the trial.", signer: TSPONSOR, effect: "chain", timing: AT_ONCE, tool: "sponsor", args: ["disable", "--testnet"], sends: true },
];

/** The command line for an action, or the reason it can't run. Values must match their pattern exactly. */
export function commandFor(a: Action, values: Record<string, string>): { argv: string[] } | { error: string } {
  const v: Record<string, string> = {};
  for (const p of a.params ?? []) {
    const x = String(values?.[p.name] ?? "").trim();
    if (!p.pattern.test(x)) return { error: `${p.label}: ${p.hint}` };
    v[p.name] = x;
  }
  const argv: string[] = [];
  for (const t of a.args) {
    const filled = t.replace(/\{(\w+)\}/g, (_m, n) => v[n] ?? "");
    if (filled === "" && /^\{\w+\}$/.test(t)) continue;             // an optional, empty value (e.g. no reason)
    argv.push(...(a.id === "void" && t === "{reason}" ? filled.split(" ").filter(Boolean) : [filled]));
  }
  return { argv };
}
