/**
 * Peerland grouping plan — Phases 1–5
 *
 * 1 platforms/fees/invest · 2 self/family · 3 top counterparties
 * 4 expense type buckets · 5 long-tail heuristics (บุคคล/พร้อมเพย์/อื่นๆ)
 *
 * Keyword rule: one language per rule; curated:true for short tokens.
 */

export const PEERLAND_PHASE1_CATEGORIES = [
  "รายได้ลูกค้า / QR",
  "Shopee / Lazada",
  "ชำระบัตรกสิกร",
  "ค่าธรรมเนียม",
  "สินค้า / ซูเปอร์มาร์เก็ต",
  "หลักทรัพย์ / ออม",
];

export const PEERLAND_PHASE2_CATEGORIES = [
  "โอนภายใน / ส่วนตัว",
  "โอนครอบครัว / เครือญาติ",
];

export const PEERLAND_PHASE3_CATEGORIES = [
  "ลูกค้า · Malinee",
  "ลูกค้า · ภัทราวุฒิ",
  "ลูกค้า · Jiphada",
  "ลูกค้า · อธิพันธ์",
  "ลูกค้า · แสงทอง",
  "ลูกค้า · อินทนิล",
  "ลูกค้า · Chanudom",
  "ลูกค้า · บุญธรรม",
  "ลูกค้า · Phaithoon",
  "ลูกค้า · Winai",
  "ลูกค้า · ปรารถนา",
  "ลูกค้า · มัธวี",
  "ลูกค้า · รุ่งราวรรณ์",
  "ลูกค้า · Nilobol",
  "ลูกค้า · ณัฐพัชญ์",
  "ลูกค้า · ณุกานดา",
  "ลูกค้า · Kriangrit",
  "ลูกค้า · จักรรินทร์",
  "ลูกค้า · กิตติคม",
  "ลูกค้า · นลินญา",
  "ลูกค้า · PIPO",
  "คู่ค้า · เทพฤทธิ์",
  "คู่ค้า · ภูริภัทร์",
];

export const PEERLAND_PHASE4_CATEGORIES = [
  "น้ำมัน / พลังงาน",
  "ฝากเงินสด / CDM",
  "ถอนเงินสด",
];

export const PEERLAND_PHASE5_CATEGORIES = [
  "รายได้บริษัท / นิติ",
  "รายได้บุคคลทั่วไป",
  "จ่ายพร้อมเพย์",
  "จ่ายบุคคลทั่วไป",
  "อื่นๆ",
];

export const PEERLAND_CATEGORIES = [
  ...PEERLAND_PHASE1_CATEGORIES,
  ...PEERLAND_PHASE2_CATEGORIES,
  ...PEERLAND_PHASE3_CATEGORIES,
  ...PEERLAND_PHASE4_CATEGORIES,
  ...PEERLAND_PHASE5_CATEGORIES,
];

export const PEERLAND_PHASE1_RULES = [
  { keywords: ["ช้อปปี้เพย์"], category: "Shopee / Lazada" },
  { keywords: ["shopee"], category: "Shopee / Lazada" },
  { keywords: ["lazada"], category: "Shopee / Lazada" },
  { keywords: ["บัตรกสิกรไทย"], category: "ชำระบัตรกสิกร" },
  { keywords: ["ค่าธรรมเนียม"], category: "ค่าธรรมเนียม" },
  { keywords: ["my qr"], category: "รายได้ลูกค้า / QR" },
  { keywords: ["ซีพี แอ็กซ์ตร้า"], category: "สินค้า / ซูเปอร์มาร์เก็ต" },
  { keywords: ["cp axtra"], category: "สินค้า / ซูเปอร์มาร์เก็ต" },
  { keywords: ["หลักทรัพย์ กส"], category: "หลักทรัพย์ / ออม" },
  { keywords: ["ksecurities"], category: "หลักทรัพย์ / ออม" },
];

