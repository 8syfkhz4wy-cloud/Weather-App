import json, re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1"}
def req(u, h=None):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={**UA, **(h or {})}), timeout=25)
    return r, r.read()
# CORS?
try:
    r, b = req("https://api.teletext.ch/channels/SRF1/pages/202", {"Origin": "https://8syfkhz4wy-cloud.github.io"})
    print("CORS:", r.headers.get("Access-Control-Allow-Origin"), "| cache:", r.headers.get("Cache-Control"), "| type:", r.headers.get("Content-Type"))
    d = json.loads(b); sp = d["subpages"][0]
    print("subpage keys:", list(sp.keys())); print("ep1Info keys:", list(sp.get("ep1Info", {}).keys()))
    print("RAW 202:\n" + (sp["ep1Info"].get("contentText") or ""))
    print("meta:", json.dumps(d.get("metaData"))[:300])
except Exception as e: print("tt fail", e)
def page(p):
    try:
        _, b = req(f"https://api.teletext.ch/channels/SRF1/pages/{p}")
        return [s.get("ep1Info", {}).get("contentText") or "" for s in json.loads(b).get("subpages", [])]
    except Exception as e:
        return []
for p in [205, 209, 216, 217]:
    for i, t in enumerate(page(p)[:2]): print(f"\n--- RAW {p}/{i}\n{t}")
shown = 0
for p in list(range(233, 252)) + list(range(300, 345)):
    for i, t in enumerate(page(p)):
        if re.search(r"\bTore?\b|Rot|Gelb", t) and shown < 6:
            shown += 1; print(f"\n--- TELEGRAMM {p}/{i}\n{t}")
# Ortsname Allschwil
for lat, lon in [(47.551, 7.536), (47.5596, 7.5886), (47.52, 7.55)]:
    try:
        _, b = req(f"https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lon}&localityLanguage=de")
        r = json.loads(b)
        adm = [(a.get("name"), a.get("adminLevel"), a.get("order")) for a in r.get("localityInfo", {}).get("administrative", [])]
        print(f"\nBDC {lat},{lon}: city={r.get('city')!r} locality={r.get('locality')!r} adm={adm}")
    except Exception as e: print("bdc fail", e)
# Blick-Knopf und Feeds
for u in ["https://www.blick.ch/sport/fussball/superleague/", "https://www.blick.ch/sport/fussball/", "https://www.blick.ch/sport/fussball/superleague/fc-basel/", "https://www.srf.ch/sport/fussball/super-league", "https://www.srf.ch/sport/resultcenter/results#/results/football", "https://www.teletext.ch/SRF1/202"]:
    try:
        r, b = req(u); print("OK ", r.status, u)
    except Exception as e: print("FAIL", u, e)
try:
    _, b = req("https://www.watson.ch/api/2.0/rss/index.xml?tag=FC%20Basel")
    t = b.decode("utf-8", "replace")
    for e in re.findall(r"<entry>(.*?)</entry>", t, re.S)[:4]:
        print("watson:", re.search(r"<title[^>]*>(.*?)</title>", e, re.S).group(1)[:90], "|", re.search(r'<link[^>]*href="([^"]+)"', e).group(1)[:90], "|", (re.search(r"<(?:updated|published)>([^<]+)", e) or [0, ""])[1])
    _, b = req("https://fcb.ch/blogs/news.atom"); print("fcb atom:", b.decode()[:544])
except Exception as e: print("feed fail", e)
