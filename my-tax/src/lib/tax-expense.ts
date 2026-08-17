/**
 * หักค่าใช้จ่ายก่อนค่าลดหย่อน — ขั้นที่ระบบเคยข้าม
 *
 * ลำดับถูก: เงินได้ → ค่าใช้จ่าย → ค่าลดหย่อน → สุทธิ → ขั้นบันได
 * ภ.ง.ด.94: ค่าใช้จ่ายตามประเภทเงินได้ (เช่น เหมา 60%) · ลดหย่อนกึ่งหนึ่ง · อัตราขั้นบันไดชุดเดิม
 */

export type ExpenseMode =
  | "none"
  | "flat60"
  | "flat30"
  | "salary50cap100k"
  | "customPct"
  | "customAmount";

export type ExpensePreset = {
  id: ExpenseMode;
  label: string;
  hint: string;
};

export const EXPENSE_PRESETS: ExpensePreset[] = [
  {
    id: "flat60",
    label: "เหมา 60%",
    hint: "ม.40(7)/(8) หลายกิจการ · ภ.ง.ด.94 ครึ่งปี",
  },
  {
    id: "salary50cap100k",
    label: "เงินเดือน 50% (เพดาน 100k)",
    hint: "ม.40(1)/(2) · ทั้งปีเพดาน 100,000",
  },
  {
    id: "flat30",
    label: "เหมา 30%",
    hint: "เงินได้บางประเภท (เช่น 40(5) บางกรณี)",
  },
  {
    id: "none",
    label: "ไม่หักค่าใช้จ่าย",
    hint: "ใส่ยอดหลังหักค่าใช้จ่ายมาแล้ว",
  },
  {
    id: "customPct",
    label: "กำหนด % เอง",
    hint: "ใส่เปอร์เซ็นต์เหมา",
  },
  {
    id: "customAmount",
    label: "กำหนดยอดเอง",
    hint: "หักตามจริง / ตามหลักฐาน",
  },
];

export type ExpenseInput = {
  mode: ExpenseMode;
  /** สำหรับ customPct — เช่น 60 = 60% */
  customPct?: number;
  /** สำหรับ customAmount */
  customAmount?: number;
};

export type ExpenseResult = {
  mode: ExpenseMode;
  grossIncome: number;
  expense: number;
  incomeAfterExpense: number;
  label: string;
};

export function calcExpense(
  grossIncome: number,
  input: ExpenseInput,
): ExpenseResult {
  const gross = Math.max(0, Number.isFinite(grossIncome) ? grossIncome : 0);
  const mode = input.mode || "none";
  let expense = 0;
  let label = "ไม่หักค่าใช้จ่าย";

  switch (mode) {
    case "flat60":
      expense = gross * 0.6;
      label = "หักเหมา 60%";
      break;
    case "flat30":
      expense = gross * 0.3;
      label = "หักเหมา 30%";
      break;
    case "salary50cap100k":
      expense = Math.min(gross * 0.5, 100_000);
      label = "หัก 50% (เพดาน 100,000)";
      break;
    case "customPct": {
      const pct = Math.min(100, Math.max(0, Number(input.customPct) || 0));
      expense = gross * (pct / 100);
      label = `หักเหมา ${pct}%`;
      break;
    }
    case "customAmount":
      expense = Math.min(gross, Math.max(0, Number(input.customAmount) || 0));
      label = "หักค่าใช้จ่ายตามที่กำหนด";
      break;
    case "none":
    default:
      expense = 0;
      label = "ไม่หักค่าใช้จ่าย";
      break;
  }

  expense = Math.max(0, Math.min(gross, expense));
  return {
    mode,
    grossIncome: gross,
    expense,
    incomeAfterExpense: Math.max(0, gross - expense),
    label,
  };
}

/** ตัวอย่างข้อสอบ: รายได้ครึ่งปี 400,000 เหมา 60% → หลังค่าใช้จ่าย 160,000 */
export function examQ6AfterExpense() {
  return calcExpense(400_000, { mode: "flat60" });
}
