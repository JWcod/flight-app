# ✈️ My Flight Log

A personal flight-tracking web app. Log every flight you've taken, watch your routes appear on an interactive world map, and get automatically calculated travel statistics — total distance flown, countries visited, laps around the Earth, and more.

Built as a lightweight, framework-free personal project: a static frontend paired with a tiny local server for on-disk persistence. No account, no cloud, no tracking — your flight history stays on your machine.

## Features

- **Interactive route map** — every logged flight is drawn as a route on a [Leaflet](https://leafletjs.com/)-powered world map, with a running collection of visited-country flags.
- **Fast flight entry** — autocomplete search across 6,000+ airports by IATA code, city, or name. Optionally auto-fill airline, flight number, and aircraft via a live flight lookup, or skip the API and enter everything by hand.
- **Flight log** — a browsable card list of every trip, complete with airline logos, route, and estimated flight duration.
- **Statistics dashboard** — total flights, total distance, estimated time in the air, airports and countries visited, plus a few fun comparisons (laps around the Earth, % of the way to the Moon).
- **Airline & airport breakdown** — see which airlines you fly most and which airports you pass through most often, visualized as bar charts.
- **Local-first storage** — all data lives in the browser via `localStorage`, mirrored to a JSON file on disk by a small local server. Export/import JSON backups anytime.

## Tech stack

- Vanilla HTML / CSS / JavaScript — no framework, no build step
- [Leaflet.js](https://leafletjs.com/) for the map
- A dependency-free Node.js server (built-in `http` module only) for static file serving + local JSON persistence
- [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) via RapidAPI (optional, free tier) for flight lookup

## Getting started

```bash
git clone https://github.com/JWcod/flight-app.git
cd flight-app
node server.js
```

This starts a local server at `http://localhost:8765` and opens it in your default browser. On macOS, double-clicking `launch.command` does the same thing without touching the terminal.

No API key is required — toggle "manual entry" to log flights without looking anything up. To enable automatic flight search, grab a free [RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) key and paste it into the Settings tab.

## Project structure

```
.
├── index.html         # App shell — map / add / list / stats / settings tabs
├── server.js          # Local server: static files + JSON persistence API
├── launch.command      # Double-click launcher (macOS)
├── css/
│   └── style.css
├── js/
│   ├── app.js           # Tabs, forms, list rendering, statistics
│   ├── map.js             # Leaflet map + route rendering
│   ├── storage.js         # localStorage + server sync, import/export
│   ├── flightApi.js       # AeroDataBox flight lookup
│   ├── airports.js        # ~6,000-airport reference dataset
│   ├── airlines.js        # ~980-airline reference dataset
│   └── geo.js              # Great-circle distance calculations
└── data/
    └── flights.json     # Your personal flight log (gitignored — never leaves this machine)
```

## Roadmap

- [ ] One-click import from other flight trackers
- [ ] Shareable, read-only trip pages
- [ ] Native mobile wrapper

## Privacy

Personal flight history (`data/flights.json`) and any imported trip data (`flighty-import.json`) are excluded from version control by design. This repository ships with the application and its reference datasets only — never anyone's actual flight records.
