// js/analytics.js
import { getStoreKeys } from "./main.js";

function $(sel, root = document) {
  return root.querySelector(sel);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v) {
  if (window.FRM?.formatMoney) return window.FRM.formatMoney(v || 0);
  return `₹${num(v).toFixed(2)}`;
}

function fmtDistance(v) {
  if (window.FRM?.formatDistance) return window.FRM.formatDistance(v || 0);
  return `${num(v).toFixed(1)} km`;
}

function fmtDate(d) {
  return d || "";
}

function safeJSONParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

async function apiGet(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return await res.json();
}

function lsGet(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null || v === undefined) return fallback;
  return safeJSONParse(v, fallback);
}

/* ----------------------------
   LOADERS
----------------------------- */

async function loadFuel() {
  const LS = getStoreKeys();

  try {
    const data = await apiGet("/api/fuel");
    return Array.isArray(data) ? data : [];
  } catch {
    const data = lsGet(LS.fuel, []);
    return Array.isArray(data) ? data : [];
  }
}

async function loadRides() {
  const LS = getStoreKeys();

  try {
    const data = await apiGet("/api/rides/history");
    return Array.isArray(data) ? data : [];
  } catch {
    const data = lsGet(LS.rides, { history: [], planned: [] });
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.history)) return data.history;
    return [];
  }
}

async function loadExpenses() {
  const LS = getStoreKeys();

  try {
    const [service, self] = await Promise.all([
      apiGet("/api/expenses/service").catch(() => []),
      apiGet("/api/expenses/self").catch(() => [])
    ]);

    return {
      service: Array.isArray(service) ? service : [],
      self: Array.isArray(self) ? self : []
    };
  } catch {
    const data = lsGet(LS.expenses, { service: [], self: [] });
    return {
      service: Array.isArray(data?.service) ? data.service : [],
      self: Array.isArray(data?.self) ? data.self : []
    };
  }
}

/* ----------------------------
   FUEL LOGIC
----------------------------- */

function computeFuelDerived(records) {
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

  const m = new Map(byOdo.map(r => [r.id, r]));
  return list.map(r => {
    const d = m.get(r.id);
    return {
      ...r,
      _distance: d?._distance ?? null,
      _mileage: d?._mileage ?? null
    };
  });
}

function fuelKpi(records) {
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
  const avgPpl = litres > 0 ? spent / litres : null;

  return { litres, spent, count, avg, best, worst, cpk, totalDist, avgPpl };
}

/* ----------------------------
   RIDES LOGIC
----------------------------- */

