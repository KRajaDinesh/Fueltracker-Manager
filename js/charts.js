// js/charts.js
// Thin wrappers around Chart.js (loaded from /libs/chart.min.js)

function chartOk() {
  return typeof window.Chart !== "undefined";
}

export function destroyChart(chartRef) {
  try { chartRef?.destroy(); } catch {}
  return null;
}

export function buildBarLine(ctx, labels, barLabel, barData, lineLabel, lineData) {
  if (!chartOk() || !ctx) return null;

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { type: "bar", label: barLabel, data: barData },
        { type: "line", label: lineLabel, data: lineData }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "rgba(255,255,255,.8)" } }
      },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,.7)" }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: "rgba(255,255,255,.7)" }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });
}

export function buildLine(ctx, labels, label, data) {
  if (!chartOk() || !ctx) return null;

  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label, data }] },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "rgba(255,255,255,.8)" } } },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,.7)" }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: "rgba(255,255,255,.7)" }, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });
}

export function buildPie(ctx, labels, data) {
  if (!chartOk() || !ctx) return null;

  return new Chart(ctx, {
    type: "pie",
    data: { labels, datasets: [{ data }] },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "rgba(255,255,255,.8)" } } }
    }
  });
}