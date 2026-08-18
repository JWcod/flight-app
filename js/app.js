// Main app: tabs, airport autocomplete, add-flight flow, list, stats, settings.

const AIRPORT_INDEX = Object.entries(AIRPORTS).map(([iata, a]) => ({
  iata,
  ...a,
  search: `${iata} ${a.city} ${a.country} ${a.name}`.toLowerCase(),
}));

const AIRLINE_NAMES = Array.from(
  new Set(Object.values(AIRLINES).map((a) => a.name))
).sort();

let map = null;
let pendingFlightDetails = null; // selected candidate from API search, or null for manual
let selectedStatsYear = null;    // null = all years
let selectedFlightsYear = null;  // null = all years (flight list grouped by year instead)

// ---------- Airline logo helpers ----------
const AIRLINE_IATA_BY_NAME = {};
for (const [iata, info] of Object.entries(AIRLINES)) {
  if (info.name) AIRLINE_IATA_BY_NAME[info.name.toLowerCase()] = iata;
}

// Manual overrides for airlines missing from or wrong in the dataset
const AIRLINE_LOGO_OVERRIDES = {
  "starlux airlines": "JX",
  "starlux": "JX",
  "星宇航空": "JX",
  "ita airways": "AZ",
  "ita": "AZ",
  "vueling airlines": "VY",
  "vueling": "VY",
  "indigo": "6E",
  "air india": "AI",
  "scoot": "TR",
  "cebu pacific": "5J",
  "peach aviation": "MM",
  "jetstar pacific": "BL",
};

function getAirlineIata(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (AIRLINE_LOGO_OVERRIDES[lower]) return AIRLINE_LOGO_OVERRIDES[lower];
  if (AIRLINE_IATA_BY_NAME[lower]) return AIRLINE_IATA_BY_NAME[lower];
  if (lower.length < 5) return null;
  for (const [key, iata] of Object.entries(AIRLINE_IATA_BY_NAME)) {
    if (key.length >= 5 && (lower.includes(key) || key.includes(lower))) return iata;
  }
  return null;
}

function createInitialEl(letter) {
  const span = document.createElement("span");
  span.className = "airline-initial";
  span.textContent = letter;
  return span;
}

function createAirlineLogoEl(name) {
  const iata = getAirlineIata(name);
  const initial = (name || "?")[0].toUpperCase();
  if (!iata) return createInitialEl(initial);
  const img = document.createElement("img");
  img.className = "airline-logo";
  img.alt = "";
  // Kiwi.com CDN: actively maintained, covers newer airlines like Starlux
  // gstatic has better-looking logos for established airlines (BA, EVA Air…)
  // Kiwi.com is the fallback for newer ones (StarLux, ITA, Vueling…)
  img.src = `https://www.gstatic.com/flights/airline_logos/70px/${iata}.png`;
  img.addEventListener("error", () => {
    const img2 = document.createElement("img");
    img2.className = "airline-logo";
    img2.alt = "";
    img2.src = `https://images.kiwi.com/airlines/64/${iata}.png`;
    img2.addEventListener("error", () => img2.replaceWith(createInitialEl(initial)));
    img.replaceWith(img2);
  });
  return img;
}

function estimateFlightDuration(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return null;
  // Cruise speed varies by sector length; formula matches the stats calculation
  const totalHours = distanceKm / 750 + 0.75;
  const h = Math.floor(totalHours);
  const m = Math.round((totalHours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------- Tabs ----------
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");
  const indicator = document.getElementById("tab-indicator");

  function moveIndicator(btn) {
    if (!indicator || !btn) return;
    indicator.style.width = `${btn.offsetWidth}px`;
    indicator.style.height = `${btn.offsetHeight}px`;
    indicator.style.top = `${btn.offsetTop}px`;
    indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      moveIndicator(btn);
      if (btn.dataset.tab === "map") {
        setTimeout(refreshMap, 50);
      }
      if (btn.dataset.tab === "stats") {
        animateStatCounters();
      }
    });
  });

  requestAnimationFrame(() => moveIndicator(document.querySelector(".tab-button.active")));
  window.addEventListener("resize", () => moveIndicator(document.querySelector(".tab-button.active")));
}

