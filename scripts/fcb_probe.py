import json, re, urllib.request
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (wetter-psalm-app)"})
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
def nextdata(h):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    return json.loads(m.group(1)) if m else None
def walk(o, path="", out=None, depth=0):
    out = out if out is not None else []
    if depth > 7: return out
    if isinstance(o, dict):
        for k, v in o.items():
            p = f"{path}.{k}"
            if re.search(r"lineup|starting|formation|match|fixture|game|result|score|player|squad", k, re.I):
                out.append((p, type(v).__name__, (len(v) if isinstance(v, (list, dict)) else str(v)[:60])))
            walk(v, p, out, depth + 1)
    elif isinstance(o, list) and o:
        walk(o[0], path + "[0]", out, depth + 1)
    return out
for slug in ["fc-basel-1893", "fc-bale-1893"]:
    for lang in ["", "/de"]:
        u = f"https://www.sfl.ch{lang}/teams/{slug}"
        try:
            h = get(u); d = nextdata(h)
            print(f"\n== {u} {len(h)} nextdata={bool(d)}")
            if d:
                pp = d.get("props", {}).get("pageProps", {})
                print("pageProps keys:", list(pp.keys())[:30])
                for row in walk(pp)[:60]: print("  ", row)
            links = sorted(set(re.findall(r'href="(/[^"#]*)"', h)))
            print("links:", [l for l in links if re.search(r"match|spiel|game|fixture|player|spieler", l, re.I)][:30])
        except Exception as e:
            print(f"\n== FAIL {u}: {e}")
