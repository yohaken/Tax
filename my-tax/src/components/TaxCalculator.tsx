"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Text } from "moduix";
import {
  INCOME_SHORTCUTS,
  bracketCumulativeCaps,
  formatBaht,
  formatPercent,
} from "@/lib/tax-brackets";
import {
  DEDUCTION_FIELDS,
  DEDUCTION_GROUP_LABEL,
  deductionScaleFor,
  personalAllowance,
  type DeductionField,
  type TaxPeriod,
} from "@/lib/tax-deductions";
import {
  EXPENSE_PRESETS,
  type ExpenseMode,
} from "@/lib/tax-expense";
import { calcPersonalTax } from "@/lib/tax-personal";
import {
  activeDeductions,
  activeIncomes,
  activeSlice,
  addIncomeRow,
  loadTaxCalcDraft,
  removeIncomeRow,
  saveTaxCalcDraft,
  setDraftPeriod,
  sumIncomeRows,
  updateActiveDeductions,
  updateExpense,
  updateIncomeRow,
  type IncomeRow,
  type TaxCalcDraft,
} from "@/lib/tax-calc-store";

function targetStorageKey(period: TaxPeriod) {
  return `my-tax-calc-shortcut-target-v2-${period}`;
}

function formatAmountInput(n: number) {
  return Math.max(0, Math.round(n)).toLocaleString("en-US");
}

function amountText(n: number) {
  return n ? formatAmountInput(n) : "";
}

function textsFromIncomes(incomes: IncomeRow[]) {
  const texts: Record<string, string> = {};
  for (const row of incomes) texts[row.id] = amountText(row.amount);
  return texts;
}

/** อัตโนมัติ: ช่องที่โฟกัสล่าสุด → ช่องว่างแรก → ช่องแรก */
function pickSmartIncomeId(
  incomes: IncomeRow[],
  focusedId: string | null,
): string {
  if (focusedId && incomes.some((r) => r.id === focusedId)) return focusedId;
  const empty = incomes.find((r) => !r.amount);
  if (empty) return empty.id;
  return incomes[0]?.id || "";
}

