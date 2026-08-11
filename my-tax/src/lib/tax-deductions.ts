/**
 * ค่าลดหย่อนภาษีเงินได้บุคคลธรรมดา (จำลองปีภาษี 2568 / ยื่น 2569)
 * อ้างอิงโครงสร้างกรมสรรพากร — ใช้จำลองคร่าว ๆ ไม่แทนการยื่นจริง
 *
 * คู่มืออ้างอิง:
 * - https://www.rd.go.th (อัตรา/ลดหย่อนบุคคลธรรมดา)
 * - สรุปกลุ่มลดหย่อน: ส่วนตัว·ครอบครัว / ประกัน·ออม / บริจาค / มาตรการรัฐ
 */

export type DeductionField = {
  id: string;
  group: "family" | "insurance" | "saving" | "other" | "donation";
  label: string;
  /** ป้ายสั้นในแถว compact */
  shortLabel: string;
  /** วงเงินสูงสุดต่อรายการ (บาท) — null = ไม่จำกัดคงที่ */
  max: number | null;
  /** ค่าเริ่มต้นคงที่ (เช่น ส่วนตัว 60,000) */
  fixed?: number;
  /** หน่วยนับ (เช่น จำนวนคน) × unitAmount */
  unitAmount?: number;
  /** hint สั้น (title) */
  hint?: string;
};

export const DEDUCTION_FIELDS: DeductionField[] = [
  {
    id: "personal",
    group: "family",
    label: "ส่วนตัว",
    shortLabel: "ส่วนตัว",
    max: 60_000,
    fixed: 60_000,
    hint: "หักอัตโนมัติ 60,000",
  },
  {
    id: "spouse",
    group: "family",
    label: "คู่สมรส (ไม่มีเงินได้)",
    shortLabel: "คู่สมรส",
    max: 60_000,
    hint: "สูงสุด 60,000",
  },
  {
    id: "childBase",
    group: "family",
    label: "บุตร (คนละ 30,000)",
    shortLabel: "บุตร",
    max: null,
    unitAmount: 30_000,
    hint: "จำนวนคน × 30,000",
  },
  {
    id: "childBonus",
    group: "family",
    label: "บุตรคนที่ 2+ เกิด ≥ 2561 (เพิ่มคนละ 30,000)",
    shortLabel: "บุตรโบนัส",
    max: null,
    unitAmount: 30_000,
    hint: "คนที่ 2+ เกิด ≥ 2561 · จำนวนคน",
  },
  {
    id: "parents",
    group: "family",
    label: "เลี้ยงดูบิดามารดา",
    shortLabel: "พ่อแม่",
    max: 120_000,
    unitAmount: 30_000,
    hint: "คนละ 30,000 · รวมไม่เกิน 120,000",
  },
  {
    id: "disability",
    group: "family",
    label: "เลี้ยงดูผู้พิการ/ทุพพลภาพ",
    shortLabel: "ผู้พิการ",
    max: null,
    unitAmount: 60_000,
    hint: "คนละ 60,000",
  },
  {
    id: "socialSecurity",
    group: "insurance",
    label: "ประกันสังคม",
    shortLabel: "ปกส.",
    max: 9_000,
    hint: "ตามจริง ไม่เกิน 9,000",
  },
  {
    id: "lifeHealth",
    group: "insurance",
    label: "ประกันชีวิต + สุขภาพตนเอง",
    shortLabel: "ชีวิต+สุขภาพ",
    max: 100_000,
    hint: "รวมไม่เกิน 100,000",
  },
  {
    id: "parentHealth",
    group: "insurance",
    label: "ประกันสุขภาพบิดามารดา",
    shortLabel: "สุขภาพพ่อแม่",
    max: 15_000,
    hint: "ตามจริง ไม่เกิน 15,000",
  },
  {
    id: "retirementPool",
    group: "saving",
    label: "ออมเกษียณ (PVD/กบข./RMF/บำนาญ ฯลฯ)",
    shortLabel: "ออมเกษียณ",
    max: 500_000,
    hint: "PVD/กบข./RMF ฯลฯ รวมไม่เกิน 500,000",
  },
  {
    id: "ssf",
    group: "saving",
    label: "SSF",
    shortLabel: "SSF",
    max: 200_000,
    hint: "ไม่เกิน 200,000",
  },
  {
    id: "thaiEsg",
    group: "saving",
    label: "Thai ESG",
    shortLabel: "ThaiESG",
    max: 300_000,
    hint: "ไม่เกิน 300,000",
  },
  {
    id: "homeInterest",
    group: "other",
    label: "ดอกเบี้ยกู้ซื้อที่อยู่อาศัย",
    shortLabel: "ดอกเบี้ยบ้าน",
    max: 100_000,
    hint: "ตามจริง ไม่เกิน 100,000",
  },
  {
    id: "easyReceipt",
    group: "other",
    label: "Easy e-Receipt / ช้อปตามมาตรการ",
    shortLabel: "Easy e-Receipt",
    max: 50_000,
    hint: "ตามมาตรการปีนั้น · สูงสุด ~50,000",
  },
  {
    id: "donationGeneral",
    group: "donation",
    label: "บริจาคทั่วไป",
    shortLabel: "บริจาค",
    max: null,
    hint: "ไม่เกิน 10% หลังหักลดหย่อนอื่น",
  },
  {
    id: "donationDouble",
    group: "donation",
    label: "บริจาคการศึกษา/กีฬา/รพ.รัฐ (e-Donation ×2)",
    shortLabel: "บริจาค×2",
    max: null,
    hint: "e-Donation ×2 · เพดาน 10%",
  },
];

