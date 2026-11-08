import json, urllib.request
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return json.loads(urllib.request.urlopen(req, timeout=25).read())
B = "https://site.api.espn.com/apis/site/v2/sports/soccer/sui.1"
try:
    teams = get(f"{B}/teams")["sports"][0]["leagues"][0]["teams"]
    tid = None
    for t in teams:
        t = t["team"]; print(t["id"], t["displayName"])
        if "Basel" in t["displayName"]: tid = t["id"]
    sched = get(f"{B}/teams/{tid}/schedule")
    evs = sched.get("events", [])
    print("events:", len(evs))
    done = [e for e in evs if e["competitions"][0]["status"]["type"]["completed"]]
    for e in evs[-3:] + done[-2:]:
        print(" ", e["id"], e["date"], e["name"], e["competitions"][0]["status"]["type"]["description"])
    if done:
        s = get(f"{B}/summary?event={done[-1]['id']}")
        print("summary keys:", list(s.keys()))
        for r in s.get("rosters", []):
            print("team:", r["team"]["displayName"], "formation:", r.get("formation"))
            for p in r.get("roster", [])[:14]:
                print("   ", p.get("starter"), p.get("jersey"), p["athlete"]["displayName"], p.get("position", {}).get("abbreviation"), p.get("formationPlace"))
except Exception as e:
    import traceback; traceback.print_exc()
