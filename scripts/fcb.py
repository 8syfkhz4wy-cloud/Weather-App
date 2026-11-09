#!/usr/bin/env python3
"""Erzeugt fcb.json für den FC-Basel-Bereich der App.

- Kader: Wikipedia-Artikel "FC Basel", Abschnitt "Die 1. Mannschaft" (CC BY-SA)
- News: Google News (Suche "FC Basel") und Blick-Fussballfeed, nur Männerfussball
- Us dr Kurve: Newsfeed von muttenzerkurve.ch und öffentliche Telegram-Webvorschau
  der Muttenzerkurve (falls erreichbar)
- Gerüchteküche: Transfer- und Wechselgerüchte zum FCB aus den Medien
- Kurven-Experte: eine erfundene Figur, die die echten Meldungen derb und emotional auf
  Baseldeutsch kommentiert (regelbasiert aus Vorlagen, keine erfundenen Fakten)

    python3 scripts/fcb.py _site/fcb.json
"""
import html
import json
import random
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = {"User-Agent": "wetter-psalm-app/1.0 (github.com/8syfkhz4wy-cloud/Weather-App)"}
WOMEN = re.compile(r"\bfrauen|\bwomen|spielerinnen|fussballerinnen|fußballerinnen|\bu-?1[5-9]\b|\bu-?2[01]\b|"
                   r"nachwuchs|junioren|nati-frauen", re.I)

# ISO-3-Ländercodes der Wikipedia-Vorlagen -> Flaggen-Emoji
ISO3 = {
    "CHE": "CH", "DEU": "DE", "AUT": "AT", "FRA": "FR", "ITA": "IT", "ESP": "ES", "POR": "PT", "PRT": "PT",
    "NLD": "NL", "BEL": "BE", "LUX": "LU", "DNK": "DK", "SWE": "SE", "NOR": "NO", "FIN": "FI", "ISL": "IS",
    "POL": "PL", "CZE": "CZ", "SVK": "SK", "HUN": "HU", "SVN": "SI", "HRV": "HR", "SRB": "RS", "BIH": "BA",
    "MNE": "ME", "MKD": "MK", "ALB": "AL", "KOS": "XK", "XKX": "XK", "GRC": "GR", "TUR": "TR", "ROU": "RO",
    "BGR": "BG", "UKR": "UA", "RUS": "RU", "GEO": "GE", "ARM": "AM", "IRL": "IE", "ENG": "GB", "SCO": "GB",
    "WAL": "GB", "GBR": "GB", "USA": "US", "CAN": "CA", "MEX": "MX", "BRA": "BR", "ARG": "AR", "URY": "UY",
    "COL": "CO", "CHL": "CL", "PER": "PE", "ECU": "EC", "VEN": "VE", "PRY": "PY", "JPN": "JP", "KOR": "KR",
    "CHN": "CN", "AUS": "AU", "MAR": "MA", "DZA": "DZ", "TUN": "TN", "EGY": "EG", "SEN": "SN", "CIV": "CI",
    "GHA": "GH", "NGA": "NG", "CMR": "CM", "MLI": "ML", "GIN": "GN", "BFA": "BF", "COD": "CD", "COG": "CG",
    "AGO": "AO", "GAB": "GA", "CPV": "CV", "GMB": "GM", "TGO": "TG", "BEN": "BJ", "ZAF": "ZA", "ZMB": "ZM",
    "KEN": "KE", "ETH": "ET", "ERI": "ER", "HTI": "HT", "JAM": "JM", "CRI": "CR", "PAN": "PA", "HND": "HN",
    "ISR": "IL", "IRN": "IR", "IRQ": "IQ", "SAU": "SA", "QAT": "QA", "LIE": "LI", "MLT": "MT", "CYP": "CY",
}


def flag(code):
    iso2 = ISO3.get(code)
    if not iso2:
        return code
    return "".join(chr(0x1F1E6 + ord(c) - 65) for c in iso2)


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as res:
        return res.read()


def unlink(text):
    """[[Ziel|Anzeige]] -> Anzeige, [[Ziel]] -> Ziel, Vorlagen und HTML entfernen."""
    text = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", text)
    text = re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\{\{0\}\}", "", text)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", text).strip()


