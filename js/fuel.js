// js/fuel.js
import { openModal } from "./main.js";
import { buildBarLine, buildLine, destroyChart } from "./charts.js";

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
function uid() {
  return "fuel_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return await res.json();
}
async function apiSend(path, method, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${method} ${path} failed`);
  return await res.json().catch(() => ({}));
}

/**
 * Lifetime range text for cards (small line)
 */
function getLifetimeText(records) {
  const dates = records
    .map(r => new Date(r.date))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);

  if (!dates.length) return "Range: —";

  const first = dates[0].toISOString().slice(0, 10);
  const last = dates[dates.length - 1].toISOString().slice(0, 10);

  return first === last ? `Range: ${first}` : `Range: ${first} → ${last}`;
}

/**
 * Locked mileage rule:
 * - compute by sorting by odometer
 * - display sorted by date
 * - Distance/Mileage belong to the PREVIOUS stop (A), measured at the NEXT stop (B)
 * - if cannot compute mileage -> blank
 */
function computeDerived(records) {
  const list = records.map(r => ({ ...r }));

  const byOdo = [...list].sort((a, b) => num(a.odometer) - num(b.odometer));

  for (const r of byOdo) {
    r._distance = null;
    r._mileage = null;
  }

  let prev = null;
  for (const cur of byOdo) {
    if (prev && num(cur.odometer) > num(prev.odometer)) {
      const dist = num(cur.odometer) - num(prev.odometer);
      prev._distance = dist;

      const litresPrev = num(prev.litres);
      if (litresPrev > 0) prev._mileage = dist / litresPrev;
    }
    prev = cur;
  }

  const map = new Map(byOdo.map(r => [r.id, r]));
  return list.map(r => {
    const d = map.get(r.id);
    return {
      ...r,
      _distance: d?._distance ?? null,
      _mileage: d?._mileage ?? null
    };
  });
}

function kpi(records) {
  const litres = records.reduce((s, r) => s + num(r.litres), 0);
  const spent = records.reduce((s, r) => s + num(r.amountPaid), 0);
  const count = records.length;

  const mileages = records
    .map(r => r._mileage)
    .filter(v => typeof v === "number" && isFinite(v) && v > 0);

  const avg = mileages.length ? (mileages.reduce((s, v) => s + v, 0) / mileages.length) : null;
  const best = mileages.length ? Math.max(...mileages) : null;
  const worst = mileages.length ? Math.min(...mileages) : null;

  const totalDist = records.reduce((s, r) => s + (num(r._distance) > 0 ? num(r._distance) : 0), 0);
  const cpk = totalDist > 0 ? (spent / totalDist) : null;

  return { litres, spent, count, avg, best, worst, cpk };
}

function renderKPIs(records) {
  const { litres, spent, count, avg, best, worst, cpk } = kpi(records);
  const rangeText = getLifetimeText(records);

  const kpiLitres = document.getElementById("kpiLitres");
  const kpiSpent = document.getElementById("kpiSpent");
  const kpiCount = document.getElementById("kpiCount");
  const kpiAvg = document.getElementById("kpiAvg");
  const kpiBest = document.getElementById("kpiBest");
  const kpiWorst = document.getElementById("kpiWorst");
  const kpiCpk = document.getElementById("kpiCpk");

  if (kpiLitres) {
    const v = litres ? `${litres.toFixed(2)} L` : "—";
    kpiLitres.innerHTML = `${v}<div class="small">${rangeText}</div>`;
  }
  if (kpiSpent) {
    const v = spent ? money(spent) : "—";
    kpiSpent.innerHTML = `${v}<div class="small">${rangeText}</div>`;
  }
  if (kpiCount) {
    const v = count ? String(count) : "—";
    kpiCount.innerHTML = `${v}<div class="small">${rangeText}</div>`;
  }

  if (kpiAvg) kpiAvg.textContent = avg ? `${avg.toFixed(2)} km/l` : "—";
  if (kpiBest) kpiBest.textContent = best ? `Best: ${best.toFixed(2)} km/l` : "Best: —";
  if (kpiWorst) kpiWorst.textContent = worst ? `Worst: ${worst.toFixed(2)} km/l` : "Worst: —";
  if (kpiCpk) kpiCpk.textContent = cpk ? `Cost per KM: ${money(cpk)}` : "Cost per KM: —";
}

function renderTable(records) {
  const tbody = document.getElementById("fuelTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const rows = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${r.location || ""}</td>
      <td>${r.station || ""}</td>
      <td>${num(r.pricePerLitre).toFixed(2)}</td>
      <td>${money(r.amountPaid)}</td>
      <td>${num(r.litres).toFixed(2)}</td>
      <td>${num(r.odometer).toFixed(1)}</td>
      <td>${r.payMethod || ""}</td>
      <td>${r.remarks || ""}</td>
      <td>
        <div class="t-actions">
          <button class="iconbtn" title="View" data-act="view" data-id="${r.id}">👁️</button>
          <button class="iconbtn" title="Edit" data-act="edit" data-id="${r.id}">✏️</button>
          <button class="iconbtn" title="Delete" data-act="del" data-id="${r.id}">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function viewRecord(r) {
  const dist = (typeof r._distance === "number" && r._distance > 0) ? r._distance : null;
  const mil = (typeof r._mileage === "number" && r._mileage > 0) ? r._mileage : null;
  const cpk = (dist && num(r.amountPaid) > 0) ? (num(r.amountPaid) / dist) : null;

  openModal("Fuel Record Details", `
    <div class="grid2">
      <div><div class="small">Date</div><div>${fmtDate(r.date)}</div></div>
      <div><div class="small">Location</div><div>${r.location || ""}</div></div>
      <div><div class="small">Station</div><div>${r.station || ""}</div></div>
      <div><div class="small">Payment</div><div>${r.payMethod || ""}</div></div>

      <div><div class="small">Price/Litre</div><div>${num(r.pricePerLitre).toFixed(2)}</div></div>
      <div><div class="small">Litres</div><div>${num(r.litres).toFixed(2)} L</div></div>
      <div><div class="small">Amount Paid</div><div>${money(r.amountPaid)}</div></div>
      <div><div class="small">Odometer</div><div>${num(r.odometer).toFixed(1)}</div></div>

      <div><div class="small">Trip A</div><div>${r.tripA || ""}</div></div>
      <div><div class="small">Trip B</div><div>${r.tripB || ""}</div></div>
      <div><div class="small">Trip F</div><div>${r.tripF || ""}</div></div>
      <div><div class="small">Remarks</div><div>${r.remarks || ""}</div></div>

      <div><div class="small">Distance Travelled</div><div>${dist ? `${dist} km` : "—"}</div></div>
      <div><div class="small">Mileage</div><div>${mil ? `${mil.toFixed(2)} km/l` : "—"}</div></div>
      <div><div class="small">Cost per KM</div><div>${cpk ? money(cpk) : "—"}</div></div>
    </div>
  `);
}

function editRecord(r, onSave) {
  openModal("Edit Fuel Record", `
    <form id="editFuelForm">
      <div class="grid2">
        <div class="field"><label>Date</label><input name="date" type="date" value="${r.date || ""}" required></div>
        <div class="field"><label>Location</label><input name="location" value="${r.location || ""}"></div>
        <div class="field"><label>Station</label><input name="station" value="${r.station || ""}"></div>
        <div class="field"><label>Price/Litre</label><input name="pricePerLitre" type="number" step="0.01" value="${num(r.pricePerLitre)}" required></div>

        <div class="field"><label>Litres</label><input name="litres" type="number" step="0.01" value="${num(r.litres)}" required></div>
        <div class="field"><label>Amount Paid</label><input name="amountPaid" type="number" step="0.01" value="${num(r.amountPaid)}" required></div>

        <div class="field"><label>Payment</label>
          <select name="payMethod">
            <option ${r.payMethod === "Cash" ? "selected" : ""}>Cash</option>
            <option ${r.payMethod === "UPI" ? "selected" : ""}>UPI</option>
          </select>
        </div>

        <div class="field"><label>Odometer</label><input name="odometer" type="number" step="0.1" value="${num(r.odometer)}" required></div>

        <div class="field"><label>Trip A</label><input name="tripA" value="${r.tripA || ""}"></div>
        <div class="field"><label>Trip B</label><input name="tripB" value="${r.tripB || ""}"></div>
        <div class="field"><label>Trip F</label><input name="tripF" value="${r.tripF || ""}"></div>
        <div class="field"><label>Remarks</label><input name="remarks" value="${r.remarks || ""}"></div>
      </div>

      <div class="actions">
        <button type="button" class="btn ghost" id="cancelEdit">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  document.getElementById("cancelEdit")?.addEventListener("click", () => {
    document.getElementById("modalBackdrop")?.classList.remove("show");
  });

  document.getElementById("editFuelForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target);

    const updated = {
      ...r,
      date: f.get("date"),
      location: f.get("location"),
      station: f.get("station"),
      pricePerLitre: num(f.get("pricePerLitre")),
      litres: num(f.get("litres")),
      amountPaid: num(f.get("amountPaid")),
      payMethod: f.get("payMethod"),
      odometer: num(f.get("odometer")),
      tripA: f.get("tripA"),
      tripB: f.get("tripB"),
      tripF: f.get("tripF"),
      remarks: f.get("remarks")
    };

    onSave(updated);
    document.getElementById("modalBackdrop")?.classList.remove("show");
  });
}

