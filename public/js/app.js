import { parseFile, dedupeTransactions } from "./parser.js";
import {
  loadState,
  saveState,
  extractKeywords,
  upsertRule,
  applyRules,
  smartSearch,
  formatMoney,
  formatDateTh,
  exportWorkbook,
  summarizeByGroup,
} from "./storage.js";
import {
  ALLOWED_EMAIL,
  initFirebase,
  watchAuth,
  loginWithGoogle,
  logoutFirebase,
  pullCloudState,
  pushCloudState,
} from "./firebase.js";

const state = loadState();
if (!state.groupNotes) state.groupNotes = {};
if (!state.projectSource) state.projectSource = "";

let currentUser = null;
let cloudReady = false;
let authReady = false;
let persistTimer = null;
let searchTimer = null;
let rendering = false;
let pendingPeerland = false;
let pendingDemo = false;
const selectedIds = new Set();
let tableSort = { key: "date", dir: "desc" };
let groupSort = { key: "abs", dir: "desc" };
let periodMode = "all"; // all | year:YYYY | custom
let syncingPeriod = false;
const undoStack = [];
const MAX_UNDO = 40;
const fieldBefore = new WeakMap();

const PEERLAND_CATEGORIES = [
  "รายได้ลูกค้า / QR",
  "Shopee / Lazada",
  "ชำระบัตรกสิกร",
  "โอนภายใน / ส่วนตัว",
  "ค่าธรรมเนียม",
  "สินค้า / ซูเปอร์มาร์เก็ต",
  "หลักทรัพย์ / ออม",
  "อื่นๆ",
];

const PEERLAND_RULES = [
  { keywords: ["ช้อปปี้เพย์", "shopee"], category: "Shopee / Lazada" },
  { keywords: ["lazada"], category: "Shopee / Lazada" },
  { keywords: ["บัตรกสิกรไทย"], category: "ชำระบัตรกสิกร" },
  { keywords: ["ค่าธรรมเนียม"], category: "ค่าธรรมเนียม" },
  { keywords: ["my qr", "รับโอนเงินผ่าน qr"], category: "รายได้ลูกค้า / QR" },
  { keywords: ["ซีพี แอ็กซ์ตร้า", "cp axtra"], category: "สินค้า / ซูเปอร์มาร์เก็ต" },
  { keywords: ["ksecurities", "หลักทรัพย์"], category: "หลักทรัพย์ / ออม" },
  { keywords: ["phiraphong yohakh", "พีระพงษ์ โยหาเ"], category: "โอนภายใน / ส่วนตัว" },
];

const els = {
  loginGate: document.getElementById("login-gate"),
  empty: document.getElementById("empty-state"),
  workspace: document.getElementById("workspace"),
  authTools: document.getElementById("auth-tools"),
  fileInput: document.getElementById("file-input"),
  search: document.getElementById("search-input"),
  btnClearSearch: document.getElementById("btn-clear-search"),
  dateFrom: document.getElementById("date-from"),
  dateTo: document.getElementById("date-to"),
  filterCategory: document.getElementById("filter-category"),
  filterDirection: document.getElementById("filter-direction"),
  addGroupForm: document.getElementById("add-group-form"),
  newGroupName: document.getElementById("new-group-name"),
  txBody: document.getElementById("tx-body"),
  resultLabel: document.getElementById("result-label"),
  categoryDatalist: document.getElementById("category-datalist"),
  groupList: document.getElementById("group-list"),
  periodChips: document.getElementById("period-chips"),
  periodRange: document.getElementById("period-range"),
  btnPrintOverview: document.getElementById("btn-print-overview"),
  printRoot: document.getElementById("print-root"),
  checkAll: document.getElementById("check-all"),
  bulkCount: document.getElementById("bulk-count"),
  bulkGroup: document.getElementById("bulk-group"),
  bulkNote: document.getElementById("bulk-note"),
  btnBulkApply: document.getElementById("btn-bulk-apply"),
  btnBulkClear: document.getElementById("btn-bulk-clear"),
  btnExport: document.getElementById("btn-export"),
  btnUndo: document.getElementById("btn-undo"),
  btnReloadProject: document.getElementById("btn-reload-project"),
  btnAuth: document.getElementById("btn-auth"),
  btnAuthHero: document.getElementById("btn-auth-hero"),
  btnPeerland: document.getElementById("btn-peerland"),
  btnPeerlandHero: document.getElementById("btn-peerland-hero"),
  btnDemo: document.getElementById("btn-demo"),
  syncStatus: document.getElementById("sync-status"),
  toast: document.getElementById("toast"),
  statCount: document.getElementById("stat-count"),
  statUncat: document.getElementById("stat-uncat"),
  statIn: document.getElementById("stat-in"),
  statOut: document.getElementById("stat-out"),
};

function isLoggedIn() {
  return Boolean(currentUser);
}

function requireLogin(message = "ต้องเข้าสู่ระบบก่อน") {
  if (isLoggedIn()) return true;
  toast(message);
  return false;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function setSync(text) {
  if (els.syncStatus) els.syncStatus.textContent = text;
}

function cloneStateSlice() {
  return {
    transactions: state.transactions.map((t) => ({ ...t })),
    categories: [...state.categories],
    rules: state.rules.map((r) => ({
      ...r,
      keywords: Array.isArray(r.keywords) ? [...r.keywords] : r.keywords,
    })),
    groupNotes: { ...(state.groupNotes || {}) },
    projectSource: state.projectSource || "",
  };
}

function applyStateSlice(slice) {
  state.transactions = slice.transactions.map((t) => ({ ...t }));
  state.categories = [...slice.categories];
  state.rules = slice.rules.map((r) => ({
    ...r,
    keywords: Array.isArray(r.keywords) ? [...r.keywords] : r.keywords,
  }));
  state.groupNotes = { ...(slice.groupNotes || {}) };
  state.projectSource = slice.projectSource || "";
}

function updateUndoButton() {
  if (!els.btnUndo) return;
  const top = undoStack[undoStack.length - 1];
  els.btnUndo.disabled = !top;
  els.btnUndo.title = top ? `เลิกทำ: ${top.label} (Ctrl+Z)` : "เลิกทำ (Ctrl+Z)";
  els.btnUndo.textContent = top ? `เลิกทำ` : "เลิกทำ";
}

function pushUndo(label, beforeSlice) {
  undoStack.push({ label, before: beforeSlice });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  updateUndoButton();
}

function withUndo(label, mutator) {
  const before = cloneStateSlice();
  mutator();
  pushUndo(label, before);
}

function undoLast() {
  if (!requireLogin()) return;
  const entry = undoStack.pop();
  updateUndoButton();
  if (!entry) {
    toast("ไม่มีอะไรให้เลิกทำ");
    return;
  }
  applyStateSlice(entry.before);
  selectedIds.clear();
  schedulePersist();
  scheduleRender();
  toast(`เลิกทำ: ${entry.label}`);
}

function rememberField(el) {
  if (!el) return;
  fieldBefore.set(el, el.value);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  const q = String(query || "").trim();
  if (!q || /^[><=]?\s*\d/.test(q) || q.includes("-")) return safe;
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return safe;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return safe.replace(re, '<mark class="mark">$1</mark>');
}

function schedulePersist({ cloud = true } = {}) {
  saveState(state);
  setSync(currentUser ? "บันทึกในเครื่องแล้ว · กำลังซิงค์…" : "บันทึกอัตโนมัติ");
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!cloud || !currentUser || !cloudReady) {
      setSync(currentUser ? `ออนไลน์ · ${currentUser.email}` : "บันทึกอัตโนมัติในเครื่อง");
      return;
    }
    try {
      await pushCloudState(currentUser.uid, state);
      setSync(`ซิงค์แล้ว · ${currentUser.email}`);
    } catch (err) {
      console.warn(err);
      setSync("บันทึกในเครื่องแล้ว (คลาวด์ยังไม่พร้อม)");
    }
  }, 450);
}

