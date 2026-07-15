const STORAGE_KEY = "taxtag.v1";
const WORKSPACE_KEY = "taxtag.workspace.v1";

const DEFAULT_CATEGORIES = [
  "รายได้ / ลูกค้า",
  "เงินเดือน",
  "ค่าเช่า",
  "ค่าอาหาร",
  "ค่าเดินทาง",
  "สาธารณูปโภค",
  "ภาษี / ประกันสังคม",
  "โอนระหว่างบัญชี",
  "ช้อปปิ้ง",
  "สุขภาพ",
  "อื่นๆ",
];

export function defaultCategories() {
  return [...DEFAULT_CATEGORIES];
}

export function emptyProjectFields(overrides = {}) {
  return {
    transactions: [],
    categories: [...DEFAULT_CATEGORIES],
    rules: [],
    groupNotes: {},
    groupNicknames: {},
    projectSource: "",
    fileName: "",
    ...overrides,
  };
}

export function makeProjectId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProject(raw, fallbackName = "โปรเจกต์") {
  const fields = emptyProjectFields({
    transactions: Array.isArray(raw?.transactions) ? raw.transactions : [],
    categories: Array.isArray(raw?.categories) ? raw.categories : [...DEFAULT_CATEGORIES],
    rules: Array.isArray(raw?.rules) ? raw.rules : [],
    groupNotes: raw?.groupNotes && typeof raw.groupNotes === "object" ? raw.groupNotes : {},
    groupNicknames:
      raw?.groupNicknames && typeof raw.groupNicknames === "object" ? raw.groupNicknames : {},
    projectSource: typeof raw?.projectSource === "string" ? raw.projectSource : "",
    fileName: typeof raw?.fileName === "string" ? raw.fileName : "",
  });
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : makeProjectId(),
    name: String(raw?.name || fallbackName).trim() || fallbackName,
    source: typeof raw?.source === "string" ? raw.source : fields.projectSource || "local",
    fileName: fields.fileName || "",
    updatedAt: raw?.updatedAt || new Date().toISOString(),
    ...fields,
  };
}

function migrateLegacyState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || (!Array.isArray(data.transactions) && !data.categories)) return null;
    const project = normalizeProject(
      {
        ...data,
        id: "legacy-main",
        name: data.projectSource === "demo" ? "ตัวอย่างสั้น" : data.fileName || data.projectName || "โปรเจกต์เดิม",
        source: data.projectSource || "legacy",
        fileName: data.fileName || "",
      },
      "โปรเจกต์เดิม"
    );
    return {
      activeId: project.id,
      projects: [project],
    };
  } catch {
    return null;
  }
}

export function loadWorkspace() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const projects = Array.isArray(data.projects)
        ? data.projects.map((p, i) => normalizeProject(p, `โปรเจกต์ ${i + 1}`))
        : [];
      if (projects.length) {
        const activeId = projects.some((p) => p.id === data.activeId) ? data.activeId : projects[0].id;
        return { activeId, projects };
      }
    }
  } catch {
    /* fall through */
  }

  const migrated = migrateLegacyState();
  if (migrated) {
    saveWorkspace(migrated);
    return migrated;
  }

  const starter = normalizeProject(
    {
      id: makeProjectId(),
      name: "โปรเจกต์ว่าง",
      source: "local",
      ...emptyProjectFields(),
    },
    "โปรเจกต์ว่าง"
  );
  const ws = { activeId: starter.id, projects: [starter] };
  saveWorkspace(ws);
  return ws;
}

export function saveWorkspace(workspace) {
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({
      activeId: workspace.activeId,
      projects: workspace.projects,
      savedAt: new Date().toISOString(),
    })
  );
  // Keep legacy key in sync with active project for older code paths / backup.
  const active = workspace.projects.find((p) => p.id === workspace.activeId) || workspace.projects[0];
  if (active) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        transactions: active.transactions,
        categories: active.categories,
        rules: active.rules,
        groupNotes: active.groupNotes || {},
        groupNicknames: active.groupNicknames || {},
        projectSource: active.projectSource || "",
        projectId: active.id,
        projectName: active.name,
        fileName: active.fileName || "",
        savedAt: new Date().toISOString(),
      })
    );
  }
}

