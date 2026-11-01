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
import math
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

# (Name, URL, Gewicht, nur Fussball?, Sprache)
# Internationale Redaktionen zählen für die Wichtigkeit mit, angezeigt wird nach
# Möglichkeit ein deutschsprachiger Artikel zum selben Thema.
SOURCES = [
    ("SRF Sport", "https://www.srf.ch/sport/bnf/rss/718", 1.1, False, "de"),
    ("NZZ", "https://www.nzz.ch/sport/fussball.rss", 1.1, True, "de"),
    ("Blick", "https://www.blick.ch/sport/fussball/rss.xml", 0.9, True, "de"),
    ("Der Spiegel", "https://www.spiegel.de/sport/fussball/index.rss", 1.0, True, "de"),
    ("kicker", "https://newsfeed.kicker.de/news/fussball", 1.0, True, "de"),
    ("Sportschau", "https://www.sportschau.de/fussball/index~rss2.xml", 0.9, True, "de"),
    ("tagesschau", "https://www.tagesschau.de/sport/index~rss2.xml", 0.8, False, "de"),
    ("11FREUNDE", "https://www.11freunde.de/feed", 0.7, True, "de"),
    ("BBC Sport", "https://feeds.bbci.co.uk/sport/football/rss.xml", 1.4, True, "en"),
    ("The Guardian", "https://www.theguardian.com/football/rss", 1.3, True, "en"),
    ("Sky Sports", "https://www.skysports.com/rss/12040", 1.2, True, "en"),
]

# Liga-Themen der D-A-CH-Redaktionen und internationale Wettbewerbe (entscheidet die Schlagzeile)
DOMESTIC = re.compile(r"bundesliga|bayern|bvb|dortmund|leverkusen|leipzig|kimmich|dfb-pokal|stuttgart|"
                      r"frankfurt|gladbach|wolfsburg|freiburg|union berlin|hsv|werder|schalke|köln|"
                      r"super league|\byb\b|young boys|fc basel|fcb\b|fcz\b|fc zürich|servette|lugano|"
                      r"st\. gallen|luzern|grasshopper|winterthur|sion|thun", re.I)
INTERNATIONAL = re.compile(r"champions league|champions-league|königsklasse|europa league|conference league|"
                           r"\bwm\b|\bem\b|world cup|nationalmannschaft|nationalteam|national team|nati\b|"
                           r"länderspiel|uefa|fifa", re.I)
# Nur Männerfussball: Meldungen über Frauenfussball werden aussortiert
WOMEN = re.compile(r"\bwomen|frauen|fußballerinnen|fussballerinnen|spielerinnen|lionesses|\bwsl\b|"
                   r"women's super league|nati-frauen|\bdamen|ladies|she\b|her\b", re.I)
# Weltklubs: Meldungen über sie bewegen international am meisten
BIG_CLUBS = re.compile(r"real madrid|barcelona|barça|man(chester)? (united|utd|city)|liverpool|arsenal|chelsea|"
                       r"psg|paris saint|juventus|inter mailand|inter milan|ac mailand|ac milan|atlético|atletico", re.I)

SOURCES_BY_NAME = {name: [{"lang": lang}] for name, _, _, _, lang in SOURCES}

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
                  r"im stream|so sehen sie|tv-übertragung|aufstellung|gossip|predictions|as it happened|"
                  r"highlights|how to watch|team news|player ratings|newsletter", re.I)
LOWER_LEAGUES = re.compile(r"regionalliga|oberliga|challenge league|3\. liga|2\. liga|promotion league|"
                           r"u ?1[0-9]|u ?2[0-3]|jugend|amateur|landesliga|verbandsliga|league one|league two|"
                           r"national league|scottish|\bwsl\b|non-league", re.I)
# Weltstars und Startrainer: Meldungen über sie sind international bedeutsam
STARS = re.compile(r"messi|ronaldo|mbapp|haaland|yamal|bellingham|salah|vin[ií]cius|de bruyne|"
                   r"guardiola|ancelotti|klopp|xabi alonso|flick|mourinho|zidane|infantino|neymar|"
                   r"lewandowski|musiala|wirtz|pedri|rodri|saka|palmer|osimhen|dembélé|dembele", re.I)

