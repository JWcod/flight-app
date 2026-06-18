import csv
import json

# --- Airports ---
airports = {}
with open("airports.dat", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        if len(row) < 14:
            continue
        name, city, country, iata, icao = row[1], row[2], row[3], row[4], row[5]
        try:
            lat = float(row[6])
            lon = float(row[7])
        except ValueError:
            continue
        airport_type = row[12]
        if iata == "\\N" or len(iata) != 3:
            continue
        if airport_type != "airport":
            continue
        # Keep first occurrence (avoid dup IATA overwrite with worse data)
        if iata in airports:
            continue
        airports[iata] = {
            "name": name,
            "city": city,
            "country": country,
            "icao": None if icao == "\\N" else icao,
            "lat": round(lat, 4),
            "lon": round(lon, 4),
        }

print(f"Airports: {len(airports)}")

# --- Airlines ---
airlines = {}
with open("airlines.dat", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        if len(row) < 8:
            continue
        name, iata, icao, country, active = row[1], row[3], row[4], row[6], row[7]
        if iata == "\\N" or len(iata) != 2 or not iata.strip():
            continue
        if active != "Y":
            continue
        if iata in airlines:
            continue
        airlines[iata] = {
            "name": name,
            "icao": None if icao == "\\N" else icao,
            "country": country,
        }

print(f"Airlines: {len(airlines)}")

with open("../js/airports.js", "w", encoding="utf-8") as f:
    f.write("// Auto-generated from OpenFlights data. IATA code -> airport info.\n")
    f.write("const AIRPORTS = " + json.dumps(airports, ensure_ascii=False, separators=(",", ":")) + ";\n")

with open("../js/airlines.js", "w", encoding="utf-8") as f:
    f.write("// Auto-generated from OpenFlights data. IATA code -> airline info.\n")
    f.write("const AIRLINES = " + json.dumps(airlines, ensure_ascii=False, separators=(",", ":")) + ";\n")
