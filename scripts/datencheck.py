#!/usr/bin/env python3
"""Prüft, ob alle Datenquellen der App erreichbar sind und jeden angefragten
Wert vollständig und plausibel liefern. Ausgabe als Bericht im Log.

Wird manuell über .github/workflows/datencheck.yml gestartet.

    python3 scripts/datencheck.py [lat lon]
"""
import json
import re
import sys
import urllib.parse
import urllib.request

LAT, LON = (float(sys.argv[1]), float(sys.argv[2])) if len(sys.argv) > 2 else (47.5596, 7.5886)
problems = []


def get(url, params=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "wetter-psalm-datencheck"})
    with urllib.request.urlopen(req, timeout=30) as res:
        body = res.read()
        return res.status, res.headers.get("Content-Type", ""), body


def params_from_app(name):
    """Liest die Parameterlisten direkt aus app.js, damit der Test genau die App prüft."""
    src = open("app.js", encoding="utf-8").read()
    block = re.search(rf"async function {name}\(place\) \{{(.*?)\n\}}", src, re.S).group(1)
    out = {}
    for key, body in re.findall(r"(\w+): \[(.*?)\]\.join", block, re.S):
        out[key] = re.findall(r'"(\w+)"', body)
    for key, val in re.findall(r'(\w+): "([\w,]+)"', block):
        out[key] = val.split(",")
    out.pop("timezone", None)
    if "...Object.keys(POLLEN)" in block:
        pollen = re.search(r"const POLLEN = \{(.*?)\};", src, re.S).group(1)
        out["current"] = out.get("current", []) + re.findall(r"(\w+_pollen):", pollen)
    return out


def check_section(label, data, section, fields, ranges):
    sec = data.get(section)
    if sec is None:
        problems.append(f"{label}: Abschnitt '{section}' fehlt")
        return
    units = data.get(f"{section}_units", {})
    for f in fields:
        if f not in sec:
            problems.append(f"{label}: {section}.{f} fehlt")
            continue
        vals = sec[f] if isinstance(sec[f], list) else [sec[f]]
        nulls = sum(v is None for v in vals)
        nums = [v for v in vals if isinstance(v, (int, float))]
        lo, hi = (min(nums), max(nums)) if nums else (None, None)
        note = ""
        if f in ranges and nums:
            a, b = ranges[f]
            if lo < a or hi > b:
                note = f"  <-- AUSSERHALB {a}..{b}"
                problems.append(f"{label}: {section}.{f} außerhalb {a}..{b} ({lo}..{hi})")
        if nulls == len(vals) and not f.endswith("_pollen"):
            note += "  <-- NUR LEER"
            problems.append(f"{label}: {section}.{f} liefert nur leere Werte")
        elif nulls:
            note += f"  ({nulls}/{len(vals)} leer)"
        shown = vals[0] if len(vals) == 1 else f"{lo} .. {hi} ({len(vals)} Werte)"
        print(f"  {section}.{f:32} {str(shown):30} [{units.get(f, '')}]{note}")


RANGES = {
    "temperature_2m": (-60, 55), "apparent_temperature": (-70, 65), "dew_point_2m": (-70, 35),
    "relative_humidity_2m": (0, 100), "cloud_cover": (0, 100), "is_day": (0, 1),
    "weather_code": (0, 99), "wind_speed_10m": (0, 250), "wind_gusts_10m": (0, 300),
    "wind_direction_10m": (0, 360), "pressure_msl": (900, 1090), "precipitation": (0, 300),
    "precipitation_probability": (0, 100), "precipitation_probability_max": (0, 100),
    "snowfall": (0, 100), "rain": (0, 300), "showers": (0, 300), "visibility": (0, 100000),
    "uv_index": (0, 16), "uv_index_max": (0, 16), "temperature_2m_max": (-60, 55),
    "temperature_2m_min": (-60, 55), "precipitation_sum": (0, 500), "wind_gusts_10m_max": (0, 300),
    "daylight_duration": (0, 86400), "european_aqi": (0, 500), "pm2_5": (0, 1000), "pm10": (0, 2000),
    "ozone": (0, 1000), "nitrogen_dioxide": (0, 1000),
}