function groupMonthly(records) {
  const map = new Map();
  for (const r of records) {
    const d = new Date(r.date);
    if (isNaN(d)) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) || { litres: 0, amount: 0 };
    cur.litres += num(r.litres);
    cur.amount += num(r.amountPaid);
    map.set(key, cur);
  }
  const keys = [...map.keys()].sort();
  return {
    labels: keys,
    litres: keys.map(k => map.get(k).litres),
    amount: keys.map(k => map.get(k).amount)
  };
}

let fuelChart = null;
let costChart = null;

function renderCharts(records) {
  const snap = groupMonthly(records);
  const c1 = document.getElementById("fuelChart");
  if (c1) {
    fuelChart = destroyChart(fuelChart);
    fuelChart = buildBarLine(
      c1,
      snap.labels,
      "Litres",
      snap.litres.map(x => Number(x.toFixed(2))),
      "Amount",
      snap.amount.map(x => Number(x.toFixed(2)))
    );
  }

  const points = [...records]
    .filter(r => typeof r._distance === "number" && r._distance > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = points.map(r => fmtDate(r.date));
  const cpk = points.map(r => num(r.amountPaid) / num(r._distance));

  const c2 = document.getElementById("costChart");
  if (c2) {
    costChart = destroyChart(costChart);
    costChart = buildLine(c2, labels, "Cost per KM", cpk.map(x => Number(x.toFixed(2))));
  }
}

function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
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

function exportFuel(records) {
  const rows = records
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(r => ({
      Date: r.date,
      Location: r.location,
      Station: r.station,
      PricePerLitre: r.pricePerLitre,
      Litres: r.litres,
      AmountPaid: r.amountPaid,
      PayMethod: r.payMethod,
      Odometer: r.odometer,
      TripA: r.tripA,
      TripB: r.tripB,
      TripF: r.tripF,
      Remarks: r.remarks,
      Distance: r._distance ?? "",
      Mileage: r._mileage ? Number(r._mileage.toFixed(2)) : ""
    }));

  if (window.XLSX) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Fuel");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([out], { type: "application/octet-stream" }), `Fuel_${Date.now()}.xlsx`);
  } else {
    const csv = toCSV(rows);
    downloadBlob(new Blob([csv], { type: "text/csv" }), `Fuel_${Date.now()}.csv`);
  }
}

