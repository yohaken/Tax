import type { Filing, PetitSummary } from "./types";
import { buildPetitSummary, extractAmountsFromPdfText } from "./petit";
import { GCP_PROJECT_ID, VERTEX_LOCATION, VERTEX_MODEL } from "./gcp";

export type SummarizeMode = "ai" | "regex" | "hybrid";

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || trimmed).trim();
}

function parseJsonLoose(text: string) {
  const cleaned = stripJsonFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // trailing comma / truncated string — last resort
        const repaired = slice
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]");
        return JSON.parse(repaired);
      }
    }
    throw new Error("JSON จาก AI เสียรูปแบบ");
  }
}

function saneAmount(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return undefined;
  if (n === 0) return undefined;
  // เลขข้อในแบบมัก < 100 และเป็นจำนวนเต็ม — ไม่น่าเป็นยอดภาษีหลัก
  if (Number.isInteger(n) && n > 0 && n < 100) return undefined;
  return n;
}

function reconcileAmounts(
  hint: {
    taxPayable?: number;
    taxRefund?: number;
    netIncome?: number;
    withholding?: number;
  },
  prefer: "payable" | "refund" = "payable",
) {
  let taxPayable = saneAmount(hint.taxPayable);
  let taxRefund = saneAmount(hint.taxRefund);
  // อย่าใส่ทั้งชำระและขอคืนเป็นเลขเดียวกัน — มักเป็นยอดใบเสร็จซ้ำ
  if (
    taxPayable != null &&
    taxRefund != null &&
    Math.abs(taxPayable - taxRefund) < 0.01
  ) {
    if (prefer === "refund") taxPayable = undefined;
    else taxRefund = undefined;
  }
  return {
    taxPayable,
    taxRefund,
    netIncome: saneAmount(hint.netIncome),
    withholding: saneAmount(hint.withholding),
  };
}

function preferSide(filing: Filing, text?: string): "payable" | "refund" {
  // อย่าอ่านทั้ง PDF — แบบมีทั้งบรรทัดชำระและขอคืน ทำให้สับสน
  const blob = `${filing.status || ""} ${text || ""}`;
  if (/ขอคืน|คืนภาษี|คืนเงิน|ชำระไว้เกิน|tax\s*refund/i.test(blob)) {
    if (/ชำระ\s*\d|ออกใบเสร็จ|ใบเสร็จรับเงิน/i.test(blob) && !/ขอคืน|คืนภาษี|คืนเงิน|ชำระไว้เกิน/i.test(filing.status || "")) {
      return "payable";
    }
    return "refund";
  }
  return "payable";
}

function preferFromHeadline(
  headline: string | undefined,
  fallback: "payable" | "refund",
): "payable" | "refund" {
  if (!headline) return fallback;
  if (/ขอคืน|คืนภาษี|คืนเงิน|ชำระไว้เกิน/i.test(headline)) return "refund";
  if (/ชำระ/i.test(headline)) return "payable";
  return fallback;
}

function clampPetit(
  raw: unknown,
  filing: Filing,
  fallbackText?: string,
): PetitSummary {
  const base = buildPetitSummary(filing, fallbackText);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<PetitSummary> & {
    amountsHint?: Record<string, unknown>;
  };

  const bullets = Array.isArray(data.bullets)
    ? data.bullets.filter((b): b is string => typeof b === "string").slice(0, 5)
    : base.bullets;

  const headline =
    typeof data.headline === "string" && data.headline.trim()
      ? data.headline.trim()
      : base.headline;
  const prefer = preferFromHeadline(headline, preferSide(filing));
  const fromAi = reconcileAmounts(
    {
      taxPayable: saneAmount(data.amountsHint?.taxPayable),
      taxRefund: saneAmount(data.amountsHint?.taxRefund),
      netIncome: saneAmount(data.amountsHint?.netIncome),
      withholding: saneAmount(data.amountsHint?.withholding),
    },
    prefer,
  );

  return {
    headline,
    bullets: bullets.length ? bullets : base.bullets,
    trackNext:
      typeof data.trackNext === "string" && data.trackNext.trim()
        ? data.trackNext.trim()
        : base.trackNext,
    amountsHint: {
      taxPayable: fromAi.taxPayable ?? saneAmount(base.amountsHint?.taxPayable),
      taxRefund: fromAi.taxRefund ?? saneAmount(base.amountsHint?.taxRefund),
      netIncome: fromAi.netIncome ?? saneAmount(base.amountsHint?.netIncome),
      withholding: fromAi.withholding ?? saneAmount(base.amountsHint?.withholding),
    },
    updatedAt: new Date().toISOString(),
    source: "ai",
  };
}