def load_squad():
    params = {"action": "parse", "page": "FC Basel", "prop": "sections", "format": "json"}
    sections = json.loads(fetch("https://de.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)))
    index = next(s["index"] for s in sections["parse"]["sections"] if s["line"].strip() == "Die 1. Mannschaft")
    params = {"action": "parse", "page": "FC Basel", "prop": "wikitext", "section": index, "format": "json"}
    wikitext = json.loads(fetch("https://de.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)))
    wikitext = wikitext["parse"]["wikitext"]["*"]

    stand = re.search(r"Stand:\s*([^<]+)<", wikitext)
    season = re.search(r"Saison\s*(\d{4}/\d{2})", wikitext)
    groups, current = [], None
    for line in wikitext.splitlines():
        head = re.match(r'!\s*colspan="?\d+"?\s*\|\s*(.+)', line)
        if head:
            current = {"group": unlink(head.group(1)), "players": []}
            groups.append(current)
            continue
        if current is None or not line.startswith("|") or line.startswith("|-") or line.startswith("|}"):
            continue
        cols = [c.split("|", 1)[-1] if "style=" in c else c for c in line[1:].split("||")]
        if len(cols) < 3:
            continue
        number = unlink(cols[0])
        nats = re.findall(r"\{\{([A-Z]{3})\|", cols[1])
        name = unlink(cols[2])
        if not name:
            continue
        current["players"].append({
            "nr": number,
            "name": name,
            "flags": " ".join(flag(n) for n in nats),
            "since": unlink(cols[3]) if len(cols) > 3 else "",
            "from": unlink(cols[4]) if len(cols) > 4 else "",
        })
    groups = [g for g in groups if g["players"]]
    if not groups:
        raise ValueError("Kader nicht gefunden")
    return {
        "season": season.group(1) if season else "",
        "stand": stand.group(1).strip() if stand else "",
        "groups": groups,
        "source": "Wikipedia (CC BY-SA)",
        "url": "https://de.wikipedia.org/wiki/FC_Basel#Die_1._Mannschaft",
    }


def clean(text):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(text or ""))).strip()


def load_news():
    now = datetime.now(timezone.utc)
    items, seen = [], set()
    feeds = [
        ("https://news.google.com/rss/search?q=%22FC+Basel%22+when:3d&hl=de&gl=CH&ceid=CH:de", True),
        ("https://www.blick.ch/sport/fussball/rss.xml", False),
        ("https://www.srf.ch/sport/bnf/rss/718", False),
    ]
    for url, google in feeds:
        try:
            root = ET.fromstring(fetch(url))
        except Exception as err:
            print(f"News-Feed nicht erreichbar: {url} ({err})")
            continue
        for it in root.findall(".//item")[:60]:
            title = clean(it.findtext("title"))
            desc = clean(it.findtext("description"))
            source = "Blick" if "blick" in url else "SRF" if "srf" in url else ""
            if google:
                src = it.find("source")
                source = (src.text or "").strip() if src is not None else ""
                if source and title.endswith(" - " + source):
                    title = title[: -len(source) - 3]
            elif not re.search(r"\bFCB\b|FC Basel|\bBasel\b|Basler", title + " " + desc[:200]):
                continue
            if " – " in title and "srf" in url:
                title = title.split(" – ", 1)[1]
            if WOMEN.search(title + " " + (desc if not google else "")[:200]):
                continue
            try:
                published = parsedate_to_datetime(it.findtext("pubDate"))
            except Exception:
                continue
            if now - published > timedelta(days=4):
                continue
            key = re.sub(r"\W+", "", title.lower())[:50]
            if key in seen:
                continue
            seen.add(key)
            items.append({"title": title, "source": source, "url": (it.findtext("link") or "").strip(),
                          "published": published.isoformat()})
    items.sort(key=lambda x: x["published"], reverse=True)
    return items[:10]


# ---------- Us dr Kurve & Gerüchteküche ----------

# Meldungen über Gewalt, Krawalle oder Polizeieinsätze kommentiert Dani nicht
VIOLENCE = re.compile(r"krawall|ausschreitung|gewalt|polizei|festnahme|verhaft|hooligan|schläger|prügel|"
                      r"angriff|attack|verletzte fans|pyro|feuerwerk|petarde|stadionverbot|randal|sachschaden",
                      re.I)
RUMOR = re.compile(r"gerücht|interess|könnte|offenbar|angeblich|vor dem wechsel|wechsel|transfer|"
                   r"abgang|verlässt|lockt|buhlt|im visier|angebot|millionen|poker|verpflicht|vertrag", re.I)


def load_kurve():
    """Ankündigungen der Muttenzerkurve: Website-Feed und öffentliche Telegram-Vorschau."""
    now = datetime.now(timezone.utc)
    items = []
    try:
        root = ET.fromstring(fetch("https://www.muttenzerkurve.ch/feed/"))
        for it in root.findall(".//item")[:10]:
            published = parsedate_to_datetime(it.findtext("pubDate"))
            if now - published > timedelta(days=21):
                continue
            title = clean(it.findtext("title"))
            text = clean(it.findtext("description"))
            if VIOLENCE.search(title + " " + text):
                continue
            items.append({"title": title.title() if title.isupper() else title, "text": text[:220],
                          "url": (it.findtext("link") or "").strip(), "source": "muttenzerkurve.ch",
                          "published": published.isoformat()})
    except Exception as err:
        print(f"Kurven-Website nicht erreichbar: {err}")
    try:
        page = fetch("https://t.me/s/muttenzerkurve").decode("utf-8", "replace")
        for block in re.findall(r'<div class="tgme_widget_message_wrap.*?</time>', page, re.S)[-8:]:
            post = re.search(r'data-post="([^"]+)"', block)
            text = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', block, re.S)
            when = re.search(r'<time[^>]*datetime="([^"]+)"', block)
            if not (post and text and when):
                continue
            published = datetime.fromisoformat(when.group(1))
            body = clean(text.group(1))
            if not body or now - published > timedelta(days=14) or VIOLENCE.search(body):
                continue
            # Beiträge beginnen oft mit einem Titel in Grossbuchstaben ("ALLI UFF LUGANO Basel ab …")
            caps = re.match(r"([A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 &!'’.\-]{3,}?)(?=\s+[A-ZÄÖÜ][a-zäöü]|$)", body)
            first = caps.group(1).strip().title() if caps else re.split(r"(?<=[.!?])\s", body)[0][:90]
            items.append({"title": first, "text": body[:220], "url": f"https://t.me/{post.group(1)}",
                          "source": "Telegram Muttenzerkurve", "published": published.isoformat()})
    except Exception as err:
        print(f"Telegram-Vorschau nicht erreichbar: {err}")
    # Website und Telegram melden oft dasselbe: doppelte Titel nur einmal zeigen (Website bevorzugt)
    unique, seen = [], set()
    for it in sorted(items, key=lambda x: x["source"] != "muttenzerkurve.ch"):
        key = re.sub(r"\W+", "", it["title"].lower())[:20]
        if key not in seen:
            seen.add(key)
            unique.append(it)
    items = unique
    items.sort(key=lambda x: x["published"], reverse=True)
    return items[:5]


LIVE = re.compile(r"liveticker|live-ticker|\blive\b|ticker|jetzt live|im ticker", re.I)
MATCH = re.compile(r"\b\d{1,2}\s?:\s?\d{1,2}\b|halbzeit|pause|endstand|abpfiff|anpfiff|schlusspfiff|"
                   r"\btor\b|tore|ausgleich|führung|gewinnt|verliert|remis|unentschieden|siegt|"
                   r"spielbericht|telegramm|aufstellung|startelf", re.I)


def load_ticker():
    """Neueste Spielmeldungen zum FCB (Liveticker, Zwischen- und Endstände)."""
    now = datetime.now(timezone.utc)
    query = urllib.parse.quote('"FC Basel" (Liveticker OR live OR Ticker OR Halbzeit OR Endstand) when:2d')
    feeds = [
        ("https://www.srf.ch/sport/bnf/rss/718", "SRF"),
        ("https://www.blick.ch/sport/fussball/rss.xml", "Blick"),
        (f"https://news.google.com/rss/search?q={query}&hl=de&gl=CH&ceid=CH:de", None),
    ]
    items, seen = [], set()
    for url, fixed in feeds:
        try:
            root = ET.fromstring(fetch(url))
        except Exception as err:
            print(f"Ticker-Feed nicht erreichbar: {url} ({err})")
            continue
        for it in root.findall(".//item")[:60]:
            title = clean(it.findtext("title"))
            desc = clean(it.findtext("description"))[:200]
            source = fixed or ""
            if not fixed:
                src = it.find("source")
                source = (src.text or "").strip() if src is not None else ""
                if source and title.endswith(" - " + source):
                    title = title[: -len(source) - 3]
            if " – " in title and fixed == "SRF":
                title = title.split(" – ", 1)[1]
            if not re.search(r"\bFCB\b|FC Basel|\bBasel\b|Basler", title + " " + desc):
                continue
            if WOMEN.search(title + " " + desc) or VIOLENCE.search(title):
                continue
            if not (LIVE.search(title) or MATCH.search(title)):
                continue
            try:
                published = parsedate_to_datetime(it.findtext("pubDate"))
            except Exception:
                continue
            if now - published > timedelta(hours=48):
                continue
            key = re.sub(r"\W+", "", title.lower())[:40]
            if key in seen:
                continue
            seen.add(key)
            score = re.search(r"\b(\d{1,2})\s?:\s?(\d{1,2})\b", title)
            items.append({
                "title": title, "source": source, "url": (it.findtext("link") or "").strip(),
                "published": published.isoformat(),
                "score": f"{score.group(1)}:{score.group(2)}" if score else "",
                "live": bool(LIVE.search(title)) and now - published < timedelta(hours=4),
            })
    items.sort(key=lambda x: x["published"], reverse=True)
    return items[:8]


def load_rumors(squad):
    """Transfer- und Wechselgerüchte zum FCB und zu Spielern aus dem Kader."""
    names = {p["name"].split()[-1] for g in (squad or {}).get("groups", []) for p in g["players"]
             if len(p["name"].split()[-1]) > 3}
    query = urllib.parse.quote('"FC Basel" (Transfer OR Gerücht OR Interesse OR Wechsel OR Angebot) when:7d')
    now = datetime.now(timezone.utc)
    items, seen = [], set()
    try:
        root = ET.fromstring(fetch(f"https://news.google.com/rss/search?q={query}&hl=de&gl=CH&ceid=CH:de"))
    except Exception as err:
        print(f"Gerüchte nicht erreichbar: {err}")
        return []
    for it in root.findall(".//item")[:40]:
        title = clean(it.findtext("title"))
        src = it.find("source")
        source = (src.text or "").strip() if src is not None else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3]
        about_fcb = re.search(r"FCB|FC Basel|Basel|Basler", title) or any(n in title for n in names)
        if not about_fcb or not RUMOR.search(title) or WOMEN.search(title) or VIOLENCE.search(title):
            continue
        try:
            published = parsedate_to_datetime(it.findtext("pubDate"))
        except Exception:
            continue
        key = re.sub(r"\W+", "", title.lower())[:40]
        if key in seen or now - published > timedelta(days=7):
            continue
        seen.add(key)
        items.append({"title": title, "source": source, "url": (it.findtext("link") or "").strip(),
                      "published": published.isoformat()})
    items.sort(key=lambda x: x["published"], reverse=True)
    return items[:5]


# ---------- Kurven-Experte (erfundene Figur) ----------
# Derb und emotional, aber: keine Gewaltaufrufe und keine Beleidigung echter,
# namentlich genannter Personen. Geflucht wird über Situationen, nicht über Menschen.

EXPERT = {
    "name": "Dani «Joggeli» Meier",
    "bio": "Fiktiver Ultra · leidenschaftlich und ehemaliger Brätscher · seit 1998 in dr Muttenzerkurve",
}

INTROS = [
    "HOI ZÄMME, IHR BEBBI!!! Dr Dani isch do und s Bluet kocht scho!",
    "Gopferdammi, Lüt, losed zue – hüt git s Klartext us dr Kurve!",
    "So, Bier uf, Schal um – und jetzt redet dr Dani!",
    "Hueresiech, ich ha scho wieder Härzklopfe bevor ich überhaupt agfange ha!",
    "Morge, ihr Rotblaue! Dr Dani isch wach und hässig wie immer!",
]
OUTROS = [
    "ALLEZ FCB, VERDAMMI NOMOL!!! ❤️💙",
    "Rotblau bis i d Chnoche – und wer s nit verstoht, isch sälber tschuld! ❤️💙",
    "Mir gseh is im Joggeli, und denn wird gsunge bis d Stimm wäg isch! ❤️💙",
    "HOPP FCB!!! Ich bi heiser, und das isch guet so. ❤️💙",
    "Basel isch kei Stadt, Basel isch e Gfühl, gopfertelli! ❤️💙",
]
# Ausrufe, mit denen die Emotionen hochkochen – passend zur Stimmung der Meldung
AUSRUFE = {
    "gut": ["HUERE GEIL!", "JOOO!", "Gopferdammi, isch das schön!", "Ich flipp us!"],
    "schlecht": ["Gopferdammi!", "Hueresiech nomol!", "Verdammi!", "Ich drehe dure!", "Mi Bluetdruck!"],
    "neutral": ["Gopfertelli!", "Hallo?!", "Ohni Seich jetzt!", "Jo spinnsch?!"],
}

# (Muster in der Schlagzeile, Stimmung, Reaktionen)
REACTIONS = [
    (r"verletz|ausfall|fällt.*aus|operation|knie|muskel", "schlecht", [
        "Scho wieder e Verletzig?! Das isch doch verhext, dä Seich! Gueti Besserig, mir bruuche di!",
        "Ich ha grad mi Bier umgschüttet vor Ärger! Wieso immer mir?! Chumm schnell zrugg, Kämpfer!",
    ]),
    (r"sieg|gewinnt|gewonnen|siegt|schlägt|triumph|dreier", "gut", [
        "DREI PÜNKT!!! Ich ha brüelt wie e Gstörte und ha e wildfrömde Typ gumarmt! HUERE GEIL!",
        "SO WÄMMERS HA, GOPFERDAMMI! Das isch Basel – Härz, Bluet und Tor! Ich ha Gänsehut bis in d Zeche!",
    ]),
    (r"niederlage|verliert|verloren|pleite|blamage|unterliegt", "schlecht", [
        "Was isch DAS für e Huere-Seich gsi?! Ich ha mi Schal fascht ufgfrässe vor Wuet! Aber mir stöhn hinter dene Jungs – grad jetzt!",
        "Ich chönnt grad d Wand ufelaufe! So e Chäs! Aber am Samstig sin mir wieder do, luter als je!",
    ]),
    (r"remis|unentschieden|punkt|torlos|1:1|2:2|0:0", "schlecht", [
        "E Punkt?! E PUNKT?! Das isch wie Bier ohni Schuum, gopfertelli! Mir wänn Dreier, nit so lauwarme Seich!",
        "Unentschiede … ich bi so hässig, dass ich hüt nüt meh iss! Nächscht Mol wird gwunne, verdammi!",
    ]),
    (r"schiri|schiedsrichter|var|elfmeter|penalty|rot\b|platzverweis", "schlecht", [
        "Dr Schiri?! Dä het wohl d Brülle dihei vergässe! Ich explodier grad im Sässel!",
        "VAR, Schiri, Pfiff – alles en Seich! Mi Bluetdruck isch uf 200, ohni Witz!",
    ]),
    (r"trainer|coach|entlass|freigestellt", "schlecht", [
        "Trainer-Theater?! Gopferdammi, lönd die Jungs doch eifach schutte und hörred uf mit däm Gschnorr!",
        "Ich sag nume: Wer dr FCB trainiert, mues s Härz am rächte Fläck ha – süsch gits Krach i dr Kurve!",
    ]),
    (r"transfer|wechsel|verpflicht|vertrag|verlänger|leihe|ablöse", "gut", [
        "Transfer?! Wenn dä nit rotblau blüetet, söll er grad dihei blibe! Und wenn doch: WILLKOMME, BRUEDER!",
        "Ich ha scho s Trikot im Chopf bschriftet! Hoffentlich isch das kei Luftnummere, süsch dreh ich dure!",
    ]),
    (r"fans|kurve|stimmung|choreo|zuschauer|stadion|joggeli", "gut", [
        "D Kurve isch unser Wohnzimmer, gopferdammi! Luut, rotblau und mit Härz – so mues es sy!",
        "Wenn s Joggeli bebt, denn zitter ich am ganze Körper. Das verstoht kei Mensch, wo nit dört gstande isch!",
    ]),
    (r"zürich|fcz|gc\b|grasshopper|young boys|\byb\b", "neutral", [
        "GEGE DIE?! Do gits kei Pardon uf em Platz – die Pünkt ghöre uns, verdammi nomol!",
        "Ich ha jetzt scho Härzrase! Gege die wämmer gwinne, und zwar so dütlich, dass es im ganze Land z ghöre isch!",
    ]),
]
# Reaktionen auf Ankündigungen der Kurve
KURVE_REACTIONS = [
    (r"usswärts|auswärts|extrazug|zug|car\b|uff\s", [
        "Usswärts?! Ich pack scho d Täsche! Extrazug, Gsang und Rotblau bis in d Fingerspitze – alli mit!",
        "Wer do nit mitfahrt, verpasst s Läbe, gopferdammi! Ab in Zug und d Kurve uf Reise!",
    ]),
    (r"choreo|fahne|fahnedaag|malen|mole", [
        "Fahne mole, Choreo baue – das isch Kurve-Handwärk! Ich bi dr Erscht mit em Pinsel, verdammi!",
        "Wenn d Choreo ufgoht, chunnt mir jedes Mol s Augewasser. Alli go hälfe!",
    ]),
    (r"saal|film|fescht|fest|party|apéro|bar", [
        "Im Saal mit dr ganze Kurve – Bier, Gschichte und Gänsehut. Do bin ich, klar wie Kloschbrüe!",
        "E Obe mit dr Kurve isch besser als jede Ferie, gopfertelli!",
    ]),
    (r"dehai|heimspiel|joggeli|rotblau.?gass", [
        "Heimspiel! S Joggeli wird bebe, und ich bi heiser bis am Mäntig!",
        "Rotblau Gass, Kurve voll, Stimm wäg – so mues es sy, verdammi nomol!",
    ]),
]
# Reaktionen auf Gerüchte
RUMOR_REACTIONS = [
    "Gerüchte, Gerüchte … mi Bluetdruck goht scho wieder ufe! Wenn dä goht, denn nur für e Huufe Stutz!",
    "Jo spinnsch?! Wenn die üse Bescht wäggchaufe wänn, denn sölle si zahle, bis es chlöpft!",
    "Ich glaub s erscht, wenn s unterschriebe isch. Bis denn: Gschnorr, aber spannends Gschnorr!",
    "Gopferdammi, immer die Gerüchtchüchi! Ich ha jetzt scho Bauchweh, und es isch erscht Mäntig!",
]

GENERIC = [
    "Ich weiss nit, ob ich lache oder brüele söll – aber s Härz brennt rotblau, gopferdammi!",
    "Ohni Seich: Am Wuchenänd zählt nur, was uf em Platz passiert. Alles anderi isch Gschnorr!",
    "Das macht mi so hibbelig, dass ich hüt Nacht nit penn. Hopp jetzt!",
]


def expert_comment(news, today, kurve=(), rumors=()):
    rnd = random.Random(today.isoformat())  # gleicher Kommentar den ganzen Tag
    lines = [rnd.choice(INTROS)]
    news = [n for n in news if not VIOLENCE.search(n["title"])]
    for item in news[:2]:
        mood, reaction = next(((m, rnd.choice(r)) for pattern, m, r in REACTIONS
                               if re.search(pattern, item["title"], re.I)), ("neutral", rnd.choice(GENERIC)))
        lines.append(f"{rnd.choice(AUSRUFE[mood])} «{item['title']}» – {reaction}")
    if not news:
        lines.append("Hüt isch s ruhig um dr FCB. Viel z ruhig, gopferdammi – ich halt das nit us!")
    for item in list(kurve)[:1]:
        reaction = next((rnd.choice(r) for pattern, r in KURVE_REACTIONS if re.search(pattern, item["title"], re.I)),
                        "Us dr Kurve gits Neus – lesed das, ihr Bebbi, und denn alli derbi!")
        lines.append(f"📣 Us dr Kurve: «{item['title']}» – {reaction}")
    for item in list(rumors)[:2]:
        lines.append(f"🍲 Gerüchtchüchi: «{item['title']}» – {rnd.choice(RUMOR_REACTIONS)}")
    lines.append(rnd.choice(OUTROS))
    return {**EXPERT, "lines": lines}


def main(out_file):
    data = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes")}
    try:
        data["squad"] = load_squad()
        print(f"Kader: {sum(len(g['players']) for g in data['squad']['groups'])} Spieler")
    except Exception as err:
        print(f"Kader nicht verfügbar: {err}")
    data["news"] = load_news()
    print(f"News: {len(data['news'])}")
    data["kurve"] = load_kurve()
    print(f"Us dr Kurve: {len(data['kurve'])}")
    for k in data["kurve"]:
        print(f"  - [{k['source']}] {k['title']}")
    data["ticker"] = load_ticker()
    print(f"Ticker: {len(data['ticker'])}")
    for t in data["ticker"]:
        print(f"  - {t['score'] or '–'} {t['title']} ({t['source']})")
    data["rumors"] = load_rumors(data.get("squad"))
    print(f"Gerüchte: {len(data['rumors'])}")
    for r in data["rumors"]:
        print(f"  - {r['title']} ({r['source']})")
    data["expert"] = expert_comment(data["news"], datetime.now(timezone.utc).date(), data["kurve"], data["rumors"])
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
