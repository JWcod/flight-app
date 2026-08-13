// Flight lookup via AeroDataBox (RapidAPI). Requires the user's own
// free RapidAPI key, stored locally via storage.js settings.

const AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";

class FlightApiError extends Error {}

// period: "AM" (00:00-11:59) or "PM" (12:00-23:59) local airport time.
// AeroDataBox free tier limits the FIDS time window to 12 hours.
async function searchFlights({ apiKey, depIata, arrIata, date, period }) {
  if (!apiKey) {
    throw new FlightApiError("No API key set yet — enter your RapidAPI key on the Settings tab.");
  }

  const [fromLocal, toLocal] =
    period === "PM" ? [`${date}T12:00`, `${date}T23:59`] : [`${date}T00:00`, `${date}T11:59`];

  const url =
    `https://${AERODATABOX_HOST}/flights/airports/iata/${encodeURIComponent(depIata)}/` +
    `${fromLocal}/${toLocal}` +
    `?direction=Departure&withLeg=true&withCancelled=false&withCodeshared=true&withCargo=false&withPrivate=false&withLocation=false`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": AERODATABOX_HOST,
      },
    });
  } catch (e) {
    throw new FlightApiError("Couldn't reach the flight lookup service — check your internet connection.");
  }

  if (res.status === 401 || res.status === 403) {
    throw new FlightApiError("API key invalid or unauthorized — check your key on the Settings tab.");
  }
  if (res.status === 429) {
    throw new FlightApiError("API quota reached for this month — try again later or use Manual Entry.");
  }
  if (!res.ok) {
    throw new FlightApiError(`Lookup failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  const departures = Array.isArray(data.departures) ? data.departures : [];

  return departures
    .filter((f) => f.arrival?.airport?.iata?.toUpperCase() === arrIata.toUpperCase())
    .map((f) => ({
      flightNumber: (f.number || "").replace(/\s+/g, ""),
      airlineName: f.airline?.name || null,
      airlineIata: f.airline?.iata || null,
      depTimeLocal: f.departure?.scheduledTime?.local || null,
      arrTimeLocal: f.arrival?.scheduledTime?.local || null,
      aircraftModel: f.aircraft?.model || null,
      status: f.status || null,
    }));
}
