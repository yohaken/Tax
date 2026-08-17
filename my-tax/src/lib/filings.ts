import path from "path";
import { buildPetitSummary } from "./petit";
import { readStore, writeStore } from "./filings-store";
import { readDocBytes, readDocText, saveDocBytes } from "./docs-storage";
import type {
  Filing,
  FilingDocument,
  FilingsStore,
  Taxpayer,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

export { readStore, writeStore };

export async function listFilings(): Promise<Filing[]> {
  const store = await readStore();
  return [...store.filings].sort((a, b) =>
    (b.statusUpdatedAtRaw || b.importedAt).localeCompare(
      a.statusUpdatedAtRaw || a.importedAt,
    ),
  );
}

export async function getTaxpayer(): Promise<Taxpayer> {
  const store = await readStore();
  return store.taxpayer;
}

export async function getFiling(id: string): Promise<Filing | null> {
  const store = await readStore();
  return store.filings.find((f) => f.id === id) || null;
}

export async function upsertFilings(incoming: Filing[]): Promise<FilingsStore> {
  const store = await readStore();
  const map = new Map(store.filings.map((f) => [f.id, f]));

  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, {
        ...item,
        documents: item.documents || [],
        petit: item.petit || buildPetitSummary(item),
        importedAt: item.importedAt || new Date().toISOString(),
      });
      continue;
    }

    map.set(item.id, {
      ...existing,
      ...item,
      documents: mergeDocuments(existing.documents, item.documents || []),
      detail: {
        ...(existing.detail || { importedFrom: "merge" }),
        ...(item.detail || {}),
      },
      petit: item.petit || existing.petit || buildPetitSummary({ ...existing, ...item }),
    });
  }

  store.filings = Array.from(map.values());
  await writeStore(store);
  return store;
}

function mergeDocuments(
  current: FilingDocument[],
  incoming: FilingDocument[],
): FilingDocument[] {
  const map = new Map(current.map((d) => [d.id, d]));
  for (const doc of incoming) {
    map.set(doc.id, { ...map.get(doc.id), ...doc });
  }
  return Array.from(map.values());
}

export async function updateFilingNotes(
  id: string,
  notes: string,
  noteColumn: string | number = "1",
): Promise<Filing | null> {
  const store = await readStore();
  const idx = store.filings.findIndex((f) => f.id === id);
  if (idx < 0) return null;
  const col = String(noteColumn || "1");
  const prev = store.filings[idx];
  const notesMap = {
    ...(prev.notesMap || {}),
    [col]: notes,
  };
  // คอลัม 1 ซิงก์กับ notes เก่าไว้ด้วย
  const next: Filing = {
    ...prev,
    notesMap,
    notes: col === "1" ? notes : prev.notes,
    detail: {
      ...(prev.detail || { importedFrom: "manual" }),
      notes: col === "1" ? notes : prev.detail?.notes,
    },
  };
  const maxCol = Math.max(
    store.noteColumnCount || 1,
    ...Object.keys(notesMap).map((k) => Number(k) || 1),
  );
  store.noteColumnCount = maxCol;
  store.filings[idx] = next;
  await writeStore(store);
  return next;
}

export async function setNoteColumnCount(count: number): Promise<number> {
  const store = await readStore();
  const next = Math.max(1, Math.min(12, Math.floor(count)));
  store.noteColumnCount = next;
  await writeStore(store);
  return next;
}

export async function getNoteColumnCount(): Promise<number> {
  const store = await readStore();
  const fromMeta = store.noteColumnCount || 1;
  let fromData = 1;
  for (const f of store.filings) {
    for (const k of Object.keys(f.notesMap || {})) {
      const n = Number(k);
      if (Number.isFinite(n)) fromData = Math.max(fromData, n);
    }
    if (f.notes || f.detail?.notes) fromData = Math.max(fromData, 1);
  }
  return Math.max(fromMeta, fromData, 1);
}

