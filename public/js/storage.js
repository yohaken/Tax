const STORAGE_KEY = "taxtag.v1";

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

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        transactions: [],
        categories: [...DEFAULT_CATEGORIES],
        rules: [],
      };
    }
    const data = JSON.parse(raw);
    return {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      categories: Array.isArray(data.categories) && data.categories.length
        ? data.categories
        : [...DEFAULT_CATEGORIES],
      rules: Array.isArray(data.rules) ? data.rules : [],
    };
  } catch {
    return {
      transactions: [],
      categories: [...DEFAULT_CATEGORIES],
      rules: [],
    };
  }
}

export function saveState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      transactions: state.transactions,
      categories: state.categories,
      rules: state.rules,
      savedAt: new Date().toISOString(),
    })
  );
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Extract memorable keywords from a description for auto-rules. */
export function extractKeywords(description) {
  const text = String(description || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stop = new Set([
    "และ", "หรือ", "จาก", "ไปยัง", "ไปที่", "โอน", "โอนไป", "เงิน", "ผ่าน", "ชำระ", "รายการ",
    "บช", "บัญชี", "ธนาคาร", "กสิกร", "ไทยพาณิชย์", "กรุงไทย", "กรุงเทพ", "ออมทรัพย์",
    "promptpay", "prompt", "pay", "transfer", "payment", "to", "from", "bank", "scb", "kbank",
    "ref", "trx", "txn", "fee", "ค่าธรรมเนียม", "xxxx", "xxxxxxx", "ประจำเดือน", "สาขา",
  ]);

  const tokens = text
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !/^\d+$/.test(t))
    .filter((t) => !/^x+$/i.test(t))
    .filter((t) => !stop.has(t));

  const unique = [...new Set(tokens)];
  unique.sort((a, b) => b.length - a.length);

  // Prefer named entities / merchant-like tokens (letters+length)
  const strong = unique.filter((t) => t.length >= 4 || /[a-z]/i.test(t));
  const picks = (strong.length ? strong : unique).slice(0, 3);

  // Multi-word phrase only if it avoids stop-word-only starts
  const phrases = text.match(/[\p{L}\p{N}\p{M}]{3,}(?:\s+[\p{L}\p{N}\p{M}]{3,})+/gu) || [];
  for (const phrase of phrases) {
    const cleaned = phrase
      .split(/\s+/)
      .filter((w) => !stop.has(w) && [...w].length >= 3)
      .join(" ");
    if ([...cleaned].length >= 5 && !picks.includes(cleaned)) {
      picks.unshift(cleaned.slice(0, 48));
      break;
    }
  }

  return [...new Set(picks)].slice(0, 3);
}

export function upsertRule(rules, { keywords, category }) {
  const cleaned = (keywords || [])
    .map((k) => String(k).toLowerCase().trim())
    .filter((k) => k.length >= 3);
  if (!cleaned.length || !category) return rules;
  const key = cleaned.slice().sort().join("|") + "::" + category;
  const next = rules.filter((r) => r.key !== key);
  next.unshift({
    id: `rule_${Math.random().toString(36).slice(2, 9)}`,
    key,
    keywords: cleaned,
    category,
    hits: 0,
    createdAt: new Date().toISOString(),
  });
  return next.slice(0, 80);
}

export function matchRule(tx, rules) {
  const hay = `${tx.description || ""} ${tx.raw || ""}`.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const rule of rules) {
    const hits = rule.keywords.filter((kw) => hay.includes(kw));
    if (!hits.length) continue;
    // Require at least one strong keyword (>=4 chars) or all keywords matched
    const hasStrong = hits.some((k) => k.length >= 4);
    if (!hasStrong && hits.length < rule.keywords.length) continue;
    let score = hits.reduce((s, kw) => s + Math.min(kw.length, 16), 0);
    // Prefer more specific rules
    score += hits.length * 2;
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }
  return bestScore >= 5 ? best : null;
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

export function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return "—";
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

export function exportWorkbook(transactions, { groups } = {}) {
  if (!globalThis.XLSX) throw new Error("ไม่พบไลบรารี Excel");
  const rows = transactions.map((t) => ({
    วันที่: t.date,
    รายละเอียด: t.description,
    เงินเข้า: t.direction === "in" ? t.amount ?? "" : "",
    เงินออก: t.direction === "out" ? t.amount ?? "" : "",
    กลุ่ม: t.category || "",
    Note: t.note || "",
    แหล่งที่มา: t.source || "",
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
  globalThis.XLSX.utils.book_append_sheet(
    book,
    globalThis.XLSX.utils.json_to_sheet(summaryRows),
    "สรุปกลุ่ม"
  );
  globalThis.XLSX.utils.book_append_sheet(
    book,
    globalThis.XLSX.utils.json_to_sheet(rows),
    "รายการ"
  );
  globalThis.XLSX.writeFile(book, `taxtag-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
