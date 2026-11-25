// Learn page (learn.html, D-740 / D-744 / D-780): plain explanations, easy to read. Pins the owner's rules for the
// page's words: every answer is at most two short sentences; none of "line", "odds", "bet", "earn" (and no "returns",
// "profit", "yield", "APR", "APY"); no dates and no prize amounts; the old name "Over Under" is not used; Vault's
// exact sentences for the stake rules (M-524 rows 22 and 23) are kept; every link goes to a real page.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WEB = new URL("../../web/", import.meta.url).pathname;
const html = fs.readFileSync(WEB + "learn.html", "utf8");
const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
const text = (s) => s.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
const words = text(main);
const sentences = (s) => s.split(/(?<=[.!?])\s+/).filter(Boolean);

const answers = [...main.matchAll(/<details class="learn-row" id="([a-z-]+)">\s*<summary>([^<]+)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
  .map(([, id, q, a]) => ({ id, q, a: text(a) }));
const shortBox = main.slice(main.indexOf('<section class="learn-short"'), main.indexOf("</section>", main.indexOf('<section class="learn-short"')));
const short = [...shortBox.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, t]) => text(t));

test("the page has the short version and the fold-out answers", () => {
  assert.equal(short.length, 5, "In short: five lines");
  assert.ok(answers.length >= 12, `fold-out answers: ${answers.length}`);
  assert.equal(new Set(answers.map((x) => x.id)).size, answers.length, "each answer has its own id");
  for (const id of ["blockchain", "blocks", "node", "vhp", "mana", "start-free", "rewards", "staking", "how-to-stake", "withdraw", "why-node"])
    assert.ok(answers.some((x) => x.id === id), `answer ${id}`);
});

test("every answer is at most two short sentences, and each In short line is one", () => {
  for (const { id, a } of answers) {
    const s = sentences(a);
    assert.ok(s.length >= 1 && s.length <= 2, `${id}: ${s.length} sentences`);
    for (const x of s) assert.ok(x.split(" ").length <= 30, `${id}: sentence too long (${x.split(" ").length} words): ${x}`);
  }
  for (const l of short) { assert.equal(sentences(l).length, 1, l); assert.ok(l.split(" ").length <= 18, l); }
});

test("no banned words, no dates, no prize amounts, no old game name", () => {
  const banned = /\b(line|lines|odds|bet|bets|betting|earn|earns|earned|earning|earnings|return|returns|profit|profits|yield|APR|APY|guaranteed?|gambling|gamble)\b/i;
  assert.doesNotMatch(words, banned);
  assert.doesNotMatch(words, /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d/i, "no dates");
  assert.doesNotMatch(words, /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/, "no weekdays");
  assert.doesNotMatch(words, /\b20\d\d\b/, "no years");
  assert.doesNotMatch(words, /\d[\d,.]*\s*(VHP|KOIN)\b/, "no amounts");
  for (const m of words.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) assert.equal(m[1], "5", "the only percentage is the flat 5% fee");
  assert.doesNotMatch(words, /Over\s*Under/i, "the game is now called More or Fewer");
});

test("Vault's sentences for the stake rules are used exactly (M-524)", () => {
  assert.ok(words.includes("Your stake is held only by the vault contract, and you can always withdraw it."));
  assert.ok(words.includes("Withdrawing part of your stake during a week keeps you in that week at the lower stake, as long as at least the minimum stake stays in. Withdraw below it, or all of it, and you get no share of that game's rewards that week."));
  assert.ok(words.includes("The vault collects its block rewards for the week, and a flat 5% fee is taken first."));
  assert.ok(words.includes("With VHP behind it, a node can also produce blocks."));
  assert.doesNotMatch(words, /receive that node's block rewards/, "D-744: no promise of node rewards");
});

test("every link on the page goes to a real page, and the page uses the shared look and box", () => {
  for (const [, href] of main.matchAll(/href="([^"]+)"/g)) {
    if (/^https?:/.test(href)) continue;
    const file = href.split("#")[0];
    assert.ok(fs.existsSync(WEB + file), `link target ${href}`);
  }
  for (const f of ["start.html", "run-node.html", "node.html", "pulse.html", "ruler.html", "trust.html"]) assert.match(main, new RegExp(`href="${f}"`), f);
  assert.match(html, /href="hub-ui\.css"/);
  assert.match(html, /href="learn\.css"/);
  assert.match(html, /<main[^>]*>\s*<aside class="page-box"/);
  assert.doesNotMatch(main, /<script/i, "no script in the page body");
});

// M-742 / M-769: the guest-wallet row. Vault's wording (M-754) is pinned, and every site label the steps name must
// still exist in the wallet code, so a rename in wallet.js or header-wallet.js fails here until this row follows it.
test("the guest wallet row: Vault's wording, real site labels, the key goes only to Kondor or Restore", () => {
  const row = main.slice(main.indexOf('id="guest-wallet"'), main.indexOf("</details>", main.indexOf('id="guest-wallet"')));
  assert.ok(row.length > 0, "guest-wallet row");
  const t = text(row);
  assert.ok(t.includes("Knode Games usually pays the Mana to collect a prize; a little KOIN in that wallet means you can always collect it yourself."));
  assert.ok(t.includes(`Anyone with this key controls the wallet. Never share it. Enter it only in Kondor's own import screen, or in "Restore a guest key" in this site's wallet menu. Knode Games never asks you to send it, and no one from Knode Games ever will.`));
  assert.match(row, /<p class="learn-warn">/, "the warning is in its own box");
  const code = fs.readFileSync(WEB + "wallet.js", "utf8") + fs.readFileSync(WEB + "header-wallet.js", "utf8");
  for (const label of ["Guest wallet: back up, restore, forget", "Back up guest key", "Tap to reveal", "Copy", "Restore a guest key", "Add another account", "Connect a wallet", "Kondor"])
    assert.ok(code.includes(`"${label}"`) || code.includes(`"＋ ${label}"`), `site label still exists: ${label}`);
  assert.doesNotMatch(t, /paste (it|the key|your key) (into|in) (a|any|this) (website|site|message|chat|form)/i);
  assert.doesNotMatch(t, /send (us|it to)/i);
});
