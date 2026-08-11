/** อัตราภาษีเงินได้บุคคลธรรมดาก้าวหน้า (เงินได้สุทธิ) — โครงสร้างปัจจุบันของกรมสรรพากร */
export type TaxBracket = {
  from: number;
  to: number | null;
  rate: number;
  label: string;
};

export const TH_PERSONAL_TAX_BRACKETS: TaxBracket[] = [
  { from: 0, to: 150_000, rate: 0, label: "0 – 150,000" },
  { from: 150_000, to: 300_000, rate: 0.05, label: "150,001 – 300,000" },
  { from: 300_000, to: 500_000, rate: 0.1, label: "300,001 – 500,000" },
  { from: 500_000, to: 750_000, rate: 0.15, label: "500,001 – 750,000" },
  { from: 750_000, to: 1_000_000, rate: 0.2, label: "750,001 – 1,000,000" },
  { from: 1_000_000, to: 2_000_000, rate: 0.25, label: "1,000,001 – 2,000,000" },
  { from: 2_000_000, to: 5_000_000, rate: 0.3, label: "2,000,001 – 5,000,000" },
  { from: 5_000_000, to: null, rate: 0.35, label: "5,000,001 ขึ้นไป" },
];

export const INCOME_SHORTCUTS = [
  500_000, 100_000, 50_000, 10_000, 5_000,
] as const;

export type BracketSlice = {
  label: string;
  rate: number;
  base: number;
  tax: number;
};

export type TaxBreakdown = {
  netIncome: number;
  totalTax: number;
  effectiveRate: number;
  slices: BracketSlice[];
};

export function calcProgressiveTax(netIncome: number): TaxBreakdown {
  const income = Math.max(0, Number.isFinite(netIncome) ? netIncome : 0);
  const slices: BracketSlice[] = [];
  let totalTax = 0;

  for (const b of TH_PERSONAL_TAX_BRACKETS) {
    const upper = b.to ?? Number.POSITIVE_INFINITY;
    if (income <= b.from) break;
    const base = Math.min(income, upper) - b.from;
    if (base <= 0) continue;
    const tax = base * b.rate;
    totalTax += tax;
    slices.push({
      label: b.label,
      rate: b.rate,
      base,
      tax,
    });
  }

  return {
    netIncome: income,
    totalTax,
    effectiveRate: income > 0 ? totalTax / income : 0,
    slices,
  };
}

export function formatBaht(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(rate: number) {
  return `${(rate * 100).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  })}%`;
}

/** ภาษีสูงสุดสะสมถึงปลายขั้น — ยืนยันว่าคิดแบบขั้นบันได (ไม่คิดอัตราสูงสุดทั้งก้อน) */
export function bracketCumulativeCaps() {
  let cumulative = 0;
  return TH_PERSONAL_TAX_BRACKETS.map((b) => {
    if (b.to == null) {
      return { ...b, bandTaxMax: null as number | null, cumulativeTaxMax: null as number | null };
    }
    const width = b.to - b.from;
    const bandTaxMax = width * b.rate;
    cumulative += bandTaxMax;
    return { ...b, bandTaxMax, cumulativeTaxMax: cumulative };
  });
}
