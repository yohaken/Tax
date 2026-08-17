import type { TaxPeriod } from "@/lib/tax-deductions";
import type { ExpenseMode } from "@/lib/tax-expense";

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
  version: 3;
  /** ทั้งปี หรือครึ่งปี (ภ.ง.ด.94) — สลับโหมดโดยไม่ปนรายได้ */
  period: TaxPeriod;
  byPeriod: Record<TaxPeriod, PeriodSlice>;
  updatedAt: string;
};

const STORAGE_KEY = "my-tax-calc-draft-v3";
const LEGACY_V2_KEY = "my-tax-calc-draft-v2";
const LEGACY_V1_KEY = "my-tax-calc-draft-v1";

function newId() {
  return `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultIncomeRows(): IncomeRow[] {
  return [
    { id: newId(), amount: 0, note: "" },
    { id: newId(), amount: 0, note: "" },
    { id: newId(), amount: 0, note: "" },
  ];
}

function defaultExpenseMode(period: TaxPeriod): ExpenseMode {
  // ภ.ง.ด.94 มักเป็น 40(5)–40(8) → เหมา 60% เป็นค่าเริ่มต้นที่สมเหตุสมผล
  return period === "midyear" ? "flat60" : "salary50cap100k";
}

function emptySlice(period: TaxPeriod = "annual"): PeriodSlice {
  return {
    incomes: defaultIncomeRows(),
    deductions: {},
    expenseMode: defaultExpenseMode(period),
    customExpensePct: 60,
    customExpenseAmount: 0,
  };
}

export function defaultDraft(): TaxCalcDraft {
  return {
    version: 3,
    period: "annual",
    byPeriod: {
      annual: emptySlice("annual"),
      midyear: emptySlice("midyear"),
    },
    updatedAt: new Date().toISOString(),
  };
}

function normalizePeriod(value: unknown): TaxPeriod {
  return value === "midyear" ? "midyear" : "annual";
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

function normalizeRows(raw: unknown): IncomeRow[] {
  if (!Array.isArray(raw) || !raw.length) return defaultIncomeRows();
  const incomes = raw.map((row, i) => {
    const r = row as Partial<IncomeRow>;
    return {
      id: String(r?.id || `inc-${i}-${newId()}`),
      amount: Math.max(0, Number(r?.amount) || 0),
      note: String(r?.note || ""),
    };
  });
  while (incomes.length < 3) {
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
    incomes: normalizeRows(s.incomes),
    deductions: normalizeDeductions(s.deductions),
    expenseMode: normalizeExpenseMode(s.expenseMode, period),
    customExpensePct: Math.min(100, Math.max(0, Number(s.customExpensePct) || 60)),
    customExpenseAmount: Math.max(0, Number(s.customExpenseAmount) || 0),
  };
}

export function activeSlice(draft: TaxCalcDraft): PeriodSlice {
  return draft.byPeriod[draft.period] || emptySlice(draft.period);
}

export function activeIncomes(draft: TaxCalcDraft): IncomeRow[] {
  return activeSlice(draft).incomes;
}

export function activeDeductions(draft: TaxCalcDraft): Record<string, number> {
  return activeSlice(draft).deductions;
}

function withActiveSlice(
  draft: TaxCalcDraft,
  patch: Partial<PeriodSlice>,
): TaxCalcDraft {
  const period = draft.period;
  const prev = draft.byPeriod[period] || emptySlice(period);
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

function migrateLegacyV1(raw: string): TaxCalcDraft | null {
  try {
    const parsed = JSON.parse(raw) as {
      period?: unknown;
      incomes?: unknown;
      deductions?: unknown;
      updatedAt?: string;
    };
    const period = normalizePeriod(parsed.period);
    const annualIncomes = normalizeRows(parsed.incomes);
    const annualDeductions = normalizeDeductions(parsed.deductions);
    return {
      version: 3,
      period,
      byPeriod: {
        annual: {
          ...emptySlice("annual"),
          incomes: period === "annual" ? annualIncomes : defaultIncomeRows(),
          deductions: period === "annual" ? annualDeductions : {},
        },
        midyear: {
          ...emptySlice("midyear"),
          incomes: period === "midyear" ? annualIncomes : defaultIncomeRows(),
          deductions: period === "midyear" ? annualDeductions : {},
        },
      },
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function migrateV2(raw: string): TaxCalcDraft | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TaxCalcDraft> & {
      byPeriod?: Record<string, Partial<PeriodSlice>>;
    };
    if (!parsed.byPeriod) return null;
    return {
      version: 3,
      period: normalizePeriod(parsed.period),
      byPeriod: {
        annual: normalizeSlice(parsed.byPeriod.annual, "annual"),
        midyear: normalizeSlice(parsed.byPeriod.midyear, "midyear"),
      },
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function loadTaxCalcDraft(): TaxCalcDraft {
  if (typeof window === "undefined") return defaultDraft();
  try {
    const rawV3 = localStorage.getItem(STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as Partial<TaxCalcDraft>;
      if (parsed.byPeriod) {
        return {
          version: 3,
          period: normalizePeriod(parsed.period),
          byPeriod: {
            annual: normalizeSlice(parsed.byPeriod.annual, "annual"),
            midyear: normalizeSlice(parsed.byPeriod.midyear, "midyear"),
          },
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }

    const rawV2 = localStorage.getItem(LEGACY_V2_KEY);
    if (rawV2) {
      const migrated = migrateV2(rawV2);
      if (migrated) {
        saveTaxCalcDraft(migrated);
        return migrated;
      }
    }

    const rawV1 = localStorage.getItem(LEGACY_V1_KEY);
    if (rawV1) {
      const migrated = migrateLegacyV1(rawV1);
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
    version: 3,
    period: normalizePeriod(draft.period),
    byPeriod: {
      annual: normalizeSlice(draft.byPeriod?.annual, "annual"),
      midyear: normalizeSlice(draft.byPeriod?.midyear, "midyear"),
    },
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function addIncomeRow(draft: TaxCalcDraft): TaxCalcDraft {
  const incomes = [
    ...activeIncomes(draft),
    { id: newId(), amount: 0, note: "" },
  ];
  return withActiveSlice(draft, { incomes });
}

export function removeIncomeRow(draft: TaxCalcDraft, id: string): TaxCalcDraft {
  const current = activeIncomes(draft);
  const incomes =
    current.length <= 1
      ? [{ id: newId(), amount: 0, note: "" }]
      : current.filter((r) => r.id !== id);
  return withActiveSlice(draft, { incomes });
}

export function updateIncomeRow(
  draft: TaxCalcDraft,
  id: string,
  patch: Partial<IncomeRow>,
): TaxCalcDraft {
  const incomes = activeIncomes(draft).map((row) =>
    row.id === id ? { ...row, ...patch } : row,
  );
  return withActiveSlice(draft, { incomes });
}

export function updateActiveDeductions(
  draft: TaxCalcDraft,
  deductions: Record<string, number>,
): TaxCalcDraft {
  const next = { ...deductions };
  delete next.personal;
  return withActiveSlice(draft, { deductions: next });
}

export function updateExpense(
  draft: TaxCalcDraft,
  patch: Partial<
    Pick<PeriodSlice, "expenseMode" | "customExpensePct" | "customExpenseAmount">
  >,
): TaxCalcDraft {
  return withActiveSlice(draft, patch);
}

export function setDraftPeriod(
  draft: TaxCalcDraft,
  period: TaxPeriod,
): TaxCalcDraft {
  return {
    ...draft,
    period: normalizePeriod(period),
  };
}

export function sumIncomeRows(rows: IncomeRow[]) {
  return rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
}
