#!/usr/bin/env python3
"""Schickt nach einer Veröffentlichung eine Push-Nachricht über ntfy.sh
an alle Orte in warnungen/orte.json.

Titel ist die erste Zeile der Commit-Nachricht. Als Text dient eine Zeile
"Info: ..." aus der Commit-Nachricht, falls vorhanden.

    python3 scripts/update_nachricht.py warnungen/orte.json "<commit-nachricht>"
"""
import json
import sys
import urllib.request

NTFY_URL = "https://ntfy.sh"
APP_URL = "https://8syfkhz4wy-cloud.github.io/Weather-App/"
HINWEIS = "Zum Laden die App ganz schließen und neu öffnen."


def main(places_file, commit_message):
    lines = [l.strip() for l in commit_message.strip().splitlines()]
    title = lines[0] if lines else "Neue Version"
    info = next((l[5:].strip() for l in lines if l.lower().startswith("info:")), "")
    message = f"{info}\n\n{HINWEIS}" if info else HINWEIS

    with open(places_file, encoding="utf-8") as f:
        topics = {ort["topic"] for ort in json.load(f)["orte"]}

    for topic in sorted(topics):
        body = json.dumps({
            "topic": topic,
            "title": f"✨ Update: {title}",
            "message": message,
            "tags": ["sparkles"],
            "priority": 3,
            "click": APP_URL,
        }).encode()
        req = urllib.request.Request(NTFY_URL, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as res:
            res.read()
        print(f"Update-Nachricht an {topic} gesendet")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
