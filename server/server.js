// FuelRideManager/server/server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, "cloud-data.json");

const defaultData = {
  fuel: [],
  rides_history: [],
  rides_planned: [],
  expenses_service: [],
  expenses_self: []
};

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return { ...defaultData };
  }
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function safeJsonString(v) {
  if (v === null || v === undefined || v === "") return "[]";
  if (typeof v === "string") {
    try {
      JSON.parse(v);
      return v;
    } catch {
      return "[]";
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return "[]";
  }
}

function findIndexById(arr, id) {
  return arr.findIndex(item => item.id === id);
}

// ---------- Root / Health ----------
app.get("/", (req, res) => {
  res.send("FuelRideManager API is running");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "API working" });
});

// ---------- API: Fuel ----------
app.get("/api/fuel", async (req, res) => {
  const data = await readData();
  res.json(data.fuel);
});

app.post("/api/fuel", async (req, res) => {
  const data = await readData();
  data.fuel.push(req.body);
  await writeData(data);
  res.json({ ok: true });
});

app.put("/api/fuel/:id", async (req, res) => {
  const data = await readData();
  const idx = findIndexById(data.fuel, req.params.id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Fuel record not found" });
  }

  data.fuel[idx] = { ...req.body, id: req.params.id };
  await writeData(data);
  res.json({ ok: true });
});

app.delete("/api/fuel/:id", async (req, res) => {
  const data = await readData();
  data.fuel = data.fuel.filter(item => item.id !== req.params.id);
  await writeData(data);
  res.json({ ok: true });
});

// ---------- API: Expenses (Service) ----------
app.get("/api/expenses/service", async (req, res) => {
  const data = await readData();
  res.json(data.expenses_service);
});

app.post("/api/expenses/service", async (req, res) => {
  const data = await readData();
  data.expenses_service.push(req.body);
  await writeData(data);
  res.json({ ok: true });
});

app.put("/api/expenses/service/:id", async (req, res) => {
  const data = await readData();
  const idx = findIndexById(data.expenses_service, req.params.id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Service expense not found" });
  }

  data.expenses_service[idx] = { ...req.body, id: req.params.id };
  await writeData(data);
  res.json({ ok: true });
});

app.delete("/api/expenses/service/:id", async (req, res) => {
  const data = await readData();
  data.expenses_service = data.expenses_service.filter(item => item.id !== req.params.id);
  await writeData(data);
  res.json({ ok: true });
});

// ---------- API: Expenses (Self) ----------
app.get("/api/expenses/self", async (req, res) => {
  const data = await readData();
  res.json(data.expenses_self);
});

app.post("/api/expenses/self", async (req, res) => {
  const data = await readData();
  data.expenses_self.push(req.body);
  await writeData(data);
  res.json({ ok: true });
});

app.put("/api/expenses/self/:id", async (req, res) => {
  const data = await readData();
  const idx = findIndexById(data.expenses_self, req.params.id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Self expense not found" });
  }

  data.expenses_self[idx] = { ...req.body, id: req.params.id };
  await writeData(data);
  res.json({ ok: true });
});

app.delete("/api/expenses/self/:id", async (req, res) => {
  const data = await readData();
  data.expenses_self = data.expenses_self.filter(item => item.id !== req.params.id);
  await writeData(data);
  res.json({ ok: true });
});

// ---------- API: Rides (History) ----------
app.get("/api/rides/history", async (req, res) => {
  const data = await readData();
  res.json(data.rides_history);
});

app.post("/api/rides/history", async (req, res) => {
  const data = await readData();
  const record = {
    ...req.body,
    waitTimes: safeJsonString(req.body.waitTimes),
    misc: safeJsonString(req.body.misc)
  };
  data.rides_history.push(record);
  await writeData(data);
  res.json({ ok: true });
});

app.put("/api/rides/history/:id", async (req, res) => {
  const data = await readData();
  const idx = findIndexById(data.rides_history, req.params.id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Ride history record not found" });
  }

  data.rides_history[idx] = {
    ...req.body,
    id: req.params.id,
    waitTimes: safeJsonString(req.body.waitTimes),
    misc: safeJsonString(req.body.misc)
  };

  await writeData(data);
  res.json({ ok: true });
});

app.delete("/api/rides/history/:id", async (req, res) => {
  const data = await readData();
  data.rides_history = data.rides_history.filter(item => item.id !== req.params.id);
  await writeData(data);
  res.json({ ok: true });
});

// ---------- API: Rides (Planned) ----------
app.get("/api/rides/planned", async (req, res) => {
  const data = await readData();
  res.json(data.rides_planned);
});

app.post("/api/rides/planned", async (req, res) => {
  const data = await readData();
  const record = {
    ...req.body,
    waitTimes: safeJsonString(req.body.waitTimes),
    expectedExpenses: safeJsonString(req.body.expectedExpenses)
  };
  data.rides_planned.push(record);
  await writeData(data);
  res.json({ ok: true });
});

app.put("/api/rides/planned/:id", async (req, res) => {
  const data = await readData();
  const idx = findIndexById(data.rides_planned, req.params.id);

  if (idx === -1) {
    return res.status(404).json({ ok: false, message: "Ride planned record not found" });
  }

  data.rides_planned[idx] = {
    ...req.body,
    id: req.params.id,
    waitTimes: safeJsonString(req.body.waitTimes),
    expectedExpenses: safeJsonString(req.body.expectedExpenses)
  };

  await writeData(data);
  res.json({ ok: true });
});

app.delete("/api/rides/planned/:id", async (req, res) => {
  const data = await readData();
  data.rides_planned = data.rides_planned.filter(item => item.id !== req.params.id);
  await writeData(data);
  res.json({ ok: true });
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FuelRideManager API running on port ${PORT}`);
});