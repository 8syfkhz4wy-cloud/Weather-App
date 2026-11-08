#!/usr/bin/env python3
"""Erzeugt fcb.json für den FC-Basel-Bereich der App.

- Kader: Wikipedia-Artikel "FC Basel", Abschnitt "Die 1. Mannschaft" (CC BY-SA)
- News: Google News (Suche "FC Basel") und Blick-Fussballfeed, nur Männerfussball
- Kurven-Experte: eine fiktive Figur, die die echten Meldungen auf Baseldeutsch
  kommentiert (regelbasiert aus Vorlagen, keine erfundenen Fakten)

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


# ---------- Fiktiver Kurven-Experte ----------

EXPERT = {
    "name": "Dani «Joggeli» Meier",
    "bio": "Fiktive Figur · steht seit 1998 in der Muttenzerkurve",
}

INTROS = ["Salü zämme!", "Hoi mitenand!", "Grüessech us dr Kurve!", "So, Basler, losed zue!",
          "Guete Morge, Rotblau-Familie!"]
OUTROS = ["Allez FCB! ❤️💙", "Rotblau für immer! ❤️💙", "Mir gseh is im Joggeli – allez! ❤️💙",
          "Hopp FCB! ❤️💙", "Zäme sind mir Basel. ❤️💙"]

# (Muster in der Schlagzeile, Reaktionen) – leidenschaftlich, aber fair und ohne Gewalt
REACTIONS = [
    (r"verletz|ausfall|fällt.*aus|operation|knie|muskel", [
        "Das tuet weh. Gueti Besserig – d Kurve wartet uf di!",
        "Verletzige sind s Gift vo jedere Saison. Chunnt guet, mir hän e breite Kader.",
    ]),
    (r"sieg|gewinnt|gewonnen|siegt|schlägt|triumph|dreier", [
        "So wämmers ha! Drei Pünkt und e Kurve, wo bis zum Schluss gsunge het.",
        "Das isch Basel, wie mirs gärn hän: Härz, Tempo und Tor!",
    ]),
    (r"niederlage|verliert|verloren|pleite|blamage|unterliegt", [
        "Nach some Spiel bisch zerscht still. Aber mir stöhn hinter dr Mannschaft – grad jetzt.",
        "Chopf ufe, Jungs. E Niederlag isch kei Weltundergang, nume Motivation fürs nächste Mol.",
    ]),
    (r"remis|unentschieden|punkt|torlos|1:1|2:2|0:0", [
        "E Punkt isch e Punkt – aber mir wänn meh. S nächscht Mol bitte mit Dreier!",
        "Unentschiede fühlt sich immer chli a wie lauwarme Kaffi. Witer!",
    ]),
    (r"trainer|coach|entlass|freigestellt", [
        "Trainerfrog? Ich sag nur: Ruhe bewahre und dr Mannschaft Zyt gä.",
        "Wenn über dr Trainer gredet wird, isch s Wichtigscht: Zämehebe in dr Kurve.",
    ]),
    (r"transfer|wechsel|verpflicht|vertrag|verlänger|leihe|ablöse", [
        "Transfergrücht! Ich bi gspannt – Hauptsach, s Härz schlot rotblau.",
        "Neui Gsichter sind immer spannend. Willkomme, wenns klappt!",
    ]),
    (r"fans|kurve|stimmung|choreo|zuschauer|stadion|joggeli", [
        "D Kurve isch s Härz vom Verein – friedlich, luut und rotblau. So mues es sy.",
        "Wenn s Joggeli bebt, denn spürsch, was Basel bedütet.",
    ]),
    (r"zürich|fcz|gc\b|grasshopper|young boys|\byb\b", [
        "Spitzespiel! Respekt für dr Gegner – aber am Schluss zähle nur rotblaui Pünkt.",
        "Gege die wämmer immer gwinne. Fair, aber mit volle Härz!",
    ]),
]
GENERIC = [
    "Spannendi Gschicht. Ich bi gspannt, wies witer goht.",
    "Für mi isch klar: Am Wuchenänd zählt nur, was uf em Platz passiert.",
    "Mir verfolge das in dr Kurve ganz genau.",
]


def expert_comment(news, today):
    rnd = random.Random(today.isoformat())  # gleicher Kommentar den ganzen Tag
    lines = [rnd.choice(INTROS)]
    for item in news[:3]:
        reaction = next((rnd.choice(r) for pattern, r in REACTIONS if re.search(pattern, item["title"], re.I)),
                        rnd.choice(GENERIC))
        lines.append(f"«{item['title']}» – {reaction}")
    if not news:
        lines.append("Hüt isch s ruhig um dr FCB. Zyt zum d Schal wäsche und Lieder üebe.")
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
    data["expert"] = expert_comment(data["news"], datetime.now(timezone.utc).date())
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
