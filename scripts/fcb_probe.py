import json, re, urllib.request, urllib.parse
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
# Wikipedia Kader
try:
    u = "https://de.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action":"parse","page":"FC Basel","prop":"wikitext","section":"25","format":"json"})
    wt = json.loads(get(u))["parse"]["wikitext"]["*"]
    print("== WIKI section 25 len", len(wt)); print(wt[:2500])
except Exception as e: print("wiki fail", e)
# kicker
for u in ["https://www.kicker.de/fc-basel/startseite", "https://www.kicker.de/fc-basel/kader", "https://www.kicker.de/fc-basel/spielplan", "https://www.kicker.de/super-league/spieltag"]:
    try:
        h = get(u); print(f"\n== OK {u} {len(h)}")
        links = sorted(set(re.findall(r'href="(/[^"]*basel[^"]*)"', h)))[:40]
        print("\n".join(links))
    except Exception as e: print(f"\n== FAIL {u}: {e}")
# SFL
try:
    h = get("https://www.sfl.ch/")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    print("\n== SFL next data:", bool(m))
    links = sorted(set(re.findall(r'href="(/[^"#]*)"', h)))
    print([l for l in links if re.search(r"match|spiel|club|team|basel|game", l, re.I)][:40])
except Exception as e: print("sfl fail", e)
