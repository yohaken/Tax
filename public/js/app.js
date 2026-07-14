import { parseFile, dedupeTransactions } from "./parser.js";
import {
  loadState,
  saveState,
  loadWorkspace,
  emptyProjectFields,
  defaultCategories,
  makeProjectId,
  extractKeywords,
  upsertRule,
  applyRules,
  previewApplyRules,
  isReservedCategoryName,
  smartSearch,
  filterByAmountRanges,
  parseAmountBound,
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
import { buildLabel } from "./build.js";
import {
  PEERLAND_CATEGORIES,
  PEERLAND_PHASE1234_RULES,
  PEERLAND_PHASE_META,
  buildPeerlandPhase1234Rules,
  applyPeerlandPhasesAll,
  applyPeerlandPhase5Heuristics,
} from "./peerland-phases.js";

const workspace = loadWorkspace();
const state = loadState();
if (!state.groupNotes) state.groupNotes = {};
if (!state.groupNicknames) state.groupNicknames = {};
if (!state.projectSource) state.projectSource = "";
if (!state.projectName) state.projectName = "โปรเจกต์";
if (!state.fileName) state.fileName = "";
if (!state.projectId) state.projectId = workspace.activeId;

let currentUser = null;
let cloudReady = false;
let authReady = false;
let persistTimer = null;
let searchTimer = null;
let rendering = false;
let pendingRender = false;
let pendingDemo = false;
const selectedIds = new Set();
const selectedGroupKeys = new Set();
/** Existing group key chosen as merge destination (click row / “รวมเข้าที่นี่”). */
let mergeTargetKey = "";
/** @type {{ mode: "on" | "off", active: boolean, touched: Set<string> } | null} */
let rowDrag = null;
let tableSort = { key: "date", dir: "desc" };
let groupSort = { key: "abs", dir: "desc" };
let periodMode = "all"; // all | year:YYYY | custom
let syncingPeriod = false;
const undoStack = [];
const MAX_UNDO = 40;
const fieldBefore = new WeakMap();

const els = {
  loginGate: document.getElementById("login-gate"),
  empty: document.getElementById("empty-state"),
  workspace: document.getElementById("workspace"),
  authTools: document.getElementById("auth-tools"),
  fileInput: document.getElementById("file-input"),
  search: document.getElementById("search-input"),
  btnClearSearch: document.getElementById("btn-clear-search"),
  tableSearch: document.getElementById("table-search-input"),
  btnClearTableSearch: document.getElementById("btn-clear-table-search"),
  tableSearchHint: document.getElementById("table-search-hint"),
  amtInMin: document.getElementById("amt-in-min"),
  amtInMax: document.getElementById("amt-in-max"),
  amtOutMin: document.getElementById("amt-out-min"),
  amtOutMax: document.getElementById("amt-out-max"),
  amtValMin: document.getElementById("amt-val-min"),
  amtValMax: document.getElementById("amt-val-max"),
  btnClearAmountFilters: document.getElementById("btn-clear-amount-filters"),
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
  btnClearBulkGroup: document.getElementById("btn-clear-bulk-group"),
  btnClearBulkNote: document.getElementById("btn-clear-bulk-note"),
  btnBulkApply: document.getElementById("btn-bulk-apply"),
  btnBulkClear: document.getElementById("btn-bulk-clear"),
  btnClearTableZone: document.getElementById("btn-clear-table-zone"),
  btnExport: document.getElementById("btn-export"),
  btnUndo: document.getElementById("btn-undo"),
  btnReloadProject: document.getElementById("btn-reload-project"),
  btnSplitMerged: document.getElementById("btn-split-merged"),
  btnDeleteProject: document.getElementById("btn-delete-project"),
  btnRenameProject: document.getElementById("btn-rename-project"),
  btnOpenTelltea: document.getElementById("btn-open-telltea"),
  btnOpenPeerland: document.getElementById("btn-open-peerland"),
  btnPeerlandPhases: document.getElementById("btn-peerland-phases"),
  groupMergeBar: document.getElementById("group-merge-bar"),
  groupMergeCount: document.getElementById("group-merge-count"),
  groupMergeName: document.getElementById("group-merge-name"),
  groupMergeTargetLabel: document.getElementById("group-merge-target-label"),
  btnGroupMerge: document.getElementById("btn-group-merge"),
  btnGroupMergeClear: document.getElementById("btn-group-merge-clear"),
  btnGroupMergeClearTarget: document.getElementById("btn-group-merge-clear-target"),
  btnGroupSelectAll: document.getElementById("btn-group-select-all"),
  projectNameLabel: document.getElementById("project-name-label"),
  projectSelect: document.getElementById("project-select"),
  btnAuth: document.getElementById("btn-auth"),
  btnAuthHero: document.getElementById("btn-auth-hero"),
  btnDemo: document.getElementById("btn-demo"),
  fileInputHero: document.getElementById("file-input-hero"),
  projectFileHint: document.getElementById("project-file-hint"),
  syncStatus: document.getElementById("sync-status"),
  buildStamp: document.getElementById("build-stamp"),
  loginBuild: document.getElementById("login-build"),
  emptyBuild: document.getElementById("empty-build"),
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

function paintBuildStamp() {
  const label = buildLabel();
  document.title = `TaxTag ${label}`;
  for (const el of [els.buildStamp, els.loginBuild, els.emptyBuild]) {
    if (el) el.textContent = label;
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function printMoney(n) {
  return formatMoney(n, { currency: false });
}

function syncActiveFromState() {
  const active = workspace.projects.find((p) => p.id === workspace.activeId);
  if (!active) return;
  active.transactions = state.transactions;
  active.categories = state.categories;
  active.rules = state.rules;
  active.groupNotes = state.groupNotes || {};
  active.groupNicknames = state.groupNicknames || {};
  active.projectSource = state.projectSource || "";
  active.source = state.projectSource || active.source || "local";
  active.fileName = state.fileName || active.fileName || "";
  active.name = state.projectName || active.name;
  active.updatedAt = new Date().toISOString();
}

function applyProjectToState(project) {
  state.transactions = Array.isArray(project.transactions) ? project.transactions : [];
  state.categories = Array.isArray(project.categories) ? [...project.categories] : [];
  state.rules = Array.isArray(project.rules) ? project.rules : [];
  state.groupNotes = project.groupNotes && typeof project.groupNotes === "object" ? { ...project.groupNotes } : {};
  state.groupNicknames =
    project.groupNicknames && typeof project.groupNicknames === "object" ? { ...project.groupNicknames } : {};
  state.projectSource = project.projectSource || project.source || "";
  state.projectId = project.id;
  state.projectName = project.name || "โปรเจกต์";
  state.fileName = project.fileName || "";
  workspace.activeId = project.id;
  paintProjectNickUi();
}

function fileStem(name) {
  return String(name || "").replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "").trim() || "ไฟล์นำเข้า";
}

function paintProjectNickUi() {
  if (els.projectNameLabel) els.projectNameLabel.textContent = state.projectName || "—";
  if (els.projectFileHint) {
    els.projectFileHint.textContent = state.fileName ? `ไฟล์: ${state.fileName}` : "ไฟล์: —";
  }
  if (els.btnPeerlandPhases) {
    els.btnPeerlandPhases.hidden = !isPeerlandProject();
  }
}

function isPeerlandProject() {
  const blob = `${state.fileName || ""} ${state.projectName || ""}`;
  return /peerland/i.test(blob);
}

function displayGroupName(g) {
  const nick = (state.groupNicknames?.[g.key] || "").trim();
  if (nick) return nick;
  return g.name;
}

function clearSessionUi() {
  undoStack.length = 0;
  updateUndoButton();
  selectedIds.clear();
  selectedGroupKeys.clear();
  mergeTargetKey = "";
  periodMode = "all";
  if (els.dateFrom) els.dateFrom.value = "";
  if (els.dateTo) els.dateTo.value = "";
  if (els.search) els.search.value = "";
  if (els.tableSearch) els.tableSearch.value = "";
  clearAmountFilterInputs();
  if (els.filterCategory) els.filterCategory.value = "";
  if (els.filterDirection) els.filterDirection.value = "";
  if (els.groupMergeName) {
    els.groupMergeName.value = "";
    els.groupMergeName.readOnly = false;
  }
  updateGroupMergeBar();
}

function renderProjectSelect() {
  if (!els.projectSelect) return;
  const options = workspace.projects
    .map((p) => {
      const count = Array.isArray(p.transactions) ? p.transactions.length : 0;
      const label = `${p.name} (${count.toLocaleString("th-TH")})`;
      return `<option value="${escapeHtml(p.id)}"${p.id === workspace.activeId ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
  els.projectSelect.innerHTML = options || `<option value="">ไม่มีโปรเจกต์</option>`;
}

function switchProject(projectId) {
  if (!projectId || projectId === workspace.activeId) return;
  const next = workspace.projects.find((p) => p.id === projectId);
  if (!next) return;
  syncActiveFromState();
  applyProjectToState(next);
  clearSessionUi();
  schedulePersist();
  renderProjectSelect();
  scheduleRender();
  toast(`เปิดโปรเจกต์ “${next.name}”`);
}

function createProjectFromRows({
  name,
  source,
  rows,
  categories,
  rules = [],
  groupNotes = {},
  groupNicknames = {},
  fileName = "",
  activate = true,
}) {
  syncActiveFromState();
  const resolvedFile = fileName || "";
  const project = {
    id: makeProjectId(),
    name: String(name || fileStem(resolvedFile) || "โปรเจกต์ใหม่").slice(0, 80),
    source: source || "import",
    fileName: resolvedFile,
    updatedAt: new Date().toISOString(),
    ...emptyProjectFields({
      transactions: rows,
      categories: Array.isArray(categories) ? categories : [],
      rules,
      groupNotes,
      groupNicknames,
      projectSource: source || "import",
      fileName: resolvedFile,
    }),
  };
  workspace.projects = workspace.projects.filter(
    (p) =>
      !(
        Array.isArray(p.transactions) &&
        p.transactions.length === 0 &&
        (p.name === "โปรเจกต์ว่าง" || p.source === "local")
      )
  );
  workspace.projects.unshift(project);
  if (activate) {
    applyProjectToState(project);
    clearSessionUi();
  }
  return project;
}

function sourceGroupKey(source) {
  const s = String(source || "").trim();
  if (!s) return "__unknown__";
  // Strip sheet suffix "file.xlsx · Sheet1" → file.xlsx for grouping by filename
  return s.split(" · ")[0].trim() || s;
}

function projectNameFromSourceKey(key) {
  if (key === "__unknown__") return "ไฟล์นำเข้า (ไม่ทราบชื่อ)";
  return fileStem(key);
}

/** Split a project that mixed multiple source files into separate projects by filename. */
function splitProjectBySources(project) {
  const rows = Array.isArray(project.transactions) ? project.transactions : [];
  const groups = new Map();
  for (const t of rows) {
    const key = sourceGroupKey(t.source);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  if (groups.size <= 1) return [];

  // Keep the largest file group in the current project; extract the rest.
  const keepKey = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];

  const created = [];
  for (const [key, list] of groups) {
    if (key === keepKey) continue;
    if (!list.length) continue;
    const fileName = key === "__unknown__" ? "" : key;
    const name = projectNameFromSourceKey(key);
    const exists = workspace.projects.some(
      (p) =>
        p.id !== project.id &&
        (p.fileName === fileName || p.name === name) &&
        Array.isArray(p.transactions) &&
        p.transactions.length === list.length
    );
    if (exists) continue;
    const np = createProjectFromRows({
      name,
      source: "import",
      fileName,
      rows: list.map((t) => ({ ...t })),
      categories: [],
      rules: [],
      groupNotes: {},
      groupNicknames: {},
      activate: false,
    });
    created.push(np);
  }

  const keepRows = groups.get(keepKey) || [];
  project.transactions = keepRows;
  project.fileName = keepKey === "__unknown__" ? project.fileName || "" : keepKey;
  if (!project.name || /peerland/i.test(project.name)) {
    project.name = projectNameFromSourceKey(keepKey);
  }
  project.source = "import";
  project.projectSource = "import";
  project.updatedAt = new Date().toISOString();
  return created;
}

function normalizeLegacyProjectNames() {
  let changed = false;
  for (const p of workspace.projects) {
    if (p.source === "peerland" || /^peerland/i.test(p.name || "") || /^Peerland/i.test(p.name || "")) {
      if (!p.fileName) p.fileName = "peerland_2024-2025.json";
      p.name = fileStem(p.fileName);
      p.source = "import";
      p.projectSource = "import";
      changed = true;
    }
  }
  if (changed) {
    const active = workspace.projects.find((x) => x.id === workspace.activeId);
    if (active) applyProjectToState(active);
  }
  return changed;
}

function recoverMergedImports({ silent = false } = {}) {
  syncActiveFromState();
  normalizeLegacyProjectNames();
  const created = [];
  for (const project of [...workspace.projects]) {
    created.push(...splitProjectBySources(project));
  }
  const active = workspace.projects.find((p) => p.id === workspace.activeId) || workspace.projects[0];
  if (active) applyProjectToState(active);
  schedulePersist();
  renderProjectSelect();
  scheduleRender();
  if (!created.length) {
    if (!silent) toast("ไม่พบไฟล์ที่ถูกรวมในโปรเจกต์");
    return [];
  }
  toast(
    `แยก ${created.length.toLocaleString("th-TH")} โปรเจกต์จากไฟล์ที่รวมผิด · ${created
      .map((p) => p.name)
      .join(" · ")}`
  );
  return created;
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
    groupNicknames: { ...(state.groupNicknames || {}) },
    projectSource: state.projectSource || "",
    projectName: state.projectName || "",
    projectId: state.projectId || "",
    fileName: state.fileName || "",
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
  state.groupNicknames = { ...(slice.groupNicknames || {}) };
  state.projectSource = slice.projectSource || "";
  if (slice.projectName) state.projectName = slice.projectName;
  if (slice.projectId) state.projectId = slice.projectId;
  if (slice.fileName != null) state.fileName = slice.fileName;
  paintProjectNickUi();
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

let persistGen = 0;

function schedulePersist({ cloud = true, immediate = false } = {}) {
  saveState(state, workspace);
  setSync(currentUser ? "บันทึกในเครื่องแล้ว · กำลังซิงค์…" : "บันทึกอัตโนมัติ");
  clearTimeout(persistTimer);
  const gen = ++persistGen;
  const run = async () => {
    if (!cloud || !currentUser || !cloudReady) {
      if (gen === persistGen) {
        setSync(currentUser ? `ออนไลน์ · ${currentUser.email}` : "บันทึกอัตโนมัติในเครื่อง");
      }
      return;
    }
    try {
      await pushCloudState(currentUser.uid, state, workspace);
      if (gen === persistGen) setSync(`ซิงค์แล้ว · ${currentUser.email}`);
    } catch (err) {
      console.warn(err);
      if (gen === persistGen) setSync("บันทึกในเครื่องแล้ว (คลาวด์ยังไม่พร้อม)");
    }
  };
  // Group moves / renames: flush local+cloud promptly so UI doesn’t feel “ไม่ได้ย้าย”
  if (immediate) {
    persistTimer = setTimeout(run, 0);
  } else {
    persistTimer = setTimeout(run, 450);
  }
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
  if (cat === "__uncat") list = list.filter((t) => !String(t.category || "").trim());
  else if (cat) list = list.filter((t) => t.category === cat);
  const dir = els.filterDirection.value;
  if (dir) list = list.filter((t) => t.direction === dir);
  const searched = smartSearch(list, els.search.value).map((r) => r.item);
  return sortTransactions(searched);
}

/** Detail table only: smart-search + amount-range layer on top of getFiltered(). */
function readAmountRangesFromUi() {
  return {
    inMin: parseAmountBound(els.amtInMin?.value),
    inMax: parseAmountBound(els.amtInMax?.value),
    outMin: parseAmountBound(els.amtOutMin?.value),
    outMax: parseAmountBound(els.amtOutMax?.value),
    valMin: parseAmountBound(els.amtValMin?.value),
    valMax: parseAmountBound(els.amtValMax?.value),
  };
}

function hasAmountRangeFilter(ranges = readAmountRangesFromUi()) {
  return (
    ranges.inMin != null ||
    ranges.inMax != null ||
    ranges.outMin != null ||
    ranges.outMax != null ||
    ranges.valMin != null ||
    ranges.valMax != null
  );
}

function clearAmountFilterInputs() {
  for (const el of [
    els.amtInMin,
    els.amtInMax,
    els.amtOutMin,
    els.amtOutMax,
    els.amtValMin,
    els.amtValMax,
  ]) {
    if (el) el.value = "";
  }
}

function clearTableZoneFilters({ focus = "search" } = {}) {
  if (els.tableSearch) els.tableSearch.value = "";
  clearAmountFilterInputs();
  if (els.bulkGroup) els.bulkGroup.value = "";
  if (els.bulkNote) els.bulkNote.value = "";
  updateClearButtonsChrome();
  scheduleRender();
  if (focus === "group") els.bulkGroup?.focus();
  else if (focus === "note") els.bulkNote?.focus();
  else els.tableSearch?.focus();
}

function updateClearButtonsChrome() {
  const hasTableQ = Boolean(String(els.tableSearch?.value || "").trim());
  const hasAmt = hasAmountRangeFilter();
  const hasBulk =
    Boolean(String(els.bulkGroup?.value || "").trim()) ||
    Boolean(String(els.bulkNote?.value || "").trim());
  if (els.btnClearTableSearch) els.btnClearTableSearch.hidden = !hasTableQ;
  if (els.btnClearAmountFilters) els.btnClearAmountFilters.hidden = !hasAmt;
  if (els.btnClearBulkGroup) els.btnClearBulkGroup.hidden = !String(els.bulkGroup?.value || "").trim();
  if (els.btnClearBulkNote) els.btnClearBulkNote.hidden = !String(els.bulkNote?.value || "").trim();
  if (els.btnClearTableZone) els.btnClearTableZone.hidden = !(hasTableQ || hasAmt || hasBulk);
}

function getTableFiltered() {
  let list = getFiltered();
  const q = els.tableSearch?.value || "";
  if (String(q).trim()) list = smartSearch(list, q).map((r) => r.item);
  list = filterByAmountRanges(list, readAmountRangesFromUi());
  return sortTransactions(list);
}

function updateStats(visible) {
  const uncat = state.transactions.filter((t) => !t.category).length;
  const sumIn = visible.filter((t) => t.direction === "in").reduce((s, t) => s + (t.amount || 0), 0);
  const sumOut = visible.filter((t) => t.direction === "out").reduce((s, t) => s + (t.amount || 0), 0);
  els.statCount.textContent = String(state.transactions.length);
  els.statUncat.textContent = String(uncat);
  els.statIn.textContent = formatMoney(sumIn);
  els.statOut.textContent = formatMoney(sumOut);
  const tableQ = String(els.tableSearch?.value || "").trim();
  const amtOn = hasAmountRangeFilter();
  const filterCount = getFiltered().length;
  if ((tableQ || amtOn) && visible.length !== filterCount) {
    els.resultLabel.textContent = `ตาราง ${visible.length.toLocaleString("th-TH")} จากตัวกรอง ${filterCount.toLocaleString("th-TH")} · โปรเจกต์ ${state.transactions.length.toLocaleString("th-TH")} รายการ`;
  } else {
    els.resultLabel.textContent = `แสดง ${visible.length.toLocaleString("th-TH")} จาก ${state.transactions.length.toLocaleString("th-TH")} รายการ`;
  }
  if (els.bulkCount) els.bulkCount.textContent = `เลือก ${selectedIds.size.toLocaleString("th-TH")}`;
  if (els.tableSearchHint) {
    const bits = [];
    if (tableQ) bits.push(`ค้นหา “${tableQ}”`);
    if (amtOn) bits.push("กรองช่วงยอด");
    els.tableSearchHint.textContent = bits.length
      ? `${bits.join(" · ")} · ${visible.length.toLocaleString("th-TH")} แถว`
      : "กรองอีกชั้นจากตัวกรองด้านบน · ลากเมาส์ติ๊กหลายแถวได้";
  }
}

function syncRowCheckUi(id) {
  const row = [...(els.txBody?.querySelectorAll("tr[data-id]") || [])].find(
    (r) => r.getAttribute("data-id") === id
  );
  if (!row) return;
  const check = row.querySelector("[data-check]");
  const on = selectedIds.has(id);
  if (check) check.checked = on;
  row.classList.toggle("is-selected", on);
}

function updateSelectionChrome() {
  if (els.bulkCount) els.bulkCount.textContent = `เลือก ${selectedIds.size.toLocaleString("th-TH")}`;
  const visible = (() => {
    try {
      return getTableFiltered();
    } catch {
      return [];
    }
  })();
  if (els.checkAll) {
    els.checkAll.checked = visible.length > 0 && visible.every((t) => selectedIds.has(t.id));
    els.checkAll.indeterminate =
      visible.some((t) => selectedIds.has(t.id)) && !els.checkAll.checked;
  }
}

function applyRowSelect(id, mode) {
  if (!id) return;
  if (mode === "on") selectedIds.add(id);
  else selectedIds.delete(id);
  syncRowCheckUi(id);
}

function refreshCategoryOptions() {
  const current = els.filterCategory.value;
  const fromTx = [
    ...new Set(
      state.transactions
        .map((t) => String(t.category || "").trim())
        .filter((c) => c && !isReservedCategoryName(c))
    ),
  ];
  const merged = [...new Set([...(state.categories || []), ...fromTx])];
  state.categories = merged;
  // Keep the active filter option even if the group was emptied / merged away,
  // so the view does not jump to another group after a move.
  const keepCurrent =
    current &&
    current !== "__uncat" &&
    !isReservedCategoryName(current) &&
    !merged.includes(current);
  const options = keepCurrent ? [...merged, current] : merged;
  els.categoryDatalist.innerHTML = merged
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
  els.filterCategory.innerHTML =
    `<option value="">ทุกกลุ่ม</option><option value="__uncat">ยังไม่มีกลุ่ม</option>` +
    options.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
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

function listMergeableGroupKeys() {
  const base = getSummaryBase();
  const fromTx = summarizeByGroup(base)
    .map((g) => g.key)
    .filter((k) => k && k !== "__uncat");
  const emptyCats = (state.categories || []).filter((c) => c && !isReservedCategoryName(c));
  return [...new Set([...fromTx, ...emptyCats])];
}

function getMergeSources() {
  return [...selectedGroupKeys].filter((k) => k && k !== "__uncat");
}

function getMergeDestination() {
  if (mergeTargetKey && !isReservedCategoryName(mergeTargetKey)) return mergeTargetKey;
  return String(els.groupMergeName?.value || "").trim();
}

function getMergeMovingKeys(sources, dest) {
  return sources.filter((k) => k !== dest);
}

function canMergeGroups() {
  const sources = getMergeSources();
  const dest = getMergeDestination();
  if (!dest || isReservedCategoryName(dest)) return false;
  return getMergeMovingKeys(sources, dest).length >= 1;
}

function setMergeTarget(key) {
  if (!key || key === "__uncat" || isReservedCategoryName(key)) {
    toast("เลือกกลุ่มปลายทางไม่ได้");
    return;
  }
  mergeTargetKey = key;
  if (els.groupMergeName) {
    els.groupMergeName.value = key;
    els.groupMergeName.readOnly = true;
  }
  updateGroupMergeBar();
  renderGroupSummary();
  toast(`ปลายทาง: รวมเข้า “${key}”`);
}

function clearMergeTarget({ keepName = false } = {}) {
  mergeTargetKey = "";
  if (els.groupMergeName) {
    els.groupMergeName.readOnly = false;
    if (!keepName) els.groupMergeName.value = "";
  }
  updateGroupMergeBar();
}

function selectAllMergeableGroups() {
  const keys = listMergeableGroupKeys();
  keys.forEach((k) => selectedGroupKeys.add(k));
  updateGroupMergeBar();
  renderGroupSummary();
  toast(`เลือกแล้ว ${keys.length.toLocaleString("th-TH")} กลุ่ม`);
}

function updateGroupMergeBar() {
  const sources = getMergeSources();
  const n = sources.length;
  const dest = getMergeDestination();
  const moving = dest ? getMergeMovingKeys(sources, dest) : sources;

  if (els.groupMergeCount) {
    els.groupMergeCount.textContent =
      n === 0
        ? "ยังไม่ได้ติ๊กกลุ่มต้นทาง"
        : `ต้นทาง ${n.toLocaleString("th-TH")} กลุ่ม` +
          (dest ? ` · จะย้าย ${moving.length.toLocaleString("th-TH")}` : "");
  }
  if (els.groupMergeTargetLabel) {
    if (mergeTargetKey) {
      els.groupMergeTargetLabel.hidden = false;
      els.groupMergeTargetLabel.innerHTML = `ปลายทาง: <strong>${escapeHtml(mergeTargetKey)}</strong>`;
    } else {
      els.groupMergeTargetLabel.hidden = true;
      els.groupMergeTargetLabel.textContent = "";
    }
  }
  if (els.btnGroupMergeClearTarget) {
    els.btnGroupMergeClearTarget.hidden = !mergeTargetKey;
  }
  if (els.groupMergeName) {
    els.groupMergeName.readOnly = Boolean(mergeTargetKey);
    els.groupMergeName.placeholder = mergeTargetKey
      ? "ใช้กลุ่มปลายทางที่คลิกแล้ว"
      : "พิมพ์ชื่อกลุ่มใหม่ หรือคลิก “รวมเข้าที่นี่” ที่แถวปลายทาง";
  }
  // Keep bar visible whenever workspace has groups so select-all is reachable
  if (els.groupMergeBar) {
    const hasGroups = listMergeableGroupKeys().length > 0 && state.transactions.length > 0;
    els.groupMergeBar.hidden = !hasGroups;
  }
  if (els.btnGroupMerge) {
    els.btnGroupMerge.disabled = !canMergeGroups();
  }
  if (els.btnGroupSelectAll) {
    const allKeys = listMergeableGroupKeys();
    const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedGroupKeys.has(k));
    els.btnGroupSelectAll.textContent = allSelected ? "ติ๊กออกทั้งหมด" : "เลือกทุกกลุ่ม";
    els.btnGroupSelectAll.dataset.mode = allSelected ? "clear" : "all";
  }
}

function mergeSelectedGroups() {
  if (!requireLogin()) return;
  const sources = getMergeSources();
  const dest = getMergeDestination();
  if (!dest) {
    toast("เลือกปลายทาง: คลิก “รวมเข้าที่นี่” หรือพิมพ์ชื่อกลุ่มใหม่");
    els.groupMergeName?.focus();
    return;
  }
  if (isReservedCategoryName(dest)) {
    toast("ใช้ชื่อกลุ่มนี้ไม่ได้");
    return;
  }
  const moving = getMergeMovingKeys(sources, dest);
  if (!moving.length) {
    toast("ติ๊กกลุ่มต้นทางอย่างน้อย 1 กลุ่ม (คนละกลุ่มกับปลายทาง)");
    return;
  }

  // Destination may be an existing group that was NOT ticked — that is intentional.
  const allKeys = [...new Set([...moving, dest])];
  const counts = moving.map((k) => state.transactions.filter((t) => t.category === k).length);
  const destCount = state.transactions.filter((t) => t.category === dest).length;
  const totalMove = counts.reduce((s, n) => s + n, 0);
  const intoExisting = state.categories.includes(dest) || destCount > 0 || Boolean(mergeTargetKey);

  const ok = window.confirm(
    `ย้าย ${moving.length.toLocaleString("th-TH")} กลุ่ม → “${dest}”` +
      (intoExisting ? " (กลุ่มที่มีอยู่)" : " (ชื่อใหม่)") +
      `?\n\n` +
      moving.map((k, i) => `· ${k} (${counts[i].toLocaleString("th-TH")})`).join("\n") +
      `\n\nปลายทาง “${dest}” ตอนนี้ ${destCount.toLocaleString("th-TH")} รายการ` +
      `\nจะได้รวม ${ (destCount + totalMove).toLocaleString("th-TH") } รายการ · กดเลิกทำได้`
  );
  if (!ok) return;

  withUndo(`รวมกลุ่มเข้า “${dest}”`, () => {
    for (const t of state.transactions) {
      if (moving.includes(t.category)) t.category = dest;
    }
    for (const r of state.rules) {
      if (moving.includes(r.category)) r.category = dest;
    }
    const noteParts = allKeys
      .map((k) => String(state.groupNotes?.[k] || "").trim())
      .filter(Boolean);
    if (noteParts.length) {
      state.groupNotes[dest] = [...new Set(noteParts)].join(" · ");
    }
    for (const k of moving) {
      delete state.groupNotes[k];
      if (state.groupNicknames) delete state.groupNicknames[k];
    }
    state.categories = [
      dest,
      ...state.categories.filter((c) => c !== dest && !moving.includes(c)),
    ];
    // Stay on the currently filtered group — do not jump focus to destination.
  });
  selectedGroupKeys.clear();
  clearMergeTarget();
  updateGroupMergeBar();
  schedulePersist({ immediate: true });
  scheduleRender();
  const still = els.filterCategory?.value || "";
  toast(
    still && still !== dest
      ? `รวมเข้า “${dest}” แล้ว · ย้าย ${totalMove.toLocaleString("th-TH")} รายการ · ยังดู “${still}” อยู่`
      : `รวมเข้า “${dest}” แล้ว · ย้าย ${totalMove.toLocaleString("th-TH")} รายการ`
  );
}

function renderGroupSummary() {
  if (!els.groupList) return;
  // Don't wipe an open rename form mid-edit
  if (els.groupList.querySelector("[data-rename-form]")) {
    renderPeriodChips();
    updateGroupMergeBar();
    return;
  }
  renderPeriodChips();
  const base = getSummaryBase();
  updatePeriodRangeLabel(base);
  const groups = sortGroups(summarizeByGroup(base));
  const active = els.filterCategory.value || "";

  if (!groups.length) {
    els.groupList.innerHTML = `<div class="group-meta">ยังไม่มีรายการให้สรุปในช่วงนี้</div>`;
    updateGroupMergeBar();
    return;
  }

  const totals = groupTotals(groups);
  const head = `
    <thead>
      <tr>
        <th class="col-check">
          <input type="checkbox" id="group-check-all" title="เลือก/ติ๊กออกทุกกลุ่ม" ${
            (() => {
              const keys = listMergeableGroupKeys();
              return keys.length && keys.every((k) => selectedGroupKeys.has(k)) ? "checked" : "";
            })()
          } />
        </th>
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
      const canMerge = g.key !== "__uncat";
      const checked = canMerge && selectedGroupKeys.has(g.key) ? "checked" : "";
      const isTarget = canMerge && mergeTargetKey === g.key;
      const rowClass = [
        isActive ? "is-active" : "",
        selectedGroupKeys.has(g.key) ? "is-merge-picked" : "",
        isTarget ? "is-merge-target" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<tr class="${rowClass}" data-group="${escapeHtml(g.key)}">
        <td class="col-check">${
          canMerge
            ? `<input type="checkbox" data-group-check="${escapeHtml(g.key)}" ${checked} title="ติ๊กเป็นต้นทางที่จะย้าย" />`
            : ""
        }</td>
        <td>
          <div class="group-title-row">
            <button type="button" class="group-title-btn" data-filter-group="${escapeHtml(g.key)}" title="${escapeHtml(g.name)}">${escapeHtml(displayGroupName(g))}${isTarget ? " · ปลายทาง" : ""}</button>
            ${
              g.key === "__uncat"
                ? ""
                : `<button type="button" class="btn quiet tiny" data-rename-group="${escapeHtml(g.key)}" title="เปลี่ยนชื่อกลุ่มในรายการ">เปลี่ยนชื่อ</button>`
            }
            ${
              canMerge
                ? `<button type="button" class="btn ${isTarget ? "solid" : "quiet"} tiny" data-merge-target="${escapeHtml(g.key)}" title="ตั้งเป็นกลุ่มปลายทางที่ต้องการรวมเข้า">${isTarget ? "ปลายทาง✓" : "รวมเข้าที่นี่"}</button>`
                : ""
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
          <button type="button" class="btn quiet tiny" data-filter-group="${escapeHtml(g.key)}" title="ดูกลุ่ม">ดู</button>
          <button type="button" class="btn quiet tiny" data-export-group="${escapeHtml(g.key)}" title="Export กลุ่มนี้">Ex</button>
          <button type="button" class="btn quiet tiny" data-print-group="${escapeHtml(g.key)}" title="พิมพ์กลุ่มนี้">พิมพ์</button>
        </td>
      </tr>`;
    })
    .join("");

  const used = new Set(groups.map((g) => g.key));
  const emptyCats = (state.categories || []).filter((c) => c && !used.has(c) && !isReservedCategoryName(c));
  const emptyBody = emptyCats
    .map((c) => {
      const checked = selectedGroupKeys.has(c) ? "checked" : "";
      const isTarget = mergeTargetKey === c;
      const rowClass = [
        "is-empty-group",
        selectedGroupKeys.has(c) ? "is-merge-picked" : "",
        isTarget ? "is-merge-target" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<tr class="${rowClass}" data-group="${escapeHtml(c)}">
        <td class="col-check"><input type="checkbox" data-group-check="${escapeHtml(c)}" ${checked} title="ติ๊กเป็นต้นทางที่จะย้าย" /></td>
        <td>
          <div class="group-title-row">
            <span class="group-title-btn muted">${escapeHtml(c)}${isTarget ? " · ปลายทาง" : ""}</span>
            <button type="button" class="btn quiet tiny" data-rename-group="${escapeHtml(c)}" title="เปลี่ยนชื่อกลุ่ม">เปลี่ยนชื่อ</button>
            <button type="button" class="btn ${isTarget ? "solid" : "quiet"} tiny" data-merge-target="${escapeHtml(c)}" title="ตั้งเป็นกลุ่มปลายทาง">${isTarget ? "ปลายทาง✓" : "รวมเข้าที่นี่"}</button>
          </div>
        </td>
        <td class="num">0</td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="muted">กลุ่มว่าง</td>
        <td class="group-actions">
          <button type="button" class="btn quiet tiny" data-delete-group="${escapeHtml(c)}" title="ลบกลุ่มว่าง">ลบ</button>
        </td>
      </tr>`;
    })
    .join("");

  const foot = `<tfoot>
    <tr class="group-total-row">
      <td></td>
      <td>รวมทั้งสิ้น (${groups.length.toLocaleString("th-TH")} กลุ่ม${emptyCats.length ? ` · ว่าง ${emptyCats.length}` : ""})</td>
      <td class="num">${totals.count.toLocaleString("th-TH")}</td>
      <td class="num amount-in">${escapeHtml(formatMoney(totals.sumIn))}</td>
      <td class="num amount-out">${escapeHtml(formatMoney(totals.sumOut))}</td>
      <td class="num">${escapeHtml(formatMoney(totals.net))}</td>
      <td colspan="2"></td>
    </tr>
  </tfoot>`;

  els.groupList.innerHTML = `<table class="group-table">${head}<tbody>${body}${emptyBody}</tbody>${foot}</table>`;

  const checkAll = els.groupList.querySelector("#group-check-all");
  checkAll?.addEventListener("change", () => {
    const keys = listMergeableGroupKeys();
    if (checkAll.checked) keys.forEach((k) => selectedGroupKeys.add(k));
    else keys.forEach((k) => selectedGroupKeys.delete(k));
    updateGroupMergeBar();
    renderGroupSummary();
  });

  updateGroupMergeBar();
}

function rowsForGroup(groupKey) {
  const base = getSummaryBase();
  if (groupKey === "__uncat") return base.filter((t) => !String(t.category || "").trim());
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
      <br/>เข้า ${escapeHtml(printMoney(sumIn))}
      · ออก ${escapeHtml(printMoney(sumOut))}
      · สุทธิ ${escapeHtml(printMoney(sumIn - sumOut))}
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
            <td class="num">${t.direction === "in" ? escapeHtml(printMoney(t.amount)) : ""}</td>
            <td class="num">${t.direction === "out" ? escapeHtml(printMoney(t.amount)) : ""}</td>
            <td>${escapeHtml(t.note || "")}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="totals">รวมเข้า ${escapeHtml(printMoney(sumIn))} · รวมออก ${escapeHtml(printMoney(sumOut))} · สุทธิ ${escapeHtml(printMoney(sumIn - sumOut))}</p>
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
      <br/>โปรเจกต์: ${escapeHtml(state.projectName || "—")}
      · ${escapeHtml(periodLabelText())}
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
              <td>${escapeHtml(displayGroupName(g))}${g.name !== displayGroupName(g) ? ` <span style="color:#666">(${escapeHtml(g.name)})</span>` : ""}</td>
              <td class="num">${g.count.toLocaleString("th-TH")}</td>
              <td class="num">${escapeHtml(printMoney(g.sumIn))}</td>
              <td class="num">${escapeHtml(printMoney(g.sumOut))}</td>
              <td class="num">${escapeHtml(printMoney(g.net))}</td>
              <td>${escapeHtml(gNote)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td><strong>รวมทั้งสิ้น (${groups.length.toLocaleString("th-TH")} กลุ่ม)</strong></td>
          <td class="num"><strong>${totals.count.toLocaleString("th-TH")}</strong></td>
          <td class="num"><strong>${escapeHtml(printMoney(totals.sumIn))}</strong></td>
          <td class="num"><strong>${escapeHtml(printMoney(totals.sumOut))}</strong></td>
          <td class="num"><strong>${escapeHtml(printMoney(totals.net))}</strong></td>
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

function endRenderPass() {
  rendering = false;
  if (pendingRender) {
    pendingRender = false;
    scheduleRender();
  }
}

function renderTable() {
  if (rendering) {
    pendingRender = true;
    return;
  }
  rendering = true;
  pendingRender = false;

  if (!authReady) {
    els.loginGate?.classList.remove("is-hidden");
    els.empty?.classList.add("is-hidden");
    els.workspace?.classList.add("is-hidden");
    els.authTools?.classList.add("is-hidden");
    setSync("กำลังตรวจสอบสิทธิ์…");
    endRenderPass();
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
    endRenderPass();
    return;
  }

  els.loginGate?.classList.add("is-hidden");
  els.authTools?.classList.remove("is-hidden");
  renderProjectSelect();
  paintProjectNickUi();

  const hasData = state.transactions.length > 0;
  els.empty.classList.toggle("is-hidden", hasData);
  els.workspace.classList.toggle("is-hidden", !hasData);
  refreshCategoryOptions();
  updateSortHeaders();

  if (!hasData) {
    endRenderPass();
    return;
  }

  const visible = getTableFiltered();
  const MAX = 500;
  const slice = visible.slice(0, MAX);
  updateStats(visible);
  renderGroupSummary();
  const qHighlight =
    String(els.tableSearch?.value || "").trim() || String(els.search?.value || "").trim();
  updateClearButtonsChrome();

  els.txBody.innerHTML = slice
    .map((t) => {
      const cat = t.category || "";
      const checked = selectedIds.has(t.id) ? "checked" : "";
      return `<tr data-id="${t.id}" class="${selectedIds.has(t.id) ? "is-selected" : ""}">
        <td class="col-check"><input type="checkbox" data-check="${t.id}" ${checked} /></td>
        <td>${escapeHtml(formatDateTh(t.date))}${t.time ? `<div class="desc-sub">${escapeHtml(t.time)}</div>` : ""}</td>
        <td>
          <div class="desc-main">${highlight(t.description, qHighlight)}</div>
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
    els.checkAll.checked = visible.length > 0 && visible.every((t) => selectedIds.has(t.id));
    els.checkAll.indeterminate =
      visible.some((t) => selectedIds.has(t.id)) && !els.checkAll.checked;
  }

  if (visible.length > MAX) {
    els.resultLabel.textContent += ` · แสดง ${MAX} แถวแรก กรองเพิ่มเพื่อเจอรายการลึก`;
  }
  endRenderPass();
}

function scheduleRender() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTable, 100);
}

function wireTableRowDragSelect() {
  const body = els.txBody;
  if (!body || body.dataset.dragWired === "1") return;
  body.dataset.dragWired = "1";

  const endDrag = () => {
    if (!rowDrag?.active) return;
    rowDrag = null;
    document.body.classList.remove("is-row-dragging");
    updateSelectionChrome();
  };

  body.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("input:not([data-check]), textarea, select, button, a, .cell-cat, .cell-note")) {
      return;
    }
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.getAttribute("data-id");
    if (!id) return;

    const onCheck = e.target.closest("[data-check]");
    // Intended mode = opposite of current selection for the starting row
    const currentlyOn = selectedIds.has(id);
    const mode = currentlyOn ? "off" : "on";

    if (onCheck) {
      // Own the toggle so change handler doesn't fight drag mode
      e.preventDefault();
    } else {
      e.preventDefault();
    }

    rowDrag = { mode, active: true, touched: new Set([id]) };
    document.body.classList.add("is-row-dragging");
    applyRowSelect(id, mode);
    updateSelectionChrome();
  });

  body.addEventListener("mouseover", (e) => {
    if (!rowDrag?.active) return;
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.getAttribute("data-id");
    if (!id || rowDrag.touched.has(id)) return;
    rowDrag.touched.add(id);
    applyRowSelect(id, rowDrag.mode);
  });

  window.addEventListener("mouseup", endDrag);
  window.addEventListener("blur", endDrag);
  body.addEventListener("dragstart", (e) => {
    if (rowDrag?.active) e.preventDefault();
  });
}

/**
 * After moving items out of the active filter, keep viewing the current group.
 * Do not auto-switch focus to the destination group.
 * @returns {string} optional status note for the toast
 */
function followFilterAfterMove(prevCategories, nextCategory) {
  const filter = els.filterCategory?.value;
  if (!filter) return "";
  const leftFilter = [...prevCategories].some((c) => (c || "__uncat") === filter);
  if (!leftFilter) return "";
  if (filter === "__uncat" && nextCategory) {
    return `ยังกรอง “ยังไม่มีกลุ่ม” อยู่`;
  }
  if (nextCategory && filter !== nextCategory && filter !== "__uncat") {
    return `ยังดูกลุ่ม “${filter}” อยู่`;
  }
  return "";
}

function confirmAutoTag(category, preview) {
  if (preview <= 0) return false;
  const n = preview.toLocaleString("th-TH");
  return window.confirm(
    `พบ ${n} รายการที่ยังไม่มีกลุ่มและคล้ายกับที่เพิ่งติด\n\nต้องการติดกลุ่ม “${category}” ให้ด้วยไหม?\n\nกดยกเลิก = ติดเฉพาะที่เลือก/แก้ไว้แล้ว (ไม่สร้างกฎอัตโนมัติ)`
  );
}

/** Build proposed rules from seed txs; preview extras; apply only if confirmed. */
function learnRulesFromSeeds(seedTxs, category) {
  if (!category || !seedTxs.length) return 0;
  let proposed = state.rules.map((r) => ({ ...r }));
  let useful = false;
  for (const tx of seedTxs) {
    const keywords = extractKeywords(tx.description);
    if (!keywords.length) continue;
    useful = true;
    proposed = upsertRule(proposed, { keywords, category });
  }
  if (!useful) return 0;
  const preview = previewApplyRules(state.transactions, proposed);
  if (preview > 0 && !confirmAutoTag(category, preview)) return 0;
  state.rules = proposed;
  if (preview <= 0) return 0;
  const applied = applyRules(state.transactions, state.rules);
  state.transactions = applied.transactions;
  state.rules = applied.rules;
  return applied.applied;
}

function patchTx(id, patch, { learn = false, recordUndo = true, undoLabel = "แก้รายการ" } = {}) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const before = recordUndo ? cloneStateSlice() : null;
  const prevCat = tx.category || "";
  Object.assign(tx, patch);
  if (learn && patch.category) {
    if (isReservedCategoryName(patch.category)) {
      tx.category = prevCat;
      toast("ใช้ชื่อกลุ่มนี้ไม่ได้");
      return;
    }
    if (!state.categories.includes(patch.category)) state.categories.unshift(patch.category);
    const auto = learnRulesFromSeeds([tx], patch.category);
    if (auto > 0) toast(`ติดอัตโนมัติเพิ่ม ${auto.toLocaleString("th-TH")} รายการ`);
    const stay = followFilterAfterMove([prevCat], patch.category);
    if (stay && auto <= 0) toast(`ย้ายไป “${patch.category}” แล้ว · ${stay}`);
  }
  if (recordUndo && before) pushUndo(undoLabel, before);
  schedulePersist({ immediate: Boolean(learn && patch.category) });
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
  if (group && isReservedCategoryName(group)) {
    toast("ใช้ชื่อกลุ่มนี้ไม่ได้");
    return;
  }
  let n = 0;
  let auto = 0;
  const prevCats = [];
  const seeds = [];
  withUndo(`ใส่กลุ่ม/Note ให้ที่เลือก`, () => {
    for (const id of selectedIds) {
      const tx = state.transactions.find((t) => t.id === id);
      if (!tx) continue;
      prevCats.push(tx.category || "");
      if (group) {
        tx.category = group;
        seeds.push(tx);
      }
      if (note !== "") tx.note = note;
      n += 1;
    }
    if (group && !state.categories.includes(group)) state.categories.unshift(group);
    if (group && seeds.length) auto = learnRulesFromSeeds(seeds, group);
  });
  if (group) {
    const stay = followFilterAfterMove(prevCats, group);
    // Drop ticks that left the current table view so re-apply doesn't feel "ค้าง"
    const stillVisible = new Set(getTableFiltered().map((t) => t.id));
    for (const id of [...selectedIds]) {
      if (!stillVisible.has(id)) selectedIds.delete(id);
    }
    schedulePersist({ immediate: true });
    scheduleRender();
    const base =
      auto > 0
        ? `ใส่ให้ ${n.toLocaleString("th-TH")} ที่เลือก · ติดอัตโนมัติเพิ่ม ${auto.toLocaleString("th-TH")}`
        : `ใส่ให้ ${n.toLocaleString("th-TH")} รายการที่เลือกแล้ว`;
    toast(stay ? `${base} · ${stay}` : base);
    return;
  }
  schedulePersist({ immediate: true });
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
  if (isReservedCategoryName(next)) {
    toast("ใช้ชื่อกลุ่มนี้ไม่ได้");
    return false;
  }
  if (next === prev) return false;
  const nextBusy = state.transactions.some((t) => t.category === next);
  if (nextBusy) {
    toast("มีชื่อกลุ่มนี้แล้ว และมีรายการอยู่");
    return false;
  }
  withUndo(`เปลี่ยนชื่อกลุ่ม “${prev}”`, () => {
    const set = new Set(state.categories);
    set.delete(prev);
    set.add(next);
    state.categories = [...set];
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
    if (Object.prototype.hasOwnProperty.call(state.groupNicknames || {}, prev)) {
      state.groupNicknames[next] = state.groupNicknames[prev];
      delete state.groupNicknames[prev];
    }
    if (els.filterCategory.value === prev) els.filterCategory.value = next;
  });
  schedulePersist({ immediate: true });
  scheduleRender();
  toast(`เปลี่ยนชื่อเป็น “${next}”`);
  return true;
}

function deleteEmptyGroup(groupKey) {
  if (!requireLogin()) return;
  const key = String(groupKey || "").trim();
  if (!key || isReservedCategoryName(key)) return;
  const count = state.transactions.filter((t) => t.category === key).length;
  if (count > 0) {
    toast(`ยังมี ${count.toLocaleString("th-TH")} รายการในกลุ่มนี้ — ย้ายออกก่อน`);
    return;
  }
  withUndo(`ลบกลุ่มว่าง “${key}”`, () => {
    state.categories = state.categories.filter((c) => c !== key);
    delete state.groupNotes[key];
    if (state.groupNicknames) delete state.groupNicknames[key];
    state.rules = state.rules.filter((r) => r.category !== key);
    if (els.filterCategory.value === key) els.filterCategory.value = "";
  });
  schedulePersist();
  scheduleRender();
  toast(`ลบกลุ่มว่าง “${key}” แล้ว`);
}

function beginRenameGroup(groupKey) {
  if (!groupKey || groupKey === "__uncat") return;
  // Must match the title cell — first td is the checkbox column.
  const row = [...(els.groupList?.querySelectorAll("tr[data-group]") || [])].find(
    (el) => el.getAttribute("data-group") === groupKey
  );
  const titleRow = row?.querySelector(".group-title-row");
  const cell = titleRow?.parentElement;
  if (!titleRow || !cell) return;
  if (cell.querySelector("[data-rename-form]")) return;
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
  form.addEventListener("click", (e) => e.stopPropagation());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = renameGroup(groupKey, input.value);
    if (!ok) {
      input.focus();
      input.select();
    }
  });
  form.querySelector("[data-rename-cancel]")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    form.remove();
    titleRow.hidden = false;
  });
}

function detectProjectSource() {
  if (state.projectSource === "demo" || state.projectSource === "import") return state.projectSource;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") return "demo";
  if (state.fileName) return "import";
  return state.projectSource || "import";
}

async function reloadProjectFresh() {
  if (!requireLogin()) return;
  const source = detectProjectSource();
  const label = state.projectName || state.fileName || "โปรเจกต์นี้";
  if (source === "demo") {
    const ok = window.confirm(
      `เคลียร์แท็ก / Note / กฎ แล้วอ่านตัวอย่างสั้นใหม่ทั้งหมด?\n\nกดเลิกทำได้ถ้าเพิ่งกดพลาด`
    );
    if (!ok) return;
    const before = cloneStateSlice();
    try {
      await startDemo({ replace: true, fresh: true, recordUndo: false });
      pushUndo(`เคลียร์อ่านใหม่ (${label})`, before);
      toast(`อ่านตัวอย่างใหม่แล้ว · กดเลิกทำได้`);
    } catch (err) {
      applyStateSlice(before);
      schedulePersist();
      scheduleRender();
      toast(err.message || "อ่านไฟล์ใหม่ไม่สำเร็จ");
    }
    return;
  }
  const ok = window.confirm(
    `ล้างแท็ก / Note / กฎ / ชื่อเล่นกลุ่ม ของโปรเจกต์ “${label}”?\n\nไฟล์ต้นทางไม่มีในเครื่องแล้ว — จะเหลือรายการดิบในโปรเจกต์นี้`
  );
  if (!ok) return;
  withUndo("เคลียร์แท็กโปรเจกต์", () => {
    state.groupNotes = {};
    state.groupNicknames = {};
    state.rules = [];
    for (const t of state.transactions) {
      t.category = "";
      t.note = "";
    }
  });
  schedulePersist();
  scheduleRender();
  toast("เคลียร์แท็ก/Note/ชื่อเล่นแล้ว · กดเลิกทำได้");
}

function deleteActiveProject() {
  if (!requireLogin()) return;
  const name = state.projectName || state.fileName || "โปรเจกต์นี้";
  const count = state.transactions.length;
  const ok = window.confirm(
    `ลบโปรเจกต์ “${name}” ทั้งไฟล์?\n\nจะลบ ${count.toLocaleString("th-TH")} รายการถาวรจากเครื่องนี้ (ยกเลิกไม่ได้)`
  );
  if (!ok) return;
  syncActiveFromState();
  const id = workspace.activeId;
  workspace.projects = workspace.projects.filter((p) => p.id !== id);
  if (!workspace.projects.length) {
    const empty = {
      id: makeProjectId(),
      name: "โปรเจกต์ว่าง",
      source: "local",
      fileName: "",
      updatedAt: new Date().toISOString(),
      ...emptyProjectFields(),
    };
    workspace.projects = [empty];
    applyProjectToState(empty);
  } else {
    applyProjectToState(workspace.projects[0]);
  }
  clearSessionUi();
  undoStack.length = 0;
  updateUndoButton();
  selectedIds.clear();
  schedulePersist();
  renderProjectSelect();
  renderTable();
  toast(`ลบโปรเจกต์ “${name}” แล้ว`);
}

function renameActiveProject() {
  if (!requireLogin()) return;
  const current = state.projectName || "";
  const next = window.prompt("ตั้งชื่อโปรเจกต์ (ชื่อเล่นให้จำว่าคือไฟล์ไหน)", current);
  if (next == null) return;
  const name = next.trim().slice(0, 80);
  if (!name) {
    toast("ใส่ชื่อโปรเจกต์");
    return;
  }
  withUndo("ตั้งชื่อโปรเจกต์", () => {
    state.projectName = name;
  });
  schedulePersist();
  renderProjectSelect();
  paintProjectNickUi();
  toast(`ตั้งชื่อเป็น “${name}”`);
}

async function loadBundledDataFile({
  jsonUrl,
  fileName,
  projectName,
  starterCategories = null,
  starterRuleSpecs = null,
  applyStarterRules = false,
  applyPhase5Heuristics = false,
}) {
  if (!requireLogin()) return null;
  const existing = workspace.projects.find(
    (p) => p.fileName === fileName || p.name === projectName || p.name === fileStem(fileName)
  );
  if (existing && Array.isArray(existing.transactions) && existing.transactions.length) {
    syncActiveFromState();
    applyProjectToState(existing);
    clearSessionUi();
    schedulePersist();
    renderProjectSelect();
    renderTable();
    toast(`เปิดโปรเจกต์ “${existing.name}” ที่มีอยู่แล้ว`);
    return existing;
  }
  toast(`กำลังโหลด ${fileName}…`);
  const res = await fetch(new URL(jsonUrl, window.location.href));
  if (!res.ok) throw new Error(`โหลด ${fileName} ไม่สำเร็จ (${res.status})`);
  const payload = await res.json();
  let rows = Array.isArray(payload.transactions) ? payload.transactions : [];
  rows = rows.map((t) => ({
    ...t,
    category: t.category || "",
    note: t.note || "",
    source: t.source || fileName,
  }));
  if (!rows.length) throw new Error(`ไม่พบรายการใน ${fileName}`);

  let categories = Array.isArray(starterCategories) ? [...starterCategories] : [];
  let rules = [];
  if (Array.isArray(starterRuleSpecs) && starterRuleSpecs.length) {
    for (const spec of starterRuleSpecs) {
      rules = upsertRule(rules, {
        keywords: spec.keywords,
        category: spec.category,
        curated: spec.curated !== false,
      });
    }
  }
  let auto = 0;
  if (applyStarterRules && rules.length) {
    const applied = applyRules(rows, rules);
    rows = applied.transactions;
    rules = applied.rules;
    auto = applied.applied;
  }
  if (applyPhase5Heuristics) {
    const h = applyPeerlandPhase5Heuristics(rows);
    rows = h.transactions;
    auto += h.applied;
  }

  const project = createProjectFromRows({
    name: projectName || fileStem(fileName),
    source: "import",
    fileName,
    rows,
    categories,
    rules,
    groupNotes: {},
    groupNicknames: {},
    activate: true,
  });
  schedulePersist();
  renderProjectSelect();
  renderTable();
  toast(
    auto > 0
      ? `สร้างโปรเจกต์ “${project.name}” · ${rows.length.toLocaleString("th-TH")} รายการ · ติดกลุ่มเริ่มต้น ${auto.toLocaleString("th-TH")}`
      : `สร้างโปรเจกต์ “${project.name}” · ${rows.length.toLocaleString("th-TH")} รายการ`
  );
  return project;
}

async function openTellteaProject() {
  return loadBundledDataFile({
    jsonUrl: "data/telltea_2024-2025.json",
    fileName: "telltea_2024-2025_full.pdf",
    projectName: "telltea_2024-2025",
  });
}

async function openPeerlandProject() {
  return loadBundledDataFile({
    jsonUrl: "data/peerland_2024-2025.json",
    fileName: "peerland_2024-2025_full.pdf",
    projectName: "peerland_2024-2025",
    starterCategories: PEERLAND_CATEGORIES,
    starterRuleSpecs: PEERLAND_PHASE1234_RULES,
    applyStarterRules: true,
    applyPhase5Heuristics: true,
  });
}

/** Apply peerland phases 1–5 to uncategorized rows only. */
function applyPeerlandPhases15() {
  if (!requireLogin()) return;
  if (!isPeerlandProject()) {
    toast("ปุ่มนี้ใช้กับโปรเจกต์ peerland เท่านั้น");
    return;
  }
  const uncat = state.transactions.filter((t) => !String(t.category || "").trim()).length;
  if (!uncat) {
    toast("ไม่มีรายการที่ยังว่างให้จัดกลุ่ม");
    return;
  }
  const ok = window.confirm(
    `จัดกลุ่ม peerland เฟส 1–5?\n\n` +
      `· เฟส 1 แพลตฟอร์ม/ลงทุน (${PEERLAND_PHASE_META.phase1Groups})\n` +
      `· เฟส 2 ตัวเอง+ครอบครัว (${PEERLAND_PHASE_META.phase2Groups})\n` +
      `· เฟส 3 ลูกค้า/คู่ค้ารายใหญ่ (${PEERLAND_PHASE_META.phase3Groups})\n` +
      `· เฟส 4 ค่าใช้จ่ายประเภท (${PEERLAND_PHASE_META.phase4Groups})\n` +
      `· เฟส 5 หางยาว / อื่นๆ (${PEERLAND_PHASE_META.phase5Groups})\n\n` +
      `ติดเฉพาะที่ยังว่าง (~${uncat.toLocaleString("th-TH")} รายการ)\n` +
      `ชุดกลุ่ม ${PEERLAND_PHASE_META.totalGroups} ชื่อ · กดเลิกทำได้`
  );
  if (!ok) return;

  let appliedCount = 0;
  withUndo("จัดกลุ่ม peerland เฟส 1–5", () => {
    state.categories = [...new Set([...PEERLAND_CATEGORIES, ...(state.categories || [])])];
    const result = applyPeerlandPhasesAll(state.transactions, upsertRule, applyRules);
    const kept = (state.rules || []).filter((r) => !r.curated);
    const byKey = new Map();
    for (const r of [...kept, ...result.rules]) byKey.set(r.key, r);
    state.rules = [...byKey.values()];
    state.transactions = result.transactions;
    appliedCount = result.applied;
  });
  schedulePersist();
  scheduleRender();
  const left = state.transactions.filter((t) => !String(t.category || "").trim()).length;
  toast(
    appliedCount > 0
      ? `เฟส 1–5 ติดกลุ่ม ${appliedCount.toLocaleString("th-TH")} รายการ · เหลือว่าง ${left.toLocaleString("th-TH")}`
      : "ไม่พบรายการที่กฎจับได้เพิ่ม"
  );
}

async function ensureTellteaProjectSeeded() {
  const exists = workspace.projects.some(
    (p) =>
      p.fileName === "telltea_2024-2025_full.pdf" ||
      p.name === "telltea_2024-2025" ||
      String(p.fileName || "").includes("telltea")
  );
  if (exists) return null;
  try {
    return await openTellteaProject();
  } catch (err) {
    console.warn(err);
    return null;
  }
}

async function importFiles(fileList) {
  if (!requireLogin("ต้องเข้าสู่ระบบก่อนจึงจะนำเข้าไฟล์ได้")) return;
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;

  // Always create new project(s) — never merge into the current one.
  syncActiveFromState();
  toast(`กำลังสร้างโปรเจกต์ใหม่จาก ${files.length} ไฟล์…`);

  const created = [];
  for (const file of files) {
    try {
      let rows = await parseFile(file);
      rows = dedupeTransactions(rows).map((t) => ({
        ...t,
        category: "",
        note: "",
        source: t.source || file.name,
      }));
      await new Promise((r) => setTimeout(r, 0));
      if (!rows.length) {
        toast(`${file.name}: ไม่พบรายการ`);
        continue;
      }
      const baseName = fileStem(file.name);
      const project = createProjectFromRows({
        name: baseName,
        source: "import",
        fileName: file.name || baseName,
        rows,
        categories: [],
        rules: [],
        groupNotes: {},
        groupNicknames: {},
        activate: false,
      });
      created.push(project);
    } catch (err) {
      console.error(err);
      toast(`${file.name}: ${err.message || "อ่านไม่สำเร็จ"}`);
    }
  }

  if (!created.length) {
    toast("ไม่พบรายการในไฟล์ — ไม่ได้สร้างโปรเจกต์");
    return;
  }

  // Switch to the newest imported project only.
  const latest = created[0];
  applyProjectToState(latest);
  clearSessionUi();
  schedulePersist();
  renderProjectSelect();
  renderTable();
  toast(
    created.length === 1
      ? `สร้างโปรเจกต์ “${latest.name}” · ${latest.transactions.length.toLocaleString("th-TH")} รายการ (แยกจากของเดิม)`
      : `สร้าง ${created.length.toLocaleString("th-TH")} โปรเจกต์ใหม่ · เปิด “${latest.name}”`
  );
}

async function startDemo({ replace = true, fresh = false, recordUndo = true } = {}) {
  if (!requireLogin()) return;
  const res = await fetch(new URL("sample-statement.csv", window.location.href));
  if (!res.ok) throw new Error("โหลดตัวอย่างไม่สำเร็จ");
  const textCsv = await res.text();
  const parsed = await parseFile(new File([textCsv], "sample-statement.csv", { type: "text/csv" }));
  const rows = dedupeTransactions(parsed);
  if (fresh || replace) {
    const existing = workspace.projects.find((p) => p.projectSource === "demo" || p.source === "demo");
    if (existing && replace) {
      syncActiveFromState();
      existing.transactions = rows;
      existing.rules = [];
      existing.groupNotes = fresh ? {} : existing.groupNotes || {};
      existing.categories = defaultCategories();
      existing.projectSource = "demo";
      existing.source = "demo";
      existing.fileName = "sample-statement.csv";
      existing.name = "ตัวอย่างสั้น";
      existing.updatedAt = new Date().toISOString();
      applyProjectToState(existing);
      clearSessionUi();
    } else {
      createProjectFromRows({
        name: "ตัวอย่างสั้น",
        source: "demo",
        fileName: "sample-statement.csv",
        rows,
        categories: defaultCategories(),
        rules: [],
        groupNotes: {},
        groupNicknames: {},
      });
    }
  } else {
    createProjectFromRows({
      name: "ตัวอย่างสั้น",
      source: "demo",
      fileName: "sample-statement.csv",
      rows,
      categories: defaultCategories(),
      groupNicknames: {},
    });
  }
  schedulePersist();
  renderProjectSelect();
  renderTable();
  const params = new URLSearchParams(window.location.search);
  params.set("demo", "1");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  toast(`โปรเจกต์ตัวอย่าง · ${rows.length.toLocaleString("th-TH")} รายการ`);
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
          const targetId = remote.projectId || remote.activeProjectId || workspace.activeId;
          let target = workspace.projects.find((p) => p.id === targetId);
          if (!target) {
            target = {
              id: targetId || makeProjectId(),
              name: remote.projectName || remote.fileName || "โปรเจกต์คลาวด์",
              source: remote.projectSource || "cloud",
              fileName: remote.fileName || "",
              updatedAt: new Date().toISOString(),
              ...emptyProjectFields(),
            };
            workspace.projects.unshift(target);
          }
          const localCount = target.transactions?.length || 0;
          if (!localCount || remote.transactions.length >= localCount) {
            target.transactions = remote.transactions;
            if (remote.categories?.length) target.categories = remote.categories;
            if (remote.rules?.length) target.rules = remote.rules;
            if (remote.groupNotes) target.groupNotes = remote.groupNotes;
            if (remote.groupNicknames) target.groupNicknames = remote.groupNicknames;
            if (remote.projectSource) target.projectSource = remote.projectSource;
            if (remote.projectName) target.name = remote.projectName;
            if (remote.fileName) target.fileName = remote.fileName;
            target.updatedAt = new Date().toISOString();
            applyProjectToState(target);
            saveState(state, workspace);
            toast("ดึงโปรเจกต์จาก Firebase แล้ว");
          } else {
            await pushCloudState(user.uid, state, workspace);
          }
        } else if (state.transactions.length) {
          await pushCloudState(user.uid, state, workspace);
        }
        setSync(`ซิงค์แล้ว · ${user.email}`);
        renderProjectSelect();
        recoverMergedImports({ silent: true });
      } catch (err) {
        console.warn(err);
        setSync(`ล็อกอินแล้ว · ${user.email}`);
      }
      renderTable();
      await runPendingLoads();
      recoverMergedImports({ silent: true });
      await ensureTellteaProjectSeeded();
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
    importFiles(e.target.files).catch((err) => toast(err.message || "นำเข้าไม่สำเร็จ"));
    e.target.value = "";
  });

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    importFiles(e.dataTransfer.files).catch((err) => toast(err.message || "นำเข้าไม่สำเร็จ"));
  });

  els.projectSelect?.addEventListener("change", () => {
    switchProject(els.projectSelect.value);
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

  ["input", "change"].forEach((evt) => {
    els.tableSearch?.addEventListener(evt, () => {
      updateClearButtonsChrome();
      scheduleRender();
    });
  });
  els.btnClearTableSearch?.addEventListener("click", () => {
    if (!els.tableSearch) return;
    els.tableSearch.value = "";
    updateClearButtonsChrome();
    scheduleRender();
    els.tableSearch.focus();
  });

  els.btnClearBulkGroup?.addEventListener("click", () => {
    if (!els.bulkGroup) return;
    els.bulkGroup.value = "";
    updateClearButtonsChrome();
    els.bulkGroup.focus();
  });
  els.btnClearBulkNote?.addEventListener("click", () => {
    if (!els.bulkNote) return;
    els.bulkNote.value = "";
    updateClearButtonsChrome();
    els.bulkNote.focus();
  });
  ["input", "change"].forEach((evt) => {
    els.bulkGroup?.addEventListener(evt, updateClearButtonsChrome);
    els.bulkNote?.addEventListener(evt, updateClearButtonsChrome);
  });

  const amountInputs = [
    els.amtInMin,
    els.amtInMax,
    els.amtOutMin,
    els.amtOutMax,
    els.amtValMin,
    els.amtValMax,
  ];
  amountInputs.forEach((el) => {
    el?.addEventListener("input", () => {
      updateClearButtonsChrome();
      scheduleRender();
    });
    el?.addEventListener("change", () => {
      updateClearButtonsChrome();
      scheduleRender();
    });
  });
  els.btnClearAmountFilters?.addEventListener("click", () => {
    clearAmountFilterInputs();
    updateClearButtonsChrome();
    scheduleRender();
  });
  els.btnClearTableZone?.addEventListener("click", () => {
    clearTableZoneFilters({ focus: "search" });
    toast("เคลียร์ค้นหาตาราง · ช่วงยอด · ช่องกลุ่ม/Note แล้ว");
  });

  wireTableRowDragSelect();

  els.addGroupForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!requireLogin()) return;
    const name = (els.newGroupName.value || "").trim();
    if (!name) return;
    if (isReservedCategoryName(name)) {
      toast("ใช้ชื่อกลุ่มนี้ไม่ได้");
      els.newGroupName.value = "";
      return;
    }
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
    toast(`เพิ่มกลุ่ม “${name}” แล้ว · ยังว่าง จนกว่าจะย้ายรายการเข้า`);
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
      const row = check.closest("tr");
      if (row) row.classList.toggle("is-selected", check.checked);
      updateSelectionChrome();
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
    if (e.target.closest("[data-group-check]")) return;
    const mergeTargetBtn = e.target.closest("[data-merge-target]");
    if (mergeTargetBtn) {
      e.preventDefault();
      setMergeTarget(mergeTargetBtn.getAttribute("data-merge-target"));
      return;
    }
    const renameBtn = e.target.closest("[data-rename-group]");
    if (renameBtn) {
      e.preventDefault();
      e.stopPropagation();
      beginRenameGroup(renameBtn.getAttribute("data-rename-group"));
      return;
    }
    const deleteBtn = e.target.closest("[data-delete-group]");
    if (deleteBtn) {
      deleteEmptyGroup(deleteBtn.getAttribute("data-delete-group"));
      return;
    }
    if (e.target.closest("[data-group-note]") || e.target.closest("[data-rename-form]")) return;
    const filterBtn = e.target.closest("[data-filter-group]");
    if (filterBtn) {
      const key = filterBtn.getAttribute("data-filter-group");
      const isTitle = filterBtn.classList.contains("group-title-btn");
      // UX: when sources are ticked, clicking a group name picks merge destination
      if (isTitle && getMergeSources().length > 0 && key && key !== "__uncat") {
        setMergeTarget(key);
        return;
      }
      els.filterCategory.value = key;
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

  els.groupList?.addEventListener("change", (e) => {
    const check = e.target.closest("[data-group-check]");
    if (check) {
      const key = check.getAttribute("data-group-check");
      if (!key || key === "__uncat") return;
      if (check.checked) selectedGroupKeys.add(key);
      else selectedGroupKeys.delete(key);
      updateGroupMergeBar();
      const row = check.closest("tr");
      if (row) row.classList.toggle("is-merge-picked", check.checked);
      return;
    }
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
    const visible = getTableFiltered();
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
  els.btnSplitMerged?.addEventListener("click", () => {
    if (!requireLogin()) return;
    recoverMergedImports({ silent: false });
  });
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
      toast(`${err.message || "ล็อกอินไม่สำเร็จ"} · ${buildLabel()}`);
    }
  }

  els.btnAuth?.addEventListener("click", handleAuthClick);
  els.btnAuthHero?.addEventListener("click", handleAuthClick);
  els.btnDemo?.addEventListener("click", () => startDemo({ replace: true }).catch((err) => toast(err.message)));
  els.btnOpenTelltea?.addEventListener("click", () => openTellteaProject().catch((err) => toast(err.message)));
  els.btnOpenPeerland?.addEventListener("click", () => openPeerlandProject().catch((err) => toast(err.message)));
  els.btnPeerlandPhases?.addEventListener("click", () => applyPeerlandPhases15());
  els.btnGroupMerge?.addEventListener("click", () => mergeSelectedGroups());
  els.btnGroupMergeClear?.addEventListener("click", () => {
    selectedGroupKeys.clear();
    clearMergeTarget();
    updateGroupMergeBar();
    renderGroupSummary();
  });
  els.btnGroupMergeClearTarget?.addEventListener("click", () => {
    clearMergeTarget();
    renderGroupSummary();
    toast("เคลียร์ปลายทางแล้ว — พิมพ์ชื่อใหม่ได้");
  });
  els.btnGroupSelectAll?.addEventListener("click", () => {
    const mode = els.btnGroupSelectAll.dataset.mode || "all";
    if (mode === "clear") {
      selectedGroupKeys.clear();
      updateGroupMergeBar();
      renderGroupSummary();
      return;
    }
    selectAllMergeableGroups();
  });
  els.groupMergeName?.addEventListener("input", () => {
    if (mergeTargetKey) return;
    updateGroupMergeBar();
  });
  els.btnRenameProject?.addEventListener("click", renameActiveProject);
  els.btnDeleteProject?.addEventListener("click", deleteActiveProject);
  els.fileInputHero?.addEventListener("change", (e) => {
    importFiles(e.target.files).catch((err) => toast(err.message || "นำเข้าไม่สำเร็จ"));
    e.target.value = "";
  });
}

wireEvents();
paintBuildStamp();
updateUndoButton();
renderTable();
setupAuth();

{
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1" || location.hash === "#demo") pendingDemo = true;
}