async function callVertexJson(
  prompt: string,
  pdfBuffers: Buffer[] = [],
) {
  const { VertexAI } = await import("@google-cloud/vertexai");
  const vertex = new VertexAI({
    project: GCP_PROJECT_ID,
    location: VERTEX_LOCATION,
  });
  const model = vertex.getGenerativeModel({
    model: VERTEX_MODEL,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  for (const buf of pdfBuffers.slice(0, 2)) {
    parts.push({
      inlineData: { mimeType: "application/pdf", data: buf.toString("base64") },
    });
  }
  parts.push({ text: prompt });

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });

  const text =
    result.response.candidates?.[0]?.content?.parts
      ?.map((p) => ("text" in p ? p.text : ""))
      .join("") || "";

  if (!text.trim()) throw new Error("Vertex คืนค่าว่าง");
  return parseJsonLoose(text);
}

function buildPrompt(filing: Filing, pdfText?: string) {
  return `คุณเป็นผู้ช่วยอ่านเอกสารภาษีไทยทางการ (ภ.ง.ด.90/94 และใบเสร็จรับเงินกรมสรรพากร)
อ่านไฟล์ PDF ที่แนบเป็นหลัก ข้อความด้านล่างเป็น OCR เสริมที่อาจเพี้ยน

ตอบ JSON เท่านั้น ตามสคีมา:
{
  "headline": string,
  "bullets": string[3-5],
  "trackNext": string,
  "amountsHint": {
    "taxPayable"?: number,
    "taxRefund"?: number,
    "netIncome"?: number,
    "withholding"?: number
  }
}

กฎ:
- ยอดต้องมาจากเอกสารจริงเท่านั้น ห้ามเดา
- อย่าใช้เลขลำดับข้อในแบบ (เช่น 8,9,14,15,17) เป็นยอดเงิน
- ใบเสร็จมี "จำนวนเงิน" / ตัวอักษรบาท — ถ้ายื่นแล้วชำระ ให้ใส่ taxPayable ตามใบเสร็จ
- ถ้าเป็นภาษีชำระไว้เกิน/ขอคืน ให้ใส่ taxRefund และไม่ต้องใส่ taxPayable เป็นเลขเล็กปลอม
- headline สั้น เช่น "ภ.ง.ด.94 ปี 2568 · เพิ่มเติม #1 · ชำระ 7,211"
- bullets อ้างเลขอ้างอิง/วันใบเสร็จ/ยอดสำคัญ
- number ไม่มีคอมมา ไม่ใส่ค่า null

เมทา:
${JSON.stringify(
  {
    id: filing.id,
    formTypeLabel: filing.formTypeLabel,
    taxYear: filing.taxYear,
    filingSequence: filing.filingSequence,
    additionalRound: filing.additionalRound,
    status: filing.status,
    statusUpdatedAtRaw: filing.statusUpdatedAtRaw,
    taxpayerName: filing.taxpayerName,
    tin: filing.tin,
  },
  null,
  2,
)}

ข้อความเสริมจาก PDF:
${(pdfText || "").slice(0, 12000) || "(ไม่มีข้อความเสริม)"}
`;
}

export async function summarizeWithAi(
  filing: Filing,
  options?: { pdfText?: string; pdfBuffers?: Buffer[]; pdfBuffer?: Buffer },
): Promise<{ petit: PetitSummary; mode: SummarizeMode; error?: string }> {
  const pdfText = options?.pdfText;
  const buffers =
    options?.pdfBuffers ||
    (options?.pdfBuffer ? [options.pdfBuffer] : []);
  const regexAmounts = pdfText
    ? extractAmountsFromPdfText(pdfText)
    : {
        taxPayable: undefined as number | undefined,
        taxRefund: undefined as number | undefined,
        netIncome: undefined as number | undefined,
        withholding: undefined as number | undefined,
        receiptPaid: undefined as number | undefined,
      };

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callVertexJson(buildPrompt(filing, pdfText), buffers);
      const petit = clampPetit(raw, filing, pdfText);
      const prefer = preferFromHeadline(
        petit.headline,
        preferSide(filing),
      );
      // อย่าให้ regex เติมอีกฝั่งจนกลับมาซ้ำกับยอดที่ AI เลือกแล้ว
      const aiPayable = saneAmount(petit.amountsHint?.taxPayable);
      const aiRefund = saneAmount(petit.amountsHint?.taxRefund);
      petit.amountsHint = reconcileAmounts(
        {
          taxPayable:
            aiPayable ??
            (aiRefund == null
              ? saneAmount(regexAmounts.taxPayable) ??
                saneAmount(regexAmounts.receiptPaid)
              : undefined),
          taxRefund:
            aiRefund ??
            (aiPayable == null ? saneAmount(regexAmounts.taxRefund) : undefined),
          netIncome:
            saneAmount(petit.amountsHint?.netIncome) ??
            saneAmount(regexAmounts.netIncome),
          withholding:
            saneAmount(petit.amountsHint?.withholding) ??
            saneAmount(regexAmounts.withholding),
        },
        prefer,
      );
      petit.source = "ai";
      return { petit, mode: "ai" };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "ai-failed";
    }
  }

  return {
    petit: buildPetitSummary(filing, pdfText),
    mode: "regex",
    error: lastError,
  };
}

export function isAiConfigured() {
  return Boolean(GCP_PROJECT_ID && VERTEX_MODEL);
}
