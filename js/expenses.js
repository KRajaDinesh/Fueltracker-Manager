// FuelRideManager/js/expenses.js
import { openModal } from "./main.js";
import { buildPie, destroyChart } from "./charts.js";

const API_BASE = "https://fueltracker-manager-api.onrender.com";

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

// ---- API FIX (IMPORTANT PART) ----
async function apiGet(path) {
  const res = await fetch(API_BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return await res.json();
}

async function apiSend(path, method, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} failed`);
  return await res.json().catch(() => ({}));
}

// ---------- Init ----------
export async function initExpenses() {
  let serviceRows = await apiGet("/api/expenses/service");
  let selfRows = await apiGet("/api/expenses/self");

  renderService(serviceRows);
  renderSelf(selfRows);

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
    svcForm.reset();
  });

  // Add Self
  const selfForm = document.getElementById("selfForm");
  selfForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(selfForm);

    const rec = {
      id: uid("self"),
      date: f.get("date"),
      item: f.get("item"),
      company: f.get("company"),
      qty: num(f.get("qty")),
      amount: num(f.get("amount")),
      notes: f.get("notes")
    };

    await apiSend("/api/expenses/self", "POST", rec);
    selfRows = await apiGet("/api/expenses/self");
    renderSelf(selfRows);
    selfForm.reset();
  });

  // Actions
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act][data-id]");
    if (!btn) return;

    const act = btn.dataset.act;
    const id = btn.dataset.id;

    if (act === "delSvc") {
      await apiSend(`/api/expenses/service/${id}`, "DELETE");
      serviceRows = await apiGet("/api/expenses/service");
      renderService(serviceRows);
    }

    if (act === "delSelf") {
      await apiSend(`/api/expenses/self/${id}`, "DELETE");
      selfRows = await apiGet("/api/expenses/self");
      renderSelf(selfRows);
    }
  });
}

// ---------- RENDER ----------
function renderService(rows) {
  const tbody = document.getElementById("svcTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${r.location || ""}</td>
      <td>${r.serviceNo || ""}</td>
      <td>${r.type || ""}</td>
      <td>${money(r.amount)}</td>
      <td>
        <button data-act="delSvc" data-id="${r.id}">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function renderSelf(rows) {
  const tbody = document.getElementById("selfTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${r.item || ""}</td>
      <td>${r.company || ""}</td>
      <td>${r.qty}</td>
      <td>${money(r.amount)}</td>
      <td>
        <button data-act="delSelf" data-id="${r.id}">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}