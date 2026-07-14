/**
 * Regression: group auto-tag must not explode on peerland/telltea.
 * Run: node scripts/regress-group-rules.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractKeywords,
  upsertRule,
  applyRules,
  previewApplyRules,
  isReservedCategoryName,
} from "../public/js/storage.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function load(name) {
  const raw = JSON.parse(readFileSync(join(root, "public/data", name), "utf8"));
  return (raw.transactions || []).map((t, i) => ({
    id: t.id || `tx_${i}`,
    description: t.description || "",
    amount: Number(t.amount) || 0,
    category: "",
    note: "",
    raw: t.raw || "",
  }));
}

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

function tagOneNoConfirm(txs, id, category) {
  const tx = txs.find((t) => t.id === id);
  tx.category = category;
  let rules = [];
  rules = upsertRule(rules, { keywords: extractKeywords(tx.description), category });
  const preview = previewApplyRules(txs, rules);
  // Simulate user cancel → only the one row stays tagged
  return { preview, keywords: extractKeywords(tx.description), rules };
}

for (const file of ["peerland_2024-2025.json", "telltea_2024-2025.json"]) {
  console.log("\n==", file);
  const txs = load(file);
  const generic = txs.find(
    (t) =>
      /Internet\/Mobile BBL|BBL X\d+/i.test(t.description) ||
      (/รับโอนเงิน/i.test(t.description) &&
        !/shopee|ช้อปปี้|grab|แกร็บ|edc|lazada|shopify/i.test(t.description) &&
        !/ตู้เติมเงิน/i.test(t.description))
  );
  if (generic) {
    const { preview, keywords } = tagOneNoConfirm(txs.map((t) => ({ ...t })), generic.id, "ทดสอบ");
    console.log(" generic sample kw=", keywords, "preview=", preview);
    assert(preview < 80, `${file}: generic transfer preview < 80 (got ${preview})`);
  }

  const shop = txs.find((t) => /shopee|ช้อปปี้/i.test(t.description));
  if (shop) {
    const clone = txs.map((t) => ({ ...t }));
    const { preview, keywords, rules } = tagOneNoConfirm(clone, shop.id, "Shopee");
    console.log(" shopee kw=", keywords, "preview=", preview);
    assert(keywords.some((k) => /shopee|ช้อปปี้/i.test(k)), `${file}: shopee keywords keep merchant`);
    // If user confirms, apply and count suspicious
    const shopTx = clone.find((t) => t.id === shop.id);
    shopTx.category = "Shopee";
    const applied = applyRules(clone, rules);
    const auto = applied.transactions.filter((t) => t.category === "Shopee" && t.id !== shop.id);
    const suspicious = auto.filter((t) => !/shopee|ช้อปปี้|lazada/i.test(t.description));
    console.log(" shopee auto=", auto.length, "suspicious=", suspicious.length);
    assert(suspicious.length < 30, `${file}: shopee false positives < 30 (got ${suspicious.length})`);
  }
}

assert(isReservedCategoryName("__uncat"), "reserve __uncat");
assert(isReservedCategoryName("ยังไม่มีกลุ่ม"), "reserve thai uncat label");
assert(!isReservedCategoryName("Shopee"), "allow normal name");

// Peerland starter rules shouldn't mass-tag everything via generics
{
  const txs = load("peerland_2024-2025.json");
  const specs = [
    { keywords: ["ช้อปปี้เพย์", "shopee"], category: "Shopee / Lazada" },
    { keywords: ["lazada"], category: "Shopee / Lazada" },
    { keywords: ["บัตรกสิกรไทย"], category: "ชำระบัตรกสิกร" },
    { keywords: ["ค่าธรรมเนียม"], category: "ค่าธรรมเนียม" },
    { keywords: ["my qr"], category: "รายได้ลูกค้า / QR" },
    { keywords: ["phiraphong yohakh", "พีระพงษ์"], category: "โอนภายใน / ส่วนตัว" },
  ];
  let rules = [];
  for (const s of specs) rules = upsertRule(rules, s);
  const applied = applyRules(txs, rules);
  const uncat = applied.transactions.filter((t) => !t.category).length;
  console.log("\npeerland starter applied=", applied.applied, "uncat left=", uncat, "rules=", rules.length);
  assert(rules.length >= 4, "peerland starter keeps specific rules");
  assert(applied.applied > 50, "peerland starter tags a meaningful chunk");
  assert(applied.applied < 2000, "peerland starter does not swallow almost all rows");
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll regressions passed");
