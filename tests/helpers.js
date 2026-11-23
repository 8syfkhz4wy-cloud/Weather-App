"use strict";

// Gemeinsame Hilfen für die Browser-Tests: kleiner Webserver für die App und
// nachgebaute Antworten aller externen Dienste. Die Tests brauchen kein Internet.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
};

// Liefert die Dateien des Repositorys aus (wie GitHub Pages)
function startServer() {
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (file.endsWith("/")) file += "index.html";
    const full = path.join(ROOT, path.normalize(file));
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Open-Meteo-Antwort mit 7 Tagen, relativ zur aktuellen Uhrzeit.
// opts: temp (Verschiebung), storm, hail, gust (Böen in km/h), snow (cm pro Stunde), cold (Temperatur fix)
function weather(opts = {}) {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(Math.floor(now.getMinutes() / 15) * 15);
  const day0 = new Date(now);
  day0.setHours(0, 0, 0, 0);
  const shift = opts.temp || 0;
  const keys = ["time", "temperature_2m", "weather_code", "precipitation_probability", "precipitation", "is_day", "wind_speed_10m",
    "wind_gusts_10m", "snowfall", "rain", "showers", "dew_point_2m", "visibility", "pressure_msl", "uv_index"];
  const h = Object.fromEntries(keys.map((k) => [k, []]));
  for (let i = 0; i < 7 * 24; i++) {
    const t = new Date(day0.getTime() + i * 3600e3);
    const hr = t.getHours();
    const wet = i % 9 === 0;
    h.time.push(iso(t));
    h.temperature_2m.push(opts.cold ?? 5 + shift + 6 * Math.sin(((hr - 9) / 24) * 2 * Math.PI));
    h.weather_code.push(opts.storm ? (opts.hail ? 96 : 95) : opts.snow ? 73 : wet ? 61 : 2);
    h.precipitation_probability.push((i * 13) % 100);
    h.precipitation.push(wet ? 1.2 : 0);
    h.is_day.push(hr >= 7 && hr < 17 ? 1 : 0);
    h.wind_speed_10m.push(10 + (i % 7));
    h.wind_gusts_10m.push(opts.gust ?? 25 + (i % 11));
    h.snowfall.push(opts.snow || 0);
    h.rain.push(wet ? 1.2 : 0);
    h.showers.push(0);
    h.dew_point_2m.push(2);
    h.visibility.push(24000);
    h.pressure_msl.push(1015 + i * 0.1);
    h.uv_index.push(hr > 8 && hr < 16 ? 1.5 : 0);
  }
  const m = { time: [], precipitation: [] };
  for (let i = 0; i < 96 * 3; i++) {
    m.time.push(iso(new Date(day0.getTime() + i * 900e3)));
    m.precipitation.push(i % 5 === 0 ? 0.3 : 0);
  }
  const dkeys = ["time", "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "precipitation_sum",
    "sunrise", "sunset", "uv_index_max", "wind_gusts_10m_max", "daylight_duration"];
  const d = Object.fromEntries(dkeys.map((k) => [k, []]));
  for (let i = 0; i < 7; i++) {
    const date = iso(new Date(day0.getTime() + i * 86400e3)).slice(0, 10);
    d.time.push(date);
    d.weather_code.push(3);
    d.temperature_2m_max.push(11 + shift);
    d.temperature_2m_min.push(-1 + shift);
    d.precipitation_probability_max.push(40);
    d.precipitation_sum.push(2);
    d.sunrise.push(`${date}T07:40`);
    d.sunset.push(`${date}T16:45`);
    d.uv_index_max.push(1.2);
    d.wind_gusts_10m_max.push(36);
    d.daylight_duration.push(9 * 3600 - 1); // 8 h 59,98 min: früher als "8 h 60 min" angezeigt
  }
  return {
    current: {
      time: iso(now), temperature_2m: 6 + shift, apparent_temperature: 3 + shift, relative_humidity_2m: 80, is_day: 1, weather_code: 3,
      wind_speed_10m: 12, wind_direction_10m: 240, wind_gusts_10m: 30, pressure_msl: 1016, cloud_cover: 90,
    },
    hourly: h,
    minutely_15: m,
    daily: d,
  };
}

const AIR = {
  current: { european_aqi: 25, pm2_5: 5, pm10: 9, ozone: 50, nitrogen_dioxide: 12, alder_pollen: 0, birch_pollen: 0, grass_pollen: 3, mugwort_pollen: 0, olive_pollen: null, ragweed_pollen: 0 },
};

const hoursFromNow = (h) => new Date(Date.now() + h * 3600e3).toISOString();

const NEWS = { title: "Testspiel endet unentschieden", url: "https://example.org/news", topic: "Champions League", emoji: "⚽", source: "Testquelle", teaser: "Ein Teaser.", published: hoursFromNow(-2) };

const gtaItem = (cat, n) => ({ title: `GTA-Artikel ${cat} ${n}`, url: `https://example.org/gta/${cat}/${n}`, category: cat, label: cat, emoji: "🎮", source: "Testmagazin", published: hoursFromNow(-5), teaser: "Teaser" });
const GTA = {
  focus: "cheats",
  top: gtaItem("cheats", 0),
  more: [gtaItem("tipps", 1), gtaItem("autos", 1)],
  cats: { tipps: [gtaItem("tipps", 1), gtaItem("tipps", 2)], cheats: [gtaItem("cheats", 0)], orte: [], autos: [gtaItem("autos", 1)], waffen: [], geld: [gtaItem("geld", 1)] },
};

const FCB = {
  updated: hoursFromNow(-1),
  news: [{ title: "FCB gewinnt Testspiel", url: "https://example.org/fcb/1", source: "SRF", published: hoursFromNow(-3) }, { title: "Neuer Trainer im Gespräch", url: "https://example.org/fcb/2", source: "Blick", published: hoursFromNow(-6) }],
  squad: {
    season: "2026/27", stand: "20.11.2026", url: "https://de.wikipedia.org/wiki/FC_Basel",
    groups: [{ group: "Tor", players: [{ name: "Marwin Hitz", nr: "1", since: "2023", from: "Borussia Dortmund" }] }, { group: "Sturm", players: [{ name: "Albian Ajeti", nr: "10", since: "2024", from: "eigene Jugend" }] }],
  },
  ticker: [{ title: "Basel – YB 2:1", url: "https://example.org/ticker", score: "2:1", source: "SRF", published: hoursFromNow(-20) }],
  kurve: [{ title: "Extrazug nach Bern", url: "https://example.org/kurve", source: "muttenzerkurve.ch", published: hoursFromNow(-30) }],
  rumors: [{ title: "Stürmer vor Wechsel?", url: "https://example.org/rumor", source: "Watson", published: hoursFromNow(-10) }],
  expert: { name: "Dani «Joggeli» Meier", bio: "Fiktiver Ultra", lines: ["Hopp FCB!"] },
  chat: [{ words: ["trainer"], answers: ["E neue Trainer? Ych bi gspannt!"] }],
};

const teletext = (text) => ({ subpages: [{ ep1Info: { contentText: text } }] });
// Kopfzeile wie beim SRF-Teletext: aktuelle Zeit in Schweizer Zeit
const ttStamp = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", hourCycle: "h23", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
};
const TELETEXT = {
  202: () => `FUSSBALL ${ttStamp()} Super League GC - Lugano 1:1 (0:0) Basel - YB 2:1 (1:0) Sion - Thun 0:0 (0:0)`,
  205: () => `FUSSBALL ${ttStamp()} Basel - YB 2:1 (1:0) St. Jakob-Park. 25000 Zuschauer. Tore: 12. Ajeti 1:0. 50. Monteiro 1:1. 88. Shaqiri 2:1. Bemerkungen: 75. Rote Karte gegen Muster.`,
  203: () => `FUSSBALL ${ttStamp()} Tabelle 1. Basel 15 10 3 2 30:12 33 2. YB 15 9 3 3 28:15 30 3. Lugano 15 8 3 4 22:17 27 4. Servette 15 7 4 4 20:18 25 5. Luzern 15 6 4 5 21:21 22 6. Zürich 15 5 5 5 18:19 20 7. St.Gallen 15 5 4 6 19:22 19 8. Sion 15 4 5 6 15:20 17 9. Thun 15 3 5 7 14:23 14 10. GC 15 2 4 9 11:29 10`,
  217: () => `FUSSBALL ${ttStamp()} Super League Lugano - Basel SA 18.00 Uhr`,
};

