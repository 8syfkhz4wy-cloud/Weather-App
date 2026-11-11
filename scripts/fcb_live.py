#!/usr/bin/env python3
"""Push-Nachrichten bei Toren und Platzverweisen in Spielen des FC Basel.

Liest Spielstand und Telegramm aus dem SRF-Teletext (api.teletext.ch, frei abrufbar):
Seite 202 = aktuelle Runde mit Resultaten, 205–210 = Telegramme der Spiele.
Steht in den nächsten Stunden ein FCB-Spiel an, wartet das Skript bis kurz vor
Anpfiff und prüft dann bis zum Schlusspfiff alle 30 Sekunden. Meldungen gehen
über ntfy.sh an die Themen aus warnungen/orte.json.

    python3 scripts/fcb_live.py warnungen/orte.json
    python3 scripts/fcb_live.py warnungen/orte.json --test   # nur lesen und anzeigen
"""
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

API = "https://api.teletext.ch/channels/SRF1/pages/"
NTFY_URL = "https://ntfy.sh"
APP_URL = "https://8syfkhz4wy-cloud.github.io/Weather-App/"
TZ = ZoneInfo("Europe/Zurich")
DAYS = {"MO": 0, "DI": 1, "MI": 2, "DO": 3, "FR": 4, "SA": 5, "SO": 6}
TEAMS = {"GC": "Grasshoppers", "YB": "Young Boys", "St.Gallen": "St. Gallen", "Zürich": "FC Zürich",
         "Basel": "FC Basel", "Luzern": "FC Luzern", "Lugano": "FC Lugano", "Sion": "FC Sion", "Thun": "FC Thun",
         "Vaduz": "FC Vaduz", "Lausanne": "Lausanne-Sport", "Servette": "Servette FC", "Winterthur": "FC Winterthur"}
LOOKAHEAD = timedelta(hours=3, minutes=30)  # so lange vor Anpfiff darf der Lauf warten
MATCH = timedelta(minutes=130)              # Anpfiff bis sicher nach Schlusspfiff
POLL = 30


def now():
    return datetime.now(TZ)


def team(name):
    return TEAMS.get(name, name)


def page(n):
    req = urllib.request.Request(f"{API}{n}", headers={"User-Agent": "Mozilla/5.0 (Wetter-App)"})
    with urllib.request.urlopen(req, timeout=20) as res:
        data = json.load(res)
    return [(s.get("ep1Info") or {}).get("contentText") or "" for s in data.get("subpages") or []]


def stamp(text):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})", text)
    return datetime(2000 + int(m[3]), int(m[2]), int(m[1]), int(m[4]), int(m[5]), tzinfo=TZ) if m else now()


def kickoff_date(text, base, weekday, hh, mm):
    """Wochentag innerhalb der Spanne im Seitentitel "(20.-22.11.)", sonst der nächste passende Tag."""
    r = re.search(r"\((\d{1,2})\.(?:(\d{1,2})\.)?\s*-\s*(\d{1,2})\.(\d{1,2})\.\)", text)
    if r:
        month = int(r[2] or r[4])
        year = base.year + (1 if month < base.month - 6 else 0)
        d = datetime(year, month, int(r[1]), hh, mm, tzinfo=TZ)
        for _ in range(10):
            if d.weekday() == weekday:
                return d
            d += timedelta(days=1)
    d = base.replace(hour=hh, minute=mm, second=0, microsecond=0)
    return d + timedelta(days=(weekday - d.weekday()) % 7)


def fixture(texts):
    """Basel-Partie finden: angesetzt ("SO 16.30 Uhr") oder mit Resultat ("2:1 (1:0)")."""
    for text in texts:
        m = re.search(r"(?:^|\s)Basel\s+-\s+(\S+)\s+", text)
        home = True
        if not m:
            m = re.search(r"(?:^|\s)(\S+)\s+-\s+Basel\s+", text)
            home = False
        if not m:
            continue
        rest = text[m.end():]
        fx = {"home": "Basel" if home else m[1], "away": m[1] if home else "Basel", "basel_home": home,
              "kickoff": None, "score": None, "after": rest}
        sched = re.match(r"(SA|SO|MO|DI|MI|DO|FR)\s+(\d{1,2})\.(\d{2})\s+Uhr\s*", rest)
        score = re.match(r"(\d{1,2}):(\d{1,2})(?:\s*\(\d{1,2}:\d{1,2}\))?\s*", rest)
        if sched:
            fx["kickoff"] = kickoff_date(text, stamp(text), DAYS[sched[1]], int(sched[2]), int(sched[3]))
        elif score:
            fx["score"] = (int(score[1]), int(score[2]))
            fx["after"] = rest[score.end():]
        return fx
    return None


