import type { TaxPeriod } from "@/lib/tax-deductions";
import type { ExpenseMode } from "@/lib/tax-expense";
import type { ExpenseInput } from "@/lib/tax-expense";

export type IncomeRow = {
  id: string;
  amount: number;
  note: string;
};

export type PeriodSlice = {
  incomes: IncomeRow[];
  deductions: Record<string, number>;
  expenseMode: ExpenseMode;
  customExpensePct: number;
  customExpenseAmount: number;
};

export type TaxCalcDraft = {
  version: 4;
  /** ติ๊กค้าง: ประมาณการทั้งปีจากครึ่งปี × 2 */
  linkAnnualFromMidyear: boolean;
  /** รายได้ต่อเดือน → × 6 เข้าช่องครึ่งปี */
  monthlyIncome: number;
  byPeriod: Record<TaxPeriod, PeriodSlice>;
  updatedAt: string;
};

const STORAGE_KEY = "my-tax-calc-draft-v4";
const LEGACY_V3_KEY = "my-tax-calc-draft-v3";
const LEGACY_V2_KEY = "my-tax-calc-draft-v2";
const LEGACY_V1_KEY = "my-tax-calc-draft-v1";

function newId() {
  return `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultIncomeRows(count = 1): IncomeRow[] {
  return Array.from({ length: Math.max(1, count) }, () => ({
    id: newId(),
    amount: 0,
    note: "",
  }));
}

function defaultExpenseMode(period: TaxPeriod): ExpenseMode {
  return period === "midyear" ? "flat60" : "salary50cap100k";
}

function emptySlice(period: TaxPeriod = "annual"): PeriodSlice {
  return {
    incomes: defaultIncomeRows(1),
    deductions: {},
    expenseMode: defaultExpenseMode(period),
    customExpensePct: 60,
    customExpenseAmount: 0,
  };
}

export function defaultDraft(): TaxCalcDraft {
  return {
    version: 4,
    linkAnnualFromMidyear: true,
    monthlyIncome: 0,
    byPeriod: {
      annual: emptySlice("annual"),
      midyear: emptySlice("midyear"),
    },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeExpenseMode(value: unknown, period: TaxPeriod): ExpenseMode {
  const allowed: ExpenseMode[] = [
    "none",
    "flat60",
    "flat30",
    "salary50cap100k",
    "customPct",
    "customAmount",
  ];
  if (typeof value === "string" && (allowed as string[]).includes(value)) {
    return value as ExpenseMode;
  }
  return defaultExpenseMode(period);
}

function normalizeRows(raw: unknown, minRows = 1): IncomeRow[] {
  if (!Array.isArray(raw) || !raw.length) return defaultIncomeRows(minRows);
  const incomes = raw.map((row, i) => {
    const r = row as Partial<IncomeRow>;
    return {
      id: String(r?.id || `inc-${i}-${newId()}`),
      amount: Math.max(0, Number(r?.amount) || 0),
      note: String(r?.note || ""),
    };
  });
  while (incomes.length < minRows) {
    incomes.push({ id: newId(), amount: 0, note: "" });
  }
  return incomes;
}

function normalizeDeductions(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const next = { ...(raw as Record<string, number>) };
  delete next.personal;
  return next;
}

function normalizeSlice(raw: unknown, period: TaxPeriod): PeriodSlice {
  const s = (raw || {}) as Partial<PeriodSlice>;
  return {
    incomes: normalizeRows(s.incomes, 1),
    deductions: normalizeDeductions(s.deductions),
    expenseMode: normalizeExpenseMode(s.expenseMode, period),
    customExpensePct: Math.min(100, Math.max(0, Number(s.customExpensePct) || 60)),
    customExpenseAmount: Math.max(0, Number(s.customExpenseAmount) || 0),
  };
}

export function sumIncomeRows(rows: IncomeRow[]) {
  return rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
}

export function getSlice(draft: TaxCalcDraft, period: TaxPeriod): PeriodSlice {
  return draft.byPeriod[period] || emptySlice(period);
}

export function midyearGross(draft: TaxCalcDraft) {
  return sumIncomeRows(getSlice(draft, "midyear").incomes);
}

/** รายได้ทั้งปีที่ใช้คิด — ถ้าติ๊กลิงก์ = ครึ่งปี × 2 */
export function annualGross(draft: TaxCalcDraft) {
  if (draft.linkAnnualFromMidyear) return midyearGross(draft) * 2;
  return sumIncomeRows(getSlice(draft, "annual").incomes);
}

export function expenseInputFromSlice(slice: PeriodSlice): ExpenseInput {
  return {
    mode: slice.expenseMode,
    customPct: slice.customExpensePct,
    customAmount: slice.customExpenseAmount,
  };
}

/** ค่าใช้จ่ายทั้งปี: ถ้าลิงก์ ใช้โหมดเดียวกับครึ่งปีบนฐานรายได้ที่ derive */
export function annualExpenseInput(draft: TaxCalcDraft): ExpenseInput {
  if (draft.linkAnnualFromMidyear) {
    return expenseInputFromSlice(getSlice(draft, "midyear"));
  }
  return expenseInputFromSlice(getSlice(draft, "annual"));
}

function withSlice(
  draft: TaxCalcDraft,
  period: TaxPeriod,
  patch: Partial<PeriodSlice>,
): TaxCalcDraft {
  const prev = getSlice(draft, period);
  return {
    ...draft,
    byPeriod: {
      ...draft.byPeriod,
      [period]: {
        incomes: patch.incomes ?? prev.incomes,
        deductions: patch.deductions ?? prev.deductions,
        expenseMode: patch.expenseMode ?? prev.expenseMode,
        customExpensePct: patch.customExpensePct ?? prev.customExpensePct,
        customExpenseAmount:
          patch.customExpenseAmount ?? prev.customExpenseAmount,
      },
    },
  };
}

function ensurePrimaryIncome(incomes: IncomeRow[], amount: number): IncomeRow[] {
  if (!incomes.length) {
    return [{ id: newId(), amount, note: "" }];
  }
  return incomes.map((row, i) => (i === 0 ? { ...row, amount } : row));
}

/** ใส่รายได้/เดือน → เติมช่องครึ่งปีแถวแรก = × 6 */
export function setMonthlyIncome(draft: TaxCalcDraft, monthly: number): TaxCalcDraft {
  const m = Math.max(0, Number.isFinite(monthly) ? monthly : 0);
  const half = Math.round(m * 6);
  const mid = getSlice(draft, "midyear");
  return {
    ...withSlice(draft, "midyear", {
      incomes: ensurePrimaryIncome(mid.incomes, half),
    }),
    monthlyIncome: m,
  };
}

/** แก้ยอดครึ่งปีแถวแรก → sync รายได้/เดือน = ÷ 6 */
export function syncMonthlyFromMidyear(draft: TaxCalcDraft): TaxCalcDraft {
  const gross = midyearGross(draft);
  return {
    ...draft,
    monthlyIncome: gross > 0 ? Math.round((gross / 6) * 100) / 100 : 0,
  };
}

export function setLinkAnnualFromMidyear(
  draft: TaxCalcDraft,
  linked: boolean,
): TaxCalcDraft {
  return { ...draft, linkAnnualFromMidyear: Boolean(linked) };
}

export function addIncomeRow(
  draft: TaxCalcDraft,
  period: TaxPeriod,
): TaxCalcDraft {
  const slice = getSlice(draft, period);
  return withSlice(draft, period, {
    incomes: [...slice.incomes, { id: newId(), amount: 0, note: "" }],
  });
}

export function removeIncomeRow(
  draft: TaxCalcDraft,
  period: TaxPeriod,
  id: string,
): TaxCalcDraft {
  const current = getSlice(draft, period).incomes;
  const incomes =
    current.length <= 1
      ? [{ id: newId(), amount: 0, note: "" }]
      : current.filter((r) => r.id !== id);
  let next = withSlice(draft, period, { incomes });
  if (period === "midyear") next = syncMonthlyFromMidyear(next);
  return next;
}

export function updateIncomeRow(
  draft: TaxCalcDraft,
  period: TaxPeriod,
  id: string,
  patch: Partial<IncomeRow>,
): TaxCalcDraft {
  const incomes = getSlice(draft, period).incomes.map((row) =>
    row.id === id ? { ...row, ...patch } : row,
  );
  let next = withSlice(draft, period, { incomes });
  if (period === "midyear") next = syncMonthlyFromMidyear(next);
  return next;
}

export function updatePeriodDeductions(
  draft: TaxCalcDraft,
  period: TaxPeriod,
  deductions: Record<string, number>,
): TaxCalcDraft {
  const next = { ...deductions };
  delete next.personal;
  return withSlice(draft, period, { deductions: next });
}

export function updatePeriodExpense(
  draft: TaxCalcDraft,
  period: TaxPeriod,
  patch: Partial<
    Pick<PeriodSlice, "expenseMode" | "customExpensePct" | "customExpenseAmount">
  >,
): TaxCalcDraft {
  return withSlice(draft, period, patch);
}

function migrateFromByPeriod(
  byPeriod: Record<string, Partial<PeriodSlice>> | undefined,
  extras: Partial<TaxCalcDraft> = {},
): TaxCalcDraft {
  return {
    version: 4,
    linkAnnualFromMidyear:
      extras.linkAnnualFromMidyear !== undefined
        ? Boolean(extras.linkAnnualFromMidyear)
        : true,
    monthlyIncome: Math.max(0, Number(extras.monthlyIncome) || 0),
    byPeriod: {
      annual: normalizeSlice(byPeriod?.annual, "annual"),
      midyear: normalizeSlice(byPeriod?.midyear, "midyear"),
    },
    updatedAt: extras.updatedAt || new Date().toISOString(),
  };
}

function migrateV3(raw: string): TaxCalcDraft | null {
  try {
    const parsed = JSON.parse(raw) as {
      byPeriod?: Record<string, Partial<PeriodSlice>>;
      updatedAt?: string;
    };
    if (!parsed.byPeriod) return null;
    const draft = migrateFromByPeriod(parsed.byPeriod, {
      updatedAt: parsed.updatedAt,
    });
    return syncMonthlyFromMidyear(draft);
  } catch {
    return null;
  }
}

function migrateV2(raw: string): TaxCalcDraft | null {
  return migrateV3(raw);
}

function migrateV1(raw: string): TaxCalcDraft | null {
  try {
    const parsed = JSON.parse(raw) as {
      period?: string;
      incomes?: unknown;
      deductions?: unknown;
      updatedAt?: string;
    };
    const isMid = parsed.period === "midyear";
    const rows = normalizeRows(parsed.incomes, 1);
    const deductions = normalizeDeductions(parsed.deductions);
    const draft = migrateFromByPeriod(
      {
        annual: {
          ...emptySlice("annual"),
          incomes: isMid ? defaultIncomeRows(1) : rows,
          deductions: isMid ? {} : deductions,
        },
        midyear: {
          ...emptySlice("midyear"),
          incomes: isMid ? rows : defaultIncomeRows(1),
          deductions: isMid ? deductions : {},
        },
      },
      { updatedAt: parsed.updatedAt },
    );
    return syncMonthlyFromMidyear(draft);
  } catch {
    return null;
  }
}

export function loadTaxCalcDraft(): TaxCalcDraft {
  if (typeof window === "undefined") return defaultDraft();
  try {
    const rawV4 = localStorage.getItem(STORAGE_KEY);
    if (rawV4) {
      const parsed = JSON.parse(rawV4) as Partial<TaxCalcDraft>;
      if (parsed.byPeriod) {
        return {
          version: 4,
          linkAnnualFromMidyear:
            parsed.linkAnnualFromMidyear === undefined
              ? true
              : Boolean(parsed.linkAnnualFromMidyear),
          monthlyIncome: Math.max(0, Number(parsed.monthlyIncome) || 0),
          byPeriod: {
            annual: normalizeSlice(parsed.byPeriod.annual, "annual"),
            midyear: normalizeSlice(parsed.byPeriod.midyear, "midyear"),
          },
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }

    for (const [key, migrate] of [
      [LEGACY_V3_KEY, migrateV3],
      [LEGACY_V2_KEY, migrateV2],
      [LEGACY_V1_KEY, migrateV1],
    ] as const) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const migrated = migrate(raw);
      if (migrated) {
        saveTaxCalcDraft(migrated);
        return migrated;
      }
    }
    return defaultDraft();
  } catch {
    return defaultDraft();
  }
}

export function saveTaxCalcDraft(draft: TaxCalcDraft) {
  if (typeof window === "undefined") return;
  const next: TaxCalcDraft = {
    version: 4,
    linkAnnualFromMidyear: Boolean(draft.linkAnnualFromMidyear),
    monthlyIncome: Math.max(0, Number(draft.monthlyIncome) || 0),
    byPeriod: {
      annual: normalizeSlice(draft.byPeriod?.annual, "annual"),
      midyear: normalizeSlice(draft.byPeriod?.midyear, "midyear"),
    },
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
