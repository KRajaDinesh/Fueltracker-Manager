// FuelRideManager/js/expenses.js
// DB version - UPDATED + Maintenance toggles + robust actions + Service cards + Self cards
// + Self item datalist + case-insensitive item merge + Self "Company" field
import { openModal } from "./main.js";
import { buildPie, destroyChart } from "./charts.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n) {
  return `₹${num(n).toFixed(2)}`;
}
function fmtDate(d) {
  return d || "";
}
function prettyDate(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(dt);
}
function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// ---- Self item normalization + display ----
function normItemKey(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
function titleCase(s) {
  const clean = String(s ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean
    .split(" ")
    .map(w => (w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : ""))
    .join(" ");
}
function updateSelfItemDatalist(displayMap) {
  const dl = document.getElementById("selfItemList");
  if (!dl) return;
  dl.innerHTML = "";

  const labels = [...displayMap.values()]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  for (const label of labels) {
    const opt = document.createElement("option");
    opt.value = label;
    dl.appendChild(opt);
  }
}

async function apiGet(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return await res.json();
}
async function apiSend(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} failed`);
  return await res.json().catch(() => ({}));
}

// ---------- (Optional) Export helpers ----------
function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = cols.map(esc).join(",");
  const body = rows.map(r => cols.map(c => esc(r[c])).join(",")).join("\n");
  return head + "\n" + body;
}
function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportRows(rows, sheetName, filenameBase) {
  if (window.XLSX) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([out], { type: "application/octet-stream" }), `${filenameBase}.xlsx`);
  } else {
    downloadBlob(new Blob([toCSV(rows)], { type: "text/csv" }), `${filenameBase}.csv`);
  }
}

// ---------- Service Cards ----------
function renderServiceCards(serviceRows) {
  const elTotal = document.getElementById("svcTotalAmount");
  const elLast = document.getElementById("svcLastService");

  const rows = Array.isArray(serviceRows) ? serviceRows : [];
  const total = rows.reduce((sum, r) => sum + num(r?.amount), 0);

  if (elTotal) elTotal.textContent = money(total);

  if (!rows.length) {
    if (elLast) elLast.textContent = "No Service Yet";
    return;
  }

  let latest = rows[0];
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const r of rows) {
    const t = new Date(r?.date || "").getTime();
    if (Number.isFinite(t) && t > latestTime) {
      latestTime = t;
      latest = r;
    }
  }

  const d = prettyDate(latest?.date || "");
  const amt = money(latest?.amount);
  if (elLast) elLast.textContent = d ? `${d} • ${amt}` : amt;
}

// ---------- Self Cards ----------
function renderSelfCards(selfRows) {
  const elTotal = document.getElementById("selfTotalAmount");
  const elTop = document.getElementById("selfTopItem");

  const rows = Array.isArray(selfRows) ? selfRows : [];
  const total = rows.reduce((sum, r) => sum + num(r?.amount), 0);
  if (elTotal) elTotal.textContent = money(total);

  if (!rows.length) {
    if (elTop) elTop.textContent = "No Records Yet";
    return;
  }

  // aggregate by normalized item
  const byKey = new Map();      // key -> totalAmount
  const displayMap = new Map(); // key -> label

  for (const r of rows) {
    const raw = String(r?.item ?? "Other").trim();
    const key = normItemKey(raw) || "other";
    if (!displayMap.has(key)) displayMap.set(key, titleCase(raw) || "Other");
    byKey.set(key, (byKey.get(key) || 0) + num(r?.amount));
  }

  // find max
  let bestKey = null;
  let bestVal = -Infinity;
  for (const [k, v] of byKey.entries()) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }

  if (!bestKey) {
    if (elTop) elTop.textContent = "—";
    return;
  }

  const label = displayMap.get(bestKey) || "Other";
  if (elTop) elTop.textContent = `${label} • ${money(bestVal)}`;
}

// ---------- Service UI ----------
function viewService(rec) {
  openModal("Service Maintenance Details", `
    <div class="grid2">
      <div><div class="small">Date</div><div>${fmtDate(rec.date)}</div></div>
      <div><div class="small">Location</div><div>${rec.location || ""}</div></div>
      <div><div class="small">Service No</div><div>${rec.serviceNo || ""}</div></div>
      <div><div class="small">Type</div><div>${rec.type || ""}</div></div>
      <div><div class="small">Amount</div><div>${money(rec.amount)}</div></div>
      <div style="grid-column:1/-1"><div class="small">Notes</div><div>${rec.notes || ""}</div></div>
    </div>
  `);
}

function editService(rec, onSave) {
  openModal("Edit Service Maintenance", `
    <form id="editSvcForm">
      <div class="grid2">
        <div class="field"><label>Date</label><input name="date" type="date" value="${rec.date || ""}" required></div>
        <div class="field"><label>Location</label><input name="location" value="${rec.location || ""}" required></div>
        <div class="field"><label>Service No</label><input name="serviceNo" value="${rec.serviceNo || ""}"></div>
        <div class="field">
          <label>Type</label>
          <select name="type">
            <option ${rec.type === "Free" ? "selected" : ""}>Free</option>
            <option ${rec.type === "Paid" ? "selected" : ""}>Paid</option>
          </select>
        </div>
        <div class="field"><label>Amount</label><input name="amount" type="number" step="0.01" value="${num(rec.amount)}"></div>
        <div class="field"><label>Notes</label><input name="notes" value="${rec.notes || ""}"></div>
      </div>
      <div class="actions">
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  document.getElementById("editSvcForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);

    const updated = {
      id: rec.id,
      date: f.get("date"),
      location: f.get("location"),
      serviceNo: f.get("serviceNo"),
      type: f.get("type"),
      amount: num(f.get("amount")),
      notes: f.get("notes")
    };

    onSave(updated);
    document.getElementById("modalBackdrop")?.classList.remove("show");
  });
}

