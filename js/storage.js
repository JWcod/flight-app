// localStorage persistence for flight log entries and settings.
// When the local server is running, data is also synced to data/flights.json.

const STORAGE_KEY_FLIGHTS = "flightlog.flights";
const STORAGE_KEY_SETTINGS = "flightlog.settings";

// Load from server into localStorage on startup; falls back to localStorage if server is unavailable.
async function initStorage() {
  try {
    const res = await fetch("/api/flights");
    if (res.ok) {
      const flights = await res.json();
      if (Array.isArray(flights)) {
        localStorage.setItem(STORAGE_KEY_FLIGHTS, JSON.stringify(flights));
      }
    }
  } catch {
    // Server not running — use whatever is already in localStorage.
  }
}

function getFlights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FLIGHTS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to read flights from storage", e);
    return [];
  }
}

function saveFlights(flights) {
  localStorage.setItem(STORAGE_KEY_FLIGHTS, JSON.stringify(flights));
  // Persist to disk via local server (fire-and-forget).
  fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flights),
  }).catch(() => {});
}

function addFlight(flight) {
  const flights = getFlights();
  flights.push(flight);
  saveFlights(flights);
  return flights;
}

function deleteFlight(id) {
  const flights = getFlights().filter((f) => f.id !== id);
  saveFlights(flights);
  return flights;
}

function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    return raw ? JSON.parse(raw) : { apiKey: "" };
  } catch (e) {
    return { apiKey: "" };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function exportData() {
  const data = {
    flights: getFlights(),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flight-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.flights)) throw new Error("Invalid file");
      saveFlights(data.flights);
      onDone(null, data.flights.length);
    } catch (e) {
      onDone(e);
    }
  };
  reader.readAsText(file);
}
