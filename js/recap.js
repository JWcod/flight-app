// Shareable "flight recap" image: renders lifetime stats + a stylized
// world map with every route onto an offscreen canvas, previewed in a
// modal and downloadable as a PNG.

const RECAP_W = 1080;
const RECAP_H = 1920;
const RECAP_LON_RANGE = [-180, 180];
const RECAP_LAT_RANGE = [-58, 83]; // crop deep Antarctica for a bigger, more legible map

function recapProject(lon, lat, rect) {
  const [lonMin, lonMax] = RECAP_LON_RANGE;
  const [latMin, latMax] = RECAP_LAT_RANGE;
  const x = rect.x + ((lon - lonMin) / (lonMax - lonMin)) * rect.w;
  const y = rect.y + ((latMax - lat) / (latMax - latMin)) * rect.h;
  return [x, y];
}

function recapRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function recapDrawGlow(ctx, cx, cy, radius, color) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function recapDrawPlaneLogo(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  const path = new Path2D("M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5l8 2.5Z");
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
}

function recapDrawWorldLand(ctx, rect) {
  ctx.save();
  recapRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 20);
  ctx.clip();
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  WORLD_LAND.forEach((polygon) => {
    ctx.beginPath();
    polygon.forEach((ring) => {
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = recapProject(ring[i], ring[i + 1], rect);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    });
    ctx.fill("evenodd");
    ctx.stroke();
  });
  ctx.restore();
}

// Splits a sampled great-circle path into separate segments wherever it
// wraps across the map edge, so a Pacific-crossing route doesn't draw a
// stray line straight across the whole canvas.
function recapBuildRouteSegments(points, rect) {
  const segments = [];
  let current = [];
  let prevX = null;
  points.forEach(([lat, lon]) => {
    const wrapped = (((lon + 180) % 360) + 360) % 360 - 180;
    const [x, y] = recapProject(wrapped, lat, rect);
    if (prevX !== null && Math.abs(x - prevX) > rect.w * 0.5) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push([x, y]);
    prevX = x;
  });
  if (current.length > 1) segments.push(current);
  return segments;
}

