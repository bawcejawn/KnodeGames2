/**
 * Audit AB-057 (Audit Bot QA audit of a8d0569, 16 Nov 2026): the hourly bot checked the code of the vault and the Desk
 * only. Race picks, Picks and the Mana sponsor can take new code from their own key at once (Race and the sponsor have
 * no timelock), so the bot now also checks, every hour, that each one still runs the code its deployment file records
 * (wasmSha256), and that its authorize switches haven't changed since the last run. Read-only: one metadata read each.
 */
import type { ContractMeta } from "./chaincheck.ts";
import { sha256OfMeta } from "./chaincheck.ts";

export type Watched = { name: string; file: string; address: string; sha: string };
const ADDRESS = /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/;
const SHA = /^[0-9a-f]{64}$/;

/** The three contracts the vault and Desk checks don't cover, from their deployment files on main. A file without an
 *  address or a fingerprint is skipped (and named in `missing`, so a broken file is reported, not silently ignored). */
export function watchedContracts(readJson: (file: string) => any): { list: Watched[]; missing: string[] } {
  const list: Watched[] = [], missing: string[] = [];
  for (const [name, file] of [["Race picks", "race-data/deployment.json"], ["Picks", "picks-data/deployment.json"], ["Mana sponsor", "sponsor-data/deployment.json"]]) {
    const d = readJson(file);
    const address = String(d?.contract ?? d?.address ?? ""), sha = String(d?.wasmSha256 ?? "").toLowerCase().replace(/^0x/, "");
    if (ADDRESS.test(address) && SHA.test(sha)) list.push({ name, file, address, sha });
    else missing.push(`${name} (${file})`);
  }
  return { list, missing };
}

const flagsOf = (m: ContractMeta) => `call=${m.call} tx=${m.tx} upload=${m.upload}`;

/**
 * Checks each watched contract once. `seen`: the switches last run (name → text); returns the new map. `alert(key, text)`
 * reports once per key (the hourly bot's ownerAlert). A metadata read that fails is logged and tried next hour; it is a
 * node's problem, not a sign of an upload.
 */
export async function codeWatch(list: Watched[], metadata: (contract: string) => Promise<ContractMeta>, seen: Record<string, string>,
  alert: (key: string, text: string) => void, log: (text: string) => void = () => {}): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...seen };
  for (const c of list) {
    let m: ContractMeta;
    try { m = await metadata(c.address); } catch (e: any) { log(`  code watch: ${c.name}'s code couldn't be read this run (${String(e?.message ?? e).slice(0, 120)}); tried again next hour`); continue; }
    if (!m.exists) { alert(`code-watch:${c.address}:none`, `${c.name} ${c.address}: no contract found on chain. If you did not remove it, check it now.`); continue; }
    const sha = sha256OfMeta(m);
    if (sha !== c.sha) alert(`code-watch:${c.address}:${m.hash}`, `${c.name} ${c.address} runs code ${sha || m.hash}, not ${c.sha} as ${c.file} records (audit AB-057). If you did not upload it, the contract's key may be compromised. If you did, update wasmSha256 in ${c.file}.`);
    const f = flagsOf(m);
    if (seen[c.name] !== undefined && seen[c.name] !== f) alert(`code-watch:${c.address}:flags:${f}`, `${c.name} ${c.address}: its authorize switches changed (${seen[c.name]} → ${f}). If you did not change them, the contract's key may be compromised.`);
    out[c.name] = f;
  }
  return out;
}
