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
import { EXPENSE_PRESETS, type ExpenseMode } from "@/lib/tax-expense";
import { calcPersonalTax, type PersonalTaxResult } from "@/lib/tax-personal";
import {
  addIncomeRow,
  annualExpenseInput,
  annualGross,
  expenseInputFromSlice,
  getSlice,
  loadTaxCalcDraft,
  midyearGross,
  removeIncomeRow,
  saveTaxCalcDraft,
  setLinkAnnualFromMidyear,
  setMonthlyIncome,
  sumIncomeRows,
  updateIncomeRow,
  updatePeriodDeductions,
  updatePeriodExpense,
  type IncomeRow,
  type PeriodSlice,
  type TaxCalcDraft,
} from "@/lib/tax-calc-store";

function formatAmountInput(n: number) {
  return Math.max(0, Math.round(n)).toLocaleString("en-US");
}

function amountText(n: number) {
  return n ? formatAmountInput(n) : "";
}

export function TaxCalculator() {
  const [draft, setDraft] = useState<TaxCalcDraft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [monthlyText, setMonthlyText] = useState("");
  const [midTexts, setMidTexts] = useState<Record<string, string>>({});
  const [annualTexts, setAnnualTexts] = useState<Record<string, string>>({});
  const [midDeductOpen, setMidDeductOpen] = useState(false);
  const [annualDeductOpen, setAnnualDeductOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);

  function hydrateTexts(next: TaxCalcDraft) {
    const mid = getSlice(next, "midyear").incomes;
    const annual = getSlice(next, "annual").incomes;
    const mt: Record<string, string> = {};
    const at: Record<string, string> = {};
    for (const row of mid) mt[row.id] = amountText(row.amount);
    for (const row of annual) at[row.id] = amountText(row.amount);
    setMidTexts(mt);
    setAnnualTexts(at);
    setMonthlyText(amountText(next.monthlyIncome));
  }

  useEffect(() => {
    const loaded = loadTaxCalcDraft();
    setDraft(loaded);
    hydrateTexts(loaded);
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

  const midyear = useMemo(() => {
    if (!draft) return null;
    const slice = getSlice(draft, "midyear");
    return calcPersonalTax({
      grossIncome: midyearGross(draft),
      expense: expenseInputFromSlice(slice),
      deductions: slice.deductions,
      period: "midyear",
    });
  }, [draft]);

  const annual = useMemo(() => {
    if (!draft) return null;
    const slice = getSlice(draft, "annual");
    return calcPersonalTax({
      grossIncome: annualGross(draft),
      expense: annualExpenseInput(draft),
      deductions: slice.deductions,
      period: "annual",
    });
  }, [draft]);

  const rateCaps = useMemo(() => bracketCumulativeCaps(), []);

  if (!draft || !midyear || !annual) {
    return (
      <div className="tax-calc">
        <Text tone="muted">กำลังโหลด…</Text>
      </div>
    );
  }

  const live = draft;
  const midSlice = getSlice(live, "midyear");
  const annualSlice = getSlice(live, "annual");
  const linked = live.linkAnnualFromMidyear;
  const midGross = midyearGross(live);
  const yearGross = annualGross(live);

  function onMonthlyChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    const monthly = digits ? Number(digits) : 0;
    setMonthlyText(digits ? formatAmountInput(monthly) : "");
    const next = setMonthlyIncome(live, monthly);
    hydrateTexts(next);
    persist(next);
  }

  function onIncomeAmount(
    period: TaxPeriod,
    id: string,
    raw: string,
    setTexts: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  ) {
    const digits = raw.replace(/[^\d]/g, "");
    const amount = digits ? Number(digits) : 0;
    setTexts((prev) => ({
      ...prev,
      [id]: digits ? formatAmountInput(amount) : "",
    }));
    const next = updateIncomeRow(live, period, id, { amount });
    if (period === "midyear") {
      setMonthlyText(amountText(next.monthlyIncome));
    }
    persist(next);
  }

  return (
    <div className="tax-calc">
      <header className="tax-calc-head">
        <h1 className="tax-calc-page-title">คำนวณภาษี</h1>
        <Text size="sm" tone="muted">
          ครึ่งปี (ภ.ง.ด.94) + ภาพรวมทั้งปี — หน้าเดียว
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

      {/* ── ครึ่งปี ── */}
      <section className="tax-calc-panel">
        <div className="tax-section-head">
          <h2 className="tax-section-title">ครึ่งปี · ภ.ง.ด.94</h2>
          <Text size="sm" tone="muted">
            ม.ค.–มิ.ย. · หักค่าใช้จ่าย → ลดหย่อนครึ่งสิทธิ → ขั้นบันไดชุดเดิม
          </Text>
        </div>

        <div className="tax-monthly-row" aria-label="รายได้ต่อเดือนคูณหก">
          <label className="tax-monthly-field">
            <span>บาท/เดือน</span>
            <input
              className="tax-calc-input"
              inputMode="numeric"
              placeholder="0"
              value={monthlyText}
              onChange={(e) => onMonthlyChange(e.target.value)}
            />
          </label>
          <span className="tax-monthly-op" aria-hidden="true">
            × 6
          </span>
          <span className="tax-monthly-eq" aria-hidden="true">
            →
          </span>
          <span className="tax-monthly-result">
            ครึ่งปี {formatBaht(midGross)}
          </span>
        </div>

        <IncomeRows
          period="midyear"
          slice={midSlice}
          texts={midTexts}
          draft={live}
          locked={false}
          onAmount={(id, raw) => onIncomeAmount("midyear", id, raw, setMidTexts)}
          onNote={(id, note) => persist(updateIncomeRow(live, "midyear", id, { note }))}
          onAdd={() => {
            const next = addIncomeRow(live, "midyear");
            hydrateTexts(next);
            persist(next);
          }}
          onRemove={(id) => {
            const next = removeIncomeRow(live, "midyear", id);
            hydrateTexts(next);
            persist(next);
          }}
          onShortcut={(id, add) => {
            const row = midSlice.incomes.find((r) => r.id === id);
            if (!row) return;
            const amount = row.amount + add;
            setMidTexts((prev) => ({ ...prev, [id]: amountText(amount) }));
            const next = updateIncomeRow(live, "midyear", id, { amount });
            setMonthlyText(amountText(next.monthlyIncome));
            persist(next);
          }}
        />

        <ExpenseBlock
          slice={midSlice}
          expenseLabel={midyear.expense.label}
          expenseAmount={midyear.expense.expense}
          afterExpense={midyear.expense.incomeAfterExpense}
          onMode={(mode) =>
            persist(updatePeriodExpense(live, "midyear", { expenseMode: mode }))
          }
          onPct={(n) =>
            persist(updatePeriodExpense(live, "midyear", { customExpensePct: n }))
          }
          onAmt={(n) =>
            persist(
              updatePeriodExpense(live, "midyear", { customExpenseAmount: n }),
            )
          }
        />

        <ResultStrip
          period="midyear"
          gross={midGross}
          result={midyear}
        />

        <DeductionPanel
          period="midyear"
          open={midDeductOpen}
          onToggle={() => setMidDeductOpen((v) => !v)}
          slice={midSlice}
          total={midyear.deductions.total}
          onChange={(id, value) =>
            persist(
              updatePeriodDeductions(live, "midyear", {
                ...midSlice.deductions,
                [id]: value,
              }),
            )
          }
        />
      </section>

      {/* ── ลิงก์ ×2 ── */}
      <label className="tax-link-toggle">
        <input
          type="checkbox"
          checked={linked}
          onChange={(e) =>
            persist(setLinkAnnualFromMidyear(live, e.target.checked))
          }
        />
        <span>
          <strong>ใช้ครึ่งปี × 2</strong> เป็นประมาณการทั้งปี
          <span className="tax-link-hint">
            {linked
              ? ` · รายได้ทั้งปี = ${formatBaht(yearGross)} (ล็อกจากครึ่งปี)`
              : " · ปิดแล้วแก้ทั้งปีเองได้"}
          </span>
        </span>
      </label>

      {/* ── ทั้งปี ── */}
      <section className="tax-calc-panel">
        <div className="tax-section-head">
          <h2 className="tax-section-title">ทั้งปี · ภ.ง.ด.90/91</h2>
          <Text size="sm" tone="muted">
            {linked
              ? "ประมาณการจากครึ่งปี × 2 · ลดหย่อนใช้สิทธิเต็มปี · คิดขั้นบันไดใหม่ (ไม่ใช่ภาษีครึ่งปี×2)"
              : "แก้รายได้ทั้งปีเองอิสระ"}
          </Text>
        </div>

        {linked ? (
          <p className="tax-derived-banner">
            รายได้ทั้งปี {formatBaht(yearGross)} = ครึ่งปี {formatBaht(midGross)} × 2
          </p>
        ) : (
          <IncomeRows
            period="annual"
            slice={annualSlice}
            texts={annualTexts}
            draft={live}
            locked={false}
            onAmount={(id, raw) =>
              onIncomeAmount("annual", id, raw, setAnnualTexts)
            }
            onNote={(id, note) =>
              persist(updateIncomeRow(live, "annual", id, { note }))
            }
            onAdd={() => {
              const next = addIncomeRow(live, "annual");
              hydrateTexts(next);
              persist(next);
            }}
            onRemove={(id) => {
              const next = removeIncomeRow(live, "annual", id);
              hydrateTexts(next);
              persist(next);
            }}
            onShortcut={(id, add) => {
              const row = annualSlice.incomes.find((r) => r.id === id);
              if (!row) return;
              const amount = row.amount + add;
              setAnnualTexts((prev) => ({ ...prev, [id]: amountText(amount) }));
              persist(updateIncomeRow(live, "annual", id, { amount }));
            }}
          />
        )}

        <ExpenseBlock
          slice={linked ? midSlice : annualSlice}
          expenseLabel={annual.expense.label}
          expenseAmount={annual.expense.expense}
          afterExpense={annual.expense.incomeAfterExpense}
          locked={linked}
          onMode={(mode) =>
            persist(
              updatePeriodExpense(live, linked ? "midyear" : "annual", {
                expenseMode: mode,
              }),
            )
          }
          onPct={(n) =>
            persist(
              updatePeriodExpense(live, linked ? "midyear" : "annual", {
                customExpensePct: n,
              }),
            )
          }
          onAmt={(n) =>
            persist(
              updatePeriodExpense(live, linked ? "midyear" : "annual", {
                customExpenseAmount: n,
              }),
            )
          }
        />

        <ResultStrip period="annual" gross={yearGross} result={annual} />

        <DeductionPanel
          period="annual"
          open={annualDeductOpen}
          onToggle={() => setAnnualDeductOpen((v) => !v)}
          slice={annualSlice}
          total={annual.deductions.total}
          onChange={(id, value) =>
            persist(
              updatePeriodDeductions(live, "annual", {
                ...annualSlice.deductions,
                [id]: value,
              }),
            )
          }
        />
      </section>

      <section className="tax-calc-panel">
        <div className="tax-table-caption">อัตราขั้นบันได (ใช้ชุดเดียวกันทั้งครึ่งปีและทั้งปี)</div>
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
      </section>
    </div>
  );
}

function IncomeRows({
  period,
  slice,
  texts,
  locked,
  onAmount,
  onNote,
  onAdd,
  onRemove,
  onShortcut,
}: {
  period: TaxPeriod;
  slice: PeriodSlice;
  texts: Record<string, string>;
  draft: TaxCalcDraft;
  locked: boolean;
  onAmount: (id: string, raw: string) => void;
  onNote: (id: string, note: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onShortcut: (id: string, add: number) => void;
}) {
  const primaryId = slice.incomes[0]?.id || "";
  return (
    <div className="tax-income-block">
      <div className="tax-income-rows">
        {slice.incomes.map((row, index) => (
          <div className="tax-income-row tax-income-row-compact" key={row.id}>
            <span className="tax-income-idx">
              {period === "midyear" ? "ครึ่งปี" : "ทั้งปี"}
              {slice.incomes.length > 1 ? ` ${index + 1}` : ""}
            </span>
            <input
              className="tax-calc-input tax-income-amount"
              inputMode="numeric"
              placeholder="0"
              disabled={locked}
              value={texts[row.id] ?? amountText(row.amount)}
              onChange={(e) => onAmount(row.id, e.target.value)}
            />
            <input
              className="tax-income-note"
              placeholder="โน้ต…"
              disabled={locked}
              value={row.note}
              onChange={(e) => onNote(row.id, e.target.value)}
            />
            {!locked && slice.incomes.length > 1 ? (
              <button
                type="button"
                className="tax-row-remove"
                aria-label="ลบช่อง"
                onClick={() => onRemove(row.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {!locked ? (
        <div className="tax-row-actions">
          <div className="tax-shortcut-row" role="group" aria-label="ตัวช่วย">
            {INCOME_SHORTCUTS.map((amount) => (
              <button
                key={amount}
                type="button"
                className="tax-shortcut-btn"
                onClick={() => onShortcut(primaryId, amount)}
              >
                +{formatBaht(amount)}
              </button>
            ))}
          </div>
          <button type="button" className="tax-shortcut-btn" onClick={onAdd}>
            + เพิ่มช่อง
          </button>
          <span className="tax-inline-sum">
            รวม {formatBaht(sumIncomeRows(slice.incomes))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ExpenseBlock({
  slice,
  expenseLabel,
  expenseAmount,
  afterExpense,
  locked = false,
  onMode,
  onPct,
  onAmt,
}: {
  slice: PeriodSlice;
  expenseLabel: string;
  expenseAmount: number;
  afterExpense: number;
  locked?: boolean;
  onMode: (mode: ExpenseMode) => void;
  onPct: (n: number) => void;
  onAmt: (n: number) => void;
}) {
  return (
    <div className={`tax-expense-block${locked ? " is-locked" : ""}`}>
      <div className="tax-section-head">
        <h3 className="tax-subsection-title">หักค่าใช้จ่าย</h3>
        <Text size="sm" tone="muted">
          {expenseLabel}
          {locked ? " · ตามครึ่งปี" : ""}
        </Text>
      </div>
      <div className="tax-expense-modes" role="group">
        {EXPENSE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={locked}
            className={`tax-expense-chip${slice.expenseMode === preset.id ? " is-active" : ""}`}
            title={preset.hint}
            onClick={() => onMode(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {slice.expenseMode === "customPct" && !locked ? (
        <label className="tax-expense-custom">
          <span>% เหมา</span>
          <input
            className="tax-calc-input"
            inputMode="numeric"
            value={slice.customExpensePct || ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              onPct(digits ? Number(digits) : 0);
            }}
          />
        </label>
      ) : null}
      {slice.expenseMode === "customAmount" && !locked ? (
        <label className="tax-expense-custom">
          <span>ยอดหัก</span>
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
              onAmt(digits ? Number(digits) : 0);
            }}
          />
        </label>
      ) : null}
      <p className="tax-expense-summary">
        หัก {formatBaht(expenseAmount)} → เหลือ {formatBaht(afterExpense)}
      </p>
    </div>
  );
}

function ResultStrip({
  period,
  gross,
  result,
}: {
  period: TaxPeriod;
  gross: number;
  result: PersonalTaxResult;
}) {
  return (
    <div className="tax-result-strip" aria-label="สรุปภาษี">
      <div className="tax-result-chip">
        <span>รวมได้</span>
        <strong>{formatBaht(gross)}</strong>
      </div>
      <div className="tax-result-chip">
        <span>ค่าใช้จ่าย</span>
        <strong>{formatBaht(result.expense.expense)}</strong>
      </div>
      <div className="tax-result-chip">
        <span>ลดหย่อน</span>
        <strong>{formatBaht(result.deductions.total)}</strong>
      </div>
      <div className="tax-result-chip">
        <span>สุทธิ</span>
        <strong>{formatBaht(result.deductions.netIncome)}</strong>
      </div>
      <div className="tax-result-chip is-accent">
        <span>{period === "midyear" ? "ภาษีครึ่งปี" : "ภาษีทั้งปี"}</span>
        <strong>{formatBaht(result.tax.totalTax)}</strong>
      </div>
    </div>
  );
}

function DeductionPanel({
  period,
  open,
  onToggle,
  slice,
  total,
  onChange,
}: {
  period: TaxPeriod;
  open: boolean;
  onToggle: () => void;
  slice: PeriodSlice;
  total: number;
  onChange: (id: string, value: number) => void;
}) {
  const personalRight = personalAllowance(period);
  const groups = (["family", "insurance", "saving", "other", "donation"] as const).map(
    (group) => ({
      group,
      label: DEDUCTION_GROUP_LABEL[group],
      fields: DEDUCTION_FIELDS.filter((f) => f.group === group),
    }),
  );

  return (
    <div className="tax-deduct-shell">
      <button
        type="button"
        className="tax-deduct-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="tax-deduct-caret">{open ? "▾" : "▸"}</span>
        <span>หักค่าลดหย่อน</span>
        <span className="tax-deduct-toggle-meta">
          รวม {formatBaht(total)} · ส่วนตัว {formatBaht(personalRight)}
          {period === "midyear" ? " · สิทธิ÷2" : " · สิทธิเต็มปี"}
        </span>
      </button>
      {open ? (
        <div className="tax-deduct-body">
          {period === "midyear" ? (
            <p className="tax-deduct-note">
              ครึ่งปีใช้สิทธิลดหย่อนกึ่งหนึ่ง (ม.56 ทวิ) — ไม่ใช่ภาษีทั้งปี÷2
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
                        : slice.deductions[field.id] || 0
                    }
                    onChange={(v) => onChange(field.id, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
  const title = [
    field.label,
    period === "midyear" ? "ครึ่งปี·สิทธิ÷2" : null,
    unit != null ? `คนละ ${formatBaht(unit)}` : null,
    max != null ? `เพดาน ${formatBaht(max)}` : null,
    field.hint,
  ]
    .filter(Boolean)
    .join(" · ");

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
