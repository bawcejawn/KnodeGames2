// Knode Games X posting: the rules, as pure functions (no network, no files, no keys). x-post.mjs uses them.
// Design: claude/marketing/X-POSTING-SYSTEM-DESIGN-2026-11-25.md. Plain-words guide: docs/SOCIAL.md.

export const LIMITS = { perRun: 2, perHour: 2, perDay: 6, windowMs: 3 * 3600e3, maxChars: 280, linkChars: 23 };

// Words we never use (whole words; "learn" is fine). "guaranteed" too (say "not promised").
const BANNED = /\b(bets?|betting|odds|wagers?|gambl\w*|jackpots?|returns|apy|profit\w*|get rich|passive income|lines?|spreads?|earn\w*)\b/i;
const WALLET = /\b1[1-9A-HJ-NP-Za-km-z]{25,34}\b/;
const MENTION = /(^|\s)@\w/;
const HASHTAG = /(^|\s)#\w/;
const DATED = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\b\d{1,2} (Nov|Dec|Jan|Feb)\b/;
const SLOT = /\[[^\]]*\]/;

export function tweetLength(text) {
  return [...text.replace(/https?:\/\/\S+|\bknodegames\.\S+/g, "x".repeat(LIMITS.linkChars))].length;
}

/** Returns a list of problems; empty means the text may be sent. */
export function wordingProblems(text) {
  const p = [];
  if (typeof text !== "string" || !text.trim()) return ["empty text"];
  if (tweetLength(text) > LIMITS.maxChars) p.push(`over ${LIMITS.maxChars} characters`);
  if (BANNED.test(text)) p.push("banned word");
  if (/\bguarantee[sd]?\b/i.test(text)) p.push("guaranteed");
  if (WALLET.test(text)) p.push("looks like a wallet address");
  if (MENTION.test(text)) p.push("mention");
  if (HASHTAG.test(text)) p.push("hashtag");
  if (SLOT.test(text)) p.push("unfilled [slot]");
  if (!DATED.test(text)) p.push("no date");
  return p;
}

const whenMs = (post) => Date.parse(post.when_et);

/** The state of one post id from the log: the last event wins. Events: {id, ts, kind: intent|sent|error|skipped|missed|unknown}. */
export function stateOf(events, id) {
  const mine = events.filter((e) => e.id === id);
  return mine.length ? mine[mine.length - 1].kind : "none";
}

/** Any intent with no result after it means we cannot know if X got it: never retry, stop everything. */
export function unknownIntents(events) {
  return [...new Set(events.filter((e) => e.kind === "intent").map((e) => e.id))].filter((id) => stateOf(events, id) === "intent");
}

export function isPaused(events) {
  return events.some((e) => e.kind === "pause") && !events.some((e) => e.kind === "resume" && e.ts > events.filter((x) => x.kind === "pause").pop().ts);
}

const etDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));

/**
 * Decide what this run may post. Pure. Returns { pause?: reason, send: [post], missed: [id] }.
 * Only status exactly "approved" is ever considered. Window: from when_et to 3 hours after; later is "missed".
 */
export function plan({ queue, events, nowMs, limits = LIMITS }) {
  if (isPaused(events)) return { pause: "paused", send: [], missed: [] };
  const unk = unknownIntents(events);
  if (unk.length) return { pause: `unknown result for ${unk.join(",")}`, send: [], missed: [] };
  const sentTimes = events.filter((e) => e.kind === "sent").map((e) => Date.parse(e.ts));
  let hour = sentTimes.filter((t) => nowMs - t < 3600e3).length;
  let day = sentTimes.filter((t) => etDay(t) === etDay(nowMs)).length;
  const send = [], missed = [];
  const due = queue.filter((p) => p.status === "approved" && stateOf(events, p.id) === "none" && whenMs(p) <= nowMs)
    .sort((a, b) => whenMs(a) - whenMs(b));
  for (const p of due) {
    if (nowMs - whenMs(p) > limits.windowMs) { missed.push(p.id); continue; }
    if (send.length >= limits.perRun || hour >= limits.perHour || day >= limits.perDay) continue;
    if (wordingProblems(p.text).length) continue;
    send.push(p); hour++; day++;
  }
  return { send, missed };
}
