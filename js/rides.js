// FuelRideManager/js/rides.js
// Fuel-like behavior: View/Edit/Delete + Export
// + Fuel ↔ Ride mapping (partial overlap) + Avg ₹/L + Estimated mileage in View

import { openModal } from "./main.js";

const API_BASE = "https://fueltracker-manager-api.onrender.com";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n) {
  return `₹${num(n).toFixed(2)}`;
}
function uid() {
  return "ride_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}
function safeParseJSON(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
function fmtDate(d) { return d || ""; }

async function apiGet(path) {
  const res = await fetch(API_BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return await res.json();
}
async function apiSend(path, method, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(`${method} ${path} failed`);
  return await res.json().catch(() => ({}));
}

/* -----------------------------
   Normalizers
----------------------------- */

function normalizeRide(r) {
  const waitTimes = safeParseJSON(r.waitTimes, []);
  const miscArr = safeParseJSON(r.misc, []);

  const miscAmt =
    (r.miscAmt !== undefined && r.miscAmt !== null)
      ? num(r.miscAmt)
      : (Array.isArray(miscArr) ? miscArr.reduce((s, it) => s + num(it?.amount), 0) : 0);

  return {
    ...r,
    rideName: r.rideName || "",
    routeVia: r.routeVia || "",
    dateFrom: r.dateFrom || "",
    dateTo: r.dateTo || "",
    timeStart: r.timeStart || "",
    timeEnd: r.timeEnd || "",
    odoStart: num(r.odoStart),
    odoEnd: num(r.odoEnd),
    stops: Math.max(0, Math.floor(num(r.stops))),
    waitTimes: Array.isArray(waitTimes) ? waitTimes : [],
    miscAmt,
    remarks: r.remarks || ""
  };
}

function normalizeFuel(f) {
  return {
    ...f,
    id: f.id,
    date: f.date || "",
    odometer: num(f.odometer),
    litres: num(f.litres),
    amountPaid: num(f.amountPaid),
    pricePerLitre: num(f.pricePerLitre),
    location: f.location || "",
    station: f.station || "",
    payMethod: f.payMethod || ""
  };
}

function rideDerived(r) {
  const distance = (r.odoEnd > r.odoStart) ? (r.odoEnd - r.odoStart) : null;

  const wt = Array.isArray(r.waitTimes) ? r.waitTimes : [];
  const waitTotal = wt.reduce((s, x) => s + num(x), 0);

  let travelMins = 0;
  if (r.timeStart && r.timeEnd && r.dateFrom && r.dateTo) {
    const start = new Date(`${r.dateFrom}T${r.timeStart}`);
    const end = new Date(`${r.dateTo}T${r.timeEnd}`);
    if (end > start) travelMins = Math.floor((end - start) / 60000);
  }

  return { distance, waitTotal, travelMins };
}

function fmtMins(mins) {
  const m = Math.max(0, Math.floor(num(mins)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${mm}m` : `${mm}m`;
}

/* -----------------------------
   Fuel Windows + Mapping Engine
----------------------------- */

function buildFuelWindows(fuelRecords) {
  const fuels = [...fuelRecords]
    .map(normalizeFuel)
    .filter(f => f.odometer > 0)
    .sort((a, b) => a.odometer - b.odometer);

  const windows = [];
  for (let i = 0; i < fuels.length; i++) {
    const start = fuels[i];
    const end = fuels[i + 1] || null;

    if (!end) {
      windows.push({
        type: "open",
        startFuel: start,
        endFuel: null,
        startOdo: start.odometer,
        endOdo: null,
        windowDistance: null,
        litres: start.litres,
        amountPaid: start.amountPaid
      });
      continue;
    }

    const dist = end.odometer - start.odometer;
    if (!(dist > 0)) continue;

    windows.push({
      type: "closed",
      startFuel: start,
      endFuel: end,
      startOdo: start.odometer,
      endOdo: end.odometer,
      windowDistance: dist,
      litres: start.litres,
      amountPaid: start.amountPaid
    });
  }
  return windows;
}

function mapRideToFuelWindows(ride, windows) {
  const s = ride.odoStart;
  const e = ride.odoEnd;

  if (!(e > s)) {
    return {
      ok: false,
      reason: "Invalid ODO",
      overlaps: [],
      openOverlaps: [],
      summary: null
    };
  }

  const overlaps = [];
  const openOverlaps = [];

  for (const w of windows) {
    if (w.type === "closed") {
      const os = Math.max(s, w.startOdo);
      const oe = Math.min(e, w.endOdo);
      const od = oe - os;

      if (od > 0) {
        const share = w.windowDistance > 0 ? (od / w.windowDistance) : 0;
        const estLitres = (w.litres > 0) ? (w.litres * share) : 0;
        const estCost = (w.amountPaid > 0) ? (w.amountPaid * share) : 0;
        const estMileage = (estLitres > 0) ? (od / estLitres) : null;
        const avgCostPerLitre = (estLitres > 0) ? (estCost / estLitres) : null;

        overlaps.push({
          windowType: "closed",
          startOdo: w.startOdo,
          endOdo: w.endOdo,
          windowDistance: w.windowDistance,
          overlapStart: os,
          overlapEnd: oe,
          overlapDistance: od,
          share,
          estLitres,
          estCost,
          avgCostPerLitre,
          estMileage
        });
      }
    } else {
      if (e > w.startOdo) {
        const os = Math.max(s, w.startOdo);
        const oe = e;
        const od = oe - os;
        if (od > 0) {
          openOverlaps.push({
            windowType: "open",
            startOdo: w.startOdo,
            endOdo: null,
            overlapStart: os,
            overlapEnd: oe,
            overlapDistance: od
          });
        }
      }
    }
  }

  if (openOverlaps.length) {
    const totalOpen = openOverlaps.reduce((sum, x) => sum + x.overlapDistance, 0);
    return {
      ok: true,
      overlaps,
      openOverlaps,
      summary: {
        status: "waiting",
        openStartOdo: openOverlaps[0].startOdo,
        openOverlapKm: totalOpen
      }
    };
  }

  if (!overlaps.length) {
    return {
      ok: true,
      overlaps,
      openOverlaps,
      summary: { status: "no_match" }
    };
  }

  const dominant = [...overlaps].sort((a, b) => b.overlapDistance - a.overlapDistance)[0];

  const totalOverlapKm = overlaps.reduce((s0, x) => s0 + x.overlapDistance, 0);
  const totalEstLitres = overlaps.reduce((s0, x) => s0 + x.estLitres, 0);
  const totalEstCost = overlaps.reduce((s0, x) => s0 + x.estCost, 0);

  const totalEstMileage = (totalEstLitres > 0) ? (totalOverlapKm / totalEstLitres) : null;
  const totalAvgCostPerLitre = (totalEstLitres > 0) ? (totalEstCost / totalEstLitres) : null;

  return {
    ok: true,
    overlaps,
    openOverlaps,
    summary: {
      status: overlaps.length > 1 ? "split" : "single",
      dominant,
      windowsCount: overlaps.length,
      totalOverlapKm,
      totalEstLitres,
      totalEstCost,
      totalAvgCostPerLitre,
      totalEstMileage
    }
  };
}

function fuelShareLine(mapping) {
  if (!mapping?.summary) return `<div class="small">Fuel share: —</div>`;

  const s = mapping.summary;
  if (s.status === "waiting") return `<div class="small">Fuel share: Waiting</div>`;
  if (s.status === "no_match") return `<div class="small">Fuel share: —</div>`;

  const d = s.dominant;
  const pct = d?.share ? (d.share * 100) : 0;

  if (s.status === "split") {
    return `<div class="small">Fuel share: Split (${s.windowsCount}) • main ${pct.toFixed(1)}% (${d.startOdo.toFixed(0)}→${d.endOdo.toFixed(0)})</div>`;
  }
  return `<div class="small">Fuel share: ${pct.toFixed(1)}% (${d.startOdo.toFixed(0)}→${d.endOdo.toFixed(0)})</div>`;
}

function mappingHtml(mapping) {
  if (!mapping?.summary) return `<div class="small">No mapping data.</div>`;

  const s = mapping.summary;

  if (s.status === "waiting") {
    return `
      <div class="small">Fuel Window: <b>${s.openStartOdo.toFixed(0)} → (Open)</b></div>
      <div class="small">Status: <b>Waiting for next fuel refill</b> (FuelEnd not available)</div>
      <div class="small">Ride part inside open window: <b>${s.openOverlapKm.toFixed(1)} km</b></div>
      <div class="small" style="margin-top:8px">
        Est. Fuel Used: <b>—</b> • Est. Cost: <b>—</b> • Avg ₹/L: <b>—</b> • Est. Mileage: <b>—</b>
      </div>
    `;
  }

  if (s.status === "no_match") {
    return `<div class="small">No closed fuel window overlap found for this ride.</div>`;
  }

  const rows = mapping.overlaps
    .slice()
    .sort((a, b) => a.startOdo - b.startOdo)
    .map((x) => {
      const pct = (x.share * 100);
      return `
        <tr>
          <td>
            <b>${x.startOdo.toFixed(0)} → ${x.endOdo.toFixed(0)}</b>
            <div class="small">${x.windowDistance.toFixed(1)} km window</div>
          </td>
          <td>
            ${x.overlapStart.toFixed(0)} → ${x.overlapEnd.toFixed(0)}
            <div class="small">${x.overlapDistance.toFixed(1)} km overlap</div>
          </td>
          <td><b>${pct.toFixed(1)}%</b></td>
          <td>${x.estLitres ? `${x.estLitres.toFixed(2)} L` : "—"}</td>
          <td>${x.estCost ? money(x.estCost) : "—"}</td>
          <td>${x.avgCostPerLitre ? `₹${x.avgCostPerLitre.toFixed(2)}` : "—"}</td>
          <td>${x.estMileage ? `${x.estMileage.toFixed(2)} km/L` : "—"}</td>
        </tr>
      `;
    })
    .join("");

  const totalKm = s.totalOverlapKm ?? 0;
  const totalLitres = s.totalEstLitres ?? 0;
  const totalCost = s.totalEstCost ?? 0;

  return `
    <div class="table-wrap" style="margin-top:8px">
      <table>
        <thead>
          <tr>
            <th>Fuel Window</th>
            <th>Ride Overlap</th>
            <th>Share</th>
            <th>Est. Fuel</th>
            <th>Est. Cost</th>
            <th>Avg ₹/L</th>
            <th>Est. Mileage</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="small">No overlap rows</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="small" style="margin-top:10px">
      Total overlapped: <b>${totalKm.toFixed(1)} km</b> •
      Est. fuel used: <b>${totalLitres.toFixed(2)} L</b> •
      Est. cost: <b>${money(totalCost)}</b> •
      Avg ₹/L: <b>${s.totalAvgCostPerLitre ? `₹${s.totalAvgCostPerLitre.toFixed(2)}` : "—"}</b> •
      Est. ride mileage: <b>${s.totalEstMileage ? s.totalEstMileage.toFixed(2) : "—"} km/L</b>
      ${s.status === "split" ? ` • Windows: <b>${s.windowsCount}</b>` : ""}
    </div>

    <div class="small" style="margin-top:6px">
      Note: Estimates assume uniform fuel use inside each fuel window.
    </div>
  `;
}

/* -----------------------------
   KPIs
----------------------------- */

function renderKPIs(rides, fuelWindows) {
  const count = rides.length;
  let totalDistance = 0;
  let totalMinutes = 0;
  let totalEstLitres = 0;
  let totalEstCost = 0;

  for (const r of rides) {
    const d = rideDerived(r);

    if (typeof d.distance === "number" && d.distance > 0) {
      totalDistance += d.distance;
    }

    totalMinutes += d.travelMins;

    const mapping = mapRideToFuelWindows(r, fuelWindows);
    const s = mapping?.summary;

    if (s && s.status !== "waiting" && s.status !== "no_match") {
      totalEstLitres += num(s.totalEstLitres);
      totalEstCost += num(s.totalEstCost);
    }
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  const elCount = document.getElementById("rkpiCount");
  const elDist = document.getElementById("rkpiDistance");
  const elTime = document.getElementById("rkpiTravelTime");
  const elFuelUsed = document.getElementById("rkpiFuelUsed");
  const elFuelCost = document.getElementById("rkpiFuelCost");

  if (elCount) elCount.textContent = String(count);
  if (elDist) elDist.textContent = `${totalDistance.toFixed(1)} km`;
  if (elTime) elTime.textContent = `${hours}h ${mins}m`;
  if (elFuelUsed) elFuelUsed.textContent = totalEstLitres > 0 ? `${totalEstLitres.toFixed(2)} L` : "—";
  if (elFuelCost) elFuelCost.textContent = totalEstCost > 0 ? `Est. Cost: ${money(totalEstCost)}` : "Est. Cost: —";
}

/* -----------------------------
   Table
----------------------------- */

function renderTable(rides, fuelWindows) {
  const tbody = document.getElementById("rideTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const rows = [...rides].sort((a, b) => {
    const da = new Date(a.dateFrom || a.dateTo || 0).getTime();
    const db = new Date(b.dateFrom || b.dateTo || 0).getTime();
    return db - da;
  });

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="small" style="text-align:center;padding:20px;">
          No ride records yet. Start by adding a new ride.
        </td>
      </tr>
    `;
    return;
  }

  for (const r of rows) {
    const d = rideDerived(r);
    const odoLine = `${r.odoStart.toFixed(1)} → ${r.odoEnd.toFixed(1)}`;
    const dateLine = `${fmtDate(r.dateFrom)}${(r.dateTo && r.dateTo !== r.dateFrom) ? ` → ${fmtDate(r.dateTo)}` : ""}`;
    const timeLine = (r.timeStart || r.timeEnd) ? `${r.timeStart || "—"} → ${r.timeEnd || "—"}` : "—";
    const distLine = (typeof d.distance === "number" && d.distance > 0) ? `${d.distance.toFixed(1)} km` : "—";

    const mapping = mapRideToFuelWindows(r, fuelWindows);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.rideName || ""}</td>
      <td>${dateLine}</td>
      <td>${r.routeVia || ""}</td>
      <td>${odoLine}</td>
      <td>${distLine}</td>
      <td>${timeLine}</td>
      <td>
        ${r.stops}
        <div class="small">Wait: ${Math.round(d.waitTotal)}m</div>
        ${fuelShareLine(mapping)}
      </td>
      <td>${money(r.miscAmt || 0)}</td>
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

/* -----------------------------
   View / Edit
----------------------------- */

function viewRide(r, fuelWindows) {
  const d = rideDerived(r);
  const mapping = mapRideToFuelWindows(r, fuelWindows);

  openModal("Ride Record Details", `
    <div class="grid2">
      <div><div class="small">Ride</div><div>${r.rideName || ""}</div></div>
      <div><div class="small">Route</div><div>${r.routeVia || ""}</div></div>

      <div><div class="small">Start Date</div><div>${fmtDate(r.dateFrom)}</div></div>
      <div><div class="small">End Date</div><div>${fmtDate(r.dateTo)}</div></div>

      <div><div class="small">Start Time</div><div>${r.timeStart || "—"}</div></div>
      <div><div class="small">End Time</div><div>${r.timeEnd || "—"}</div></div>

      <div><div class="small">Start ODO</div><div>${r.odoStart.toFixed(1)}</div></div>
      <div><div class="small">End ODO</div><div>${r.odoEnd.toFixed(1)}</div></div>

      <div><div class="small">Distance</div><div>${(typeof d.distance === "number") ? `${d.distance.toFixed(1)} km` : "—"}</div></div>
      <div><div class="small">Travel Time</div><div>${fmtMins(d.travelMins)}</div></div>

      <div><div class="small">Stops</div><div>${r.stops}</div></div>
      <div><div class="small">Wait Total</div><div>${Math.round(d.waitTotal)} mins</div></div>

      <div><div class="small">Misc</div><div>${money(r.miscAmt || 0)}</div></div>
      <div><div class="small">Remarks</div><div>${r.remarks || "—"}</div></div>

      <div style="grid-column:1/-1;margin-top:6px;padding-top:10px;border-top:1px dashed rgba(255,255,255,.14);">
        <div style="font-weight:900;margin-bottom:6px">Fuel ↔ Ride Mapping</div>
        ${mappingHtml(mapping)}
      </div>
    </div>
  `);
}

function editRide(r, onSave) {
  const route = String(r.routeVia || "");
  const parts = route.includes("→") ? route.split("→").map(s => s.trim()) : ["", ""];
  const from = parts[0] || "";
  const to = parts[1] || "";

  const wt = Array.isArray(r.waitTimes) ? r.waitTimes : [];
  const waitMins = wt.length ? Math.round(wt.reduce((s, x) => s + num(x), 0)) : 0;

  openModal("Edit Ride Record", `
    <form id="editRideForm">
      <div class="grid2">
        <div class="field"><label>Start Date</label><input name="dateFrom" type="date" value="${r.dateFrom || ""}" required></div>
        <div class="field"><label>End Date</label><input name="dateTo" type="date" value="${r.dateTo || ""}" required></div>

        <div class="field" style="grid-column:1/-1"><label>Ride Title</label><input name="rideName" value="${r.rideName || ""}" required></div>

        <div class="field"><label>From</label><input name="from" value="${from}"></div>
        <div class="field"><label>To</label><input name="to" value="${to}"></div>

        <div class="field"><label>Start Time</label><input name="timeStart" type="time" value="${r.timeStart || ""}"></div>
        <div class="field"><label>End Time</label><input name="timeEnd" type="time" value="${r.timeEnd || ""}"></div>

        <div class="field"><label>Start ODO</label><input name="odoStart" type="number" step="0.1" value="${num(r.odoStart)}" required></div>
        <div class="field"><label>End ODO</label><input name="odoEnd" type="number" step="0.1" value="${num(r.odoEnd)}" required></div>

        <div class="field"><label>Stops</label><input name="stops" type="number" min="0" value="${num(r.stops)}"></div>
        <div class="field"><label>Wait (mins)</label><input name="waitMins" type="number" min="0" value="${waitMins}"></div>

        <div class="field"><label>Misc (₹)</label><input name="miscAmt" type="number" min="0" value="${num(r.miscAmt)}"></div>
        <div class="field"><label>Remarks</label><input name="remarks" value="${r.remarks || ""}"></div>
      </div>

      <div class="actions">
        <button type="button" class="btn ghost" id="cancelRideEdit">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  document.getElementById("cancelRideEdit")?.addEventListener("click", () => {
    document.getElementById("modalBackdrop")?.classList.remove("show");
  });

  document.getElementById("editRideForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);

    const miscAmt = Math.max(0, num(f.get("miscAmt")));
    const odoStart = num(f.get("odoStart"));
    const odoEnd = num(f.get("odoEnd"));

    if (!String(f.get("rideName") || "").trim()) {
      alert("Ride title is required");
      return;
    }
    if (!(odoEnd > odoStart)) {
      alert("End Odometer must be greater than Start Odometer");
      return;
    }

    const updated = {
      ...r,
      rideName: f.get("rideName"),
      routeVia: `${String(f.get("from") || "").trim()} → ${String(f.get("to") || "").trim()}`,
      dateFrom: f.get("dateFrom"),
      dateTo: f.get("dateTo"),
      timeStart: f.get("timeStart") || "",
      timeEnd: f.get("timeEnd") || "",
      odoStart,
      odoEnd,
      stops: Math.max(0, Math.floor(num(f.get("stops")))),
      waitTimes: JSON.stringify([Math.max(0, Math.floor(num(f.get("waitMins"))))]),
      miscAmt,
      misc: JSON.stringify(
        miscAmt > 0 ? [{ category: "Other", item: "Misc", amount: miscAmt }] : []
      ),
      remarks: f.get("remarks") || ""
    };

    onSave(updated);
    document.getElementById("modalBackdrop")?.classList.remove("show");
  });
}

/* -----------------------------
   Export
----------------------------- */

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
function exportRides(rides) {
  const rows = rides
    .slice()
    .sort((a, b) => new Date(b.dateFrom || b.dateTo || 0) - new Date(a.dateFrom || a.dateTo || 0))
    .map(r => {
      const d = rideDerived(r);
      return {
        RideName: r.rideName,
        Route: r.routeVia,
        DateFrom: r.dateFrom,
        DateTo: r.dateTo,
        TimeStart: r.timeStart,
        TimeEnd: r.timeEnd,
        OdoStart: r.odoStart,
        OdoEnd: r.odoEnd,
        Distance: (typeof d.distance === "number") ? Number(d.distance.toFixed(1)) : "",
        Stops: r.stops,
        WaitMinutes: Math.round(d.waitTotal),
        TravelMinutes: d.travelMins,
        Misc: r.miscAmt,
        Remarks: r.remarks
      };
    });

  if (window.XLSX) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Rides");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(new Blob([out], { type: "application/octet-stream" }), `Rides_${Date.now()}.xlsx`);
  } else {
    const csv = toCSV(rows);
    downloadBlob(new Blob([csv], { type: "text/csv" }), `Rides_${Date.now()}.csv`);
  }
}

/* -----------------------------
   Init
----------------------------- */

export async function initRides() {
  let rides = (await apiGet("/api/rides/history")).map(normalizeRide);
  let fuel = (await apiGet("/api/fuel")).map(normalizeFuel);
  let fuelWindows = buildFuelWindows(fuel);

  renderKPIs(rides, fuelWindows);
  renderTable(rides, fuelWindows);

  const form = document.getElementById("rideFormInline");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);

    const rideName = String(f.get("rideName") || "").trim();
    const odoStart = num(f.get("odoStart"));
    const odoEnd = num(f.get("odoEnd"));
    const miscAmt = Math.max(0, num(f.get("miscAmt")));

    if (!rideName) {
      alert("Ride title is required");
      return;
    }
    if (!(odoEnd > odoStart)) {
      alert("End Odometer must be greater than Start Odometer");
      return;
    }

    const rec = {
      id: uid(),
      rideName,
      routeVia: `${String(f.get("from") || "").trim()} → ${String(f.get("to") || "").trim()}`,
      dateFrom: f.get("dateFrom"),
      dateTo: f.get("dateTo"),
      timeStart: f.get("timeStart") || "",
      timeEnd: f.get("timeEnd") || "",
      odoStart,
      odoEnd,
      stops: Math.max(0, Math.floor(num(f.get("stops")))),
      waitTimes: JSON.stringify([Math.max(0, Math.floor(num(f.get("waitMins"))))]),
      miscAmt,
      misc: JSON.stringify(
        miscAmt > 0 ? [{ category: "Other", item: "Misc", amount: miscAmt }] : []
      ),
      remarks: f.get("remarks") || ""
    };

    await apiSend("/api/rides/history", "POST", rec);

    rides = (await apiGet("/api/rides/history")).map(normalizeRide);
    fuel = (await apiGet("/api/fuel")).map(normalizeFuel);
    fuelWindows = buildFuelWindows(fuel);

    renderKPIs(rides, fuelWindows);
    renderTable(rides, fuelWindows);
    form.reset();
  });

  document.getElementById("rideTbody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (!act || !id) return;

    const rec = rides.find(x => x.id === id);
    if (!rec) return;

    if (act === "view") viewRide(rec, fuelWindows);

    if (act === "edit") {
      editRide(rec, async (updated) => {
        await apiSend(`/api/rides/history/${id}`, "PUT", updated);

        rides = (await apiGet("/api/rides/history")).map(normalizeRide);
        fuel = (await apiGet("/api/fuel")).map(normalizeFuel);
        fuelWindows = buildFuelWindows(fuel);

        renderKPIs(rides, fuelWindows);
        renderTable(rides, fuelWindows);
      });
    }

    if (act === "del") {
      if (!confirm("Delete this ride record?")) return;
      await apiSend(`/api/rides/history/${id}`, "DELETE", {});

      rides = (await apiGet("/api/rides/history")).map(normalizeRide);
      fuel = (await apiGet("/api/fuel")).map(normalizeFuel);
      fuelWindows = buildFuelWindows(fuel);

      renderKPIs(rides, fuelWindows);
      renderTable(rides, fuelWindows);
    }
  });

  document.getElementById("exportRides")?.addEventListener("click", () => {
    exportRides(rides);
  });
}