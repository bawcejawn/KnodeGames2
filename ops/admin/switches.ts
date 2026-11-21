/**
 * Every game and every switch the owner can turn, in one place, for the admin page's "Games at a glance" and
 * "All switches" screens (owner, 12 Nov 2026: "the admin panel should cover it all").
 *
 * Nothing here can sign or send anything and nothing here holds a key or a token. It is plain data:
 *   - GAMES:     every game in the vault's game list (game-data/deployment.json → vaultGames), with the fixed values
 *                the owner's vault commands are pre-filled with;
 *   - VARIABLES: every GitHub repository variable a workflow reads (`vars.X` in .github/workflows). The admin page
 *                cannot set these (that would need a GitHub token), so it explains each one and opens the GitHub page;
 *   - LAUNCH:    the order of steps each game needs before it earns, with the dates the project docs give.
 *
 * tests/audit/admin.overview.test.ts keeps this complete: it fails when a game, a workflow variable or a game's
 * stake control is missing, so a new switch cannot ship without a card here.
 */

/** Opens only this repository's GitHub page (the admin page refuses any other link). */
export const VARIABLES_URL = "https://github.com/bawcejawn/KnodeGames2/settings/variables/actions";

export type Game = {
  id: number;
  name: string;
  /** The admin area (AREAS id) that holds the game's own controls. */
  area: string;
  /** Weeks per season, the value `game-add` is pre-filled with (Survivor 2; the others pay weekly). */
  season: number;
  /** The free 2 + 1 VHP prize switch the owner set when the game was added (D-081, D-082). */
  freePrize: "on" | "off";
  /** False for game 1: the Daily Questions are already in the vault, so they are never added or applied. */
  addable: boolean;
};

/** Source: game-data/deployment.json (vaultGames) and the owner's free-prize decisions: the Vault chat's list of 3 Nov (D-081),
 *  changed for the Bracket to OFF on 11 Nov. The page flags any game whose live switch differs from this plan. */
export const GAMES: Game[] = [
  { id: 1, name: "Daily Questions", area: "question", season: 1, freePrize: "on", addable: false },
  { id: 2, name: "Who Signs Block X", area: "blockx", season: 1, freePrize: "on", addable: true },
  { id: 3, name: "Survivor", area: "survivor", season: 2, freePrize: "off", addable: true },
  { id: 4, name: "Fantasy Producers", area: "fantasy", season: 1, freePrize: "off", addable: true },
  { id: 6, name: "Block Golf", area: "golf", season: 1, freePrize: "off", addable: true },
  { id: 7, name: "Producer Race", area: "race", season: 1, freePrize: "on", addable: true },
  { id: 8, name: "Combo Card", area: "combo", season: 1, freePrize: "off", addable: true },
  { id: 9, name: "Producer Bracket", area: "bracket", season: 1, freePrize: "on", addable: true },
  { id: 13, name: "Last Node Standing", area: "lastnode", season: 1, freePrize: "off", addable: true },
];

export type Variable = {
  name: string;
  /** Game ids it belongs to; an empty list means the whole platform. */
  games: number[];
  /** What to type: shown next to the name. */
  format: string;
  what: string;
  when: string;
  /** Says plainly when a change cannot be undone or when it starts to count. */
  note?: string;
};

const TF = "true or false";
const WEEK = "a vault week number, e.g. 5";
const WEEKS = "vault week numbers, e.g. 5 or 5,6";

