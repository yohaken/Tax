/** Parse bank statement rows from Excel / CSV / PDF text. */

const DATE_RE = /(\d{1,2}[\/\-.\s]\d{1,2}[\/\-.\s]\d{2,4}|\d{4}[\/\-.\s]\d{1,2}[\/\-.\s]\d{1,2})/;
const MONEY_RE = /-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?/g;

const SKIP_HEADERS = /^(date|วันที่|รายการ|description|รายละเอียด|debit|credit|ถอน|ฝาก|เงินออก|เงินเข้า|balance|คงเหลือ|amount|จำนวน)/i;

export function uid(prefix = "tx") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMoney(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = normalizeText(value).replace(/฿|บาท/gi, "").replace(/,/g, "");
  if (!raw || raw === "-" || raw === "—") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseDateFlexible(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toISODate(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + value * 86400000;
    return toISODate(new Date(ms));
  }

  const s = normalizeText(value);
  if (!s) return null;

  const m = s.match(DATE_RE);
  if (!m) return null;
  const parts = m[1].split(/[\/\-.\s]/).filter(Boolean);
  if (parts.length !== 3) return null;

  let y;
  let mo;
  let d;
  if (parts[0].length === 4) {
    y = Number(parts[0]);
    mo = Number(parts[1]);
    d = Number(parts[2]);
  } else {
    d = Number(parts[0]);
    mo = Number(parts[1]);
    y = Number(parts[2]);
    if (y < 100) y += 2000;
    // Buddhist year
    if (y > 2400) y -= 543;
  }

  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return toISODate(dt);
}

function toISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function scoreHeaderCell(text, keywords) {
  const t = normalizeText(text).toLowerCase();
  return keywords.some((k) => t.includes(k)) ? 1 : 0;
}

function detectColumns(headers) {
  const mapped = {
    date: -1,
    description: -1,
    credit: -1,
    debit: -1,
    amount: -1,
    balance: -1,
  };

  headers.forEach((h, i) => {
    const t = normalizeText(h).toLowerCase();
    if (mapped.date < 0 && /วันที่|date|txn\s*date|transaction\s*date/.test(t)) mapped.date = i;
    else if (mapped.description < 0 && /รายละเอียด|รายการ|description|particular|memo|narrative|หมายเหตุ|channel/.test(t)) mapped.description = i;
    else if (mapped.credit < 0 && /เงินเข้า|ฝาก|credit|deposit|inflow|รับ/.test(t)) mapped.credit = i;
    else if (mapped.debit < 0 && /เงินออก|ถอน|debit|withdrawal|outflow|จ่าย|โอนออก/.test(t)) mapped.debit = i;
    else if (mapped.amount < 0 && /จำนวน|amount|ยอด|มูลค่า/.test(t)) mapped.amount = i;
    else if (mapped.balance < 0 && /คงเหลือ|balance/.test(t)) mapped.balance = i;
  });

  // Fallback: common Thai statement layout date | desc | ... | debit | credit | balance
  if (mapped.date < 0) mapped.date = 0;
  if (mapped.description < 0) mapped.description = Math.min(1, headers.length - 1);
  return mapped;
}

function rowLooksLikeHeader(cells) {
  const joined = cells.map(normalizeText).join(" ");
  return SKIP_HEADERS.test(joined) || cells.filter((c) => scoreHeaderCell(c, ["วันที่", "date", "รายละเอียด", "debit", "credit"])).length >= 2;
}

function makeTx({ date, description, credit, debit, balance, source, raw }) {
  const c = credit != null && credit !== 0 ? Math.abs(credit) : null;
  const d = debit != null && debit !== 0 ? Math.abs(debit) : null;
  let amount = 0;
  let direction = "unknown";
  if (c && !d) {
    amount = c;
    direction = "in";
  } else if (d && !c) {
    amount = d;
    direction = "out";
  } else if (c && d) {
    // Prefer non-zero dominance
    if (c >= d) {
      amount = c;
      direction = "in";
    } else {
      amount = d;
      direction = "out";
    }
  }

  if (!date && !description) return null;
  if (!amount && !description) return null;

  return {
    id: uid(),
    date: date || "",
    description: description || "(ไม่มีรายละเอียด)",
    credit: c,
    debit: d,
    amount,
    direction,
    balance: balance ?? null,
    category: "",
    note: "",
    source,
    raw: raw || description || "",
  };
}

export function parseSheetMatrix(matrix, sourceName) {
  if (!matrix?.length) return [];

  let headerIdx = -1;
  let bestScore = -1;
  const scan = Math.min(matrix.length, 30);
  for (let i = 0; i < scan; i += 1) {
    const row = (matrix[i] || []).map((c) => normalizeText(c));
    if (!row.some(Boolean)) continue;
    const score =
      scoreHeaderCell(row.join(" "), ["วันที่", "date"]) +
      scoreHeaderCell(row.join(" "), ["รายละเอียด", "description", "รายการ"]) +
      scoreHeaderCell(row.join(" "), ["debit", "เงินออก", "ถอน", "credit", "เงินเข้า", "ฝาก"]);
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }

  if (headerIdx < 0) headerIdx = 0;
  const headers = (matrix[headerIdx] || []).map((c) => normalizeText(c));
  const cols = detectColumns(headers);
  const txs = [];

  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const cells = (matrix[r] || []).map((c) => (c == null ? "" : c));
    const texts = cells.map(normalizeText);
    if (!texts.some(Boolean)) continue;
    if (rowLooksLikeHeader(texts)) continue;

    const date = parseDateFlexible(cells[cols.date]);
    const descriptionParts = [];
    if (cols.description >= 0) descriptionParts.push(normalizeText(cells[cols.description]));
    // Include nearby text columns that are not numeric money columns
    texts.forEach((t, i) => {
      if (!t) return;
      if ([cols.date, cols.credit, cols.debit, cols.amount, cols.balance].includes(i)) return;
      if (i === cols.description) return;
      if (parseMoney(t) != null && /^[\d,.\-\s]+$/.test(t)) return;
      if (!descriptionParts.includes(t)) descriptionParts.push(t);
    });
    const description = normalizeText(descriptionParts.filter(Boolean).join(" · "));

    let credit = cols.credit >= 0 ? parseMoney(cells[cols.credit]) : null;
    let debit = cols.debit >= 0 ? parseMoney(cells[cols.debit]) : null;
    const amount = cols.amount >= 0 ? parseMoney(cells[cols.amount]) : null;
    const balance = cols.balance >= 0 ? parseMoney(cells[cols.balance]) : null;

    if (amount != null && credit == null && debit == null) {
      if (amount < 0) debit = Math.abs(amount);
      else credit = amount;
    }

    // Heuristic: if only one money column besides balance, treat sign
    if (credit == null && debit == null) {
      const moneyCells = texts
        .map((t, i) => ({ i, v: parseMoney(t) }))
        .filter((x) => x.v != null && x.i !== cols.date && x.i !== cols.balance);
      if (moneyCells.length === 1) {
        const v = moneyCells[0].v;
        if (v < 0) debit = Math.abs(v);
        else credit = v;
      }
    }

    const tx = makeTx({
      date,
      description,
      credit,
      debit,
      balance,
      source: sourceName,
      raw: texts.join(" | "),
    });
    if (tx && (tx.date || tx.amount || tx.description !== "(ไม่มีรายละเอียด)")) {
      // Skip totals
      if (/รวม|total|สรุป/i.test(tx.description) && !tx.date) continue;
      txs.push(tx);
    }
  }

  return txs;
}

