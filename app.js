"use strict";

// ---------- Hilfsfunktionen ----------

const $ = (sel) => document.querySelector(sel);

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return null;
  }
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const round = (n) => Math.round(n);
const fmtTime = (iso) => iso.slice(11, 16);

// ---------- Wettercodes (WMO) ----------

// code: [Beschreibung, Symbol Tag, Symbol Nacht, Himmel]
const WMO = {
  0: ["Klar", "☀️", "🌙", "clear"],
  1: ["Überwiegend klar", "🌤️", "🌙", "clear"],
  2: ["Teilweise bewölkt", "⛅", "☁️", "cloudy"],
  3: ["Bewölkt", "☁️", "☁️", "cloudy"],
  45: ["Nebel", "🌫️", "🌫️", "fog"],
  48: ["Reifnebel", "🌫️", "🌫️", "fog"],
  51: ["Leichter Nieselregen", "🌦️", "🌧️", "rain"],
  53: ["Nieselregen", "🌦️", "🌧️", "rain"],
  55: ["Starker Nieselregen", "🌧️", "🌧️", "rain"],
  56: ["Gefrierender Nieselregen", "🌧️", "🌧️", "rain"],
  57: ["Gefrierender Nieselregen", "🌧️", "🌧️", "rain"],
  61: ["Leichter Regen", "🌦️", "🌧️", "rain"],
  63: ["Regen", "🌧️", "🌧️", "rain"],
  65: ["Starker Regen", "🌧️", "🌧️", "rain"],
  66: ["Gefrierender Regen", "🌧️", "🌧️", "rain"],
  67: ["Gefrierender Regen", "🌧️", "🌧️", "rain"],
  71: ["Leichter Schneefall", "🌨️", "🌨️", "snow"],
  73: ["Schneefall", "🌨️", "🌨️", "snow"],
  75: ["Starker Schneefall", "❄️", "❄️", "snow"],
  77: ["Schneegriesel", "🌨️", "🌨️", "snow"],
  80: ["Regenschauer", "🌦️", "🌧️", "rain"],
  81: ["Regenschauer", "🌧️", "🌧️", "rain"],
  82: ["Heftige Regenschauer", "⛈️", "⛈️", "rain"],
  85: ["Schneeschauer", "🌨️", "🌨️", "snow"],
  86: ["Starke Schneeschauer", "❄️", "❄️", "snow"],
  95: ["Gewitter", "⛈️", "⛈️", "storm"],
  96: ["Gewitter mit Hagel", "⛈️", "⛈️", "storm"],
  99: ["Schweres Gewitter mit Hagel", "⛈️", "⛈️", "storm"],
};

function wmo(code, isDay = true) {
  const [text, day, night, sky] = WMO[code] || ["Unbekannt", "🌡️", "🌡️", "cloudy"];
  return { text, icon: isDay ? day : night, sky: `${sky}-${isDay ? "day" : "night"}` };
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DIRECTIONS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

// ---------- Psalm des Tages ----------

const psalm = { data: null, offset: 0 };

// Fortlaufende Tageszählung ab 1. Januar 2026 (Ortszeit) -> Lesung im Zyklus.
function readingFor(date) {
  const days = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2026, 0, 1)) / 86400000
  );
  const list = psalm.data.readings;
  return list[((days % list.length) + list.length) % list.length];
}

function psalmDate() {
  const d = new Date();
  d.setDate(d.getDate() + psalm.offset);
  return d;
}

function renderPsalm() {
  if (!psalm.data) return;
  const date = psalmDate();
  const reading = readingFor(date);
  const card = $("#psalm-card");

  const labels = { "-1": "Gestern", 0: "Heute", 1: "Morgen" };
  const dateText = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  $("#psalm-date").textContent = labels[psalm.offset] ? `${labels[psalm.offset]} · ${dateText}` : dateText;

  const ref = $("#psalm-ref");
  ref.textContent = reading.ref;
  if (reading.part) {
    ref.append(" ", el("small", null, `(${reading.part})`));
  }

  const text = $("#psalm-text");
  text.replaceChildren(
    ...reading.verses.map(([n, v]) => {
      const p = el("p");
      p.append(el("sup", null, n), v);
      return p;
    })
  );

  card.querySelector(".more-btn")?.remove();
  card.classList.remove("collapsed");
  if (reading.verses.length > 12) {
    card.classList.add("collapsed");
    const more = el("button", "more-btn", "Weiterlesen");
    more.addEventListener("click", () => {
      card.classList.remove("collapsed");
      more.remove();
    });
    text.after(more);
  }

  $("#psalm-today").hidden = psalm.offset === 0;
}

