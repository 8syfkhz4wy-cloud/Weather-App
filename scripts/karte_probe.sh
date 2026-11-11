#!/bin/bash
UA="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
REF="https://8syfkhz4wy-cloud.github.io/"
get() { curl -s -o "/tmp/$1" -m 25 -A "$UA" -e "$REF" -w "%{http_code} %{content_type} %{size_download}B $2\n" "$2"; }
get carto.png "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/8/133/89@2x.png"
curl -s -m 20 https://api.rainviewer.com/public/weather-maps.json -o /tmp/rv.json
P=$(python3 -c "import json;d=json.load(open('/tmp/rv.json'));print(d['host']+d['radar']['past'][-1]['path'])")
get rv7.png "$P/256/7/66/44/2/1_1.png"
get rv6.png "$P/256/6/33/22/2/1_1.png"
get rv8.png "$P/256/8/133/89/2/1_1.png"
for l in ch.swisstopo.pixelkarte-farbe ch.swisstopo.pixelkarte-grau; do
  get st.jpg "https://wmts.geo.admin.ch/1.0.0/$l/default/current/3857/8/133/89.jpeg"
  get st.jpg "https://wmts.geo.admin.ch/1.0.0/$l/default/current/3857/7/66/45.jpeg"
  get st.jpg "https://wmts.geo.admin.ch/1.0.0/$l/default/current/3857/6/32/21.jpeg"
done
get lb.png "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.leichte-basiskarte_reliefschattierung/default/current/3857/8/133/89.png"
get dwd.png "https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.1.1&request=GetMap&layers=dwd:Niederschlagsradar&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox=782715,5948635,939258,6105178"
get dwdcap.xml "https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.3.0&request=GetCapabilities"
grep -o "<Name>[^<]*\(adar\|RADOLAN\|RV\|WN\)[^<]*</Name>" /tmp/dwdcap.xml | sort -u | head -40
grep -A25 "<Name>Niederschlagsradar</Name>" /tmp/dwdcap.xml | grep -i -A8 "Dimension\|BoundingBox" | head -30
get mch.json "https://www.meteoschweiz.admin.ch/product/output/radar/rzc/radar_rzc.json"
head -c 400 /tmp/mch.json; echo
for f in carto.png rv7.png rv6.png rv8.png dwd.png; do echo "== $f"; base64 -w0 /tmp/$f; echo; done
