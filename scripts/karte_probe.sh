#!/bin/bash
UA="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
REF="https://8syfkhz4wy-cloud.github.io/"
for u in \
 "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/8/133/89@2x.png" \
 "https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/8/133/89@2x.png" \
 "https://a.basemaps.cartocdn.com/dark_all/8/133/89@2x.png" \
 "https://tile.openstreetmap.org/8/133/89.png" \
 "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" \
 "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" \
 "https://api.rainviewer.com/public/weather-maps.json"; do
  curl -s -o /tmp/out -m 20 -A "$UA" -e "$REF" -H "Origin: https://8syfkhz4wy-cloud.github.io" -w "%{http_code} %{content_type} %{size_download}B $u\n" "$u"
done
cat /tmp/out | head -c 900; echo
HOST=$(python3 -c "import json;d=json.load(open('/tmp/out'));print(d['host'])")
P=$(python3 -c "import json;d=json.load(open('/tmp/out'));print(d['radar']['past'][-1]['path'])")
for z in "256/7/66/44/2/1_1.png" "256/8/133/89/2/1_1.png" "512/7/66/44/2/1_1.png"; do
  curl -s -o /dev/null -m 20 -A "$UA" -e "$REF" -w "%{http_code} %{content_type} %{size_download}B $HOST$P/$z\n" "$HOST$P/$z"
done
cd /tmp && npm i playwright@1.49 >/dev/null 2>&1 && npx playwright install --with-deps webkit >/dev/null 2>&1
cat > /tmp/p.js <<'JS'
const { webkit, devices } = require('playwright');
(async () => {
  const b = await webkit.launch();
  const c = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 47.551, longitude: 7.536 }, permissions: ['geolocation'] });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  p.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
  p.on('requestfailed', r => console.log('FAILED', r.url().slice(0, 110), r.failure() && r.failure().errorText));
  const st = {};
  p.on('response', r => { const h = new URL(r.url()).host; const k = h + ' ' + r.status(); st[k] = (st[k] || 0) + 1; });
  await p.goto('https://8syfkhz4wy-cloud.github.io/Weather-App/'); await p.waitForTimeout(4000);
  await p.locator('.tabbar [data-tab=radar]').click(); await p.waitForTimeout(8000);
  console.log(JSON.stringify(st, null, 1));
  console.log(await p.evaluate(() => JSON.stringify({ place: document.querySelector('#place').textContent, msg: document.querySelector('#radar-msg').textContent, map: document.querySelector('#map').getBoundingClientRect().height, tiles: [...document.querySelectorAll('#map img.leaflet-tile')].map(i => [i.src.split('/')[2], i.complete && i.naturalWidth, getComputedStyle(i).opacity, i.className.includes('loaded')].join(' ')).reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}), panes: [...document.querySelectorAll('#map .leaflet-pane')].map(e => e.className.replace('leaflet-pane', '').trim() + ':' + getComputedStyle(e).zIndex + ':' + e.querySelectorAll('img').length) })));
  await b.close();
})();
JS
node /tmp/p.js
