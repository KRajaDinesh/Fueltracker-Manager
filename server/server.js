// FuelRideManager/server/server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// DB file stored inside server/
const db = new Database(path.join(__dirname, "fuelridemanager.db"));
db.pragma("journal_mode = WAL");

// ---------- Create tables ----------
db.exec(`
CREATE TABLE IF NOT EXISTS fuel (
  id TEXT PRIMARY KEY,
  date TEXT,
  location TEXT,
  station TEXT,
  pricePerLitre REAL,
  litres REAL,
  amountPaid REAL,
  payMethod TEXT,
  odometer REAL,
  tripA TEXT,
  tripB TEXT,
  tripF TEXT,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS rides_history (
  id TEXT PRIMARY KEY,
  rideName TEXT,
  routeVia TEXT,
  dateFrom TEXT,
  dateTo TEXT,
  timeStart TEXT,
  timeEnd TEXT,
  odoStart REAL,
  odoEnd REAL,
  stops INTEGER,
  waitTimes TEXT,   -- JSON string array
  remarks TEXT,
  misc TEXT         -- JSON string array
);

CREATE TABLE IF NOT EXISTS rides_planned (
  id TEXT PRIMARY KEY,
  rideName TEXT,
  routeVia TEXT,
  dateFrom TEXT,
  dateTo TEXT,
  timeStart TEXT,
  timeEnd TEXT,
  distance REAL,
  stops INTEGER,
  waitTimes TEXT,        -- JSON string array
  expectedExpenses TEXT, -- JSON string array
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS expenses_service (
  id TEXT PRIMARY KEY,
  date TEXT,
  location TEXT,
  serviceNo TEXT,
  type TEXT,
  amount REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS expenses_self (
  id TEXT PRIMARY KEY,
  date TEXT,
  item TEXT,
  qty REAL,
  amount REAL,
  notes TEXT
);
`);

// ---------- Helpers ----------
const safeJson = (v, fallback = "[]") => {
  if (v === null || v === undefined || v === "") return fallback;
  try {
    JSON.parse(v);
    return v;
  } catch {
    return fallback;
  }
};

// ---------- API: Fuel ----------
app.get("/api/fuel", (req, res) => {
  const rows = db.prepare("SELECT * FROM fuel").all();
  res.json(rows);
});

app.post("/api/fuel", (req, res) => {
  const r = req.body;
  db.prepare(`
    INSERT INTO fuel (id,date,location,station,pricePerLitre,litres,amountPaid,payMethod,odometer,tripA,tripB,tripF,remarks)
    VALUES (@id,@date,@location,@station,@pricePerLitre,@litres,@amountPaid,@payMethod,@odometer,@tripA,@tripB,@tripF,@remarks)
  `).run(r);
  res.json({ ok: true });
});

app.put("/api/fuel/:id", (req, res) => {
  const id = req.params.id;
  const r = req.body;

  db.prepare(`
    UPDATE fuel SET
      date=@date,
      location=@location,
      station=@station,
      pricePerLitre=@pricePerLitre,
      litres=@litres,
      amountPaid=@amountPaid,
      payMethod=@payMethod,
      odometer=@odometer,
      tripA=@tripA,
      tripB=@tripB,
      tripF=@tripF,
      remarks=@remarks
    WHERE id=@id
  `).run({
    id,
    date: r.date,
    location: r.location,
    station: r.station,
    pricePerLitre: r.pricePerLitre,
    litres: r.litres,
    amountPaid: r.amountPaid,
    payMethod: r.payMethod,
    odometer: r.odometer,
    tripA: r.tripA,
    tripB: r.tripB,
    tripF: r.tripF,
    remarks: r.remarks
  });

  res.json({ ok: true });
});

app.delete("/api/fuel/:id", (req, res) => {
  const id = req.params.id;
  db.prepare("DELETE FROM fuel WHERE id=?").run(id);
  res.json({ ok: true });
});

// ---------- API: Expenses (Service) ----------
app.get("/api/expenses/service", (req, res) => {
  const rows = db.prepare("SELECT * FROM expenses_service").all();
  res.json(rows);
});

app.post("/api/expenses/service", (req, res) => {
  const r = req.body;
  db.prepare(`
    INSERT INTO expenses_service (id,date,location,serviceNo,type,amount,notes)
    VALUES (@id,@date,@location,@serviceNo,@type,@amount,@notes)
  `).run(r);
  res.json({ ok: true });
});

app.put("/api/expenses/service/:id", (req, res) => {
  const id = req.params.id;
  const r = req.body;

  db.prepare(`
    UPDATE expenses_service SET
      date=@date,
      location=@location,
      serviceNo=@serviceNo,
      type=@type,
      amount=@amount,
      notes=@notes
    WHERE id=@id
  `).run({
    id,
    date: r.date,
    location: r.location,
    serviceNo: r.serviceNo,
    type: r.type,
    amount: r.amount,
    notes: r.notes
  });

  res.json({ ok: true });
});