export function loadState() {
  const ws = loadWorkspace();
  const active = ws.projects.find((p) => p.id === ws.activeId) || ws.projects[0];
  return {
    transactions: active?.transactions || [],
    categories: active?.categories?.length ? active.categories : [...DEFAULT_CATEGORIES],
    rules: active?.rules || [],
    groupNotes: active?.groupNotes || {},
    groupNicknames: active?.groupNicknames || {},
    projectSource: active?.projectSource || "",
    projectId: active?.id || "",
    projectName: active?.name || "โปรเจกต์",
    fileName: active?.fileName || "",
  };
}

export function saveState(state, workspace) {
  if (workspace) {
    const active = workspace.projects.find((p) => p.id === workspace.activeId);
    if (active) {
      active.transactions = state.transactions || [];
      active.categories = state.categories || [...DEFAULT_CATEGORIES];
      active.rules = state.rules || [];
      active.groupNotes = state.groupNotes || {};
      active.groupNicknames = state.groupNicknames || {};
      active.projectSource = state.projectSource || "";
      active.source = state.projectSource || active.source || "local";
      active.fileName = state.fileName || active.fileName || "";
      if (state.projectName) active.name = state.projectName;
      active.updatedAt = new Date().toISOString();
    }
    saveWorkspace(workspace);
    return;
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      transactions: state.transactions,
      categories: state.categories,
      rules: state.rules,
      groupNotes: state.groupNotes || {},
      groupNicknames: state.groupNicknames || {},
      projectSource: state.projectSource || "",
      fileName: state.fileName || "",
      savedAt: new Date().toISOString(),
    })
  );
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
}

/** Common / transfer boilerplate that must not drive auto-tag alone. */
const STOP_WORDS = new Set([
  "และ", "หรือ", "จาก", "ไปยัง", "ไปที่", "โอน", "โอนไป", "เงิน", "ผ่าน", "ชำระ", "รายการ",
  "บช", "บัญชี", "ธนาคาร", "กสิกร", "ไทยพาณิชย์", "กรุงไทย", "กรุงเทพ", "ออมทรัพย์",
  "promptpay", "prompt", "pay", "transfer", "payment", "to", "from", "bank", "scb", "kbank",
  "bbl", "ktb", "bay", "ttb", "ref", "trx", "txn", "fee", "xxxx", "xxxxxxx",
  "ประจำเดือน", "สาขา", "internet", "mobile", "cash", "connect", "plus", "app", "แอปพลิ",
  "โมบาย", "รับโอนเงิน", "โอนเงิน", "พร้อมเพย์", "หักบัญชีอัตโนมัติ", "รหัสอ้างอิง",
  "ช่องทางรายการ", "เพื่อชำระ", "ตู้เติมเงิน", "รับโอนเงินผ่าน", "นาย", "นาง", "นางสาว",
  "บจก", "บริษัท", "limited", "ltd", "the", "and", "for", "with",
  "direct", "credit", "shop", "edc", "thai", "sale", "sales", "debit", "card",
  "รับเงินจากการขายด้วย", "รับเงินจากการขาย", "โมบายแอปพลิ",
]);

const GENERIC_KEYWORDS = new Set([
  ...STOP_WORDS,
  "รับโอนเงิน",
  "โอนเงิน",
  "internet mobile",
  "cash connect",
  "cash connect plus",
  "พร้อมเพย์",
  "ตู้เติมเงิน",
  "รับโอนเงินผ่าน",
  "รับโอนเงิน ตู้เติมเงิน โมบาย แอปพลิ",
]);

export function isReservedCategoryName(name) {
  const n = String(name || "").trim().toLowerCase();
  return !n || n === "__uncat" || n === "ยังไม่มีกลุ่ม";
}

