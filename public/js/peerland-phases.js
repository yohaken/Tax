/**
 * Peerland grouping plan — Phases 1–3
 *
 * Phase 1 (6): platforms / fees / invest — high confidence
 * Phase 2 (2): self + family
 * Phase 3 (~20): top recurring counterparties (n≥~20 or high value)
 *
 * Keyword rule: one language per rule (Thai OR Latin) so primary-match works.
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

/** Named customer / partner subgroups (Phase 3). */
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

export const PEERLAND_CATEGORIES = [
  ...PEERLAND_PHASE1_CATEGORIES,
  ...PEERLAND_PHASE2_CATEGORIES,
  ...PEERLAND_PHASE3_CATEGORIES,
  "อื่นๆ",
];

/** Phase 1 rules */
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

/** Phase 2 — self vs family (separate Thai/EN rules) */
export const PEERLAND_PHASE2_RULES = [
  { keywords: ["phiraphong yohakh"], category: "โอนภายใน / ส่วนตัว" },
  { keywords: ["phiraphong"], category: "โอนภายใน / ส่วนตัว" },
  { keywords: ["พีระพงษ์"], category: "โอนภายใน / ส่วนตัว" },
  { keywords: ["พรรณทิวา"], category: "โอนครอบครัว / เครือญาติ" },
  { keywords: ["พรปวีณ์"], category: "โอนครอบครัว / เครือญาติ" },
  { keywords: ["ศิรินธาร"], category: "โอนครอบครัว / เครือญาติ" },
  { keywords: ["นิตยา ศรี"], category: "โอนครอบครัว / เครือญาติ" },
];

/** Phase 3 — top counterparties */
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

export const PEERLAND_PHASE123_RULES = [
  ...PEERLAND_PHASE1_RULES,
  ...PEERLAND_PHASE2_RULES,
  ...PEERLAND_PHASE3_RULES,
].map((r) => ({ ...r, curated: true }));

/** Build rule objects ready for applyRules / state.rules */
export function buildPeerlandPhase123Rules(upsertRule) {
  let rules = [];
  for (const spec of PEERLAND_PHASE123_RULES) {
    rules = upsertRule(rules, {
      keywords: spec.keywords,
      category: spec.category,
      curated: true,
    });
  }
  return rules;
}

export const PEERLAND_PHASE_META = {
  phase1Groups: PEERLAND_PHASE1_CATEGORIES.length,
  phase2Groups: PEERLAND_PHASE2_CATEGORIES.length,
  phase3Groups: PEERLAND_PHASE3_CATEGORIES.length,
  totalGroups: PEERLAND_CATEGORIES.length,
  ruleCount: PEERLAND_PHASE123_RULES.length,
};
