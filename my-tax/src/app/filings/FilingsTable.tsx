"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "moduix";
import type { Filing } from "@/lib/types";
import { filingNotesMap } from "@/lib/types";

type AmountKey = "taxPayable" | "taxRefund" | "netIncome" | "withholding";

type SortKey =
  | "formTypeLabel"
  | "id"
  | "taxYear"
  | "sequence"
  | "status"
  | AmountKey
  | "updatedAt"
  | "files"
  | `note:${string}`;

type SortDir = "asc" | "desc";

type ColId =
  | "expand"
  | "formTypeLabel"
  | "id"
  | "taxYear"
  | "sequence"
  | "status"
  | "taxPayable"
  | "taxRefund"
  | "netIncome"
  | "withholding"
  | "updatedAt"
  | "files"
  | `note:${string}`;

const WIDTH_STORAGE_KEY = "my-tax-col-widths-v2";
const NOTE_COUNT_STORAGE_KEY = "my-tax-note-columns-v1";

const DEFAULT_WIDTHS: Record<string, number> = {
  expand: 36,
  formTypeLabel: 72,
  id: 118,
  taxYear: 52,
  sequence: 86,
  status: 104,
  taxPayable: 84,
  taxRefund: 84,
  netIncome: 100,
  withholding: 92,
  updatedAt: 100,
  files: 96,
};

function amountOf(f: Filing, key: AmountKey): number | undefined {
  const n = f.amounts?.[key] ?? f.petit?.amountsHint?.[key];
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function sequenceLabel(f: Filing) {
  if (f.filingSequence === "additional") {
    return `เพิ่มเติม #${f.additionalRound ?? 1}`;
  }
  return "ปกติ";
}

function shortStatus(status: string) {
  if (/สำเร็จ/.test(status) && /ใบเสร็จ/.test(status)) return "สำเร็จ · มีใบเสร็จ";
  if (/สำเร็จ/.test(status)) return "สำเร็จ";
  if (status.length > 28) return `${status.slice(0, 28)}…`;
  return status;
}

function formatBaht(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return null;
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function shortFileLabel(label: string) {
  const base = label.replace(/\.pdf$/i, "");
  if (/^TAX_FORM/i.test(base)) return "TAX_FORM";
  if (/^RECEIPT/i.test(base)) return "RECEIPT";
  if (base.length > 14) return `${base.slice(0, 12)}…`;
  return base;
}

function docHref(f: Filing, doc: Filing["documents"][number]) {
  return `/api/${doc.filePath || `docs/${f.id}/${doc.label}`}`;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) =>
    a.localeCompare(b, "th", { numeric: true }),
  );
}

function noteLabel(n: number) {
  return `โน้ต ${n}`;
}

function loadWidths(): Record<string, number> {
  if (typeof window === "undefined") return { ...DEFAULT_WIDTHS };
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WIDTHS };
    return { ...DEFAULT_WIDTHS, ...(JSON.parse(raw) as Record<string, number>) };
  } catch {
    return { ...DEFAULT_WIDTHS };
  }
}

function amountOfSort(f: Filing, key: SortKey): string | number {
  if (key.startsWith("note:")) {
    const col = key.slice(5);
    return (filingNotesMap(f)[col] || "").trim();
  }
  switch (key) {
    case "formTypeLabel":
      return f.formTypeLabel;
    case "id":
      return f.id;
    case "taxYear":
      return f.taxYear;
    case "sequence":
      return sequenceLabel(f);
    case "status":
      return f.status;
    case "taxPayable":
    case "taxRefund":
    case "netIncome":
    case "withholding":
      return amountOf(f, key) ?? -1;
    case "updatedAt":
      return f.statusUpdatedAt || f.statusUpdatedAtRaw || "";
    case "files":
      return (f.documents || []).length;
    default:
      return "";
  }
}

function AmountCell({ value }: { value?: number }) {
  const text = formatBaht(value);
  return (
    <TableCell className="amount-td">
      {text ? (
        <span className="amount-cell-value">{text}</span>
      ) : (
        <Text as="span" size="sm" tone="muted">
          —
        </Text>
      )}
    </TableCell>
  );
}