function renderService(serviceRows) {
  const tbody = document.getElementById("svcTbody");
  if (tbody) tbody.innerHTML = "";

  const rows = [...serviceRows].sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${r.location || ""}</td>
      <td>${r.serviceNo || ""}</td>
      <td>${r.type || ""}</td>
      <td>${money(r.amount)}</td>
      <td>
        <div class="t-actions">
          <button class="iconbtn" type="button" title="View" data-act="viewSvc" data-id="${r.id}">👁️</button>
          <button class="iconbtn" type="button" title="Edit" data-act="editSvc" data-id="${r.id}">✏️</button>
          <button class="iconbtn" type="button" title="Delete" data-act="delSvc" data-id="${r.id}">🗑️</button>
        </div>
      </td>
    `;
    tbody?.appendChild(tr);
  }
}

// ---------- Self UI ----------
let selfPie = null;

function viewSelf(rec) {
  openModal("Self Maintenance Details", `
    <div class="grid2">
      <div><div class="small">Date</div><div>${fmtDate(rec.date)}</div></div>
      <div><div class="small">Item</div><div>${rec.item || ""}</div></div>
      <div><div class="small">Company</div><div>${rec.company || ""}</div></div>
      <div><div class="small">Quantity</div><div>${num(rec.qty)}</div></div>
      <div><div class="small">Amount</div><div>${money(rec.amount)}</div></div>
      <div style="grid-column:1/-1"><div class="small">Notes</div><div>${rec.notes || ""}</div></div>
    </div>
  `);
}

function editSelf(rec, onSave) {
  openModal("Edit Self Maintenance", `
    <form id="editSelfForm">
      <div class="grid2">
        <div class="field"><label>Date</label><input name="date" type="date" value="${rec.date || ""}" required></div>
        <div class="field"><label>Item</label><input name="item" value="${rec.item || ""}" required></div>
        <div class="field"><label>Company</label><input name="company" value="${rec.company || ""}"></div>
        <div class="field"><label>Qty</label><input name="qty" type="number" value="${num(rec.qty)}" required></div>
        <div class="field"><label>Amount</label><input name="amount" type="number" step="0.01" value="${num(rec.amount)}" required></div>
        <div class="field" style="grid-column:1/-1"><label>Notes</label><input name="notes" value="${rec.notes || ""}"></div>
      </div>
      <div class="actions">
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  document.getElementById("editSelfForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);

    const updated = {
      id: rec.id,
      date: f.get("date"),
      item: titleCase(f.get("item")),
      company: String(f.get("company") ?? "").trim(),
      qty: Math.max(1, num(f.get("qty"))),
      amount: num(f.get("amount")),
      notes: f.get("notes")
    };

    onSave(updated);
    document.getElementById("modalBackdrop")?.classList.remove("show");
  });
}

