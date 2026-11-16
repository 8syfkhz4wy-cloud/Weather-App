#!/usr/bin/env python3
"""Frische Sprüche für den Chat mit Dani «Joggeli» Meier, geschrieben von Claude.

Läuft im GitHub-Actions-Ablauf. Der Schlüssel für die Claude API liegt als Geheimnis
ANTHROPIC_API_KEY im Repository und ist nur im Ablauf sichtbar, nie in der App. Die App
ruft kein Modell auf: Sie lädt nur die fertige Datei dani.json und mischt die Sprüche
unter die festen aus dani-chat.js.

Aufruf: dani_ki.py fcb.json dani.json

- Ohne Schlüssel passiert nichts (Code 0); der Chat läuft mit den festen Antworten.
- Sind die zuletzt veröffentlichten Sprüche jünger als DANI_STUNDEN (Standard 6), werden
  sie übernommen, ohne das Modell zu fragen. Das hält die Kosten klein.
- Bei einem Fehler bleiben die zuletzt veröffentlichten Sprüche erhalten (Code 1).

Modell: DANI_MODEL (Standard claude-opus-5-5).
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

MODEL = os.environ.get("DANI_MODEL") or "claude-opus-5-5"
STUNDEN = float(os.environ.get("DANI_STUNDEN") or 6)
BISHER = os.environ.get("DANI_BISHER", "https://8syfkhz4wy-cloud.github.io/Weather-App/dani.json")
# Modelle, für die die API bei einer Ablehnung selbst auf ein anderes Modell ausweicht
MIT_AUSWEICHEN = {"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"}

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
"""

GEWALT = re.compile(r"schläg|schleg|prüge?l|brüge?l|verhau|krawall|ausschreit|randal|polizei|festnahme|abstech|umbring|töt|waffe|messer|bombe|anzünd|aazünd|"
                    r"pyro|fackle|petard|hooligan|uf d schnure|in d frässe|bluet söll", re.I)
STOPP = {"basel", "basler", "rotblau", "spiel", "match", "tabelle", "news", "wetter", "kader", "trainer", "sieg",
         "niederlage", "transfer", "wechsel", "super", "league", "saison", "runde", "punkt", "punkte", "tore",
         "stadion", "joggeli", "kurve", "fans", "zürich", "bern", "heute", "morgen", "gegen", "nach", "über"}


def bisher():
    """Die zuletzt veröffentlichten Sprüche, falls es welche gibt."""
    try:
        req = urllib.request.Request(BISHER, headers={"User-Agent": "wetter-psalm-app"})
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.load(res)
        return data if isinstance(data.get("answers"), dict) else None
    except Exception:
        return None


def schema():
    """Form der Antwort; die API hält sich daran (strukturierte Ausgabe)."""
    lines = {"type": "array", "items": {"type": "string"}}
    return {
        "type": "object", "additionalProperties": False, "required": ["antworten", "heute"],
        "properties": {
            "antworten": {"type": "object", "additionalProperties": False, "required": list(THEMEN),
                          "properties": {key: lines for key in THEMEN}},
            "heute": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": ["nr", "woerter", "antworten"],
                "properties": {"nr": {"type": "integer"}, "woerter": lines, "antworten": lines}}},
        },
    }