function FilesCell({ filing }: { filing: Filing }) {
  const docs = filing.documents || [];
  if (!docs.length) {
    return (
      <TableCell className="files-td">
        <Text as="span" size="sm" tone="muted">
          —
        </Text>
      </TableCell>
    );
  }
  return (
    <TableCell className="files-td">
      <div className="files-cell">
        {docs.map((doc) => {
          const openable = Boolean(doc.filePath || doc.gcsPath);
          const short = shortFileLabel(doc.label);
          if (!openable) {
            return (
              <span key={doc.id} className="file-chip is-muted" title={doc.label}>
                {short}
              </span>
            );
          }
          return (
            <a
              key={doc.id}
              className="file-chip"
              href={docHref(filing, doc)}
              target="_blank"
              rel="noreferrer"
              title={doc.label}
              onClick={(e) => e.stopPropagation()}
            >
              {short}
            </a>
          );
        })}
      </div>
    </TableCell>
  );
}

function NoteCell({
  filing,
  column,
  onUpdated,
}: {
  filing: Filing;
  column: string;
  onUpdated: (next: Filing) => void;
}) {
  const initial = filingNotesMap(filing)[column] || "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setValue(filingNotesMap(filing)[column] || "");
  }, [filing, column]);

  async function save(next: string) {
    const trimmed = next.trimEnd();
    const current = (filingNotesMap(filing)[column] || "").trimEnd();
    if (trimmed === current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/filings/${filing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: trimmed, noteColumn: column }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      onUpdated(data.filing as Filing);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1200);
    } catch {
      setValue(current);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="note-cell">
      <textarea
        className="note-input"
        value={value}
        rows={1}
        placeholder={`${noteLabel(Number(column))}…`}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
      {saving ? (
        <span className="note-status">กำลังบันทึก…</span>
      ) : savedFlash ? (
        <span className="note-status is-saved">บันทึกแล้ว</span>
      ) : null}
    </div>
  );
}

