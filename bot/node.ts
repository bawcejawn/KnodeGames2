// One node client for the bot and the hourly recorders (M-272, approved M-275; Vault's conditions REPLY-VAULT-M273 §3).
// A koilib Provider whose READS survive two things that failed whole runs on Fri 20 Nov:
//   1. a node answering with a web page instead of JSON ("invalid json response body", a busy or rate-limit page):
//      retried, 4 tries with 2, 4 and 8 s waits (the kit's rule since #48);
//   2. a node that still fails with a network error or a page after that: one more go on RPC_SPARE, if it is set and is
//      a different host from both RPC and RPC_CHECK. ONLY the RPC side gets the spare (D-539, Repo Lens J55-1): every
//      RPC_CHECK provider has none, so one spare can never answer for both nodes the bot compares.
// Only the READS listed in READS are guarded (allow-list, J55-2). Everything else, a send above all
// (chain.submit_transaction, chain.submit_block), goes straight to the node: never retried, never moved to the spare.
// A contract's refusal is never retried; two nodes DISAGREEING is not an error here (it is decided by the callers
// exactly as before). Other network errors keep the callers' own retries (chain.ts retry, withRetry), unchanged.
import { Provider } from "koilib";

export const SUBMIT = "chain.submit_transaction";
/** The node reads that may be retried and moved to the spare. Anything not here passes straight through. */
export const READS: ReadonlySet<string> = new Set([
  "chain.get_head_info", "chain.read_contract", "chain.get_account_nonce", "chain.get_account_rc", "chain.get_chain_id",
  "chain.get_fork_heads", "chain.get_resource_limits", "block_store.get_blocks_by_height", "block_store.get_blocks_by_id",
  "transaction_store.get_transactions_by_id", "account_history.get_account_history",
]);
/** The callers' own defaults when RPC / RPC_CHECK are not set (bot/games/*.ts, bot/stats.ts). */
export const DEFAULT_RPC = "https://koinos.armana.io";
export const DEFAULT_CHECK = "https://api.koinosblocks.com";
/** A node's web page instead of JSON. */
export const PAGE = /invalid json response body/i;
/** Errors that say the NODE failed (not the contract): the list in kit/recorder/nodes.ts (#48). */
export const NETWORK = /fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN|socket|network|50[234]|429|timeout|no answer within|invalid json response body/i;
export const PAGE_TRIES = 4;
export const PAGE_WAITS_MS = [2000, 4000, 8000];

export const hostKey = (url: string) => { try { return new URL(url.trim()).hostname.toLowerCase(); } catch { return String(url).trim().toLowerCase().replace(/\/+$/, ""); } };
const msg = (e: unknown) => String((e as Error)?.message ?? e);

type Call = (method: string, params: unknown) => Promise<any>;
type Opts = { sleep?: (ms: number) => Promise<void>; log?: (s: string) => void; spareLabel?: string };

/** Calls `fn`, retrying ONLY a web-page answer, PAGE_TRIES times in all. */
export async function retryPage<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (!PAGE.test(msg(e)) || i + 1 >= PAGE_TRIES) throw e;
      await sleep(PAGE_WAITS_MS[i] ?? PAGE_WAITS_MS[PAGE_WAITS_MS.length - 1]);
    }
  }
}

/** The guarded call: reads retried on a page, then one go on the spare after a node error; sends untouched. */
export function guardCall(main: Call, spare: Call | null, o: Opts = {}): Call {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let told = false;
  return async (method, params) => {
    if (!READS.has(method)) return main(method, params);
    try { return await retryPage(() => main(method, params), sleep); }
    catch (e) {
      if (!spare || !NETWORK.test(msg(e))) throw e;
      if (!told) { told = true; o.log?.(`::warning::the node failed (${msg(e).slice(0, 120)}): RPC_SPARE${o.spareLabel ? ` (${o.spareLabel})` : ""} stands in for this read and later failing reads this run`); }
      return await retryPage(() => spare(method, params), sleep);
    }
  };
}

/** RPC_SPARE, only when it is a different host from RPC and RPC_CHECK (Vault M-273 §3: never the same host as the node it
 *  is compared with). Unset RPC / RPC_CHECK count as the callers' defaults, so a spare that is the default check node is
 *  refused too. Empty or the same host: no spare. */
export function usableSpare(env: Record<string, string | undefined> = process.env): string | null {
  const s = (env.RPC_SPARE ?? "").trim();
  if (!s) return null;
  const others = [env.RPC || DEFAULT_RPC, env.RPC_CHECK === "off" ? "" : (env.RPC_CHECK || DEFAULT_CHECK)].filter(Boolean).map(hostKey);
  return others.includes(hostKey(s)) ? null : s;
}

/** The spare for a provider on `url`, or null. Only the RPC side (url is RPC's host, and not also RPC_CHECK's) gets one
 *  (D-539); an RPC_CHECK provider, any other node, or the spare's own host never does. */
export function spareFor(url: string, env: Record<string, string | undefined> = process.env): string | null {
  const spare = usableSpare(env);
  if (!spare) return null;
  const u = hostKey(url);
  const check = env.RPC_CHECK === "off" ? "" : hostKey(env.RPC_CHECK || DEFAULT_CHECK);
  if (u !== hostKey(env.RPC || DEFAULT_RPC) || u === check || u === hostKey(spare)) return null;
  return spare;
}

/** A koilib Provider for `url` with guarded reads (see the top of this file). */
export function nodeProvider(url: string, env: Record<string, string | undefined> = process.env, log: (s: string) => void = (s) => console.log(s)): Provider {
  const p = new Provider([url]);
  const spareUrl = spareFor(url, env);
  const sp = spareUrl ? new Provider([spareUrl]) : null;
  const main = p.call.bind(p) as Call;
  (p as any).call = guardCall(main, sp ? (sp.call.bind(sp) as Call) : null, { log, spareLabel: spareUrl ?? undefined });
  (p as any).spareUrl = spareUrl;
  return p;
}
