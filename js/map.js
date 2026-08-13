// Interactive 3D globe (globe.gl / Three.js): flight routes drawn as
// animated arcs over a night-lit Earth, with drag-to-rotate, scroll-to-zoom,
// idle auto-rotation, and click-to-focus on airports.

let _globe = null;
let _lastAirports = new Map();
let _resumeRotateTimer = null;

// Deterministic color from a string (airline name/code).
function colorForAirline(key) {
  const palette = [
    "#e6194b", "#3cb44b", "#4cc9f0", "#f58231", "#9d6bff",
    "#42d4f4", "#f032e6", "#bfef45", "#5865f2", "#ffd166",
    "#ef476f", "#06d6a0", "#118ab2", "#adb5bd", "#fabed4",
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % palette.length;
  }
  return palette[Math.abs(hash) % palette.length];
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Circular (angular) mean — a plain average of longitudes breaks near the
// antimeridian; this treats each longitude as a point on a circle instead.
function circularMeanLng(lngs) {
  let sumSin = 0, sumCos = 0;
  lngs.forEach((lng) => {
    const rad = (lng * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  });
  return (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
}

const GLOBE_ASSETS = "https://cdn.jsdelivr.net/npm/three-globe/example/img";

function initMap(containerId) {
  const el = document.getElementById(containerId);

  _globe = new Globe(el)
    .globeImageUrl(`${GLOBE_ASSETS}/earth-night.jpg`)
    .bumpImageUrl(`${GLOBE_ASSETS}/earth-topology.png`)
    .backgroundImageUrl(`${GLOBE_ASSETS}/night-sky.png`)
    .showAtmosphere(true)
    .atmosphereColor("#4cc9f0")
    .atmosphereAltitude(0.2)
    .width(el.clientWidth)
    .height(el.clientHeight)
    .arcLabel((d) => `<div class="globe-tooltip"><strong>${d.airlineName || "Unknown Airline"}</strong><br>${d.depIata} → ${d.arrIata}${d.date ? `<br>${d.date}` : ""}</div>`)
    .arcStartLat("startLat")
    .arcStartLng("startLng")
    .arcEndLat("endLat")
    .arcEndLng("endLng")
    .arcColor("color")
    .arcAltitudeAutoScale(0.4)
    .arcStroke(0.5)
    .arcDashLength(0.35)
    .arcDashGap(0.18)
    .arcDashAnimateTime(2600)
    .pointLat("lat")
    .pointLng("lon")
    .pointLabel((d) => `<div class="globe-tooltip"><strong>${d.iata}</strong><br>${d.city || d.name || ""}</div>`)
    .pointColor(() => "#8fd9f5")
    .pointAltitude(0.012)
    .pointRadius(0.32)
    .pointResolution(24)
    .pointsMerge(true)
    .onPointClick((pt) => {
      _globe.pointOfView({ lat: pt.lat, lng: pt.lon, altitude: 1.3 }, 1000);
    });

  const controls = _globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    if (_resumeRotateTimer) clearTimeout(_resumeRotateTimer);
  });
  controls.addEventListener("end", () => {
    _resumeRotateTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, 3500);
  });

  _globe.pointOfView({ lat: 20, lng: 40, altitude: 2.5 }, 0);

  window.addEventListener("resize", invalidateMapSize);

  return _globe;
}

function renderRoutes(flights) {
  if (!_globe) return;

  const airportsSeen = new Map();
  const arcs = [];

  flights.forEach((flight) => {
    const { departure, arrival, airline } = flight;
    if (!departure?.lat || !arrival?.lat) return;

    const colorKey = airline?.name || airline?.iata || "unknown";
    const color = colorForAirline(colorKey);

    arcs.push({
      startLat: departure.lat,
      startLng: departure.lon,
      endLat: arrival.lat,
      endLng: arrival.lon,
      color: [hexToRgba(color, 0.35), hexToRgba(color, 0.95)],
      airlineName: airline?.name,
      depIata: departure.iata,
      arrIata: arrival.iata,
      date: flight.date,
    });

    [departure, arrival].forEach((apt) => {
      if (!airportsSeen.has(apt.iata)) airportsSeen.set(apt.iata, apt);
    });
  });

  _globe.arcsData(arcs);
  _globe.pointsData(Array.from(airportsSeen.values()));
  _lastAirports = airportsSeen;
}

// Recenters the camera on the average location of all visited airports.
// Uses a circular mean for longitude so a route set spanning the
// antimeridian doesn't collapse toward an unrelated midpoint.
function fitMapToRoutes() {
  if (!_globe || _lastAirports.size === 0) return;
  const pts = Array.from(_lastAirports.values());
  const avgLat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
  const avgLng = circularMeanLng(pts.map((p) => p.lon));
  _globe.pointOfView({ lat: avgLat, lng: avgLng, altitude: 2.5 }, 1200);
}

function invalidateMapSize() {
  if (!_globe) return;
  const el = document.getElementById("map");
  if (!el) return;
  _globe.width(el.clientWidth).height(el.clientHeight);
}
