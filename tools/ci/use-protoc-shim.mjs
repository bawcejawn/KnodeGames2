// Runs the contract builder's three protoc plugins through tools/ci/protoc-stdin-shim.cjs (Repo Lens #L-3 I-1), so a
// build never stops with EAGAIN. Call it after `npm ci` in a contract folder. It only rewrites three launcher files in
// that folder's node_modules/.bin; each launcher calls the plugin's own, unchanged bin file.
// Usage: node tools/ci/use-protoc-shim.mjs [contract folder ...]   (default: the current folder; Linux, macOS, Windows)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shim = fileURLToPath(new URL("./protoc-stdin-shim.cjs", import.meta.url));
const win = process.platform === "win32";
export const PLUGINS = ["koinos-abi-proto-gen", "as-proto-gen", "koinos-as-gen"];

export function useShim(dir) {
  const bin = path.join(dir, "node_modules/.bin");
  for (const p of PLUGINS) {
    const link = path.join(bin, p);
    const real = fs.realpathSync(link); // node_modules/@koinos/<package>/bin/<p>
    if (real.endsWith(".shim.cjs") || fs.readFileSync(real, "utf8").includes("protoc-stdin-shim")) continue; // already done
    const wrapper = `#!/usr/bin/env node\nrequire(${JSON.stringify(shim)}).run(${JSON.stringify(real)});\n`;
    fs.rmSync(link, { force: true });
    fs.writeFileSync(link, wrapper, { mode: 0o755 });
    if (win) { const js = path.join(bin, `${p}.shim.cjs`); fs.writeFileSync(js, wrapper); fs.writeFileSync(`${link}.cmd`, `@node "${js}" %*\r\n`); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["."];
  for (const d of dirs) { useShim(path.resolve(d)); console.log(`protoc stdin shim on: ${path.resolve(d)}`); }
}
