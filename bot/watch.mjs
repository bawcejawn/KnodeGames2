/**
 * NODE WATCHDOG — runs on GitHub every 30 minutes (.github/workflows/watch.yml). Read-only: no keys, no installs.
 *
 * Watches one block-producer address (your personal node's, set as the GitHub variable PERSONAL_PRODUCER). All three
 * nodes run on the same PC, and the personal one produces by far the most often, so when it goes quiet the PC, Docker
 * or the internet is almost certainly down for all of them.
 *
 * It reads the last 90 minutes of blocks from a public Koinos node and finds this producer's latest block.
 *   - silent longer than WATCH_MINUTES (default 30), and longer than pure bad luck would explain → the run FAILS,
 *     which makes GitHub email you;
 *   - the same outage emails once, then a reminder every 3 hours while it lasts;
 *   - if the public Koinos node can't be reached, it says so but does not alarm at first (that's not your node's
 *     fault); after READ_FAIL_MS (3 hours) of failed reads in a row it DOES alarm, once and then every 3 hours, because
 *     a watchdog that can't see the chain can't report a dead PC either (Repo Lens R1-12, away window).
 *
 * State between runs (which outage was already emailed) is kept in watch-state.json, carried by the workflow's cache.
 */
import fs from "node:fs";
import { writeSummary } from "./alert-summary.mjs";

const RPC = process.env.RPC || "https://koinos.armana.io";
const ADDR = (process.env.WATCH_PRODUCER || "").trim();
const LABEL = process.env.WATCH_LABEL || "personal node";
const MINUTES = Number(process.env.WATCH_MINUTES || 30);
const STATE = "watch-state.json";
const SCAN = 1800;               // blocks to look back (~90 minutes at ~3 s per block)
const BATCH = 300;
const REMIND_MS = 3 * 3600_000;
const READ_FAIL_MS = Number(process.env.WATCH_READ_FAIL_MS || 3 * 3600_000);

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } };
const writeState = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));

async function rpc(method, params) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json", "user-agent": "knode-node-watchdog" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) {
      if (i >= 4) throw e;
      await sleep(2000 * i);
    }
  }
}

