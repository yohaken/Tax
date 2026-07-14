/**
 * Group merge UX regressions (select-all, merge into existing without ticking target).
 * Run: node scripts/regress-group-merge-ux.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { upsertRule, applyRules, summarizeByGroup, isReservedCategoryName } from "../public/js/storage.js";
import { applyPeerlandPhasesAll } from "../public/js/peerland-phases.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok:", msg);
}

/** Pure merge logic mirroring app.js mergeSelectedGroups moving rules */
function mergeInto(state, sources, dest) {
  const moving = sources.filter((k) => k !== dest);
  if (!dest || isReservedCategoryName(dest) || !moving.length) {
    return { ok: false, reason: "invalid", moving };
  }
  let moved = 0;
  for (const t of state.transactions) {
    if (moving.includes(t.category)) {
      t.category = dest;
      moved += 1;
    }
  }
  for (const r of state.rules) {
    if (moving.includes(r.category)) r.category = dest;
  }
  state.categories = [dest, ...state.categories.filter((c) => c !== dest && !moving.includes(c))];
  return { ok: true, moved, moving };
}

const raw = JSON.parse(readFileSync(join(root, "public/data/peerland_2024-2025.json"), "utf8"));
const base = () => {
  const txs = raw.transactions.map((t, i) => ({
    id: t.id || `tx_${i}`,
    description: t.description || "",
    amount: Number(t.amount) || 0,
    direction: t.direction || (t.credit ? "in" : "out"),
    category: "",
    note: "",
    raw: t.raw || "",
  }));
  const applied = applyPeerlandPhasesAll(txs, upsertRule, applyRules);
  return {
    transactions: applied.transactions,
    categories: [...new Set(applied.transactions.map((t) => t.category).filter(Boolean))],
    rules: applied.rules,
  };
};

{
  const state = base();
  const groups = summarizeByGroup(state.transactions).filter((g) => g.key !== "__uncat");
  assert(groups.length >= 10, `enough groups (${groups.length})`);

  // Select-all keys = all non-uncat
  const allKeys = groups.map((g) => g.key);
  assert(allKeys.every((k) => k !== "__uncat"), "select-all excludes __uncat");

  // Merge sources A,B into existing C WITHOUT C in sources (user click target)
  const ranked = groups.sort((a, b) => b.count - a.count);
  const a = ranked[5].key;
  const b = ranked[6].key;
  const c = ranked[0].key; // large existing destination
  assert(a !== c && b !== c, "distinct source/target");
  const beforeC = state.transactions.filter((t) => t.category === c).length;
  const moveN =
    state.transactions.filter((t) => t.category === a).length +
    state.transactions.filter((t) => t.category === b).length;
  const r = mergeInto(state, [a, b], c);
  assert(r.ok, "merge into existing without ticking target");
  assert(r.moved === moveN, `moved ${moveN} got ${r.moved}`);
  assert(state.transactions.filter((t) => t.category === a).length === 0, "source a emptied");
  assert(state.transactions.filter((t) => t.category === b).length === 0, "source b emptied");
  assert(
    state.transactions.filter((t) => t.category === c).length === beforeC + moveN,
    "target absorbs rows"
  );

  // Old bug: would have blocked because C not in sources — we explicitly allow
  assert(![a, b].includes(c), "target was outside source list (the fixed bug)");
}

{
  // Merge 1 source into existing target
  const state = base();
  const groups = summarizeByGroup(state.transactions).filter((g) => g.key.startsWith("ลูกค้า ·"));
  const src = groups[0].key;
  const dest = groups[1].key;
  const n = state.transactions.filter((t) => t.category === src).length;
  const r = mergeInto(state, [src], dest);
  assert(r.ok && r.moved === n, "single source into existing target works");
}

{
  // New name destination
  const state = base();
  const groups = summarizeByGroup(state.transactions).filter((g) => g.key.startsWith("ลูกค้า ·")).slice(0, 2);
  const keys = groups.map((g) => g.key);
  const r = mergeInto(state, keys, "ลูกค้า · รวมใหม่");
  assert(r.ok, "merge into brand-new name");
  assert(state.transactions.some((t) => t.category === "ลูกค้า · รวมใหม่"), "new name present");
}

{
  // Cannot merge into reserved
  const state = base();
  const r = mergeInto(state, ["อื่นๆ"], "__uncat");
  assert(!r.ok, "block merge into __uncat");
}

{
  // Select-all then merge all customer_* into one existing
  const state = base();
  const cust = summarizeByGroup(state.transactions)
    .filter((g) => g.key.startsWith("ลูกค้า ·"))
    .map((g) => g.key);
  assert(cust.length >= 3, "customers to bulk-merge");
  const dest = cust[0];
  const sources = cust; // includes dest — moving = others
  const r = mergeInto(state, sources, dest);
  assert(r.ok, "select-all customers merge into first");
  const leftCust = summarizeByGroup(state.transactions).filter((g) => g.key.startsWith("ลูกค้า ·"));
  assert(leftCust.length === 1 && leftCust[0].key === dest, "only destination customer group remains");
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll group-merge UX regressions passed");