// ---------- Count-up animation for headline stat numbers ----------
function animateCountUp(el, endValue, formatter = (v) => Math.round(v).toLocaleString()) {
  const duration = 700;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatter(endValue * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateStatCounters() {
  ["stat-total-flights", "stat-airports", "stat-countries"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const end = parseInt(el.textContent.replace(/,/g, ""), 10) || 0;
    animateCountUp(el, end);
  });
}

// ---------- Airport autocomplete ----------
function setupAirportAutocomplete(inputId, listId, hiddenIataAttr) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);

  function close() {
    list.innerHTML = "";
    list.classList.remove("open");
  }

  input.addEventListener("input", () => {
    input.removeAttribute(hiddenIataAttr);
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) {
      close();
      return;
    }
    const starts = [];
    const contains = [];
    for (const a of AIRPORT_INDEX) {
      if (a.iata.toLowerCase() === q || a.search.startsWith(q)) {
        starts.push(a);
      } else if (a.search.includes(q)) {
        contains.push(a);
      }
      if (starts.length >= 8) break;
    }
    const results = starts.concat(contains).slice(0, 8);
    if (results.length === 0) {
      close();
      return;
    }
    list.innerHTML = "";
    results.forEach((a) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.innerHTML = `<strong>${a.iata}</strong> — ${a.city}, ${a.country} <span class="dim">(${a.name})</span>`;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = `${a.iata} - ${a.city}`;
        input.setAttribute(hiddenIataAttr, a.iata);
        close();
      });
      list.appendChild(item);
    });
    list.classList.add("open");
  });

  input.addEventListener("blur", () => setTimeout(close, 100));
}

function getSelectedAirport(inputId, hiddenIataAttr) {
  const input = document.getElementById(inputId);
  const iata = input.getAttribute(hiddenIataAttr);
  if (!iata || !AIRPORTS[iata]) return null;
  return { iata, ...AIRPORTS[iata] };
}

// ---------- Add flight form ----------
function setupAddFlightForm() {
  setupAirportAutocomplete("dep-airport", "dep-airport-list", "data-iata");
  setupAirportAutocomplete("arr-airport", "arr-airport-list", "data-iata");

  document.getElementById("flight-date").value = new Date().toISOString().slice(0, 10);

  const airlineDatalist = document.getElementById("airline-names");
  airlineDatalist.innerHTML = AIRLINE_NAMES.map((n) => `<option value="${escapeHtml(n)}">`).join("");

  document.getElementById("search-flight-btn").addEventListener("click", onSearchFlights);
  document.getElementById("manual-toggle").addEventListener("change", (e) => {
    document.getElementById("manual-fields").classList.toggle("hidden", !e.target.checked);
    document.getElementById("search-results").innerHTML = "";
    pendingFlightDetails = null;
  });

  document.getElementById("add-flight-form").addEventListener("submit", onAddFlight);
}

