import json, re, urllib.request
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
def nd(h):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    return json.loads(m.group(1)) if m else None
h = get("https://sfl.ch/calendar/calendrier-superleague?week=13")
d = nd(h); pp = d["props"]["pageProps"] if d else {}
print("calendar pageProps keys:", list(pp.keys()))
s = json.dumps(pp)
print("len", len(s), "bale idx", s.find("Bâle"), s.find("Basel"))
links = sorted(set(re.findall(r'href="(/[^"#]*)"', h)))
print("links:", [l for l in links if re.search(r"match|game|calendar", l)][:30])
ids = re.findall(r'"(?:matchId|gameId|id)":"?([A-Za-z0-9\-]{6,})', s)[:10]
print("ids:", ids)
i = s.find("Bâle"); print(s[max(0, i-600):i+400])
for l in [l for l in links if re.search(r"match", l)][:2]:
    hh = get("https://sfl.ch" + l); dd = nd(hh)
    ss = json.dumps(dd["props"]["pageProps"]) if dd else ""
    print("\n== match page", l, len(hh), "nextdata", bool(dd), "keys", list(dd["props"]["pageProps"].keys()) if dd else None)
    for kw in ["lineup", "formation", "starting", "shirt"]:
        j = ss.find(kw); print(" ", kw, j, ss[max(0,j-100):j+200] if j >= 0 else "")
