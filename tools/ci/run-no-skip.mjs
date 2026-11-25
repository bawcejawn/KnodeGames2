// Audit AB-081: run the vault tests and FAIL if any of them was skipped.
// The vault tests skip themselves when the vault's TEST build (contracts/vault, `npm run build:sim`) is missing. A
// skipped test passes, so a CI run without the build would look green while checking nothing. This runner passes the
// files to node's test runner (TAP output, shown as it comes) and exits 1 if the summary reports a skipped or todo
// test, or no tests at all.
import { spawn } from "node:child_process";

const files = process.argv.slice(2);
if (!files.length) { console.error("run-no-skip: name the test files"); process.exit(2); }
// NODE_TEST_CONTEXT is set when this runner itself runs under node --test; the child must report in plain TAP.
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-reporter=tap", ...files], { stdio: ["ignore", "pipe", "inherit"], env });
let out = "";
child.stdout.on("data", (b) => { out += b; process.stdout.write(b); });
child.on("close", (code) => {
  const n = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)$`, "m")) ?? [])[1] ?? NaN);
  const tests = n("tests"), skipped = n("skipped"), todo = n("todo");
  if (code !== 0) process.exit(code ?? 1);
  if (!(tests > 0)) { console.error("\nrun-no-skip: no tests ran (audit AB-081)."); process.exit(1); }
  if (skipped > 0 || todo > 0) {
    console.error(`\nrun-no-skip: ${skipped} skipped and ${todo} todo of ${tests} vault tests. A skip is not a pass (audit AB-081).` +
      "\nBuild the vault's TEST build first: cd contracts/vault, then npm run build:sim.");
    process.exit(1);
  }
  console.log(`run-no-skip: ${tests} vault tests ran, none skipped.`);
});