/** Every `vars.NAME` the workflows read, 12 Nov 2026. The test reads the workflow files to prove none is missing. */
export const VARIABLES: Variable[] = [
  // ── The whole platform ──
  { name: "BOT_ENABLED", games: [], format: TF, what: "Lets a manual run of the operator bot post and resolve the Daily Questions, close and finalize weeks, post the games' results to the vault and publish question files to the game-data branch.", when: "Leave it unset until you mean to run the bot. Set false to stop it. Stakes and withdrawals are untouched.", note: "There is no timer until you add one. A manual run still checks this switch." },
  { name: "BOT_VOID_ORPHANS", games: [], format: "question numbers, e.g. 31 or 31,32", what: "Lets the bot void on-chain questions it is holding because no question file was found for them (the bot's HELD alert).", when: "Only if the bot's HELD alert says so and the lost question files can't be put back. Run the bot once, then delete the variable.", note: "Leave it unset normally. Without it, the bot holds such questions instead of voiding them." },
  { name: "KG_ENABLE_PAGES", games: [], format: TF, what: "Publishes the website, and only the website, from dist-site.", when: "Set true only when you are ready for GitHub Pages to serve this repository. Leave it unset until then.", note: "Pages must be set to GitHub Actions, not deploy-from-branch. See docs/WORKFLOWS.md." },
  { name: "GAMES_ENABLED", games: [], format: TF, what: "Runs the hourly recorders for Who Signs Block X and the Producer Bracket (the workflow called KnodeGames recorders); each publishes to its own folder on the games-data branch.", when: "Set false to pause both recorders at once.", note: "Takes effect on the next run. The site keeps the last published files." },
  { name: "STATS_ENABLED", games: [], format: TF, what: "Publishes the public summary (stats.json, every 2 hours) that the home page's pool card and stats strip read.", when: "Set false to stop updating it; the site hides figures older than six hours.", note: "Takes effect on the next run." },
  { name: "NAMES_ENABLED", games: [], format: TF, what: "Runs the hourly job that reads Koinos @names and pool names from the chain.", when: "Set false to stop refreshing names.", note: "Takes effect on the next run." },
  { name: "PRIZES_FROM_WEEK", games: [2, 7], format: WEEK, what: "The first vault week Block X and the Producer Race are paid. It must be a plain week number.", when: "Set once, after the games are applied in the vault, and never unset it.", note: "NEVER leave it unset or mistyped: every Block X and Race paid week is then held, staked results included, and if it is not fixed within 3 days that week rolls over." },
  { name: "RPC", games: [], format: "a node address (URL)", what: "The Koinos node the workflows read from. When unset they use the default public node.", when: "Only if that node is down or slow." },
  { name: "RPC_CHECK", games: [], format: "a node address (URL)", what: "A second, independent node. Results are posted only when both nodes agree.", when: "Only if that node is down. Keep it a different operator from RPC, or the two-node check proves nothing." },
  { name: "RPC_SPARE", games: [], format: "a node address (URL)", what: "An optional spare node for the kit games' recorders (Fantasy, Survivor, VS and later Over/Under). When RPC or RPC_CHECK doesn't answer, the spare stands in for it for that run; every run's log says whether the spare answered.", when: "Set it once a node has answered cleanly in the logs for a day. Keep it different from RPC and RPC_CHECK." },
  { name: "RPC_VERIFY", games: [], format: "a node address (URL)", what: "An optional third node that the Race publish job uses to re-check each block's signer. When unset it uses RPC_CHECK.", when: "Only if that node is down." },
  { name: "PERSONAL_PRODUCER", games: [], format: "a producer address", what: "The producer the node watchdog checks every 15 minutes: if it is silent for 30 minutes or more the run fails and GitHub emails you.", when: "When you change which producer you want to watch." },
  { name: "VHP_RULER_ENABLED", games: [], format: TF, what: "Runs the VHP Ruler's data recorder and its fill jobs (read-only on the chain, no key).", when: "Set false only if the Ruler's recorder must stop; ask the Ruler chat first.", note: "Never edit the Ruler's own files from here; this switch only turns its jobs on or off." },
  { name: "VHP_KEEP_DAYS", games: [], format: "a number of days (default 30)", what: "How many days of VHP readings the Ruler's recorder keeps.", when: "Rarely. Raise it only if the Ruler chat asks for longer history." },
  { name: "TESTNET_GAMES_ENABLED", games: [], format: TF, what: "Runs the trial copies of the games on the Koinos Foundation testnet (test KOIN only).", when: "Set true while a game is on trial; false otherwise." },

  // ── Game 1: Daily Questions ──
  { name: "QUESTIONS_FROM_WEEK", games: [1], format: WEEK, what: "The vault week from which the Questions game is paid from its results file (v6.1's rule week).", when: "Set it only once v6.1 is uploaded (the question game's status prints the week).", note: "From that week, a week the vault reads as not shared fails the run instead of paying nothing." },
  { name: "QUESTIONS_HOLD", games: [1], format: WEEKS, what: "Holds those weeks' Questions results: they cannot go final, so nothing is paid for them.", when: "If a question or its results look wrong.", note: "Pair it with a reason below. Remove the week to let it go on, or use release." },
  { name: "QUESTIONS_HOLD_REASON", games: [1], format: "a short sentence", what: "The public reason shown for a hold.", when: "Whenever you set a hold." },
  { name: "QUESTIONS_RELEASE", games: [1], format: WEEKS, what: "Releases a held week once it has been checked.", when: "After a hold, when the week is right." },

  // ── Game 2: Who Signs Block X ──
  { name: "BLOCKX_RELEASE", games: [2], format: "<week>:<release code>, e.g. 5:0123456789abcdef", what: "Lets one held Block X week through, once. The code is printed with the hold.", when: "Only after the cause of that hold was checked.", note: "It releases only that week and only for that same hold reason." },

  // ── Game 6: Block Golf ──
  { name: "GOLF_ENABLED", games: [6], format: TF, what: "Runs the hourly Block Golf recorder.", when: "Set true to start practice weeks; false to stop. Stakes are untouched." },
  { name: "GOLF_STAKED_FROM_WEEK", games: [6], format: WEEK, what: "The vault week Block Golf first pays staked players.", when: "Once, after the game is applied in the vault and its status shows the week (and before that week's first run, Monday 00:57 UTC).", note: "PERMANENT: never change it once a week is published with it; the publish job refuses a change. If the apply slipped, do not set it." },
  { name: "GOLF_HOLD_WEEKS", games: [6], format: WEEKS, what: "Holds those weeks' Block Golf results so they cannot go final.", when: "If a week's course or results look wrong.", note: "Remove the week to release it. Anything that is not a plain list of numbers holds every week until fixed." },

  // ── Game 7: Producer Race ──
  { name: "RACE_ENABLED", games: [7], format: TF, what: "Runs the Race's hourly recorder and its VHP samples.", when: "Set false to stop the Race's recorder. Stakes are untouched." },
  { name: "RACE_HOLD_WEEKS", games: [7], format: WEEKS, what: "Holds those weeks' Race results so they cannot go final.", when: "If a week looks wrong.", note: "Remove the week to release it." },
  { name: "RACE_RULER_FROM_WEEK", games: [7], format: WEEK, what: "The vault week the Race is scored by the VHP Ruler. The week before is a trial week (it counts for nothing); every week from this one is live.", when: "The Race goes live on the Ruler from Week 1 (Mon 16 Nov, vault week 4).", note: "A week that has started never changes how it is scored, and a live week never goes back. Unset = the Race's own method." },

  // ── Game 8: Combo Card ──
  { name: "COMBO_ENABLED", games: [8], format: TF, what: "Runs the Combo Card's hourly recorder, its independent check and its publish job (the workflow called Combo Card).", when: "Set true for launch, together with or after COMBO_RULER_FROM_WEEK (Repo Lens #G-37: by Sun 29 Nov 23:59 UTC for a Mon 30 Nov launch). Set false to stop.", note: "Takes effect on the next hourly run. Stakes and withdrawals are untouched; the site keeps the last published files." },
  { name: "COMBO_RULER_FROM_WEEK", games: [8], format: WEEK, what: "The vault week the Combo Card's race legs are decided by the VHP Ruler (the Race's R<week> cards). The week before is a trial week.", when: "Set 6 (vault week 6, from Sun 29 Nov 7 PM ET) with or before COMBO_ENABLED, and keep RACE_RULER_FROM_WEEK at 6 or below (Repo Lens #G-37).", note: "A week that has started never changes how it is scored, and a live week never goes back. If RACE_RULER_FROM_WEEK is unset or later than this week, the publish job stops and publishes nothing." },

  // ── Game 9: Producer Bracket ──
  { name: "BRACKET_RULER_FROM_WEEK", games: [9], format: WEEK, what: "The vault week the Bracket is scored by the VHP Ruler (the week before is a trial week).", when: "When the Bracket's own Ruler PR is merged (Repo Lens GO first).", note: "A week that has started never changes how it is scored, and a live week never goes back. Before you first set it, unset = the Bracket's own method. Once set, never unset it or move it to a started week: the publish job refuses the change and holds that Bracket week (an email every hour) until it is set back." },
  { name: "BRACKET_RULER_MODE", games: [9], format: "empty, or week:mode pairs like 6:B (modes A to D, weeks rising)", what: "Which VHP Ruler mode (A to D) the Bracket's day cards use from which vault week. Empty = mode A.", when: "Only when the Ruler chat and the owner choose a mode for a future week.", note: "A week that has started never changes mode (the publish job holds the Bracket if it would). Players are never told the mode." },
  { name: "BLOCKX_RULER_FROM_WEEK", games: [2], format: WEEK, what: "The vault week Block X is scored by the VHP Ruler (points = 100 × the ruler's multiplier, at most ×120). The week before is a trial week: the ruler box shows, but the old points count.", when: "5 (Week 2, from Sun 22 Nov 7 PM ET) if the Block X ruler PR merges by Fri 20 Nov noon ET, otherwise 6. Set it after the merge, before that week starts.", note: "A week that has started never changes how it is scored, and a live week never goes back. Before you first set it, unset = the old points (no ruler). Once set, never unset it or move it to a started week: the publish job refuses the change and stops publishing Block X, the Bracket and Questions until it is set back." },
  { name: "BRACKET_PRIZES_FROM_WEEK", games: [9], format: WEEK, what: "The first vault week the Vault pays the Bracket.", when: "After the Bracket is applied in the vault.", note: "Leave unset and no medals or prize lists are shown (it fails closed)." },
  { name: "BRACKET_RELEASE", games: [9], format: WEEKS, what: "Lets the Bracket re-read a week's seeding and hours, and record late picks, for those weeks.", when: "Only when the Bracket chat asks for a one-off release.", note: "A plain list like 3 or 3,4; anything else releases nothing." },

  // ── Game 13: Last Node Standing (on the VHP Ruler from its first live week; no switch for that) ──
  { name: "LASTNODE_ENABLED", games: [13], format: TF, what: "Runs Last Node Standing's hourly recorder and publish job (lastnode.yml).", when: "Set true (with LASTNODE_FROM_WEEK) the day the Last Node PR merges (Sun 22 or Mon 23 Nov; Tuesday's picks open once Picks game 13 is applied, Mon 23); false to stop. Stakes are untouched.", note: "Leave its free-prize switch OFF (owner, 10 and 13 Nov)." },
  { name: "LASTNODE_FROM_WEEK", games: [13], format: WEEK, what: "The first vault week Last Node records and publishes. Events of earlier weeks are never recorded, so switching the recorder on a day early can't fill a week the vault doesn't pay.", when: "Set 5 (Week 2, first event Tue 24 Nov 2026 9 AM ET; Mon 23 is recorded with no players) together with LASTNODE_ENABLED. If the launch slips a week, set 6 (first event Mon 30 Nov).", note: "Required: the recorder doesn't run without it. PERMANENT once a week has been published with it: never move it later (the publish job refuses dropped days)." },
  { name: "LASTNODE_RELEASE_WEEKS", games: [13], format: WEEKS, what: "Releases Last Node weeks that watch-and-hold flagged (a HOLD file), so their vault file can be published.", when: "Only after you reviewed the HOLD file and the week is right.", note: "A plain list like 6 or 6,7; anything else releases nothing." },
  { name: "LASTNODE_PICKS", games: [13], format: "a Koinos address", what: "The Picks contract the Last Node publish job reads picks from.", when: "Leave unset: it defaults to the audited Picks contract (1LmgqBG…6Pm).", note: "Only change it if the Picks contract itself is replaced." },
  { name: "LASTNODE_VAULT", games: [13], format: "a Koinos address", what: "The Knode Games vault the Last Node publish job reads stakes from.", when: "Leave unset: it defaults to the vault (1Mpmf2E…1sr).", note: "Only change it if the vault itself is replaced." },
  { name: "LASTNODE_VHP", games: [13], format: "a Koinos address", what: "The VHP token contract the publish job reads.", when: "Leave unset: it defaults to Koinos's VHP contract (12Y5vW6…Naq).", note: "Never needs changing." },

  // ── Games 4 and 5: Fantasy Producers and Weekly Rival (on the Shared Game Kit; the kit's rendered jobs in games.yml) ──
  { name: "FANTASY_ENABLED", games: [4], format: TF, what: "Runs the Fantasy recorder (the kit's record job) and the kit's publish job for it: price lists, day results, the board and its vault files.", when: "Set true for the practice week, once PR #266 has merged and the Picks games 4 and 5 are live; false to stop. Stakes are untouched.", note: "Takes effect on the next hourly run." },
  { name: "FANTASY_HOLD_WEEKS", games: [4], format: WEEKS, what: "Keeps those Fantasy weeks pending, so they cannot go final and nothing is paid for them yet.", when: "If a week's results look wrong.", note: "Remove the week to let it go final again." },
  { name: "FANTASY_RELEASE", games: [4], format: "<week>:<release code>, e.g. 5:0123456789abcdef", what: "Lets one held Fantasy week through, once (a HOLD file: a final week the chain now reads differently). The code is printed with the hold.", when: "Only after the cause of that hold was checked.", note: "Anything but that exact week and code releases nothing." },
  { name: "FANTASY_RESET_FROM_WEEK", games: [4], format: WEEK, what: "Starts that Fantasy week with no carried teams (a fresh start), instead of carrying last week's teams.", when: "Only if Fantasy was switched off for weeks and comes back; ask the Fantasy chat first.", note: "Unset: teams carry from the last final week, as usual." },

  // ── Game 3: Survivor (on the Shared Game Kit; the kit's rendered jobs in games.yml) ──
  { name: "SURVIVOR_ENABLED", games: [3], format: TF, what: "Runs the Survivor recorder (the kit's record job) and the kit's publish job for it: each play day's result, the live week, the board and its vault files.", when: "Set true once the Survivor PR has merged and Picks game 3 is live, before Season 1's day 1 (Mon 30 Nov 2026); false to stop. Stakes are untouched.", note: "Takes effect on the next hourly run. Weeks before Season 1 (vault week 6) are never recorded." },
  { name: "SURVIVOR_HOLD_WEEKS", games: [3], format: WEEKS, what: "Keeps those Survivor weeks pending, so they cannot go final and nothing is paid for them yet.", when: "If a week's results look wrong.", note: "Remove the week to let it go final again. A held first week also holds its season's second week." },
  { name: "SURVIVOR_RELEASE", games: [3], format: "<week>:<release code>, e.g. 8:0123456789abcdef", what: "Lets one held Survivor week through, once (a HOLD file: a final week the chain now reads differently). The code is printed with the hold.", when: "Only after the cause of that hold was checked.", note: "Anything but that exact week and code releases nothing." },
  { name: "SURVIVOR_RESET_FROM_WEEK", games: [3], format: WEEK, what: "Starts a new Survivor season at that week with no carried picks (a fresh start).", when: "Only if Survivor was switched off for weeks and comes back; it must be a season's first week (6, 8, 10 …), or the recorder stops. Ask the Survivor chat first.", note: "Unset: seasons run every 2 weeks from week 6." },

  // ── Game 17: Knode Games VS (kit game). Cards sit under "whole platform" (games: []) until the Vault adds game 17 to deployment.json, which the admin game list must match exactly ──
  { name: "VS_ENABLED", games: [], format: TF, what: "Runs the Knode Games VS recorder (the kit's record job) and the kit's publish job for it: the weekly roster file, each day's results, the board and its vault files.", when: "Set true once the VS PRs (#40 and #47) are on main and the node-retry fix is merged. This is the TEST: no prizes, so leave VS_PRIZES_FROM_WEEK unset. False to stop. Stakes are untouched.", note: "Takes effect on the next run (twice an hour, at :27 and :57). The week-5 roster file must exist before Sun 22 Nov 7 PM ET. Weeks before week 5 are never recorded." },
  { name: "VS_HOLD_WEEKS", games: [], format: WEEKS, what: "Keeps those Knode Games VS weeks pending, so they cannot go final and nothing is paid for them yet.", when: "If a week's results look wrong.", note: "Remove the week to let it go final again." },
  { name: "VS_RELEASE", games: [], format: "<week>:<release code>, e.g. 5:0123456789abcdef", what: "Lets one held Knode Games VS week through, once (a HOLD file: a final week the chain now reads differently). The code is printed with the hold.", when: "Only after the cause of that hold was checked.", note: "Anything but that exact week and code releases nothing." },
  { name: "VS_RESET_FROM_WEEK", games: [], format: WEEK, what: "The kit's fresh-start switch, for Knode Games VS (it carries no teams or picks between weeks, so it changes nothing today).", when: "Leave unset. Ask the New Games chat first.", note: "Unset: the normal week-by-week run." },
];

