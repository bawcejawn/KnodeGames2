// Vault D-458 (Fri 20 Nov, cutover day): the owner's upload tools looked for contract builds in the OLD repo's folders
// (picks/build/…), so `npm run picks -- upgrade-schedule` failed on KnodeGames2 ("contract.wasm not found"). Every
// tool must read its build from contracts/<name>/, where KnodeGames2 builds it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const TOOLS = { "bot/picks.ts": "picks", "bot/desk.ts": "desk", "bot/race-picks.ts": "race", "bot/sponsor.ts": "sponsor", "bot/bot.ts": "vault" };

test("every upload tool reads its contract build from contracts/<name>/build/", () => {
  for (const [file, name] of Object.entries(TOOLS)) {
    const src = fs.readFileSync(file, "utf8");
    const paths = [...src.matchAll(/"([a-z/._-]*build\/(?:release|testnet)\/[a-z._-]+)"/g)].map((m) => m[1]);
    assert.ok(paths.length > 0, `${file} names its build`);
    for (const p of paths) assert.ok(p.startsWith(`contracts/${name}/build/`), `${file}: ${p} must be under contracts/${name}/build/`);
    assert.ok(fs.existsSync(`contracts/${name}/package.json`), `contracts/${name} is the contract's folder`);
  }
});

test("no tool still points at an old top-level contract folder", () => {
  for (const file of Object.keys(TOOLS)) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(src, /"(?:picks|desk|race|sponsor|game)\/build\//, `${file} names an old-layout build path`);
  }
});