function sortTransactions(list) {
  const dir = tableSort.dir === "asc" ? 1 : -1;
  const key = tableSort.key;
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === "date") cmp = String(a.date || "").localeCompare(String(b.date || ""));
    else if (key === "desc") cmp = String(a.description || "").localeCompare(String(b.description || ""), "th");
    else if (key === "group") cmp = String(a.category || "").localeCompare(String(b.category || ""), "th");
    else if (key === "note") cmp = String(a.note || "").localeCompare(String(b.note || ""), "th");
    else if (key === "in") cmp = ((a.direction === "in" ? a.amount : 0) || 0) - ((b.direction === "in" ? b.amount : 0) || 0);
    else if (key === "out") cmp = ((a.direction === "out" ? a.amount : 0) || 0) - ((b.direction === "out" ? b.amount : 0) || 0);
    else cmp = (a.amount || 0) - (b.amount || 0);
    if (cmp === 0) cmp = String(a.id).localeCompare(String(b.id));
    return cmp * dir;
  });
}

function getFiltered() {
  let list = state.transactions;
  const from = els.dateFrom.value;
  const to = els.dateTo.value;
  if (from) list = list.filter((t) => t.date && t.date >= from);
  if (to) list = list.filter((t) => t.date && t.date <= to);
  const cat = els.filterCategory.value;
  if (cat === "__uncat") list = list.filter((t) => !t.category);
  else if (cat) list = list.filter((t) => t.category === cat);
  const dir = els.filterDirection.value;
  if (dir) list = list.filter((t) => t.direction === dir);
  const searched = smartSearch(list, els.search.value).map((r) => r.item);
  return sortTransactions(searched);
}

function updateStats(visible) {
  const uncat = state.transactions.filter((t) => !t.category).length;
  const sumIn = visible.filter((t) => t.direction === "in").reduce((s, t) => s + (t.amount || 0), 0);
  const sumOut = visible.filter((t) => t.direction === "out").reduce((s, t) => s + (t.amount || 0), 0);
  els.statCount.textContent = String(state.transactions.length);
  els.statUncat.textContent = String(uncat);
  els.statIn.textContent = formatMoney(sumIn);
  els.statOut.textContent = formatMoney(sumOut);
  els.resultLabel.textContent = `แสดง ${visible.length.toLocaleString("th-TH")} จาก ${state.transactions.length.toLocaleString("th-TH")} รายการ`;
  if (els.bulkCount) els.bulkCount.textContent = `เลือก ${selectedIds.size.toLocaleString("th-TH")}`;
}

function refreshCategoryOptions() {
  const current = els.filterCategory.value;
  els.categoryDatalist.innerHTML = state.categories
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
  els.filterCategory.innerHTML =
    `<option value="">ทุกกลุ่ม</option><option value="__uncat">ยังไม่มีกลุ่ม</option>` +
    state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if ([...els.filterCategory.options].some((o) => o.value === current)) {
    els.filterCategory.value = current;
  }
}

function getSummaryBase() {
  let list = state.transactions;
  const from = els.dateFrom.value;
  const to = els.dateTo.value;
  if (from) list = list.filter((t) => t.date && t.date >= from);
  if (to) list = list.filter((t) => t.date && t.date <= to);
  const dir = els.filterDirection.value;
  if (dir) list = list.filter((t) => t.direction === dir);
  return smartSearch(list, els.search.value).map((r) => r.item);
}

function dataDateBounds(list = state.transactions) {
  const dates = list.map((t) => t.date).filter(Boolean).sort();
  if (!dates.length) return null;
  return { from: dates[0], to: dates[dates.length - 1] };
}

