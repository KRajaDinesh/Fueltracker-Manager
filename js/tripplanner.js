(function () {

  const $ = (s) => document.querySelector(s);

  const tripForm = $("#tpTripForm");
  const tripTbody = $("#tpTripTableBody");
  const toggleBtn = $("#tpToggleTrips");
  const wrap = $("#tpTripsWrap");
  const clearBtn = $("#tpTripClearBtn");

  const TRIPS_KEY = "frm_trips_final";

  function getTrips() {
    try { return JSON.parse(localStorage.getItem(TRIPS_KEY) || "[]"); }
    catch { return []; }
  }

  function setTrips(arr) {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(arr));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  // Prevent blank saves
  tripForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = ($("#tpTripName").value || "").trim();
    const date = $("#tpTripDate").value;
    const from = ($("#tpTripFrom").value || "").trim();
    const to = ($("#tpTripTo").value || "").trim();
    const start = $("#tpTripStart").value;
    const hours = ($("#tpTripHours").value || "").trim();
    const km = ($("#tpTripKm").value || "").trim();
    const notes = ($("#tpTripNotes").value || "").trim();

    const hasAny =
      name || date || from || to || notes ||
      (hours && Number(hours) > 0) ||
      (km && Number(km) > 0);

    if (!hasAny) return;

    const trip = {
      id: crypto.randomUUID(),
      name, date, from, to, start, hours, km, notes,
      createdAt: Date.now()
    };

    const trips = getTrips();
    trips.unshift(trip);
    setTrips(trips);

    tripForm.reset();
    $("#tpTripStart").value = "04:00";
  });

  clearBtn?.addEventListener("click", () => {
    tripForm.reset();
    $("#tpTripStart").value = "04:00";
  });

  function renderTable() {
    const trips = getTrips().sort((a,b)=>b.createdAt-a.createdAt);
    tripTbody.innerHTML = "";

    if (!trips.length) {
      tripTbody.innerHTML =
        `<tr><td colspan="6" class="small">No trips saved yet.</td></tr>`;
      return;
    }

    for (const t of trips) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(t.date)}</td>
        <td><b>${escapeHtml(t.name)}</b></td>
        <td>${escapeHtml(t.from)} → ${escapeHtml(t.to)}</td>
        <td>${escapeHtml(t.km)}</td>
        <td>${escapeHtml(t.hours)}</td>
        <td>
          <div class="t-actions">
            <button class="iconbtn" data-act="view" data-id="${t.id}">👁️</button>
            <button class="iconbtn" data-act="edit" data-id="${t.id}">✏️</button>
            <button class="iconbtn" data-act="delete" data-id="${t.id}">🗑️</button>
          </div>
        </td>
      `;
      tripTbody.appendChild(tr);
    }
  }

  toggleBtn?.addEventListener("click", () => {
    const open = wrap.style.display !== "none";
    wrap.style.display = open ? "none" : "block";
    toggleBtn.textContent = open ? "View all" : "Hide";
    if (!open) renderTable();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;

    const id = btn.dataset.id;
    let trips = getTrips();
    const trip = trips.find(t => t.id === id);
    if (!trip) return;

    if (btn.dataset.act === "delete") {
      if (!confirm("Delete this trip?")) return;
      trips = trips.filter(t => t.id !== id);
      setTrips(trips);
      renderTable();
    }

    if (btn.dataset.act === "edit") {
      $("#tpTripName").value = trip.name;
      $("#tpTripDate").value = trip.date;
      $("#tpTripFrom").value = trip.from;
      $("#tpTripTo").value = trip.to;
      $("#tpTripStart").value = trip.start;
      $("#tpTripHours").value = trip.hours;
      $("#tpTripKm").value = trip.km;
      $("#tpTripNotes").value = trip.notes;
    }

    if (btn.dataset.act === "view") {
      const body = document.getElementById("modalBody");
      const title = document.getElementById("modalTitle");
      title.textContent = "Trip Details";

      body.innerHTML = `
        <div class="grid2">
          <div><div class="small">Name</div><div>${escapeHtml(trip.name)}</div></div>
          <div><div class="small">Date</div><div>${escapeHtml(trip.date)}</div></div>
          <div><div class="small">Route</div><div>${escapeHtml(trip.from)} → ${escapeHtml(trip.to)}</div></div>
          <div><div class="small">Start</div><div>${escapeHtml(trip.start)}</div></div>
          <div><div class="small">Duration</div><div>${escapeHtml(trip.hours)} h</div></div>
          <div><div class="small">Distance</div><div>${escapeHtml(trip.km)} km</div></div>
          <div style="grid-column:1/-1;"><div class="small">Notes</div><div>${escapeHtml(trip.notes)}</div></div>
        </div>
      `;

      document.getElementById("modalBackdrop").classList.add("show");
    }
  });

  document.getElementById("closeModal")?.addEventListener(
    "click",
    () => document.getElementById("modalBackdrop").classList.remove("show")
  );

  document.getElementById("closeModal2")?.addEventListener(
    "click",
    () => document.getElementById("modalBackdrop").classList.remove("show")
  );

})();