export async function attachDocument(
  filingId: string,
  file: { name: string; buffer: Buffer; kind?: FilingDocument["kind"] },
  extractedText?: string,
  options?: { useAi?: boolean },
): Promise<Filing | null> {
  const store = await readStore();
  const idx = store.filings.findIndex((f) => f.id === filingId);
  if (idx < 0) return null;

  const filing = store.filings[idx];
  const safeName = file.name.replace(/[^\w.\-()\u0E00-\u0E7F]+/g, "_");
  const relPath = path.join("docs", filingId, safeName).replace(/\\/g, "/");

  const saved = await saveDocBytes(relPath, file.buffer, "application/pdf");
  if (!saved.gcsPath && process.env.NODE_ENV === "production") {
    throw new Error(
      "อัปโหลดสำเร็จบนดิสก์ชั่วคราว แต่ยังไม่ขึ้น GCS — ยกเลิกเพื่อไม่ให้ไฟล์หายหลัง redeploy",
    );
  }

  let extractedTextPath: string | undefined;
  let extractedTextGcsPath: string | undefined;
  if (extractedText) {
    const textRel = `${relPath}.txt`;
    const textSaved = await saveDocBytes(
      textRel,
      Buffer.from(extractedText, "utf8"),
      "text/plain; charset=utf-8",
    );
    extractedTextPath = textSaved.filePath;
    extractedTextGcsPath = textSaved.gcsPath || undefined;
  }

  const kind =
    file.kind ||
    (/ใบเสร็จ|receipt/i.test(file.name) ? "receipt" : "tax_form");

  // แทนที่เอกสารชื่อเดิม/ชนิดเดิม กันซ้ำตอนอัปโหลดรอบใหม่
  const stableId = `doc-${filingId}-${kind}-${safeName}`;
  const doc: FilingDocument = {
    id: stableId,
    kind,
    label: file.name,
    filePath: saved.filePath,
    gcsPath: saved.gcsPath,
    extractedTextPath,
    extractedTextGcsPath,
    uploadedAt: new Date().toISOString(),
    sourceUrl: filing.documents.find((d) => d.label === file.name)?.sourceUrl,
  };

  const withoutSame = filing.documents.filter(
    (d) => d.id !== stableId && d.label !== file.name,
  );
  const documents = mergeDocuments(withoutSame, [doc]);
  let next: Filing = {
    ...filing,
    documents,
    detail: {
      ...(filing.detail || { importedFrom: "pdf-upload" }),
      pdfTextPreview: extractedText
        ? extractedText.slice(0, 2000)
        : filing.detail?.pdfTextPreview,
    },
  };

  if (options?.useAi !== false) {
    const { summarizeWithAi } = await import("./ai-petit");
    const summarized = await summarizeWithAi(next, {
      pdfText: extractedText,
      pdfBuffers: [file.buffer],
    });
    next = {
      ...next,
      amounts: {
        ...next.amounts,
        taxPayable: summarized.petit.amountsHint?.taxPayable,
        taxRefund: summarized.petit.amountsHint?.taxRefund,
        netIncome: summarized.petit.amountsHint?.netIncome,
        withholding: summarized.petit.amountsHint?.withholding,
      },
      petit: { ...summarized.petit, source: summarized.mode === "ai" ? "ai" : "regex" },
    };
  } else {
    const amounts = extractedText
      ? buildPetitSummary(next, extractedText).amountsHint
      : filing.amounts;
    next.amounts = { ...filing.amounts, ...amounts };
    next.petit = {
      ...buildPetitSummary(next, extractedText),
      source: "regex",
    };
  }

  store.filings[idx] = next;
  await writeStore(store);
  return next;
}

async function collectPdfContext(filing: Filing): Promise<{
  pdfText?: string;
  pdfBuffers: Buffer[];
}> {
  const docs = [...(filing.documents || [])];
  // ใบเสร็จก่อน แล้วตามด้วยแบบ — อ่านยอดชำระจริงได้ชัดกว่า
  docs.sort((a, b) => {
    const rank = (d: typeof a) =>
      d.kind === "receipt" || /ใบเสร็จ|receipt/i.test(d.label) ? 0 : 1;
    return rank(a) - rank(b);
  });

  let pdfText = "";
  const pdfBuffers: Buffer[] = [];

  for (const doc of docs) {
    if (doc.extractedTextPath || doc.extractedTextGcsPath) {
      const text = await readDocText(
        doc.extractedTextPath,
        doc.extractedTextGcsPath,
      );
      if (text && !text.startsWith("<<extract-failed")) {
        pdfText = `${pdfText}\n\n--- ${doc.label} ---\n${text}`.trim();
      }
    }

    if (doc.filePath || doc.gcsPath) {
      const buf = await readDocBytes(doc.filePath || "", doc.gcsPath);
      if (buf) {
        pdfBuffers.push(buf);
        if (pdfText.length < 80) {
          try {
            const { extractPdfText } = await import("./pdf");
            const extracted = await extractPdfText(buf);
            if (extracted) {
              pdfText = `${pdfText}\n\n--- ${doc.label} ---\n${extracted}`.trim();
            }
          } catch {
            // Gemini reads PDF bytes directly
          }
        }
      }
    }
  }

  return { pdfText: pdfText || undefined, pdfBuffers };
}

/** มีสรุป AI บันทึกแล้ว — ไม่ต้องรันซ้ำถ้าไม่บังคับ */
export function hasSavedAiSummary(filing: Filing) {
  return (
    filing.petit?.source === "ai" &&
    Boolean(filing.petit.headline || filing.petit.updatedAt)
  );
}