export const PEERLAND_PHASE2_RULES = [
  { keywords: ["phiraphong yohakh"], category: "โอนภายใน / ส่วนตัว" },
  { keywords: ["phiraphong"], category: "โอนภายใน / ส่วนตัว" },
  { keywords: ["พีระพงษ์"], category: "โอนภายใน / ส่วนตัว" },
  { keywords: ["พรรณทิวา"], category: "โอนครอบครัว / เครือญาติ" },
  { keywords: ["พรปวีณ์"], category: "โอนครอบครัว / เครือญาติ" },
  { keywords: ["ศิรินธาร"], category: "โอนครอบครัว / เครือญาติ" },
  { keywords: ["นิตยา ศรี"], category: "โอนครอบครัว / เครือญาติ" },
];

export const PEERLAND_PHASE3_RULES = [
  { keywords: ["malinee"], category: "ลูกค้า · Malinee" },
  { keywords: ["yottipa"], category: "ลูกค้า · Malinee" },
  { keywords: ["ภัทราวุฒิ"], category: "ลูกค้า · ภัทราวุฒิ" },
  { keywords: ["jiphada"], category: "ลูกค้า · Jiphada" },
  { keywords: ["อธิพันธ์"], category: "ลูกค้า · อธิพันธ์" },
  { keywords: ["แสงทอง วิเศษ"], category: "ลูกค้า · แสงทอง" },
  { keywords: ["อินทนิล"], category: "ลูกค้า · อินทนิล" },
  { keywords: ["chanudom"], category: "ลูกค้า · Chanudom" },
  { keywords: ["บุญธรรม พันธุ"], category: "ลูกค้า · บุญธรรม" },
  { keywords: ["phaithoon"], category: "ลูกค้า · Phaithoon" },
  { keywords: ["sutham"], category: "ลูกค้า · Phaithoon" },
  { keywords: ["winai sangs"], category: "ลูกค้า · Winai" },
  { keywords: ["ปรารถนา ลาน"], category: "ลูกค้า · ปรารถนา" },
  { keywords: ["มัธวี"], category: "ลูกค้า · มัธวี" },
  { keywords: ["รุ่งราวรรณ์"], category: "ลูกค้า · รุ่งราวรรณ์" },
  { keywords: ["nilobol"], category: "ลูกค้า · Nilobol" },
  { keywords: ["ณัฐพัชญ์"], category: "ลูกค้า · ณัฐพัชญ์" },
  { keywords: ["ณุกานดา"], category: "ลูกค้า · ณุกานดา" },
  { keywords: ["kriangrit"], category: "ลูกค้า · Kriangrit" },
  { keywords: ["จักรรินทร์"], category: "ลูกค้า · จักรรินทร์" },
  { keywords: ["กิตติคม"], category: "ลูกค้า · กิตติคม" },
  { keywords: ["นลินญา"], category: "ลูกค้า · นลินญา" },
  { keywords: ["pipo"], category: "ลูกค้า · PIPO" },
  { keywords: ["เทพฤทธิ์"], category: "คู่ค้า · เทพฤทธิ์" },
  { keywords: ["ภูริภัทร์"], category: "คู่ค้า · ภูริภัทร์" },
];

export const PEERLAND_PHASE4_RULES = [
  { keywords: ["ปตท"], category: "น้ำมัน / พลังงาน" },
  { keywords: ["ptt"], category: "น้ำมัน / พลังงาน" },
  { keywords: ["บางจาก"], category: "น้ำมัน / พลังงาน" },
  { keywords: ["shell"], category: "น้ำมัน / พลังงาน" },
  { keywords: ["caltex"], category: "น้ำมัน / พลังงาน" },
  { keywords: ["ฝากเงินสด"], category: "ฝากเงินสด / CDM" },
  { keywords: ["cdm"], category: "ฝากเงินสด / CDM" },
  { keywords: ["เคแบงก์เซอร์วิส"], category: "ฝากเงินสด / CDM" },
  { keywords: ["ถอนเงิน"], category: "ถอนเงินสด" },
];