app.delete("/api/expenses/service/:id", (req, res) => {
  db.prepare("DELETE FROM expenses_service WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- API: Expenses (Self) ----------
app.get("/api/expenses/self", (req, res) => {
  const rows = db.prepare("SELECT * FROM expenses_self").all();
  res.json(rows);
});

app.post("/api/expenses/self", (req, res) => {
  const r = req.body;
  db.prepare(`
    INSERT INTO expenses_self (id,date,item,qty,amount,notes)
    VALUES (@id,@date,@item,@qty,@amount,@notes)
  `).run(r);
  res.json({ ok: true });
});

app.put("/api/expenses/self/:id", (req, res) => {
  const id = req.params.id;
  const r = req.body;

  db.prepare(`
    UPDATE expenses_self SET
      date=@date,
      item=@item,
      qty=@qty,
      amount=@amount,
      notes=@notes
    WHERE id=@id
  `).run({
    id,
    date: r.date,
    item: r.item,
    qty: r.qty,
    amount: r.amount,
    notes: r.notes
  });

  res.json({ ok: true });
});

app.delete("/api/expenses/self/:id", (req, res) => {
  db.prepare("DELETE FROM expenses_self WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- API: Rides (History) ----------
app.get("/api/rides/history", (req, res) => {
  const rows = db.prepare("SELECT * FROM rides_history").all();
  // keep JSON fields as strings; frontend can parse if needed
  res.json(rows.map(r => ({
    ...r,
    waitTimes: safeJson(r.waitTimes),
    misc: safeJson(r.misc)
  })));
});

app.post("/api/rides/history", (req, res) => {
  const r = req.body;
  db.prepare(`
    INSERT INTO rides_history (id,rideName,routeVia,dateFrom,dateTo,timeStart,timeEnd,odoStart,odoEnd,stops,waitTimes,remarks,misc)
    VALUES (@id,@rideName,@routeVia,@dateFrom,@dateTo,@timeStart,@timeEnd,@odoStart,@odoEnd,@stops,@waitTimes,@remarks,@misc)
  `).run({
    ...r,
    waitTimes: safeJson(r.waitTimes),
    misc: safeJson(r.misc)
  });
  res.json({ ok: true });
});

app.put("/api/rides/history/:id", (req, res) => {
  const id = req.params.id;
  const r = req.body;

  db.prepare(`
    UPDATE rides_history SET
      rideName=@rideName,
      routeVia=@routeVia,
      dateFrom=@dateFrom,
      dateTo=@dateTo,
      timeStart=@timeStart,
      timeEnd=@timeEnd,
      odoStart=@odoStart,
      odoEnd=@odoEnd,
      stops=@stops,
      waitTimes=@waitTimes,
      remarks=@remarks,
      misc=@misc
    WHERE id=@id
  `).run({
    id,
    rideName: r.rideName,
    routeVia: r.routeVia,
    dateFrom: r.dateFrom,
    dateTo: r.dateTo,
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    odoStart: r.odoStart,
    odoEnd: r.odoEnd,
    stops: r.stops,
    waitTimes: safeJson(r.waitTimes),
    remarks: r.remarks,
    misc: safeJson(r.misc)
  });

  res.json({ ok: true });
});

app.delete("/api/rides/history/:id", (req, res) => {
  db.prepare("DELETE FROM rides_history WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- API: Rides (Planned) ----------
app.get("/api/rides/planned", (req, res) => {
  const rows = db.prepare("SELECT * FROM rides_planned").all();
  res.json(rows.map(r => ({
    ...r,
    waitTimes: safeJson(r.waitTimes),
    expectedExpenses: safeJson(r.expectedExpenses)
  })));
});

app.post("/api/rides/planned", (req, res) => {
  const r = req.body;
  db.prepare(`
    INSERT INTO rides_planned (id,rideName,routeVia,dateFrom,dateTo,timeStart,timeEnd,distance,stops,waitTimes,expectedExpenses,remarks)
    VALUES (@id,@rideName,@routeVia,@dateFrom,@dateTo,@timeStart,@timeEnd,@distance,@stops,@waitTimes,@expectedExpenses,@remarks)
  `).run({
    ...r,
    waitTimes: safeJson(r.waitTimes),
    expectedExpenses: safeJson(r.expectedExpenses)
  });
  res.json({ ok: true });
});

app.put("/api/rides/planned/:id", (req, res) => {
  const id = req.params.id;
  const r = req.body;

  db.prepare(`
    UPDATE rides_planned SET
      rideName=@rideName,
      routeVia=@routeVia,
      dateFrom=@dateFrom,
      dateTo=@dateTo,
      timeStart=@timeStart,
      timeEnd=@timeEnd,
      distance=@distance,
      stops=@stops,
      waitTimes=@waitTimes,
      expectedExpenses=@expectedExpenses,
      remarks=@remarks
    WHERE id=@id
  `).run({
    id,
    rideName: r.rideName,
    routeVia: r.routeVia,
    dateFrom: r.dateFrom,
    dateTo: r.dateTo,
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    distance: r.distance,
    stops: r.stops,
    waitTimes: safeJson(r.waitTimes),
    expectedExpenses: safeJson(r.expectedExpenses),
    remarks: r.remarks
  });

  res.json({ ok: true });
});

app.delete("/api/rides/planned/:id", (req, res) => {
  db.prepare("DELETE FROM rides_planned WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Serve Frontend ----------
const root = path.join(__dirname, "..");
app.use(express.static(root));

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FuelRideManager running at http://localhost:${PORT}`);
});