function normalizeRide(r) {
  const waitTimes = safeJSONParse(r.waitTimes, []);
  const miscArr = safeJSONParse(r.misc, []);

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

function normalizeRides(rides) {
  return rides.map(r => {
    const x = normalizeRide(r);
    const d = rideDerived(x);

    return {
      ...x,
      _id: x.id,
      _date: x.dateFrom || x.dateTo || "",
      _distance: d.distance,
      _travelMins: d.travelMins,
      _waitTotal: d.waitTotal,
      _title: x.rideName || "Ride"
    };
  });
}

/* ----------------------------
   EXPENSES LOGIC
----------------------------- */

function normalizeExpenses(expenses) {
  const service = (expenses.service || []).map((x, i) => ({
    ...x,
    _id: x.id || `service_${i + 1}`,
    _type: "service",
    _date: x.date || "",
    _amount: num(x.amount),
    _title: x.serviceNo || x.location || "Service",
    _notes: x.notes || ""
  }));

  const self = (expenses.self || []).map((x, i) => ({
    ...x,
    _id: x.id || `self_${i + 1}`,
    _type: "self",
    _date: x.date || "",
    _amount: num(x.amount),
    _title: x.item || "Self Maintenance",
    _notes: x.notes || "",
    _company: x.company || "",
    _qty: num(x.qty)
  }));

  return { service, self, all: [...service, ...self] };
}

/* ----------------------------
   HELPERS
----------------------------- */

function getRangeText(records, dateKey = "date") {
  const dates = records
    .map(r => new Date(r[dateKey] || r._date || r.date))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);

  if (!dates.length) return "Range: —";

  const first = dates[0].toISOString().slice(0, 10);
  const last = dates[dates.length - 1].toISOString().slice(0, 10);

  return first === last ? `Range: ${first}` : `Range: ${first} → ${last}`;
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function latestDate(values) {
  const dates = values
    .map(v => new Date(v))
    .filter(d => !isNaN(d))
    .sort((a, b) => b - a);

  if (!dates.length) return "—";
  return dates[0].toISOString().slice(0, 10);
}

function groupFuelMonthly(records) {
  const map = new Map();

  for (const r of records) {
    const key = monthKey(r.date);
    if (!key) continue;

    const cur = map.get(key) || { litres: 0, amount: 0 };
    cur.litres += num(r.litres);
    cur.amount += num(r.amountPaid);
    map.set(key, cur);
  }

  const labels = [...map.keys()].sort();
  return {
    labels,
    litres: labels.map(k => Number(map.get(k).litres.toFixed(2))),
    amount: labels.map(k => Number(map.get(k).amount.toFixed(2)))
  };
}

function groupRideMonthly(rides) {
  const map = new Map();

  for (const r of rides) {
    const key = monthKey(r._date);
    if (!key) continue;

    const cur = map.get(key) || { distance: 0, count: 0, misc: 0, travelMins: 0 };
    cur.distance += num(r._distance);
    cur.count += 1;
    cur.misc += num(r.miscAmt);
    cur.travelMins += num(r._travelMins);
    map.set(key, cur);
  }

  const labels = [...map.keys()].sort();
  return {
    labels,
    distance: labels.map(k => Number(map.get(k).distance.toFixed(2))),
    count: labels.map(k => map.get(k).count),
    misc: labels.map(k => Number(map.get(k).misc.toFixed(2))),
    travelMins: labels.map(k => map.get(k).travelMins)
  };
}

function groupExpenseMonthly(expensesAll) {
  const map = new Map();

  for (const e of expensesAll) {
    const key = monthKey(e._date);
    if (!key) continue;
    const cur = map.get(key) || 0;
    map.set(key, cur + num(e._amount));
  }

  const labels = [...map.keys()].sort();
  return {
    labels,
    amount: labels.map(k => Number(map.get(k).toFixed(2)))
  };
}

function mergeMonthlySpend(fuelMonthly, expenseMonthly) {
  const keys = [...new Set([...fuelMonthly.labels, ...expenseMonthly.labels])].sort();
  const fuelMap = new Map(fuelMonthly.labels.map((k, i) => [k, fuelMonthly.amount[i]]));
  const expMap = new Map(expenseMonthly.labels.map((k, i) => [k, expenseMonthly.amount[i]]));

  return {
    labels: keys,
    fuel: keys.map(k => fuelMap.get(k) || 0),
    expenses: keys.map(k => expMap.get(k) || 0)
  };
}

function mergeMonthlyDistance(rideMonthly, fuelRecords) {
  const fuelMap = new Map();

  for (const r of fuelRecords) {
    const key = monthKey(r.date);
    if (!key) continue;
    const cur = fuelMap.get(key) || 0;
    fuelMap.set(key, cur + (num(r._distance) > 0 ? num(r._distance) : 0));
  }

  const keys = [...new Set([...rideMonthly.labels, ...fuelMap.keys()])].sort();

  return {
    labels: keys,
    rides: keys.map(k => rideMonthly.labels.includes(k) ? rideMonthly.distance[rideMonthly.labels.indexOf(k)] : 0),
    fuelWindows: keys.map(k => fuelMap.get(k) || 0)
  };
}

function applyFilters(data, filters) {
  const fromTs = filters.from ? new Date(filters.from).getTime() : null;
  const toTs = filters.to ? new Date(filters.to).getTime() : null;

  function inDateRange(dateStr) {
    if (!dateStr) return true;
    const ts = new Date(dateStr).getTime();
    if (!isFinite(ts)) return true;
    if (fromTs !== null && ts < fromTs) return false;
    if (toTs !== null && ts > toTs) return false;
    return true;
  }

  function inAmountRange(amount) {
    const a = num(amount);
    if (filters.minAmount !== null && a < filters.minAmount) return false;
    if (filters.maxAmount !== null && a > filters.maxAmount) return false;
    return true;
  }

  function inDistanceRange(distance) {
    const d = num(distance);
    if (filters.minDistance !== null && d < filters.minDistance) return false;
    if (filters.maxDistance !== null && d > filters.maxDistance) return false;
    return true;
  }

  const fuel = data.fuel.filter(r =>
    inDateRange(r.date) &&
    inAmountRange(r.amountPaid) &&
    inDistanceRange(r._distance)
  );

  const rides = data.rides.filter(r =>
    inDateRange(r._date) &&
    inAmountRange(r.miscAmt) &&
    inDistanceRange(r._distance)
  );

  const expensesAll = data.expenses.all.filter(e =>
    inDateRange(e._date) &&
    inAmountRange(e._amount)
  );

  const service = expensesAll.filter(e => e._type === "service");
  const self = expensesAll.filter(e => e._type === "self");

  return {
    fuel,
    rides,
    expenses: { service, self, all: expensesAll }
  };
}

function sortRecords(rows, sortBy) {
  const copy = [...rows];

  copy.sort((a, b) => {
    const da = new Date(a.date || a._date || 0).getTime();
    const db = new Date(b.date || b._date || 0).getTime();

    const amountA = num(a.amount || a._amount || a.amountPaid);
    const amountB = num(b.amount || b._amount || b.amountPaid);

    const distA = num(a.distance || a._distance);
    const distB = num(b.distance || b._distance);

    if (sortBy === "oldest") return da - db;
    if (sortBy === "amountHigh") return amountB - amountA;
    if (sortBy === "amountLow") return amountA - amountB;
    if (sortBy === "distanceHigh") return distB - distA;
    if (sortBy === "distanceLow") return distA - distB;

    return db - da;
  });

  return copy;
}

function buildExplorerRows(filtered, sortBy, moduleFilter) {
  let rows = [];

  if (moduleFilter === "all" || moduleFilter === "fuel") {
    rows.push(...filtered.fuel.map(r => ({
      date: r.date,
      module: "Fuel",
      title: r.station || r.location || "Fuel Record",
      amount: num(r.amountPaid),
      distance: num(r._distance),
      notes: r.remarks || ""
    })));
  }

  if (moduleFilter === "all" || moduleFilter === "rides") {
    rows.push(...filtered.rides.map(r => ({
      date: r._date,
      module: "Rides",
      title: r._title,
      amount: num(r.miscAmt),
      distance: num(r._distance),
      notes: r.remarks || r.routeVia || ""
    })));
  }

  if (moduleFilter === "all" || moduleFilter === "expenses") {
    rows.push(...filtered.expenses.all.map(e => ({
      date: e._date,
      module: e._type === "service" ? "Expense / Service" : "Expense / Self",
      title: e._type === "service"
        ? `${e._title}${e.location ? " • " + e.location : ""}`
        : `${e._title}${e._company ? " • " + e._company : ""}`,
      amount: num(e._amount),
      distance: 0,
      notes: e._notes || ""
    })));
  }

  return sortRecords(rows, sortBy);
}

/* ----------------------------
   CHARTS
----------------------------- */

let charts = {};

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    plugins: {
      legend: {
        labels: { color: "rgba(255,255,255,.82)" }
      }
    },
    scales: {
      x: {
        ticks: { color: "rgba(255,255,255,.75)" },
        grid: { color: "rgba(255,255,255,.06)" }
      },
      y: {
        ticks: { color: "rgba(255,255,255,.75)" },
        grid: { color: "rgba(255,255,255,.06)" }
      }
    }
  };
}

