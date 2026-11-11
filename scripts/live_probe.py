import json, re, urllib.request, urllib.parse
UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1"}
def get(u, raw=False, n=None):
    req = urllib.request.Request(u, headers=UA)
    r = urllib.request.urlopen(req, timeout=25)
    b = r.read()
    return (r.status, r.geturl(), b) if raw else b.decode("utf-8", "replace")
def show(label, u, n=700):
    try:
        st, final, b = get(u, raw=True)
        t = b.decode("utf-8", "replace")
        print(f"\n== OK {label} [{st}] {len(b)}B final={final[:120]}\n{re.sub(r'\\s+', ' ', t)[:n]}")
        return t
    except Exception as e:
        print(f"\n== FAIL {label}: {e}")
# Links der App
for l, u in [("btn srf", "https://www.srf.ch/sport/fussball/super-league"), ("btn blick", "https://www.blick.ch/sport/fussball/super-league/"), ("btn fcb", "https://www.fcb.ch"), ("sfl team", "https://www.sfl.ch/teams/fc-bale-1893")]:
    show(l, u, 120)
# Google-News-Link folgen
try:
    x = get("https://news.google.com/rss/search?q=%22FC+Basel%22+when:2d&hl=de&gl=CH&ceid=CH:de")
    link = re.search(r"<item>.*?<link>([^<]+)</link>", x, re.S).group(1)
    print("\nGN link:", link[:150]); show("GN follow", link, 400)
except Exception as e: print("GN fail", e)
# Teletext
for p in [200, 201, 202, 203, 204, 205, 206, 207, 208, 210, 211, 212, 220, 221, 222, 230, 231]:
    try:
        d = json.loads(get(f"https://api.teletext.ch/channels/SRF1/pages/{p}"))
        subs = d.get("subpages", [])
        txt = " | ".join(re.sub(r"\s+", " ", s.get("ep1Info", {}).get("contentText", "") or "")[:260] for s in subs[:3])
        print(f"\nTT {p} subs={len(subs)} keys={list(d.keys())[:8]} :: {txt[:700]}")
    except Exception as e: print(f"TT {p} fail {e}")
# OpenLigaDB
try:
    ls = json.loads(get("https://api.openligadb.de/getavailableleagues"))
    print("\nOLDB:", [(l["leagueShortcut"], l["leagueName"], l["leagueSeason"]) for l in ls if re.search(r"schweiz|swiss|super league", l["leagueName"], re.I)][-12:])
except Exception as e: print("OLDB fail", e)
# Sofascore
show("sofa search", "https://api.sofascore.com/api/v1/search/teams?q=basel", 300)
show("sofa app", "https://www.sofascore.com/api/v1/search/teams?q=basel", 300)
# Direkte Feeds
for l, u in [("bz fcb", "https://www.bzbasel.ch/sport/fcb.rss"), ("bz sport", "https://www.bzbasel.ch/sport.rss"), ("nau", "https://www.nau.ch/sport/fussball.rss"), ("fcb atom", "https://www.fcb.ch/blogs/news.atom"), ("baz", "https://www.bazonline.ch/sport/fc-basel.rss"), ("20min", "https://partner-feeds.20min.ch/rss/20minuten/sport"), ("watson", "https://www.watson.ch/api/2.0/rss/index.xml?tag=FC%20Basel"), ("telebasel", "https://telebasel.ch/feed"), ("sport.de", "https://www.sport.de/fussball/te1304/fc-basel/"), ("weltfussball", "https://www.weltfussball.com/teams/fc-basel/"), ("srf rc", "https://www.srf.ch/sport/resultcenter/results#/results/football")]:
    show(l, u, 260)
