import json, re, urllib.request
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
urls = []
for sm in ["https://sfl.ch/server-sitemap.xml", "https://sfl.ch/sitemap.xml"]:
    try:
        x = get(sm); locs = re.findall(r"<loc>([^<]+)</loc>", x)
        print(f"== {sm}: {len(locs)} urls; examples:", locs[:5])
        urls += locs
    except Exception as e: print("fail", sm, e)
# Unter-Sitemaps
for u in [u for u in urls if u.endswith(".xml")][:10]:
    try:
        locs = re.findall(r"<loc>([^<]+)</loc>", get(u)); print(f"== {u}: {len(locs)}", locs[:3]); urls += locs
    except Exception as e: print("fail", u, e)
mc = [u for u in urls if "match-center" in u]
print("match-center urls:", len(mc))
bale = [u for u in mc if re.search(r"bale|basel", u)]
print("basel:", bale[-8:])
for u in (bale[-2:] or mc[-1:]):
    try:
        h = get(u)
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
        print("\n== page", u, len(h), "nextdata", bool(m))
        if m:
            d = json.loads(m.group(1)); pp = d["props"]["pageProps"]
            print("pageProps keys:", list(pp.keys()))
            s = json.dumps(pp)
            for kw in ["lineup", "Lineup", "formation", "starting", "substitute", "shirtNumber", "jersey"]:
                i = s.find(kw); print(f"  {kw}: {i}", s[max(0,i-150):i+250] if i >= 0 else "")
    except Exception as e: print("fail page", u, e)