function shiftPsalm(delta) {
  psalm.offset = delta === 0 ? 0 : psalm.offset + delta;
  renderPsalm();
}

async function sharePsalm() {
  const reading = readingFor(psalmDate());
  const body = reading.verses.map(([n, v]) => `${n} ${v}`).join("\n");
  const text = `${reading.ref} (Luther 1912)\n\n${body}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: reading.ref, text });
    } else {
      await navigator.clipboard.writeText(text);
      showStatus("Psalm in die Zwischenablage kopiert.", 2500);
    }
  } catch (err) {
    if (err.name !== "AbortError") showStatus("Teilen nicht möglich.", 2500);
  }
}

async function loadPsalms() {
  const res = await fetch("psalms.json");
  psalm.data = await res.json();
  renderPsalm();
}

// ---------- Wetter ----------

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const DEFAULT_PLACE = { name: "Berlin", region: "Deutschland", lat: 52.52, lon: 13.405 };

let statusTimer;
function showStatus(msg, hideAfter) {
  const node = $("#status");
  node.textContent = msg;
  node.hidden = false;
  clearTimeout(statusTimer);
  if (hideAfter) statusTimer = setTimeout(() => (node.hidden = true), hideAfter);
}
function hideStatus() {
  $("#status").hidden = true;
}

async function fetchWeather(place) {
  const params = new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    timezone: "auto",
    forecast_days: 7,
    current: [
      "temperature_2m", "apparent_temperature", "relative_humidity_2m", "is_day",
      "weather_code", "wind_speed_10m", "wind_direction_10m", "surface_pressure", "precipitation",
    ].join(","),
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max",
      "precipitation_sum", "sunrise", "sunset", "uv_index_max",
    ].join(","),
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderWeather(place, w) {
  const cur = w.current;
  const now = wmo(cur.weather_code, cur.is_day === 1);
  document.body.dataset.sky = now.sky;

  $("#place").textContent = place.name;
  $("#temp").textContent = `${round(cur.temperature_2m)}°`;
  $("#condition").textContent = now.text;
  $("#hilo").textContent = `H: ${round(w.daily.temperature_2m_max[0])}°  T: ${round(w.daily.temperature_2m_min[0])}°`;

  // Stündlich: ab der aktuellen Stunde 24 Stunden
  const hourKey = cur.time.slice(0, 13);
  let start = w.hourly.time.findIndex((t) => t.slice(0, 13) >= hourKey);
  if (start < 0) start = 0;
  const hours = [];
  for (let i = start; i < Math.min(start + 24, w.hourly.time.length); i++) {
    const h = wmo(w.hourly.weather_code[i], w.hourly.is_day[i] === 1);
    const prob = w.hourly.precipitation_probability[i];
    const item = el("div", "hour");
    item.append(
      el("span", "t", i === start ? "Jetzt" : w.hourly.time[i].slice(11, 13)),
      el("span", "i", h.icon),
      el("span", "p", prob >= 20 ? `${prob}%` : ""),
      el("span", "v", `${round(w.hourly.temperature_2m[i])}°`)
    );
    hours.push(item);
  }
  $("#hourly").replaceChildren(...hours);

  // 7 Tage mit Temperaturbalken
  const d = w.daily;
  const min = Math.min(...d.temperature_2m_min);
  const max = Math.max(...d.temperature_2m_max);
  const span = Math.max(max - min, 1);
  $("#daily").replaceChildren(
    ...d.time.map((date, i) => {
      const [y, m, day] = date.split("-").map(Number);
      const name = i === 0 ? "Heute" : WEEKDAYS[new Date(y, m - 1, day).getDay()];
      const info = wmo(d.weather_code[i]);
      const prob = d.precipitation_probability_max[i];
      const lo = d.temperature_2m_min[i];
      const hi = d.temperature_2m_max[i];

      const row = el("li", "day");
      const bar = el("div", "bar");
      const fill = el("span");
      fill.style.left = `${((lo - min) / span) * 100}%`;
      fill.style.right = `${((max - hi) / span) * 100}%`;
      bar.append(fill);
      const range = el("div", "range");
      range.append(el("span", "lo", `${round(lo)}°`), bar, el("span", "hi", `${round(hi)}°`));
      row.append(el("span", "n", name), el("span", "i", info.icon), el("span", "p", prob >= 20 ? `${prob}%` : ""), range);
      return row;
    })
  );

  // Detailkacheln
  const dir = DIRECTIONS[Math.round(cur.wind_direction_10m / 45) % 8];
  const uv = d.uv_index_max[0] ?? 0;
  const uvText = uv < 3 ? "Niedrig" : uv < 6 ? "Mäßig" : uv < 8 ? "Hoch" : uv < 11 ? "Sehr hoch" : "Extrem";
  const feels = round(cur.apparent_temperature);
  const tiles = [
    ["🌡️ Gefühlt", `${feels}°`, feels < round(cur.temperature_2m) ? "Fühlt sich kühler an" : feels > round(cur.temperature_2m) ? "Fühlt sich wärmer an" : "Wie gemessen"],
    ["💨 Wind", `${round(cur.wind_speed_10m)} km/h`, `Aus Richtung ${dir}`],
    ["💧 Luftfeuchte", `${cur.relative_humidity_2m}%`, `Luftdruck ${round(cur.surface_pressure)} hPa`],
    ["☔ Niederschlag", `${(d.precipitation_sum[0] ?? 0).toLocaleString("de-DE")} mm`, "Erwartet für heute"],
    ["🌅 Sonne", fmtTime(d.sunrise[0]), `Untergang ${fmtTime(d.sunset[0])} Uhr`],
    ["🔆 UV-Index", `${round(uv)}`, uvText],
  ];
  $("#tiles").replaceChildren(
    ...tiles.map(([label, big, sub]) => {
      const tile = el("div", "tile");
      tile.append(el("span", "label", label), el("div", "big", big), el("div", "sub", sub));
      return tile;
    })
  );
}

let currentPlace = null;

async function showPlace(place) {
  currentPlace = place;
  store("place", place);
  $("#place").textContent = place.name;

  const cached = store(`weather:${place.lat},${place.lon}`);
  if (cached) renderWeather(place, cached);

  try {
    const w = await fetchWeather(place);
    store(`weather:${place.lat},${place.lon}`, w);
    // Nur anzeigen, wenn inzwischen kein anderer Ort gewählt wurde
    if (currentPlace === place) {
      renderWeather(place, w);
      hideStatus();
    }
  } catch {
    showStatus(cached ? "Offline – zeige zuletzt geladene Daten." : "Wetterdaten konnten nicht geladen werden.");
    if (!cached) $("#condition").textContent = "Keine Verbindung";
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`${REVERSE_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=de`);
    const r = await res.json();
    return r.city || r.locality || r.principalSubdivision || "Mein Standort";
  } catch {
    return "Mein Standort";
  }
}

function locate() {
  if (!navigator.geolocation) {
    showStatus("Standortbestimmung wird nicht unterstützt.", 3000);
    return;
  }
  showStatus("Standort wird ermittelt …");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = +pos.coords.latitude.toFixed(3);
      const lon = +pos.coords.longitude.toFixed(3);
      const name = await reverseGeocode(lat, lon);
      showPlace({ name, region: "Aktueller Standort", lat, lon, gps: true });
    },
    () => {
      showStatus("Standort nicht verfügbar – suche einen Ort über 🔍.", 4000);
      if (!currentPlace) showPlace(DEFAULT_PLACE);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 }
  );
}

// ---------- Suche & gespeicherte Orte ----------

const savedPlaces = () => store("saved") || [];

function savePlace(place) {
  const list = savedPlaces().filter((p) => !(p.lat === place.lat && p.lon === place.lon));
  list.unshift(place);
  store("saved", list.slice(0, 15));
}

function removePlace(place) {
  store("saved", savedPlaces().filter((p) => !(p.lat === place.lat && p.lon === place.lon)));
  renderSaved();
}

function placeRow(place, onRemove) {
  const li = el("li");
  const grow = el("div", "grow");
  grow.append(el("div", "name", place.name), el("div", "meta", place.region || ""));
  li.append(grow);
  if (onRemove) {
    const btn = el("button", "remove", "Entfernen");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove(place);
    });
    li.append(btn);
  }
  li.addEventListener("click", () => {
    if (!place.gps) savePlace(place);
    $("#search-dialog").close();
    showPlace(place);
  });
  return li;
}

function renderSaved() {
  const list = savedPlaces();
  $("#saved-title").hidden = list.length === 0;
  $("#saved-list").replaceChildren(...list.map((p) => placeRow(p, removePlace)));
}

let searchTimer;
let searchSeq = 0;
function onSearchInput() {
  clearTimeout(searchTimer);
  const q = $("#search-input").value.trim();
  if (q.length < 2) {
    $("#search-results").replaceChildren();
    return;
  }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const res = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=de&format=json`);
      const data = await res.json();
      if (seq !== searchSeq) return;
      const results = (data.results || []).map((r) => ({
        name: r.name,
        region: [r.admin1, r.country].filter(Boolean).join(", "),
        lat: +r.latitude.toFixed(3),
        lon: +r.longitude.toFixed(3),
      }));
      $("#search-results").replaceChildren(
        ...(results.length ? results.map((p) => placeRow(p)) : [el("li", "empty", "Kein Ort gefunden")])
      );
    } catch {
      if (seq === searchSeq) {
        $("#search-results").replaceChildren(el("li", "empty", "Suche nicht möglich (offline?)"));
      }
    }
  }, 300);
}

