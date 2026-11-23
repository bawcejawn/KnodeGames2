// Questions page (web/app.js): no reward estimate while a week is open (owner, 22 Nov 2026).
// On a live-week board a winner's reward cell is a dash; on a final week it shows "X VHP".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const APP = process.env.APP || ".";
const src = fs.readFileSync(`${APP}/web/app.js`, "utf8");
const END = /\r?\n  start\(\);\r?\n\}\)\(\);\s*$/;
assert.match(src, END, "web/app.js ends with start(); })();");
const patched = src.replace(END, "\n  globalThis.__T = { S, renderBoard };\n})();\n");

function mk(tag) {
  let text = "";
  const e = {
    tag, nodeType: 1, attrs: {}, on: {}, children: [], hidden: false, style: {}, dataset: {}, value: "", className: "",
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(t, f) { this.on[t] = f; }, append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; text = ""; },
    remove() {}, focus() {}, showModal() {}, querySelector: () => mk("div"), querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  Object.defineProperty(e, "textContent", { get: () => text + e.children.map(textOf).join(""), set: (v) => { text = String(v); e.children = []; } });
  Object.defineProperty(e, "nextElementSibling", { get: () => mk("span") });
  return e;
}
const textOf = (n) => (n == null ? "" : typeof n === "string" ? n : n.textContent);

function harness() {
  const els = new Map();
  const ctx = {
    document: {
      querySelector: (s) => { if (!els.has(s)) els.set(s, mk("div")); return els.get(s); },
      querySelectorAll: () => [], createElement: mk, getElementById: () => null, head: mk("head"), body: mk("body"),
    },
    location: { pathname: "/", search: "", hash: "", href: "https://knode.test/" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    crypto: webcrypto, TextEncoder, Uint8Array,
    fetch: async () => ({ ok: false, status: 404, json: async () => { throw new Error("404"); } }),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  };
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.scrollTo = () => {};
  vm.createContext(ctx);
  vm.runInContext(patched, ctx);
  return { T: ctx.__T, els };
}

const U = 100000000n;
const board = (estimate) => ({
  estimate,
  scored: [
    { address: "kwinner", pts: 9, counted: 9, stake: 5n * U, eligible: true, winner: true, reward: 12n * U },
    { address: "kother", pts: 3, counted: 3, stake: 2n * U, eligible: true, winner: false },
  ],
});

async function rewardCell(estimate) {
  const { T, els } = harness();
  T.S.st = { totals: { weeks_finalized: "0" }, config: {} }; T.S.week = 5; T.S.boardWeek = 5; T.S.lbKind = "main"; T.S.account = null;
  T.S.board = { 5: board(estimate) };
  await T.renderBoard(5);
  const row = els.get("#board tbody").children[0];
  const cells = row.children;
  return textOf(cells[cells.length - 1]);
}

test("a live-week board shows a dash, not an estimate, in the winner's reward cell", async () => {
  const t = await rewardCell(true);
  assert.equal(t, "–");
  assert.doesNotMatch(t, /VHP|~/);
});

test("a final week shows the reward as 'X VHP'", async () => {
  const t = await rewardCell(false);
  assert.match(t, /^\d[\d.,]* VHP$/);
  assert.doesNotMatch(t, /~/);
});

test("the Your-week panel has no 'If the week ended now' line", () => {
  assert.doesNotMatch(src, /If the week ended now/);
});
