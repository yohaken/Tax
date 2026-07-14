/**
 * Peerland phases 1–5 + group merge regression.
 * Run: node scripts/regress-peerland-phases-merge.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { upsertRule, applyRules, summarizeByGroup, isReservedCategoryName } from "../public/js/storage.js";
import {
  applyPeerlandPhasesAll,
  PEERLAND_CATEGORIES,
  PEERLAND_PHASE_META,
} from "../public/js/peerland-phases.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else console.log("ok:", msg);
}

const raw = JSON.parse(readFileSync(join(root, "public/data/peerland_2024-2025.json"), "utf8"));
const baseTx = () =>
  raw.transactions.map((t, i) => ({
    id: t.id || `tx_${i}`,
    description: t.description || "",
    amount: Number(t.amount) || 0,
    direction: t.direction || (t.credit ? "in" : "out"),
    category: "",
    note: "",
    raw: t.raw || "",
  }));

const txs = baseTx();
const result = applyPeerlandPhasesAll(txs, upsertRule, applyRules);
const left = result.transactions.filter((t) => !String(t.category || "").trim()).length;
const groups = summarizeByGroup(result.transactions);

assert(PEERLAND_PHASE_META.totalGroups === 39, `39 planned groups (got ${PEERLAND_PHASE_META.totalGroups})`);
assert(result.applied === txs.length, `full coverage applied===rows (${result.applied}/${txs.length})`);
assert(left === 0, "no uncategorized after phases 1–5");
assert(result.appliedRules > 1000, `phase1-4 rules tag chunk (${result.appliedRules})`);
assert(result.appliedHeuristics > 800, `phase5 heuristics chunk (${result.appliedHeuristics})`);

const other = groups.find((g) => g.key === "อื่นๆ");
assert(other && other.count > 100 && other.count < 800, `อื่นๆ sane size (${other?.count})`);
const cash = groups.find((g) => g.key === "ฝากเงินสด / CDM");
assert(cash && cash.count >= 20, `CDM group exists (${cash?.count})`);
const oil = groups.find((g) => g.key === "น้ำมัน / พลังงาน");
assert(oil && oil.count >= 5, `oil group exists (${oil?.count})`);

// Merge: pick 3 customer groups → one name
const cust = groups.filter((g) => g.key.startsWith("ลูกค้า ·")).sort((a, b) => b.count - a.count).slice(0, 3);
assert(cust.length === 3, "have 3 customer groups to merge");
const keys = cust.map((g) => g.key);
const rowCount = keys.reduce((s, k) => s + result.transactions.filter((t) => t.category === k).length, 0);
const next = "ลูกค้า · รวมทดสอบ";
for (const t of result.transactions) {
  if (keys.includes(t.category)) t.category = next;
}
const after = result.transactions.filter((t) => t.category === next).length;
const orphans = keys.reduce((s, k) => s + result.transactions.filter((t) => t.category === k).length, 0);
assert(after === rowCount, `merge preserves row count ${rowCount}→${after}`);
assert(orphans === 0, "no orphan categories after merge");

// Merge into existing selected name
const again = applyPeerlandPhasesAll(baseTx(), upsertRule, applyRules).transactions;
const a = "ลูกค้า · Malinee";
const b = "ลูกค้า · Jiphada";
const na = again.filter((t) => t.category === a).length;
const nb = again.filter((t) => t.category === b).length;
for (const t of again) {
  if (t.category === a || t.category === b) t.category = a;
}
assert(
  again.filter((t) => t.category === a).length === na + nb,
  `merge into source name keeps ${na}+${nb}`
);
assert(again.filter((t) => t.category === b).length === 0, "source b emptied");

assert(isReservedCategoryName("__uncat"), "reserved intact");
assert(!isReservedCategoryName(next), "merge name allowed");

// Idempotent-ish: already tagged rows not double-counted by rules pass
const tagged = applyPeerlandPhasesAll(baseTx(), upsertRule, applyRules).transactions;
const second = applyPeerlandPhasesAll(
  tagged.map((t) => ({ ...t })),
  upsertRule,
  applyRules
);
assert(second.applied === 0, `re-apply on fully tagged adds 0 (got ${second.applied})`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll peerland phase/merge regressions passed");
console.log(
  "distribution top:",
  summarizeByGroup(applyPeerlandPhasesAll(baseTx(), upsertRule, applyRules).transactions)
    .slice(0, 8)
    .map((g) => `${g.name}:${g.count}`)
    .join(", ")
);