# Themen: (Bezeichnung, Emoji, Muster, Bonus für internationale Bedeutung)
TOPICS = [
    ("WM", "🏆", r"\bwm\b|weltmeister|world cup|fifa-wm|wm-quali", 1.6),
    ("EM", "🏆", r"\bem\b|europameister|euro 20", 1.5),
    ("Champions League", "⭐", r"champions league|champions-league|königsklasse", 1.6),
    ("Ballon d'Or", "🏅", r"ballon d.or|weltfussballer|weltfußballer", 1.5),
    ("Europa League", "🟠", r"europa league|europa-league", 1.3),
    ("Conference League", "🟢", r"conference league", 1.2),
    ("Nationalteam", "🌍", r"nati\b|nationalmannschaft|nationalteam|national team|sfv|dfb-team|länderspiel|"
                          r"international break|yakin|nagelsmann", 1.4),
    ("Premier League", "🦁", r"premier league|liverpool|manchester|arsenal|chelsea|tottenham|man city|man utd|"
                             r"man united|newcastle|aston villa", 1.35),
    ("La Liga", "🇪🇸", r"laliga|la liga|real madrid|barcelona|barça|atlético|atletico", 1.35),
    ("Serie A", "🇮🇹", r"serie a|juventus|inter mailand|inter milan|ac mailand|ac milan|napoli|neapel|as rom|roma\b|lazio", 1.3),
    ("Ligue 1", "🇫🇷", r"ligue 1|psg|paris saint|paris st|marseille|monaco", 1.25),
    ("Transfer", "💸", r"transfer|wechsel|verpflicht|ablöse|signs|signing|deal", 1.2),
    ("Trainer", "📋", r"trainer|coach|entlass|freigestellt|beurlaubt|manager|sacked|appointed", 1.15),
    # Nationale Ligen der D-A-CH-Redaktionen zählen weniger, damit nicht jede
    # Bundesliga-Meldung gewinnt, nur weil viele deutsche Medien darüber schreiben
    ("Bundesliga", "🇩🇪", r"bundesliga|bayern|bvb|dortmund|leverkusen|leipzig|kimmich|dfb-pokal", 0.8),
    ("Super League", "🇨🇭", r"super league|yb\b|young boys|fc basel|fcb\b|fcz\b|fc zürich|servette|lugano", 0.75),
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
the a an and or but with after before for from into over under is are was were has have not how why what
who when where his her their this that these those it its as at by on in of to up out new first last top
man men women says said say will can could would should game games win wins won loss draw goal goals
manager coach player players season week weekend match matches cup final boss fan fans world
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
    for name, url, weight, football_only, lang in SOURCES:
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
            if WOMEN.search(title + " " + desc[:200]):
                continue
            if not football_only and (OTHER_SPORTS.search(title) or not FOOTBALL.search(full)):
                continue
            if OTHER_SPORTS.search(title) and not FOOTBALL.search(title):
                continue
            # SRF-Titel haben die Form "Rubrik – Schlagzeile"
            if " – " in title and name.startswith("SRF"):
                title = title.split(" – ", 1)[1]
            items.append({
                "source": name, "weight": weight, "rank": rank, "title": title, "teaser": desc, "lang": lang,
                # Themenvergleich nur über die Schlagzeile: Anrisstexte enthalten zu viele Nebennamen
                "url": link, "published": published, "kw": keywords(title),
            })
            count += 1
        print(f"{name}: {count} passende Meldungen")
    return items


def topic_of(text):
    for label, emoji, pattern, bonus in TOPICS:
        if re.search(pattern, text, re.I):
            return label, emoji, bonus
    return "Top-Meldung", "⚽", 1.0


def related(a, b, idf):
    """Gleiches Thema, wenn genug seltene gemeinsame Namen vorkommen. Häufige Wörter
    wie "Bayern" zählen wenig, seltene wie "Gnabry" viel (normierte IDF-Gewichtung)."""
    shared = a["kw"] & b["kw"]
    if not shared:
        return False
    weights = [idf[k] for k in shared]
    return max(weights) >= 0.45 and sum(weights) >= 1.0


def pick(items):
    now = datetime.now(timezone.utc)
    df = {}
    for it in items:
        for k in it["kw"]:
            df[k] = df.get(k, 0) + 1
    # Seltenheit auf 0..1 normiert, damit die Schwelle bei 10 wie bei 100 Meldungen passt
    norm = math.log(max(len(items), 3))
    idf = {k: math.log(len(items) / n) / norm for k, n in df.items()}
    best, best_score = None, -1
    for a in items:
        sources = {a["source"]: a["weight"]}
        a["links"] = []
        for b in items:
            if b is not a and related(a, b, idf):
                sources[b["source"]] = max(sources.get(b["source"], 0), b["weight"])
                a["links"].append(f"{b['source']}: {b['title'][:50]} [{', '.join(sorted(a['kw'] & b['kw']))}]")
        # Bonus nach Thema der Schlagzeile (der Anrisstext nur, wenn sie nichts hergibt)
        label, _, bonus = topic_of(a["title"])
        if label == "Top-Meldung":
            label, _, bonus = topic_of(a["title"] + " " + a["teaser"])
            bonus = min(bonus, 1.1)  # Nebenerwähnungen im Anrisstext zählen nur wenig
        # Heimvorteil ausgleichen: Bei reinen Bundesliga-/Super-League-Themen zählen
        # deutschsprachige Redaktionen nur wenig, die internationalen entscheiden.
        domestic = bool(DOMESTIC.search(a["title"])) and not INTERNATIONAL.search(a["title"])
        if domestic:
            bonus = min(bonus, 0.8)
        if BIG_CLUBS.search(a["title"]):
            bonus *= 1.15
        lang = {s: next(x["lang"] for x in SOURCES_BY_NAME[s]) for s in sources}
        coverage = sum(w * (0.35 if domestic and lang[s] == "de" else 1) for s, w in sources.items())
        if STARS.search(a["title"]) and not domestic:
            bonus = max(bonus, 1.0) * 1.2
        hours = (now - a["published"]).total_seconds() / 3600
        freshness = max(0.4, 1 - hours / 36)
        position = 1.15 if a["rank"] < 3 else 1.0  # Aufmacher der Redaktion
        teaser_ok = 1.05 if len(a["teaser"]) > 60 else 0.9
        # Ohne deutschsprachigen Artikel zum Thema weniger: Die Meldung soll auf Deutsch lesbar sein
        has_german = a["lang"] == "de" or any(SOURCES_BY_NAME[s][0]["lang"] == "de" for s in sources)
        score = coverage * bonus * freshness * position * teaser_ok * (1 if has_german else 0.6)
        a["score"] = score
        a["coverage"] = sorted(sources)
        a["cluster"] = [b for b in items if b is a or related(a, b, idf)]
        if score > best_score:
            best, best_score = a, score
    return best


def representative(top):
    """Zum gewählten Thema einen deutschsprachigen Artikel mit gutem Anrisstext zeigen."""
    german = [b for b in top["cluster"] if b["lang"] == "de"]
    if not german:
        return top
    return max(german, key=lambda b: (len(b["teaser"]) > 60, b["weight"], b["rank"] < 3, b["published"]))


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
    top = representative(pick(items))
    for it in sorted(items, key=lambda x: -x["score"])[:5]:
        print(f"  {it['score']:.2f}  [{it['source']}] {it['title']}  ({', '.join(it['coverage'])})")
        for link in it["links"][:6]:
            print(f"         ~ {link}")
    # Thema bevorzugt aus der Schlagzeile, sonst aus dem Anrisstext
    label, emoji, _ = topic_of(top["title"])
    if label == "Top-Meldung":
        label, emoji, _ = topic_of(top["title"] + " " + top["teaser"])
    news = {
        "title": top["title"],
        "teaser": shorten(top["teaser"]),
        "source": top["source"] + (" (Englisch)" if top["lang"] == "en" else ""),
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
