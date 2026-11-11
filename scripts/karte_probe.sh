#!/bin/bash
cd /tmp && npm i playwright@1.49 >/dev/null 2>&1 && npx playwright install chromium 2>&1 | tail -1
cat > /tmp/p.js <<'JS'
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, geolocation: { latitude: 47.551, longitude: 7.536 }, permissions: ['geolocation'], serviceWorkers: 'block' });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  const st = {};
  p.on('response', r => { const k = new URL(r.url()).host + ' ' + r.status(); st[k] = (st[k] || 0) + 1; });
  await p.goto('https://8syfkhz4wy-cloud.github.io/Weather-App/?t=' + Date.now()); await p.waitForTimeout(4000);
  await p.locator('.tabbar [data-tab=radar]').click(); await p.waitForTimeout(12000);
  console.log(JSON.stringify(st));
  console.log(await p.evaluate(() => [document.querySelector('#place').textContent, document.querySelector('#radar-msg').textContent, document.querySelector('#radar-time').textContent, document.querySelector('#version') && document.querySelector('#version').textContent].join(' | ')));
  await p.screenshot({ path: '/tmp/a.jpg', type: 'jpeg', quality: 45 });
  await p.evaluate(() => showFrame(radar.layers.length - 1)); await p.waitForTimeout(4000);
  await p.locator('.leaflet-control-zoom-in').click(); await p.locator('.leaflet-control-zoom-in').click(); await p.waitForTimeout(7000);
  await p.screenshot({ path: '/tmp/b.jpg', type: 'jpeg', quality: 45 });
  await b.close();
})();
JS
node /tmp/p.js
for f in a.jpg b.jpg; do echo "== $f"; base64 -w0 /tmp/$f; echo; done
