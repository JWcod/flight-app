// Airport detail modal: a genuine 2D slippy map (Leaflet + Esri World
// Imagery) for a single airport, opened when a point is clicked on the
// 3D globe. Unlike the globe's tile-draped sphere — which is capped at a
// fairly low tile zoom level by a known globe.gl limitation — a flat
// Leaflet map has no such cap, so this is where "zoom all the way in and
// see the airport" actually happens.

const ESRI_WORLD_IMAGERY_XYZ_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

let _airportDetailMap = null;

function openAirportDetail(apt) {
  if (!apt?.lat || !apt?.lon) return;

  document.getElementById("airport-modal-iata").textContent = apt.iata || "";
  document.getElementById("airport-modal-name").textContent = [apt.name, apt.city].filter(Boolean).join(" · ");

  const modal = document.getElementById("airport-modal");
  modal.classList.remove("hidden");

  requestAnimationFrame(() => {
    if (_airportDetailMap) {
      _airportDetailMap.remove();
      _airportDetailMap = null;
    }

    _airportDetailMap = L.map("airport-detail-map", {
      attributionControl: false,
    }).setView([apt.lat, apt.lon], 16);

    L.tileLayer(ESRI_WORLD_IMAGERY_XYZ_URL, {
      maxZoom: 19,
      maxNativeZoom: 19,
    }).addTo(_airportDetailMap);

    L.circleMarker([apt.lat, apt.lon], {
      radius: 9,
      color: "#4cc9f0",
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 0.9,
    }).addTo(_airportDetailMap);

    setTimeout(() => _airportDetailMap && _airportDetailMap.invalidateSize(), 60);
  });
}

function closeAirportDetail() {
  document.getElementById("airport-modal").classList.add("hidden");
  if (_airportDetailMap) {
    _airportDetailMap.remove();
    _airportDetailMap = null;
  }
}

function setupAirportDetailModal() {
  document.getElementById("airport-modal-close")?.addEventListener("click", closeAirportDetail);
  document.getElementById("airport-modal-backdrop")?.addEventListener("click", closeAirportDetail);
}

document.addEventListener("DOMContentLoaded", setupAirportDetailModal);