export function TaxCalculator() {
  const [draft, setDraft] = useState<TaxCalcDraft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [amountTexts, setAmountTexts] = useState<Record<string, string>>({});
  /** "auto" หรือ id ของช่อง */
  const [targetMode, setTargetMode] = useState<string>("auto");
  const [focusedIncomeId, setFocusedIncomeId] = useState<string | null>(null);
  const [deductOpen, setDeductOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);

  function syncPeriodUi(next: TaxCalcDraft, preferTarget?: string) {
    const incomes = activeIncomes(next);
    setAmountTexts(textsFromIncomes(incomes));
    let mode = preferTarget || "auto";
    try {
      const saved = window.localStorage.getItem(targetStorageKey(next.period));
      if (saved === "auto" || incomes.some((r) => r.id === saved)) {
        mode = saved || "auto";
      } else if (preferTarget && (preferTarget === "auto" || incomes.some((r) => r.id === preferTarget))) {
        mode = preferTarget;
      } else {
        mode = "auto";
      }
    } catch {
      mode = "auto";
    }
    setTargetMode(mode);
    setFocusedIncomeId(
      mode !== "auto" && incomes.some((r) => r.id === mode)
        ? mode
        : incomes[0]?.id ?? null,
    );
  }

  useEffect(() => {
    const loaded = loadTaxCalcDraft();
    setDraft(loaded);
    syncPeriodUi(loaded);
  }, []);

  function persist(next: TaxCalcDraft) {
    setDraft(next);
    setSaveState("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTaxCalcDraft(next);
      setSaveState("saved");
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setSaveState("idle"), 1200);
    }, 250);
  }

  function chooseTargetMode(mode: string) {
    setTargetMode(mode);
    if (!draft) return;
    try {
      window.localStorage.setItem(targetStorageKey(draft.period), mode);
    } catch {
      /* ignore */
    }
  }

  const period: TaxPeriod = draft?.period || "annual";
  const isMidyear = period === "midyear";
  const slice = draft ? activeSlice(draft) : null;
  const incomes = draft ? activeIncomes(draft) : [];
  const deductions = draft ? activeDeductions(draft) : {};
  const incomeTotal = sumIncomeRows(incomes);
  const result = useMemo(
    () =>
      calcPersonalTax({
        grossIncome: incomeTotal,
        expense: {
          mode: slice?.expenseMode || (isMidyear ? "flat60" : "salary50cap100k"),
          customPct: slice?.customExpensePct,
          customAmount: slice?.customExpenseAmount,
        },
        deductions,
        period,
      }),
    [incomeTotal, deductions, period, slice, isMidyear],
  );
  const { expense, deductions: deductionResult, tax } = result;
  const rateCaps = useMemo(() => bracketCumulativeCaps(), []);
  const personalRight = personalAllowance(period);

  const resolvedTargetId = draft
    ? targetMode === "auto"
      ? pickSmartIncomeId(incomes, focusedIncomeId)
      : incomes.some((r) => r.id === targetMode)
        ? targetMode
        : pickSmartIncomeId(incomes, focusedIncomeId)
    : "";

  const resolvedTargetIndex = Math.max(
    0,
    incomes.findIndex((r) => r.id === resolvedTargetId),
  );

  function updateIncome(id: string, patch: Partial<IncomeRow>) {
    if (!draft) return;
    persist(updateIncomeRow(draft, id, patch));
  }

  function onAmountChange(id: string, raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    const text = digits ? formatAmountInput(Number(digits)) : "";
    setAmountTexts((prev) => ({ ...prev, [id]: text }));
    updateIncome(id, { amount: digits ? Number(digits) : 0 });
  }

  function applyShortcut(amount: number) {
    if (!draft || !resolvedTargetId) return;
    const row = incomes.find((r) => r.id === resolvedTargetId);
    if (!row) return;
    const nextAmount = row.amount + amount;
    setFocusedIncomeId(resolvedTargetId);
    setAmountTexts((prev) => ({
      ...prev,
      [resolvedTargetId]: amountText(nextAmount),
    }));
    updateIncome(resolvedTargetId, { amount: nextAmount });
  }

  function clearTargetRow() {
    if (!draft || !resolvedTargetId) return;
    setAmountTexts((prev) => ({ ...prev, [resolvedTargetId]: "" }));
    updateIncome(resolvedTargetId, { amount: 0 });
  }

  function setDeduction(id: string, value: number) {
    if (!draft) return;
    persist(
      updateActiveDeductions(draft, {
        ...deductions,
        [id]: Math.max(0, value),
      }),
    );
  }

  function setExpenseMode(mode: ExpenseMode) {
    if (!draft) return;
    persist(updateExpense(draft, { expenseMode: mode }));
  }

  function setPeriod(next: TaxPeriod) {
    if (!draft || draft.period === next) return;
    const switched = setDraftPeriod(draft, next);
    syncPeriodUi(switched, "auto");
    persist(switched);
  }

  if (!draft || !slice) {
    return (
      <div className="tax-calc">
        <Text tone="muted">กำลังโหลด…</Text>
      </div>
    );
  }

  const groups = (["family", "insurance", "saving", "other", "donation"] as const).map(
    (group) => ({
      group,
      label: DEDUCTION_GROUP_LABEL[group],
      fields: DEDUCTION_FIELDS.filter((f) => f.group === group),
    }),
  );

  return (
    <div className="tax-calc">
      <header className="tax-calc-head">
        <h1 className="tax-calc-page-title">คำนวณภาษี</h1>
        <div className="tax-period-switch" role="group" aria-label="โหมดรอบภาษี">
          <button
            type="button"
            className={`tax-period-chip${period === "annual" ? " is-active" : ""}`}
            onClick={() => setPeriod("annual")}
          >
            ทั้งปี
          </button>
          <button
            type="button"
            className={`tax-period-chip${period === "midyear" ? " is-active" : ""}`}
            onClick={() => setPeriod("midyear")}
          >
            ครึ่งปี
          </button>
        </div>
        <Text size="sm" tone="muted">
          {isMidyear
            ? "ภ.ง.ด.94 · หักค่าใช้จ่าย → ลดหย่อนครึ่งสิทธิ → ขั้นบันไดชุดเดิม"
            : "ภ.ง.ด.90/91 · หักค่าใช้จ่าย → ลดหย่อน → ขั้นบันได"}
        </Text>
        <span
          className={`tax-save-pill${saveState === "saved" ? " is-saved" : ""}${saveState === "saving" ? " is-saving" : ""}`}
        >
          {saveState === "saving"
            ? "กำลังบันทึก…"
            : saveState === "saved"
              ? "บันทึกแล้ว"
              : "บันทึกอัตโนมัติ"}
        </span>
      </header>

      <section className="tax-calc-panel">
        <div className="tax-section-head">
          <h2 className="tax-section-title">
            {isMidyear ? "เงินได้ครึ่งปี (ก่อนหักค่าใช้จ่าย)" : "เงินได้ทั้งปี (ก่อนหักค่าใช้จ่าย)"}
          </h2>
          <Text size="sm" tone="muted">
            {isMidyear
              ? "ใส่ยอด ม.ค.–มิ.ย. ก่อนหักค่าใช้จ่าย/ลดหย่อน"
              : "ใส่ยอดทั้งปีก่อนหักค่าใช้จ่าย/ลดหย่อน"}
          </Text>
        </div>

        <div className="tax-income-rows">
          {incomes.map((row, index) => {
            const isTarget = row.id === resolvedTargetId;
            return (
              <div
                className={`tax-income-row${isTarget ? " is-target" : ""}`}
                key={row.id}
              >
                <button
                  type="button"
                  className={`tax-income-label-btn${isTarget ? " is-active" : ""}`}
                  onClick={() => {
                    setFocusedIncomeId(row.id);
                    chooseTargetMode(row.id);
                  }}
                  title="เลือกช่องนี้สำหรับตัวช่วยใส่เงิน"
                >
                  {isMidyear ? "ครึ่งปี" : "ทั้งปี"} {index + 1}
                </button>
                <input
                  className="tax-calc-input tax-income-amount"
                  inputMode="numeric"
                  placeholder="0"
                  value={amountTexts[row.id] ?? amountText(row.amount)}
                  onFocus={() => setFocusedIncomeId(row.id)}
                  onChange={(e) => onAmountChange(row.id, e.target.value)}
                />
                <input
                  className="tax-income-note"
                  placeholder="โน้ต…"
                  value={row.note}
                  onFocus={() => setFocusedIncomeId(row.id)}
                  onChange={(e) => updateIncome(row.id, { note: e.target.value })}
                />
                <button
                  type="button"
                  className="tax-row-remove"
                  aria-label={`ลบช่อง ${index + 1}`}
                  onClick={() => {
                    const next = removeIncomeRow(draft, row.id);
                    const nextIncomes = activeIncomes(next);
                    if (targetMode === row.id) chooseTargetMode("auto");
                    if (focusedIncomeId === row.id) {
                      setFocusedIncomeId(nextIncomes[0]?.id ?? null);
                    }
                    persist(next);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="tax-shortcut-block">
          <div className="tax-target-row" role="group" aria-label="เลือกช่องรับตัวช่วย">
            <span className="tax-target-label">ใส่เข้า</span>
            <button
              type="button"
              className={`tax-target-chip${targetMode === "auto" ? " is-active" : ""}`}
              onClick={() => chooseTargetMode("auto")}
              title="โฟกัสล่าสุด → ช่องว่างแรก → ช่อง 1"
            >
              อัตโนมัติ
            </button>
            {incomes.map((row, index) => (
              <button
                key={row.id}
                type="button"
                className={`tax-target-chip${targetMode === row.id ? " is-active" : ""}${resolvedTargetId === row.id && targetMode === "auto" ? " is-resolved" : ""}`}
                onClick={() => {
                  setFocusedIncomeId(row.id);
                  chooseTargetMode(row.id);
                }}
              >
                ช่อง {index + 1}
              </button>
            ))}
            <span className="tax-target-hint">
              ตอนนี้ → ช่อง {resolvedTargetIndex + 1}
            </span>
          </div>

          <div className="tax-shortcut-row" role="group" aria-label="ตัวช่วยใส่เงิน">
            {INCOME_SHORTCUTS.map((amount) => (
              <button
                key={amount}
                type="button"
                className="tax-shortcut-btn"
                onClick={() => applyShortcut(amount)}
              >
                +{formatBaht(amount)}
              </button>
            ))}
            <button
              type="button"
              className="tax-shortcut-btn is-mute"
              onClick={clearTargetRow}
            >
              ล้างช่องนี้
            </button>
          </div>
        </div>

        <div className="tax-row-actions">
          <button
            type="button"
            className="tax-shortcut-btn"
            onClick={() => {
              const next = addIncomeRow(draft);
              const added = activeIncomes(next).at(-1);
              if (added) {
                setFocusedIncomeId(added.id);
                setAmountTexts((prev) => ({ ...prev, [added.id]: "" }));
              }
              persist(next);
            }}
          >
            + เพิ่มช่องเงินได้
          </button>
          <span className="tax-inline-sum">
            รวม{isMidyear ? "ครึ่งปี" : "ทั้งปี"} {formatBaht(incomeTotal)} บาท
          </span>
        </div>
      </section>

      <section className="tax-calc-panel tax-calc-panel-slim">
        <div className="tax-section-head">
          <h2 className="tax-section-title">หักค่าใช้จ่าย</h2>
          <Text size="sm" tone="muted">
            ขั้นก่อนค่าลดหย่อน · {expense.label}
          </Text>
        </div>
        <div className="tax-expense-modes" role="group" aria-label="วิธีหักค่าใช้จ่าย">
          {EXPENSE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`tax-expense-chip${slice.expenseMode === preset.id ? " is-active" : ""}`}
              title={preset.hint}
              onClick={() => setExpenseMode(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {slice.expenseMode === "customPct" ? (
          <label className="tax-expense-custom">
            <span>% เหมา</span>
            <input
              className="tax-calc-input"
              inputMode="numeric"
              value={slice.customExpensePct || ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                persist(
                  updateExpense(draft, {
                    customExpensePct: digits ? Number(digits) : 0,
                  }),
                );
              }}
            />
          </label>
        ) : null}
        {slice.expenseMode === "customAmount" ? (
          <label className="tax-expense-custom">
            <span>ยอดหัก (บาท)</span>
            <input
              className="tax-calc-input"
              inputMode="numeric"
              value={
                slice.customExpenseAmount
                  ? formatAmountInput(slice.customExpenseAmount)
                  : ""
              }
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                persist(
                  updateExpense(draft, {
                    customExpenseAmount: digits ? Number(digits) : 0,
                  }),
                );
              }}
            />
          </label>
        ) : null}
        <p className="tax-expense-summary">
          หักค่าใช้จ่าย {formatBaht(expense.expense)} → เหลือ{" "}
          {formatBaht(expense.incomeAfterExpense)} บาท
        </p>
      </section>

      <section className="tax-calc-panel tax-calc-panel-slim">
        <div className="tax-result-strip" aria-label="สรุปภาษี">
          <div className="tax-result-chip">
            <span>รวมได้</span>
            <strong>{formatBaht(incomeTotal)}</strong>
          </div>
          <div className="tax-result-chip">
            <span>ค่าใช้จ่าย</span>
            <strong>{formatBaht(expense.expense)}</strong>
          </div>
          <div className="tax-result-chip">
            <span>ลดหย่อน</span>
            <strong>{formatBaht(deductionResult.total)}</strong>
          </div>
          <div className="tax-result-chip">
            <span>สุทธิ</span>
            <strong>{formatBaht(deductionResult.netIncome)}</strong>
          </div>
          <div className="tax-result-chip is-accent">
            <span>{isMidyear ? "ภาษีครึ่งปี" : "ภาษีทั้งปี"}</span>
            <strong>{formatBaht(tax.totalTax)}</strong>
          </div>
          <div className="tax-result-chip">
            <span>เฉลี่ย</span>
            <strong>{formatPercent(tax.effectiveRate)}</strong>
          </div>
        </div>

        <div className="tax-deduct-shell">
          <button
            type="button"
            className="tax-deduct-toggle"
            aria-expanded={deductOpen}
            onClick={() => setDeductOpen((v) => !v)}
          >
            <span className="tax-deduct-caret">{deductOpen ? "▾" : "▸"}</span>
            <span>หักค่าลดหย่อน</span>
            <span className="tax-deduct-toggle-meta">
              รวม {formatBaht(deductionResult.total)} · ส่วนตัว{" "}
              {formatBaht(personalRight)}
              {isMidyear ? " · สิทธิ÷2" : ""}
              {deductOpen ? "" : " · แตะเพื่อแก้"}
            </span>
          </button>

          {deductOpen ? (
            <div className="tax-deduct-body">
              {isMidyear ? (
                <p className="tax-deduct-note">
                  ครึ่งปีใช้สิทธิลดหย่อนกึ่งหนึ่ง (ม.56 ทวิ) แต่คิดภาษีด้วยอัตราขั้นบันไดชุดเดิม
                  — ไม่ใช่ภาษีทั้งปี÷2
                </p>
              ) : null}
              {groups.map(({ group, label, fields }) => (
                <div className="tax-deduct-group" key={group}>
                  <span className="tax-deduct-group-label">{label}</span>
                  <div className="tax-deduct-fields">
                    {fields.map((field) => (
                      <DeductionInput
                        key={field.id}
                        field={field}
                        period={period}
                        value={
                          field.fixed != null
                            ? personalRight
                            : deductions[field.id] || 0
                        }
                        onChange={(v) => setDeduction(field.id, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="tax-calc-panel">
        <div className="tax-tables-grid">
          <div className="tax-slice-table-wrap">
            <div className="tax-table-caption">
              แยกตามช่วง (คิดเฉพาะส่วนในขั้น × อัตราขั้นนั้น แล้วบวกสะสม)
            </div>
            {tax.slices.length ? (
              <table className="tax-slice-table">
                <thead>
                  <tr>
                    <th>ช่วง</th>
                    <th>อัตรา</th>
                    <th>ฐานในขั้น</th>
                    <th>ภาษีขั้นนี้</th>
                  </tr>
                </thead>
                <tbody>
                  {tax.slices.map((s) => (
                    <tr key={`${s.label}-${s.rate}`}>
                      <td>{s.label}</td>
                      <td>{formatPercent(s.rate)}</td>
                      <td>{formatBaht(s.base)}</td>
                      <td>{formatBaht(s.tax)}</td>
                    </tr>
                  ))}
                  <tr className="tax-total-row">
                    <td colSpan={3}>รวมภาษี</td>
                    <td>{formatBaht(tax.totalTax)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <Text size="sm" tone="muted">
                ยังไม่เข้าช่วงที่ต้องเสียภาษี (สุทธิไม่เกิน 150,000)
              </Text>
            )}
          </div>

          <div className="tax-rate-table-wrap">
            <div className="tax-table-caption">
              อัตราอ้างอิง + ภาษีสะสมสูงสุดของขั้น
            </div>
            <table className="tax-rate-table">
              <thead>
                <tr>
                  <th>เงินได้สุทธิ</th>
                  <th>อัตรา</th>
                  <th>ภาษีสะสมสูงสุด</th>
                </tr>
              </thead>
              <tbody>
                {rateCaps.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td>{formatPercent(b.rate)}</td>
                    <td>
                      {b.cumulativeTaxMax == null
                        ? "—"
                        : formatBaht(b.cumulativeTaxMax)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Text size="sm" tone="muted">
          {isMidyear
            ? "ครึ่งปี: เงินได้ → หักค่าใช้จ่าย (เช่น เหมา 60%) → ลดหย่อนครึ่งสิทธิ → ขั้นบันไดชุดเดิมบนสุทธิครึ่งปี — ไม่ใช่ภาษีทั้งปี÷2"
            : "ทั้งปี: เงินได้ → หักค่าใช้จ่าย → ลดหย่อน → ขั้นบันไดสะสม เช่น สุทธิ 500,000 เสีย 27,500 (ไม่ใช่ 10% × ทั้งก้อน)"}
        </Text>
      </section>
    </div>
  );
}

function DeductionInput({
  field,
  period,
  value,
  onChange,
}: {
  field: DeductionField;
  period: TaxPeriod;
  value: number;
  onChange: (n: number) => void;
}) {
  const isCount = field.unitAmount != null;
  const isFixed = field.fixed != null;
  const scale = deductionScaleFor(period);
  const unit = field.unitAmount != null ? field.unitAmount * scale : null;
  const max = field.max == null ? null : field.max * scale;
  const titleParts = [
    field.label,
    period === "midyear" ? "ครึ่งปี·สิทธิ÷2" : null,
    unit != null ? `คนละ ${formatBaht(unit)}` : null,
    max != null ? `เพดาน ${formatBaht(max)}` : null,
    field.hint,
  ].filter(Boolean);
  const title = titleParts.join(" · ");

  if (isFixed) {
    return (
      <label className="tax-deduct-field is-fixed" title={title}>
        <span className="tax-deduct-label">{field.shortLabel}</span>
        <span className="tax-deduct-fixed">{formatBaht(value)}</span>
      </label>
    );
  }

  return (
    <label className={`tax-deduct-field${isCount ? " is-count" : ""}`} title={title}>
      <span className="tax-deduct-label">{field.shortLabel}</span>
      <input
        className="tax-deduct-input"
        inputMode="numeric"
        value={value ? (isCount ? String(value) : formatAmountInput(value)) : ""}
        placeholder="0"
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits ? Number(digits) : 0);
        }}
      />
    </label>
  );
}
