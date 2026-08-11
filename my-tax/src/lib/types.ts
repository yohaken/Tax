export type DocumentKind = "tax_form" | "receipt" | "other";

export type FilingDocument = {
  id: string;
  kind: DocumentKind;
  label: string;
  filePath?: string;
  gcsPath?: string;
  sourceUrl?: string;
  extractedTextPath?: string;
  extractedTextGcsPath?: string;
  uploadedAt?: string;
};

/** true ถ้าเปิดอ่านในเว็บได้จากคลังถาวร/โลคัล */
export function hasOpenableDoc(doc: FilingDocument) {
  return Boolean(doc.filePath || doc.gcsPath);
}

export type PetitSummary = {
  headline: string;
  bullets: string[];
  trackNext: string;
  amountsHint?: {
    taxPayable?: number;
    taxRefund?: number;
    netIncome?: number;
    withholding?: number;
  };
  updatedAt: string;
  source?: "ai" | "regex" | "manual";
};

export type FilingDetail = {
  importedFrom: string;
  rawMeta?: Record<string, string | number | boolean | null>;
  pdfTextPreview?: string;
  /** @deprecated ใช้ notesMap */
  notes?: string;
};

export type Filing = {
  id: string;
  formType: "PND90" | "PND94" | string;
  formTypeLabel: string;
  taxYear: number;
  filingSequence: "normal" | "additional";
  additionalRound?: number;
  status: string;
  statusUpdatedAt: string;
  statusUpdatedAtRaw?: string;
  taxpayerName: string;
  tin: string;
  documents: FilingDocument[];
  detail?: FilingDetail;
  petit?: PetitSummary;
  /** @deprecated ใช้ notesMap["1"] */
  notes?: string;
  /** โน้ตแยกตามคอลัม เช่น { "1": "...", "2": "..." } */
  notesMap?: Record<string, string>;
  amounts?: {
    taxPayable?: number;
    taxRefund?: number;
    netIncome?: number;
    withholding?: number;
  };
  importedAt: string;
};

/** รวม notes เก่าเข้า notesMap */
export function filingNotesMap(f: Filing): Record<string, string> {
  if (f.notesMap && typeof f.notesMap === "object") {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.notesMap)) {
      if (typeof v === "string") clean[k] = v;
    }
    if (Object.keys(clean).length) return clean;
  }
  const legacy = f.notes || f.detail?.notes;
  if (typeof legacy === "string" && legacy.trim()) return { "1": legacy };
  return {};
}

export type Taxpayer = {
  name: string;
  tin: string;
  email: string;
};

export type FilingsStore = {
  taxpayer: Taxpayer;
  source: {
    primary: string;
    note?: string;
  };
  filings: Filing[];
  /** จำนวนคอลัมโน้ตที่เปิดใช้ (อย่างน้อย 1) */
  noteColumnCount?: number;
  /** เวลาบันทึกตารางล่าสุด (สรุป AI / โน้ต / ยอด) ลง Firestore */
  lastSavedAt?: string;
};

export const ALLOWED_EMAIL = "yohaken@gmail.com";

/** สถานะส่งงานระหว่าง Cloud Agent กับ Local Mac Agent */
export type AgentActor = "cloud" | "local";

export type AgentState =
  | "idle"
  | "waiting_local"
  | "working"
  | "done"
  | "blocked";

export type AgentHistoryItem = {
  at: string;
  by: AgentActor;
  state: AgentState;
  summary: string;
};

export type AgentStatus = {
  state: AgentState;
  by: AgentActor;
  summary: string;
  command: string;
  detail?: string;
  refsDone: string[];
  refsMissing: string[];
  history: AgentHistoryItem[];
  updatedAt: string;
};

export type AgentStatusUpdate = {
  by?: AgentActor;
  state?: AgentState;
  summary?: string;
  command?: string;
  detail?: string | null;
  refsDone?: string[];
  refsMissing?: string[];
};