function recapDrawRoutes(ctx, flights, rect) {
  ctx.save();
  recapRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 20);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  flights.forEach((f) => {
    const dep = f.departure, arr = f.arrival;
    if (!dep?.lat || !arr?.lat) return;
    const color = colorForAirline(f.airline?.name || f.airline?.iata || "unknown");
    const points = greatCirclePoints(dep.lat, dep.lon, arr.lat, arr.lon, 48);
    const segments = recapBuildRouteSegments(points, rect);

    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.88;

    segments.forEach((seg) => {
      ctx.beginPath();
      seg.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  });

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

function recapDrawAirportPoints(ctx, airportsMap, rect) {
  ctx.save();
  recapRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 20);
  ctx.clip();
  airportsMap.forEach((apt) => {
    const [x, y] = recapProject(apt.lon, apt.lat, rect);
    ctx.beginPath();
    ctx.fillStyle = "rgba(143, 217, 245, 0.28)";
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function recapDrawStatBox(ctx, x, y, w, h, value, label, gradient) {
  recapRoundedRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = "800 64px -apple-system, sans-serif";
  const grad = ctx.createLinearGradient(x + 32, y, x + w - 32, y);
  grad.addColorStop(0, gradient[0]);
  grad.addColorStop(1, gradient[1]);
  ctx.fillStyle = grad;
  ctx.fillText(value, x + 32, y + h * 0.56);

  ctx.font = "600 26px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(147, 161, 184, 0.95)";
  ctx.fillText(label.toUpperCase(), x + 32, y + h * 0.56 + 42);
}

function buildRecapCanvas() {
  const flights = getFlights();
  const stats = computeLifetimeStats();
  const earthCircumference = 40075;
  const moonDistance = 384400;
  const laps = (stats.totalDistance / earthCircumference).toFixed(2);
  const moonPct = ((stats.totalDistance / moonDistance) * 100).toFixed(1);

  const countries = new Set();
  const airportsMap = new Map();
  flights.forEach((f) => {
    if (f.departure?.country) countries.add(f.departure.country);
    if (f.arrival?.country) countries.add(f.arrival.country);
    if (f.departure?.iata && !airportsMap.has(f.departure.iata)) airportsMap.set(f.departure.iata, f.departure);
    if (f.arrival?.iata && !airportsMap.has(f.arrival.iata)) airportsMap.set(f.arrival.iata, f.arrival);
  });
  const flagItems = Array.from(countries)
    .map((name) => ({ name, flag: countryToFlag(name) }))
    .filter((c) => c.flag)
    .sort((a, b) => a.name.localeCompare(b.name));

  const canvas = document.createElement("canvas");
  canvas.width = RECAP_W;
  canvas.height = RECAP_H;
  const ctx = canvas.getContext("2d");

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, RECAP_H);
  bgGrad.addColorStop(0, "#070a12");
  bgGrad.addColorStop(0.5, "#05070d");
  bgGrad.addColorStop(1, "#080b14");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, RECAP_W, RECAP_H);
  recapDrawGlow(ctx, RECAP_W * 0.12, 40, 520, "rgba(76, 201, 240, 0.14)");
  recapDrawGlow(ctx, RECAP_W * 0.92, 0, 460, "rgba(157, 107, 255, 0.12)");

  // Header
  recapRoundedRect(ctx, 64, 60, 76, 76, 20);
  const badgeGrad = ctx.createLinearGradient(64, 60, 140, 136);
  badgeGrad.addColorStop(0, "#5865f2");
  badgeGrad.addColorStop(1, "#9d6bff");
  ctx.fillStyle = badgeGrad;
  ctx.fill();
  recapDrawPlaneLogo(ctx, 102, 98, 40, "#ffffff");

  ctx.textAlign = "left";
  ctx.fillStyle = "#f3f6fb";
  ctx.font = "800 46px -apple-system, sans-serif";
  ctx.fillText("Flight Log", 160, 112);

  ctx.fillStyle = "rgba(147, 161, 184, 0.85)";
  ctx.font = "600 26px -apple-system, sans-serif";
  try { ctx.letterSpacing = "3px"; } catch { /* not supported everywhere */ }
  ctx.fillText("MY FLYING RECAP · ALL-TIME", 64, 205);
  try { ctx.letterSpacing = "0px"; } catch { /* noop */ }

  // Map panel
  const mapRect = { x: 64, y: 250, w: RECAP_W - 128, h: 660 };
  recapRoundedRect(ctx, mapRect.x, mapRect.y, mapRect.w, mapRect.h, 20);
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  ctx.fill();
  recapDrawWorldLand(ctx, mapRect);
  recapDrawRoutes(ctx, flights, mapRect);
  recapDrawAirportPoints(ctx, airportsMap, mapRect);
  recapRoundedRect(ctx, mapRect.x, mapRect.y, mapRect.w, mapRect.h, 20);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Stat grid (2x2)
  const gridY = mapRect.y + mapRect.h + 40;
  const boxW = (mapRect.w - 20) / 2;
  const boxH = 190;
  const cyan = ["#4cc9f0", "#8fd9f5"];
  const violet = ["#5865f2", "#9d6bff"];
  recapDrawStatBox(ctx, mapRect.x, gridY, boxW, boxH, stats.totalFlights.toLocaleString(), "Flights", cyan);
  recapDrawStatBox(ctx, mapRect.x + boxW + 20, gridY, boxW, boxH, `${Math.round(stats.totalDistance).toLocaleString()} km`, "Distance Flown", violet);
  recapDrawStatBox(ctx, mapRect.x, gridY + boxH + 20, boxW, boxH, String(stats.countries), "Countries", violet);
  recapDrawStatBox(ctx, mapRect.x + boxW + 20, gridY + boxH + 20, boxW, boxH, String(stats.airports), "Airports", cyan);

  // Fun-fact strip
  const factY = gridY + (boxH + 20) * 2 + 20;
  const factH = 130;
  recapRoundedRect(ctx, mapRect.x, factY, mapRect.w, factH, 22);
  ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const factColW = mapRect.w / 2;
  ctx.textAlign = "center";
  ctx.font = "800 40px -apple-system, sans-serif";
  ctx.fillStyle = "#f3f6fb";
  ctx.fillText(`🌍 ${laps}`, mapRect.x + factColW * 0.5, factY + 58);
  ctx.font = "600 22px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(147, 161, 184, 0.9)";
  ctx.fillText("LAPS AROUND EARTH", mapRect.x + factColW * 0.5, factY + 96);

  ctx.font = "800 40px -apple-system, sans-serif";
  ctx.fillStyle = "#f3f6fb";
  ctx.fillText(`🌙 ${moonPct}%`, mapRect.x + factColW * 1.5, factY + 58);
  ctx.font = "600 22px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(147, 161, 184, 0.9)";
  ctx.fillText("OF THE WAY TO THE MOON", mapRect.x + factColW * 1.5, factY + 96);

  ctx.beginPath();
  ctx.moveTo(mapRect.x, factY + 30);
  ctx.lineTo(mapRect.x, factY + factH - 30);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.moveTo(mapRect.x + factColW, factY + 30);
  ctx.lineTo(mapRect.x + factColW, factY + factH - 30);
  ctx.stroke();

  // Flags
  const flagsY = factY + factH + 44;
  ctx.textAlign = "left";
  ctx.font = "700 24px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(147, 161, 184, 0.85)";
  ctx.fillText(`PLACES YOU'VE BEEN (${flagItems.length})`, mapRect.x, flagsY);

  ctx.font = "42px -apple-system, sans-serif";
  ctx.textAlign = "center";
  const maxFlags = 22;
  const shown = flagItems.slice(0, maxFlags);
  const perRow = 11;
  const cellW = mapRect.w / perRow;
  shown.forEach((c, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const fx = mapRect.x + cellW * col + cellW / 2;
    const fy = flagsY + 50 + row * 66;
    ctx.fillText(c.flag, fx, fy);
  });
  if (flagItems.length > maxFlags) {
    const row = Math.floor(shown.length / perRow);
    const col = shown.length % perRow;
    const fx = mapRect.x + cellW * col + cellW / 2;
    const fy = flagsY + 50 + row * 66;
    ctx.font = "600 24px -apple-system, sans-serif";
    ctx.fillStyle = "rgba(147, 161, 184, 0.9)";
    ctx.fillText(`+${flagItems.length - maxFlags}`, fx, fy - 8);
  }

  // Footer
  ctx.textAlign = "center";
  ctx.font = "600 22px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(94, 107, 131, 0.9)";
  ctx.fillText("Made with Flight Log", RECAP_W / 2, RECAP_H - 48);

  return canvas;
}

function openRecapModal() {
  const flights = getFlights();
  if (flights.length === 0) {
    alert("Log at least one flight before generating a recap.");
    return;
  }
  const canvas = buildRecapCanvas();
  const modal = document.getElementById("recap-modal");
  const img = document.getElementById("recap-modal-img");
  img.src = canvas.toDataURL("image/png");
  modal.classList.remove("hidden");
  modal.dataset.ready = "true";
}

function closeRecapModal() {
  document.getElementById("recap-modal").classList.add("hidden");
}

function downloadRecapImage() {
  const img = document.getElementById("recap-modal-img");
  if (!img.src) return;
  const a = document.createElement("a");
  a.href = img.src;
  a.download = `flight-log-recap-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
}

function setupRecapModal() {
  document.getElementById("export-recap-btn")?.addEventListener("click", openRecapModal);
  document.getElementById("recap-modal-close")?.addEventListener("click", closeRecapModal);
  document.getElementById("recap-modal-backdrop")?.addEventListener("click", closeRecapModal);
  document.getElementById("recap-download-btn")?.addEventListener("click", downloadRecapImage);
}

document.addEventListener("DOMContentLoaded", setupRecapModal);