// Alle externen Anfragen auf nachgebaute Antworten lenken. Gibt Zähler und Schalter zurück.
async function mockNetwork(page, opts = {}) {
  const ctl = { forecastCalls: 0, failForecast: false, weather: opts.weather || {}, geocode: opts.geocode };
  await page.route(/api\.open-meteo\.com\/v1\/forecast/, (r) => {
    ctl.forecastCalls++;
    return ctl.failForecast ? r.abort() : r.fulfill({ json: weather(ctl.weather) });
  });
  await page.route(/air-quality-api\.open-meteo\.com/, (r) => r.fulfill({ json: AIR }));
  await page.route(/geocoding-api\.open-meteo\.com/, (r) =>
    r.fulfill({ json: { results: ctl.geocode || [{ name: "Zürich", admin1: "Zürich", country: "Schweiz", latitude: 47.3769, longitude: 8.5417 }] } }));
  await page.route(/api\.bigdatacloud\.net/, (r) => r.fulfill({ json: { city: "Allschwil", localityInfo: { administrative: [{ adminLevel: 8, name: "Allschwil" }] } } }));
  // opts.teletext: einzelne Seiten ersetzen, z. B. { 202: () => "… Basel - YB SA 18.00 Uhr" }
  const pages = { ...TELETEXT, ...(opts.teletext || {}) };
  await page.route(/api\.teletext\.ch\/channels\/SRF1\/pages\/(\d+)/, (r) => {
    const n = +r.request().url().match(/pages\/(\d+)/)[1];
    return pages[n] ? r.fulfill({ json: teletext(pages[n]()) }) : r.fulfill({ status: 404, body: "" });
  });
  // Karten und Radar: nicht nötig für die Tests, also ablehnen (die App muss damit umgehen)
  await page.route(/cdnjs\.cloudflare\.com|openstreetmap\.org|geo\.admin\.ch|dwd\.de|rainviewer\.com/, (r) => r.abort());
  // Dateien, die erst beim Veröffentlichen entstehen
  await page.route(/\/news\.json/, (r) => r.fulfill({ json: NEWS }));
  await page.route(/\/gta6\.json/, (r) => r.fulfill({ json: GTA }));
  await page.route(/\/fcb\.json/, (r) => r.fulfill({ json: FCB }));
  await page.route(/\/version\.json/, (r) => r.fulfill({ json: { version: "v9.9.9", date: new Date().toISOString(), title: "Testversion [ohne Nachricht] (#9)" } }));
  return ctl;
}

// Seite mit Fehlerprotokoll. Netzwerkfehler (abgelehnte Karten) zählen nicht als App-Fehler.
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

module.exports = { startServer, weather, mockNetwork, watchErrors, ttStamp, ROOT, FCB };
