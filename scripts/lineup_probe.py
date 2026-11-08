import json, urllib.request
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return json.loads(urllib.request.urlopen(req, timeout=25).read())
B = "https://site.api.espn.com/apis/site/v2/sports/soccer/sui.1"
for u in [f"{B}/teams/989/schedule?season=2026", f"{B}/teams/989/schedule?season=2027", f"{B}/scoreboard?dates=20261020-20261108", f"{B}/scoreboard"]:
    try:
        d = get(u); evs = d.get("events", [])
        print(f"\n== {u}: {len(evs)} events; season={d.get('season') or d.get('leagues',[{}])[0].get('season',{}).get('year')}")
        for e in evs[-6:]:
            c = e["competitions"][0]
            print("  ", e["id"], e["date"], e["name"], c["status"]["type"]["description"])
    except Exception as ex:
        print(f"\n== FAIL {u}: {ex}")
try:
    teams = get(f"{B}/teams")["sports"][0]["leagues"][0]["teams"]
    print([ (t["team"]["id"], t["team"]["displayName"]) for t in teams if "Basel" in t["team"]["displayName"]])
except Exception as ex: print(ex)
