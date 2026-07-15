/**
 * Telltea (เทลที) shop grouping — Phases 1–5
 *
 * 1 sales platforms / store EDC · 2 owner & family
 * 3 recurring payouts (staff/ops) · 4 suppliers & services
 * 5 long-tail heuristics
 *
 * Keyword rule: curated:true for short tokens; more specific phrases first.
 */

export const TELLTEA_PHASE1_CATEGORIES = [
  "รายได้ · Grab",
  "รายได้ · LINE Pay",
  "รายได้ · Shopee Pay",
  "รายได้ · Wongnai / Delivery",
  "รายได้หน้าร้าน · Tell Tea",
  "รายได้หน้าร้าน · กงสี",
];

export const TELLTEA_PHASE2_CATEGORIES = [
  "โอนภายใน · เจ้าของ",
  "โอนครอบครัว · ศิรินธาร",
];

export const TELLTEA_PHASE3_CATEGORIES = [
  "จ่าย · นวรัตน์",
  "จ่าย · ทัพท์นครินทร์",
  "จ่าย · จุฬาลักษณ์",
  "จ่าย · สุภาวดี",
  "จ่าย · อารยา",
];

export const TELLTEA_PHASE4_CATEGORIES = [
  "จ่าย · True Money",
  "คู่ค้า · TNSN",
  "คู่ค้า · TG Design",
  "คู่ค้า · B&B Store",
  "ค่าบริการ / Service",
];

export const TELLTEA_PHASE5_CATEGORIES = [
  "รายได้บุคคลทั่วไป",
  "จ่ายพร้อมเพย์",
  "จ่ายบุคคลทั่วไป",
  "อื่นๆ",
];

export const TELLTEA_CATEGORIES = [
  ...TELLTEA_PHASE1_CATEGORIES,
  ...TELLTEA_PHASE2_CATEGORIES,
  ...TELLTEA_PHASE3_CATEGORIES,
  ...TELLTEA_PHASE4_CATEGORIES,
  ...TELLTEA_PHASE5_CATEGORIES,
];

export const TELLTEA_PHASE1_RULES = [
  { keywords: ["แกร็บแท็กซี่"], category: "รายได้ · Grab" },
  { keywords: ["grab"], category: "รายได้ · Grab" },
  { keywords: ["ไลน์ เพย์"], category: "รายได้ · LINE Pay" },
  { keywords: ["line pay"], category: "รายได้ · LINE Pay" },
  { keywords: ["ช้อปปี้เพย์"], category: "รายได้ · Shopee Pay" },
  { keywords: ["shopee"], category: "รายได้ · Shopee Pay" },
  { keywords: ["wongnai"], category: "รายได้ · Wongnai / Delivery" },
  { keywords: ["วงใน มีเด"], category: "รายได้ · Wongnai / Delivery" },
  { keywords: ["delivery hero"], category: "รายได้ · Wongnai / Delivery" },
  // Store own-brand sales (before generic QR)
  { keywords: ["tell tea"], category: "รายได้หน้าร้าน · Tell Tea" },
  { keywords: ["เทลที"], category: "รายได้หน้าร้าน · Tell Tea" },
  { keywords: ["กงสี ที บาร์"], category: "รายได้หน้าร้าน · กงสี" },
  { keywords: ["kb กงสี"], category: "รายได้หน้าร้าน · กงสี" },
  { keywords: ["กงสี"], category: "รายได้หน้าร้าน · กงสี" },
];

export const TELLTEA_PHASE2_RULES = [
  { keywords: ["phiraphong yohakh"], category: "โอนภายใน · เจ้าของ" },
  { keywords: ["phiraphong"], category: "โอนภายใน · เจ้าของ" },
  { keywords: ["พีระพงษ์ โยหา"], category: "โอนภายใน · เจ้าของ" },
  { keywords: ["พีระพงษ์"], category: "โอนภายใน · เจ้าของ" },
  { keywords: ["ศิรินธาร เย็น"], category: "โอนครอบครัว · ศิรินธาร" },
  { keywords: ["ศิรินธาร"], category: "โอนครอบครัว · ศิรินธาร" },
];

export const TELLTEA_PHASE3_RULES = [
  { keywords: ["นวรัตน์ ศรีแก่"], category: "จ่าย · นวรัตน์" },
  { keywords: ["นวรัตน์"], category: "จ่าย · นวรัตน์" },
  { keywords: ["ทัพท์นครินทร์"], category: "จ่าย · ทัพท์นครินทร์" },
  { keywords: ["จุฬาลักษณ์"], category: "จ่าย · จุฬาลักษณ์" },
  { keywords: ["สุภาวดี ไชยศิว"], category: "จ่าย · สุภาวดี" },
  { keywords: ["สุภาวดี"], category: "จ่าย · สุภาวดี" },
  { keywords: ["อารยา ศรีลาพั"], category: "จ่าย · อารยา" },
  { keywords: ["อารยา"], category: "จ่าย · อารยา" },
];