export function parseExcelFile(buffer, fileName) {
  if (!globalThis.XLSX) throw new Error("ไม่พบไลบรารีอ่าน Excel");
  const workbook = globalThis.XLSX.read(buffer, { type: "array", cellDates: true });
  const all = [];
  workbook.SheetNames.forEach((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = globalThis.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    all.push(...parseSheetMatrix(matrix, `${fileName} · ${name}`));
  });
  return all;
}

export function parseCsvText(text, fileName) {
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length)
    .map((line) => {
      // simple CSV split with quotes
      const out = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else q = !q;
        } else if (ch === "," && !q) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out;
    });
  return parseSheetMatrix(rows, fileName);
}

function extractMoneys(line) {
  // Strip bank refs that contain long digit runs (not money)
  const cleaned = normalizeText(line)
    .replace(/\bKB\d+\b/gi, " ")
    .replace(/\bX\d+\b/gi, " ")
    .replace(/\bRef\s*X?\d+\b/gi, " ")
    .replace(/\bN\d+[A-Z0-9/]*/gi, " ");
  // Prefer real statement amounts: always have decimals (or thousand separators)
  const strict = cleaned.match(/-?\d{1,3}(?:,\d{3})+\.\d{2}|-?\d+\.\d{2}/g) || [];
  if (strict.length) {
    return strict.map((m) => parseMoney(m)).filter((n) => n != null);
  }
  const matches = cleaned.match(MONEY_RE) || [];
  return matches
    .map((m) => parseMoney(m))
    .filter((n) => n != null && Math.abs(n) >= 0.01);
}

/** KBank single-column amount: direction comes from the verb, not the channel. */
function looksLikeDebit(text) {
  // Payments / transfers out — must beat channel tokens like "K SHOP" / "EDC"
  if (/เพื่อชำระ|หักบัญชี|ชำระด้วยบัตร|ถอนเงิน|ค่าธรรมเนียม/i.test(text)) return true;
  if (/ชำระเงิน/i.test(text) && !/รับเงิน|รับโอน/i.test(text)) return true;
  // Plain "โอนเงิน" is debit; "รับโอนเงิน…" is credit
  if (/โอนเงิน/i.test(text) && !/รับโอน/i.test(text)) return true;
  return false;
}

function looksLikeCredit(text) {
  if (looksLikeDebit(text)) return false;
  return /รับโอน|รับเงิน|รับดอกเบี้ย|เงินเข้า|ฝากเงิน|(?:^|[\s])ฝาก(?:[\s]|$)|credit|salary|เงินเดือน|ขายด้วย/i.test(
    text
  );
}