function buildLineChart(canvasId, labels, datasets) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  destroyChart(canvasId);

  charts[canvasId] = new Chart(el, {
    type: "line",
    data: { labels, datasets },
    options: {
      ...baseChartOptions(),
      interaction: { mode: "index", intersect: false }
    }
  });
}

function buildBarChart(canvasId, labels, datasets) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  destroyChart(canvasId);

  charts[canvasId] = new Chart(el, {
    type: "bar",
    data: { labels, datasets },
    options: baseChartOptions()
  });
}

function buildBarLineChart(canvasId, labels, barLabel, barData, lineLabel, lineData) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  destroyChart(canvasId);

  charts[canvasId] = new Chart(el, {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: barLabel,
          data: barData,
          borderWidth: 1
        },
        {
          type: "line",
          label: lineLabel,
          data: lineData,
          tension: 0.25,
          fill: false
        }
      ]
    },
    options: baseChartOptions()
  });
}

function buildDoughnutChart(canvasId, labels, data, type = "doughnut") {
  const el = document.getElementById(canvasId);
  if (!el) return;
  destroyChart(canvasId);

  charts[canvasId] = new Chart(el, {
    type,
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "rgba(255,255,255,.82)" }
        }
      }
    }
  });
}

/* ----------------------------
   CUSTOM GRAPH BUILDER
----------------------------- */

