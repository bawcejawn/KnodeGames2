// Check one game against the Game Standard (D-157, .ai/standards/NEW_GAME.md):
//   npm run game:check -- <slug>
// Read-only: it reads files in this repo and prints ✔ / ✖ lines. Exit code 1 if anything required fails.
import fs from "node:fs";
import path from "node:path";
import { ROOT, validateManifest, readManifest, listManifests, crossCheck } from "./game-manifest.mjs";

export const REQUIRED_FILES = ["game.json", "README.md", "SECURITY.md", "math.js", "recorder.ts", "tests"];

export function checkGame(slug, root = ROOT) {
  const res = [];
  const ok = (pass, msg, required = true) => res.push({ pass, msg, required });
  const dir = path.join(root, "games", slug);
  if (!fs.existsSync(dir)) { ok(false, `games/${slug}/ exists (create it with npm run game:new)`); return res; }
  for (const f of REQUIRED_FILES) ok(fs.existsSync(path.join(dir, f)), `games/${slug}/${f} exists`);
  let m = null;
  try { m = readManifest(path.join(dir, "game.json")); } catch (e) { ok(false, `game.json is valid JSON (${e.message})`); return res; }
  const probs = validateManifest(m);
  if (probs.length) for (const p of probs) ok(false, `game.json: ${p}`);
  else ok(true, "game.json follows the schema");
  const entries = listManifests(root).map((file) => ({ file, m: readManifest(file) }));
  for (const p of crossCheck(entries)) ok(false, p);
  if (m.rulesDoc) ok(fs.existsSync(path.join(root, m.rulesDoc)), `rules doc ${m.rulesDoc} exists`);
  const wc = fs.existsSync(path.join(root, "docs/standards/WEEK_CYCLE.md")) ? fs.readFileSync(path.join(root, "docs/standards/WEEK_CYCLE.md"), "utf8") : "";
  ok(wc.includes(m.name || "\u0000"), `WEEK_CYCLE.md §4 has a row for "${m.name}"`, m.status !== "building");
  const tests = path.join(dir, "tests");
  ok(fs.existsSync(tests) && fs.readdirSync(tests).some((f) => /\.test\.(mjs|ts)$/.test(f)), "tests/ has at least one test file");
  const live = m.status === "live" || m.status === "review";
  if (live) {
    let gj = null;
    try { gj = JSON.parse(fs.readFileSync(path.join(root, "games.json"), "utf8")); } catch {}
    const entry = gj && Array.isArray(gj.games) ? gj.games.find((g) => g.href && g.href.startsWith(m.page)) : null;
    ok(!!entry, `games.json lists ${m.page}`);
    ok(fs.existsSync(path.join(root, m.page)) || fs.existsSync(path.join(dir, m.page)), `page ${m.page} exists`);
  }
  for (const r of checkSendPicks(m, root)) res.push(r);
  return res;
}

/** The shared "Send my picks" card (D-255 / D-256 / D-278): a game page that builds Picks `pick` operations sends them
 *  only through web/js/lib/send-picks.js, so every game shows "your pick this round", asks before a change, checks the
 *  round is open, and never lets the sponsor pay for a change. A page that builds picks must import the card and must
 *  not call the wallet's send or sendBatch itself. A send that is not a pick (a stake, a claim) marks its line with
 *  `// game:check send-ok: <why>`. */
export const SEND_PICKS = "./js/lib/send-picks.js";
export function sendPicksProblems(src) {
  if (!/\.functions\.pick\s*\(/.test(src)) return [];
  const out = [];
  if (!new RegExp(`import\\s+\\*\\s+as\\s+\\w+\\s+from\\s+["']${SEND_PICKS.replace(/[.]/g, "\\.")}["']`).test(src)) out.push(`imports the shared card (import * as SP from "${SEND_PICKS}")`);
  src.split("\n").forEach((line, i) => {
    if (/\b(?:W|KWallet|wallet)\s*\.\s*send(?:Batch)?\s*\(/.test(line) && !/game:check send-ok:/.test(line)) out.push(`line ${i + 1} calls the wallet directly; send picks with SP.send (or mark a non-pick send "// game:check send-ok: <why>")`);
  });
  return out;
}
export function checkSendPicks(m, root = ROOT) {
  if (!m || typeof m.page !== "string") return [];
  const js = path.join(root, "web", m.page.replace(/\.html$/, ".js"));
  if (!fs.existsSync(js)) return [];
  const src = fs.readFileSync(js, "utf8");
  if (!/\.functions\.pick\s*\(/.test(src)) return [];
  const probs = sendPicksProblems(src);
  const rel = path.relative(root, js);
  return probs.length ? probs.map((p) => ({ pass: false, msg: `${rel} (Send my picks, D-256): ${p}`, required: true }))
    : [{ pass: true, msg: `${rel} sends picks only through the shared Send my picks card (D-256)`, required: true }];
}

/** Games on the kit (every game since D-158): the kit's conformance suite (GAME_KIT.md §5). */
export async function checkKit(slug, root = ROOT) {
  const dir = path.join(root, "games", slug);
  if (!fs.existsSync(path.join(dir, "recorder.ts"))) return [];
  const src = fs.readFileSync(path.join(dir, "recorder.ts"), "utf8");
  if (!/GameModule/.test(src)) return [{ pass: false, msg: "recorder.ts is a kit GameModule (D-158: every game on the kit; Daily Questions after its port, D-160)", required: true }];
  const probs = validateManifest(readManifest(path.join(dir, "game.json")), { kit: true });
  if (probs.length) return probs.map((p) => ({ pass: false, msg: `game.json (kit): ${p}`, required: true }));
  try {
    const { conformance } = await import("../kit/testing/conformance.ts");
    return (await conformance(slug, root)).map((c) => ({ pass: c.pass, msg: `conformance: ${c.msg}`, required: true }));
  } catch (e) {
    return [{ pass: false, msg: `conformance suite ran (${e.message}); run it with: node --import tsx tools/game-check.mjs ${slug}`, required: true }];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const slug = process.argv[2];
  if (!slug) { console.error("Usage: npm run game:check -- <slug>"); process.exit(1); }
  const res = [...checkGame(slug), ...(await checkKit(slug))];
  for (const r of res) console.log(`${r.pass ? "✔" : r.required ? "✖" : "•"} ${r.msg}`);
  const bad = res.filter((r) => !r.pass && r.required).length;
  console.log(bad ? `\n${bad} required check(s) failed.` : "\nAll required checks passed.");
  process.exit(bad ? 1 : 0);
}
