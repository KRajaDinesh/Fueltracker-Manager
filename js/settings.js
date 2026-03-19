export function initSettings() {
  loadSettings();
  bindEvents();
}

const STORAGE_KEY = "fr_settings";

function bindEvents() {
  const saveBtn = document.getElementById("saveSettings");
  const exportBtn = document.getElementById("globalExport");

  saveBtn?.addEventListener("click", saveSettings);
  exportBtn?.addEventListener("click", exportAllData);
}

function saveSettings() {
  const settings = {
    units: document.getElementById("sUnits")?.value || "km",
    currency: document.getElementById("sCurrency")?.value || "₹",
    theme: document.getElementById("sTheme")?.value || "fuel",
    dateFormat: document.getElementById("sDate")?.value || "local"
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

  applyTheme(settings.theme);

  alert("Settings saved successfully.");
}

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  const settings = JSON.parse(raw);

  document.getElementById("sUnits").value = settings.units;
  document.getElementById("sCurrency").value = settings.currency;
  document.getElementById("sTheme").value = settings.theme;
  document.getElementById("sDate").value = settings.dateFormat;

  applyTheme(settings.theme);
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
}

function exportAllData() {
  const fuel = JSON.parse(localStorage.getItem("fuel_data") || "[]");
  const rides = JSON.parse(localStorage.getItem("rides_data") || "[]");
  const expenses = JSON.parse(localStorage.getItem("expenses_data") || "[]");

  const allData = {
    fuel,
    rides,
    expenses,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(allData, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "FuelRideManager_Backup.json";
  a.click();

  URL.revokeObjectURL(url);
}