async function main() {
  if (!/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(ADDR)) {
    log("::notice title=Node watchdog::No producer to watch yet. Add your personal node's producer address as the repository variable PERSONAL_PRODUCER.");
    return;
  }
  let head, items = [];
  try {
    head = await rpc("chain.get_head_info", {});
    const h = Number(head.head_topology.height);
    for (let start = h - SCAN + 1; start <= h; start += BATCH) {
      const res = await rpc("block_store.get_blocks_by_height", {
        head_block_id: head.head_topology.id, ancestor_start_height: String(start),
        num_blocks: Math.min(BATCH, h - start + 1), return_block: true, return_receipt: false,
      });
      items.push(...(res.block_items || []));
    }
  } catch (e) {
    readFailed(String(e?.message ?? e));
    return;
  }
  const h = Number(head.head_topology.height);
  const mine = items.filter((it) => it.block?.header?.signer === ADDR).map((it) => Number(it.block_height ?? it.block?.header?.height));
  const last = mine.length ? Math.max(...mine) : 0;
  const lastTime = last ? Number(items.find((it) => Number(it.block_height ?? it.block?.header?.height) === last)?.block?.header?.timestamp) : 0;
  const scanned = items.length;
  const headTime = Number(head.head_block_time || items[items.length - 1]?.block?.header?.timestamp || Date.now());
  const gapMin = last ? (headTime - lastTime) / 60000 : Infinity;
  // How long a silence must be before it's not just bad luck: at least WATCH_MINUTES, and at least the gap that would
  // happen by chance less than 1 time in 1,000 at this producer's recent rate.
  // The rate is measured only up to the latest block, so an ongoing silence doesn't water it down.
  const firstTime = Number(items[0]?.block?.header?.timestamp || 0);
  const activeMin = last && firstTime ? Math.max(1, (lastTime - firstTime) / 60000) : 0;
  const perMin = activeMin ? mine.length / activeMin : 0;
  const luckMin = perMin > 0 ? Math.log(1000) / perMin : Infinity;
  const limit = Math.max(MINUTES, Math.min(luckMin, 24 * 60));
  log(`Watching ${LABEL} ${ADDR}`);
  log(`Last ${scanned} blocks (to #${h.toLocaleString()}): ${mine.length} by this producer; ${last ? `latest #${last.toLocaleString()}, ${gapMin.toFixed(0)} min ago` : "none in the last ~90 minutes"}.`);
  if (last) log(`Alarm after ${limit.toFixed(0)} min of silence.`);

  const st = readState();
  if (st.readFailSince) log(`✔ Reading the chain again (reads had failed since ${new Date(st.readFailSince).toISOString()}).`);
  if ("readFailSince" in st || "readFailAlert" in st) { delete st.readFailSince; delete st.readFailAlert; writeState(st); }
  const down = last === 0 || gapMin > limit;
  if (!down) {
    if (st.outage) log(`✔ Back to normal (the outage first emailed at ${new Date(st.firstAlert).toISOString()} is over).`);
    else log("✔ Producing normally.");
    writeState({});
    return;
  }
  const outage = String(last);  // one outage = silence since the same last block
  const now = Date.now();
  const what = last ? `No block from your ${LABEL} for ${gapMin.toFixed(0)} minutes (last block #${last.toLocaleString()}).` : `No block from your ${LABEL} in the last ~90 minutes.`;
  const advice = "Check the PC is awake and online, Docker Desktop is running, and the nodes are up (npm run desk -- node-status, npm run bot -- node-status, npm run bot -- node-status personal).";
  if (st.outage === outage && now - (st.lastAlert || 0) < REMIND_MS) {
    log(`(already emailed for this outage at ${new Date(st.lastAlert).toISOString()}) ${what}`);
    return;
  }
  writeState({ outage, firstAlert: st.outage === outage ? st.firstAlert : now, lastAlert: now });
  log(`::error title=Node down?::${what} ${advice}`);
  // R-VAULT-9: the plain-language summary at the top of the run page (ALERTS.md §6).
  writeSummary({ workflow: "Node watchdog", lines: [`Node down? ${what} ${advice}`], section: 6 });
  process.exitCode = 1;   // a failed run makes GitHub email you
}

/** A failed read: a warning at first; after READ_FAIL_MS of failed reads in a row, an alarm (the run fails, so GitHub
 *  emails you), then a reminder every REMIND_MS while it lasts. Any outage state already filed is kept. */
function readFailed(msg) {
  const st = readState(), now = Date.now();
  const since = Number(st.readFailSince) || now;
  const mins = Math.round((now - since) / 60000);
  if (now - since < READ_FAIL_MS) {
    writeState({ ...st, readFailSince: since });
    log(`::warning title=Node watchdog::Couldn't read blocks from ${RPC} (${msg}). Not an alarm yet: the public node may be busy (failing for ${mins} min; the alarm comes after ${Math.round(READ_FAIL_MS / 60000)} min). Trying again next run.`);
    return;
  }
  if (st.readFailAlert && now - st.readFailAlert < REMIND_MS) {
    writeState({ ...st, readFailSince: since });
    log(`(already emailed at ${new Date(st.readFailAlert).toISOString()}) Still can't read blocks from ${RPC} (${msg}), for ${mins} min.`);
    return;
  }
  writeState({ ...st, readFailSince: since, readFailAlert: now });
  const what = `The watchdog couldn't read the chain from ${RPC} for ${mins} minutes (${msg}), so it can't tell whether your node is producing.`;
  const advice = "Check the node is producing another way (koinosblocks.com or npm run bot -- node-status personal); if the public node is down for long, ask Architecture to point the watchdog at another one.";
  log(`::error title=Watchdog can't see the chain::${what} ${advice}`);
  writeSummary({ workflow: "Node watchdog", lines: [`Watchdog can't see the chain. ${what} ${advice}`], section: 6 });
  process.exitCode = 1;
}

main().catch((e) => readFailed(String(e?.message ?? e)));