function ResizableSortHead({
  colId,
  label,
  width,
  active,
  dir,
  onSort,
  onResize,
}: {
  colId: ColId;
  label: string;
  width: number;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  onResize: (colId: ColId, width: number) => void;
}) {
  return (
    <TableHead style={{ width, minWidth: width, maxWidth: width }}>
      <div className="th-inner">
        <button type="button" className="table-sort-btn" onClick={onSort}>
          <span>{label}</span>
          <span className="table-sort-mark" aria-hidden>
            {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
        <span
          className="col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={`ปรับความกว้าง ${label}`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startW = width;
            function onMove(ev: MouseEvent) {
              const next = Math.max(56, Math.min(360, startW + (ev.clientX - startX)));
              onResize(colId, next);
            }
            function onUp() {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              document.body.classList.remove("is-col-resizing");
            }
            document.body.classList.add("is-col-resizing");
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />
      </div>
    </TableHead>
  );
}

function ValueFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = options.filter((opt) =>
    q ? opt.toLowerCase().includes(q) : true,
  );

  return (
    <div className={`value-filter ${value ? "is-active" : ""}`} ref={rootRef}>
      <span className="value-filter-label">{label}</span>
      <button
        type="button"
        className="value-filter-trigger"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
      >
        <span>{value || "ทั้งหมด"}</span>
        <span aria-hidden>▾</span>
      </button>

      {open ? (
        <div className="value-filter-menu">
          <input
            className="value-filter-search"
            autoFocus
            placeholder={`ค้นหา${label}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={`value-filter-option ${!value ? "is-selected" : ""}`}
            onClick={() => {
              onChange("");
              setOpen(false);
              setQuery("");
            }}
          >
            ทั้งหมด
          </button>
          {filtered.map((opt) => (
            <button
              type="button"
              key={opt}
              className={`value-filter-option ${value === opt ? "is-selected" : ""}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setQuery("");
              }}
            >
              {opt}
            </button>
          ))}
          {filtered.length === 0 ? (
            <Text size="sm" tone="muted">
              ไม่พบค่า
            </Text>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailBlock({
  f,
  onUpdated,
}: {
  f: Filing;
  onUpdated: (next: Filing) => void;
}) {
  const docs = f.documents || [];
  const [busy, setBusy] = useState<"up" | "ai" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy("up");
    setMsg(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/filings/${f.id}/documents`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
      onUpdated(data.filing as Filing);
      setMsg(
        `นำเข้าแล้ว · สรุปแบบ ${data.filing?.petit?.source || "auto"}`,
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const hasAi = f.petit?.source === "ai";

  async function summarize(force = false) {
    setBusy("ai");
    setMsg(null);
    try {
      const res = await fetch(`/api/filings/${f.id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: force || hasAi }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "สรุปไม่สำเร็จ");
      onUpdated(data.filing as Filing);
      if (data.mode === "cached") {
        setMsg("ใช้สรุปที่บันทึกไว้แล้ว — ไม่รัน AI ซ้ำ");
      } else if (data.mode === "ai") {
        setMsg("สรุปจากเอกสารด้วย AI แล้ว · กดบันทึกตารางด้านบนเพื่อเก็บถาวร");
      } else {
        setMsg(`ใช้สรุปสำรอง · ${data.error || ""}`.trim());
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "สรุปไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  const bullets = (f.petit?.bullets || []).slice(0, 4);

  return (
    <div className="detail-shell">
      <div className="detail-head">
        <div>
          <div className="detail-title">
            {f.formTypeLabel} · {sequenceLabel(f)} · ปี {f.taxYear}
          </div>
          <div className="detail-sub">
            {f.id} · {shortStatus(f.status)}
            {f.statusUpdatedAtRaw ? ` · ${f.statusUpdatedAtRaw}` : ""}
          </div>
        </div>
        <div className="detail-source">
          {hasAi
            ? `สรุป AI บันทึกแล้ว${f.petit?.updatedAt ? ` · ${new Date(f.petit.updatedAt).toLocaleString("th-TH")}` : ""}`
            : f.petit?.source === "regex"
              ? "สรุปจากข้อความ"
              : "ยังไม่สรุปจากไฟล์"}
        </div>
      </div>

      {f.petit?.headline ? (
        <Text size="sm" weight="medium">
          {f.petit.headline}
        </Text>
      ) : null}

      {bullets.length ? (
        <ul className="detail-bullets">
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <Text size="sm" tone="muted">
          ยังไม่มีสรุป — อัปโหลด PDF แล้วกดสรุปด้วย AI
        </Text>
      )}

      {f.petit?.trackNext ? (
        <div className="detail-next">ถัดไป: {f.petit.trackNext}</div>
      ) : null}

      <div className="detail-docs">
        <div className="detail-docs-label">เอกสาร</div>
        {docs.length === 0 ? (
          <Text size="sm" tone="muted">
            ยังไม่มีไฟล์ในคลัง
          </Text>
        ) : (
          <div className="detail-doc-list">
            {docs.map((doc) => (
              <div key={doc.id} className="detail-doc-item">
                <span>{doc.label}</span>
                <span className="detail-doc-links">
                  {doc.filePath || doc.gcsPath ? (
                    <a
                      className="app-link"
                      href={docHref(f, doc)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิด
                    </a>
                  ) : (
                    <Text as="span" size="sm" tone="muted">
                      รอไฟล์
                    </Text>
                  )}
                  {doc.sourceUrl ? (
                    <a
                      className="app-link"
                      href={doc.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      RD
                    </a>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="detail-actions">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => upload(e.target.files?.[0] || null)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
        >
          {busy === "up" ? "กำลังอัปโหลด..." : "อัปโหลด PDF"}
        </Button>
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => void summarize(hasAi)}
        >
          {busy === "ai"
            ? "กำลังสรุป..."
            : hasAi
              ? "สรุปใหม่ด้วย AI"
              : "สรุปด้วย AI จากเอกสาร"}
        </Button>
        {msg ? (
          <Text size="sm" tone="muted">
            {msg}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

export function FilingsTable({
  filings: initialFilings,
  initialYear = "",
  initialNoteColumnCount = 1,
}: {
  filings: Filing[];
  initialYear?: string;
  initialNoteColumnCount?: number;
}) {
  const [filings, setFilings] = useState(initialFilings);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [formFilter, setFormFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(initialYear);
  const [statusFilter, setStatusFilter] = useState("");
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const [noteColumnCount, setNoteColumnCount] = useState(
    Math.max(1, initialNoteColumnCount),
  );

  useEffect(() => {
    setFilings(initialFilings);
  }, [initialFilings]);

  useEffect(() => {
    setYearFilter(initialYear);
  }, [initialYear]);

  useEffect(() => {
    setWidths(loadWidths());
    try {
      const local = Number(localStorage.getItem(NOTE_COUNT_STORAGE_KEY) || "0");
      if (Number.isFinite(local) && local > 0) {
        setNoteColumnCount((c) => Math.max(c, local));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let maxFromData = 1;
    for (const f of filings) {
      for (const k of Object.keys(filingNotesMap(f))) {
        const n = Number(k);
        if (Number.isFinite(n)) maxFromData = Math.max(maxFromData, n);
      }
    }
    setNoteColumnCount((c) => Math.max(c, maxFromData, initialNoteColumnCount));
  }, [filings, initialNoteColumnCount]);

  const noteColumns = useMemo(
    () => Array.from({ length: noteColumnCount }, (_, i) => String(i + 1)),
    [noteColumnCount],
  );

  const colIds = useMemo<ColId[]>(
    () => [
      "expand",
      "formTypeLabel",
      "id",
      "taxYear",
      "sequence",
      "status",
      "taxPayable",
      "taxRefund",
      "netIncome",
      "withholding",
      "updatedAt",
      "files",
      ...noteColumns.map((c) => `note:${c}` as ColId),
    ],
    [noteColumns],
  );

  const tableMinWidth = useMemo(
    () =>
      colIds.reduce(
        (sum, id) =>
          sum +
          (widths[id] ||
            (id.startsWith("note:") ? 120 : DEFAULT_WIDTHS[id] || 88)),
        0,
      ),
    [colIds, widths],
  );

  const formOptions = useMemo(
    () => uniqueSorted(filings.map((f) => f.formTypeLabel)),
    [filings],
  );
  const yearOptions = useMemo(
    () => uniqueSorted(filings.map((f) => String(f.taxYear))),
    [filings],
  );
  const statusOptions = useMemo(
    () => uniqueSorted(filings.map((f) => shortStatus(f.status))),
    [filings],
  );

  const filterActive = Boolean(formFilter || yearFilter || statusFilter);

  const filtered = useMemo(() => {
    return filings.filter((f) => {
      if (formFilter && f.formTypeLabel !== formFilter) return false;
      if (yearFilter && String(f.taxYear) !== yearFilter) return false;
      if (statusFilter && shortStatus(f.status) !== statusFilter) return false;
      return true;
    });
  }, [filings, formFilter, yearFilter, statusFilter]);

  const rows = useMemo(() => {
    const next = [...filtered];
    next.sort((a, b) => {
      const av = amountOfSort(a, sortKey);
      const bv = amountOfSort(b, sortKey);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), "th", { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return next;
  }, [filtered, sortKey, sortDir]);

  const columnSums = useMemo(() => {
    const keys: AmountKey[] = [
      "taxPayable",
      "taxRefund",
      "netIncome",
      "withholding",
    ];
    const totals: Record<AmountKey, number> = {
      taxPayable: 0,
      taxRefund: 0,
      netIncome: 0,
      withholding: 0,
    };
    for (const f of filtered) {
      for (const key of keys) {
        const n = amountOf(f, key);
        if (n != null) totals[key] += n;
      }
    }
    return totals;
  }, [filtered]);

  const cashNote = useMemo(() => {
    const payable = columnSums.taxPayable;
    const refund = columnSums.taxRefund;
    const net = refund - payable;
    const yearLabel = yearFilter ? `ปี ${yearFilter}` : "ช่วงที่กรอง";
    if (net > 0.009) {
      return {
        tone: "refund" as const,
        text: `${yearLabel} · ขอคืน ${formatBaht(refund)} − ต้องชำระ ${formatBaht(payable)} = ได้คืนสุทธิ ${formatBaht(net)} บาท`,
      };
    }
    if (net < -0.009) {
      return {
        tone: "pay" as const,
        text: `${yearLabel} · ต้องชำระ ${formatBaht(payable)} − ขอคืน ${formatBaht(refund)} = จ่ายสุทธิ ${formatBaht(Math.abs(net))} บาท`,
      };
    }
    return {
      tone: "flat" as const,
      text: `${yearLabel} · ขอคืน ${formatBaht(refund)} − ต้องชำระ ${formatBaht(payable)} = สุทธิ 0 บาท`,
    };
  }, [columnSums, yearFilter]);

  useEffect(() => {
    if (!rows.length) {
      setOpenId(null);
      return;
    }
    if (openId && !rows.some((r) => r.id === openId)) {
      setOpenId(null);
    }
  }, [rows, openId]);

  function widthOf(id: ColId) {
    if (widths[id]) return widths[id];
    if (id.startsWith("note:")) return 120;
    return DEFAULT_WIDTHS[id] || 88;
  }

  function resizeCol(colId: ColId, width: number) {
    setWidths((prev) => {
      const next = { ...prev, [colId]: width };
      try {
        localStorage.setItem(WIDTH_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    const numeric =
      key === "updatedAt" ||
      key === "taxYear" ||
      key === "taxPayable" ||
      key === "taxRefund" ||
      key === "netIncome" ||
      key === "withholding" ||
      key === "files";
    setSortDir(numeric ? "desc" : "asc");
  }

  function clearFilters() {
    setFormFilter("");
    setYearFilter("");
    setStatusFilter("");
  }

  function patchFiling(next: Filing) {
    setFilings((prev) => prev.map((f) => (f.id === next.id ? next : f)));
  }

  async function addNoteColumn() {
    const next = Math.min(12, noteColumnCount + 1);
    setNoteColumnCount(next);
    try {
      localStorage.setItem(NOTE_COUNT_STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
    void fetch("/api/filings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteColumnCount: next }),
    });
  }

  const colSpan = colIds.length;

  return (
    <div className="filings-block">
      <div className="table-filter-bar">
        <ValueFilter
          label="แบบ"
          value={formFilter}
          options={formOptions}
          onChange={setFormFilter}
        />
        <ValueFilter
          label="ปีภาษี"
          value={yearFilter}
          options={yearOptions}
          onChange={setYearFilter}
        />
        <ValueFilter
          label="สถานะ"
          value={statusFilter}
          options={statusOptions}
          onChange={setStatusFilter}
        />
        <div className="table-filter-meta">
          <Text size="sm" tone="muted">
            {rows.length}/{filings.length} รายการ
          </Text>
          {filterActive ? (
            <button
              type="button"
              className="table-filter-clear"
              onClick={clearFilters}
            >
              ล้างกรอง
            </button>
          ) : null}
          <button
            type="button"
            className="table-filter-clear"
            onClick={() => void addNoteColumn()}
          >
            + โน้ต
          </button>
        </div>
      </div>

      <div className={`cash-note cash-note-${cashNote.tone}`} role="note">
        <span className="cash-note-label">ภาพรวม</span>
        <span className="cash-note-text">{cashNote.text}</span>
      </div>

      <div className="filings-table-scroll">
      <TableContainer>
        <Table className="filings-table" style={{ minWidth: tableMinWidth, width: tableMinWidth }}>
          <colgroup>
            {colIds.map((id) => (
              <col key={id} style={{ width: widthOf(id) }} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow className="sum-row">
              <TableHead className="expand-th" />
              <TableHead colSpan={5} className="sum-label-th">
                รวม {filtered.length} รายการ
              </TableHead>
              <TableHead className="amount-td sum-th">
                <span className="sum-value">
                  {formatBaht(columnSums.taxPayable) || "—"}
                </span>
              </TableHead>
              <TableHead className="amount-td sum-th">
                <span className="sum-value">
                  {formatBaht(columnSums.taxRefund) || "—"}
                </span>
              </TableHead>
              <TableHead className="amount-td sum-th">
                <span className="sum-value">
                  {formatBaht(columnSums.netIncome) || "—"}
                </span>
              </TableHead>
              <TableHead className="amount-td sum-th">
                <span className="sum-value">
                  {formatBaht(columnSums.withholding) || "—"}
                </span>
              </TableHead>
              <TableHead />
              <TableHead />
              {noteColumns.map((col) => (
                <TableHead key={`sum-note-${col}`} />
              ))}
            </TableRow>
            <TableRow>
              <TableHead
                className="expand-th"
                style={{
                  width: widthOf("expand"),
                  minWidth: widthOf("expand"),
                }}
              />
              <ResizableSortHead
                colId="formTypeLabel"
                label="แบบ"
                width={widthOf("formTypeLabel")}
                active={sortKey === "formTypeLabel"}
                dir={sortDir}
                onSort={() => toggleSort("formTypeLabel")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="id"
                label="เลขอ้างอิง"
                width={widthOf("id")}
                active={sortKey === "id"}
                dir={sortDir}
                onSort={() => toggleSort("id")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="taxYear"
                label="ปี"
                width={widthOf("taxYear")}
                active={sortKey === "taxYear"}
                dir={sortDir}
                onSort={() => toggleSort("taxYear")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="sequence"
                label="ลำดับ"
                width={widthOf("sequence")}
                active={sortKey === "sequence"}
                dir={sortDir}
                onSort={() => toggleSort("sequence")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="status"
                label="สถานะ"
                width={widthOf("status")}
                active={sortKey === "status"}
                dir={sortDir}
                onSort={() => toggleSort("status")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="taxPayable"
                label="ต้องชำระ"
                width={widthOf("taxPayable")}
                active={sortKey === "taxPayable"}
                dir={sortDir}
                onSort={() => toggleSort("taxPayable")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="taxRefund"
                label="ขอคืน"
                width={widthOf("taxRefund")}
                active={sortKey === "taxRefund"}
                dir={sortDir}
                onSort={() => toggleSort("taxRefund")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="netIncome"
                label="เงินได้สุทธิ"
                width={widthOf("netIncome")}
                active={sortKey === "netIncome"}
                dir={sortDir}
                onSort={() => toggleSort("netIncome")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="withholding"
                label="หัก ณ ที่จ่าย"
                width={widthOf("withholding")}
                active={sortKey === "withholding"}
                dir={sortDir}
                onSort={() => toggleSort("withholding")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="updatedAt"
                label="อัปเดต"
                width={widthOf("updatedAt")}
                active={sortKey === "updatedAt"}
                dir={sortDir}
                onSort={() => toggleSort("updatedAt")}
                onResize={resizeCol}
              />
              <ResizableSortHead
                colId="files"
                label="ไฟล์"
                width={widthOf("files")}
                active={sortKey === "files"}
                dir={sortDir}
                onSort={() => toggleSort("files")}
                onResize={resizeCol}
              />
              {noteColumns.map((col) => (
                <ResizableSortHead
                  key={col}
                  colId={`note:${col}`}
                  label={noteLabel(Number(col))}
                  width={widthOf(`note:${col}`)}
                  active={sortKey === `note:${col}`}
                  dir={sortDir}
                  onSort={() => toggleSort(`note:${col}`)}
                  onResize={resizeCol}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan}>
                  <Text size="sm" tone="muted">
                    ไม่พบรายการตามตัวกรอง
                  </Text>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((f) => {
                const open = openId === f.id;
                return (
                  <Fragment key={f.id}>
                    <TableRow
                      className={`filing-row ${open ? "is-open" : ""}`}
                    >
                      <TableCell className="expand-td">
                        <button
                          type="button"
                          className="expand-btn"
                          aria-label={open ? "ย่อรายละเอียด" : "เปิดรายละเอียด"}
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : f.id)}
                        >
                          {open ? "▾" : "▸"}
                        </button>
                      </TableCell>
                      <TableCell>{f.formTypeLabel}</TableCell>
                      <TableCell>
                        <span className="filing-ref">{f.id}</span>
                      </TableCell>
                      <TableCell>{f.taxYear}</TableCell>
                      <TableCell>{sequenceLabel(f)}</TableCell>
                      <TableCell>
                        <Text size="sm">{shortStatus(f.status)}</Text>
                      </TableCell>
                      <AmountCell value={amountOf(f, "taxPayable")} />
                      <AmountCell value={amountOf(f, "taxRefund")} />
                      <AmountCell value={amountOf(f, "netIncome")} />
                      <AmountCell value={amountOf(f, "withholding")} />
                      <TableCell>
                        <Text size="sm" tone="muted">
                          {f.statusUpdatedAtRaw || "-"}
                        </Text>
                      </TableCell>
                      <FilesCell filing={f} />
                      {noteColumns.map((col) => (
                        <TableCell key={col} className="note-td">
                          <NoteCell
                            filing={f}
                            column={col}
                            onUpdated={patchFiling}
                          />
                        </TableCell>
                      ))}
                    </TableRow>

                    {open ? (
                      <TableRow className="row-detail">
                        <TableCell colSpan={colSpan}>
                          <div className="row-detail-box">
                            <DetailBlock f={f} onUpdated={patchFiling} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      </div>
    </div>
  );
}