export const PEERLAND_PHASE1234_RULES = [
  ...PEERLAND_PHASE1_RULES,
  ...PEERLAND_PHASE2_RULES,
  ...PEERLAND_PHASE3_RULES,
  ...PEERLAND_PHASE4_RULES,
].map((r) => ({ ...r, curated: true }));

/** @deprecated alias — prefer PEERLAND_PHASE1234_RULES + phase5 heuristics */
export const PEERLAND_PHASE123_RULES = [
  ...PEERLAND_PHASE1_RULES,
  ...PEERLAND_PHASE2_RULES,
  ...PEERLAND_PHASE3_RULES,
].map((r) => ({ ...r, curated: true }));

const PERSON_RE = /นาย\s|นางสาว\s|น\.ส\.\s|นาง\s|\bmr\.?\s|\bmiss\s|\bmrs\.?\s/i;
const COMPANY_RE = /บจก\.?|บมจ\.?|บริษัท|co\.,?\s*ltd|limited|\blimit\b/i;

/**
 * Phase 5 — assign remaining uncategorized rows by heuristics (not keyword rules).
 * Returns { transactions, applied }.
 */
export function applyPeerlandPhase5Heuristics(transactions) {
  let applied = 0;
  const next = transactions.map((tx) => {
    if (String(tx.category || "").trim()) return tx;
    const desc = String(tx.description || "");
    let category = "";
    if (tx.direction === "in" && COMPANY_RE.test(desc)) category = "รายได้บริษัท / นิติ";
    else if (tx.direction === "in" && /รับโอนเงิน/i.test(desc) && PERSON_RE.test(desc)) {
      category = "รายได้บุคคลทั่วไป";
    } else if (tx.direction === "out" && /พร้อมเพย์/i.test(desc)) category = "จ่ายพร้อมเพย์";
    else if (tx.direction === "out" && /โอนไป/i.test(desc) && PERSON_RE.test(desc)) {
      category = "จ่ายบุคคลทั่วไป";
    } else category = "อื่นๆ";
    applied += 1;
    return { ...tx, category, autoTagged: true };
  });
  return { transactions: next, applied };
}

export function buildPeerlandPhaseRules(upsertRule, specs = PEERLAND_PHASE1234_RULES) {
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

export function buildPeerlandPhase123Rules(upsertRule) {
  return buildPeerlandPhaseRules(upsertRule, PEERLAND_PHASE123_RULES);
}

export function buildPeerlandPhase1234Rules(upsertRule) {
  return buildPeerlandPhaseRules(upsertRule, PEERLAND_PHASE1234_RULES);
}

/** Apply keyword phases 1–4 then heuristic phase 5. */
export function applyPeerlandPhasesAll(transactions, upsertRule, applyRules) {
  const rules = buildPeerlandPhase1234Rules(upsertRule);
  const stepped = applyRules(transactions, rules);
  const phase5 = applyPeerlandPhase5Heuristics(stepped.transactions);
  return {
    transactions: phase5.transactions,
    rules: stepped.rules,
    applied: stepped.applied + phase5.applied,
    appliedRules: stepped.applied,
    appliedHeuristics: phase5.applied,
  };
}

export const PEERLAND_PHASE_META = {
  phase1Groups: PEERLAND_PHASE1_CATEGORIES.length,
  phase2Groups: PEERLAND_PHASE2_CATEGORIES.length,
  phase3Groups: PEERLAND_PHASE3_CATEGORIES.length,
  phase4Groups: PEERLAND_PHASE4_CATEGORIES.length,
  phase5Groups: PEERLAND_PHASE5_CATEGORIES.length,
  totalGroups: PEERLAND_CATEGORIES.length,
  ruleCount: PEERLAND_PHASE1234_RULES.length,
};
