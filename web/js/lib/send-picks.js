/* Send my picks: the one shared way every game page sends picks (the game standard, owner D-255 / D-256 / D-278).
 *
 *  1. Before anything is sent, the player sees "your pick this round" for every pick that already exists on chain,
 *     and confirms the change (a change uses one of the game's max_changes).
 *  2. A round that has locked (or is not open) is never sent: the page asks `open(item)` right before signing.
 *  3. A NEW pick may be paid by the Knode Mana sponsor, as today; several new picks go out together with
 *     KWallet.sendBatch (one signature) when the sponsor's measured batch numbers are in deployment.json.
 *  4. A CHANGE is never sponsored (D-278): it goes out alone, paid with the player's own Mana (KWallet's `noSponsor`),
 *     never inside a sponsored batch. A guest wallet (no Mana of its own) can't change a pick; the card says so.
 *
 * Pure planning (plan, confirmLines) has no DOM and no wallet, so tools/game-check and the tests use it directly.
 * Usage on a page:
 *   const p = SP.plan([{ key, label, op, existing, wanted, open }], { maxChanges });
 *   if (await SP.confirm(p, ask)) await SP.send(W, p, { label, stillOpen });
 */

/** Same pick? Arrays compare in order; whole numbers (a packed pick, Picks kind 3: 0 to 2^64-1, D-284) by value, so
 *  "07" and "7" are the same pick; anything else as text. */
const WHOLE = /^\d{1,20}$/;
const one = (x, y) => (WHOLE.test(String(x)) && WHOLE.test(String(y)) ? BigInt(x) === BigInt(y) : String(x ?? "") === String(y ?? ""));
export function samePick(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => one(x, b[i]));
  return one(a, b);
}
/** What a guest sees instead of a Change button (D-278: a change uses the player's own Mana; a guest wallet has none). */
export const GUEST_CHANGE = "A guest wallet can't change a pick (a change uses your own Mana). Connect Kondor or KOIN Vault to change a pick.";
const hasPick = (x) => x !== null && x !== undefined && x !== "" && !(Array.isArray(x) && x.length === 0);

/** Split what the player asked for into new picks, changes, no-ops and refusals.
 *  items: [{ key, label, op, existing, wanted, open }]. existing = the pick on chain now (null/[] for none);
 *  open = the round still takes picks. opts.maxChanges (a number, optional) and opts.changesUsed (per key, optional)
 *  let the card refuse a change the contract would refuse anyway; the contract stays the authority. */
export function plan(items, opts = {}) {
  const out = { fresh: [], changes: [], same: [], refused: [] };
  for (const it of items || []) {
    if (!it || !it.op) { out.refused.push({ ...it, why: "nothing to send" }); continue; }
    if (it.open === false) { out.refused.push({ ...it, why: "locked" }); continue; }
    if (!hasPick(it.existing)) { out.fresh.push(it); continue; }
    if (samePick(it.existing, it.wanted)) { out.same.push(it); continue; }
    const used = opts.changesUsed && Number.isFinite(opts.changesUsed[it.key]) ? opts.changesUsed[it.key] : null;
    if (Number.isFinite(opts.maxChanges) && used !== null && used >= opts.maxChanges) { out.refused.push({ ...it, why: "no changes left" }); continue; }
    out.changes.push({ ...it, changesLeft: Number.isFinite(opts.maxChanges) && used !== null ? opts.maxChanges - used : null });
  }
  return out;
}

const show = (x, name) => (Array.isArray(x) ? x.map((v) => (name ? name(v) : String(v))).join(", ") : name ? name(x) : String(x));

/** The lines the confirm card shows (plain text; the page renders them with textContent). */
export function confirmLines(p, name) {
  const lines = [];
  for (const c of p.changes) {
    lines.push(`${c.label}: your pick this round is ${show(c.existing, name)}. Change it to ${show(c.wanted, name)}?`
      + (c.changesLeft !== null && c.changesLeft !== undefined ? ` This uses 1 of your ${c.changesLeft} change${c.changesLeft === 1 ? "" : "s"} left.` : " This uses one of your changes for this round."));
  }
  if (p.changes.length) lines.push("A change is paid with your own Mana (the free Mana sponsor pays only for picks you haven't made yet).");
  for (const r of p.refused) lines.push(`${r.label || "A pick"}: not sent (${r.why === "locked" ? "that round has locked" : r.why}).`);
  return lines;
}

/** Ask the player when anything changes; new picks alone need no extra question (the wallet still asks to sign).
 *  ask(lines) resolves true to go on. name(pick) shows a pick: a producer's name, or the game's decode of a packed
 *  number (math.js). opts.guest: the wallet is a guest, so a change can't be made: opts.cannot(lines) is shown instead
 *  (no Change button) and nothing is sent. */
export async function confirm(p, ask, name, opts = {}) {
  if (!p.changes.length) return p.fresh.length > 0;
  if (opts.guest) { if (typeof opts.cannot === "function") await opts.cannot([...confirmLines(p, name).filter((l) => !/own Mana/.test(l)), GUEST_CHANGE]); return false; }
  return !!(await ask(confirmLines(p, name)));
}

/** Send: new picks first (sponsored as today, batched when the sponsor's numbers allow), then each change alone with
 *  the player's own Mana. A guest can't pay Mana, so its changes are refused before anything is signed. Returns
 *  { sent, changed, skipped, ids }. W is window.KWallet. */
export async function send(W, p, opts = {}) {
  const label = opts.label || "Your picks";
  const stillOpen = typeof opts.stillOpen === "function" ? opts.stillOpen : () => true;
  if (p.changes.length && W.kind === "guest") throw new Error(GUEST_CHANGE);
  const res = { sent: 0, changed: 0, skipped: 0, ids: [] };
  const fresh = p.fresh.filter((it) => stillOpen(it));
  res.skipped += p.fresh.length - fresh.length;
  if (fresh.length === 1) { res.ids.push(await W.send(fresh[0].label || label, [fresh[0].op])); res.sent = 1; }
  else if (fresh.length > 1) {
    const r = await W.sendBatch(label, fresh.map((it) => it.op), { stillOpen: (op) => stillOpen(fresh.find((it) => it.op === op)) });
    res.ids.push(r && r.id); res.sent = r ? r.sent : fresh.length; res.skipped += r ? r.dropped : 0;
  }
  for (const c of p.changes) {
    if (!stillOpen(c)) { res.skipped++; continue; }
    // D-278: never the sponsor, never in a batch.
    res.ids.push(await W.send(c.label || label, [c.op], { noSponsor: true }));
    res.changed++;
  }
  return res;
}