function renderSelf(selfRows) {
  const tbody = document.getElementById("selfTbody");
  if (tbody) tbody.innerHTML = "";

  const rows = [...selfRows].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Build pie: sum amounts by item (case-insensitive)
  const byKey = new Map();        // key -> totalAmount
  const displayMap = new Map();   // key -> nice label

  for (const r of rows) {
    const raw = String(r.item ?? "Other").trim();
    const key = normItemKey(raw) || "other";

    if (!displayMap.has(key)) {
      displayMap.set(key, titleCase(raw) || "Other");
    }

    byKey.set(key, (byKey.get(key) || 0) + num(r.amount));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${displayMap.get(key) || (r.item || "")}</td>
      <td>${num(r.qty)}</td>
      <td>${money(r.amount)}</td>
      <td>
        <div class="t-actions">
          <button class="iconbtn" type="button" title="View" data-act="viewSelf" data-id="${r.id}">👁️</button>
          <button class="iconbtn" type="button" title="Edit" data-act="editSelf" data-id="${r.id}">✏️</button>
          <button class="iconbtn" type="button" title="Delete" data-act="delSelf" data-id="${r.id}">🗑️</button>
        </div>
      </td>
    `;
    tbody?.appendChild(tr);
  }

  // update dropdown suggestions from existing records
  updateSelfItemDatalist(displayMap);

  const canvas = document.getElementById("selfPie");
  if (canvas) {
    const keys = [...byKey.keys()];
    const labels = keys.map(k => displayMap.get(k));
    const data = keys.map(k => Number(byKey.get(k).toFixed(2)));
    selfPie = destroyChart(selfPie);
    if (labels.length) selfPie = buildPie(canvas, labels, data);
  }
}

// ---------- Init ----------
export async function initExpenses() {
  let serviceRows = await apiGet("/api/expenses/service");
  let selfRows = await apiGet("/api/expenses/self");

  renderService(serviceRows);
  renderSelf(selfRows);
  renderServiceCards(serviceRows);
  renderSelfCards(selfRows);

  // ---- Toggle "View all" for records ----
  const svcWrap = document.getElementById("svcRecordsWrap");
  const svcBtn = document.getElementById("toggleSvcRecords");
  if (svcWrap) svcWrap.style.display = "none";
  svcBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = svcWrap?.style.display !== "none";
    if (svcWrap) svcWrap.style.display = isOpen ? "none" : "block";
    if (svcBtn) svcBtn.textContent = isOpen ? "View all" : "Hide";
  });

  const selfWrap = document.getElementById("selfRecordsWrap");
  const selfBtn = document.getElementById("toggleSelfRecords");
  if (selfWrap) selfWrap.style.display = "none";
  selfBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const isOpen = selfWrap?.style.display !== "none";
    if (selfWrap) selfWrap.style.display = isOpen ? "none" : "block";
    if (selfBtn) selfBtn.textContent = isOpen ? "View all" : "Hide";
  });

  // Add Service
  const svcForm = document.getElementById("serviceForm");
  svcForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(svcForm);

    const rec = {
      id: uid("svc"),
      date: f.get("date"),
      location: f.get("location"),
      serviceNo: f.get("serviceNo"),
      type: f.get("type"),
      amount: num(f.get("amount")),
      notes: f.get("notes")
    };

    await apiSend("/api/expenses/service", "POST", rec);
    serviceRows = await apiGet("/api/expenses/service");
    renderService(serviceRows);
    renderServiceCards(serviceRows);
    svcForm.reset();
  });

  // Add Self
  const selfForm = document.getElementById("selfForm");
  selfForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(selfForm);

    const rawItem = String(f.get("item") ?? "");
    const canonicalItem = titleCase(rawItem);
    const company = String(f.get("company") ?? "").trim();

    const rec = {
      id: uid("self"),
      date: f.get("date"),
      item: canonicalItem,
      company,
      qty: Math.max(1, num(f.get("qty"))),
      amount: num(f.get("amount")),
      notes: f.get("notes")
    };

    await apiSend("/api/expenses/self", "POST", rec);
    selfRows = await apiGet("/api/expenses/self");
    renderSelf(selfRows);
    renderSelfCards(selfRows);
    selfForm.reset();
  });

  // Actions (robust delegation)
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act][data-id]");
    if (!btn) return;

    e.preventDefault();

    const act = btn.dataset.act;
    const id = btn.dataset.id;

    try {
      // Service
      if (act === "viewSvc") {
        const rec = serviceRows.find(x => x.id === id);
        if (rec) viewService(rec);
        return;
      }
      if (act === "editSvc") {
        const rec = serviceRows.find(x => x.id === id);
        if (!rec) return;
        editService(rec, async (updated) => {
          await apiSend(`/api/expenses/service/${id}`, "PUT", updated);
          serviceRows = await apiGet("/api/expenses/service");
          renderService(serviceRows);
          renderServiceCards(serviceRows);
        });
        return;
      }
      if (act === "delSvc") {
        if (!confirm("Delete this service record?")) return;
        await apiSend(`/api/expenses/service/${id}`, "DELETE");
        serviceRows = await apiGet("/api/expenses/service");
        renderService(serviceRows);
        renderServiceCards(serviceRows);
        return;
      }

      // Self
      if (act === "viewSelf") {
        const rec = selfRows.find(x => x.id === id);
        if (rec) viewSelf(rec);
        return;
      }
      if (act === "editSelf") {
        const rec = selfRows.find(x => x.id === id);
        if (!rec) return;
        editSelf(rec, async (updated) => {
          await apiSend(`/api/expenses/self/${id}`, "PUT", updated);
          selfRows = await apiGet("/api/expenses/self");
          renderSelf(selfRows);
          renderSelfCards(selfRows);
        });
        return;
      }
      if (act === "delSelf") {
        if (!confirm("Delete this self maintenance record?")) return;
        await apiSend(`/api/expenses/self/${id}`, "DELETE");
        selfRows = await apiGet("/api/expenses/self");
        renderSelf(selfRows);
        renderSelfCards(selfRows);
        return;
      }
    } catch (err) {
      console.error(err);
      alert("Action failed. Check console for error.");
    }
  });

  // Export (optional buttons)
  document.getElementById("exportService")?.addEventListener("click", () => {
    exportRows(
      serviceRows.map(r => ({
        Date: r.date,
        Location: r.location,
        ServiceNo: r.serviceNo,
        Type: r.type,
        Amount: r.amount,
        Notes: r.notes
      })),
      "Service",
      `Service_${Date.now()}`
    );
  });

  document.getElementById("exportSelf")?.addEventListener("click", () => {
    exportRows(
      selfRows.map(r => ({
        Date: r.date,
        Item: r.item,
        Company: r.company || "",
        Qty: r.qty,
        Amount: r.amount,
        Notes: r.notes
      })),
      "SelfMaintenance",
      `SelfMaintenance_${Date.now()}`
    );
  });
}