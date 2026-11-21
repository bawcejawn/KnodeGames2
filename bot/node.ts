// One node client for the bot and the hourly recorders (M-272, approved M-275; Vault's conditions REPLY-VAULT-M273 §3).
// A koilib Provider whose READS survive two things that failed whole runs on Fri 20 Nov:
//   1. a node answering with a web page instead of JSON ("invalid json response body", a busy or rate-limit page):
//      retried, 4 tries with 2, 4 and 8 s waits (the kit's rule since #48);
//   2. a node that still fails with a network error or a page after that: one more go on RPC_SPARE, if it is set and is
//      a different host from both RPC and RPC_CHECK (so the two nodes the bot compares are always two hosts).
// Never: a send (chain.submit_transaction) is never retried and never moved to the spare; a contract's refusal is
// never retried; two nodes DISAGREEING is not an error here (it is decided by the callers exactly as before). Other
// network errors keep the callers' own retries (chain.ts retry, the recorders' withRetry), unchanged.
import { Provider } from "koilib";

export const SUBMIT = "chain.submit_transaction";
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
    if (method === SUBMIT) return main(method, params);
    try { return await retryPage(() => main(method, params), sleep); }
    catch (e) {
      if (!spare || !NETWORK.test(msg(e))) throw e;
      if (!told) { told = true; o.log?.(`::warning::the node failed (${msg(e).slice(0, 120)}): RPC_SPARE${o.spareLabel ? ` (${o.spareLabel})` : ""} stands in for this read and later failing reads this run`); }
      return await retryPage(() => spare(method, params), sleep);
    }
  };
}

/** RPC_SPARE, only when it is a different host from RPC and RPC_CHECK (Vault M-273 §3: never the same host as the node it
 *  is compared with). Empty or the same host: no spare. */
export function usableSpare(env: Record<string, string | undefined> = process.env): string | null {
  const s = (env.RPC_SPARE ?? "").trim();
  if (!s) return null;
  const others = [env.RPC, env.RPC_CHECK].filter((x): x is string => !!x && x !== "off").map(hostKey);
  return others.includes(hostKey(s)) ? null : s;
}

/** A koilib Provider for `url` with guarded reads (see the top of this file). */
export function nodeProvider(url: string, env: Record<string, string | undefined> = process.env, log: (s: string) => void = (s) => console.log(s)): Provider {
  const p = new Provider([url]);
  const spareUrl = usableSpare(env);
  const sp = spareUrl && hostKey(spareUrl) !== hostKey(url) ? new Provider([spareUrl]) : null;
  const main = p.call.bind(p) as Call;
  (p as any).call = guardCall(main, sp ? (sp.call.bind(sp) as Call) : null, { log, spareLabel: spareUrl ?? undefined });
  return p;
}