export const DEDUCTION_GROUP_LABEL: Record<DeductionField["group"], string> = {
  family: "ส่วนตัวและครอบครัว",
  insurance: "ประกัน",
  saving: "เงินออม/ลงทุน",
  other: "อื่น ๆ / มาตรการ",
  donation: "เงินบริจาค",
};

export type DeductionInputs = Record<string, number>;

/** ทั้งปี (ภ.ง.ด.90/91) หรือครึ่งปี (ภ.ง.ด.94) */
export type TaxPeriod = "annual" | "midyear";

export type DeductionLine = {
  id: string;
  label: string;
  group: DeductionField["group"];
  requested: number;
  applied: number;
  capped: boolean;
};

export type DeductionResult = {
  period: TaxPeriod;
  /** ตัวคูณสิทธิลดหย่อน: ครึ่งปี = 0.5 ตาม ม.56 ทวิ */
  deductionScale: number;
  lines: DeductionLine[];
  totalBeforeDonation: number;
  donationApplied: number;
  total: number;
  incomeAfterExpense: number;
  netIncome: number;
};

function clampAmount(n: number, max: number | null) {
  const v = Math.max(0, Number.isFinite(n) ? n : 0);
  if (max == null) return v;
  return Math.min(v, max);
}

export function deductionScaleFor(period: TaxPeriod) {
  return period === "midyear" ? 0.5 : 1;
}

export function personalAllowance(period: TaxPeriod) {
  return 60_000 * deductionScaleFor(period);
}

/**
 * คำนวณค่าลดหย่อนแล้วได้เงินได้สุทธิสำหรับคิดภาษีขั้นบันได
 *
 * ครึ่งปี (ภ.ง.ด.94): ใช้สิทธิลดหย่อนได้กึ่งหนึ่ง แต่คิดอัตราขั้นบันไดชุดเดิม
 * ไม่ใช่การเอาภาษีทั้งปีมาหาร 2
 */
export function calcDeductions(
  incomeAfterExpense: number,
  inputs: DeductionInputs,
  period: TaxPeriod = "annual",
): DeductionResult {
  const base = Math.max(0, incomeAfterExpense);
  const scale = deductionScaleFor(period);
  const lines: DeductionLine[] = [];
  let totalBeforeDonation = 0;

  for (const field of DEDUCTION_FIELDS) {
    if (field.group === "donation") continue;

    const max = field.max == null ? null : field.max * scale;
    let requested = 0;
    if (field.fixed != null) {
      requested = field.fixed * scale;
    } else if (field.unitAmount != null) {
      const count = Math.max(0, Math.floor(inputs[field.id] || 0));
      requested = count * field.unitAmount * scale;
    } else {
      // ช่องจำนวนเงิน: ใส่ยอดที่ใช้สิทธิในช่วงนั้น เพดานเป็นครึ่งของทั้งปีเมื่อโหมดครึ่งปี
      requested = Math.max(0, inputs[field.id] || 0);
    }

    const applied = clampAmount(requested, max);
    totalBeforeDonation += applied;
    lines.push({
      id: field.id,
      label: field.label,
      group: field.group,
      requested,
      applied,
      capped: applied < requested - 1e-9,
    });
  }

  // ฐานสำหรับเพดานบริจาค 10% = เงินได้หลังหักค่าใช้จ่ายและลดหย่อนอื่น
  const afterOther = Math.max(0, base - totalBeforeDonation);
  const donationCap = afterOther * 0.1;

  const generalReq = Math.max(0, inputs.donationGeneral || 0);
  const doubleReq = Math.max(0, inputs.donationDouble || 0) * 2; // e-Donation ×2
  const donationRequested = generalReq + doubleReq;
  const donationApplied = Math.min(donationRequested, donationCap);

  if (generalReq > 0 || doubleReq > 0 || donationApplied > 0) {
    lines.push({
      id: "donation",
      label: "เงินบริจาค (เพดาน 10%)",
      group: "donation",
      requested: donationRequested,
      applied: donationApplied,
      capped: donationApplied < donationRequested - 1e-9,
    });
  }

  const total = totalBeforeDonation + donationApplied;
  const netIncome = Math.max(0, base - total);

  return {
    period,
    deductionScale: scale,
    lines: lines.filter((l) => l.applied > 0 || l.id === "personal"),
    totalBeforeDonation,
    donationApplied,
    total,
    incomeAfterExpense: base,
    netIncome,
  };
}