export function isGenericKeyword(keyword) {
  const k = String(keyword || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!k || k.length < 3) return true;
  if (GENERIC_KEYWORDS.has(k) || STOP_WORDS.has(k)) return true;
  const parts = k.split(" ").filter(Boolean);
  if (!parts.length) return true;
  // Phrase is generic if every token is stop/generic or masked (x4576)
  const allWeak = parts.every(
    (p) => STOP_WORDS.has(p) || GENERIC_KEYWORDS.has(p) || /^x+\d*$/i.test(p) || /^\d+$/.test(p) || p.length < 3
  );
  return allWeak;
}

export function sanitizeRuleKeywords(keywords) {
  return [...new Set(
    (keywords || [])
      .map((k) => String(k).toLowerCase().replace(/\s+/g, " ").trim())
      .filter((k) => k.length >= 4)
      .filter((k) => !isGenericKeyword(k))
      // Drop weak 4-letter Latin stubs (shop, sale, card…) — keep longer merchants
      .filter((k) => !(k.length < 5 && /^[a-z0-9]+$/i.test(k)))
  )];
}

/** Extract memorable keywords from a description for auto-rules. */
export function extractKeywords(description) {
  const text = String(description || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = text
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !/^\d+$/.test(t))
    .filter((t) => !/^x+\d*$/i.test(t))
    .filter((t) => !STOP_WORDS.has(t));

  const unique = [...new Set(tokens)];
  unique.sort((a, b) => b.length - a.length);

  // Prefer named entities / merchant-like tokens (letters+length)
  const strong = unique.filter((t) => (t.length >= 5 || /[a-z]/i.test(t)) && !isGenericKeyword(t));
  const picks = (strong.length ? strong : unique.filter((t) => !isGenericKeyword(t))).slice(0, 3);

  // Multi-word phrase only if it keeps a non-generic token
  const phrases = text.match(/[\p{L}\p{N}\p{M}]{3,}(?:\s+[\p{L}\p{N}\p{M}]{3,})+/gu) || [];
  for (const phrase of phrases) {
    const cleaned = phrase
      .split(/\s+/)
      .filter((w) => !STOP_WORDS.has(w) && [...w].length >= 3 && !/^x+\d*$/i.test(w))
      .join(" ");
    if ([...cleaned].length >= 5 && !isGenericKeyword(cleaned) && !picks.includes(cleaned)) {
      picks.unshift(cleaned.slice(0, 48));
      break;
    }
  }

  return sanitizeRuleKeywords(picks).slice(0, 3);
}

export function upsertRule(rules, { keywords, category, curated = false }) {
  const cleaned = curated
    ? [...new Set(
        (keywords || [])
          .map((k) => String(k).toLowerCase().replace(/\s+/g, " ").trim())
          .filter((k) => k.length >= 2)
      )]
    : sanitizeRuleKeywords(keywords);
  if (!cleaned.length || !category || isReservedCategoryName(category)) return rules;
  const key = cleaned.slice().sort().join("|") + "::" + category;
  const next = rules.filter((r) => r.key !== key);
  next.unshift({
    id: `rule_${Math.random().toString(36).slice(2, 9)}`,
    key,
    keywords: cleaned,
    category,
    curated: Boolean(curated),
    hits: 0,
    createdAt: new Date().toISOString(),
  });
  return next.slice(0, 120);
}

export function matchRule(tx, rules) {
  const hay = `${tx.description || ""} ${tx.raw || ""}`.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const rule of rules) {
    // Curated (human) rules keep short tokens like "my qr"; learned rules stay sanitized.
    const useful = (
      rule.curated
        ? (rule.keywords || [])
            .map((k) => String(k).toLowerCase().replace(/\s+/g, " ").trim())
            .filter((k) => k.length >= 2)
        : sanitizeRuleKeywords(rule.keywords)
    ).sort((a, b) => b.length - a.length);
    if (!useful.length) continue;
    // Longest / primary keyword must match — blocks bloated rules with one broad token
    const primary = useful[0];
    if (!hay.includes(primary)) continue;
    const hits = useful.filter((kw) => hay.includes(kw));
    if (!hits.length) continue;
    const hasStrong = rule.curated
      ? hits.some((k) => k.length >= 2)
      : hits.some((k) => k.length >= 5 || /[a-z]{4,}/i.test(k));
    if (!hasStrong) continue;
    let score = hits.reduce((s, kw) => s + Math.min(kw.length, 16), 0);
    score += hits.length * 2;
    score += Math.floor((hits.length / useful.length) * 6);
    score += Math.min(primary.length, 12);
    const threshold = rule.curated ? 6 : 12;
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      best = { ...rule, keywords: useful };
    }
  }
  return best;
}

