// Loads web/survivor.js the way the site serves it: the page sits at the site root next to games/, so its import
// "./games/survivor/math.js" resolves (tools/ci/assemble-site.mjs copies only "./games/…" imports). In the repo the page
// is in web/, so the tests copy it into a temporary folder with a games/ link to the repo's games/ (and js/ to web/js/) and import it there.
// The folder is removed when the process exits.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "survivor-page-"));
fs.copyFileSync(path.join(ROOT, "web/survivor.js"), path.join(dir, "survivor.js"));
fs.symlinkSync(path.join(ROOT, "games"), path.join(dir, "games"), "junction"); // "junction": no admin rights on Windows; ignored elsewhere
fs.symlinkSync(path.join(ROOT, "web/js"), path.join(dir, "js"), "junction");    // the shared Send my picks card (./js/lib/send-picks.js)
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));

export const page = await import(pathToFileURL(path.join(dir, "survivor.js")).href);