async function onSearchFlights() {
  const dep = getSelectedAirport("dep-airport", "data-iata");
  const arr = getSelectedAirport("arr-airport", "data-iata");
  const date = document.getElementById("flight-date").value;
  const period = document.getElementById("flight-period").value;
  const resultsEl = document.getElementById("search-results");
  const statusEl = document.getElementById("search-status");

  if (!dep || !arr) {
    statusEl.textContent = "Please select a valid departure and arrival airport from the dropdown.";
    return;
  }
  if (!date) {
    statusEl.textContent = "Please select a date.";
    return;
  }

  const settings = getSettings();
  resultsEl.innerHTML = "";
  pendingFlightDetails = null;
  statusEl.textContent = "Searching...";

  try {
    const matches = await searchFlights({
      apiKey: settings.apiKey,
      depIata: dep.iata,
      arrIata: arr.iata,
      date,
      period,
    });

    if (matches.length === 0) {
      statusEl.textContent = "No matching flights found. Try Manual Entry to fill in the details yourself.";
      return;
    }
    statusEl.textContent = `Found ${matches.length} possible flight${matches.length === 1 ? "" : "s"} — pick one:`;
    matches.forEach((m, idx) => {
      const card = document.createElement("label");
      card.className = "result-card";
      const depTime = formatLocalTime(m.depTimeLocal);
      const arrTime = formatLocalTime(m.arrTimeLocal);
      card.innerHTML = `
        <input type="radio" name="flight-choice" value="${idx}">
        <div>
          <div><strong>${m.airlineName || "Unknown Airline"} ${m.flightNumber}</strong></div>
          <div class="dim">${dep.iata} ${depTime} → ${arr.iata} ${arrTime}${m.aircraftModel ? " · " + m.aircraftModel : ""}</div>
        </div>`;
      card.querySelector("input").addEventListener("change", () => {
        pendingFlightDetails = m;
      });
      resultsEl.appendChild(card);
    });
  } catch (e) {
    statusEl.textContent = e.message || "Something went wrong while searching.";
  }
}

