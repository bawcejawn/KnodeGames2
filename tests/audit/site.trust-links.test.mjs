// The Trust page's GitHub links must open real files in this repository (KnodeGames2 layout: contracts/<name>/), and
// its "check the contracts yourself" link must land on a README section that exists. Found before cutover: the links
// still named the old root folders (game/, desk/).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("web/trust.html", "utf8");
const slug = (h) => h.trim().toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");

test("every github.com/bawcejawn/KnodeGames2/blob/main/<file> link on the Trust page is a file here, and README anchors exist", () => {
  const links = [...html.matchAll(/https:\/\/github\.com\/bawcejawn\/KnodeGames2\/blob\/main\/([^"#]+)(#[^"]+)?/g)];
  assert.ok(links.length >= 3, "the page links its security notes and the README");
  for (const [, file, anchor] of links) {
    assert.ok(fs.existsSync(file), `${file} exists`);
    if (anchor && file.endsWith(".md")) {
      const heads = fs.readFileSync(file, "utf8").split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, "")));
      assert.ok(heads.includes(anchor.slice(1)), `${file}${anchor}: no such heading`);
    }
  }
});

test("the README's fingerprint table is contracts/hashes.json's live column", () => {
  const h = JSON.parse(fs.readFileSync("contracts/hashes.json", "utf8")), md = fs.readFileSync("README.md", "utf8");
  for (const k of ["vault", "desk", "picks", "race", "sponsor"]) assert.ok(md.includes(`| \`${h[k].address}\` | \`${h[k].live}\` |`), k);
});