export function previewApplyRules(transactions, rules) {
  let applied = 0;
  for (const tx of transactions) {
    if (tx.category) continue;
    if (matchRule(tx, rules)) applied += 1;
  }
  return applied;
}

export function applyRules(transactions, rules) {
  let applied = 0;
  const nextRules = rules.map((r) => ({ ...r }));
  const nextTx = transactions.map((tx) => {
    if (tx.category) return tx;
    const rule = matchRule(tx, nextRules);
    if (!rule) return tx;
    applied += 1;
    const idx = nextRules.findIndex((r) => r.id === rule.id);
    if (idx >= 0) nextRules[idx] = { ...nextRules[idx], hits: (nextRules[idx].hits || 0) + 1 };
    return { ...tx, category: rule.category, autoTagged: true };
  });
  return { transactions: nextTx, rules: nextRules, applied };
}

/** Parse amount field; empty / invalid → null (no bound). */
export function parseAmountBound(raw) {
  const v = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function amountInRange(val, min, max) {
  let lo = min;
  let hi = max;
  if (lo != null && hi != null && lo > hi) {
    const tmp = lo;
    lo = hi;
    hi = tmp;
  }
  if (lo != null && val < lo) return false;
  if (hi != null && val > hi) return false;
  return true;
}

/**
 * Table-layer amount filters.
 * - เข้า / ออก: when set, match that direction + amount range
 * - If both เข้า and ออก set: OR
 * - มูลค่า: applies to any row amount (AND with above)
 */
export function filterByAmountRanges(list, ranges = {}) {
  const inMin = ranges.inMin ?? null;
  const inMax = ranges.inMax ?? null;
  const outMin = ranges.outMin ?? null;
  const outMax = ranges.outMax ?? null;
  const valMin = ranges.valMin ?? null;
  const valMax = ranges.valMax ?? null;
  const hasIn = inMin != null || inMax != null;
  const hasOut = outMin != null || outMax != null;
  const hasVal = valMin != null || valMax != null;
  if (!hasIn && !hasOut && !hasVal) return list;

  return list.filter((t) => {
    const amt = Number(t.amount) || 0;
    if (hasVal && !amountInRange(amt, valMin, valMax)) return false;
    if (hasIn && hasOut) {
      const okIn = t.direction === "in" && amountInRange(amt, inMin, inMax);
      const okOut = t.direction === "out" && amountInRange(amt, outMin, outMax);
      return okIn || okOut;
    }
    if (hasIn) return t.direction === "in" && amountInRange(amt, inMin, inMax);
    if (hasOut) return t.direction === "out" && amountInRange(amt, outMin, outMax);
    return true;
  });
}

export function smartSearch(transactions, query) {
  const q = String(query || "").trim();
  if (!q) return transactions.map((t, i) => ({ item: t, score: 1, refIndex: i }));

  // Amount shortcuts: 1500, >1000, <500, 1000-2000
  const amountRange = q.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  const amountGt = q.match(/^>\s*(\d+(?:\.\d+)?)$/);
  const amountLt = q.match(/^<\s*(\d+(?:\.\d+)?)$/);
  const amountEq = q.match(/^[=]?\s*(\d+(?:\.\d+)?)$/);

  if (amountRange || amountGt || amountLt || (amountEq && !/[^\d.\s=]/.test(q))) {
    return transactions
      .map((item, refIndex) => {
        const amt = item.amount || 0;
        let ok = false;
        if (amountRange) {
          ok = amt >= Number(amountRange[1]) && amt <= Number(amountRange[2]);
        } else if (amountGt) ok = amt > Number(amountGt[1]);
        else if (amountLt) ok = amt < Number(amountLt[1]);
        else if (amountEq) ok = Math.abs(amt - Number(amountEq[1])) < 0.009;
        return ok ? { item, score: 0, refIndex } : null;
      })
      .filter(Boolean);
  }

  if (globalThis.Fuse) {
    const fuse = new globalThis.Fuse(transactions, {
      includeScore: true,
      threshold: 0.42,
      ignoreLocation: true,
      keys: [
        { name: "description", weight: 0.5 },
        { name: "raw", weight: 0.25 },
        { name: "category", weight: 0.15 },
        { name: "note", weight: 0.1 },
      ],
    });
    return fuse.search(q);
  }

  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return transactions
    .map((item, refIndex) => {
      const hay = `${item.description} ${item.raw || ""} ${item.category || ""} ${item.note || ""}`.toLowerCase();
      const hit = tokens.every((t) => hay.includes(t));
      return hit ? { item, score: 0.2, refIndex } : null;
    })
    .filter(Boolean);
}

export function formatMoney(n, { currency = true } = {}) {
  if (n == null || Number.isNaN(n)) return "—";
  if (!currency) {
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDateTh(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export function summarizeByGroup(transactions) {
  const map = new Map();
  for (const t of transactions) {
    const key = (t.category || "").trim() || "__uncat";
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: key === "__uncat" ? "ยังไม่มีกลุ่ม" : key,
        count: 0,
        sumIn: 0,
        sumOut: 0,
        notes: [],
      });
    }
    const g = map.get(key);
    g.count += 1;
    if (t.direction === "in") g.sumIn += t.amount || 0;
    else if (t.direction === "out") g.sumOut += t.amount || 0;
    if (t.note && t.note.trim()) g.notes.push(t.note.trim());
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      net: g.sumIn - g.sumOut,
      notePreview: [...new Set(g.notes)].slice(0, 3).join(" · "),
    }))
    .sort((a, b) => {
      if (a.key === "__uncat") return 1;
      if (b.key === "__uncat") return -1;
      return Math.abs(b.sumIn + b.sumOut) - Math.abs(a.sumIn + a.sumOut);
    });
}

