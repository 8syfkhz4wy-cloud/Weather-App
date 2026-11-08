import re, urllib.request
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
print("== robots.txt\n", get("https://www.sfl.ch/robots.txt")[:3000])
h = get("https://www.sfl.ch/teams/fc-basel-1893")
scripts = sorted(set(re.findall(r'src="(/_next/static/[^"]+\.js)"', h)))
print("scripts:", len(scripts))
found = set()
for s in scripts:
    try:
        js = get("https://www.sfl.ch" + s)
    except Exception as e:
        continue
    for m in re.findall(r'https?://[a-zA-Z0-9.\-]+(?:/[a-zA-Z0-9_\-./{}$:]*)?', js):
        if re.search(r"api|origins|sportlab|feed|data|match|lineup", m, re.I) and "w3.org" not in m:
            found.add(m)
    for m in re.findall(r'["\'`](/[a-zA-Z0-9_\-/{}$:.]*(?:lineup|match|fixture|game|squad|event)[a-zA-Z0-9_\-/{}$:.]*)["\'`]', js, re.I):
        found.add(m)
for f in sorted(found)[:120]: print(f)
