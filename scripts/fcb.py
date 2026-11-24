#!/usr/bin/env python3
"""Erzeugt fcb.json für den FC-Basel-Bereich der App.

- Kader: Wikipedia-Artikel "FC Basel", Abschnitt "Die 1. Mannschaft" (CC BY-SA)
- News, Spielberichte, Gerüchte: direkte Feeds von SRF, Blick, watson und 20 Minuten
  (Google News nur als Notlösung, wenn zu wenig Meldungen da sind), nur Männerfussball
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
from zoneinfo import ZoneInfo

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


# Direkte Feeds der Redaktionen. Ihre Links führen direkt zum Artikel
# (Google-News-Links landen auf einer Zwischenseite und werden nur als Notlösung genutzt).
FEEDS = [
    ("https://www.srf.ch/sport/bnf/rss/718", "SRF"),
    ("https://www.blick.ch/sport/fussball/rss.xml", "Blick"),
    ("https://www.watson.ch/api/2.0/rss/index.xml?tag=FC%20Basel", "watson"),
    ("https://partner-feeds.20min.ch/rss/20minuten/sport", "20 Minuten"),
]
ABOUT_FCB = re.compile(r"\bFCB\b|FC Basel|\bBasel\b|Basler|Rotblau", re.I)
_feed_cache = {}


def feed_items(url, source):
    """RSS- oder Atom-Feed als Liste von Meldungen (im Lauf zwischengespeichert)."""
    if url in _feed_cache:
        return _feed_cache[url]
    items = []
    try:
        root = ET.fromstring(fetch(url))
    except Exception as err:
        print(f"Feed nicht erreichbar: {url} ({err})")
        _feed_cache[url] = items
        return items
    atom = "{http://www.w3.org/2005/Atom}"
    entries = root.findall(".//item") or root.findall(f".//{atom}entry")
    for it in entries[:60]:
        is_atom = it.tag.startswith(atom)
        title = clean(it.findtext(f"{atom}title" if is_atom else "title"))
        desc = clean(it.findtext(f"{atom}summary" if is_atom else "description"))
        if is_atom:
            link_el = it.find(f"{atom}link")
            link = link_el.get("href", "") if link_el is not None else ""
            when = it.findtext(f"{atom}updated") or it.findtext(f"{atom}published") or ""
        else:
            link = (it.findtext("link") or "").strip()
            when = it.findtext("pubDate") or ""
        try:
            published = datetime.fromisoformat(when.replace("Z", "+00:00")) if is_atom else parsedate_to_datetime(when)
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        src = source
        if source is None:  # Google News: Quelle steht im Eintrag
            el = it.find("source")
            src = (el.text or "").strip() if el is not None else ""
            if src and title.endswith(" - " + src):
                title = title[: -len(src) - 3]
        if " – " in title and source == "SRF":
            title = title.split(" – ", 1)[1]
        if title and link:
            items.append({"title": title, "desc": desc[:220], "url": link, "source": src, "published": published})
    _feed_cache[url] = items
    return items


def fcb_items(max_age, extra=None, google_query=None, minimum=3):
    """FCB-Meldungen (Männer) aus den direkten Feeds; Google News nur, wenn zu wenig da ist."""
    now = datetime.now(timezone.utc)

    def collect(feeds, direct):
        out = []
        for url, source in feeds:
            for it in feed_items(url, source):
                text = it["title"] + " " + it["desc"]
                # watson-Feed ist schon nach FC Basel gefiltert, Google sucht danach
                if direct and source != "watson" and not ABOUT_FCB.search(text):
                    continue
                if WOMEN.search(text) or now - it["published"] > max_age:
                    continue
                if extra and not extra(it):
                    continue
                out.append(it)
        return out

    items = collect(FEEDS, True)
    if len(items) < minimum and google_query:
        q = urllib.parse.quote(google_query)
        items += collect([(f"https://news.google.com/rss/search?q={q}&hl=de&gl=CH&ceid=CH:de", None)], False)
    seen, unique = set(), []
    for it in sorted(items, key=lambda x: x["published"], reverse=True):
        key = re.sub(r"\W+", "", it["title"].lower())[:40]
        if key not in seen:
            seen.add(key)
            unique.append({**it, "published": it["published"].isoformat()})
    return unique


def load_news():
    items = fcb_items(timedelta(days=5), google_query='"FC Basel" when:3d', minimum=4)
    return [{k: it[k] for k in ("title", "source", "url", "published")} for it in items[:10]]


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


MATCH = re.compile(r"\b\d{1,2}\s?:\s?\d{1,2}\b|halbzeit|endstand|abpfiff|schlusspfiff|\btor\b|tore\b|ausgleich|"
                   r"führung|gewinnt|verliert|remis|unentschieden|siegt|sieg\b|niederlage|spielbericht|"
                   r"telegramm|aufstellung|startelf|liveticker|eigentor|penalty|platzverweis|vergeigt|"
                   r"begnügen|punkt", re.I)


def load_ticker():
    """Spielberichte zum FCB: Meldungen mit Resultat oder Spielbezug, mit direkten Links."""
    items = fcb_items(timedelta(days=6), extra=lambda it: MATCH.search(it["title"]) and not VIOLENCE.search(it["title"]),
                      minimum=0)
    out = []
    for it in items[:6]:
        # Letztes Resultat in der Schlagzeile ("nach 2:0-Führung 3:3" -> 3:3)
        scores = re.findall(r"\b(\d{1,2})\s?:\s?(\d{1,2})\b", it["title"])
        out.append({"title": it["title"], "source": it["source"], "url": it["url"], "published": it["published"],
                    "score": f"{scores[-1][0]}:{scores[-1][1]}" if scores else ""})
    return out


def load_rumors(squad):
    """Transfer- und Wechselgerüchte zum FCB und zu Spielern aus dem Kader."""
    names = {p["name"].split()[-1] for g in (squad or {}).get("groups", []) for p in g["players"]
             if len(p["name"].split()[-1]) > 3}

    def is_rumor(it):
        t = it["title"]
        about = ABOUT_FCB.search(t) or any(n in t for n in names)
        return about and RUMOR.search(t) and not VIOLENCE.search(t)

    items = fcb_items(timedelta(days=7), extra=is_rumor, minimum=2,
                      google_query='"FC Basel" (Transfer OR Gerücht OR Interesse OR Wechsel OR Angebot) when:7d')
    return [{k: it[k] for k in ("title", "source", "url", "published")} for it in items[:5]]


# ---------- Kurven-Experte (erfundene Figur) ----------
# Derb und emotional, aber: keine Gewaltaufrufe und keine Beleidigung echter,
# namentlich genannter Personen. Geflucht wird über Situationen, nicht über Menschen.
# In den News darf Dani überkochen und manchmal wirr werden (KAFKA); im Chat und bei der
# Kurve bleibt er bei den Fakten (Quelle, Datum, Inhalt der aktuellen Meldung).

EXPERT = {
    "name": "Dani «Joggeli» Meier",
    "bio": "Fiktiver Ultra · leidenschaftlich und ehemaliger Brätscher · seit 1998 in dr Muttenzerkurve",
}

INTROS = [
    "HÖSCH, IHR BEBBI!!! Dr Dani isch do, und s Bluet kocht scho bis in Grind ufe!",
    "Gopferdammi nomol, losed zue – hüt git s Klartext us dr Kurve, ohni Wattebäuschli!",
    "So. Bier uf, Schal um, Schnuure uf – jetzt schwätzt dr Dani!",
    "Hueresiech, ych ha scho Härzchlopfe, bevor ych überhaupt agfange ha!",
    "Guete Morge, ihr Rotblaue! Ych bi wach, verchateret und hässig wie e Hornusse!",
    "Jä nu, wo fang ych aa? Ah ja: BEIM FCB, wo susch, ihr Glünggi!",
    "Ych ha hüt scho drei Kaffi und e Gipfeli gha – und ych bi IMMER NO uf hundertachtzig!",
    "Mamme, mach s Radio lüter – dr Dani verzellt ebbis!",
    "HERRGOTTSAKRAMÄNT, isch das e Wuche gsi! Setzed eu, ihr Bebbi, jetzt gits Füür!",
    "Kruzitürke nomol, ych ha d ganzi Nacht nit gschloofe – wäge Fuessball, wäge wäm susch?!",
    "Gopferdammi-Hueresiech-Verreckt, ych bi scho wieder voll im Saft! Uffpasse, jetzt chunnt s!",
]
OUTROS = [
    "ALLEZ FCB, GOPFERDAMMI NOMOL!!! ❤️💙",
    "Rotblau bis in d Chnoche – und wär s nit kapiert, cha mir dr Buggel abeschlyffe! ❤️💙",
    "Mir gsehn is im Joggeli, und denn wird brüelt, bis kai Stimm meh do isch! ❤️💙",
    "HOPP FCB!!! Ych bi heiser wie e alte Gugge-Bass – und s isch mir Wurscht! ❤️💙",
    "Basel isch kai Stadt, Basel isch e Gfühl, verreckt nomol! ❤️💙",
    "Z Basel an mym Rhy – und dr FCB im Härz. Fertig, Schluss, Amen! ❤️💙",
    "So, jetzt bruuch ych e Bier. Oder zwai. Oder drüü. HOPP BASEL! ❤️💙",
]
# Ausrufe, mit denen die Emotionen hochkochen – passend zur Stimmung der Meldung
AUSRUFE = {
    "gut": ["HUERE GEIL!!!", "JOOOOO!!!", "Gopferdammi, isch das schön!", "Ych flipp us!",
            "Sauglatt, Lüt!", "Mamme, ych heul!", "HÖSCH, LUEG DAS AA!", "HERRGOTTSAKRAMÄNT, JAAAA!!!",
            "Ych ha Träne im Bier, gopferdammi!", "VERRECKT GEIL!!!"],
    "schlecht": ["Gopferdammi!", "Hueresiech nomol!", "Verreckt!", "Schissdräck!", "Ych drey dure!",
                 "Mi Bluetdruck!!!", "Jesses Gott!", "So e Chabis!", "Kruzitürke nomol!",
                 "HERRGOTTSAKRAMÄNT!!!", "Gopferdammi-Hueresiech!", "Himmeltrurig, verreckt!"],
    "neutral": ["Gopfertelli!", "Hösch?!", "Ohni Seich jetzt!", "Jo spinnsch?!", "Jä nu …", "Lueg emol do!",
                "Heilandsack!", "Gopf nomol!"],
}
# Nachsätze, zufällig angehängt – damit Dani jeden Tag anders tönt
NACHSAETZE = {
    "gut": ["Ych ha Gänsehut bis an d Zeche!", "Ych bruuch jetzt e Bier – oder grad e Fass!",
            "Ych bi so happy, ych chönnt dr ganz Tram abschmützle!", "D Mamme het gmeint, ych syg nit ganz bache!"],
    "schlecht": ["Ych chönnt grad in Rhy springe – aber nur zum abchüehle!", "Mi Grind platzt glyy!",
                 "Ych ha mi Schal fascht ufgfrässe vor Wuet!", "Dr Hund het sich unters Sofa verschloffe, so han ych brüelt!"],
    "neutral": ["Mol luege, was do no kunnt.", "Ych bi gspannt wie e Rägeschirm im Sturm!",
                "Ych sag nyt meh – nai, ych sag doch no ebbis: HOPP FCB!",
                "Gopferdammi, ych bi nervös wie e Chatz im Waschsalon!"],
}
# Ab und zu wird Dani wirr – kafkaesk, verloren in dr Bürokratie vom Fuessball. Nur in de News.
KAFKA = [
    "Ych bi hüt am Morge uffgwacht und ha nümm gwüsst, öb ych e Fan bi oder e Saisonabo. "
    "D Geschäftsstell sait, my Fall wird bearbeitet. Vo wäm? Wo? Niemer waiss es, gopferdammi.",
    "Ych ha am Igang zum Sektor gwartet. Dr Maa am Tor het gsait, dä Igang syg nur für mi gmacht – "
    "und jetzt wärd er gschlosse. Ych stand immer no dört. Verreckt.",
    "Ych ha e Formular übercho: «Antrag uf Jubel, Abschnitt C». Ohni Stempel darf ych erscht im "
    "nächste Kwartal juble. Wär stämplet das? Dr Stämpler isch in de Ferie. Sit 1998.",
    "Mängisch frog ych mi, öb s Joggeli überhaupt exischtiert – oder öb mir alli nur in ere "
    "unendlige Warteschlange vor em Wurschtstand stöhn. Ych ha d Nummere 4711. Ufgruefe wird 12.",
    "Hüt Nacht ha ych tröimt, ych syg e Trikotnummere. Niemer het mi aazoge. Ych bi in ere Schublade "
    "uffgwacht, und d Schublade het mi aaglueget. Hueresiech, was isch das für e Saison?!",
    "Ych ha bim Verband aagruefe, wäge däm Entscheid. Si händ gsait, dr Entscheid syg scho gfällt, "
    "aber nonig mitteilt, und ych syg zwar betroffe, aber nit zueständig. Ych ha ufghänkt. Oder si.",
    "Mys Bier het mi hüt gfrogt, wär ych bi. Ych ha kai Antwort gha. Jetzt sitz ych do und warte "
    "uf e Bscheid vo dr obere Instanz. Bis denn: Hopp FCB, glaub ych.",
]

# (Muster in der Schlagzeile, Stimmung, Reaktionen)
REACTIONS = [
    (r"verletz|ausfall|fällt.*aus|operation|knie|muskel", "schlecht", [
        "Scho wieder e Verletzig?! Das isch doch verhäxt, dä Huere-Seich! Gueti Besserig, mir bruuche di, Kampfsau!",
        "Ych ha grad mi Bier umgschüttet vor Ärger! Wieso immer mir, gopferdammi?! Chumm schnäll zrugg, Brueder!",
        "D Lazarett-Lischte isch lenger als d Schlange vor em Fasnachtsbändeli-Stand! Schissdräck!",
    ]),
    (r"sieg|gewinnt|gewonnen|siegt|schlägt|triumph|dreier|dreht", "gut", [
        "DRÜÜ PÜNKT!!! Ych ha brüelt wie e Gstörte und e wildfrömde Typ abgschmützlet! HUERE GEIL!",
        "SO WÄMMERS HA, GOPFERDAMMI! Das isch Basel – Härz, Bluet und Tor! Ych bi fix und fertig vor Glügg!",
        "Mir sinn wieder wär, ihr Lappi! Ych tanz grad uf em Chuchitisch – d Nochbere chönne mi mol!",
    ]),
    (r"niederlage|verliert|verloren|pleite|blamage|unterliegt|kassiert", "schlecht", [
        "Was isch DAS für e Schofseggel-Spiel gsi?! Ych ha dr Grind uf d Tischplatte ghaue! Aber mir stöhn hinter dene Jungs – grad jetzt, verreckt nomol!",
        "Ych chönnt grad d Wand uffelaufe, so e Chäs! Aber am Samschtig sinn mir wieder do – lüter als je!",
        "Verlore?! VERLORE?! Ych bruuch e Schnaps und e Rueh. Und denn wird wieder gsunge, gopferdammi!",
    ]),
    (r"remis|unentschieden|punkt|torlos|1:1|2:2|3:3|0:0|begnügen", "schlecht", [
        "E Pünktli?! E PÜNKTLI?! Das isch wie Bier ohni Schuum, gopfertelli! Mir wänn Dreier, kai lauwarme Seich!",
        "Unentschiede … ych bi so hässig, dass ych hüt nyt meh iss – usser e Wurscht. Oder zwai.",
        "Gopferdammi, so knapp! Ych ha mir d Hoor usgrisse – und ych ha sowiso scho kaini meh!",
    ]),
    (r"schiri|schiedsrichter|var|elfmeter|penalty|rot\b|platzverweis|eigentor", "schlecht", [
        "Dr Schiri?! Dä het sy Brülle dehai im Nachttischli vergässe! Ych explodier grad im Sässel!",
        "VAR, Pfiff, Chabis – alles e huere Seich! Mi Bluetdruck isch uf zwaihundert, ohni Witz!",
        "Ych ha so lut brüelt, dass dr ganzi Sektor gmeint het, ych syg dr Stadionspeaker!",
    ]),
    (r"trainer|coach|entlass|freigestellt", "schlecht", [
        "Trainer-Theater?! Lönd die Jungs doch aifach schutte und hörred uf mit däm Gschnorr, gopferdammi!",
        "Wär dr FCB trainiert, mues s Härz am rächte Fläck ha – susch git s Rambazamba i dr Kurve!",
    ]),
    (r"transfer|wechsel|verpflicht|vertrag|verlänger|leihe|ablöse", "gut", [
        "Transfer?! Wenn dä nit rotblau blüetet, söll er grad dehai blybe! Und wenn doch: WILLKOMME, BRUEDER!",
        "Ych ha scho s Trikot im Grind bschriftet! Wenn das e Luftnummere isch, drey ych dure, verreckt!",
    ]),
    (r"fans|kurve|stimmung|choreo|zuschauer|stadion|joggeli", "gut", [
        "D Kurve isch unser Wohnstube, gopferdammi! Lut, rotblau und mit Härz – so mues es sy!",
        "Wenn s Joggeli bebt, zitter ych am ganze Lyb. Das verstoht kai Mensch, wo nit dört gstande isch!",
    ]),
    (r"krise|problem|kritik|sorge|druck|unruhe|baustelle|fehlstart|tiefpunkt|pfiffe|debatte", "schlecht", [
        "KRISE?! Ych ha kai Krise, ych ha Bluethochdruck, gopferdammi! Aber wär jetzt dr Schal an Nagel hänkt, isch kai Rotblaue!",
        "Alli schwätze, kaine schafft – Herrgottsakramänt, das macht mi wahnsinnig! Uf em Platz mues es brenne, nit in de Kommentarspalte!",
        "Ych ha das glääse und mi Kaffi isch vo sälber kalt worde, so frostig isch d Lag! Jetzt erscht rächt: alli is Joggeli!",
        "Problem do, Problem dört – kruzitürke, mir sinn dr FCB, nit e Sorgetelefon! Zämmestoh und singe, bis s wieder lauft!",
    ]),
    (r"zürich|fcz|gc\b|grasshopper|young boys|\byb\b", "neutral", [
        "GEGE DIE?! Do git s kai Pardon uf em Platz – die Pünkt ghöre uns, verreckt nomol!",
        "Ych ha jetzt scho Härzrase! Gege die wämmer gwinne, und zwar so dütlich, dass es bis an Bodesee ane z ghöre isch!",
    ]),
]
# Reaktionen auf Ankündigungen der Kurve
KURVE_REACTIONS = [
    (r"usswärts|auswärts|extrazug|zug|car\b|uff\s", [
        "Usswärts?! Ych pack scho d Täsche! Extrazug, Gsang und Rotblau bis in d Fingerspitze – alli mit, ihr Bebbi!",
        "Wär do nit mitfahrt, verpasst s Läbe, gopferdammi! Ab in Zug und d Kurve uf Reise – egal wohi, Hauptsach rotblau!",
    ]),
    (r"choreo|fahne|fahnedaag|malen|mole", [
        "Fahne mole, Choreo baue – das isch Kurve-Handwärk! Ych bi dr Erscht mit em Pinsel, verreckt!",
        "Wenn d Choreo uffgoht, laufe mir jedes Mol d Auge über. Alli go hälfe, ihr fuule Säck!",
    ]),
    (r"saal|film|fescht|fest|party|apéro|bar", [
        "Im Saal mit dr ganze Kurve – Bier, Gschichte und Gänsehut. Do bi n ych, klar wie Chlosterbrüe!",
        "E Obe mit dr Kurve isch besser als jedi Fasnacht – und das sag ych als Basler, gopfertelli!",
    ]),
    (r"dehai|heimspiel|joggeli|rotblau.?gass", [
        "Heimspiel! S Joggeli wird bebe, und ych bi heiser bis am Mäntig!",
        "Rotblau Gass, Kurve voll, Stimm wäg – so mues es sy, verreckt nomol!",
    ]),
]
# Reaktionen auf Gerüchte
RUMOR_REACTIONS = [
    "Grücht, Grücht … mi Bluetdruck goht scho wieder uffe! Wenn dä goht, denn nur für e Huufe Stutz!",
    "Jo spinnsch?! Wenn die üsi Beschte wäggchaufe wänn, denn sölle si zahle, bis es chlöpft!",
    "Ych glaub s erscht, wenn s unterschriibe isch. Bis denn: Gschnorr – aber spannends Gschnorr!",
    "Gopferdammi, immer die Grüchtchuchi! Ych ha jetzt scho Ranzepfyffe, und d Wuche isch no lang!",
]

# Dämliche Sprüche über Züri (über die Stadt und ihre Klubs, nie über einzelne Personen)
ZUERI = [
    "Wisst ihr, was s Schönschte an Züri isch? D Autobahn uf Basel. Gopferdammi, isch die schön!",
    "In Züri hän si e Bahnhofstross us Gold – und trotzdäm kai Titel im Schaufänschter. Hahaha!",
    "E Zürcher het mi hüt gfrogt, wo s Joggeli syg. Ych ha gsait: Dört, wo d Pokal sinn. Er isch nie aacho.",
    "Was isch dr Unterschid zwüsche Züri und eme Kühlschrank? Im Kühlschrank isch wenigschtens ebbis Guets drin.",
    "Z Züri sait me «Grüezi», z Basel sait me «HOPP FCB!» – und das tönt eifach besser, verreckt!",
    "D Zürcher mache am Sächsilüte e Böögg aa, für z luege, wie dr Summer wird. Mir luege uf d Tabälle, das isch gnau.",
    "Ych bi mol uf Züri gfahre. Dr Uetliberg isch so flach wie ihri Fangsäng. Ych bi grad wieder hai.",
    "Weisch, warum d Zürcher so schnäll laufe? Si hoffe, si chöme vor em Gegetor no hai. Hahaha, gopferdammi!",
    "Dr Zürisee isch schön, das muess me lo. Schad, dass er in Züri isch.",
    "Zwai Zürcher Klubs, ai Stadt – und glych isch d Kurve bi uns lüter. Mathematik, Kolleeg!",
]

GENERIC = [
    "Ych waiss nit, öb ych lache oder brüele söll – aber s Härz brennt rotblau, gopferdammi!",
    "Ohni Seich: Am Wuchenänd zellt nur, was uf em Rase passiert. Alles anderi isch Gschnorr!",
    "Das macht mi so hibbelig, dass ych hüt z Nacht kai Aug zuemach. Hopp jetzt!",
    "Ych läs das und dänk: Jä nu, Hauptsach dr FCB isch im Gspröch – und mir in dr Kurve!",
]


def shout(text, rnd):
    """Ab und zu kocht Dani ganz über: dann brüllt er den Satz."""
    return text.upper() if rnd.random() < 0.25 else text


def day_text(iso):
    """"2026-11-24T18:00:00+00:00" -> "Di 24.11." (Schweizer Zeit)."""
    try:
        dt = datetime.fromisoformat(iso).astimezone(ZoneInfo("Europe/Zurich"))
    except (TypeError, ValueError):
        return ""
    return f"{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][dt.weekday()]} {dt:%d.%m.}"


def quoted(title):
    """Schlagzeile in «»; ist sie schon ganz in Anführungszeichen, nicht doppelt."""
    m = re.fullmatch(r'\s*[«"“„]([^«»"“”„]*)[»"”“]\s*', title)
    return f"«{m[1] if m else title.strip()}»"


def facts(item):
    """Quelle und Datum einer Meldung: "(SRF, Di 24.11.)"."""
    parts = [p for p in (item.get("source"), day_text(item.get("published") or "")) if p]
    return f" ({', '.join(parts)})" if parts else ""


def expert_comment(news, today, kurve=(), rumors=()):
    rnd = random.Random(today.isoformat())  # gleicher Kommentar den ganzen Tag
    lines = [rnd.choice(INTROS)]
    news = [n for n in news if not VIOLENCE.search(n["title"])]
    used = set()

    def fresh_choice(pool):
        """Zufällige Reaktion, aber nie zweimal dieselbe im selben Kommentar."""
        choice = rnd.choice([r for r in pool if r not in used] or pool)
        used.add(choice)
        return choice

    for item in news[:2]:
        mood, pool = next(((m, r) for pattern, m, r in REACTIONS if re.search(pattern, item["title"], re.I)),
                          ("neutral", GENERIC))
        reaction = fresh_choice(pool)
        tail = f" {fresh_choice(NACHSAETZE[mood])}" if rnd.random() < 0.7 else ""
        shouts = [fresh_choice(AUSRUFE[mood]) for _ in range(2 if rnd.random() < 0.4 else 1)]
        lines.append(f"{' '.join(shouts)} {quoted(item['title'])} – {shout(reaction, rnd)}{tail}")
    # Etwa jeden dritten Tag verliert sich Dani in einem wirren Gedanken
    if news and rnd.random() < 0.35:
        lines.append(f"… {rnd.choice(KAFKA)}")
    if not news:
        lines.append("Hüt isch s ruhig um dr FCB. Viel z ruhig, gopferdammi – ych halt das nit us, ych bruuch Fuessball!")
    # Kurve: immer mit Fakten aus der aktuellen Ankündigung (Quelle, Datum, Inhalt), nie wirr
    # Nur Ankündigungen der letzten 6 Tage (ältere betreffen meist schon vergangene Spiele)
    fresh = [k for k in kurve if (today - datetime.fromisoformat(k["published"]).date()).days < 6]
    for item in fresh[:1]:
        # Reaktion zuerst nach dem Titel wählen ("Luzärn Dehai" = Heimspiel), erst dann nach dem Text
        reaction = next((rnd.choice(r) for text in (item["title"], item.get("text", ""))
                         for pattern, r in KURVE_REACTIONS if re.search(pattern, text, re.I)),
                        "Läsed das, ihr Bebbi, und denn alli derby!")
        detail = item.get("text", "")
        if detail.lower().startswith(item["title"].lower()):
            detail = detail[len(item["title"]):].lstrip(" .!:–-")  # Titel nicht doppelt
        first = re.split(r"(?<=[.!?])\s", detail)[0][:160] if detail else ""
        detail = f" {first}" if first else ""
        lines.append(f"📣 Us dr Kurve{facts(item)}: {quoted(item['title'])}{detail} – {reaction}")
    # Ein dämlicher Spruch über Züri: immer, wenn eine Schlagzeile Zürich erwähnt, sonst jeden zweiten Tag
    if any(re.search(r"zürich|zürcher|fcz|\bgc\b|grasshopper", n["title"], re.I) for n in news[:2]) or rnd.random() < 0.5:
        lines.append(f"🙄 Apropos Züri: {fresh_choice(ZUERI)}")
    for item in list(rumors)[:2]:
        lines.append(f"🍲 Grüchtchuchi: {quoted(item['title'])} – {fresh_choice(RUMOR_REACTIONS)}")
    lines.append(rnd.choice(OUTROS))
    return {**EXPERT, "lines": lines}


CLUBS = {"zürich": "fcz", "fcz": "fcz", "grasshoppers": "gc", "young boys": "yb", "st. gallen": "st. gallen",
         "luzern": "luzern", "lugano": "lugano", "servette": "servette", "lausanne": "lausanne", "sion": "sion",
         "winterthur": "winterthur", "thun": "thun"}


def chat_topics(news, rumors, squad, today):
    """Für den Chat mit Dani: Stichworte (Spieler, Gegner) aus den Schlagzeilen und dazu passende
    Reaktionen aus den Bausteinen oben. Fragt man im Chat nach einem der Wörter, antwortet Dani darauf."""
    rnd = random.Random(f"chat-{today.isoformat()}")
    surnames = {}
    for group in (squad or {}).get("groups", []):
        for player in group["players"]:
            last = player["name"].split()[-1]
            if len(last) >= 4:
                surnames[last.lower()] = last
    topics = []
    seen = set()
    for item, rumor in [(n, False) for n in news[:5]] + [(r, True) for r in list(rumors)[:3]]:
        title = item["title"]
        if VIOLENCE.search(title) or title in seen:
            continue
        seen.add(title)
        low = title.lower()
        words = [w for w in surnames if re.search(rf"\b{re.escape(w)}\b", low)]
        words += [short for name, short in CLUBS.items() if name in low and short not in words]
        if not words:
            continue
        if rumor:
            mood, pool = "neutral", RUMOR_REACTIONS
        else:
            mood, pool = next(((m, r) for pattern, m, r in REACTIONS if re.search(pattern, title, re.I)),
                              ("neutral", GENERIC))
        # Im Chat immer mit Fakten: Quelle und Datum der Meldung, nie wirr
        answers = [f"{rnd.choice(AUSRUFE[mood])} {quoted(title)}{facts(item)} – {reaction}"
                   for reaction in rnd.sample(pool, min(3, len(pool)))]
        topics.append({"title": title, "words": words[:4], "answers": answers})
    return topics


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
    data["chat"] = chat_topics(data["news"], data["rumors"], data.get("squad"), datetime.now(timezone.utc).date())
    print(f"Chat-Themen: {len(data['chat'])}")
    for c in data["chat"]:
        print(f"  - {', '.join(c['words'])}: {c['title']}")
    data["expert"] = expert_comment(data["news"], datetime.now(timezone.utc).date(), data["kurve"], data["rumors"])
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
