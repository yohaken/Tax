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
let groupSortMode = "abs-desc";

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
  groupSort: document.getElementById("group-sort"),
  txBody: document.getElementById("tx-body"),
  resultLabel: document.getElementById("result-label"),
  categoryDatalist: document.getElementById("category-datalist"),
  groupList: document.getElementById("group-list"),
  printRoot: document.getElementById("print-root"),
  checkAll: document.getElementById("check-all"),
  bulkCount: document.getElementById("bulk-count"),
  bulkGroup: document.getElementById("bulk-group"),
  bulkNote: document.getElementById("bulk-note"),
  btnBulkApply: document.getElementById("btn-bulk-apply"),
  btnBulkClear: document.getElementById("btn-bulk-clear"),
  btnExport: document.getElementById("btn-export"),
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

function sortGroups(groups) {
  const mode = groupSortMode || "abs-desc";
  return [...groups].sort((a, b) => {
    if (a.key === "__uncat") return 1;
    if (b.key === "__uncat") return -1;
    if (mode === "name-asc") return a.name.localeCompare(b.name, "th");
    if (mode === "count-desc") return b.count - a.count;
    if (mode === "in-desc") return b.sumIn - a.sumIn;
    if (mode === "out-desc") return b.sumOut - a.sumOut;
    if (mode === "net-desc") return b.net - a.net;
    if (mode === "abs-asc") return Math.abs(a.sumIn + a.sumOut) - Math.abs(b.sumIn + b.sumOut);
    return Math.abs(b.sumIn + b.sumOut) - Math.abs(a.sumIn + a.sumOut);
  });
}

