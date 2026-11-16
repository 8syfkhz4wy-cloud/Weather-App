#!/usr/bin/env python3
"""Frische Sprüche für den Chat mit Dani «Joggeli» Meier, geschrieben von einem Sprachmodell.

Läuft im GitHub-Actions-Ablauf über GitHub Models (kostenlos, angemeldet mit dem
GITHUB_TOKEN des Laufs, Berechtigung "models: read"). Die App selbst ruft kein Modell
auf: Sie lädt nur die fertige Datei dani.json und mischt die Sprüche unter die festen.

Aufruf: dani_ki.py fcb.json dani.json
Ohne Token oder bei einem Fehler endet das Skript mit Code 1; der Chat läuft dann mit
den festen Antworten aus dani-chat.js weiter.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

API = os.environ.get("DANI_API", "https://models.github.ai")
# Der Reihe nach probieren; mit DANI_MODELS (Komma-getrennt) überschreibbar
MODELS = [m.strip() for m in os.environ.get(
    "DANI_MODELS", "openai/gpt-4.1,openai/gpt-4o,openai/gpt-4.1-mini,openai/gpt-4o-mini").split(",") if m.strip()]

# Schlüssel wie in dani-chat.js (drittes Feld der Regeln) → worum es geht
THEMEN = {
    "gruss": "Jemand sagt Hallo",
    "befinden": "Jemand fragt, wie es Dani geht",
    "zuerich": "FC Zürich und die Stadt Zürich (Erzrivale, Frotzelei über Stadt und Klub)",
    "gc": "Grasshoppers Zürich",
    "yb": "Young Boys Bern",
    "stgallen": "FC St. Gallen",
    "andere": "übrige Klubs der Super League (Luzern, Servette, Lausanne, Lugano, Sion, Winterthur, Thun)",
    "europa": "Europacup-Nächte im St. Jakob-Park",
    "joggeli": "das Stadion St. Jakob-Park, genannt Joggeli",
    "kurve": "die Muttenzerkurve, Choreos, Fahnen, Gesang",
    "schiri": "Schiedsrichter-Entscheide und VAR allgemein (ohne Namen)",
    "trainer": "Taktik und Trainerdiskussionen allgemein (ohne Namen)",
    "bier": "Bier vor, während und nach dem Match",
    "essen": "Wurst im Stadion und Basler Küche",
    "fasnacht": "Basler Fasnacht",
    "basel": "die Stadt Basel und der Rhein",
    "witz": "ein kurzer Witz über einen anderen Schweizer Klub oder dessen Stadt",
    "hopp": "Jemand feuert den FCB an",
    "danke": "Jemand bedankt sich",
    "tschuess": "Jemand verabschiedet sich",
    "fallback": "Dani hat die Frage nicht verstanden und sagt, man solle ihn nach Spiel, Tabelle, News, Kader oder Wetter fragen",
}

BEISPIELE = [
    "Gopferdammi nomol, losed zue – hüt git s Klartext us dr Kurve, ohni Wattebäuschli!",
    "Ych ha hüt scho drei Kaffi und e Gipfeli gha – und ych bi IMMER NO uf hundertachtzig!",
    "Unentschiede … ych bi so hässig, dass ych hüt nyt meh iss – usser e Wurscht. Oder zwai.",
    "Wenn s Joggeli bebt, zitter ych am ganze Lyb. Das verstoht kai Mensch, wo nit dört gstande isch!",
    "Rägejagge aa – e Schirm in dr Kurve isch öbbis für Zürcher!",
    "Rotblau bis in d Chnoche – und wär s nit kapiert, cha mir dr Buggel abeschlyffe!",
]

SYSTEM = """Du schreibst Chat-Antworten für eine erfundene Figur in einer privaten Fan-App:
Dani «Joggeli» Meier, fiktiver Ultra des FC Basel, seit 1998 in der Muttenzerkurve.

Sprache: Baseldeutsch (Baseldytsch), geschrieben wie in den Beispielen: «ych» statt «ich»,
«isch», «nit», «kai», «hüt», «gopferdammi», «hösch», «Bebbi». Kein Hochdeutsch, kein Zürichdeutsch.
Ton: laut, emotional, derb, selbstironisch, herzlich. Kurze Sätze, ab und zu GROSSBUCHSTABEN.

Feste Regeln:
- Keine Gewalt, keine Drohungen, keine Aufrufe zu Schlägereien, Pyro oder Sachbeschädigung.
- Keine Beleidigung echter, namentlich genannter Personen. Geflucht wird über Situationen.
  Über andere Klubs und Städte wird gefrotzelt, harmlos und ohne Hass.
- Nichts Sexistisches, Rassistisches, nichts über Herkunft, Religion oder Sexualität.
- Keine erfundenen Tatsachen: keine Resultate, Transfers, Verletzungen oder Zitate, die nicht
  in den Schlagzeilen stehen. Zu Schlagzeilen gibt es nur Gefühl und Meinung.
- Keine Liedtexte, keine Links, keine Hashtags.
- Jede Antwort ist 1 bis 3 Sätze lang, höchstens 240 Zeichen, und steht für sich allein.