function openSearch() {
  renderSaved();
  $("#search-input").value = "";
  $("#search-results").replaceChildren();
  $("#search-dialog").showModal();
  $("#search-input").focus();
}

// ---------- Wetterwarnungen (ntfy) ----------

async function copyTopic(topic, btn) {
  try {
    await navigator.clipboard.writeText(topic);
    btn.textContent = "Kopiert ✓";
  } catch {
    btn.textContent = "Fehler";
  }
  setTimeout(() => (btn.textContent = "Kopieren"), 2500);
}

async function loadAlerts() {
  const res = await fetch("warnungen/orte.json");
  const { orte } = await res.json();
  if (!orte.length) return;
  $("#alerts-list").replaceChildren(
    ...orte.map((ort) => {
      const li = el("li");
      const grow = el("div", "grow");
      grow.append(el("div", "name", ort.name), el("div", "topic", ort.topic));
      const btn = el("button", "pill", "Kopieren");
      btn.addEventListener("click", () => copyTopic(ort.topic, btn));
      li.append(grow, btn);
      return li;
    })
  );
  $("#alerts-card").hidden = false;
}

// ---------- Start ----------

$("#psalm-prev").addEventListener("click", () => shiftPsalm(-1));
$("#psalm-next").addEventListener("click", () => shiftPsalm(1));
$("#psalm-today").addEventListener("click", () => shiftPsalm(0));
$("#psalm-share").addEventListener("click", sharePsalm);
$("#btn-locate").addEventListener("click", locate);
$("#btn-search").addEventListener("click", openSearch);
$("#search-input").addEventListener("input", onSearchInput);

loadPsalms().catch(() => {
  $("#psalm-ref").textContent = "Psalm konnte nicht geladen werden";
});
loadAlerts().catch(() => {});

const lastPlace = store("place");
if (lastPlace) {
  showPlace(lastPlace);
  if (lastPlace.gps) locate();
} else {
  locate();
}

// Beim Zurückkehren in die App: Daten und Tagespsalm aktualisieren
let lastDay = new Date().toDateString();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (new Date().toDateString() !== lastDay) {
    lastDay = new Date().toDateString();
    psalm.offset = 0;
    renderPsalm();
  }
  if (currentPlace) showPlace(currentPlace);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
