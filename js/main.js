// js/main.js
// Core app: theme toggle, modal, seed bootstrap (data/*.json -> localStorage), tiny helpers.

const LS = {
  fuel: "frm_fuel",
  rides: "frm_rides",
  expenses: "frm_expenses",
  settings: "frm_settings",
  seeded: "frm_seeded_v1"
};

const BRAND_NAME = "RajaDinesh";

function $(sel, root = document) {
  return root.querySelector(sel);
}
function $all(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function openModal(title, html) {
  const bd = $("#modalBackdrop");
  if (!bd) return;

  const t = $("#modalTitle");
  const body = $("#modalBody");
  if (t) t.textContent = title || "Details";
  if (body) body.innerHTML = html || "";

  bd.classList.add("show");
}

function closeModal() {
  const bd = $("#modalBackdrop");
  bd?.classList.remove("show");
}

function safeJSONParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
function lsGet(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null || v === undefined) return fallback;
  return safeJSONParse(v, fallback);
}
function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load: ${path}`);
  return await res.json();
}

/**
 * IMPORTANT:
 * Browser cannot write to data/*.json.
 * So we use data/*.json only as SEED, then use localStorage for actual add/edit/delete.
 */
export async function ensureSeedData() {
  const alreadySeeded = localStorage.getItem(LS.seeded);
  if (alreadySeeded === "1") return;

  // If user already has data in localStorage, don't overwrite
  const hasAny =
    (lsGet(LS.fuel, []).length > 0) ||
    (lsGet(LS.rides, []).length > 0) ||
    (lsGet(LS.expenses, { service: [], self: [] }).service?.length > 0) ||
    (lsGet(LS.expenses, { service: [], self: [] }).self?.length > 0);

  if (hasAny) {
    localStorage.setItem(LS.seeded, "1");
    return;
  }

  // Load seed JSON files (these must exist)
  const [fuel, rides, expenses] = await Promise.all([
    fetchJSON("./data/fuel.json").catch(() => []),
    fetchJSON("./data/rides.json").catch(() => ({ history: [], planned: [] })),
    fetchJSON("./data/expenses.json").catch(() => ({ service: [], self: [] }))
  ]);

  // Support either rides shape:
  // - {history:[], planned:[]} OR simple array
  const rideHistory = Array.isArray(rides) ? rides : (rides.history || []);
  const planned = Array.isArray(rides) ? [] : (rides.planned || []);

  lsSet(LS.fuel, Array.isArray(fuel) ? fuel : []);
  lsSet(LS.rides, { history: rideHistory, planned });
  lsSet(LS.expenses, expenses && typeof expenses === "object" ? expenses : { service: [], self: [] });

  // default settings (single source)
  lsSet(LS.settings, {
    theme: document.body.getAttribute("data-theme") || "fuel",
    currency: "₹",
    units: "km",
    dateFmt: "local"
  });

  localStorage.setItem(LS.seeded, "1");
}

export function getStoreKeys() {
  return LS;
}

/* -----------------------------
   GLOBAL SETTINGS HELPERS
------------------------------ */

function getSettings() {
  const s = lsGet(LS.settings, null) || {};
  return {
    theme: s.theme || "fuel",
    currency: s.currency || "₹",
    units: s.units || "km",
    dateFmt: s.dateFmt || "local"
  };
}

function setSettings(partial = {}) {
  const cur = getSettings();
  const next = { ...cur, ...partial };
  lsSet(LS.settings, next);
  return next;
}

function applyBrandName() {
  const el = document.getElementById("appBrandName");
  if (el) el.textContent = BRAND_NAME;
}

function applyTheme(mode) {
  if (!mode) return;
  document.body.setAttribute("data-theme", mode);

  // toggle active class for theme toggle buttons (if present)
  const buttons = $all('[data-toggle]');
  buttons.forEach(b => b.classList.toggle("active", b.dataset.toggle === mode));
}

function formatMoney(amount) {
  const s = getSettings();
  const n = Number(amount || 0);
  return `${s.currency}${n.toFixed(2)}`;
}

// Input is assumed to be KM internally (your data is in km / odometer km)
function formatDistance(kmValue) {
  const s = getSettings();
  const km = Number(kmValue || 0);

  if (s.units === "mi") {
    const miles = km * 0.621371;
    return `${miles.toFixed(1)} mi`;
  }
  return `${km.toFixed(1)} km`;
}

function exposeGlobalFRM() {
  window.FRM = window.FRM || {};
  window.FRM.getSettings = getSettings;
  window.FRM.setSettings = setSettings;
  window.FRM.formatMoney = formatMoney;
  window.FRM.formatDistance = formatDistance;
}

/* -----------------------------
   INIT (called by every page)
------------------------------ */

export function init() {
  // Brand name always
  applyBrandName();

  // Modal close wiring (if modal exists on page)
  $("#closeModal")?.addEventListener("click", closeModal);
  $("#closeModal2")?.addEventListener("click", closeModal);
  $("#modalBackdrop")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "modalBackdrop") closeModal();
  });

  // Expose global helpers for other modules
  exposeGlobalFRM();

  // Read saved theme + apply
  const settings = getSettings();
  applyTheme(settings.theme);

  // Theme toggle (Fuel/Rides) buttons (if a page has them)
  const buttons = $all('[data-toggle]');
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.toggle;
      applyTheme(mode);
      setSettings({ theme: mode });
    });
  });
}