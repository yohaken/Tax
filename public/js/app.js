import { parseFile, dedupeTransactions } from "./parser.js";
import {
  loadState,
  saveState,
  clearState,
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
let currentUser = null;
let cloudReady = false;
let authReady = false;
let persistTimer = null;
let searchTimer = null;
let rendering = false;
let pendingPeerland = false;
let pendingDemo = false;

const els = {
  loginGate: document.getElementById("login-gate"),
  empty: document.getElementById("empty-state"),
  workspace: document.getElementById("workspace"),
  authTools: document.getElementById("auth-tools"),
  fileInput: document.getElementById("file-input"),
  search: document.getElementById("search-input"),
  dateFrom: document.getElementById("date-from"),
  dateTo: document.getElementById("date-to"),
  filterCategory: document.getElementById("filter-category"),
  filterDirection: document.getElementById("filter-direction"),
  txBody: document.getElementById("tx-body"),
  resultLabel: document.getElementById("result-label"),
  categoryDatalist: document.getElementById("category-datalist"),
  groupList: document.getElementById("group-list"),
  printRoot: document.getElementById("print-root"),
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

/** Auto-save: local immediately (debounced), cloud when logged in. */
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

  return smartSearch(list, els.search.value)
    .map((r) => r.item)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.amount || 0) - (a.amount || 0));
}

