# ✈️ Flight Log

A personal flight-tracking web app. Log every flight you've taken, watch your routes appear on an interactive 3D globe, and get automatically calculated travel statistics — total distance flown, countries visited, laps around the Earth, and more.

Built as a lightweight, framework-free personal project: a static frontend paired with a tiny local server for on-disk persistence. No account, no cloud, no tracking — your flight history stays on your machine.

## Features

- **Interactive 3D globe** — every logged flight is drawn as a glowing animated arc on a real satellite-imagery globe ([globe.gl](https://globe.gl/) / Three.js), with drag-to-rotate, scroll-to-zoom, and idle auto-rotation.
- **Airport deep-zoom view** — click any airport on the globe to open a flat 2D satellite map you can zoom all the way into, down to runways and terminals.
- **Fast flight entry** — autocomplete search across 6,000+ airports by IATA code, city, or name. Optionally auto-fill airline, flight number, and aircraft via a live flight lookup, or skip the API and enter everything by hand.
- **Flight log** — a browsable card list of every trip, complete with airline logos, route, and estimated flight duration.
- **Statistics dashboard** — total flights, total distance, estimated time in the air, airports and countries visited, plus a few fun comparisons (laps around the Earth, % of the way to the Moon).
- **Milestones** — lifetime achievement badges (countries visited, distance milestones, airports passed through) that unlock as your log grows.
- **Shareable recap card** — generate a downloadable PNG summary of your flying history: routes on a world map, headline stats, and visited-country flags.
- **Airline & airport breakdown** — see which airlines you fly most and which airports you pass through most often, visualized as bar charts.
- **Local-first storage** — all data lives in the browser via `localStorage`, mirrored to a JSON file on disk by a small local server. Export/import JSON backups anytime.

## Tech stack

- Vanilla HTML / CSS / JavaScript — no framework, no build step
- [globe.gl](https://globe.gl/) (Three.js) for the interactive 3D globe
- A dependency-free Node.js server (built-in `http` module only) for static file serving + local JSON persistence
- [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) via RapidAPI (optional, free tier) for flight lookup

## Credits

- Satellite imagery on the 3D globe: [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) (Esri, Maxar, Earthstar Geographics) — free, no API key required
- World land outline (recap card): [Natural Earth](https://www.naturalearthdata.com/) 110m cultural vectors (public domain)

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
│   ├── app.js           # Tabs, forms, list rendering, statistics, milestones
│   ├── map.js             # 3D globe (globe.gl) + route rendering
│   ├── airportDetail.js    # Per-airport 2D deep-zoom satellite map (Leaflet)
│   ├── recap.js            # Shareable recap PNG card generator
│   ├── storage.js         # localStorage + server sync, import/export
│   ├── flightApi.js       # AeroDataBox flight lookup
│   ├── airports.js        # ~6,000-airport reference dataset
│   ├── airlines.js        # ~980-airline reference dataset
│   ├── worldmap.js         # Simplified world land outline (for the recap card)
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