def ask(user):
    """Claude fragen. Gibt (Daten, Modell) zurück oder wirft einen Fehler mit lesbarem Grund."""
    import anthropic  # erst hier: ohne Schlüssel braucht es das Paket nicht

    client = anthropic.Anthropic()
    extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"} if MODEL in MIT_AUSWEICHEN else {}
    try:
        res = client.beta.messages.create(
            model=MODEL, max_tokens=16000, system=SYSTEM,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema()}},
            **extra,
        )
    except anthropic.AuthenticationError:
        raise RuntimeError("Der Schlüssel ANTHROPIC_API_KEY ist ungültig.") from None
    except anthropic.PermissionDeniedError as err:
        raise RuntimeError(f"Der Schlüssel darf das Modell {MODEL} nicht nutzen: {err.message}") from None
    except anthropic.NotFoundError:
        raise RuntimeError(f"Das Modell {MODEL} gibt es nicht (DANI_MODEL prüfen).") from None
    except anthropic.RateLimitError:
        raise RuntimeError("Zu viele Anfragen oder Guthaben aufgebraucht – später wieder.") from None
    except anthropic.APIStatusError as err:
        raise RuntimeError(f"Fehler der Claude API ({err.status_code}): {err.message}") from None
    except anthropic.APIConnectionError as err:
        raise RuntimeError(f"Claude API nicht erreichbar: {err}") from None
    if res.stop_reason == "refusal":
        raise RuntimeError("Das Modell hat die Anfrage abgelehnt.")
    if res.stop_reason == "max_tokens":
        raise RuntimeError("Die Antwort wurde zu lang und abgeschnitten.")
    text = next((block.text for block in res.content if block.type == "text"), "")
    print(f"Verbrauch: {res.usage.input_tokens} Token rein, {res.usage.output_tokens} raus")
    return json.loads(text), res.model


def prompt(fcb):
    titles = lambda key, n: [it["title"] for it in (fcb.get(key) or [])[:n] if not GEWALT.search(it["title"])]
    lines = ["Beispiele für Danis Ton:"] + [f"- {b}" for b in BEISPIELE]
    lines += ["", f"Heute ist der {datetime.now(timezone.utc):%d.%m.%Y}.", "", "Aktuelle Schlagzeilen zum FC Basel:"]
    news = titles("news", 5) + titles("rumors", 2)
    lines += [f"{i + 1}. {t}" for i, t in enumerate(news)] or ["(keine)"]
    lines += ["", "«antworten»: zu JEDEM dieser Schlüssel genau 3 verschiedene Antworten von Dani:"]
    lines += [f"- {key}: {text}" for key, text in THEMEN.items()]
    lines += ["",
              "«heute»: zu jeder Schlagzeile ein Eintrag, «nr» ist ihre Nummer. «woerter» sind 1 bis 3 Eigennamen aus der Schlagzeile "
              "(Nachname eines Spielers, Gegner, Wettbewerb), klein geschrieben, an denen man eine Frage dazu erkennt. "
              "«antworten» sind 2 Reaktionen von Dani auf diese Schlagzeile."]
    return "\n".join(lines), news


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


def build(data, news, model):
    """Antwort des Modells prüfen und in die Form bringen, die der Chat lädt."""
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
        raise RuntimeError(f"nur {len(answers)} von {len(THEMEN)} Themen brauchbar")
    return {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "model": model,
            "answers": answers, "topics": topics[:7]}


def write(out_file, data):
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def main(fcb_file, out_file):
    old = bisher()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Kein ANTHROPIC_API_KEY hinterlegt – Dani antwortet mit den festen Sprüchen.")
        return 0
    if old:
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(old["updated"])
        except (KeyError, TypeError, ValueError):
            age = timedelta(days=99)
        if age < timedelta(hours=STUNDEN):
            write(out_file, old)
            print(f"Sprüche sind {age.total_seconds() / 3600:.1f} Std. alt – bleiben (neu ab {STUNDEN:g} Std.).")
            return 0
    try:
        with open(fcb_file, encoding="utf-8") as f:
            fcb = json.load(f)
    except (OSError, ValueError) as err:
        print(f"FCB-Daten fehlen ({err}) – Sprüche ohne Schlagzeilen.")
        fcb = {}
    user, news = prompt(fcb)
    try:
        data, model = ask(user)
        out = build(data, news, model)
    except Exception as err:
        print(f"Keine neuen Sprüche: {err}")
        if old:
            write(out_file, old)
            print("Die bisherigen Sprüche bleiben.")
        return 1
    write(out_file, out)
    print(f"{model}: {sum(len(v) for v in out['answers'].values())} Sprüche zu {len(out['answers'])} Themen, "
          f"{len(out['topics'])} Schlagzeilen")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