function buildCustomGraphData(filtered, source, xAxis, yAxis) {
  if (source === "fuel") {
    if (xAxis === "month") {
      const m = groupFuelMonthly(filtered.fuel);
      if (yAxis === "litres") return { labels: m.labels, data: m.litres, label: "Litres" };
      if (yAxis === "count") {
        const countMap = new Map();
        for (const r of filtered.fuel) {
          const key = monthKey(r.date);
          if (!key) continue;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
        const labels = [...countMap.keys()].sort();
        return {
          labels,
          data: labels.map(k => countMap.get(k)),
          label: "Fuel Records"
        };
      }
      return { labels: m.labels, data: m.amount, label: "Fuel Amount" };
    }

    if (xAxis === "module") {
      const stats = fuelKpi(filtered.fuel);
      if (yAxis === "litres") return { labels: ["Fuel"], data: [stats.litres], label: "Litres" };
      if (yAxis === "count") return { labels: ["Fuel"], data: [stats.count], label: "Fuel Records" };
      if (yAxis === "distance") return { labels: ["Fuel"], data: [stats.totalDist], label: "Fuel Distance" };
      return { labels: ["Fuel"], data: [stats.spent], label: "Fuel Amount" };
    }
  }

  if (source === "rides") {
    if (xAxis === "month") {
      const m = groupRideMonthly(filtered.rides);
      if (yAxis === "count") return { labels: m.labels, data: m.count, label: "Ride Count" };
      if (yAxis === "misc") return { labels: m.labels, data: m.misc, label: "Ride Misc" };
      return { labels: m.labels, data: m.distance, label: "Ride Distance" };
    }

    if (xAxis === "module") {
      const totalDist = filtered.rides.reduce((s, r) => s + num(r._distance), 0);
      const totalMisc = filtered.rides.reduce((s, r) => s + num(r.miscAmt), 0);
      if (yAxis === "count") return { labels: ["Rides"], data: [filtered.rides.length], label: "Ride Count" };
      if (yAxis === "misc") return { labels: ["Rides"], data: [totalMisc], label: "Ride Misc" };
      return { labels: ["Rides"], data: [totalDist], label: "Ride Distance" };
    }
  }

  if (source === "expenses") {
    if (xAxis === "month") {
      const m = groupExpenseMonthly(filtered.expenses.all);
      if (yAxis === "count") {
        const countMap = new Map();
        for (const e of filtered.expenses.all) {
          const key = monthKey(e._date);
          if (!key) continue;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
        const labels = [...countMap.keys()].sort();
        return { labels, data: labels.map(k => countMap.get(k)), label: "Expense Records" };
      }
      return { labels: m.labels, data: m.amount, label: "Expense Amount" };
    }

    if (xAxis === "type") {
      const serviceSpend = filtered.expenses.service.reduce((s, e) => s + num(e._amount), 0);
      const selfSpend = filtered.expenses.self.reduce((s, e) => s + num(e._amount), 0);

      if (yAxis === "count") {
        return {
          labels: ["Service", "Self"],
          data: [filtered.expenses.service.length, filtered.expenses.self.length],
          label: "Expense Count"
        };
      }

      return {
        labels: ["Service", "Self"],
        data: [serviceSpend, selfSpend],
        label: "Expense Amount"
      };
    }

    if (xAxis === "module") {
      const total = filtered.expenses.all.reduce((s, e) => s + num(e._amount), 0);
      if (yAxis === "count") return { labels: ["Expenses"], data: [filtered.expenses.all.length], label: "Expense Count" };
      return { labels: ["Expenses"], data: [total], label: "Expense Amount" };
    }
  }

  if (source === "all") {
    if (xAxis === "month") {
      const fuelMonthly = groupFuelMonthly(filtered.fuel);
      const rideMonthly = groupRideMonthly(filtered.rides);
      const expenseMonthly = groupExpenseMonthly(filtered.expenses.all);

      const keys = [...new Set([
        ...fuelMonthly.labels,
        ...rideMonthly.labels,
        ...expenseMonthly.labels
      ])].sort();

      if (yAxis === "amount") {
        const fuelMap = new Map(fuelMonthly.labels.map((k, i) => [k, fuelMonthly.amount[i]]));
        const expMap = new Map(expenseMonthly.labels.map((k, i) => [k, expenseMonthly.amount[i]]));
        return {
          labels: keys,
          data: keys.map(k => (fuelMap.get(k) || 0) + (expMap.get(k) || 0)),
          label: "Overall Amount"
        };
      }

      if (yAxis === "distance") {
        const rideMap = new Map(rideMonthly.labels.map((k, i) => [k, rideMonthly.distance[i]]));
        return {
          labels: keys,
          data: keys.map(k => rideMap.get(k) || 0),
          label: "Overall Distance"
        };
      }

      if (yAxis === "count") {
        const countMap = new Map();
        for (const r of filtered.fuel) {
          const key = monthKey(r.date);
          if (!key) continue;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
        for (const r of filtered.rides) {
          const key = monthKey(r._date);
          if (!key) continue;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
        for (const e of filtered.expenses.all) {
          const key = monthKey(e._date);
          if (!key) continue;
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
        const labels = [...countMap.keys()].sort();
        return { labels, data: labels.map(k => countMap.get(k)), label: "Overall Records" };
      }

      if (yAxis === "litres") {
        return { labels: fuelMonthly.labels, data: fuelMonthly.litres, label: "Fuel Litres" };
      }
    }

    if (xAxis === "module") {
      const fuelStats = fuelKpi(filtered.fuel);
      const rideTotal = filtered.rides.reduce((s, r) => s + num(r._distance), 0);
      const expenseTotal = filtered.expenses.all.reduce((s, e) => s + num(e._amount), 0);

      if (yAxis === "amount") {
        return {
          labels: ["Fuel", "Rides", "Expenses"],
          data: [fuelStats.spent, filtered.rides.reduce((s, r) => s + num(r.miscAmt), 0), expenseTotal],
          label: "Amount"
        };
      }

      if (yAxis === "distance") {
        return {
          labels: ["Fuel", "Rides"],
          data: [fuelStats.totalDist, rideTotal],
          label: "Distance"
        };
      }

      if (yAxis === "count") {
        return {
          labels: ["Fuel", "Rides", "Expenses"],
          data: [filtered.fuel.length, filtered.rides.length, filtered.expenses.all.length],
          label: "Record Count"
        };
      }

      if (yAxis === "litres") {
        return {
          labels: ["Fuel"],
          data: [fuelStats.litres],
          label: "Litres"
        };
      }
    }

    if (xAxis === "type") {
      const serviceSpend = filtered.expenses.service.reduce((s, e) => s + num(e._amount), 0);
      const selfSpend = filtered.expenses.self.reduce((s, e) => s + num(e._amount), 0);

      if (yAxis === "amount") {
        return {
          labels: ["Fuel Spend", "Service Spend", "Self Spend"],
          data: [fuelKpi(filtered.fuel).spent, serviceSpend, selfSpend],
          label: "Amount"
        };
      }

      if (yAxis === "count") {
        return {
          labels: ["Fuel Records", "Ride Records", "Expense Records"],
          data: [filtered.fuel.length, filtered.rides.length, filtered.expenses.all.length],
          label: "Record Count"
        };
      }
    }
  }

  return { labels: ["No Data"], data: [0], label: "No Data" };
}

function renderCustomGraph(filtered) {
  const source = $("#gcSource")?.value || "all";
  const type = $("#gcType")?.value || "line";
  const xAxis = $("#gcXAxis")?.value || "month";
  const yAxis = $("#gcYAxis")?.value || "amount";

  const result = buildCustomGraphData(filtered, source, xAxis, yAxis);

  if (type === "line") {
    buildLineChart("chartCustom", result.labels, [
      { label: result.label, data: result.data, tension: 0.25, fill: false }
    ]);
    return;
  }

  if (type === "bar") {
    buildBarChart("chartCustom", result.labels, [
      { label: result.label, data: result.data }
    ]);
    return;
  }

  if (type === "doughnut" || type === "pie") {
    buildDoughnutChart("chartCustom", result.labels, result.data, type);
  }
}

/* ----------------------------
   RENDER
----------------------------- */

function renderOverall(filtered) {
  const fuelStats = fuelKpi(filtered.fuel);
  const rideTotal = filtered.rides.reduce((s, r) => s + num(r._distance), 0);
  const expenseTotal = filtered.expenses.all.reduce((s, e) => s + num(e._amount), 0);

  const totalDistanceTravelled = fuelStats.totalDist > 0 ? fuelStats.totalDist : rideTotal;
  const overallCost = fuelStats.spent + expenseTotal;
  const overallCpk = totalDistanceTravelled > 0 ? overallCost / totalDistanceTravelled : null;

  $("#anTotalFuelSpend").textContent = fmtMoney(fuelStats.spent);
  $("#anFuelRange").textContent = getRangeText(filtered.fuel, "date");

  $("#anTotalDistance").textContent = fmtDistance(totalDistanceTravelled);
  $("#anDistanceMeta").textContent =
    fuelStats.totalDist > 0
      ? "Based on fuel odometer windows"
      : "Based on ride records";

  $("#anTotalExpenses").textContent = fmtMoney(expenseTotal);
  $("#anExpenseMeta").textContent = `${filtered.expenses.service.length} service • ${filtered.expenses.self.length} self`;

  $("#anCostPerKm").textContent = overallCpk ? fmtMoney(overallCpk) : "—";

  const last = latestDate([
    ...filtered.fuel.map(x => x.date),
    ...filtered.rides.map(x => x._date),
    ...filtered.expenses.all.map(x => x._date)
  ]);

  $("#anLastUpdated").textContent = `Last update: ${last}`;
}

function renderFuelSection(filtered) {
  const stats = fuelKpi(filtered.fuel);

  $("#anFuelRecords").textContent = String(stats.count);
  $("#anTotalLitres").textContent = `${stats.litres.toFixed(2)} L`;
  $("#anAvgMileage").textContent = stats.avg ? `${stats.avg.toFixed(2)} km/l` : "—";
  $("#anBestWorstMileage").textContent =
    `Best: ${stats.best ? stats.best.toFixed(2) + " km/l" : "—"} • Worst: ${stats.worst ? stats.worst.toFixed(2) + " km/l" : "—"}`;
  $("#anAvgPricePerLitre").textContent = stats.avgPpl ? fmtMoney(stats.avgPpl) : "—";
}

function renderRideSection(filtered) {
  const count = filtered.rides.length;
  const total = filtered.rides.reduce((s, r) => s + num(r._distance), 0);
  const longest = filtered.rides.reduce((m, r) => Math.max(m, num(r._distance)), 0);
  const avg = count > 0 ? total / count : 0;

  $("#anRideRecords").textContent = String(count);
  $("#anRideDistance").textContent = fmtDistance(total);
  $("#anLongestRide").textContent = longest ? fmtDistance(longest) : "—";
  $("#anAvgRideDistance").textContent = count ? fmtDistance(avg) : "—";
}

function renderExpenseSection(filtered) {
  const all = filtered.expenses.all;
  const serviceSpend = filtered.expenses.service.reduce((s, x) => s + num(x._amount), 0);
  const selfSpend = filtered.expenses.self.reduce((s, x) => s + num(x._amount), 0);
  const highest = all.reduce((m, x) => Math.max(m, num(x._amount)), 0);

  $("#anExpenseRecords").textContent = String(all.length);
  $("#anServiceSpend").textContent = fmtMoney(serviceSpend);
  $("#anSelfSpend").textContent = fmtMoney(selfSpend);
  $("#anHighestExpense").textContent = highest ? fmtMoney(highest) : "—";
}

function renderOverallCharts(filtered) {
  const fuelMonthly = groupFuelMonthly(filtered.fuel);
  const rideMonthly = groupRideMonthly(filtered.rides);
  const expenseMonthly = groupExpenseMonthly(filtered.expenses.all);
  const overallSpend = mergeMonthlySpend(fuelMonthly, expenseMonthly);
  const overallDistance = mergeMonthlyDistance(rideMonthly, filtered.fuel);

  buildLineChart("chartOverallSpend", overallSpend.labels, [
    { label: "Fuel Spend", data: overallSpend.fuel, tension: 0.25, fill: false },
    { label: "Expenses", data: overallSpend.expenses, tension: 0.25, fill: false }
  ]);

  buildLineChart("chartOverallDistance", overallDistance.labels, [
    { label: "Ride Distance", data: overallDistance.rides, tension: 0.25, fill: false },
    { label: "Fuel Window Distance", data: overallDistance.fuelWindows, tension: 0.25, fill: false }
  ]);

  const fuelSpend = fuelKpi(filtered.fuel).spent;
  const rideMiscSpend = filtered.rides.reduce((s, r) => s + num(r.miscAmt), 0);
  const expenseSpend = filtered.expenses.all.reduce((s, e) => s + num(e._amount), 0);

  buildDoughnutChart(
    "chartOverallDistribution",
    ["Fuel Spend", "Ride Misc", "Maintenance Spend"],
    [fuelSpend, rideMiscSpend, expenseSpend]
  );

  const serviceSpend = filtered.expenses.service.reduce((s, x) => s + num(x._amount), 0);
  const selfSpend = filtered.expenses.self.reduce((s, x) => s + num(x._amount), 0);

  buildDoughnutChart(
    "chartOverallSpendShare",
    ["Fuel Spend", "Service Spend", "Self Spend"],
    [fuelSpend, serviceSpend, selfSpend]
  );
}

function renderModuleCharts(filtered) {
  const fuelMonthly = groupFuelMonthly(filtered.fuel);
  const rideMonthly = groupRideMonthly(filtered.rides);
  const expenseMonthly = groupExpenseMonthly(filtered.expenses.all);

  buildBarLineChart(
    "chartFuelMonthly",
    fuelMonthly.labels,
    "Litres",
    fuelMonthly.litres,
    "Amount",
    fuelMonthly.amount
  );

  const fuelPoints = [...filtered.fuel]
    .filter(r => typeof r._distance === "number" && r._distance > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  buildLineChart("chartFuelCostPerKm", fuelPoints.map(r => fmtDate(r.date)), [
    {
      label: "Cost per KM",
      data: fuelPoints.map(r => Number((num(r.amountPaid) / num(r._distance)).toFixed(2))),
      tension: 0.25,
      fill: false
    }
  ]);

  buildLineChart("chartRideDistance", rideMonthly.labels, [
    { label: "Ride Distance", data: rideMonthly.distance, tension: 0.25, fill: false }
  ]);

  buildLineChart("chartRideCount", rideMonthly.labels, [
    { label: "Ride Count", data: rideMonthly.count, tension: 0.25, fill: false }
  ]);

  buildLineChart("chartExpenseTrend", expenseMonthly.labels, [
    { label: "Expense Amount", data: expenseMonthly.amount, tension: 0.25, fill: false }
  ]);

  const serviceSpend = filtered.expenses.service.reduce((s, x) => s + num(x._amount), 0);
  const selfSpend = filtered.expenses.self.reduce((s, x) => s + num(x._amount), 0);

  buildDoughnutChart("chartExpenseSplit", ["Service", "Self"], [serviceSpend, selfSpend]);
}

function renderExplorer(filtered, sortBy, moduleFilter) {
  const tbody = $("#analyticsTbody");
  if (!tbody) return;

  const rows = buildExplorerRows(filtered, sortBy, moduleFilter);
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="small">No matching records found.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDate(r.date)}</td>
      <td>${r.module}</td>
      <td>${r.title || ""}</td>
      <td>${r.amount ? fmtMoney(r.amount) : "—"}</td>
      <td>${r.distance ? fmtDistance(r.distance) : "—"}</td>
      <td>${r.notes || ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ----------------------------
   INIT
----------------------------- */

export async function initAnalytics() {
  const rawFuel = await loadFuel();
  const rawRides = await loadRides();
  const rawExpenses = await loadExpenses();

  const state = {
    base: {
      fuel: computeFuelDerived(rawFuel),
      rides: normalizeRides(rawRides),
      expenses: normalizeExpenses(rawExpenses)
    },
    filtered: null,
    filters: {
      from: "",
      to: "",
      module: "all",
      sortBy: "latest",
      minAmount: null,
      maxAmount: null,
      minDistance: null,
      maxDistance: null
    }
  };

  function readFilters() {
    state.filters = {
      from: $("#anFromDate")?.value || "",
      to: $("#anToDate")?.value || "",
      module: $("#anModule")?.value || "all",
      sortBy: $("#anSortBy")?.value || "latest",
      minAmount: $("#anMinAmount")?.value !== "" ? num($("#anMinAmount").value) : null,
      maxAmount: $("#anMaxAmount")?.value !== "" ? num($("#anMaxAmount").value) : null,
      minDistance: $("#anMinDistance")?.value !== "" ? num($("#anMinDistance").value) : null,
      maxDistance: $("#anMaxDistance")?.value !== "" ? num($("#anMaxDistance").value) : null
    };
  }

  function resetFilterInputs() {
    $("#anFromDate").value = "";
    $("#anToDate").value = "";
    $("#anModule").value = "all";
    $("#anSortBy").value = "latest";
    $("#anMinAmount").value = "";
    $("#anMaxAmount").value = "";
    $("#anMinDistance").value = "";
    $("#anMaxDistance").value = "";

    $("#gcSource").value = "all";
    $("#gcType").value = "line";
    $("#gcXAxis").value = "month";
    $("#gcYAxis").value = "amount";

    readFilters();
  }

  function renderAll() {
    state.filtered = applyFilters(state.base, state.filters);

    renderOverall(state.filtered);
    renderOverallCharts(state.filtered);
    renderCustomGraph(state.filtered);
    renderFuelSection(state.filtered);
    renderRideSection(state.filtered);
    renderExpenseSection(state.filtered);
    renderModuleCharts(state.filtered);
    renderExplorer(state.filtered, state.filters.sortBy, state.filters.module);
  }

  $("#applyAnalyticsFilters")?.addEventListener("click", () => {
    readFilters();
    renderAll();
  });

  $("#resetAnalyticsFilters")?.addEventListener("click", () => {
    resetFilterInputs();
    renderAll();
  });

  $("#buildCustomChart")?.addEventListener("click", () => {
    readFilters();
    state.filtered = applyFilters(state.base, state.filters);
    renderCustomGraph(state.filtered);
    renderExplorer(state.filtered, state.filters.sortBy, state.filters.module);
  });

  $("#resetCustomChart")?.addEventListener("click", () => {
    $("#gcSource").value = "all";
    $("#gcType").value = "line";
    $("#gcXAxis").value = "month";
    $("#gcYAxis").value = "amount";
    renderCustomGraph(state.filtered || state.base);
  });

  readFilters();
  renderAll();
}