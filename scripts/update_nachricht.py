#!/usr/bin/env python3
"""Schickt nach einer Veröffentlichung eine Push-Nachricht über ntfy.sh
an alle Orte in warnungen/orte.json.

Titel ist die erste Zeile der Commit-Nachricht. Als Text dient eine Zeile
"Info: ..." aus der Commit-Nachricht, falls vorhanden.

    python3 scripts/update_nachricht.py warnungen/orte.json "<commit-nachricht>"
    python3 scripts/update_nachricht.py warnungen/orte.json "<titel>\nInfo: <text>" --gta   # Release im GTA-Stil
"""
import json
import sys
import urllib.request

NTFY_URL = "https://ntfy.sh"
APP_URL = "https://8syfkhz4wy-cloud.github.io/Weather-App/"
HINWEIS = "Zum Laden die App ganz schließen und neu öffnen."


def main(places_file, commit_message, gta=False):
    lines = [line.strip() for line in commit_message.strip().splitlines()]
    title = lines[0] if lines else "Neue Version"
    info = next((line[5:].strip() for line in lines if line.lower().startswith("info:")), "")
    message = f"{info}\n\n{HINWEIS}" if info else HINWEIS
    if gta:  # Neue Version wie eine erfüllte Mission im Spiel
        info = "\n".join(line[5:].strip() if line.lower().startswith("info:") else line
                         for line in lines[1:] if line).strip()
        message = f"{info}\n\nApp ganz schliessen und neu öffnen – und ab auf die Strasse. 🌴"

    with open(places_file, encoding="utf-8") as f:
        topics = {ort["topic"] for ort in json.load(f)["orte"]}

    for topic in sorted(topics):
        body = json.dumps({
            "topic": topic,
            "title": title if gta else f"✨ Update: {title}",
            "message": message,
            "tags": ["star", "palm_tree"] if gta else ["sparkles"],
            "priority": 4 if gta else 3,
            "click": APP_URL,
        }).encode()
        req = urllib.request.Request(NTFY_URL, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as res:
            res.read()
        print(f"Update-Nachricht an {topic} gesendet")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], "--gta" in sys.argv)
