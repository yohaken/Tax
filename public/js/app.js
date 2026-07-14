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
let persistTimer = null;
let searchTimer = null;
let rendering = false;

const els = {
  empty: document.getElementById("empty-state"),
  workspace: document.getElementById("workspace"),
  fileInput: document.getElementById("file-input"),
  search: document.getElementById("search-input"),
  dateFrom: document.getElementById("date-from"),
  dateTo: document.getElementById("date-to"),
  filterCategory: document.getElementById("filter-category"),
  filterDirection: document.getElementById("filter-direction"),
  txBody: document.getElementById("tx-body"),
  resultLabel: document.getElementById("result-label"),
  categoryDatalist: document.getElementById("category-datalist"),
  btnExport: document.getElementById("btn-export"),
  btnAuth: document.getElementById("btn-auth"),
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
  els.resultLabel.textContent = `แสดง ${visible.length.toLocaleString("th-TH")} จาก ${state.transactions.length.toLocaleString("th-TH")} รายการ · แก้หมวด/คอมเมนต์แล้วเซฟเอง`;
}

function refreshCategoryOptions() {
  const current = els.filterCategory.value;
  els.categoryDatalist.innerHTML = state.categories
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
  els.filterCategory.innerHTML =
    `<option value="">ทุกหมวด</option><option value="__uncat">ยังไม่มีหมวด</option>` +
    state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if ([...els.filterCategory.options].some((o) => o.value === current)) {
    els.filterCategory.value = current;
  }
}

function renderTable() {
  if (rendering) return;
  rendering = true;
  const hasData = state.transactions.length > 0;
  els.empty.classList.toggle("is-hidden", hasData);
  els.workspace.classList.toggle("is-hidden", !hasData);
  refreshCategoryOptions();

  const visible = getFiltered();
  // Cap DOM rows for snappy UI; search narrows naturally.
  const MAX = 400;
  const slice = visible.slice(0, MAX);
  updateStats(visible);

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
        <td><input class="cell-cat${cat ? " has-value" : ""}" list="category-datalist" data-cat="${t.id}" value="${escapeHtml(cat)}" placeholder="หมวด…" /></td>
        <td><input class="cell-note" data-note="${t.id}" value="${escapeHtml(t.note || "")}" placeholder="คอมเมนต์…" /></td>
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
    els.btnAuth.title = currentUser.email;
  } else {
    els.btnAuth.textContent = "เข้าสู่ระบบ Google";
    els.btnAuth.title = ALLOWED_EMAIL;
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
        updateAuthButton();
        setSync("อนุญาตเฉพาะบัญชีเจ้าของ");
        toast(`อนุญาตเฉพาะ ${ALLOWED_EMAIL}`);
        return;
      }
      currentUser = user;
      updateAuthButton();
      if (!user) {
        setSync("บันทึกอัตโนมัติในเครื่อง");
        return;
      }
      setSync(`เข้าสู่ระบบแล้ว · ${user.email}`);
      try {
        const remote = await pullCloudState(user.uid);
        if (remote && Array.isArray(remote.transactions) && remote.transactions.length) {
          // Prefer richer cloud copy when local empty or remote newer-ish larger
          if (!state.transactions.length || remote.transactions.length >= state.transactions.length) {
            state.transactions = remote.transactions;
            if (remote.categories?.length) state.categories = remote.categories;
            if (remote.rules?.length) state.rules = remote.rules;
            saveState(state);
            renderTable();
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
    });
  } catch (err) {
    console.warn(err);
    cloudReady = false;
    setSync("โหมดออฟไลน์ · บันทึกในเครื่อง");
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

  els.btnExport.addEventListener("click", () => {
    const rows = getFiltered();
    if (!rows.length) {
      toast("ยังไม่มีข้อมูลให้ Export");
      return;
    }
    exportWorkbook(rows);
    toast(`Export XLSX · ${rows.length.toLocaleString("th-TH")} รายการ`);
  });

  els.btnAuth.addEventListener("click", async () => {
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
  });

  const goPeerland = () => startPeerland({ replace: true }).catch((err) => toast(err.message));
  const goDemo = () => startDemo({ replace: true }).catch((err) => toast(err.message));
  els.btnPeerland?.addEventListener("click", goPeerland);
  els.btnPeerlandHero?.addEventListener("click", goPeerland);
  els.btnDemo?.addEventListener("click", goDemo);
}

wireEvents();
renderTable();
setupAuth();

const params = new URLSearchParams(window.location.search);
if (params.get("peerland") === "1" || location.hash === "#peerland") {
  startPeerland({ replace: true }).catch((err) => toast(err.message));
} else if (!state.transactions.length && (params.get("demo") === "1" || location.hash === "#demo")) {
  startDemo({ replace: true }).catch((err) => toast(err.message));
}