function extractTxTime(text) {
  const m = normalizeText(text).match(/\b(\d{2}:\d{2})\b/);
  return m ? m[1] : "";
}

/**
 * Flip/fill direction using consecutive balances when the verb was ambiguous.
 * Assumes statement order (already chronological in PDF line order).
 */
export function reconcileDirectionsFromBalances(transactions) {
  const out = transactions.map((t) => ({ ...t }));
  let fixed = 0;
  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1];
    const cur = out[i];
    if (cur.amount == null || cur.amount <= 0) continue;
    if (prev.balance == null || cur.balance == null) continue;
    // Skip when prior row is non-movement (ยอดยกมา) still has balance — OK to use
    const delta = Number((cur.balance - prev.balance).toFixed(2));
    let inferred = null;
    if (Math.abs(delta - cur.amount) < 0.021) inferred = "in";
    else if (Math.abs(delta + cur.amount) < 0.021) inferred = "out";
    if (!inferred || inferred === cur.direction) continue;
    if (inferred === "in") {
      out[i] = {
        ...cur,
        credit: cur.amount,
        debit: null,
        direction: "in",
      };
    } else {
      out[i] = {
        ...cur,
        credit: null,
        debit: cur.amount,
        direction: "out",
      };
    }
    fixed += 1;
  }
  return { transactions: out, fixed };
}

export function parsePdfLines(lines, fileName) {
  const txs = [];
  for (const line of lines) {
    const text = normalizeText(line);
    if (!text || text.length < 8) continue;
    if (rowLooksLikeHeader([text])) continue;
    // Period headers / page chrome — not ledger rows
    if (/รอบระหว่างวันที่|ช่วงวันที่|statement\s*period/i.test(text)) continue;
    if (!DATE_RE.test(text)) continue;

    const date = parseDateFlexible(text);
    if (!date) continue;

    const moneys = extractMoneys(text);

    // Drop the date token from description
    let description = text.replace(DATE_RE, " ").replace(MONEY_RE, " ");
    description = normalizeText(description).replace(/\s*[|·]\s*/g, " ");
    if (!description) description = text;

    // Brought-forward balance lines: keep for date span, never as cash-out
    if (/ยอดยกมา/i.test(text)) {
      const balance = moneys.length ? moneys[moneys.length - 1] : null;
      const tx = makeTx({
        date,
        description: "ยอดยกมา",
        credit: null,
        debit: null,
        balance,
        source: fileName,
        raw: text,
      });
      if (tx) txs.push(tx);
      continue;
    }

    if (moneys.length === 0) continue;

    let credit = null;
    let debit = null;
    if (moneys.length === 1) {
      if (looksLikeCredit(text)) credit = moneys[0];
      else debit = moneys[0];
    } else {
      // last is often balance; previous is the amount
      const amountCandidate = moneys[moneys.length - 2];
      if (looksLikeCredit(text)) credit = amountCandidate;
      else debit = amountCandidate;
    }

    const tx = makeTx({
      date,
      description,
      credit,
      debit,
      balance: moneys.length >= 2 ? moneys[moneys.length - 1] : null,
      source: fileName,
      raw: text,
    });
    if (tx) {
      tx.time = extractTxTime(text);
      txs.push(tx);
    }
  }
  return txs;
}

export async function extractPdfTextLines(buffer) {
  const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const lines = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    // Group by approximate Y position
    const rows = new Map();
    for (const item of content.items) {
      const str = item.str;
      if (!str) continue;
      const y = Math.round((item.transform?.[5] ?? 0) * 2) / 2;
      const key = String(y);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: item.transform?.[4] ?? 0, str });
    }
    const sortedY = [...rows.keys()].map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      const parts = rows
        .get(String(y))
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str);
      lines.push(parts.join(" "));
    }
  }
  return lines;
}

export async function parseFile(file) {
  const name = file.name || "statement";
  const lower = name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    const lines = await extractPdfTextLines(new Uint8Array(buffer));
    const rows = parsePdfLines(lines, name);
    return reconcileDirectionsFromBalances(dedupeTransactions(rows)).transactions;
  }

  if (lower.endsWith(".csv") || file.type === "text/csv") {
    const text = new TextDecoder("utf-8").decode(buffer);
    return parseCsvText(text, name);
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || /sheet|excel/i.test(file.type)) {
    return parseExcelFile(new Uint8Array(buffer), name);
  }

  // Try excel then csv
  try {
    return parseExcelFile(new Uint8Array(buffer), name);
  } catch {
    const text = new TextDecoder("utf-8").decode(buffer);
    return parseCsvText(text, name);
  }
}

export function dedupeTransactions(list) {
  const seen = new Set();
  const out = [];
  for (const tx of list) {
    // Include balance + time so same-day same-amount QR / transfers stay distinct
    const key = [
      tx.date,
      tx.time || extractTxTime(tx.raw || ""),
      tx.description,
      tx.credit ?? "",
      tx.debit ?? "",
      tx.amount,
      tx.balance ?? "",
      tx.raw || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tx);
  }
  return out;
}
