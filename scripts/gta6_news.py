#!/usr/bin/env python3
"""GTA-6-Tipp des Tages für den Banner auf der Startseite (gta6.json).

Sammelt Artikel zu GTA 6 aus Spielemagazinen (deutsch und englisch) und sortiert
sie in die Schwerpunkte Tipps & Tricks, Cheats, versteckte Orte, Autos, Waffen
und Geld. Jeden Tag steht ein anderer Schwerpunkt vorne; der gewählte Artikel
bleibt den ganzen Tag gleich und wiederholt sich nicht am nächsten Tag.
Allgemeine Meldungen (Trailer, Termine, Gerüchte) kommen nur zum Zug, wenn es
zu keinem Schwerpunkt etwas gibt.

    python3 scripts/gta6_news.py _site/gta6.json [vorheriges-gta6.json]
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Zurich")
MAX_AGE = timedelta(days=21)


def gnews(query, lang):
    region = {"de": "hl=de&gl=CH&ceid=CH:de", "en": "hl=en-US&gl=US&ceid=US:en"}[lang]
    return f"https://news.google.com/rss/search?q={urllib.parse.quote(query + ' when:14d')}&{region}"


# (Name, URL, Gewicht, Sprache). Bei Google News steht die eigentliche Redaktion im <source>-Feld.
SOURCES = [
    ("GameStar", "https://www.gamestar.de/news/rss/news.rss", 1.2, "de"),
    ("GamePro", "https://www.gamepro.de/rss/gamepro-news.rss", 1.2, "de"),
    ("PC Games", "https://www.pcgames.de/feed.cfm?menu_alias=home", 1.0, "de"),
    ("Mein-MMO", "https://mein-mmo.de/feed/", 1.0, "de"),
    ("IGN", "https://feeds.feedburner.com/ign/games-all", 1.1, "en"),
    ("GamesRadar+", "https://www.gamesradar.com/feeds/all/", 1.1, "en"),
    ("PC Gamer", "https://www.pcgamer.com/rss/", 1.0, "en"),
    ("TheGamer", "https://www.thegamer.com/feed/", 0.9, "en"),
    ("Game Rant", "https://gamerant.com/feed/", 0.8, "en"),
    ("Google News", gnews("GTA 6 Tipps OR Cheats OR Geld OR Autos OR Waffen OR Fundorte", "de"), 1.0, "de"),
    ("Google News", gnews("GTA 6 guide OR cheats OR money OR cars OR weapons OR secrets OR hidden", "en"), 0.9, "en"),
]

GTA6 = re.compile(r"\bgta\s?(6|vi)\b|grand theft auto\s?(6|vi)\b", re.I)

# Schwerpunkte: (Schlüssel, Bezeichnung, Emoji, Muster). Reihenfolge = Vorrang bei mehreren Treffern.
CATEGORIES = [
    ("cheats", "Cheats", "🎮", r"\bcheats?\b|cheat-?codes?|cheatcodes?|konsolenbefehl"),
    ("geld", "Geld", "💰", r"\bgeld\b|money|cash|millionär|reich werden|get rich|"
                          r"heist|überfall|\braub|aktien|stock market|immobilie|property"),
    ("autos", "Autos", "🏎️", r"\bautos?\b|\bcars?\b|fahrzeug|vehicle|supercar|sportwagen|motorr[aä]d|bike|"
                             r"\bboote?\b|boats?\b|flugzeug|planes?\b|helikopter|helicopter|garage|tuning"),
    ("waffen", "Waffen", "🔫", r"\bwaffen?\b|weapons?\b|guns?\b|gewehr|rifle|pistole|pistol|sniper|"
                               r"shotgun|schrotflinte|raketenwerfer|rocket launcher|munition|ammo|nahkampf|melee"),
    ("orte", "Versteckte Orte", "🗺️", r"versteckt|geheim|secrets?\b|hidden|easter eggs?|fundort|location|"
                                      r"\bfundorte?\b|sammelobjekt|collectibles?|\bmap\b|karte\b|\borte?\b|"
                                      r"where to find|wo (finde|man)|mystery|rätsel"),
    ("tipps", "Tipps & Tricks", "💡", r"tipps?\b|tricks?\b|\btips?\b|guide|ratgeber|anfänger|beginner|"
                                      r"how to|so (geht|klappt|bekommt)|lösung|walkthrough|komplettlösung|"
                                      r"things (you|to)|should know|solltet|einsteiger|fehler vermeiden|mistakes"),
]
CAT_BY_KEY = {c[0]: c for c in CATEGORIES}
# Tagesrotation der Schwerpunkte
ROTATION = ["tipps", "cheats", "orte", "autos", "waffen", "geld"]

# Videos, Deals, Gewinnspiele und Bildstrecken aussortieren
SKIP = re.compile(r"\bdeal\b|angebot|rabatt|gewinnspiel|giveaway|\bquiz\b|bildergalerie|in bildern|"
                  r"podcast|livestream|\blive\b|vorbestell|pre-?order|preis(e|vergleich)|price|"
                  r"bundle|amazon|mediamarkt", re.I)


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return res.read()


def clean(text):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    return re.sub(r"\s+", " ", text).strip()


def published_of(item):
    for tag in ("pubDate", "{http://purl.org/dc/elements/1.1/}date", "{http://www.w3.org/2005/Atom}updated",
                "{http://www.w3.org/2005/Atom}published"):
        raw = item.findtext(tag)
        if not raw:
            continue
        try:
            dt = parsedate_to_datetime(raw)
        except Exception:
            try:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except Exception:
                continue
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


# Ratgeber-Artikel (Anleitung, Fundorte, Bestenliste) statt blosser Meldungen über das Spiel
GUIDE = re.compile(r"how to|where to (find|get)|locations?\b|guide|\btips?\b|tricks?\b|\bbest\b|walkthrough|"
                   r"cheats?\b|codes?\b|unlock|explained|every\b|all\b.*\b(locations|cars|weapons|codes)|"
                   r"tipps?\b|ratgeber|lösung|fundorte?|so (bekommt|findet|geht|klappt|verdient|holt)|"
                   r"\bwo (ihr|finde|man|gibt)|freischalten|ihr könnt|bekommt ihr|findet ihr|alle\b|die besten|"
                   r"anfänger|beginner|einsteiger|should know|solltet|schnell(es)? geld|make money|money (guide|glitch|fast)",
                   re.I)
# Meldungen über Entwicklung, Verkauf und Streit sind keine Tipps
NEWS_ONLY = re.compile(r"\b(says|said|reveals?|confirms?|interview|lawsuit|klage|shitstorm|sales|verkauf|"
                       r"verkauft|umsatz|aktie|share price|leak|gerücht|rumou?r|delay|verschieb|trailer|"
                       r"review|test:|wertung|cut from|gestrichen|developers?|entwickler|ki-)", re.I)


def categorize(title, teaser):
    """Schwerpunkt aus der Schlagzeile, sonst (schwächer) aus dem Anrisstext."""
    for text, strength in ((title, 1.0), (teaser[:300], 0.6)):
        for key, _, _, pattern in CATEGORIES:
            if re.search(pattern, text, re.I):
                return key, strength
    return None, 0


def parse_feed(data, name, weight, lang, now):
    root = ET.fromstring(data)
    atom = "{http://www.w3.org/2005/Atom}"
    nodes = root.findall(".//item") or root.findall(f".//{atom}entry")
    out = []
    for rank, it in enumerate(nodes[:60]):
        title = clean(it.findtext("title") or it.findtext(f"{atom}title"))
        teaser = clean(it.findtext("description") or it.findtext(f"{atom}summary"))
        link = (it.findtext("link") or "").strip()
        if not link:
            node = it.find(f"{atom}link")
            link = node.get("href", "") if node is not None else ""
        published = published_of(it)
        source = name
        # Google News: "Schlagzeile - Redaktion", Redaktion im <source>-Feld
        if name == "Google News":
            source = clean(it.findtext("source")) or name
            if source != name and title.endswith(" - " + source):
                title = title[: -len(source) - 3]
            teaser = ""  # Anrisstext ist bei Google News nur die wiederholte Schlagzeile
        if not title or not link.startswith("http") or not published or now - published > MAX_AGE:
            continue
        if not GTA6.search(f"{title} {teaser}") or SKIP.search(title):
            continue
        cat, strength = categorize(title, teaser)
        guide = bool(GUIDE.search(title)) and not NEWS_ONLY.search(title)
        if cat and not guide:
            strength *= 0.35  # Schwerpunkt-Wort nur nebenbei (z. B. "money" in einem Interview)
        out.append({
            "title": title, "teaser": teaser, "url": link, "source": source, "lang": lang,
            "weight": weight, "rank": rank, "published": published, "cat": cat, "strength": strength, "guide": guide,
        })
    return out


def load_items(now):
    items = []
    for name, url, weight, lang in SOURCES:
        try:
            found = parse_feed(fetch(url), name, weight, lang, now)
        except Exception as err:
            print(f"{name}: nicht erreichbar ({err})")
            continue
        print(f"{name} ({lang}): {len(found)} GTA-6-Artikel")
        items.extend(found)
    # Doppelte Artikel (gleiche Schlagzeile aus Direkt-Feed und Google News) zusammenfassen
    seen, unique = set(), []
    for it in sorted(items, key=lambda x: x["source"] == "Google News"):
        key = re.sub(r"\W+", "", it["title"].lower())[:60]
        if key not in seen:
            seen.add(key)
            unique.append(it)
    return unique


def score(it, now):
    days = (now - it["published"]).total_seconds() / 86400
    freshness = max(0.25, 1 - days / 14)
    german = 1.2 if it["lang"] == "de" else 1.0  # auf Deutsch lesbar bevorzugt
    teaser_ok = 1.05 if len(it["teaser"]) > 60 else 0.9
    return it["weight"] * freshness * german * teaser_ok * (it["strength"] or 0.4) * (1.1 if it["rank"] < 5 else 1)


def shorten(text, limit=220):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: end + 1] if end > 80 else cut.rsplit(" ", 1)[0] + " …"


def entry(it):
    key = it["cat"]
    label, emoji = (CAT_BY_KEY[key][1], CAT_BY_KEY[key][2]) if key else ("News", "📰")
    return {
        "title": it["title"], "teaser": shorten(it["teaser"]), "url": it["url"],
        "source": it["source"] + (" (Englisch)" if it["lang"] == "en" else ""),
        "published": it["published"].isoformat(), "category": key or "news", "label": label, "emoji": emoji,
    }


def load_prev(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def main(out_file, prev_file=None):
    now = datetime.now(timezone.utc)
    today = now.astimezone(TZ).date()
    focus = ROTATION[today.toordinal() % len(ROTATION)]
    items = load_items(now)
    if not items:
        raise SystemExit("Keine GTA-6-Artikel gefunden")
    for it in items:
        it["score"] = score(it, now)
    items.sort(key=lambda x: -x["score"])

    prev = load_prev(prev_file) if prev_file else {}
    prev_url = (prev.get("top") or {}).get("url")
    same_day = prev.get("day") == today.isoformat()

    top = None
    if same_day and prev_url:
        # Den ganzen Tag denselben Tipp zeigen, solange der Artikel noch im Feed ist
        top = next((it for it in items if it["url"] == prev_url and it["guide"]), None)
    if top is None:
        # Gestrigen Tipp nicht wiederholen
        pool = [it for it in items if same_day or it["url"] != prev_url] or items
        # Vorrang: Ratgeber zum heutigen Schwerpunkt, dann zu einem anderen, erst dann Meldungen
        top = next((it for it in pool if it["cat"] == focus and it["guide"]), None) \
            or next((it for it in pool if it["cat"] and it["guide"]), None) \
            or next((it for it in pool if it["cat"]), None) or pool[0]

    # Je Schwerpunkt der beste weitere Artikel, für Laufband und Liste
    more = []
    for key in ROTATION:
        best = next((it for it in items if it["cat"] == key and it["guide"] and it is not top), None)
        if best:
            more.append(entry(best))

    data = {
        "day": today.isoformat(),
        "focus": focus,
        "focusLabel": CAT_BY_KEY[focus][1],
        "top": entry(top),
        "more": more[:5],
        # Je Schwerpunkt bis zu 5 Artikel zum Antippen in der App (Ratgeber zuerst)
        "cats": {key: [entry(it) for it in sorted((it for it in items if it["cat"] == key),
                                                   key=lambda it: not it["guide"])[:5]]
                 for key in ROTATION},
        "updated": now.isoformat(timespec="minutes"),
    }
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    for it in items[:8]:
        print(f"  {it['score']:.2f} [{it['cat'] or '-'}] {it['source']}: {it['title']}")
    print(f"\nSchwerpunkt heute: {data['focusLabel']}")
    print(f"Tipp des Tages: {data['top']['title']} ({data['top']['source']}, {data['top']['label']})")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