def telegram(fx):
    """Tore und Platzverweise aus dem Telegramm des Spiels (Seiten 205–210)."""
    goals, reds, score = [], [], None
    for n in range(205, 211):
        try:
            t = fixture(page(n))
        except Exception:
            continue
        if not t or t["home"] != fx["home"] or t["away"] != fx["away"]:
            continue
        body = t["after"]
        score = t["score"]
        part = re.search(r"Tore?:\s*(.*?)(?=\s(?:Bemerkungen|Bem\.|Verwarnungen|Gelb|Basel:|Zuschauer|SR\b)|$)", body, re.S)
        for g in re.finditer(r"(\d{1,3})\.(?:\s*\(\+\d+\))?\s*([^\d.][^.]*?)\s+(\d{1,2}):(\d{1,2})", part[1] if part else ""):
            goals.append({"min": int(g[1]), "who": " ".join(g[2].split()), "score": (int(g[3]), int(g[4]))})
        for c in re.finditer(r"(\d{1,3})\.\s*((?:Gelb-)?[Rr]ote?\s+Karte[^.]*|Platzverweis[^.]*|Gelb-Rot[^.]*)", body):
            reds.append({"min": int(c[1]), "who": " ".join(c[2].split())})
        break
    return goals, reds, score


def state():
    """Aktueller Stand: (Partie, Spielstand, Tore, Platzverweise)."""
    fx = fixture(page(202))
    if not fx:
        return None, None, [], []
    goals, reds, tscore = telegram(fx) if fx["score"] else ([], [], None)
    best = max([s for s in (fx["score"], tscore, goals[-1]["score"] if goals else None) if s], key=sum, default=None)
    return fx, best, goals, reds


def send(topics, title, message, tags, priority=4):
    for topic in topics:
        body = json.dumps({"topic": topic, "title": title, "message": message, "tags": tags,
                           "priority": priority, "click": APP_URL}).encode()
        req = urllib.request.Request(NTFY_URL, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                res.read()
        except Exception as err:
            print(f"Senden fehlgeschlagen ({topic[:8]}…): {err}")


def main(places_file, test=False):
    topics = [p["topic"] for p in json.load(open(places_file)) if p.get("topic")]
    fx, score, goals, reds = state()
    print("Partie:", fx and f"{fx['home']} - {fx['away']}", "| Anpfiff:", fx and fx["kickoff"], "| Stand:", score,
          "| Tore:", goals, "| Platzverweise:", reds)
    if test or not fx:
        return
    kickoff = fx["kickoff"]
    if kickoff:
        wait = kickoff - now()
        if wait > LOOKAHEAD or wait < -MATCH:
            print("Kein FCB-Spiel in den nächsten Stunden.")
            return
        time.sleep(max(0, wait.total_seconds() - 300))
        end = kickoff + MATCH
        score = (0, 0)  # Anpfiff: ab jetzt zählt jede Änderung
    else:
        # Spiel läuft schon (oder ist vorbei): nur weiterverfolgen, wenn die Seite frisch ist
        if now() - stamp(" ".join(page(202))) > timedelta(minutes=20):
            print("Kein laufendes FCB-Spiel.")
            return
        end = now() + MATCH
    names = f"{team(fx['home'])} – {team(fx['away'])}"
    mine = 0 if fx["basel_home"] else 1
    opponent = team(fx["away"] if fx["basel_home"] else fx["home"])
    seen_reds = len(reds)
    while now() < end:
        time.sleep(POLL)
        try:
            cur, new, goals, reds = state()
        except Exception as err:
            print("Abruf fehlgeschlagen:", err)
            continue
        if not cur or cur["home"] != fx["home"] or cur["away"] != fx["away"]:
            break  # Seite zeigt schon die nächste Runde
        if new and score and new != score:
            stand = f"{names} {new[0]}:{new[1]}"
            last = goals[-1] if goals and goals[-1]["score"] == new else None
            who = f" · {last['min']}. Minute: {last['who']}" if last else ""
            if new[mine] > score[mine]:
                send(topics, "⚽ TOR für Basel!", stand + who, ["soccer"])
            elif new[1 - mine] > score[1 - mine]:
                send(topics, f"Gegentor – {opponent} trifft", stand + who, ["soccer"])
            else:
                send(topics, "Tor aberkannt", f"Neuer Stand: {stand}", ["soccer"], 3)
            print(now(), "Stand:", new)
        if new:
            score = new
        if len(reds) > seen_reds:
            r = reds[-1]
            send(topics, "🟥 Platzverweis", f"{r['min']}. Minute: {r['who']} · {names}", ["red_square"])
            print(now(), "Platzverweis:", r)
        seen_reds = max(seen_reds, len(reds))
    if score and kickoff:
        send(topics, "Schlusspfiff", f"{names} {score[0]}:{score[1]}", ["checkered_flag"], 3)


if __name__ == "__main__":
    main(sys.argv[1], "--test" in sys.argv)
