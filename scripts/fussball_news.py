#!/usr/bin/env python3
"""Ermittelt die wichtigste internationale Fussball-Meldung des Tages und
schreibt sie als news.json für die App.

Vorgehen: Schlagzeilen aus mehreren deutschsprachigen Redaktionen sammeln,
gleiche Themen über gemeinsame Namen (Spieler, Klubs, Wettbewerbe) erkennen
und das Thema wählen, über das die meisten Redaktionen gleichzeitig berichten.
Internationale Wettbewerbe und Topklubs zählen mehr, Liveticker und
unterklassige Ligen werden aussortiert.

    python3 scripts/fussball_news.py _site/news.json
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

# (Name, URL, Gewicht, nur Fussball?)
SOURCES = [
    ("SRF Sport", "https://www.srf.ch/sport/bnf/rss/718", 1.2, False),
    ("NZZ", "https://www.nzz.ch/sport/fussball.rss", 1.2, True),
    ("Blick", "https://www.blick.ch/sport/fussball/rss.xml", 1.0, True),
    ("Der Spiegel", "https://www.spiegel.de/sport/fussball/index.rss", 1.1, True),
    ("kicker", "https://newsfeed.kicker.de/news/fussball", 1.1, True),
    ("Sportschau", "https://www.sportschau.de/fussball/index~rss2.xml", 1.0, True),
    ("tagesschau", "https://www.tagesschau.de/sport/index~rss2.xml", 0.9, False),
    ("11FREUNDE", "https://www.11freunde.de/feed", 0.8, True),
]

MAX_AGE = timedelta(hours=30)

# Nicht-Fussball-Themen aus gemischten Sportfeeds
# Mit Wortgrenzen, damit z. B. "ski" nicht in "Lewandowski" trifft
OTHER_SPORTS = re.compile(
    r"\b(tennis|eishockey|ski\w*|handball\w*|basketball\w*|formel ?1|f1|radrenn\w*|rad-wm|tour de france|"
    r"golf|leichtathletik|schwimm\w*|boxen|boxer|nhl|nba|nfl|motogp|biathlon|volleyball|unihockey|curling|"
    r"swiss indoors|bbl|hsg|langlauf|snowboard|rugby|darts|snooker|schwingen|eiskunstlauf)\b",
    re.I,
)
FOOTBALL = re.compile(
    r"\b(fussball\w*|fußball\w*|liga|league|tor|tore|trainer|elfmeter|transfer|uefa|fifa|wm|em|nati|"
    r"bundesliga|serie a|laliga|premier|pokal|cup|stürmer|verteidiger|goalie|keeper|torhüter|ballon)\b",
    re.I,
)
# Liveticker, Audiostreams, Bildergalerien und Unterhaltung aussortieren
SKIP = re.compile(r"\blive\b|liveticker|audiostream|jetzt live|ticker|instaschau|bilder|quiz|podcast|"
                  r"im stream|so sehen sie|tv-übertragung|aufstellung", re.I)
LOWER_LEAGUES = re.compile(r"regionalliga|oberliga|challenge league|3\. liga|2\. liga|promotion league|"
                           r"u ?1[0-9]|u ?2[0-3]|jugend|amateur|landesliga|verbandsliga", re.I)

# Themen: (Bezeichnung, Emoji, Muster, Bonus für internationale Bedeutung)
TOPICS = [
    ("WM", "🏆", r"\bwm\b|weltmeister|world cup|fifa-wm|wm-quali", 1.6),
    ("EM", "🏆", r"\bem\b|europameister|euro 20", 1.5),
    ("Champions League", "⭐", r"champions league|champions-league|königsklasse", 1.6),
    ("Ballon d'Or", "🏅", r"ballon d.or|weltfussballer|weltfußballer", 1.5),
    ("Europa League", "🟠", r"europa league|europa-league", 1.3),
    ("Conference League", "🟢", r"conference league", 1.2),
    ("Nationalteam", "🇨🇭", r"nati\b|nationalmannschaft|nationalteam|sfv|dfb-team|länderspiel|yakin|nagelsmann", 1.4),
    ("Transfer", "💸", r"transfer|wechsel|verpflicht|ablöse|vertrag", 1.2),
    ("Trainer", "📋", r"trainer|coach|entlass|freigestellt|beurlaubt", 1.2),
    ("Premier League", "🦁", r"premier league|liverpool|manchester|arsenal|chelsea|tottenham|man city|man united", 1.35),
    ("La Liga", "🇪🇸", r"laliga|la liga|real madrid|barcelona|barça|atlético|atletico", 1.35),
    ("Serie A", "🇮🇹", r"serie a|juventus|inter mailand|ac mailand|napoli|neapel|as rom|lazio", 1.3),
    ("Bundesliga", "🇩🇪", r"bundesliga|bayern|bvb|dortmund|leverkusen|leipzig|kane|kimmich", 1.25),
    ("Super League", "🇨🇭", r"super league|yb\b|young boys|fc basel|fcb\b|fcz\b|fc zürich|servette|lugano", 1.15),
]

# Häufige Wörter, die kein Hinweis auf dasselbe Thema sind
STOP = set("""
der die das den dem des ein eine einer eines und oder aber mit nach vor bei von aus für gegen über unter
ist sind war wird werden hat haben nicht noch nur auch schon sich sein seine ihre ihr wie was wer
fussball fußball spiel spiele sieg siege niederlage remis tor tore trainer team mannschaft club klub verein
saison spieltag runde liga league partie duell derby heim auswärts minute minuten punkte punkt tabelle
fans stadion nach jetzt heute gestern morgen sonntag samstag montag dienstag mittwoch donnerstag freitag
erste ersten zweite zweiten neue neuen neuer alte alten großer grosse grosser großen grossen kein keine
spieler star stars sportchef präsident geht gibt macht bleibt steht kommt muss soll kann will darf
""".split())


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-news)"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return res.read()


def clean(text):
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    return re.sub(r"\s+", " ", text).strip()


def keywords(text):
    """Namen und markante Begriffe (ab 3 Zeichen) für den Themenvergleich."""
    words = re.findall(r"[A-Za-zÀ-ÿ][\wÀ-ÿ'’-]{2,}", text)
    out = set()
    for w in words:
        lw = w.lower().strip("'’-")
        if lw in STOP or len(lw) < 3:
            continue
        # Grossgeschriebene Wörter (Namen) und Abkürzungen wie BVB, YB, FCB
        if w[0].isupper() or w.isupper():
            out.add(lw[:7])  # Stamm: "Bayern"/"Bayerns" gleich behandeln
    return out


def load_items():
    now = datetime.now(timezone.utc)
    items = []
    for name, url, weight, football_only in SOURCES:
        try:
            root = ET.fromstring(fetch(url))
        except Exception as err:
            print(f"{name}: nicht erreichbar ({err})")
            continue
        count = 0
        for rank, it in enumerate(root.findall(".//item")[:40]):
            title = clean(it.findtext("title"))
            desc = clean(it.findtext("description"))
            link = (it.findtext("link") or "").strip()
            try:
                published = parsedate_to_datetime(it.findtext("pubDate"))
                if published.tzinfo is None:
                    published = published.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if not title or not link or now - published > MAX_AGE:
                continue
            full = f"{title} {desc}"
            if SKIP.search(title) or LOWER_LEAGUES.search(full):
                continue
            if not football_only and (OTHER_SPORTS.search(title) or not FOOTBALL.search(full)):
                continue
            if OTHER_SPORTS.search(title) and not FOOTBALL.search(title):
                continue
            # SRF-Titel haben die Form "Rubrik – Schlagzeile"
            if " – " in title and name.startswith("SRF"):
                title = title.split(" – ", 1)[1]
            items.append({
                "source": name, "weight": weight, "rank": rank, "title": title, "teaser": desc,
                "url": link, "published": published, "kw": keywords(title + " " + desc[:200]),
            })
            count += 1
        print(f"{name}: {count} passende Meldungen")
    return items


def topic_of(text):
    for label, emoji, pattern, bonus in TOPICS:
        if re.search(pattern, text, re.I):
            return label, emoji, bonus
    return "Top-Meldung", "⚽", 1.0


def related(a, b):
    shared = a["kw"] & b["kw"]
    return len(shared) >= 2 or (len(shared) == 1 and len(next(iter(shared))) >= 6 and a["source"] != b["source"])


def pick(items):
    now = datetime.now(timezone.utc)
    best, best_score = None, -1
    for a in items:
        sources = {a["source"]: a["weight"]}
        for b in items:
            if b is not a and related(a, b):
                sources[b["source"]] = max(sources.get(b["source"], 0), b["weight"])
        coverage = sum(sources.values())
        _, _, bonus = topic_of(a["title"] + " " + a["teaser"])
        hours = (now - a["published"]).total_seconds() / 3600
        freshness = max(0.4, 1 - hours / 36)
        position = 1.15 if a["rank"] < 3 else 1.0  # Aufmacher der Redaktion
        teaser_ok = 1.05 if len(a["teaser"]) > 60 else 0.9
        score = coverage * bonus * freshness * position * teaser_ok
        a["score"] = score
        a["coverage"] = sorted(sources)
        if score > best_score:
            best, best_score = a, score
    return best


def shorten(text, limit=230):
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: end + 1] if end > 80 else cut.rsplit(" ", 1)[0] + " …"


def main(out_file):
    items = load_items()
    if not items:
        raise SystemExit("Keine Meldungen gefunden")
    top = pick(items)
    for it in sorted(items, key=lambda x: -x["score"])[:5]:
        print(f"  {it['score']:.2f}  [{it['source']}] {it['title']}  ({', '.join(it['coverage'])})")
    # Thema bevorzugt aus der Schlagzeile, sonst aus dem Anrisstext
    label, emoji, _ = topic_of(top["title"])
    if label == "Top-Meldung":
        label, emoji, _ = topic_of(top["title"] + " " + top["teaser"])
    news = {
        "title": top["title"],
        "teaser": shorten(top["teaser"]),
        "source": top["source"],
        "url": top["url"],
        "published": top["published"].isoformat(),
        "topic": label,
        "emoji": emoji,
        "sources": top["coverage"],
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
    }
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(news, f, ensure_ascii=False, indent=1)
    print(f"\nTop-Meldung: {news['title']} ({news['source']}, {label})")


if __name__ == "__main__":
    main(sys.argv[1])
