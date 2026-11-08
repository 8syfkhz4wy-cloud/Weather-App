import re, urllib.request, xml.etree.ElementTree as ET
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
for u in ["https://www.muttenzerkurve.ch/", "https://muttenzerkurve.ch/", "https://www.muttenzerkurve.ch/feed", "https://muttenzerkurve.ch/feed/", "https://www.muttenzerkurve.ch/rss"]:
    try:
        h = get(u); print(f"\n== OK {u} {len(h)}")
        print(re.sub(r"\s+", " ", re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S))[:1500])
        print("links:", sorted(set(re.findall(r'href="([^"]+)"', h)))[:50])
    except Exception as e: print(f"\n== FAIL {u}: {e}")
for q in ["Muttenzerkurve", "%22FC+Basel%22+Gerücht", "%22FC+Basel%22+Transfer+Interesse", "FCB+Gerüchteküche"]:
    u = f"https://news.google.com/rss/search?q={q}+when:7d&hl=de&gl=CH&ceid=CH:de"
    try:
        items = ET.fromstring(get(u).encode()).findall(".//item")
        print(f"\n== GN {q}: {len(items)}")
        for it in items[:8]: print("  -", it.findtext("title"), "|", it.findtext("pubDate"))
    except Exception as e: print(f"\n== FAIL GN {q}: {e}")