Antworte nur mit JSON."""

GEWALT = re.compile(r"schläg|schleg|prüge?l|brüge?l|verhau|krawall|ausschreit|randal|polizei|festnahme|abstech|umbring|töt|waffe|messer|bombe|anzünd|aazünd|"
                    r"pyro|fackle|petard|hooligan|uf d schnure|in d frässe|bluet söll", re.I)
STOPP = {"basel", "basler", "rotblau", "spiel", "match", "tabelle", "news", "wetter", "kader", "trainer", "sieg",
         "niederlage", "transfer", "wechsel", "super", "league", "saison", "runde", "punkt", "punkte", "tore",
         "stadion", "joggeli", "kurve", "fans", "zürich", "bern", "heute", "morgen", "gegen", "nach", "über"}


def post(path, body, token):
    req = urllib.request.Request(
        API + path, data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "Accept": "application/vnd.github+json", "User-Agent": "wetter-psalm-app"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def catalog(token):
    """Notnagel, falls keins der bekannten Modelle (mehr) angeboten wird."""
    req = urllib.request.Request(API + "/catalog/models", headers={
        "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "User-Agent": "wetter-psalm-app"})
    with urllib.request.urlopen(req, timeout=30) as res:
        ids = [m.get("id", "") for m in json.load(res)]
    return [i for i in ids if i.startswith("openai/gpt") and "embedding" not in i][:3]


def prompt(fcb):
    titles = lambda key, n: [it["title"] for it in (fcb.get(key) or [])[:n] if not GEWALT.search(it["title"])]
    lines = ["Beispiele für Danis Ton:"] + [f"- {b}" for b in BEISPIELE]
    lines += ["", f"Heute ist der {datetime.now(timezone.utc):%d.%m.%Y}.", "", "Aktuelle Schlagzeilen zum FC Basel:"]
    news = titles("news", 5) + titles("rumors", 2)
    lines += [f"{i + 1}. {t}" for i, t in enumerate(news)] or ["(keine)"]
    lines += ["", "Schreibe dieses JSON:", "{",
              '  "antworten": { "<schlüssel>": ["…", "…", "…"], … },',
              '  "heute": [ { "nr": <Nummer der Schlagzeile>, "woerter": ["…"], "antworten": ["…", "…"] }, … ]',
              "}", "",
              "«antworten»: zu JEDEM dieser Schlüssel genau 3 verschiedene Antworten von Dani:"]
    lines += [f"- {key}: {text}" for key, text in THEMEN.items()]
    lines += ["",
              "«heute»: zu jeder Schlagzeile ein Eintrag. «woerter» sind 1 bis 3 Eigennamen aus der Schlagzeile "
              "(Nachname eines Spielers, Gegner, Wettbewerb), klein geschrieben, an denen man eine Frage dazu erkennt. "
              "«antworten» sind 2 Reaktionen von Dani auf diese Schlagzeile."]
    return "\n".join(lines), news


def parse(text):
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise
        return json.loads(m.group(0))


def sauber(lines, n):
    """Nur brauchbare, harmlose Sätze durchlassen."""
    out = []
    for line in lines if isinstance(lines, list) else []:
        if not isinstance(line, str):
            continue
        line = re.sub(r"\s+", " ", line).strip()
        if 12 <= len(line) <= 320 and not GEWALT.search(line) and not re.search(r"https?:|www\.|#\w", line):
            out.append(line)
    return out[:n]


def candidates(token):
    """Erst die bekannten Modelle, dann – nur wenn nötig – was der Katalog sonst anbietet."""
    yield from MODELS
    try:
        yield from (m for m in catalog(token) if m not in MODELS)
    except Exception as err:
        print(f"Modellkatalog nicht lesbar: {err}")


def main(fcb_file, out_file):
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("Kein GITHUB_TOKEN – keine KI-Sprüche.")
        return 1
    try:
        with open(fcb_file, encoding="utf-8") as f:
            fcb = json.load(f)
    except (OSError, ValueError) as err:
        print(f"FCB-Daten fehlen ({err}) – Sprüche ohne Schlagzeilen.")
        fcb = {}
    user, news = prompt(fcb)

    for model in candidates(token):
        try:
            res = post("/inference/chat/completions", {
                "model": model, "temperature": 1.0, "max_tokens": 6000,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
            }, token)
            data = parse(res["choices"][0]["message"]["content"])
        except Exception as err:
            detail = err.read().decode(errors="replace")[:300] if hasattr(err, "read") else ""
            print(f"{model}: {err} {detail}")
            continue

        answers = {key: sauber((data.get("antworten") or {}).get(key), 4) for key in THEMEN}
        answers = {key: lines for key, lines in answers.items() if lines}
        topics = []
        for item in data.get("heute") or []:
            if not isinstance(item, dict):
                continue
            words = [w.lower().strip() for w in item.get("woerter") or [] if isinstance(w, str)]
            words = [w for w in words if re.fullmatch(r"[a-zà-ÿ.\- ]{4,30}", w) and w not in STOPP][:3]
            lines = sauber(item.get("antworten"), 3)
            nr = item.get("nr")
            title = news[nr - 1] if isinstance(nr, int) and 0 < nr <= len(news) else ""
            if words and lines:
                topics.append({"title": title, "words": words, "answers": lines})
        if len(answers) < len(THEMEN) // 2:
            print(f"{model}: nur {len(answers)} von {len(THEMEN)} Themen brauchbar")
            continue

        out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "model": model,
               "answers": answers, "topics": topics[:7]}
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print(f"{model}: {sum(len(v) for v in answers.values())} Sprüche zu {len(answers)} Themen, "
              f"{len(topics)} Schlagzeilen")
        return 0
    print("Kein Modell hat geantwortet.")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