export const TELLTEA_PHASE4_RULES = [
  { keywords: ["ทรู มันนี่"], category: "จ่าย · True Money" },
  { keywords: ["true money"], category: "จ่าย · True Money" },
  { keywords: ["ทีเอ็นเอสเอ็น"], category: "คู่ค้า · TNSN" },
  { keywords: ["ทีจี ดีไซน์"], category: "คู่ค้า · TG Design" },
  { keywords: ["บีแอนด์บี"], category: "คู่ค้า · B&B Store" },
  { keywords: ["service co"], category: "ค่าบริการ / Service" },
  { keywords: ["เพื่อชำระ"], category: "ค่าบริการ / Service" },
];

export const TELLTEA_PHASE1234_RULES = [
  ...TELLTEA_PHASE1_RULES,
  ...TELLTEA_PHASE2_RULES,
  ...TELLTEA_PHASE3_RULES,
  ...TELLTEA_PHASE4_RULES,
].map((r) => ({ ...r, curated: true }));

const PERSON_RE = /นาย\s|นางสาว\s|น\.ส\.\s|นาง\s|ทพญ\.?\s|\bmr\.?\s|\bmiss\s|\bmrs\.?\s/i;

/**
 * Phase 5 — remaining uncategorized rows (shop long-tail).
 */
export function applyTellteaPhase5Heuristics(transactions) {
  let applied = 0;
  const next = transactions.map((tx) => {
    if (String(tx.category || "").trim()) return tx;
    const desc = String(tx.description || "");
    let category = "";
    if (/ยอดยกมา|เปิดบัญชี/i.test(desc)) category = "อื่นๆ";
    else if (tx.direction === "in" && /รับโอนเงิน|รับเงิน/i.test(desc) && PERSON_RE.test(desc)) {
      category = "รายได้บุคคลทั่วไป";
    } else if (tx.direction === "out" && /พร้อมเพย์/i.test(desc)) category = "จ่ายพร้อมเพย์";
    else if (tx.direction === "out" && /โอนไป|โอนเงิน/i.test(desc) && PERSON_RE.test(desc)) {
      category = "จ่ายบุคคลทั่วไป";
    } else category = "อื่นๆ";
    applied += 1;
    return { ...tx, category, autoTagged: true };
  });
  return { transactions: next, applied };
}

export function buildTellteaPhaseRules(upsertRule, specs = TELLTEA_PHASE1234_RULES) {
  let rules = [];
  for (const spec of specs) {
    rules = upsertRule(rules, {
      keywords: spec.keywords,
      category: spec.category,
      curated: true,
    });
  }
  return rules;
}

export function buildTellteaPhase1234Rules(upsertRule) {
  return buildTellteaPhaseRules(upsertRule, TELLTEA_PHASE1234_RULES);
}

/** Apply keyword phases 1–4 then heuristic phase 5. */
export function applyTellteaPhasesAll(transactions, upsertRule, applyRules) {
  const rules = buildTellteaPhase1234Rules(upsertRule);
  const stepped = applyRules(transactions, rules);
  const phase5 = applyTellteaPhase5Heuristics(stepped.transactions);
  return {
    transactions: phase5.transactions,
    rules: stepped.rules,
    applied: stepped.applied + phase5.applied,
    appliedRules: stepped.applied,
    appliedHeuristics: phase5.applied,
  };
}

/** Preview how many uncategorized rows phase rules would catch (no mutation). */
export function previewTellteaPhaseCoverage(transactions, upsertRule, applyRules) {
  const sample = transactions.map((t) => ({ ...t }));
  const result = applyTellteaPhasesAll(sample, upsertRule, applyRules);
  return result;
}

export const TELLTEA_PHASE_META = {
  phase1Groups: TELLTEA_PHASE1_CATEGORIES.length,
  phase2Groups: TELLTEA_PHASE2_CATEGORIES.length,
  phase3Groups: TELLTEA_PHASE3_CATEGORIES.length,
  phase4Groups: TELLTEA_PHASE4_CATEGORIES.length,
  phase5Groups: TELLTEA_PHASE5_CATEGORIES.length,
  totalGroups: TELLTEA_CATEGORIES.length,
  ruleCount: TELLTEA_PHASE1234_RULES.length,
};
