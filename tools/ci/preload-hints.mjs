// Speed (Wed 25 Nov): add one "start downloading now" hint per script to a page, at build time.
// Why: every page has a CSP <meta> tag, which stops Chrome looking ahead in the page, so the scripts at the end of
// each page download one after another (~12-13 s on a slow phone; ~4 s with these hints). index.html has the same
// hints by hand (PR #119); pages that already have any script hint are left exactly as they are.
// The hints are only hints: the <script> tags still load and run every file in the same order, so a missing or
// wrong hint costs speed, never a broken page. Source pages in web/ are not changed; only the published copy is.
//   import { addHints } from "./preload-hints.mjs";  addHints(html) -> html with hints (same html if none needed)

const SCRIPT = /<script((?: [a-z-]+(?:="[^"]*")?)*)><\/script>/g;
const attr = (attrs, name) => { const m = attrs.match(new RegExp(` ${name}="([^"]*)"`)); return m ? m[1] : null; };

export function addHints(html) {
  const end = html.indexOf("</head>");
  if (end < 0 || /<link rel="(preload" as="script|modulepreload)"/.test(html.slice(0, end))) return html;
  const lines = [];
  for (const m of html.slice(end).matchAll(SCRIPT)) {
    const src = attr(m[1], "src"), integrity = attr(m[1], "integrity"), cross = attr(m[1], "crossorigin");
    if (!src || /["<>]/.test(src) || lines.some((l) => l.includes(`href="${src}"`))) continue;
    // A module script (type="module") needs rel="modulepreload"; a plain one rel="preload" as="script".
    const rel = attr(m[1], "type") === "module" ? 'rel="modulepreload"' : 'rel="preload" as="script"';
    const low = /posthog|analytics\.js$/.test(src) ? ' fetchpriority="low"' : "";
    lines.push(`  <link ${rel} href="${src}"${low}${integrity ? ` integrity="${integrity}"` : ""}${cross ? ` crossorigin="${cross}"` : ""}>`);
  }
  if (!lines.length) return html;
  const block = "  <!-- Added at build time by tools/ci/preload-hints.mjs: start every script download now (Speed). -->\n" + lines.join("\n") + "\n";
  // Just above hub-ui.css when the page has it (it stays the last line in <head>), else just above </head>.
  const hub = html.lastIndexOf('<link rel="stylesheet" href="hub-ui.css">', end);
  const at = hub >= 0 ? html.lastIndexOf("\n", hub) + 1 : end;
  return html.slice(0, at) + block + html.slice(at);
}