function renderGroupSummary() {
  if (!els.groupList) return;
  const groups = sortGroups(summarizeByGroup(getSummaryBase()));
  const active = els.filterCategory.value || "";

  if (!groups.length) {
    els.groupList.innerHTML = `<div class="group-meta">ยังไม่มีรายการให้สรุป</div>`;
    return;
  }

  els.groupList.innerHTML = groups
    .map((g) => {
      const isActive = active === g.key;
      const gNote = state.groupNotes?.[g.key] || "";
      return `<article class="group-row${isActive ? " is-active" : ""}" data-group="${escapeHtml(g.key)}">
        <div class="group-name">
          <button type="button" data-filter-group="${escapeHtml(g.key)}">${escapeHtml(g.name)}</button>
          <div class="group-meta">${g.count.toLocaleString("th-TH")} รายการ · มูลค่า ${escapeHtml(formatMoney(g.sumIn + g.sumOut))}</div>
          <input class="group-note" data-group-note="${escapeHtml(g.key)}" value="${escapeHtml(gNote)}" placeholder="Note ของกลุ่ม…" />
        </div>
        <div class="group-amt in"><small>เข้า</small>${escapeHtml(formatMoney(g.sumIn))}</div>
        <div class="group-amt out"><small>ออก</small>${escapeHtml(formatMoney(g.sumOut))}</div>
        <div class="group-amt"><small>สุทธิ</small>${escapeHtml(formatMoney(g.net))}</div>
        <div class="group-actions">
          <button type="button" class="btn quiet tiny" data-filter-group="${escapeHtml(g.key)}">ดู</button>
          <button type="button" class="btn quiet tiny" data-export-group="${escapeHtml(g.key)}">Export</button>
          <button type="button" class="btn solid tiny" data-print-group="${escapeHtml(g.key)}">พิมพ์</button>
        </div>
      </article>`;
    })
    .join("");
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

  els.printRoot.hidden = false;
  els.printRoot.innerHTML = `
    <h1>TaxTag · ${escapeHtml(groupTitle(groupKey))}</h1>
    <p class="print-sub">${rows.length.toLocaleString("th-TH")} รายการ
      · เข้า ${escapeHtml(formatMoney(sumIn))}
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

function patchTx(id, patch, { learn = false } = {}) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
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
  let n = 0;
  for (const id of selectedIds) {
    const patch = {};
    if (group) patch.category = group;
    if (note !== "") patch.note = note;
    if (!Object.keys(patch).length) continue;
    patchTx(id, patch, { learn: Boolean(group) });
    n += 1;
  }
  if (group && !state.categories.includes(group)) state.categories.unshift(group);
  schedulePersist();
  scheduleRender();
  toast(`ใส่ให้ ${n.toLocaleString("th-TH")} รายการที่เลือกแล้ว`);
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
  state.transactions = dedupeTransactions([...imported, ...state.transactions]);
  const applied = applyRules(state.transactions, state.rules);
  state.transactions = applied.transactions;
  state.rules = applied.rules;
  schedulePersist();
  renderTable();
  toast(`นำเข้า ${imported.length.toLocaleString("th-TH")} รายการ`);
}

async function startDemo({ replace = true } = {}) {
  if (!requireLogin()) return;
  const res = await fetch(new URL("sample-statement.csv", window.location.href));
  if (!res.ok) throw new Error("โหลดตัวอย่างไม่สำเร็จ");
  const text = await res.text();
  if (replace) {
    state.transactions = [];
    state.rules = [];
  }
  await importFiles([new File([text], "sample-statement.csv", { type: "text/csv" })]);
}

async function startPeerland({ replace = true } = {}) {
  if (!requireLogin()) return;
  toast("กำลังโหลด Peerland…");
  const res = await fetch(new URL("data/peerland_2024-2025.json", window.location.href));
  if (!res.ok) throw new Error(`โหลด Peerland ไม่สำเร็จ (${res.status})`);
  const payload = await res.json();
  const rows = Array.isArray(payload.transactions) ? payload.transactions : [];
  if (!rows.length) throw new Error("ไม่พบรายการ Peerland");
  if (replace) {
    state.transactions = [];
    state.rules = [];
  }
  const peerlandCats = [
    "รายได้ลูกค้า / QR",
    "Shopee / Lazada",
    "ชำระบัตรกสิกร",
    "โอนภายใน / ส่วนตัว",
    "ค่าธรรมเนียม",
    "สินค้า / ซูเปอร์มาร์เก็ต",
    "หลักทรัพย์ / ออม",
    "อื่นๆ",
  ];
  for (const c of peerlandCats) {
    if (!state.categories.includes(c)) state.categories.push(c);
  }
  state.transactions = dedupeTransactions([
    ...rows.map((t) => ({
      ...t,
      category: t.category || "",
      note: t.note || "",
      source: t.source || "peerland_2024-2025_full.pdf",
    })),
    ...state.transactions,
  ]);
  for (const rule of [
    { keywords: ["ช้อปปี้เพย์", "shopee"], category: "Shopee / Lazada" },
    { keywords: ["lazada"], category: "Shopee / Lazada" },
    { keywords: ["บัตรกสิกรไทย"], category: "ชำระบัตรกสิกร" },
    { keywords: ["ค่าธรรมเนียม"], category: "ค่าธรรมเนียม" },
    { keywords: ["my qr", "รับโอนเงินผ่าน qr"], category: "รายได้ลูกค้า / QR" },
    { keywords: ["ซีพี แอ็กซ์ตร้า", "cp axtra"], category: "สินค้า / ซูเปอร์มาร์เก็ต" },
    { keywords: ["ksecurities", "หลักทรัพย์"], category: "หลักทรัพย์ / ออม" },
    { keywords: ["phiraphong yohakh", "พีระพงษ์ โยหาเ"], category: "โอนภายใน / ส่วนตัว" },
  ]) {
    state.rules = upsertRule(state.rules, rule);
  }
  const applied = applyRules(state.transactions, state.rules);
  state.transactions = applied.transactions;
  state.rules = applied.rules;
  schedulePersist();
  renderTable();
  const params = new URLSearchParams(window.location.search);
  params.set("peerland", "1");
  params.delete("demo");
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  toast(`Peerland ${rows.length.toLocaleString("th-TH")} รายการ`);
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
    els.dateFrom.addEventListener(evt, scheduleRender);
    els.dateTo.addEventListener(evt, scheduleRender);
    els.filterCategory.addEventListener(evt, scheduleRender);
    els.filterDirection.addEventListener(evt, scheduleRender);
  });

  els.btnClearSearch?.addEventListener("click", () => {
    els.search.value = "";
    scheduleRender();
    els.search.focus();
  });

  els.groupSort?.addEventListener("change", () => {
    groupSortMode = els.groupSort.value;
    renderGroupSummary();
  });

  els.addGroupForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!requireLogin()) return;
    const name = (els.newGroupName.value || "").trim();
    if (!name) return;
    if (!state.categories.includes(name)) {
      state.categories.unshift(name);
      schedulePersist();
      refreshCategoryOptions();
      toast(`เพิ่มกลุ่ม “${name}” แล้ว`);
    } else {
      toast("มีกลุ่มนี้อยู่แล้ว");
    }
    els.newGroupName.value = "";
    renderGroupSummary();
  });

  els.txBody.addEventListener("input", (e) => {
    const note = e.target.closest("[data-note]");
    if (note) {
      patchTx(note.getAttribute("data-note"), { note: note.value });
      return;
    }
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      cat.classList.toggle("has-value", Boolean(cat.value.trim()));
      patchTx(cat.getAttribute("data-cat"), { category: cat.value.trim() });
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
    const cat = e.target.closest("[data-cat]");
    if (!cat) return;
    const value = cat.value.trim();
    patchTx(cat.getAttribute("data-cat"), { category: value }, { learn: Boolean(value) });
    scheduleRender();
  });

  els.groupList?.addEventListener("click", (e) => {
    if (e.target.closest("[data-group-note]")) return;
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
renderTable();
setupAuth();

{
  const params = new URLSearchParams(window.location.search);
  if (params.get("peerland") === "1" || location.hash === "#peerland") pendingPeerland = true;
  else if (params.get("demo") === "1" || location.hash === "#demo") pendingDemo = true;
}