export function exportWorkbook(transactions, { groups, fileName, sheetDetail = "รายการ", sheetSummary = "สรุปกลุ่ม" } = {}) {
  if (!globalThis.XLSX) throw new Error("ไม่พบไลบรารี Excel");
  const rows = transactions.map((t) => ({
    วันที่: t.date,
    รายละเอียด: t.description,
    เงินเข้า: t.direction === "in" ? t.amount ?? "" : "",
    เงินออก: t.direction === "out" ? t.amount ?? "" : "",
    กลุ่ม: t.category || "",
    Note: t.note || "",
  }));
  const summarySource = groups || summarizeByGroup(transactions);
  const summaryRows = summarySource.map((g) => ({
    กลุ่ม: g.name,
    จำนวนรายการ: g.count,
    เงินเข้า: g.sumIn,
    เงินออก: g.sumOut,
    สุทธิ: g.net,
    Note: g.notePreview || "",
  }));

  const book = globalThis.XLSX.utils.book_new();
  if (summaryRows.length) {
    globalThis.XLSX.utils.book_append_sheet(
      book,
      globalThis.XLSX.utils.json_to_sheet(summaryRows),
      String(sheetSummary || "สรุปกลุ่ม").slice(0, 31)
    );
  }
  globalThis.XLSX.utils.book_append_sheet(
    book,
    globalThis.XLSX.utils.json_to_sheet(rows),
    String(sheetDetail || "รายการ").slice(0, 31)
  );
  const outName =
    fileName ||
    `taxtag-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  globalThis.XLSX.writeFile(book, outName);
}
