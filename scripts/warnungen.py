#!/usr/bin/env python3
"""Prüft die Wettervorhersage für die Orte in warnungen/orte.json und
schickt bei Unwetter eine Push-Nachricht über ntfy.sh.

Wird stündlich von .github/workflows/warnungen.yml ausgeführt.

    python3 scripts/warnungen.py warnungen/orte.json status.json
    python3 scripts/warnungen.py warnungen/orte.json status.json --test

Bereits verschickte Warnungen merkt sich das Skript in status.json, damit
dieselbe Warnung nicht jede Stunde erneut kommt. Wird eine Warnung
schlimmer (z. B. Sturm -> Orkan), kommt eine neue Nachricht.
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
NTFY_URL = "https://ntfy.sh"
APP_URL = "https://8syfkhz4wy-cloud.github.io/Weather-App/"
HOURS_AHEAD = 24
WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def fetch_forecast(place):
    params = urllib.parse.urlencode({
        "latitude": place["lat"],
        "longitude": place["lon"],
        "timezone": "auto",
        "forecast_days": 3,
        "current": "temperature_2m",
        "hourly": "temperature_2m,weather_code,wind_gusts_10m,snowfall,rain,showers",
    })
    with urllib.request.urlopen(f"{FORECAST_URL}?{params}", timeout=30) as res:
        return json.load(res)


def classify(value, levels):
    """Gibt (Stufe, Bezeichnung) der höchsten erreichten Schwelle zurück."""
    found = None
    for level, (threshold, label) in enumerate(levels, start=1):
        if value >= threshold:
            found = (level, label)
    return found


# Schwellen: (Wert, Bezeichnung), aufsteigend nach Schwere
WIND_LEVELS = [(60, "Starke Windböen"), (75, "Sturmböen"), (90, "Schwere Sturmböen"),
               (105, "Orkanartige Böen"), (120, "Orkanböen")]
HEAT_LEVELS = [(30, "Hitze"), (35, "Starke Hitze")]
COLD_LEVELS = [(10, "Strenger Frost"), (15, "Sehr strenger Frost")]  # Grad unter null
SNOW_LEVELS = [(3, "Schneefall"), (10, "Starker Schneefall"), (25, "Extrem starker Schneefall")]


def find_warnings(forecast):
    h = forecast["hourly"]
    now = forecast["current"]["time"][:13]
    start = next((i for i, t in enumerate(h["time"]) if t[:13] >= now), 0)
    hours = range(start, min(start + HOURS_AHEAD, len(h["time"])))

    def first(pred):
        return next((h["time"][i] for i in hours if pred(i)), None)

    warnings = []

    def add(kind, level_label, when, text, tags, priority):
        if level_label and when:
            level, label = level_label
            warnings.append({"kind": kind, "level": level, "label": label, "when": when,
                             "text": text, "tags": tags, "priority": priority + level - 1})

    # Gewitter / Unwetter
    storm_codes = [h["weather_code"][i] for i in hours if h["weather_code"][i] >= 95]
    if storm_codes:
        hail = any(c in (96, 99) for c in storm_codes)
        add("gewitter", (2 if hail else 1, "Gewitter mit Hagel" if hail else "Gewitter"),
            first(lambda i: h["weather_code"][i] >= 95),
            "Gewitter mit Hagel möglich." if hail else "Gewitter mit Blitz, Starkregen und Böen möglich.",
            ["zap"], 4)

    # Wind & Sturm
    gust = max(h["wind_gusts_10m"][i] or 0 for i in hours)
    lvl = classify(gust, WIND_LEVELS)
    add("wind", lvl, lvl and first(lambda i: (h["wind_gusts_10m"][i] or 0) >= WIND_LEVELS[0][0]),
        f"Böen bis {round(gust)} km/h erwartet.", ["dash"], 3)

    # Hitze
    tmax = max(h["temperature_2m"][i] for i in hours)
    lvl = classify(tmax, HEAT_LEVELS)
    add("hitze", lvl, lvl and first(lambda i: h["temperature_2m"][i] >= HEAT_LEVELS[0][0]),
        f"Bis {round(tmax)} °C. Viel trinken und die Mittagssonne meiden.", ["hot_face"], 3)

    # Kälte
    tmin = min(h["temperature_2m"][i] for i in hours)
    lvl = classify(-tmin, COLD_LEVELS)
    add("kaelte", lvl, lvl and first(lambda i: h["temperature_2m"][i] <= -COLD_LEVELS[0][0]),
        f"Bis {round(tmin)} °C. Warm anziehen, Wasserleitungen und Pflanzen schützen.", ["cold_face"], 3)

    # Schnee (Summe der nächsten 24 Stunden in cm)
    snow = sum(h["snowfall"][i] or 0 for i in hours)
    lvl = classify(snow, SNOW_LEVELS)
    add("schnee", lvl, lvl and first(lambda i: (h["snowfall"][i] or 0) > 0),
        f"Etwa {round(snow)} cm Neuschnee in den nächsten 24 Stunden.", ["snowflake"], 3)

    # Glätte / Eis: gefrierender Regen oder Regen bei Temperaturen um den Gefrierpunkt
    freezing = first(lambda i: h["weather_code"][i] in (56, 57, 66, 67))
    if freezing:
        add("eis", (2, "Glatteis"), freezing,
            "Gefrierender Regen – Straßen und Gehwege können spiegelglatt werden.", ["ice_cube"], 4)
    else:
        icy = first(lambda i: h["temperature_2m"][i] <= 1
                    and ((h["rain"][i] or 0) + (h["showers"][i] or 0) > 0 or (h["snowfall"][i] or 0) > 0))
        add("eis", (1, "Glättegefahr"), icy,
            "Nässe oder Schnee bei Temperaturen um den Gefrierpunkt – Vorsicht auf Straßen und Wegen.",
            ["ice_cube"], 3)

    return warnings


def when_text(iso):
    dt = datetime.fromisoformat(iso)
    return f"{WEEKDAYS[dt.weekday()]} {dt:%d.%m.} ab {dt:%H} Uhr"


def send(topic, title, message, tags, priority):
    body = json.dumps({
        "topic": topic,
        "title": title,
        "message": message,
        "tags": ["warning"] + tags,
        "priority": min(priority, 5),
        "click": APP_URL,
    }).encode()
    req = urllib.request.Request(NTFY_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as res:
        res.read()


def main(places_file, state_file, test=False):
    with open(places_file, encoding="utf-8") as f:
        places = json.load(f)["orte"]
    try:
        with open(state_file, encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}

    if test:
        for place in places:
            send(place["topic"], f"✅ Testnachricht für {place['name']}",
                 "Die Wetterwarnungen sind eingerichtet. Du bekommst hier eine Nachricht, "
                 "sobald Sturm, Hitze, Kälte, Wind, Schnee oder Glätte erwartet werden.", ["white_check_mark"], 3)
            print(f"Test an {place['name']} gesendet")
        places = []

    failed = False
    for place in places:
        try:
            warnings = find_warnings(fetch_forecast(place))
        except Exception as err:  # ein Ort darf die anderen nicht blockieren
            print(f"{place['name']}: Vorhersage nicht abrufbar ({err})")
            failed = True
            continue
        for w in warnings:
            # Gleiche Warnung am gleichen Tag nur einmal, außer sie wird schlimmer
            key = f"{place['topic']}|{w['kind']}|{w['when'][:10]}"
            if state.get(key, {}).get("level", 0) >= w["level"]:
                continue
            title = f"⚠️ {w['label']} – {place['name']}"
            send(place["topic"], title, f"{when_text(w['when'])}: {w['text']}", w["tags"], w["priority"])
            state[key] = {"level": w["level"], "sent": datetime.now().isoformat(timespec="minutes")}
            print(f"Gesendet: {title}")
        if not warnings:
            print(f"{place['name']}: keine Warnungen")

    # Einträge älter als 4 Tage entfernen
    cutoff = (datetime.now() - timedelta(days=4)).isoformat()
    state = {k: v for k, v in state.items() if v["sent"] >= cutoff}
    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], test="--test" in sys.argv)
