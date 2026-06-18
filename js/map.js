// Leaflet world map: draws great-circle flight routes and airport markers.

let _map = null;
let _routeLayer = null;
let _markerLayer = null;

function initMap(containerId) {
  _map = L.map(containerId, {
    worldCopyJump: true,
    minZoom: 2,
  }).setView([20, 0], 2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  }).addTo(_map);

  _routeLayer = L.layerGroup().addTo(_map);
  _markerLayer = L.layerGroup().addTo(_map);

  return _map;
}

// Deterministic color from a string (airline name/code).
function colorForAirline(key) {
  const palette = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
    "#42d4f4", "#f032e6", "#bfef45", "#469990", "#9A6324",
    "#800000", "#808000", "#000075", "#a9a9a9", "#fabed4",
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % palette.length;
  }
  return palette[Math.abs(hash) % palette.length];
}

// Leaflet's tile layer repeats every 360° of longitude. Routes/markers
// are drawn once per "world copy" so a route that crosses the
// antimeridian (e.g. Taiwan <-> US) still renders as one continuous
// line no matter which copy of the world is in view.
const WORLD_COPY_OFFSETS = [-360, 0, 360];

function renderRoutes(flights) {
  _routeLayer.clearLayers();
  _markerLayer.clearLayers();

  const airportsSeen = new Map();

  flights.forEach((flight) => {
    const { departure, arrival, airline } = flight;
    if (!departure?.lat || !arrival?.lat) return;

    const colorKey = airline?.name || airline?.iata || "unknown";
    const color = colorForAirline(colorKey);

    // Continuous (unwrapped) points - longitude may fall outside ±180.
    const points = greatCirclePoints(departure.lat, departure.lon, arrival.lat, arrival.lon, 96);

    WORLD_COPY_OFFSETS.forEach((offset) => {
      const seg = points.map(([lat, lon]) => [lat, lon + offset]);
      // Glow layer behind the main line
      L.polyline(seg, { color, weight: 7, opacity: 0.18 }).addTo(_routeLayer);
      // Main line
      L.polyline(seg, { color, weight: 2, opacity: 0.9 })
        .bindTooltip(`${airline?.name || "未知航空"}<br>${departure.iata} → ${arrival.iata}<br>${flight.date || ""}`)
        .addTo(_routeLayer);
    });

    [departure, arrival].forEach((apt) => {
      if (!airportsSeen.has(apt.iata)) {
        airportsSeen.set(apt.iata, apt);
      }
    });
  });

  airportsSeen.forEach((apt) => {
    WORLD_COPY_OFFSETS.forEach((offset) => {
      L.circleMarker([apt.lat, apt.lon + offset], {
        radius: 5,
        color: "#4cc9f0",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(`${apt.iata} - ${apt.city || apt.name}`)
        .addTo(_markerLayer);
    });
  });

  _lastAirports = airportsSeen;
}

let _lastAirports = new Map();

// Fit the map view to all visited airports. Only meaningful while the
// map container is visible (a hidden container has zero size, which
// would otherwise leave the map stuck at a tiny/incorrect viewport).
function fitMapToRoutes() {
  if (!_map || _lastAirports.size === 0) return;
  const bounds = L.latLngBounds(
    Array.from(_lastAirports.values()).map((a) => [a.lat, a.lon])
  );
  _map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5 });
}

function invalidateMapSize() {
  if (_map) _map.invalidateSize();
}
