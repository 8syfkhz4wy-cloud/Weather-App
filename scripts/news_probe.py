import urllib.request, xml.etree.ElementTree as ET
URLS = [
 "https://news.google.com/rss/search?q=Fu%C3%9Fball&hl=de&gl=CH&ceid=CH:de",
 "https://news.google.com/rss/search?q=Fu%C3%9Fball%20international&hl=de&gl=CH&ceid=CH:de",
 "https://newsfeed.kicker.de/news/aktuell",
 "https://newsfeed.kicker.de/news/international",
 "https://newsfeed.kicker.de/news/fussball",
 "https://www.spiegel.de/sport/fussball/index.rss",
 "https://www.srf.ch/sport/bnf/rss/718",
 "https://www.srf.ch/news/bnf/rss/1890",
 "https://www.nzz.ch/sport/fussball.rss",
 "https://www.blick.ch/sport/fussball/rss.xml",
 "https://www.watson.ch/api/2.0/rss/index.xml?tag=Fussball",
 "https://www.transfermarkt.de/rss/news",
 "https://www.sport1.de/news.rss",
 "https://www.sportschau.de/fussball/index~rss2.xml",
 "https://www.tagesschau.de/sport/index~rss2.xml",
 "https://feeds.bbci.co.uk/sport/football/rss.xml",
 "https://www.11freunde.de/feed",
]
for u in URLS:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm)"})
        data = urllib.request.urlopen(req, timeout=20).read()
        root = ET.fromstring(data)
        items = root.findall(".//item")
        print(f"\n== OK {u} ({len(items)} items)")
        for it in items[:4]:
            t = (it.findtext("title") or "").strip()
            d = (it.findtext("pubDate") or "").strip()
            desc = (it.findtext("description") or "").strip().replace("\n", " ")[:120]
            enc = it.find("enclosure")
            print(f"  - {t} | {d} | img={'ja' if enc is not None or 'media' in ET.tostring(it, encoding='unicode') else 'nein'} | {desc}")
    except Exception as e:
        print(f"\n== FAIL {u}: {e}")
