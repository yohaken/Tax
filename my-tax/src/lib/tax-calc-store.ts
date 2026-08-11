import type { TaxPeriod } from "@/lib/tax-deductions";

export type IncomeRow = {
  id: string;
  amount: number;
  note: string;
};

export type PeriodSlice = {
  incomes: IncomeRow[];
  deductions: Record<string, number>;
};

export type TaxCalcDraft = {
  version: 2;
  /** ทั้งปี หรือครึ่งปี (ภ.ง.ด.94) — สลับโหมดโดยไม่ปนรายได้ */
  period: TaxPeriod;
  byPeriod: Record<TaxPeriod, PeriodSlice>;
  updatedAt: string;
};

const STORAGE_KEY = "my-tax-calc-draft-v2";
const LEGACY_STORAGE_KEY = "my-tax-calc-draft-v1";

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

function emptySlice(): PeriodSlice {
  return {
    incomes: defaultIncomeRows(),
    deductions: {},
  };
}

export function defaultDraft(): TaxCalcDraft {
  return {
    version: 2,
    period: "annual",
    byPeriod: {
      annual: emptySlice(),
      midyear: emptySlice(),
    },
    updatedAt: new Date().toISOString(),
  };
}

function normalizePeriod(value: unknown): TaxPeriod {
  return value === "midyear" ? "midyear" : "annual";
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

function normalizeSlice(raw: unknown): PeriodSlice {
  const s = (raw || {}) as Partial<PeriodSlice>;
  return {
    incomes: normalizeRows(s.incomes),
    deductions: normalizeDeductions(s.deductions),
  };
}

export function activeSlice(draft: TaxCalcDraft): PeriodSlice {
  return draft.byPeriod[draft.period] || emptySlice();
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
  const prev = draft.byPeriod[period] || emptySlice();
  return {
    ...draft,
    byPeriod: {
      ...draft.byPeriod,
      [period]: {
        incomes: patch.incomes ?? prev.incomes,
        deductions: patch.deductions ?? prev.deductions,
      },
    },
  };
}

function migrateLegacy(raw: string): TaxCalcDraft | null {
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
      version: 2,
      period,
      byPeriod: {
        annual: {
          incomes: period === "annual" ? annualIncomes : defaultIncomeRows(),
          deductions: period === "annual" ? annualDeductions : {},
        },
        midyear: {
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

export function loadTaxCalcDraft(): TaxCalcDraft {
  if (typeof window === "undefined") return defaultDraft();
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<TaxCalcDraft> & {
        incomes?: unknown;
        deductions?: unknown;
      };
      if (parsed.byPeriod) {
        return {
          version: 2,
          period: normalizePeriod(parsed.period),
          byPeriod: {
            annual: normalizeSlice(parsed.byPeriod.annual),
            midyear: normalizeSlice(parsed.byPeriod.midyear),
          },
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }

    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const migrated = migrateLegacy(rawV1);
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
    version: 2,
    period: normalizePeriod(draft.period),
    byPeriod: {
      annual: normalizeSlice(draft.byPeriod?.annual),
      midyear: normalizeSlice(draft.byPeriod?.midyear),
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