/** One step of a game's launch. `check` names the read-only admin button that proves it (admin/actions.ts). */
export type Step = { text: string; check?: string };
export type Launch = { game: number; steps: Step[]; dates?: string };

/** The order every staked game follows to start earning (Vault chat, 3 Nov), then what is special about each. */
export const STANDARD_STEPS: Step[] = [
  { text: "Set the game's free-prize switch first (ON or OFF), before adding the game. A game with no switch follows its --free registration, which is ON.", check: "glance-prizes" },
  { text: "Announce the game in the vault (Add a game, step 1). Players get 48 hours' notice.", check: "glance-vault" },
  { text: "After the 48 hours, and before the announcement expires after seven more days, apply it (step 2). A game applied in vault week W earns from week W + 1.", check: "glance-vault" },
  { text: "Check the vault now says \"staked + free prize, from week <n>\" with the week you expect. If it names the wrong week, stop and tell the Vault chat.", check: "glance-vault" },
  { text: "Set the game's GitHub switches (the All switches screen lists each one) in the order its own runbook gives.", check: "glance-golf" },
];

export const LAUNCH: Launch[] = [
  { game: 1, steps: [{ text: "Already in the vault. From v6.1's rule week it is paid from its results file like every game: set QUESTIONS_FROM_WEEK once v6.1 is uploaded.", check: "glance-questions" }], dates: "v6.1 rule week: Mon 16 Nov (vault week 4 = Week 1)." },
  { game: 2, steps: [{ text: "Live and staked. Nothing to start. Use Hold or Release only if a week looks wrong.", check: "glance-picks" }], dates: "Pays from the week of Mon 9 Nov (vault week 3, a test week), then Week 1 from Mon 16 Nov." },
  { game: 3, steps: [{ text: "Season 1 needs its Repo Lens pass and a testnet season first. Then: free prize OFF, Add a game (season 2), apply.", check: "glance-vault" }], dates: "Planned Season 1: Mon 16 Nov." },
  { game: 4, steps: [{ text: "Needs its fix-checks and a full test week first. Then: free prize OFF, Add a game, apply.", check: "glance-vault" }], dates: "Launches on the Ruler (owner, 11 Nov)." },
  { game: 6, steps: [{ text: "Game 6 is added (12 Nov, about 3:16 PM ET). Apply it in vault week 4 (Sun 15 Nov 7:00 PM ET to Sat 21 Nov before 3:16 PM ET; aim for Mon 16 Nov), then set GOLF_STAKED_FROM_WEEK to the week the status shows (5) before Sun 22 Nov 7:57 PM ET.", check: "glance-golf" }], dates: "Applying before Sun 15 Nov 7:00 PM ET is wrong: Golf would earn from Week 1 while it is practice-only. After Sat 21 Nov 3:16 PM ET the announcement has expired." },
  { game: 7, steps: [{ text: "Live and staked. Scored by the Ruler from Week 1: RACE_RULER_FROM_WEEK = 4 (Mon 16 Nov).", check: "glance-race" }], dates: "Ruler live from Week 1 (Mon 16 Nov)." },
  { game: 8, steps: [{ text: "Needs the Combo PR merged (Repo Lens GO), then the Picks v2 (CARD) upgrade after the Picks owner handover is accepted, then announce and apply Picks game 8. Then: free prize OFF, Add a game, apply, in vault week 6.", check: "glance-vault" }], dates: "Launches on the Ruler from its first week: vault week 6 on the Ruler (D-265; staking from week 7, or 6 only if every gate is met)." },
  { game: 9, steps: [{ text: "Needs its fix-check, then: free prize ON (owner, 14 Nov; it was OFF from 11 Nov): npm run prizes -- on 9 --send --from 5, after Sun 15 Nov 7:30 PM ET and before Sun 22 Nov 6:30 PM ET (later, it starts Week 3 and Week 2 pays no free prize though the pages promise one), then Add a game, then apply it during vault week 4 (Week 1: Mon 16 to Sun 22 Nov) so its practice week and first paid week match its page, then BRACKET_PRIZES_FROM_WEEK, and its Ruler switch with its own Repo Lens GO.", check: "glance-vault" }], dates: "Ruler switch: PR by Fri 20 Nov 12:00 ET to be live from Week 2 (Mon 23 Nov), otherwise Week 3 (Mon 30 Nov)." },
  { game: 13, steps: [{ text: "Needs its Repo Lens GO and its one PR merged. Picks game 13 (D-350): announced and applied by the CURRENT Picks owner, once the picks-game13 PR has merged (announce by Sat 21 Nov ~8 PM ET; apply 48 hours later, Mon 23 Nov). Keep the Picks owner handover off until game 13 is applied. Vault (D-365): free prize stays OFF; Add a game (--staked --season 1, no --free) right after cutover, apply 48 hours later, only after this PR has merged. Then LASTNODE_FROM_WEEK = 5 and LASTNODE_ENABLED = true.", check: "glance-vault" }], dates: "Ruler-only from its first live week. First event Tue 24 Nov 9 AM ET (vault week 5, Week 2). Staking counts from week 5 if the vault apply is by Sun 22 Nov 6:44 PM ET, else from week 6. Fallback: first event Mon 30 Nov (LASTNODE_FROM_WEEK = 6)." },
];