export async function initFuel() {
  let records = computeDerived(await apiGet("/api/fuel"));

  const form = document.getElementById("fuelForm");
  const priceEl = form?.querySelector('[name="pricePerLitre"]');
  const amountEl = form?.querySelector('[name="amountPaid"]');
  const litresEl = form?.querySelector('[name="litres"]');

  function autoCalcLitres() {
    const price = num(priceEl?.value);
    const amount = num(amountEl?.value);
    if (price > 0 && amount > 0) litresEl.value = (amount / price).toFixed(2);
  }

  priceEl?.addEventListener("input", autoCalcLitres);
  amountEl?.addEventListener("input", autoCalcLitres);

  renderKPIs(records);
  renderTable(records);
  renderCharts(records);

  form?.addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(form);

    const litres = num(f.get("litres"));
    const price = num(f.get("pricePerLitre"));
    const amountPaid = num(f.get("amountPaid")) || +(litres * price).toFixed(2);

    const rec = {
      id: uid(),
      date: f.get("date"),
      location: f.get("location"),
      station: f.get("station"),
      pricePerLitre: price,
      litres,
      amountPaid,
      payMethod: f.get("payMethod"),
      odometer: num(f.get("odometer")),
      tripA: f.get("tripA"),
      tripB: f.get("tripB"),
      tripF: f.get("tripF"),
      remarks: f.get("remarks")
    };

    await apiSend("/api/fuel", "POST", rec);

    records = computeDerived(await apiGet("/api/fuel"));
    renderKPIs(records);
    renderTable(records);
    renderCharts(records);
    form.reset();
  });

  document.getElementById("fuelTbody")?.addEventListener("click", async e => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const act = btn.dataset.act;
    const id = btn.dataset.id;
    const rec = records.find(x => x.id === id);

    if (!rec) return;

    if (act === "view") viewRecord(rec);

    if (act === "edit") {
      editRecord(rec, async updated => {
        await apiSend(`/api/fuel/${id}`, "PUT", updated);
        records = computeDerived(await apiGet("/api/fuel"));
        renderKPIs(records);
        renderTable(records);
        renderCharts(records);
      });
    }

    if (act === "del") {
      if (!confirm("Delete this fuel record?")) return;
      await apiSend(`/api/fuel/${id}`, "DELETE", {});
      records = computeDerived(await apiGet("/api/fuel"));
      renderKPIs(records);
      renderTable(records);
      renderCharts(records);
    }
  });

  document.getElementById("exportFuel")?.addEventListener("click", () => {
    exportFuel(records);
  });
}