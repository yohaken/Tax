/**
 * Regression: personal tax pipeline (เงินได้ → ค่าใช้จ่าย → ลดหย่อน → ขั้นบันได)
 * Usage: node --experimental-strip-types scripts/test-tax-calc.mjs
 */
import { calcExpense } from "../src/lib/tax-expense.ts";
import { calcDeductions } from "../src/lib/tax-deductions.ts";
import { calcProgressiveTax } from "../src/lib/tax-brackets.ts";

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

function calcPersonal(gross, expenseMode, period) {
  const expense = calcExpense(gross, { mode: expenseMode });
  const deductions = calcDeductions(expense.incomeAfterExpense, {}, period);
  const tax = calcProgressiveTax(deductions.netIncome);
  return { expense, deductions, tax };
}

// ข้อ 6: รายได้ครึ่งปี 400,000 เหมา 60% ส่วนตัว 30,000 → สุทธิ 130,000
{
  const { expense, deductions } = calcPersonal(400_000, "flat60", "midyear");
  if (approx(expense.expense, 240_000)) pass("q6-expense", "240,000");
  else fail("q6-expense", String(expense.expense));
  if (approx(expense.incomeAfterExpense, 160_000)) pass("q6-after-expense", "160,000");
  else fail("q6-after-expense", String(expense.incomeAfterExpense));
  if (approx(deductions.total, 30_000)) pass("q6-personal-half", "30,000");
  else fail("q6-personal-half", String(deductions.total));
  if (approx(deductions.netIncome, 130_000)) pass("q6-net", "130,000 → ก");
  else fail("q6-net", String(deductions.netIncome));
}

// ข้อ 7: สุทธิ 130,000 → ภาษีครึ่งปี 0
{
  const { tax } = calcPersonal(400_000, "flat60", "midyear");
  if (approx(tax.totalTax, 0)) pass("q7-midyear-tax", "0 → ก");
  else fail("q7-midyear-tax", String(tax.totalTax));
}

// ทั้งปี: เงินเดือน 500,000 · หัก 50% เพดาน 100k · ส่วนตัว 60k → สุทธิ 340k → ภาษี 11,500
{
  const { expense, deductions, tax } = calcPersonal(
    500_000,
    "salary50cap100k",
    "annual",
  );
  if (approx(expense.expense, 100_000)) pass("annual-expense-cap", "100,000");
  else fail("annual-expense-cap", String(expense.expense));
  if (approx(deductions.netIncome, 340_000)) pass("annual-net", "340,000");
  else fail("annual-net", String(deductions.netIncome));
  if (approx(tax.totalTax, 11_500)) pass("annual-tax", "11,500");
  else fail("annual-tax", String(tax.totalTax));
}

// พฤติกรรมเก่า (ไม่หักค่าใช้จ่าย)
{
  const { deductions, tax } = calcPersonal(400_000, "none", "midyear");
  if (approx(deductions.netIncome, 370_000) && tax.totalTax > 0) {
    pass("none-mode-no-expense", `net ${deductions.netIncome}`);
  } else {
    fail("none-mode-no-expense", String(deductions.netIncome));
  }
}

// ขั้นบันไดครึ่งปี: สุทธิ 200,000 → 2,500 — ไม่ใช่ทั้งปี÷2
{
  const t = calcProgressiveTax(200_000);
  if (approx(t.totalTax, 2_500)) pass("midyear-bracket-same-rates", "2,500");
  else fail("midyear-bracket-same-rates", String(t.totalTax));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
