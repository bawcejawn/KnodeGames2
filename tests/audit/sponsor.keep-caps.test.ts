// config --keep-caps (batch measurement, D-254): change only the per-transaction cap; every other cap stays as on chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capsBase, capsOf, DEFAULT_CAPS } from "../../bot/sponsor.ts";

const M = (x: number) => String(Math.round(x * 1e8));
const chain = { max_mana_per_tx: M(2.4), max_mana_per_account_day: M(40), max_mana_per_account_week: M(280), max_mana_per_day: M(5000), max_mana_free_day: M(2000), min_vhp: M(1) };

test("without --keep-caps nothing changes: config starts from the defaults, enable from the chain", () => {
  assert.deepEqual(capsBase(["--per-tx", "7"], undefined, chain), DEFAULT_CAPS);
  assert.deepEqual(capsBase([], true, chain), capsOf(chain));
});

test("--keep-caps starts from the caps on chain, so only --per-tx changes", () => {
  const base = capsBase(["--keep-caps", "--per-tx", "7"], undefined, chain);
  assert.deepEqual(base, capsOf(chain));
  assert.equal(base.perPlayerDay, "40");
  assert.equal(base.perPlayerWeek, "280");
  assert.equal(base.freePerDay, "2000");
});

test("--keep-caps refuses any other cap flag", () => {
  for (const f of ["--per-player-day", "--per-player-week", "--per-day", "--free-per-day", "--min-vhp"])
    assert.throws(() => capsBase(["--keep-caps", f, "9"], undefined, chain), /can't go with/);
});
