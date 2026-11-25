// M-756: the hourly names job looked up @names only for producers, stakers and the Race's board players, so players of
// every other game (Block X, Bracket, Last Node, Fantasy, More or Fewer, ...) never had their @name shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { boardPlayers } = await import("../../bot/names.ts");
const A = "1DAHmrQJMAbn4FmMMrew78wPUizjVdbBrd", B = "1AzRQzMLJsKApsuxcivkVQMzveRJpwcvth", C = "122hrgzoXVmmxWxUs8TUrCFGcKG9czYgvf";

test("M-756: every game's board players are looked up, not only the Race's", () => {
  const files = {
    "board.json": JSON.stringify({ week: { rows: [{ a: A }] } }),
    "board-blockx.json": JSON.stringify({ allTime: { rows: [{ a: B, pts: 3 }] } }),
    "board-lastnode.json": JSON.stringify({ today: { rows: [{ a: C }] }, week: { rows: [{ a: "not an address" }] } }),
    "board-broken.json": "{ not json",
    "W001.json": JSON.stringify({ week: { rows: [{ a: "1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr" }] } }),
  };
  assert.deepEqual([...boardPlayers(files)].sort(), [A, B, C].sort());
});

test("M-756: the workflow copies every game's board from games-data as board-<game>.json", () => {
  const wf = fs.readFileSync(".github/workflows/names.yml", "utf8");
  assert.match(wf, /for b in names-data race-data blocks-data games-data; do/);
  assert.match(wf, /\[ "\$b" = games-data \] && \[\[ "\$f" =~ \^\(\[a-z0-9\]\+\)\/board\\\.json\$ \]\]; then git show "FETCH_HEAD:\$f" > "\$RUNNER_TEMP\/prod\/board-\$\{BASH_REMATCH\[1\]\}\.json"/);
  const src = fs.readFileSync("bot/names.ts", "utf8");
  assert.match(src, /refs\/remotes\/origin\/games-data/, "the owner's local command reads them too");
});