function formatLocalTime(isoLocal) {
  if (!isoLocal) return "";
  const m = isoLocal.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : isoLocal;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function onAddFlight(e) {
  e.preventDefault();
  const dep = getSelectedAirport("dep-airport", "data-iata");
  const arr = getSelectedAirport("arr-airport", "data-iata");
  const date = document.getElementById("flight-date").value;
  const statusEl = document.getElementById("search-status");
  const manual = document.getElementById("manual-toggle").checked;

  if (!dep || !arr) {
    statusEl.textContent = "Please select a valid departure and arrival airport from the dropdown.";
    return;
  }
  if (dep.iata === arr.iata) {
    statusEl.textContent = "Departure and arrival airports can't be the same.";
    return;
  }
  if (!date) {
    statusEl.textContent = "Please select a date.";
    return;
  }

  let airlineName, aircraft;
  if (manual) {
    airlineName = document.getElementById("manual-airline").value.trim();
    aircraft = null;
    if (!airlineName) {
      statusEl.textContent = "Please enter an airline name.";
      return;
    }
  } else {
    if (!pendingFlightDetails) {
      statusEl.textContent = "Search and select a flight first, or check Manual Entry.";
      return;
    }
    airlineName = pendingFlightDetails.airlineName || "Unknown Airline";
    aircraft = pendingFlightDetails.aircraftModel;
  }

  const distanceKm = haversineDistanceKm(dep.lat, dep.lon, arr.lat, arr.lon);

  const flight = {
    id: generateId(),
    date,
    airline: { name: airlineName },
    departure: { iata: dep.iata, name: dep.name, city: dep.city, country: dep.country, lat: dep.lat, lon: dep.lon },
    arrival: { iata: arr.iata, name: arr.name, city: arr.city, country: arr.country, lat: arr.lat, lon: arr.lon },
    aircraft,
    distanceKm: Math.round(distanceKm),
  };

  addFlight(flight);
  resetAddFlightForm();
  statusEl.textContent = "Flight added to your log!";
  renderAll();
}

function resetAddFlightForm() {
  document.getElementById("dep-airport").value = "";
  document.getElementById("dep-airport").removeAttribute("data-iata");
  document.getElementById("arr-airport").value = "";
  document.getElementById("arr-airport").removeAttribute("data-iata");
  document.getElementById("search-results").innerHTML = "";
  document.getElementById("manual-airline").value = "";
  pendingFlightDetails = null;
}

// ---------- Flight list ----------
function createFlightCardEl(f, animIndex) {
  const airlineName = f.airline?.name || "";
  const duration = estimateFlightDuration(f.distanceKm);
  const card = document.createElement("div");
  card.className = "flight-card";
  card.style.animationDelay = `${Math.min(animIndex, 12) * 35}ms`;
  card.innerHTML = `
    <div class="fc-top">
      <div class="fc-airline">
        <span class="fc-logo-slot"></span>
        <span class="fc-airline-name">${escapeHtml(airlineName)}</span>
      </div>
      <div class="fc-date">${f.date}</div>
    </div>
    <div class="fc-route">
      <div class="fc-airport">
        <div class="fc-iata">${f.departure.iata}</div>
        <div class="fc-city">${escapeHtml(f.departure.city)}</div>
      </div>
      <div class="fc-line">
        <div class="fc-dashes"></div>
        <div class="fc-line-center">
          <svg class="fc-plane-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5l8 2.5Z"/></svg>
          ${duration ? `<div class="fc-duration">~${duration}</div>` : ""}
        </div>
        <div class="fc-dashes"></div>
      </div>
      <div class="fc-airport fc-airport-right">
        <div class="fc-iata">${f.arrival.iata}</div>
        <div class="fc-city">${escapeHtml(f.arrival.city)}</div>
      </div>
    </div>
    <div class="fc-bottom">
      <span class="fc-distance">${(f.distanceKm || 0).toLocaleString()} km</span>
      <button class="delete-btn" data-id="${f.id}">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/></svg>
        Delete
      </button>
    </div>
  `;
  card.querySelector(".fc-logo-slot").replaceWith(createAirlineLogoEl(airlineName));
  card.querySelector(".delete-btn").addEventListener("click", () => {
    if (confirm("Delete this flight from your log?")) {
      deleteFlight(f.id);
      renderAll();
    }
  });
  return card;
}

function renderFlightList() {
  const allFlights = getFlights();
  const flights = (selectedFlightsYear
    ? allFlights.filter((f) => f.date?.startsWith(selectedFlightsYear))
    : allFlights
  ).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  const container = document.getElementById("flights-container");
  container.innerHTML = "";

  if (allFlights.length === 0) {
    document.getElementById("flight-list-empty").classList.remove("hidden");
    return;
  }
  document.getElementById("flight-list-empty").classList.add("hidden");

  if (selectedFlightsYear) {
    flights.forEach((f, i) => container.appendChild(createFlightCardEl(f, i)));
    return;
  }

  // No year selected: group the full list under year headers so you're
  // never scrolling through one undifferentiated wall of cards.
  let lastYear = null;
  let animIndex = 0;
  flights.forEach((f) => {
    const year = f.date?.slice(0, 4) || "Unknown";
    if (year !== lastYear) {
      const header = document.createElement("div");
      header.className = "flights-year-header";
      header.textContent = year;
      container.appendChild(header);
      lastYear = year;
    }
    container.appendChild(createFlightCardEl(f, animIndex++));
  });
}

// ---------- Year filters (Flights list + Stats) ----------
// Shared by both tabs' year-pill rows. getSelected/setSelected read and
// write whichever module-level "selected year" variable this filter
// controls; onChange re-renders whatever that filter drives.
function renderYearFilterInto(containerId, getSelected, setSelected, onChange) {
  const allFlights = getFlights();
  const years = Array.from(
    new Set(allFlights.map((f) => f.date?.slice(0, 4)).filter(Boolean))
  ).sort((a, b) => b - a); // newest first

  if (getSelected() && !years.includes(getSelected())) {
    setSelected(null);
  }

  const container = document.getElementById(containerId);
  container.innerHTML = "";
  if (years.length < 2) return; // no point showing filter for 0–1 years

  ["All", ...years].forEach((label) => {
    const isAll = label === "All";
    const active = isAll ? getSelected() === null : getSelected() === label;
    const btn = document.createElement("button");
    btn.className = "year-btn" + (active ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      setSelected(isAll ? null : label);
      onChange();
    });
    container.appendChild(btn);
  });
}