def main():
    print(f"Datencheck für {LAT}, {LON}\n")

    # Wetter
    p = params_from_app("fetchWeather")
    query = {"latitude": LAT, "longitude": LON, "timezone": "auto", "forecast_days": 7, **{k: ",".join(v) for k, v in p.items()}}
    try:
        _, _, body = get("https://api.open-meteo.com/v1/forecast", query)
        w = json.loads(body)
        print(f"Open-Meteo Wetter: Zeitzone {w.get('timezone')} (UTC{w.get('utc_offset_seconds', 0) / 3600:+.0f}), "
              f"Modellhöhe {w.get('elevation')} m, current.time {w['current']['time']}")
        for sec, fields in p.items():
            check_section("Wetter", w, sec, fields, RANGES)
        m = w.get("minutely_15", {})
        if m.get("time"):
            print(f"  minutely_15 von {m['time'][0]} bis {m['time'][-1]}")
    except Exception as err:
        problems.append(f"Wetter-API: {err}")
        print(f"Wetter-API FEHLER: {err}")

    # Luft & Pollen
    p = params_from_app("fetchAir")
    query = {"latitude": LAT, "longitude": LON, "timezone": "auto", **{k: ",".join(v) for k, v in p.items()}}
    try:
        _, _, body = get("https://air-quality-api.open-meteo.com/v1/air-quality", query)
        a = json.loads(body)
        print(f"\nOpen-Meteo Luft: current.time {a['current']['time']}")
        for sec, fields in p.items():
            check_section("Luft", a, sec, fields, RANGES)
    except Exception as err:
        problems.append(f"Luft-API: {err}")
        print(f"Luft-API FEHLER: {err}")

    # Ortssuche & Ortsname
    try:
        _, _, body = get("https://geocoding-api.open-meteo.com/v1/search", {"name": "Basel", "count": 3, "language": "de"})
        r = json.loads(body).get("results", [])
        print(f"\nOrtssuche 'Basel': {[(x['name'], x.get('admin1'), x.get('country')) for x in r]}")
    except Exception as err:
        problems.append(f"Ortssuche: {err}")
    try:
        _, _, body = get("https://api.bigdatacloud.net/data/reverse-geocode-client",
                         {"latitude": LAT, "longitude": LON, "localityLanguage": "de"})
        r = json.loads(body)
        print(f"Ortsname: city={r.get('city')!r} locality={r.get('locality')!r}")
    except Exception as err:
        problems.append(f"Ortsname: {err}")

    # Radar
    try:
        _, _, body = get("https://api.rainviewer.com/public/weather-maps.json")
        r = json.loads(body)
        past = r.get("radar", {}).get("past", [])
        now = r.get("radar", {}).get("nowcast", [])
        print(f"\nRainViewer: host={r.get('host')} past={len(past)} nowcast={len(now)}")
        if past:
            for z in (5, 7, 8):
                # Kachel, in der Basel liegt
                import math
                n = 2 ** z
                x = int((LON + 180) / 360 * n)
                y = int((1 - math.log(math.tan(math.radians(LAT)) + 1 / math.cos(math.radians(LAT))) / math.pi) / 2 * n)
                url = f"{r['host']}{past[-1]['path']}/256/{z}/{x}/{y}/2/1_1.png"
                try:
                    status, ctype, data = get(url)
                    print(f"  Kachel z{z}: HTTP {status} {ctype} {len(data)} Bytes")
                except Exception as err:
                    print(f"  Kachel z{z}: FEHLER {err}")
                    if z <= 7:
                        problems.append(f"Radar-Kachel z{z}: {err}")
        else:
            problems.append("RainViewer liefert keine Radarbilder")
    except Exception as err:
        problems.append(f"RainViewer: {err}")

    print("\n==== ERGEBNIS ====")
    if problems:
        for pr in problems:
            print(f"PROBLEM: {pr}")
        sys.exit(1)
    print("Alle Datenquellen und Werte in Ordnung.")


if __name__ == "__main__":
    main()
