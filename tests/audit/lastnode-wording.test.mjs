// Last Node page wording (owner, 23 Nov 2026, option A; M-454/M-463/M-494): "Last Node Standing" in solid letters and one
// spelling, the tagline, "unluckiest" (never "slowest") in the description, no stray "null" in "Your run".
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
const read = (f) => fs.readFileSync(new URL(`../../web/${f}`, import.meta.url), "utf8");
const html = read("lastnode.html"), css = read("lastnode.css"), js = read("lastnode.js");

test("the title is 'Last Node Standing' in solid letters, with the tagline", () => {
  assert.match(html, /<h1>Last Node <span>Standing<\/span><\/h1>/);
  assert.match(html, /<p class="ln-tagline">Every hour one node is knocked out\. Be on the last one\.<\/p>/);
  assert.match(html, /<title>Last Node Standing · Every hour one node is knocked out<\/title>/);
  assert.doesNotMatch(css, /text-stroke/);
  assert.doesNotMatch(css, /\.ln-hero h1 \{[^}]*text-transform/);
});

test("the cut is the unluckiest node, not the slowest", () => {
  assert.doesNotMatch(html, /slowest/i);
  assert.match(html, /<meta name="description" content="[^"]*unluckiest node is knocked out/);
});

test("labels spell the name one way, and 'Your run' never shows null", () => {
  assert.doesNotMatch(js, /"last node standing"|"The last node standing"/);
  assert.doesNotMatch(js, /"Play free"\) : null\)/);
});
