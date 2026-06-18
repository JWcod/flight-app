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
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "map") {
        setTimeout(refreshMap, 50);
      }
    });
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
    statusEl.textContent = "請從下拉選單中選擇有效的出發與抵達機場。";
    return;
  }
  if (!date) {
    statusEl.textContent = "請選擇日期。";
    return;
  }

  const settings = getSettings();
  resultsEl.innerHTML = "";
  pendingFlightDetails = null;
  statusEl.textContent = "搜尋中...";

  try {
    const matches = await searchFlights({
      apiKey: settings.apiKey,
      depIata: dep.iata,
      arrIata: arr.iata,
      date,
      period,
    });

    if (matches.length === 0) {
      statusEl.textContent = "找不到符合的航班，可改用「手動輸入」自行填寫航班資訊。";
      return;
    }
    statusEl.textContent = `找到 ${matches.length} 個可能的航班，請選擇：`;
    matches.forEach((m, idx) => {
      const card = document.createElement("label");
      card.className = "result-card";
      const depTime = formatLocalTime(m.depTimeLocal);
      const arrTime = formatLocalTime(m.arrTimeLocal);
      card.innerHTML = `
        <input type="radio" name="flight-choice" value="${idx}">
        <div>
          <div><strong>${m.airlineName || "未知航空公司"} ${m.flightNumber}</strong></div>
          <div class="dim">${dep.iata} ${depTime} → ${arr.iata} ${arrTime}${m.aircraftModel ? " · " + m.aircraftModel : ""}</div>
        </div>`;
      card.querySelector("input").addEventListener("change", () => {
        pendingFlightDetails = m;
      });
      resultsEl.appendChild(card);
    });
  } catch (e) {
    statusEl.textContent = e.message || "查詢時發生錯誤。";
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
    statusEl.textContent = "請從下拉選單中選擇有效的出發與抵達機場。";
    return;
  }
  if (dep.iata === arr.iata) {
    statusEl.textContent = "出發與抵達機場不能相同。";
    return;
  }
  if (!date) {
    statusEl.textContent = "請選擇日期。";
    return;
  }

  let airlineName, aircraft;
  if (manual) {
    airlineName = document.getElementById("manual-airline").value.trim();
    aircraft = null;
    if (!airlineName) {
      statusEl.textContent = "請輸入航空公司名稱。";
      return;
    }
  } else {
    if (!pendingFlightDetails) {
      statusEl.textContent = "請先搜尋並選擇航班，或勾選「手動輸入」。";
      return;
    }
    airlineName = pendingFlightDetails.airlineName || "未知航空公司";
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
  statusEl.textContent = "已加入航班紀錄！";
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
function renderFlightList() {
  const flights = getFlights().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const container = document.getElementById("flights-container");
  container.innerHTML = "";

  if (flights.length === 0) {
    document.getElementById("flight-list-empty").classList.remove("hidden");
    return;
  }
  document.getElementById("flight-list-empty").classList.add("hidden");

  flights.forEach((f) => {
    const airlineName = f.airline?.name || "";
    const duration = estimateFlightDuration(f.distanceKm);
    const card = document.createElement("div");
    card.className = "flight-card";
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
            <div class="fc-plane-icon">✈</div>
            ${duration ? `<div class="fc-duration">約 ${duration}</div>` : ""}
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
        <button class="delete-btn" data-id="${f.id}">✕ 刪除</button>
      </div>
    `;
    card.querySelector(".fc-logo-slot").replaceWith(createAirlineLogoEl(airlineName));
    card.querySelector(".delete-btn").addEventListener("click", () => {
      if (confirm("確定要刪除這筆航班紀錄嗎？")) {
        deleteFlight(f.id);
        renderAll();
      }
    });
    container.appendChild(card);
  });
}

// ---------- Year filter ----------
function renderYearFilter() {
  const allFlights = getFlights();
  const years = Array.from(
    new Set(allFlights.map(f => f.date?.slice(0, 4)).filter(Boolean))
  ).sort((a, b) => b - a); // newest first

  // Auto-reset if selected year no longer exists
  if (selectedStatsYear && !years.includes(selectedStatsYear)) {
    selectedStatsYear = null;
  }

  const container = document.getElementById("year-filter");
  container.innerHTML = "";
  if (years.length < 2) return; // no point showing filter for 0–1 years

  ["全部", ...years].forEach(label => {
    const isAll = label === "全部";
    const active = isAll ? selectedStatsYear === null : selectedStatsYear === label;
    const btn = document.createElement("button");
    btn.className = "year-btn" + (active ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      selectedStatsYear = isAll ? null : label;
      renderYearFilter();
      renderStats();
    });
    container.appendChild(btn);
  });
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
  const timeStr = days > 0 ? `約 ${days} 天 ${h} 小時 ${m} 分` : `約 ${h} 小時 ${m} 分`;
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
    const name = f.airline?.name || "未知航空公司";
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  const list = document.getElementById("airline-stats-list");
  list.innerHTML = "";
  if (sorted.length === 0) {
    list.innerHTML = '<li class="dim">尚無資料</li>';
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
        <span class="airline-stat-count">${count} 次</span>
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
    airportList.innerHTML = '<li class="dim">尚無資料</li>';
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
        <span class="badge">${count} 次</span>
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
    document.getElementById("settings-status").textContent = "已儲存。";
  });

  document.getElementById("export-btn").addEventListener("click", () => exportData());

  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importData(file, (err, count) => {
      if (err) {
        document.getElementById("settings-status").textContent = "匯入失敗：檔案格式錯誤。";
      } else {
        document.getElementById("settings-status").textContent = `已匯入 ${count} 筆航班紀錄。`;
        renderAll();
      }
    });
    e.target.value = "";
  });

  document.getElementById("clear-data-btn").addEventListener("click", () => {
    if (confirm("確定要清除所有航班紀錄嗎？此動作無法復原。")) {
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
    <span class="flags-label">飛行足跡</span>
    <div class="flags-row">
      ${items.map(c => `
        <div class="flag-item">
          <span class="flag-emoji">${c.flag}</span>
          <span class="flag-name">${escapeHtml(c.name)}</span>
        </div>`).join("")}
    </div>
  `;
}

// ---------- Render all ----------
function renderAll() {
  renderFlightList();
  renderYearFilter();
  renderStats();
  renderVisitedFlags();
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
  map = initMap("map");
  await initStorage(); // sync data/flights.json → localStorage before first render
  renderAll();
  setTimeout(refreshMap, 50);
});
