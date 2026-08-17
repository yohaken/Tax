import type { Filing, PetitSummary } from "./types";

function toNumber(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/** ยอดเงินจริงมักมีคอมมา หรือทศนิยม หรือมีค่ามาก — กรองเลขลำดับบรรทัดในแบบ */
function looksLikeMoney(raw: string, n: number) {
  if (raw.includes(",") || raw.includes(".")) return n >= 0;
  // จำนวนเต็มไม่มีคอมมา: รับเฉพาะที่ยอดสมเหตุสมผล ไม่ใช่เลขข้อ 1-40
  return n >= 100;
}

function parseAmount(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = (match[1] || "").trim();
    const n = toNumber(raw);
    if (n === undefined) continue;
    if (!looksLikeMoney(raw, n)) continue;
    return n;
  }
  return undefined;
}

function parseReceiptPaid(text: string): number | undefined {
  // *********7,211.00 หรือ จำนวนเงิน (บาท) ... 7,211.00
  const patterns = [
    /\*{3,}([\d,]+\.\d{2})/,
    /จำนวนเงิน\s*\(บาท\)[^\d]*([\d,]+\.\d{2})/,
    /([\d,]+\.\d{2})\s*\([^)]*บาท[^)]*\)/,
    /P9\d+\s+\d+\s+\*+([\d,]+\.\d{2})/,
  ];
  return parseAmount(text.replace(/\s+/g, " "), patterns);
}

export function extractAmountsFromPdfText(text: string) {
  const compact = text.replace(/\s+/g, " ");
  const receiptPaid = parseReceiptPaid(compact);

  const taxPayable = parseAmount(compact, [
    /ภาษีที่ต้องชำระเพิ่มเติม[^\d]{0,40}([\d,]+\.?\d*)/,
    /ภาษีที่ต้องชำระเพิ่มเติม[^\d]{0,40}([\d,]+\.?\d*)/,
    /ภาษีที่ต้องชำระ(?!เพิ่มเติม)[^\d]{0,40}([\d,]+\.?\d*)/,
    /ภาษีเงินได้บุคคลธรรมดาที่ต้องชำระ[^\d]{0,40}([\d,]+\.?\d*)/,
  ]);

  const taxRefund = parseAmount(compact, [
    /ภาษีที่ชำระไว้เกิน[^\d]{0,40}([\d,]+\.?\d*)/,
    /ภาษีที่ได้รับคืน[^\d]{0,40}([\d,]+\.?\d*)/,
    /ขอคืนเงินภาษี[^\d]{0,40}([\d,]+\.?\d*)/,
  ]);

  const netIncome = parseAmount(compact, [
    /เงินได้สุทธิ[^\d]{0,40}([\d,]+\.?\d*)/,
    /รายได้สุทธิ[^\d]{0,40}([\d,]+\.?\d*)/,
  ]);

  const withholding = parseAmount(compact, [
    /ภาษีหัก ณ ที่จ่าย[^\d]{0,40}([\d,]+\.?\d*)/,
    /หัก ณ ที่จ่าย[^\d]{0,40}([\d,]+\.?\d*)/,
  ]);

  // ใบเสร็จ = ยอดที่ชำระจริง — ใช้เป็น taxPayable ถ้ายังไม่มียอดชำระ/คืนชัด
  return {
    taxPayable: taxPayable ?? (!taxRefund ? receiptPaid : undefined),
    taxRefund,
    netIncome,
    withholding,
    receiptPaid,
  };
}

function formatBaht(n?: number) {
  if (n === undefined) return null;
  return `${n.toLocaleString("th-TH")} บาท`;
}

export function buildPetitSummary(
  filing: Filing,
  pdfText?: string,
): PetitSummary {
  const extracted = pdfText ? extractAmountsFromPdfText(pdfText) : null;
  const amounts = extracted || filing.amounts || {};

  const seq =
    filing.filingSequence === "additional"
      ? `ยื่นเพิ่มเติม #${filing.additionalRound ?? 1}`
      : "ยื่นปกติ";

  const bullets: string[] = [
    `เลขอ้างอิง ${filing.id}`,
    `สถานะ: ${filing.status}${
      filing.statusUpdatedAtRaw ? ` (${filing.statusUpdatedAtRaw})` : ""
    }`,
  ];

  const payable = formatBaht(amounts.taxPayable);
  const refund = formatBaht(amounts.taxRefund);
  const net = formatBaht(amounts.netIncome);
  const wh = formatBaht(amounts.withholding);
  const paid = formatBaht(extracted?.receiptPaid);

  if (payable) bullets.push(`ภาษีที่ต้องชำระ: ${payable}`);
  if (refund) bullets.push(`ภาษีชำระเกิน/ขอคืน: ${refund}`);
  if (!payable && !refund && paid) bullets.push(`ยอดตามใบเสร็จ: ${paid}`);
  if (net) bullets.push(`เงินได้สุทธิ: ${net}`);
  if (wh) bullets.push(`หัก ณ ที่จ่าย: ${wh}`);

  if (!payable && !refund && !net && !paid) {
    bullets.push(
      pdfText
        ? "อ่าน PDF แล้ว แต่ยังจับยอดหลักไม่ได้ — ให้ AI อ่านไฟล์อีกครั้ง"
        : "รอสรุปยอดจาก PDF เมื่อนำเข้าไฟล์",
    );
  }

  const docCount = filing.documents.filter((d) => d.filePath || d.gcsPath).length;
  let trackNext = "นำเข้า PDF แบบ/ใบเสร็จ เพื่อสรุปยอด";
  if (docCount > 0 && (payable !== null || refund !== null || paid !== null)) {
    trackNext = "ใช้ยอดนี้ติดตามเทียบรอบยื่นปกติ/เพิ่มเติม และเก็บใบเสร็จ";
  } else if (docCount > 0) {
    trackNext = "ให้ AI สรุปจากเอกสารอีกครั้ง หรือตรวจข้อความ PDF";
  } else if (filing.filingSequence === "normal") {
    trackNext = "เทียบกับรอบยื่นเพิ่มเติมของปีเดียวกัน";
  }

  return {
    headline: `${filing.formTypeLabel} ปี ${filing.taxYear} — ${seq} สำเร็จ`,
    bullets: bullets.slice(0, 5),
    trackNext,
    amountsHint: {
      taxPayable: amounts.taxPayable ?? extracted?.receiptPaid,
      taxRefund: amounts.taxRefund,
      netIncome: amounts.netIncome,
      withholding: amounts.withholding,
    },
    updatedAt: new Date().toISOString(),
    source: "regex",
  };
}
