// js/calculators.js
// All calculator logic in one place (locked requirement)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n) {
  const x = num(n);
  return `₹${x.toFixed(2)}`;
}

export function initCalculators() {
  // Fuel cost
  const calcFuel = () => {
    const dist = num(document.getElementById("cDist")?.value);
    const mil = num(document.getElementById("cMil")?.value);
    const price = num(document.getElementById("cPrice")?.value);

    const out = document.getElementById("cFuelOut");
    if (!out) return;

    if (dist > 0 && mil > 0 && price > 0) {
      const litres = dist / mil;
      out.value = money(litres * price);
    } else out.value = "";
  };

  ["cDist", "cMil", "cPrice"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calcFuel);
  });

  // Mileage calculator
  const calcMil = () => {
    const s = num(document.getElementById("mStart")?.value);
    const e = num(document.getElementById("mEnd")?.value);
    const f = num(document.getElementById("mFuel")?.value);

    const out = document.getElementById("mOut");
    if (!out) return;

    if (e > s && f > 0) out.value = ((e - s) / f).toFixed(2) + " km/l";
    else out.value = "";
  };

  ["mStart", "mEnd", "mFuel"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calcMil);
  });

  // Trip cost
  const calcTrip = () => {
    const dist = num(document.getElementById("tDist")?.value);
    const mil = num(document.getElementById("tMil")?.value);
    const price = num(document.getElementById("tPrice")?.value);
    const misc = num(document.getElementById("tMisc")?.value);

    const out = document.getElementById("tOut");
    if (!out) return;

    if (dist > 0 && mil > 0 && price > 0) {
      const fuelCost = (dist / mil) * price;
      out.value = money(fuelCost + misc);
    } else out.value = "";
  };

  ["tDist", "tMil", "tPrice", "tMisc"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calcTrip);
  });

  // Misc calculator
  const calcMisc = () => {
    const p = num(document.getElementById("xPrice")?.value);
    const q = Math.max(1, num(document.getElementById("xQty")?.value));

    const out = document.getElementById("xOut");
    if (!out) return;

    if (p > 0 && q > 0) out.value = money(p * q);
    else out.value = "";
  };

  ["xPrice", "xQty"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", calcMisc);
  });
}