function updateStats(visible) {
  const uncat = state.transactions.filter((t) => !t.category).length;
  const sumIn = visible.filter((t) => t.direction === "in").reduce((s, t) => s + (t.amount || 0), 0);
  const sumOut = visible.filter((t) => t.direction === "out").reduce((s, t) => s + (t.amount || 0), 0);
  els.statCount.textContent = String(state.transactions.length);
  els.statUncat.textContent = String(uncat);
  els.statIn.textContent = formatMoney(sumIn);
  els.statOut.textContent = formatMoney(sumOut);
  els.resultLabel.textContent = `แสดง ${visible.length.toLocaleString("th-TH")} จาก ${state.transactions.length.toLocaleString("th-TH")} รายการ · แก้กลุ่ม/Note แล้วเซฟเอง`;
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

/** Base list for group totals: honor date/direction/search, but not category filter. */
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

function renderGroupSummary() {
  if (!els.groupList) return;
  const groups = summarizeByGroup(getSummaryBase());
  const active = els.filterCategory.value || "";

  if (!groups.length) {
    els.groupList.innerHTML = `<div class="group-meta">ยังไม่มีรายการให้สรุป</div>`;
    return;
  }

  els.groupList.innerHTML = groups
    .map((g) => {
      const isActive = active === g.key;
      return `<article class="group-row${isActive ? " is-active" : ""}" data-group="${escapeHtml(g.key)}">
        <div class="group-name">
          <button type="button" data-filter-group="${escapeHtml(g.key)}">${escapeHtml(g.name)}</button>
          <div class="group-meta">${g.count.toLocaleString("th-TH")} รายการ${g.notePreview ? ` · Note: ${escapeHtml(g.notePreview)}` : ""}</div>
        </div>
        <div class="group-amt in"><small>เข้า</small>${escapeHtml(formatMoney(g.sumIn))}</div>
        <div class="group-amt out"><small>ออก</small>${escapeHtml(formatMoney(g.sumOut))}</div>
        <div class="group-amt"><small>สุทธิ</small>${escapeHtml(formatMoney(g.net))}</div>
        <div class="group-amt"><small>Note</small>${g.notes.length ? g.notes.length.toLocaleString("th-TH") : "—"}</div>
        <div class="group-actions">
          <button type="button" class="btn quiet tiny" data-filter-group="${escapeHtml(g.key)}">ดูกลุ่ม</button>
          <button type="button" class="btn quiet tiny" data-export-group="${escapeHtml(g.key)}">Export</button>
          <button type="button" class="btn solid tiny" data-print-group="${escapeHtml(g.key)}">พิมพ์กลุ่มนี้</button>
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
  const noteBits = [...new Set(rows.map((t) => t.note).filter(Boolean))];

  els.printRoot.hidden = false;
  els.printRoot.innerHTML = `
    <h1>TaxTag · ${escapeHtml(groupTitle(groupKey))}</h1>
    <p class="print-sub">${rows.length.toLocaleString("th-TH")} รายการ
      · เข้า ${escapeHtml(formatMoney(sumIn))}
      · ออก ${escapeHtml(formatMoney(sumOut))}
      · สุทธิ ${escapeHtml(formatMoney(sumIn - sumOut))}
      ${noteBits.length ? `<br/>Note: ${escapeHtml(noteBits.join(" · "))}` : ""}
    </p>
    <table>
      <thead>
        <tr>
          <th>วันที่</th>
          <th>รายละเอียด</th>
          <th class="num">เข้า</th>
          <th class="num">ออก</th>
          <th>Note</th>
        </tr>
      </thead>
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

function renderTable() {
  if (rendering) return;
  rendering = true;

  // Lock all data behind login
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

  if (!hasData) {
    rendering = false;
    return;
  }

  const visible = getFiltered();
  const MAX = 400;
  const slice = visible.slice(0, MAX);
  updateStats(visible);
  renderGroupSummary();

  els.txBody.innerHTML = slice
    .map((t) => {
      const cat = t.category || "";
      return `<tr data-id="${t.id}">
        <td>${escapeHtml(formatDateTh(t.date))}${t.time ? `<div class="desc-sub">${escapeHtml(t.time)}</div>` : ""}</td>
        <td>
          <div class="desc-main">${highlight(t.description, els.search.value)}</div>
          <div class="desc-sub">${escapeHtml(t.source || "")}</div>
        </td>
        <td class="num amount-in">${t.direction === "in" ? escapeHtml(formatMoney(t.amount)) : "—"}</td>
        <td class="num amount-out">${t.direction === "out" ? escapeHtml(formatMoney(t.amount)) : "—"}</td>
        <td><input class="cell-cat${cat ? " has-value" : ""}" list="category-datalist" data-cat="${t.id}" value="${escapeHtml(cat)}" placeholder="กลุ่ม…" /></td>
        <td><input class="cell-note" data-note="${t.id}" value="${escapeHtml(t.note || "")}" placeholder="Note…" /></td>
      </tr>`;
    })
    .join("");

  if (visible.length > MAX) {
    els.resultLabel.textContent += ` · แสดง ${MAX} แถวแรก ให้แคบการค้นหาเพื่อเจอรายการลึก`;
  }
  rendering = false;
}

function scheduleRender() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTable, 120);
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

async function importFiles(fileList) {
  if (!requireLogin("ต้องเข้าสู่ระบบก่อนจึงจะนำเข้าไฟล์ได้")) return;
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;
  toast(`กำลังอ่าน ${files.length} ไฟล์…`);
  let imported = [];
  const errors = [];
  for (const file of files) {
    try {
      imported = imported.concat(await parseFile(file));
    } catch (err) {
      console.error(err);
      errors.push(`${file.name}: ${err.message || "อ่านไม่สำเร็จ"}`);
    }
  }
  imported = dedupeTransactions(imported);
  if (!imported.length) {
    toast(errors[0] || "ไม่พบรายการในไฟล์");
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
  toast("กำลังโหลดตัวอย่าง…");
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
  toast(`Peerland ${rows.length.toLocaleString("th-TH")} รายการ · ติดป้ายอัตโนมัติ ${applied.applied.toLocaleString("th-TH")}`);
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
        setSync(`ล็อกอินแล้ว · ซิงค์คลาวด์รอตั้งกฎ Firestore`);
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
  els.fileInput.addEventListener("change", (e) => {
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

  // Inline autosave — no save button
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
    const cat = e.target.closest("[data-cat]");
    if (!cat) return;
    const value = cat.value.trim();
    patchTx(cat.getAttribute("data-cat"), { category: value }, { learn: Boolean(value) });
    // soft re-apply for similar rows without fighting focus
    scheduleRender();
  });

  els.groupList?.addEventListener("click", (e) => {
    const filterBtn = e.target.closest("[data-filter-group]");
    if (filterBtn) {
      const key = filterBtn.getAttribute("data-filter-group");
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
    if (exportBtn) {
      exportGroup(exportBtn.getAttribute("data-export-group"));
    }
  });

  els.btnExport.addEventListener("click", () => {
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
      await loginWithGoogle();
      toast("เข้าสู่ระบบแล้ว · จำการล็อกอินไว้ในเครื่องนี้");
    } catch (err) {
      console.error(err);
      toast(err.message || "ล็อกอินไม่สำเร็จ");
    }
  }

  els.btnAuth?.addEventListener("click", handleAuthClick);
  els.btnAuthHero?.addEventListener("click", handleAuthClick);

  const goPeerland = () => startPeerland({ replace: true }).catch((err) => toast(err.message));
  const goDemo = () => startDemo({ replace: true }).catch((err) => toast(err.message));
  els.btnPeerland?.addEventListener("click", goPeerland);
  els.btnPeerlandHero?.addEventListener("click", goPeerland);
  els.btnDemo?.addEventListener("click", goDemo);
}

wireEvents();
renderTable();
setupAuth();

{
  const params = new URLSearchParams(window.location.search);
  if (params.get("peerland") === "1" || location.hash === "#peerland") {
    pendingPeerland = true;
  } else if (params.get("demo") === "1" || location.hash === "#demo") {
    pendingDemo = true;
  }
}