export async function summarizeFiling(
  id: string,
  opts: { force?: boolean } = {},
): Promise<{ filing: Filing; mode: string; error?: string } | null> {
  const store = await readStore();
  const idx = store.filings.findIndex((f) => f.id === id);
  if (idx < 0) return null;

  const filing = store.filings[idx];
  if (!opts.force && hasSavedAiSummary(filing)) {
    return { filing, mode: "cached", error: undefined };
  }

  const localDocs = (filing.documents || []).filter((d) => d.filePath || d.gcsPath);
  if (localDocs.length === 0) {
    return {
      filing,
      mode: "none",
      error: "ยังไม่มีไฟล์ PDF ในคลัง — อัปโหลดก่อนแล้วค่อยสรุป",
    };
  }

  const ctx = await collectPdfContext(filing);
  const { summarizeWithAi } = await import("./ai-petit");
  const summarized = await summarizeWithAi(filing, {
    pdfText: ctx.pdfText,
    pdfBuffers: ctx.pdfBuffers,
  });
  const next: Filing = {
    ...filing,
    amounts: {
      ...filing.amounts,
      taxPayable: summarized.petit.amountsHint?.taxPayable,
      taxRefund: summarized.petit.amountsHint?.taxRefund,
      netIncome: summarized.petit.amountsHint?.netIncome,
      withholding: summarized.petit.amountsHint?.withholding,
    },
    petit: {
      ...summarized.petit,
      source: summarized.mode === "ai" ? "ai" : "regex",
    },
    detail: {
      ...(filing.detail || { importedFrom: "ai-summarize" }),
      pdfTextPreview: ctx.pdfText
        ? ctx.pdfText.slice(0, 2000)
        : filing.detail?.pdfTextPreview,
    },
  };

  store.filings[idx] = next;
  await writeStore(store);
  return { filing: next, mode: summarized.mode, error: summarized.error };
}

export async function summarizeAllFilings(opts: { force?: boolean } = {}) {
  const store = await readStore();
  const results: Array<{
    id: string;
    ok: boolean;
    mode: string;
    error?: string;
  }> = [];

  for (const filing of store.filings) {
    const result = await summarizeFiling(filing.id, opts);
    if (!result) {
      results.push({ id: filing.id, ok: false, mode: "none", error: "not found" });
      continue;
    }
    results.push({
      id: filing.id,
      ok:
        result.mode === "cached" ||
        result.mode === "ai" ||
        result.mode === "regex" ||
        !result.error,
      mode: result.mode,
      error: result.error,
    });
  }

  // หลังสรุป (หรือข้ามของเดิม) บันทึกตารางถาวรทันที
  await saveFilingsTable();

  return {
    results,
    filings: await listFilings(),
  };
}

/** บันทึกตารางปัจจุบันลง Firestore ถาวร — เปิดรอบหน้าโหลดสรุปเดิมได้เลย */
export async function saveFilingsTable() {
  const store = await readStore();
  const savedAt = new Date().toISOString();
  const next: FilingsStore = {
    ...store,
    lastSavedAt: savedAt,
  };
  await writeStore(next);
  const filings = next.filings || [];
  const aiCount = filings.filter((f) => hasSavedAiSummary(f)).length;
  const withAmounts = filings.filter(
    (f) =>
      typeof f.amounts?.taxPayable === "number" ||
      typeof f.amounts?.taxRefund === "number" ||
      typeof f.amounts?.netIncome === "number",
  ).length;
  return {
    savedAt,
    count: filings.length,
    aiCount,
    withAmounts,
    noteColumnCount: next.noteColumnCount ?? 1,
  };
}

export async function getYearSummary(year: number) {
  const filings = (await listFilings()).filter((f) => f.taxYear === year);
  return {
    taxYear: year,
    count: filings.length,
    byForm: {
      PND90: filings.filter((f) => f.formType === "PND90"),
      PND94: filings.filter((f) => f.formType === "PND94"),
      other: filings.filter(
        (f) => f.formType !== "PND90" && f.formType !== "PND94",
      ),
    },
    petitCards: filings.map((f) => f.petit).filter(Boolean),
    filings,
  };
}

export function docsAbsolutePath(relPath: string) {
  const normalized = relPath.replace(/^\/+/, "");
  const abs = path.join(DATA_DIR, normalized);
  if (!abs.startsWith(DATA_DIR)) {
    throw new Error("Invalid path");
  }
  return abs;
}

export async function loadDocBuffer(relPath: string) {
  // try match gcsPath from store
  const store = await readStore();
  const normalized = relPath.replace(/^\/+/, "");
  for (const filing of store.filings) {
    for (const doc of filing.documents || []) {
      if (doc.filePath === normalized || doc.extractedTextPath === normalized) {
        return readDocBytes(
          normalized,
          normalized.endsWith(".txt")
            ? doc.extractedTextGcsPath
            : doc.gcsPath,
        );
      }
      if (doc.gcsPath?.endsWith(normalized) || doc.extractedTextGcsPath?.endsWith(normalized)) {
        return readDocBytes(
          normalized,
          normalized.endsWith(".txt")
            ? doc.extractedTextGcsPath
            : doc.gcsPath,
        );
      }
    }
  }
  return readDocBytes(normalized);
}