function renderFlightsYearFilter() {
  renderYearFilterInto(
    "flights-year-filter",
    () => selectedFlightsYear,
    (v) => { selectedFlightsYear = v; },
    () => { renderFlightsYearFilter(); renderFlightList(); }
  );
}

function renderYearFilter() {
  renderYearFilterInto(
    "year-filter",
    () => selectedStatsYear,
    (v) => { selectedStatsYear = v; },
    () => { renderYearFilter(); renderStats(); }
  );
}

// ---------- Statistics ----------
function renderStats() {
  const allFlights = getFlights();
  const flights = selectedStatsYear
    ? allFlights.filter(f => f.date?.startsWith(selectedStatsYear))
    : allFlights;
  const totalFlights = flights.length;
  const totalDistance = flights.reduce((sum, f) => sum + (f.distanceKm || 0), 0);

  document.getElementById("stat-total-flights").textContent = totalFlights.toLocaleString();
  document.getElementById("stat-total-distance").textContent = `${totalDistance.toLocaleString()} km`;

  const earthCircumference = 40075;
  const moonDistance = 384400;
  document.getElementById("stat-earth-laps").textContent = (totalDistance / earthCircumference).toFixed(2);
  document.getElementById("stat-moon-pct").textContent = ((totalDistance / moonDistance) * 100).toFixed(1) + "%";

  // Rough block-time estimate: cruise speed + fixed overhead per flight.
  const totalHours = flights.reduce((sum, f) => sum + (f.distanceKm || 0) / 750 + 0.75, 0);
  const days = Math.floor(totalHours / 24);
  const h = Math.floor(totalHours % 24);
  const m = Math.round((totalHours - Math.floor(totalHours)) * 60);
  const timeStr = days > 0 ? `~${days}d ${h}h ${m}m` : `~${h}h ${m}m`;
  document.getElementById("stat-flight-time").textContent = totalFlights > 0 ? timeStr : "—";

  const airports = new Set();
  const countries = new Set();
  flights.forEach((f) => {
    airports.add(f.departure.iata);
    airports.add(f.arrival.iata);
    if (f.departure.country) countries.add(f.departure.country);
    if (f.arrival.country) countries.add(f.arrival.country);
  });
  document.getElementById("stat-airports").textContent = airports.size.toLocaleString();
  document.getElementById("stat-countries").textContent = countries.size.toLocaleString();

  // Airline breakdown
  const counts = new Map();
  flights.forEach((f) => {
    const name = f.airline?.name || "Unknown Airline";
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  const list = document.getElementById("airline-stats-list");
  list.innerHTML = "";
  if (sorted.length === 0) {
    list.innerHTML = '<li class="dim">No data yet</li>';
  } else {
    const maxCount = sorted[0][1];
    sorted.forEach(([name, count]) => {
      const pct = Math.round((count / maxCount) * 100);
      const li = document.createElement("li");
      li.className = "airline-stat-item";
      li.innerHTML = `
        <span class="fc-logo-slot"></span>
        <div class="airline-stat-info">
          <div class="airline-stat-name">${escapeHtml(name)}</div>
          <div class="airline-stat-bar-bg"><div class="airline-stat-bar" style="width:${pct}%"></div></div>
        </div>
        <span class="airline-stat-count">${count}×</span>
      `;
      li.querySelector(".fc-logo-slot").replaceWith(createAirlineLogoEl(name));
      list.appendChild(li);
    });
  }

  // Airport visit counts (each flight = 1 departure + 1 arrival)
  const visitCounts = new Map();
  flights.forEach((f) => {
    const dep = f.departure.iata;
    const arr = f.arrival.iata;
    const depLabel = `${dep} ${f.departure.city}`;
    const arrLabel = `${arr} ${f.arrival.city}`;
    visitCounts.set(depLabel, (visitCounts.get(depLabel) || 0) + 1);
    visitCounts.set(arrLabel, (visitCounts.get(arrLabel) || 0) + 1);
  });
  const sortedAirports = Array.from(visitCounts.entries()).sort((a, b) => b[1] - a[1]);

  const airportList = document.getElementById("airport-stats-list");
  airportList.innerHTML = "";
  if (sortedAirports.length === 0) {
    airportList.innerHTML = '<li class="dim">No data yet</li>';
  } else {
    sortedAirports.forEach(([label, count]) => {
      const [iata, ...cityParts] = label.split(" ");
      const city = cityParts.join(" ");
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="airport-stat-name">
          <span class="airport-iata">${iata}</span>
          <span class="airport-city">${escapeHtml(city)}</span>
        </div>
        <span class="badge">${count}×</span>
      `;
      airportList.appendChild(li);
    });
  }
}

// ---------- Settings ----------
function setupSettings() {
  const settings = getSettings();
  document.getElementById("api-key-input").value = settings.apiKey || "";

  document.getElementById("save-settings-btn").addEventListener("click", () => {
    saveSettings({ apiKey: document.getElementById("api-key-input").value.trim() });
    document.getElementById("settings-status").textContent = "Saved.";
  });

  document.getElementById("export-btn").addEventListener("click", () => exportData());

  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importData(file, (err, count) => {
      if (err) {
        document.getElementById("settings-status").textContent = "Import failed: invalid file format.";
      } else {
        document.getElementById("settings-status").textContent = `Imported ${count} flight${count === 1 ? "" : "s"}.`;
        renderAll();
      }
    });
    e.target.value = "";
  });

  document.getElementById("clear-data-btn").addEventListener("click", () => {
    if (confirm("Clear all flight records? This can't be undone.")) {
      saveFlights([]);
      renderAll();
    }
  });
}

// ---------- Visited country flags ----------
const COUNTRY_ISO = {
  "Afghanistan":"AF","Albania":"AL","Algeria":"DZ","Argentina":"AR","Armenia":"AM",
  "Australia":"AU","Austria":"AT","Azerbaijan":"AZ","Bahrain":"BH","Bangladesh":"BD",
  "Belgium":"BE","Bhutan":"BT","Bolivia":"BO","Brazil":"BR","Bulgaria":"BG",
  "Cambodia":"KH","Canada":"CA","Chile":"CL","China":"CN","Colombia":"CO",
  "Croatia":"HR","Cuba":"CU","Cyprus":"CY","Czech Republic":"CZ","Denmark":"DK",
  "Ecuador":"EC","Egypt":"EG","Estonia":"EE","Ethiopia":"ET","Finland":"FI",
  "France":"FR","Georgia":"GE","Germany":"DE","Ghana":"GH","Greece":"GR",
  "Hong Kong":"HK","Hong Kong SAR of China":"HK","Hungary":"HU","Iceland":"IS",
  "India":"IN","Indonesia":"ID","Iran":"IR","Iraq":"IQ","Ireland":"IE",
  "Israel":"IL","Italy":"IT","Japan":"JP","Jordan":"JO","Kazakhstan":"KZ",
  "Kenya":"KE","Kuwait":"KW","Laos":"LA","Latvia":"LV","Lebanon":"LB",
  "Lithuania":"LT","Luxembourg":"LU","Macao":"MO","Malaysia":"MY","Maldives":"MV",
  "Mexico":"MX","Mongolia":"MN","Morocco":"MA","Myanmar":"MM","Nepal":"NP",
  "Netherlands":"NL","New Zealand":"NZ","Nigeria":"NG","Norway":"NO","Oman":"OM",
  "Pakistan":"PK","Peru":"PE","Philippines":"PH","Poland":"PL","Portugal":"PT",
  "Qatar":"QA","Republic of Korea":"KR","Romania":"RO","Russia":"RU",
  "Saudi Arabia":"SA","Serbia":"RS","Singapore":"SG","Slovakia":"SK",
  "Slovenia":"SI","South Africa":"ZA","South Korea":"KR","Spain":"ES",
  "Sri Lanka":"LK","Sweden":"SE","Switzerland":"CH","Taiwan":"TW",
  "Thailand":"TH","Tunisia":"TN","Turkey":"TR","UAE":"AE",
  "United Arab Emirates":"AE","United Kingdom":"GB","United States":"US",
  "Uruguay":"UY","Uzbekistan":"UZ","Vietnam":"VN","Zimbabwe":"ZW",
};

function countryToFlag(name) {
  const iso = COUNTRY_ISO[name];
  if (!iso) return null;
  return Array.from(iso)
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join("");
}

function renderVisitedFlags() {
  const flagsEl = document.getElementById("visited-flags");
  if (!flagsEl) return;
  const flights = getFlights();
  const countries = new Set();
  flights.forEach(f => {
    if (f.departure?.country) countries.add(f.departure.country);
    if (f.arrival?.country) countries.add(f.arrival.country);
  });
  const items = Array.from(countries)
    .map(name => ({ name, flag: countryToFlag(name) }))
    .filter(c => c.flag)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (items.length === 0) { flagsEl.innerHTML = ""; return; }
  flagsEl.innerHTML = `
    <span class="flags-label">Places You've Been</span>
    <div class="flags-row">
      ${items.map(c => `
        <div class="flag-item">
          <span class="flag-emoji">${c.flag}</span>
          <span class="flag-name">${escapeHtml(c.name)}</span>
        </div>`).join("")}
    </div>
  `;
}

// ---------- Milestones ----------
const MILESTONE_ICONS = {
  flights: `<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5l8 2.5Z"/>`,
  countries: `<path d="M5 21V3m0 3h13l-2.5 3.5L18 13H5"/>`,
  distance: `<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4"/>`,
  moon: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>`,
  airports: `<path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/>`,
};

const fmtCount = (v) => `${Math.floor(v).toLocaleString()}`;
const fmtKm = (v) => `${Math.round(v).toLocaleString()} km`;

const MILESTONES = [
  { id: "flights-1", category: "flights", title: "First Flight", desc: "Log your first flight", target: 1, metric: (s) => s.totalFlights, format: fmtCount },
  { id: "flights-10", category: "flights", title: "Frequent Flyer", desc: "Log 10 flights", target: 10, metric: (s) => s.totalFlights, format: fmtCount },
  { id: "flights-25", category: "flights", title: "Jet Setter", desc: "Log 25 flights", target: 25, metric: (s) => s.totalFlights, format: fmtCount },
  { id: "flights-50", category: "flights", title: "Globetrotter", desc: "Log 50 flights", target: 50, metric: (s) => s.totalFlights, format: fmtCount },
  { id: "countries-5", category: "countries", title: "Explorer", desc: "Visit 5 countries", target: 5, metric: (s) => s.countries, format: fmtCount },
  { id: "countries-10", category: "countries", title: "World Traveler", desc: "Visit 10 countries", target: 10, metric: (s) => s.countries, format: fmtCount },
  { id: "countries-20", category: "countries", title: "Globe Conqueror", desc: "Visit 20 countries", target: 20, metric: (s) => s.countries, format: fmtCount },
  { id: "airports-15", category: "airports", title: "Airport Hopper", desc: "Pass through 15 airports", target: 15, metric: (s) => s.airports, format: fmtCount },
  { id: "airports-30", category: "airports", title: "Hub Master", desc: "Pass through 30 airports", target: 30, metric: (s) => s.airports, format: fmtCount },
  { id: "laps-1", category: "distance", title: "Around the World", desc: "Fly 1 lap around Earth", target: 40075, metric: (s) => s.totalDistance, format: fmtKm },
  { id: "laps-2", category: "distance", title: "Double Orbit", desc: "Fly 2 laps around Earth", target: 80150, metric: (s) => s.totalDistance, format: fmtKm },
  { id: "moon", category: "moon", title: "To the Moon", desc: "Fly the distance to the Moon", target: 384400, metric: (s) => s.totalDistance, format: fmtKm },
];

function computeLifetimeStats() {
  const flights = getFlights();
  const totalDistance = flights.reduce((sum, f) => sum + (f.distanceKm || 0), 0);
  const airports = new Set();
  const countries = new Set();
  flights.forEach((f) => {
    airports.add(f.departure.iata);
    airports.add(f.arrival.iata);
    if (f.departure.country) countries.add(f.departure.country);
    if (f.arrival.country) countries.add(f.arrival.country);
  });
  return {
    totalFlights: flights.length,
    totalDistance,
    airports: airports.size,
    countries: countries.size,
  };
}

function renderMilestones() {
  const grid = document.getElementById("milestones-grid");
  if (!grid) return;
  const stats = computeLifetimeStats();

  grid.innerHTML = MILESTONES.map((m) => {
    const value = m.metric(stats);
    const unlocked = value >= m.target;
    const pct = Math.max(0, Math.min(100, Math.round((value / m.target) * 100)));
    return `
      <div class="milestone-badge ${unlocked ? "unlocked" : "locked"}">
        <div class="milestone-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${MILESTONE_ICONS[m.category]}</svg>
        </div>
        <div class="milestone-info">
          <div class="milestone-title">${m.title}</div>
          <div class="milestone-desc">${m.desc}</div>
          ${unlocked
            ? `<div class="milestone-unlocked-label">Unlocked</div>`
            : `<div class="milestone-progress-bg"><div class="milestone-progress" style="width:${pct}%"></div></div>
               <div class="milestone-progress-label">${m.format(value)} / ${m.format(m.target)}</div>`
          }
        </div>
      </div>
    `;
  }).join("");
}

// ---------- Map hero stats ----------
function renderMapHeroStats() {
  const el = document.getElementById("map-hero-stats");
  if (!el) return;
  const flights = getFlights();
  const totalDistance = flights.reduce((sum, f) => sum + (f.distanceKm || 0), 0);
  const countries = new Set();
  flights.forEach((f) => {
    if (f.departure?.country) countries.add(f.departure.country);
    if (f.arrival?.country) countries.add(f.arrival.country);
  });
  if (flights.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <div class="hero-stat">
      <div class="hero-stat-value">${flights.length.toLocaleString()}</div>
      <div class="hero-stat-label">Flights</div>
    </div>
    <div class="hero-stat-divider"></div>
    <div class="hero-stat">
      <div class="hero-stat-value">${totalDistance.toLocaleString()}</div>
      <div class="hero-stat-label">km flown</div>
    </div>
    <div class="hero-stat-divider"></div>
    <div class="hero-stat">
      <div class="hero-stat-value">${countries.size}</div>
      <div class="hero-stat-label">Countries</div>
    </div>
  `;
}

// ---------- Render all ----------
function renderAll() {
  renderFlightsYearFilter();
  renderFlightList();
  renderYearFilter();
  renderStats();
  renderMilestones();
  renderVisitedFlags();
  renderMapHeroStats();
  if (isMapTabActive()) refreshMap();
}

function isMapTabActive() {
  const btn = document.querySelector('.tab-button[data-tab="map"]');
  return btn && btn.classList.contains("active");
}

// Re-measure the map container, (re)draw routes, and fit the view.
// Must only run while the #map container is visible, otherwise Leaflet
// computes layer positions against a zero-size container.
function refreshMap() {
  invalidateMapSize();
  renderRoutes(getFlights());
  fitMapToRoutes();
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupAddFlightForm();
  setupSettings();
  document.getElementById("empty-state-cta")?.addEventListener("click", () => {
    document.querySelector('.tab-button[data-tab="add"]')?.click();
  });
  map = initMap("map");
  await initStorage(); // sync data/flights.json → localStorage before first render
  renderAll();
  setTimeout(refreshMap, 50);
});