function availableYears() {
  const years = new Set();
  for (const t of state.transactions) {
    if (!t.date || t.date.length < 4) continue;
    const y = Number(t.date.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  return [...years].sort((a, b) => a - b);
}

function periodLabelText() {
  if (periodMode === "all") return "ทุกปีที่มีข้อมูล";
  if (periodMode.startsWith("year:")) return `ปี ${periodMode.slice(5)}`;
  return "ช่วงกำหนดเอง";
}

function updatePeriodRangeLabel(base = getSummaryBase()) {
  if (!els.periodRange) return;
  const bounds = dataDateBounds(base);
  if (!bounds) {
    els.periodRange.textContent = "ยังไม่มีข้อมูลในช่วงนี้";
    return;
  }
  els.periodRange.textContent = `ข้อมูล ${formatDateTh(bounds.from)} – ${formatDateTh(bounds.to)} · ${periodLabelText()} · ${base.length.toLocaleString("th-TH")} รายการ`;
}

function renderPeriodChips() {
  if (!els.periodChips) return;
  const years = availableYears();
  const chips = [
    `<button type="button" class="period-chip${periodMode === "all" ? " is-active" : ""}" data-period="all">ทุกปี</button>`,
    ...years.map(
      (y) =>
        `<button type="button" class="period-chip${periodMode === `year:${y}` ? " is-active" : ""}" data-period="year:${y}">${y}</button>`
    ),
    `<button type="button" class="period-chip${periodMode === "custom" ? " is-active" : ""}" data-period="custom">ช่วงเอง</button>`,
  ];
  els.periodChips.innerHTML = chips.join("");
}

function applyPeriodMode(mode, { render = true } = {}) {
  periodMode = mode || "all";
  syncingPeriod = true;
  if (periodMode === "all") {
    const bounds = dataDateBounds(state.transactions);
    els.dateFrom.value = "";
    els.dateTo.value = "";
    // keep filters empty so "all data" — range label still shows actual min-max
    void bounds;
  } else if (periodMode.startsWith("year:")) {
    const y = periodMode.slice(5);
    els.dateFrom.value = `${y}-01-01`;
    els.dateTo.value = `${y}-12-31`;
  }
  // custom: leave dateFrom/dateTo as user set; focus the filter dates
  syncingPeriod = false;
  renderPeriodChips();
  if (render) scheduleRender();
  if (periodMode === "custom") {
    els.dateFrom?.focus();
  }
}

function syncPeriodFromDateFilters() {
  if (syncingPeriod) return;
  const from = els.dateFrom.value;
  const to = els.dateTo.value;
  if (!from && !to) {
    periodMode = "all";
  } else if (/^\d{4}-01-01$/.test(from) && /^\d{4}-12-31$/.test(to) && from.slice(0, 4) === to.slice(0, 4)) {
    periodMode = `year:${from.slice(0, 4)}`;
  } else {
    periodMode = "custom";
  }
  renderPeriodChips();
}

function groupSortMarker(key) {
  if (groupSort.key !== key) return "";
  return groupSort.dir === "asc" ? " ↑" : " ↓";
}

function sortGroups(groups) {
  const dir = groupSort.dir === "asc" ? 1 : -1;
  const key = groupSort.key || "abs";
  return [...groups].sort((a, b) => {
    if (a.key === "__uncat") return 1;
    if (b.key === "__uncat") return -1;
    let cmp = 0;
    if (key === "name") cmp = a.name.localeCompare(b.name, "th");
    else if (key === "count") cmp = a.count - b.count;
    else if (key === "in") cmp = a.sumIn - b.sumIn;
    else if (key === "out") cmp = a.sumOut - b.sumOut;
    else if (key === "net") cmp = a.net - b.net;
    else if (key === "note") {
      const an = state.groupNotes?.[a.key] || "";
      const bn = state.groupNotes?.[b.key] || "";
      cmp = an.localeCompare(bn, "th") || a.notes.length - b.notes.length;
    } else cmp = Math.abs(a.sumIn + a.sumOut) - Math.abs(b.sumIn + b.sumOut);
    return cmp * dir;
  });
}

function groupTotals(groups) {
  return groups.reduce(
    (acc, g) => {
      acc.count += g.count || 0;
      acc.sumIn += g.sumIn || 0;
      acc.sumOut += g.sumOut || 0;
      acc.net += g.net || 0;
      return acc;
    },
    { count: 0, sumIn: 0, sumOut: 0, net: 0 }
  );
}

function renderGroupSummary() {
  if (!els.groupList) return;
  renderPeriodChips();
  const base = getSummaryBase();
  updatePeriodRangeLabel(base);
  const groups = sortGroups(summarizeByGroup(base));
  const active = els.filterCategory.value || "";

  if (!groups.length) {
    els.groupList.innerHTML = `<div class="group-meta">ยังไม่มีรายการให้สรุปในช่วงนี้</div>`;
    return;
  }

  const totals = groupTotals(groups);
  const head = `
    <thead>
      <tr>
        <th><button type="button" class="th-sort${groupSort.key === "name" ? " is-active" : ""}" data-group-sort="name">กลุ่ม${groupSortMarker("name")}</button></th>
        <th class="num"><button type="button" class="th-sort${groupSort.key === "count" ? " is-active" : ""}" data-group-sort="count">จำนวน${groupSortMarker("count")}</button></th>
        <th class="num"><button type="button" class="th-sort${groupSort.key === "in" ? " is-active" : ""}" data-group-sort="in">เงินเข้า${groupSortMarker("in")}</button></th>
        <th class="num"><button type="button" class="th-sort${groupSort.key === "out" ? " is-active" : ""}" data-group-sort="out">เงินออก${groupSortMarker("out")}</button></th>
        <th class="num"><button type="button" class="th-sort${groupSort.key === "net" ? " is-active" : ""}" data-group-sort="net">สุทธิ${groupSortMarker("net")}</button></th>
        <th><button type="button" class="th-sort${groupSort.key === "note" ? " is-active" : ""}" data-group-sort="note">Note${groupSortMarker("note")}</button></th>
        <th class="col-actions">จัดการ</th>
      </tr>
    </thead>`;

  const body = groups
    .map((g) => {
      const isActive = active === g.key;
      const gNote = state.groupNotes?.[g.key] || "";
      return `<tr class="${isActive ? "is-active" : ""}" data-group="${escapeHtml(g.key)}">
        <td>
          <div class="group-title-row">
            <button type="button" class="group-title-btn" data-filter-group="${escapeHtml(g.key)}">${escapeHtml(g.name)}</button>
            ${
              g.key === "__uncat"
                ? ""
                : `<button type="button" class="btn quiet tiny" data-rename-group="${escapeHtml(g.key)}" title="แก้ชื่อกลุ่ม">แก้ชื่อ</button>`
            }
          </div>
        </td>
        <td class="num">${g.count.toLocaleString("th-TH")}</td>
        <td class="num amount-in">${escapeHtml(formatMoney(g.sumIn))}</td>
        <td class="num amount-out">${escapeHtml(formatMoney(g.sumOut))}</td>
        <td class="num">${escapeHtml(formatMoney(g.net))}</td>
        <td class="group-note-cell">
          <input class="group-note" data-group-note="${escapeHtml(g.key)}" value="${escapeHtml(gNote)}" placeholder="Note กลุ่ม…" />
        </td>
        <td class="group-actions">
          <button type="button" class="btn quiet tiny" data-filter-group="${escapeHtml(g.key)}">ดู</button>
          <button type="button" class="btn quiet tiny" data-export-group="${escapeHtml(g.key)}">Export</button>
          <button type="button" class="btn quiet tiny" data-print-group="${escapeHtml(g.key)}">พิมพ์</button>
        </td>
      </tr>`;
    })
    .join("");

  const foot = `<tfoot>
    <tr class="group-total-row">
      <td>รวมทั้งสิ้น (${groups.length.toLocaleString("th-TH")} กลุ่ม)</td>
      <td class="num">${totals.count.toLocaleString("th-TH")}</td>
      <td class="num amount-in">${escapeHtml(formatMoney(totals.sumIn))}</td>
      <td class="num amount-out">${escapeHtml(formatMoney(totals.sumOut))}</td>
      <td class="num">${escapeHtml(formatMoney(totals.net))}</td>
      <td colspan="2"></td>
    </tr>
  </tfoot>`;

  els.groupList.innerHTML = `<table class="group-table">${head}<tbody>${body}</tbody>${foot}</table>`;
}

function rowsForGroup(groupKey) {
  const base = getSummaryBase();
  if (groupKey === "__uncat") return base.filter((t) => !t.category);
  return base.filter((t) => t.category === groupKey);
}

function groupTitle(groupKey) {
  return groupKey === "__uncat" ? "ยังไม่มีกลุ่ม" : groupKey;
}

function printGroup(groupKey) {
  if (!requireLogin()) return;
  const rows = rowsForGroup(groupKey).sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || (a.amount || 0) - (b.amount || 0)
  );
  if (!rows.length) {
    toast("กลุ่มนี้ยังไม่มีรายการ");
    return;
  }
  const sumIn = rows.filter((t) => t.direction === "in").reduce((s, t) => s + (t.amount || 0), 0);
  const sumOut = rows.filter((t) => t.direction === "out").reduce((s, t) => s + (t.amount || 0), 0);
  const gNote = state.groupNotes?.[groupKey] || "";
  const bounds = dataDateBounds(rows);
  const printedAt = formatDateTh(new Date().toISOString().slice(0, 10));

  els.printRoot.hidden = false;
  els.printRoot.innerHTML = `
    <h1>TaxTag · ${escapeHtml(groupTitle(groupKey))}</h1>
    <p class="print-sub">${periodLabelText()}
      ${bounds ? ` · ข้อมูล ${escapeHtml(formatDateTh(bounds.from))} – ${escapeHtml(formatDateTh(bounds.to))}` : ""}
      · ${rows.length.toLocaleString("th-TH")} รายการ
      · พิมพ์ ${escapeHtml(printedAt)}
      <br/>เข้า ${escapeHtml(formatMoney(sumIn))}
      · ออก ${escapeHtml(formatMoney(sumOut))}
      · สุทธิ ${escapeHtml(formatMoney(sumIn - sumOut))}
      ${gNote ? `<br/>Note กลุ่ม: ${escapeHtml(gNote)}` : ""}
    </p>
    <table>
      <thead><tr><th>วันที่</th><th>รายละเอียด</th><th class="num">เข้า</th><th class="num">ออก</th><th>Note</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (t) => `<tr>
            <td>${escapeHtml(formatDateTh(t.date))}</td>
            <td>${escapeHtml(t.description)}</td>
            <td class="num">${t.direction === "in" ? escapeHtml(formatMoney(t.amount)) : ""}</td>
            <td class="num">${t.direction === "out" ? escapeHtml(formatMoney(t.amount)) : ""}</td>
            <td>${escapeHtml(t.note || "")}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="totals">รวมเข้า ${escapeHtml(formatMoney(sumIn))} · รวมออก ${escapeHtml(formatMoney(sumOut))} · สุทธิ ${escapeHtml(formatMoney(sumIn - sumOut))}</p>
  `;
  window.print();
  setTimeout(() => {
    els.printRoot.hidden = true;
    els.printRoot.innerHTML = "";
  }, 300);
}

function printOverview() {
  if (!requireLogin()) return;
  const base = getSummaryBase();
  const groups = sortGroups(summarizeByGroup(base));
  if (!groups.length) {
    toast("ยังไม่มีรายการให้สรุป");
    return;
  }
  const totals = groupTotals(groups);
  const bounds = dataDateBounds(base);
  const printedAt = formatDateTh(new Date().toISOString().slice(0, 10));

  els.printRoot.hidden = false;
  els.printRoot.innerHTML = `
    <h1>TaxTag · สรุปตามกลุ่ม</h1>
    <p class="print-sub">สำหรับเสนอภาพรวมแยกกลุ่ม
      <br/>${escapeHtml(periodLabelText())}
      ${bounds ? ` · ข้อมูล ${escapeHtml(formatDateTh(bounds.from))} – ${escapeHtml(formatDateTh(bounds.to))}` : ""}
      · ${base.length.toLocaleString("th-TH")} รายการ
      · พิมพ์ ${escapeHtml(printedAt)}
    </p>
    <table>
      <thead>
        <tr>
          <th>กลุ่ม</th>
          <th class="num">จำนวน</th>
          <th class="num">เงินเข้า</th>
          <th class="num">เงินออก</th>
          <th class="num">สุทธิ</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${groups
          .map((g) => {
            const gNote = state.groupNotes?.[g.key] || "";
            return `<tr>
              <td>${escapeHtml(g.name)}</td>
              <td class="num">${g.count.toLocaleString("th-TH")}</td>
              <td class="num">${escapeHtml(formatMoney(g.sumIn))}</td>
              <td class="num">${escapeHtml(formatMoney(g.sumOut))}</td>
              <td class="num">${escapeHtml(formatMoney(g.net))}</td>
              <td>${escapeHtml(gNote)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td><strong>รวมทั้งสิ้น (${groups.length.toLocaleString("th-TH")} กลุ่ม)</strong></td>
          <td class="num"><strong>${totals.count.toLocaleString("th-TH")}</strong></td>
          <td class="num"><strong>${escapeHtml(formatMoney(totals.sumIn))}</strong></td>
          <td class="num"><strong>${escapeHtml(formatMoney(totals.sumOut))}</strong></td>
          <td class="num"><strong>${escapeHtml(formatMoney(totals.net))}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
  window.print();
  setTimeout(() => {
    els.printRoot.hidden = true;
    els.printRoot.innerHTML = "";
  }, 300);
}

function exportGroup(groupKey) {
  if (!requireLogin()) return;
  const rows = rowsForGroup(groupKey);
  if (!rows.length) {
    toast("กลุ่มนี้ยังไม่มีรายการ");
    return;
  }
  exportWorkbook(rows, { groups: summarizeByGroup(rows) });
  toast(`Export กลุ่ม “${groupTitle(groupKey)}” · ${rows.length.toLocaleString("th-TH")} รายการ`);
}

function sortMarker(key) {
  if (tableSort.key !== key) return "";
  return tableSort.dir === "asc" ? " ↑" : " ↓";
}

function updateSortHeaders() {
  document.querySelectorAll(".th-sort").forEach((btn) => {
    const key = btn.getAttribute("data-sort");
    const label = btn.textContent.replace(/ [↑↓]$/, "");
    btn.textContent = label + sortMarker(key);
    btn.classList.toggle("is-active", tableSort.key === key);
  });
}

function renderTable() {
  if (rendering) return;
  rendering = true;

  if (!authReady) {
    els.loginGate?.classList.remove("is-hidden");
    els.empty?.classList.add("is-hidden");
    els.workspace?.classList.add("is-hidden");
    els.authTools?.classList.add("is-hidden");
    setSync("กำลังตรวจสอบสิทธิ์…");
    rendering = false;
    return;
  }

  if (!isLoggedIn()) {
    els.loginGate?.classList.remove("is-hidden");
    els.empty?.classList.add("is-hidden");
    els.workspace?.classList.add("is-hidden");
    els.authTools?.classList.add("is-hidden");
    if (els.txBody) els.txBody.innerHTML = "";
    if (els.groupList) els.groupList.innerHTML = "";
    setSync("ต้องเข้าสู่ระบบก่อน");
    rendering = false;
    return;
  }

  els.loginGate?.classList.add("is-hidden");
  els.authTools?.classList.remove("is-hidden");

  const hasData = state.transactions.length > 0;
  els.empty.classList.toggle("is-hidden", hasData);
  els.workspace.classList.toggle("is-hidden", !hasData);
  refreshCategoryOptions();
  updateSortHeaders();

  if (!hasData) {
    rendering = false;
    return;
  }

  const visible = getFiltered();
  const MAX = 500;
  const slice = visible.slice(0, MAX);
  updateStats(visible);
  renderGroupSummary();

  els.txBody.innerHTML = slice
    .map((t) => {
      const cat = t.category || "";
      const checked = selectedIds.has(t.id) ? "checked" : "";
      return `<tr data-id="${t.id}">
        <td class="col-check"><input type="checkbox" data-check="${t.id}" ${checked} /></td>
        <td>${escapeHtml(formatDateTh(t.date))}${t.time ? `<div class="desc-sub">${escapeHtml(t.time)}</div>` : ""}</td>
        <td>
          <div class="desc-main">${highlight(t.description, els.search.value)}</div>
          <div class="desc-sub">${escapeHtml(t.source || "")}</div>
        </td>
        <td class="num amount-in">${t.direction === "in" ? escapeHtml(formatMoney(t.amount)) : "—"}</td>
        <td class="num amount-out">${t.direction === "out" ? escapeHtml(formatMoney(t.amount)) : "—"}</td>
        <td class="num">${escapeHtml(formatMoney(t.amount || 0))}</td>
        <td><input class="cell-cat${cat ? " has-value" : ""}" list="category-datalist" data-cat="${t.id}" value="${escapeHtml(cat)}" placeholder="กลุ่ม…" /></td>
        <td><input class="cell-note" data-note="${t.id}" value="${escapeHtml(t.note || "")}" placeholder="Note…" /></td>
      </tr>`;
    })
    .join("");

  if (els.checkAll) {
    els.checkAll.checked = slice.length > 0 && slice.every((t) => selectedIds.has(t.id));
    els.checkAll.indeterminate = slice.some((t) => selectedIds.has(t.id)) && !els.checkAll.checked;
  }

  if (visible.length > MAX) {
    els.resultLabel.textContent += ` · แสดง ${MAX} แถวแรก กรองเพิ่มเพื่อเจอรายการลึก`;
  }
  rendering = false;
}

function scheduleRender() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTable, 100);
}

function patchTx(id, patch, { learn = false, recordUndo = true, undoLabel = "แก้รายการ" } = {}) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const before = recordUndo ? cloneStateSlice() : null;
  Object.assign(tx, patch);
  if (learn && patch.category) {
    if (!state.categories.includes(patch.category)) state.categories.unshift(patch.category);
    state.rules = upsertRule(state.rules, {
      keywords: extractKeywords(tx.description),
      category: patch.category,
    });
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
  }
  if (recordUndo && before) pushUndo(undoLabel, before);
  schedulePersist();
}

function applyBulk() {
  if (!requireLogin()) return;
  if (!selectedIds.size) {
    toast("ยังไม่ได้ติ๊กรายการ");
    return;
  }
  const group = (els.bulkGroup.value || "").trim();
  const note = els.bulkNote.value;
  if (!group && note === "") {
    toast("ใส่กลุ่มหรือ Note ก่อน");
    return;
  }
  let n = 0;
  withUndo(`ใส่กลุ่ม/Note ให้ที่เลือก`, () => {
    for (const id of selectedIds) {
      const tx = state.transactions.find((t) => t.id === id);
      if (!tx) continue;
      if (group) {
        tx.category = group;
        state.rules = upsertRule(state.rules, {
          keywords: extractKeywords(tx.description),
          category: group,
        });
      }
      if (note !== "") tx.note = note;
      n += 1;
    }
    if (group && !state.categories.includes(group)) state.categories.unshift(group);
    if (group) {
      const applied = applyRules(state.transactions, state.rules);
      state.transactions = applied.transactions;
      state.rules = applied.rules;
    }
  });
  schedulePersist();
  scheduleRender();
  toast(`ใส่ให้ ${n.toLocaleString("th-TH")} รายการที่เลือกแล้ว`);
}

function renameGroup(oldName, newName) {
  if (!requireLogin()) return false;
  const next = String(newName || "").trim();
  const prev = String(oldName || "").trim();
  if (!prev || prev === "__uncat") return false;
  if (!next) {
    toast("ใส่ชื่อกลุ่มใหม่");
    return false;
  }
  if (next === prev) return false;
  if (state.categories.includes(next)) {
    toast("มีชื่อกลุ่มนี้แล้ว");
    return false;
  }
  withUndo(`เปลี่ยนชื่อกลุ่ม “${prev}”`, () => {
    state.categories = state.categories.map((c) => (c === prev ? next : c));
    for (const t of state.transactions) {
      if (t.category === prev) t.category = next;
    }
    for (const r of state.rules) {
      if (r.category === prev) r.category = next;
    }
    if (Object.prototype.hasOwnProperty.call(state.groupNotes, prev)) {
      state.groupNotes[next] = state.groupNotes[prev];
      delete state.groupNotes[prev];
    }
    if (els.filterCategory.value === prev) els.filterCategory.value = next;
  });
  schedulePersist();
  scheduleRender();
  toast(`เปลี่ยนชื่อเป็น “${next}”`);
  return true;
}

function beginRenameGroup(groupKey) {
  if (!groupKey || groupKey === "__uncat") return;
  const row = [...(els.groupList?.querySelectorAll("[data-group]") || [])].find(
    (el) => el.getAttribute("data-group") === groupKey
  );
  const cell = row?.querySelector("td");
  if (!cell || cell.querySelector("[data-rename-form]")) return;
  const titleRow = cell.querySelector(".group-title-row");
  if (!titleRow) return;
  titleRow.hidden = true;
  const form = document.createElement("form");
  form.className = "rename-form";
  form.setAttribute("data-rename-form", groupKey);
  form.innerHTML = `
    <input type="text" value="${escapeHtml(groupKey)}" maxlength="60" aria-label="ชื่อกลุ่มใหม่" required />
    <button type="submit" class="btn solid tiny">บันทึก</button>
    <button type="button" class="btn quiet tiny" data-rename-cancel>ยกเลิก</button>
  `;
  cell.appendChild(form);
  const input = form.querySelector("input");
  input.focus();
  input.select();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    renameGroup(groupKey, input.value);
  });
  form.querySelector("[data-rename-cancel]")?.addEventListener("click", () => {
    form.remove();
    titleRow.hidden = false;
  });
}

function detectProjectSource() {
  if (state.projectSource === "peerland" || state.projectSource === "demo") return state.projectSource;
  const params = new URLSearchParams(window.location.search);
  if (params.get("peerland") === "1") return "peerland";
  if (params.get("demo") === "1") return "demo";
  const peerlandHits = state.transactions.filter((t) =>
    String(t.source || "").includes("peerland")
  ).length;
  if (peerlandHits > state.transactions.length / 2) return "peerland";
  return state.projectSource || "";
}

async function reloadProjectFresh() {
  if (!requireLogin()) return;
  const source = detectProjectSource() || "peerland";
  const label =
    source === "demo"
      ? "ตัวอย่างสั้น"
      : source === "peerland"
        ? "Peerland 2024–2025"
        : "โปรเจกต์นี้";
  const ok = window.confirm(
    `เคลียร์แท็ก / Note / กฎ แล้วอ่านไฟล์ “${label}” ใหม่ทั้งหมด?\n\nกดเลิกทำได้ถ้าเพิ่งกดพลาด`
  );
  if (!ok) return;
  const before = cloneStateSlice();
  try {
    if (source === "demo") await startDemo({ replace: true, fresh: true, recordUndo: false });
    else await startPeerland({ replace: true, fresh: true, recordUndo: false });
    pushUndo(`เคลียร์อ่านใหม่ (${label})`, before);
    toast(`อ่าน “${label}” ใหม่แล้ว · กดเลิกทำได้`);
  } catch (err) {
    applyStateSlice(before);
    schedulePersist();
    scheduleRender();
    toast(err.message || "อ่านไฟล์ใหม่ไม่สำเร็จ");
  }
}

async function importFiles(fileList) {
  if (!requireLogin("ต้องเข้าสู่ระบบก่อนจึงจะนำเข้าไฟล์ได้")) return;
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;
  toast(`กำลังอ่าน ${files.length} ไฟล์…`);
  let imported = [];
  for (const file of files) {
    try {
      imported = imported.concat(await parseFile(file));
    } catch (err) {
      console.error(err);
      toast(`${file.name}: ${err.message || "อ่านไม่สำเร็จ"}`);
    }
  }
  imported = dedupeTransactions(imported);
  if (!imported.length) {
    toast("ไม่พบรายการในไฟล์");
    return;
  }
  withUndo(`นำเข้า ${imported.length.toLocaleString("th-TH")} รายการ`, () => {
    state.transactions = dedupeTransactions([...imported, ...state.transactions]);
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
    if (!state.projectSource) state.projectSource = "import";
  });
  schedulePersist();
  renderTable();
  toast(`นำเข้า ${imported.length.toLocaleString("th-TH")} รายการ`);
}

async function startDemo({ replace = true, fresh = false, recordUndo = true } = {}) {
  if (!requireLogin()) return;
  const res = await fetch(new URL("sample-statement.csv", window.location.href));
  if (!res.ok) throw new Error("โหลดตัวอย่างไม่สำเร็จ");
  const text = await res.text();
  const run = async () => {
    if (replace || fresh) {
      state.transactions = [];
      state.rules = [];
    }
    if (fresh) state.groupNotes = {};
    state.projectSource = "demo";
    const parsed = await parseFile(new File([text], "sample-statement.csv", { type: "text/csv" }));
    state.transactions = dedupeTransactions([...parsed, ...state.transactions]);
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
  };
  if (recordUndo) {
    const before = cloneStateSlice();
    await run();
    pushUndo("โหลดตัวอย่างสั้น", before);
  } else {
    await run();
  }
  schedulePersist();
  renderTable();
  const params = new URLSearchParams(window.location.search);
  params.set("demo", "1");
  params.delete("peerland");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  toast(`โหลดตัวอย่าง ${state.transactions.length.toLocaleString("th-TH")} รายการ`);
}

async function startPeerland({ replace = true, fresh = false, recordUndo = true } = {}) {
  if (!requireLogin()) return;
  toast("กำลังโหลด Peerland…");
  const res = await fetch(new URL("data/peerland_2024-2025.json", window.location.href));
  if (!res.ok) throw new Error(`โหลด Peerland ไม่สำเร็จ (${res.status})`);
  const payload = await res.json();
  const rows = Array.isArray(payload.transactions) ? payload.transactions : [];
  if (!rows.length) throw new Error("ไม่พบรายการ Peerland");

  const run = () => {
    if (replace || fresh) {
      state.transactions = [];
      state.rules = [];
    }
    if (fresh) {
      state.groupNotes = {};
      state.categories = [...PEERLAND_CATEGORIES];
    } else {
      for (const c of PEERLAND_CATEGORIES) {
        if (!state.categories.includes(c)) state.categories.push(c);
      }
    }
    state.projectSource = "peerland";
    state.transactions = dedupeTransactions([
      ...rows.map((t) => ({
        ...t,
        category: fresh ? "" : t.category || "",
        note: fresh ? "" : t.note || "",
        source: t.source || "peerland_2024-2025_full.pdf",
      })),
      ...state.transactions,
    ]);
    state.rules = [];
    for (const rule of PEERLAND_RULES) {
      state.rules = upsertRule(state.rules, rule);
    }
    const applied = applyRules(state.transactions, state.rules);
    state.transactions = applied.transactions;
    state.rules = applied.rules;
  };

  if (recordUndo) {
    const before = cloneStateSlice();
    run();
    pushUndo(fresh ? "เคลียร์อ่าน Peerland ใหม่" : "โหลด Peerland", before);
  } else {
    run();
  }

  schedulePersist();
  renderTable();
  const params = new URLSearchParams(window.location.search);
  params.set("peerland", "1");
  params.delete("demo");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  toast(`Peerland ${rows.length.toLocaleString("th-TH")} รายการ${fresh ? " · เริ่มใหม่" : ""}`);
}

function updateAuthButton() {
  if (!els.btnAuth) return;
  if (currentUser) {
    els.btnAuth.textContent = "ออกจากระบบ";
    els.btnAuth.classList.remove("solid");
    els.btnAuth.classList.add("quiet");
    els.btnAuth.title = currentUser.email;
  } else {
    els.btnAuth.textContent = "เข้าสู่ระบบ Google";
    els.btnAuth.classList.add("solid");
    els.btnAuth.classList.remove("quiet");
    els.btnAuth.title = ALLOWED_EMAIL;
  }
}

async function runPendingLoads() {
  if (!isLoggedIn()) return;
  if (pendingPeerland || new URLSearchParams(location.search).get("peerland") === "1") {
    pendingPeerland = false;
    if (!state.transactions.length) {
      await startPeerland({ replace: true }).catch((err) => toast(err.message));
      return;
    }
  }
  if (pendingDemo || new URLSearchParams(location.search).get("demo") === "1") {
    pendingDemo = false;
    if (!state.transactions.length) {
      await startDemo({ replace: true }).catch((err) => toast(err.message));
    }
  }
}

async function setupAuth() {
  try {
    await initFirebase();
    cloudReady = true;
    watchAuth(async (user) => {
      if (user && (user.email || "").toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
        await logoutFirebase();
        currentUser = null;
        authReady = true;
        updateAuthButton();
        setSync("อนุญาตเฉพาะบัญชีเจ้าของ");
        toast(`อนุญาตเฉพาะ ${ALLOWED_EMAIL}`);
        renderTable();
        return;
      }
      currentUser = user;
      authReady = true;
      updateAuthButton();
      if (!user) {
        setSync("ต้องเข้าสู่ระบบก่อน");
        renderTable();
        return;
      }
      setSync(`เข้าสู่ระบบแล้ว · ${user.email}`);
      try {
        const remote = await pullCloudState(user.uid);
        if (remote && Array.isArray(remote.transactions) && remote.transactions.length) {
          if (!state.transactions.length || remote.transactions.length >= state.transactions.length) {
            state.transactions = remote.transactions;
            if (remote.categories?.length) state.categories = remote.categories;
            if (remote.rules?.length) state.rules = remote.rules;
            if (remote.groupNotes) state.groupNotes = remote.groupNotes;
            if (remote.projectSource) state.projectSource = remote.projectSource;
            saveState(state);
            toast("ดึงข้อมูลจาก Firebase แล้ว");
          } else {
            await pushCloudState(user.uid, state);
          }
        } else if (state.transactions.length) {
          await pushCloudState(user.uid, state);
        }
        setSync(`ซิงค์แล้ว · ${user.email}`);
      } catch (err) {
        console.warn(err);
        setSync(`ล็อกอินแล้ว · ${user.email}`);
      }
      renderTable();
      await runPendingLoads();
    });
  } catch (err) {
    console.warn(err);
    cloudReady = false;
    authReady = true;
    currentUser = null;
    setSync("ล็อกอินไม่พร้อม · ตรวจ Firebase");
    renderTable();
  }
}

function wireEvents() {
  els.fileInput?.addEventListener("change", (e) => {
    importFiles(e.target.files);
    e.target.value = "";
  });

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    importFiles(e.dataTransfer.files);
  });

  ["input", "change"].forEach((evt) => {
    els.search.addEventListener(evt, scheduleRender);
    els.dateFrom.addEventListener(evt, () => {
      syncPeriodFromDateFilters();
      scheduleRender();
    });
    els.dateTo.addEventListener(evt, () => {
      syncPeriodFromDateFilters();
      scheduleRender();
    });
    els.filterCategory.addEventListener(evt, scheduleRender);
    els.filterDirection.addEventListener(evt, scheduleRender);
  });

  els.periodChips?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-period]");
    if (!chip) return;
    applyPeriodMode(chip.getAttribute("data-period"));
  });

  els.btnPrintOverview?.addEventListener("click", printOverview);

  els.btnClearSearch?.addEventListener("click", () => {
    els.search.value = "";
    scheduleRender();
    els.search.focus();
  });

  els.addGroupForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!requireLogin()) return;
    const name = (els.newGroupName.value || "").trim();
    if (!name) return;
    if (state.categories.includes(name)) {
      toast("มีกลุ่มนี้อยู่แล้ว");
      els.newGroupName.value = "";
      return;
    }
    withUndo(`เพิ่มกลุ่ม “${name}”`, () => {
      state.categories.unshift(name);
    });
    schedulePersist();
    refreshCategoryOptions();
    els.newGroupName.value = "";
    renderGroupSummary();
    toast(`เพิ่มกลุ่ม “${name}” แล้ว`);
  });

  els.txBody.addEventListener("focusin", (e) => {
    const note = e.target.closest("[data-note]");
    const cat = e.target.closest("[data-cat]");
    if (note) rememberField(note);
    if (cat) rememberField(cat);
  });

  els.txBody.addEventListener("input", (e) => {
    const note = e.target.closest("[data-note]");
    if (note) {
      patchTx(note.getAttribute("data-note"), { note: note.value }, { recordUndo: false });
      return;
    }
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      cat.classList.toggle("has-value", Boolean(cat.value.trim()));
      patchTx(cat.getAttribute("data-cat"), { category: cat.value.trim() }, { recordUndo: false });
    }
  });

  els.txBody.addEventListener("change", (e) => {
    const check = e.target.closest("[data-check]");
    if (check) {
      const id = check.getAttribute("data-check");
      if (check.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      if (els.bulkCount) els.bulkCount.textContent = `เลือก ${selectedIds.size.toLocaleString("th-TH")}`;
      return;
    }
    const note = e.target.closest("[data-note]");
    if (note) {
      const id = note.getAttribute("data-note");
      const beforeVal = fieldBefore.get(note);
      fieldBefore.delete(note);
      if (beforeVal !== undefined && beforeVal !== note.value) {
        const before = cloneStateSlice();
        const tx = before.transactions.find((t) => t.id === id);
        if (tx) tx.note = beforeVal;
        pushUndo("แก้ Note", before);
        updateUndoButton();
      }
      return;
    }
    const cat = e.target.closest("[data-cat]");
    if (!cat) return;
    const id = cat.getAttribute("data-cat");
    const value = cat.value.trim();
    const beforeVal = fieldBefore.has(cat) ? fieldBefore.get(cat) : null;
    fieldBefore.delete(cat);
    const before = cloneStateSlice();
    if (beforeVal !== null) {
      const tx = before.transactions.find((t) => t.id === id);
      if (tx) tx.category = beforeVal;
    }
    patchTx(id, { category: value }, { learn: Boolean(value), recordUndo: false });
    if (beforeVal !== value) pushUndo("ใส่กลุ่ม", before);
    scheduleRender();
  });

  els.groupList?.addEventListener("click", (e) => {
    const sortBtn = e.target.closest("[data-group-sort]");
    if (sortBtn) {
      const key = sortBtn.getAttribute("data-group-sort");
      if (groupSort.key === key) groupSort.dir = groupSort.dir === "asc" ? "desc" : "asc";
      else {
        groupSort.key = key;
        groupSort.dir = key === "name" || key === "note" ? "asc" : "desc";
      }
      renderGroupSummary();
      return;
    }
    const renameBtn = e.target.closest("[data-rename-group]");
    if (renameBtn) {
      beginRenameGroup(renameBtn.getAttribute("data-rename-group"));
      return;
    }
    if (e.target.closest("[data-group-note]") || e.target.closest("[data-rename-form]")) return;
    const filterBtn = e.target.closest("[data-filter-group]");
    if (filterBtn) {
      els.filterCategory.value = filterBtn.getAttribute("data-filter-group");
      scheduleRender();
      return;
    }
    const printBtn = e.target.closest("[data-print-group]");
    if (printBtn) {
      printGroup(printBtn.getAttribute("data-print-group"));
      return;
    }
    const exportBtn = e.target.closest("[data-export-group]");
    if (exportBtn) exportGroup(exportBtn.getAttribute("data-export-group"));
  });

  els.groupList?.addEventListener("focusin", (e) => {
    const note = e.target.closest("[data-group-note]");
    if (note) rememberField(note);
  });

  els.groupList?.addEventListener("input", (e) => {
    const note = e.target.closest("[data-group-note]");
    if (!note) return;
    const key = note.getAttribute("data-group-note");
    state.groupNotes[key] = note.value;
    schedulePersist();
  });

  els.groupList?.addEventListener("change", (e) => {
    const note = e.target.closest("[data-group-note]");
    if (!note) return;
    const key = note.getAttribute("data-group-note");
    const beforeVal = fieldBefore.get(note);
    fieldBefore.delete(note);
    if (beforeVal === undefined || beforeVal === note.value) return;
    const before = cloneStateSlice();
    before.groupNotes[key] = beforeVal;
    pushUndo("แก้ Note กลุ่ม", before);
  });

  document.querySelectorAll(".th-sort").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-sort");
      if (tableSort.key === key) tableSort.dir = tableSort.dir === "asc" ? "desc" : "asc";
      else {
        tableSort.key = key;
        tableSort.dir = key === "desc" || key === "group" || key === "note" ? "asc" : "desc";
      }
      scheduleRender();
    });
  });

  els.checkAll?.addEventListener("change", () => {
    const visible = getFiltered().slice(0, 500);
    if (els.checkAll.checked) visible.forEach((t) => selectedIds.add(t.id));
    else visible.forEach((t) => selectedIds.delete(t.id));
    scheduleRender();
  });

  els.btnBulkApply?.addEventListener("click", applyBulk);
  els.btnBulkClear?.addEventListener("click", () => {
    selectedIds.clear();
    scheduleRender();
  });
  els.btnUndo?.addEventListener("click", undoLast);
  els.btnReloadProject?.addEventListener("click", () => {
    reloadProjectFresh().catch((err) => toast(err.message || "อ่านใหม่ไม่สำเร็จ"));
  });

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "z" && !e.shiftKey) {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      e.preventDefault();
      undoLast();
    }
  });

  els.btnExport?.addEventListener("click", () => {
    if (!requireLogin()) return;
    const rows = getFiltered();
    if (!rows.length) {
      toast("ยังไม่มีข้อมูลให้ Export");
      return;
    }
    exportWorkbook(rows, { groups: summarizeByGroup(getSummaryBase()) });
    toast(`Export XLSX · ${rows.length.toLocaleString("th-TH")} รายการ`);
  });

  async function handleAuthClick() {
    try {
      if (currentUser) {
        await logoutFirebase();
        toast("ออกจากระบบแล้ว");
        return;
      }
      const user = await loginWithGoogle();
      if (user) toast("เข้าสู่ระบบแล้ว · จำการล็อกอินไว้ในเครื่องนี้");
      else toast("กำลังเปิดหน้าล็อกอิน Google…");
    } catch (err) {
      console.error(err);
      toast(err.message || "ล็อกอินไม่สำเร็จ");
    }
  }

  els.btnAuth?.addEventListener("click", handleAuthClick);
  els.btnAuthHero?.addEventListener("click", handleAuthClick);
  els.btnPeerland?.addEventListener("click", () => startPeerland({ replace: true }).catch((err) => toast(err.message)));
  els.btnPeerlandHero?.addEventListener("click", () => startPeerland({ replace: true }).catch((err) => toast(err.message)));
  els.btnDemo?.addEventListener("click", () => startDemo({ replace: true }).catch((err) => toast(err.message)));
}

wireEvents();
updateUndoButton();
renderTable();
setupAuth();

{
  const params = new URLSearchParams(window.location.search);
  if (params.get("peerland") === "1" || location.hash === "#peerland") pendingPeerland = true;
  else if (params.get("demo") === "1" || location.hash === "#demo") pendingDemo = true;
}
