import json, urllib.request, urllib.parse
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "wetter-psalm-app/1.0 (github.com/8syfkhz4wy-cloud/Weather-App)"})
    return urllib.request.urlopen(req, timeout=25).read()
def show(label, u, n=1500):
    try:
        d = get(u); print(f"\n== OK {label} ({len(d)} B)\n{d[:n].decode('utf-8','replace')}")
        return d
    except Exception as e:
        print(f"\n== FAIL {label}: {e}")
B = "https://www.thesportsdb.com/api/v1/json/3"
d = show("TSDB search", f"{B}/searchteams.php?t=Basel", 600)
tid = None
try:
    for t in json.loads(d)["teams"] or []:
        print("  team:", t["idTeam"], t["strTeam"], t.get("strSport"), t.get("strLeague"))
        if t.get("strSport") == "Soccer" and "Basel" in t["strTeam"] and not tid: tid = t["idTeam"]
except Exception as e: print(e)
if tid:
    show("TSDB last", f"{B}/eventslast.php?id={tid}", 1200)
    show("TSDB next", f"{B}/eventsnext.php?id={tid}", 800)
    show("TSDB players", f"{B}/lookup_all_players.php?id={tid}", 800)
    try:
        ev = json.loads(get(f"{B}/eventslast.php?id={tid}"))["results"][0]["idEvent"]
        show("TSDB lineup", f"{B}/lookuplineup.php?id={ev}", 1200)
    except Exception as e: print("lineup err", e)
W = "https://de.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action":"parse","page":"FC Basel","prop":"sections","format":"json"})
d = show("Wiki sections", W, 200)
try:
    for s in json.loads(d)["parse"]["sections"]:
        if any(k in s["line"] for k in ("Kader","Mannschaft","Team")): print("  section", s["index"], s["line"])
except Exception as e: print(e)
show("Google News FCB", "https://news.google.com/rss/search?q=%22FC+Basel%22&hl=de&gl=CH&ceid=CH:de", 900)
show("fcb.ch", "https://www.fcb.ch/", 300)
show("SFL", "https://www.sfl.ch/", 300)
