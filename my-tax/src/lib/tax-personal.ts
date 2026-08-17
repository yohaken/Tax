/**
 * ท่อคำนวณภาษีบุคคลธรรมดาทั้งปี / ครึ่งปี
 * เงินได้ → ค่าใช้จ่าย → ค่าลดหย่อน → สุทธิ → ขั้นบันได
 */
import { calcProgressiveTax, type TaxBreakdown } from "@/lib/tax-brackets";
import {
  calcDeductions,
  type DeductionInputs,
  type DeductionResult,
  type TaxPeriod,
} from "@/lib/tax-deductions";
import {
  calcExpense,
  type ExpenseInput,
  type ExpenseResult,
} from "@/lib/tax-expense";

export type PersonalTaxInput = {
  grossIncome: number;
  expense: ExpenseInput;
  deductions: DeductionInputs;
  period: TaxPeriod;
};

export type PersonalTaxResult = {
  period: TaxPeriod;
  expense: ExpenseResult;
  deductions: DeductionResult;
  tax: TaxBreakdown;
};

export function calcPersonalTax(input: PersonalTaxInput): PersonalTaxResult {
  const expense = calcExpense(input.grossIncome, input.expense);
  const deductions = calcDeductions(
    expense.incomeAfterExpense,
    input.deductions,
    input.period,
  );
  const tax = calcProgressiveTax(deductions.netIncome);
  return { period: input.period, expense, deductions, tax };
}
