"use strict";

// ---------- Hilfsfunktionen ----------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

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

// Kleines Template für statisches Markup aus eigenen Daten (keine Nutzereingaben)
function html(tag, cls, markup) {
  const node = el(tag, cls);
  node.innerHTML = markup;
  return node;
}

const round = (n) => Math.round(n);
const fmtTime = (iso) => iso.slice(11, 16);
const parseLocal = (iso) => new Date(iso.length === 10 ? `${iso}T00:00` : iso);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
const dirName = (deg) => DIRECTIONS[Math.round(deg / 45) % 8];

function beaufort(kmh) {
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const bft = limits.findIndex((l) => kmh < l);
  return bft < 0 ? 12 : bft;
}

// ---------- Psalm des Tages ----------

const psalm = { data: null, offset: 0, size: store("psalmSize") || 18 };

function dayNumber(date) {
  return Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2026, 0, 1)) / 86400000
  );
}

// Fortlaufende Tageszählung ab 1. Januar 2026 (Ortszeit) -> Lesung im Zyklus.
function readingIndex(date) {
  const n = psalm.data.readings.length;
  return ((dayNumber(date) % n) + n) % n;
}

function psalmDate() {
  const d = new Date();
  d.setDate(d.getDate() + psalm.offset);
  return d;
}

function renderPsalm() {
  if (!psalm.data) return;
  const date = psalmDate();
  const idx = readingIndex(date);
  const reading = psalm.data.readings[idx];

  const labels = { "-1": "Gestern", 0: "Heute", 1: "Morgen" };
  const dateText = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  $("#psalm-date").textContent = labels[psalm.offset] ? `${labels[psalm.offset]} · ${dateText}` : dateText;
  $("#psalm-num").textContent = `${idx + 1}/${psalm.data.readings.length}`;

  const ref = $("#psalm-ref");
  ref.textContent = reading.ref;
  if (reading.part) ref.append(" ", el("small", null, `(${reading.part})`));

  $("#psalm-text").replaceChildren(
    ...reading.verses.map(([n, v]) => {
      const p = el("p");
      p.append(el("sup", null, n), v);
      return p;
    })
  );
  $("#psalm-today").hidden = psalm.offset === 0;
  document.documentElement.style.setProperty("--psalm-size", `${psalm.size}px`);
}

// Ein gut lesbarer Vers aus der heutigen Lesung für die Startseite
function renderVerse() {
  if (!psalm.data) return;
  const today = new Date();
  const reading = psalm.data.readings[readingIndex(today)];
  const candidates = reading.verses.filter(([, v]) => v.length >= 40 && v.length <= 220 && !/^(Ein |Eine |Des |Dem |Davids|Ein Lied|Ein Psalm)/.test(v));
  const pool = candidates.length ? candidates : reading.verses;
  const [n, v] = pool[((dayNumber(today) % pool.length) + pool.length) % pool.length];
  $("#verse-text").textContent = `„${v}“`;
  $("#verse-ref").textContent = `PS ${reading.psalm},${n}`;
}

function shiftPsalm(delta) {
  psalm.offset = delta === 0 ? 0 : psalm.offset + delta;
  renderPsalm();
}

function psalmAsText() {
  const reading = psalm.data.readings[readingIndex(psalmDate())];
  const body = reading.verses.map(([n, v]) => `${n} ${v}`).join("\n");
  return { title: reading.ref, text: `${reading.ref} (Luther 1912)\n\n${body}` };
}

async function sharePsalm() {
  const { title, text } = psalmAsText();
  try {
    if (navigator.share) await navigator.share({ title, text });
    else await copyPsalm();
  } catch (err) {
    if (err.name !== "AbortError") showStatus("Teilen nicht möglich.", 2500);
  }
}

async function copyPsalm() {
  try {
    await navigator.clipboard.writeText(psalmAsText().text);
    showStatus("Psalm in die Zwischenablage kopiert.", 2500);
  } catch {
    showStatus("Kopieren nicht möglich.", 2500);
  }
}

function setFontSize(delta) {
  psalm.size = clamp(psalm.size + delta, 14, 28);
  store("psalmSize", psalm.size);
  renderPsalm();
}

async function loadPsalms() {
  const res = await fetch("psalms.json");
  psalm.data = await res.json();
  renderPsalm();
  renderVerse();
}

// ---------- Status ----------

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

// ---------- Wetterdaten ----------

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const DEFAULT_PLACE = { name: "Basel", region: "Schweiz", lat: 47.56, lon: 7.589 };

const POLLEN = {
  alder_pollen: "Erle",
  birch_pollen: "Birke",
  grass_pollen: "Gräser",
  mugwort_pollen: "Beifuß",
  olive_pollen: "Olive",
  ragweed_pollen: "Ambrosia",
};

async function fetchWeather(place) {
  const params = new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    timezone: "auto",
    forecast_days: 7,
    current: [
      "temperature_2m", "apparent_temperature", "relative_humidity_2m", "is_day", "weather_code",
      "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "pressure_msl", "cloud_cover",
    ].join(","),
    minutely_15: "precipitation",
    hourly: [
      "temperature_2m", "weather_code", "precipitation_probability", "precipitation", "is_day",
      "wind_speed_10m", "wind_gusts_10m", "snowfall", "rain", "showers", "dew_point_2m",
      "visibility", "pressure_msl",
    ].join(","),
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max",
      "precipitation_sum", "sunrise", "sunset", "uv_index_max", "wind_gusts_10m_max", "daylight_duration",
    ].join(","),
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAir(place) {
  const params = new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    timezone: "auto",
    current: ["european_aqi", "pm2_5", "pm10", "ozone", "nitrogen_dioxide", ...Object.keys(POLLEN)].join(","),
  });
  const res = await fetch(`${AIR_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Index der aktuellen Stunde in den stündlichen Daten
function hourStart(w) {
  const key = w.current.time.slice(0, 13);
  const i = w.hourly.time.findIndex((t) => t.slice(0, 13) >= key);
  return i < 0 ? 0 : i;
}

// ---------- Warnungen (gleiche Schwellen wie scripts/warnungen.py) ----------

function computeWarnings(w) {
  const h = w.hourly;
  const start = hourStart(w);
  const idx = [];
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) idx.push(i);
  const first = (pred) => {
    const i = idx.find(pred);
    return i === undefined ? null : h.time[i];
  };
  const out = [];
  const add = (icon, label, severe, when, text) => when && out.push({ icon, label, severe, when, text });

  const storm = idx.filter((i) => h.weather_code[i] >= 95);
  if (storm.length) {
    const hail = storm.some((i) => [96, 99].includes(h.weather_code[i]));
    add("⛈️", hail ? "Gewitter mit Hagel" : "Gewitter", hail, h.time[storm[0]],
      hail ? "Gewitter mit Hagel möglich." : "Blitz, Starkregen und Böen möglich.");
  }

  const gust = Math.max(...idx.map((i) => h.wind_gusts_10m[i] || 0));
  if (gust >= 60) {
    const label = gust >= 120 ? "Orkanböen" : gust >= 105 ? "Orkanartige Böen" : gust >= 90 ? "Schwere Sturmböen" : gust >= 75 ? "Sturmböen" : "Starke Windböen";
    add("💨", label, gust >= 90, first((i) => (h.wind_gusts_10m[i] || 0) >= 60), `Böen bis ${round(gust)} km/h.`);
  }

  const tmax = Math.max(...idx.map((i) => h.temperature_2m[i]));
  if (tmax >= 30) {
    add("🥵", tmax >= 35 ? "Starke Hitze" : "Hitze", tmax >= 35, first((i) => h.temperature_2m[i] >= 30),
      `Bis ${round(tmax)} °C. Viel trinken, Mittagssonne meiden.`);
  }

  const tmin = Math.min(...idx.map((i) => h.temperature_2m[i]));
  if (tmin <= -10) {
    add("🥶", tmin <= -15 ? "Sehr strenger Frost" : "Strenger Frost", tmin <= -15, first((i) => h.temperature_2m[i] <= -10),
      `Bis ${round(tmin)} °C. Warm anziehen, Leitungen schützen.`);
  }

  const snow = idx.reduce((s, i) => s + (h.snowfall[i] || 0), 0);
  if (snow >= 3) {
    add("❄️", snow >= 25 ? "Extrem starker Schneefall" : snow >= 10 ? "Starker Schneefall" : "Schneefall", snow >= 10,
      first((i) => (h.snowfall[i] || 0) > 0), `Etwa ${round(snow)} cm Neuschnee in 24 Stunden.`);
  }

  const freezing = first((i) => [56, 57, 66, 67].includes(h.weather_code[i]));
  if (freezing) {
    add("🧊", "Glatteis", true, freezing, "Gefrierender Regen – Straßen können spiegelglatt werden.");
  } else {
    add("🧊", "Glättegefahr", false,
      first((i) => h.temperature_2m[i] <= 1 && ((h.rain[i] || 0) + (h.showers[i] || 0) + (h.snowfall[i] || 0)) > 0),
      "Nässe oder Schnee um den Gefrierpunkt – Vorsicht auf Wegen.");
  }
  return out;
}

function whenText(iso) {
  const d = parseLocal(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}. ab ${String(d.getHours()).padStart(2, "0")} Uhr`;
}

function renderWarnings(place, w) {
  const list = computeWarnings(w);
  const banner = $("#warn-banner");
  const badge = $("#warn-badge");
  $("#warn-place").textContent = place.name;

  if (!list.length) {
    banner.hidden = true;
    badge.hidden = true;
    $("#warn-list").replaceChildren(html("li", null, '<span class="ico">✅</span><div><b class="ok">Keine Warnungen</b><small>Für die nächsten 24 Stunden ist kein Unwetter vorhergesagt.</small></div>'));
    return;
  }

  const severe = list.some((x) => x.severe);
  banner.hidden = false;
  banner.className = `warn-banner${severe ? " danger" : ""}`;
  banner.replaceChildren(el("span", null, list[0].icon));
  const g = el("span", "grow", list.length === 1 ? list[0].label : `${list.length} Wetterwarnungen`);
  g.append(el("small", null, list.length === 1 ? whenText(list[0].when) : list.map((x) => x.label).join(" · ")));
  banner.append(g, el("span", null, "›"));
  badge.hidden = false;
  badge.textContent = list.length;

  $("#warn-list").replaceChildren(
    ...list.map((x) => {
      const li = el("li");
      const body = el("div");
      const b = el("b", null, x.label);
      b.append(el("span", `lv ${x.severe ? "lv2" : "lv1"}`, x.severe ? "UNWETTER" : "WARNUNG"));
      body.append(b, el("small", null, `${whenText(x.when)} · ${x.text}`));
      li.append(el("span", "ico", x.icon), body);
      return li;
    })
  );
}

// ---------- Darstellung Wetter ----------

const state = { place: null, w: null, air: null, chart: store("chartMetric") || "temp" };

function renderHero(w) {
  const cur = w.current;
  const now = wmo(cur.weather_code, cur.is_day === 1);
  document.body.dataset.sky = now.sky;
  $("#hero-icon").textContent = now.icon;
  $("#temp").textContent = `${round(cur.temperature_2m)}°`;
  $("#condition").textContent = now.text;
  $("#h-max").textContent = `${round(w.daily.temperature_2m_max[0])}°`;
  $("#h-min").textContent = `${round(w.daily.temperature_2m_min[0])}°`;
  $("#h-feel").textContent = `${round(cur.apparent_temperature)}°`;
  $("#h-rain").textContent = `${w.daily.precipitation_probability_max[0] ?? 0}%`;
}

function renderNowcast(w) {
  const m = w.minutely_15;
  if (!m) return;
  const key = w.current.time.slice(0, 16);
  let start = m.time.findIndex((t) => t > key);
  start = start <= 0 ? 0 : start - 1;
  const slots = m.time.slice(start, start + 8).map((t, k) => ({ t: fmtTime(t), v: m.precipitation[start + k] || 0 }));
  const max = Math.max(1, ...slots.map((s) => s.v));
  const sum = slots.reduce((s, x) => s + x.v, 0);
  const kind = w.current.temperature_2m <= 0.5 ? "Schnee" : "Regen";

  let text;
  const firstWet = slots.findIndex((s) => s.v > 0);
  if (firstWet < 0) text = `☂️ Kein ${kind} in den nächsten 2 Stunden.`;
  else if (firstWet === 0) {
    const dry = slots.findIndex((s) => s.v === 0);
    text = dry < 0 ? `🌧️ ${kind} hält mindestens 2 Stunden an.` : `🌧️ ${kind} lässt gegen ${slots[dry].t} Uhr nach.`;
  } else text = `🌦️ ${kind} ab etwa ${slots[firstWet].t} Uhr erwartet.`;

  $("#nowcast-text").textContent = text;
  $("#nowcast-sum").textContent = `Σ ${sum.toFixed(1)} mm`;
  $("#nowcast").replaceChildren(
    ...slots.map((s, k) => {
      const b = el("div", "b");
      const bar = el("i");
      bar.style.height = `${(s.v / max) * 100}%`;
      b.append(bar, el("span", null, k % 2 === 0 ? s.t : ""));
      return b;
    })
  );
}

function renderChart() {
  const w = state.w;
  if (!w) return;
  const box = $("#chart");
  const W = box.clientWidth || 340;
  const H = 150;
  const top = 18;
  const bottom = H - 20;
  const h = w.hourly;
  const start = hourStart(w);
  const idx = [];
  for (let i = start; i < Math.min(start + 25, h.time.length); i++) idx.push(i);
  const x = (k) => 8 + (k * (W - 16)) / (idx.length - 1);
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity="0.45"/>
      <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  for (let g = 0; g <= 3; g++) {
    const y = top + ((bottom - top) * g) / 3;
    svg += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="2 4"/>`;
  }

  const line = (vals, color, dashed, labelUnit, min = Math.min(...vals), max = Math.max(...vals)) => {
    const span = Math.max(max - min, 1);
    const y = (v) => bottom - ((v - min) / span) * (bottom - top - 6);
    const pts = vals.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`);
    let s = "";
    if (!dashed) s += `<path d="M${pts[0]} L${pts.join(" L")} L${x(vals.length - 1)},${bottom} L${x(0)},${bottom}Z" fill="url(#cg)"/>`;
    s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="4 4" opacity="0.7"' : 'style="filter:drop-shadow(0 0 4px var(--accent))"'}/>`;
    if (labelUnit) {
      vals.forEach((v, k) => {
        if (k % 3 === 0) {
          s += `<circle cx="${x(k)}" cy="${y(v)}" r="2.5" fill="${color}"/>`;
          s += `<text class="val" x="${x(k)}" y="${y(v) - 6}" text-anchor="middle">${round(v)}${labelUnit}</text>`;
        }
      });
    }
    return s;
  };

  if (state.chart === "temp") {
    svg += line(idx.map((i) => h.temperature_2m[i]), "var(--accent)", false, "°");
  } else if (state.chart === "wind") {
    const gusts = idx.map((i) => h.wind_gusts_10m[i] || 0);
    const speed = idx.map((i) => h.wind_speed_10m[i] || 0);
    // gemeinsame Skala für Wind und Böen
    const min = Math.min(...speed);
    const max = Math.max(...gusts, ...speed);
    svg += line(gusts, "var(--accent-2)", true, null, min, max);
    svg += line(speed, "var(--accent)", false, "", min, max);
    svg += `<text x="${W - 4}" y="12" text-anchor="end">km/h · gestrichelt = Böen bis ${round(max)}</text>`;
  } else {
    const bw = Math.max(3, (W - 16) / idx.length - 3);
    const maxMm = Math.max(1, ...idx.map((i) => h.precipitation[i] || 0));
    idx.forEach((i, k) => {
      const p = h.precipitation_probability[i] || 0;
      const mm = h.precipitation[i] || 0;
      const ph = ((bottom - top) * p) / 100;
      svg += `<rect x="${x(k) - bw / 2}" y="${bottom - ph}" width="${bw}" height="${ph}" rx="2" fill="var(--rain)" opacity="0.28"/>`;
      const mh = ((bottom - top) * mm) / maxMm;
      if (mm > 0) svg += `<rect x="${x(k) - bw / 2}" y="${bottom - mh}" width="${bw}" height="${mh}" rx="2" fill="var(--rain)"/>`;
      if (k % 3 === 0 && p > 0) svg += `<text class="val" x="${x(k)}" y="${bottom - ph - 4}" text-anchor="middle">${p}%</text>`;
    });
    svg += `<text x="${W - 4}" y="12" text-anchor="end">hell = Wahrscheinlichkeit · kräftig = mm</text>`;
  }

  idx.forEach((i, k) => {
    if (k % 3 === 0) svg += `<text x="${x(k)}" y="${H - 4}" text-anchor="middle">${k === 0 ? "jetzt" : h.time[i].slice(11, 13)}</text>`;
  });
  box.innerHTML = `${svg}</svg>`;
}

function renderHourly(w) {
  const h = w.hourly;
  const start = hourStart(w);
  const items = [];
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
    const info = wmo(h.weather_code[i], h.is_day[i] === 1);
    const p = h.precipitation_probability[i];
    const item = el("div", `hour${i === start ? " now" : ""}`);
    item.append(
      el("span", "t", i === start ? "JETZT" : `${h.time[i].slice(11, 13)}h`),
      el("span", "i", info.icon),
      el("span", "v", `${round(h.temperature_2m[i])}°`),
      el("span", "p", p >= 20 ? `${p}%` : "")
    );
    items.push(item);
  }
  $("#hourly").replaceChildren(...items);
}

function renderDaily(w) {
  const d = w.daily;
  const min = Math.min(...d.temperature_2m_min);
  const max = Math.max(...d.temperature_2m_max);
  const span = Math.max(max - min, 1);
  $("#daily").replaceChildren(
    ...d.time.map((date, i) => {
      const name = i === 0 ? "Heute" : WEEKDAYS[parseLocal(date).getDay()];
      const info = wmo(d.weather_code[i]);
      const p = d.precipitation_probability_max[i];
      const lo = d.temperature_2m_min[i];
      const hi = d.temperature_2m_max[i];

      const li = el("li", "day");
      const row = el("button", "day-row");
      const bar = el("div", "bar");
      const fill = el("span");
      fill.style.left = `${((lo - min) / span) * 100}%`;
      fill.style.right = `${((max - hi) / span) * 100}%`;
      bar.append(fill);
      const range = el("div", "range");
      range.append(el("span", "lo", `${round(lo)}°`), bar, el("span", "hi", `${round(hi)}°`));
      row.append(el("span", "n", name), el("span", "i", info.icon), el("span", "p", p >= 20 ? `${p}%` : ""), range);

      const hours = Math.floor((d.daylight_duration[i] || 0) / 3600);
      const mins = Math.round(((d.daylight_duration[i] || 0) % 3600) / 60);
      const detail = el("div", "day-detail");
      detail.hidden = true;
      [
        ["WETTER", info.text],
        ["REGEN", `${(d.precipitation_sum[i] ?? 0).toFixed(1)} mm`],
        ["BÖEN", `${round(d.wind_gusts_10m_max[i] ?? 0)} km/h`],
        ["SONNE ↑", fmtTime(d.sunrise[i])],
        ["SONNE ↓", fmtTime(d.sunset[i])],
        ["TAG / UV", `${hours}h${String(mins).padStart(2, "0")} · ${round(d.uv_index_max[i] ?? 0)}`],
      ].forEach(([k, v]) => {
        const c = el("div");
        c.append(el("span", null, k), v);
        detail.append(c);
      });
      row.addEventListener("click", () => (detail.hidden = !detail.hidden));
      li.append(row, detail);
      return li;
    })
  );
}

function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const phase = (((days % synodic) + synodic) % synodic) / synodic;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const names = [
    [0.03, "🌑", "Neumond"], [0.22, "🌒", "Zunehmende Sichel"], [0.28, "🌓", "Erstes Viertel"],
    [0.47, "🌔", "Zunehmender Mond"], [0.53, "🌕", "Vollmond"], [0.72, "🌖", "Abnehmender Mond"],
    [0.78, "🌗", "Letztes Viertel"], [0.97, "🌘", "Abnehmende Sichel"], [1.01, "🌑", "Neumond"],
  ];
  const [, icon, name] = names.find(([limit]) => phase < limit);
  const toFull = (((0.5 - phase) % 1) + 1) % 1 * synodic;
  return { icon, name, illum, toFull };
}

function tile(label, cls = "") {
  const t = el("div", `panel ${cls}`);
  const head = el("div", "panel-head");
  head.append(el("span", "tag", label));
  t.append(head);
  return t;
}

function compassSvg(deg) {
  return `<svg class="compass" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--line-strong)"/>
    <circle cx="50" cy="50" r="30" fill="none" stroke="var(--line)" stroke-dasharray="2 3"/>
    <text x="50" y="7">N</text><text x="96" y="53">O</text><text x="50" y="99">S</text><text x="4" y="53">W</text>
    <g transform="rotate(${deg} 50 50)">
      <path d="M50 14 L56 50 L50 44 L44 50 Z" fill="var(--accent)" style="filter:drop-shadow(0 0 4px var(--accent))"/>
      <path d="M50 86 L55 50 L50 56 L45 50 Z" fill="var(--muted)" opacity="0.6"/>
    </g></svg>`;
}

function sunArcSvg(w) {
  const now = parseLocal(w.current.time);
  const rise = parseLocal(w.daily.sunrise[0]);
  const set = parseLocal(w.daily.sunset[0]);
  const t = clamp((now - rise) / (set - rise), 0, 1);
  const up = now >= rise && now <= set;
  const a = Math.PI * (1 - t);
  const cx = 150 + 130 * Math.cos(a);
  const cy = 64 - 54 * Math.sin(a);
  return `<svg class="sunarc" viewBox="0 0 300 70" preserveAspectRatio="xMidYMid meet">
    <line x1="0" x2="300" y1="64" y2="64" stroke="var(--line-strong)"/>
    <path d="M20 64 A130 54 0 0 1 280 64" fill="none" stroke="var(--line-strong)" stroke-dasharray="3 4"/>
    ${up ? `<circle cx="${cx}" cy="${cy}" r="7" fill="#ffc23d" style="filter:drop-shadow(0 0 8px #ffc23d)"/>` : ""}
  </svg>`;
}

function renderTiles(w, air) {
  const cur = w.current;
  const d = w.daily;
  const h = w.hourly;
  const s = hourStart(w);
  const tiles = [];

  // Wind
  const wind = tile("// WIND");
  wind.append(html("div", null, compassSvg(cur.wind_direction_10m)));
  wind.append(html("div", "tile-big", `${round(cur.wind_speed_10m)}<small> km/h</small>`));
  wind.append(el("div", "tile-sub", `Aus ${dirName(cur.wind_direction_10m)} · Böen ${round(cur.wind_gusts_10m)} km/h · ${beaufort(cur.wind_speed_10m)} Bft`));
  tiles.push(wind);

  // Luftfeuchte & Taupunkt
  const hum = tile("// FEUCHTE");
  hum.append(html("div", "tile-big", `${cur.relative_humidity_2m}<small> %</small>`));
  const dew = h.dew_point_2m[s];
  hum.append(el("div", "tile-sub", `Taupunkt ${round(dew)}° · ${dew >= 18 ? "schwül" : dew >= 13 ? "angenehm feucht" : "trocken"}`));
  const meter = html("div", "meter", `<i style="left:${cur.relative_humidity_2m}%"></i>`);
  meter.style.background = "linear-gradient(90deg,#ffb020,#3ddc97,#4da3ff)";
  hum.append(meter);
  hum.append(el("div", "tile-sub", `Bewölkung ${cur.cloud_cover} %`));
  tiles.push(hum);

  // Luftdruck mit Tendenz
  const press = tile("// LUFTDRUCK");
  const p3 = h.pressure_msl[Math.min(s + 3, h.pressure_msl.length - 1)];
  const diff = p3 - cur.pressure_msl;
  const trend = diff > 1 ? "↗ steigend" : diff < -1 ? "↘ fallend" : "→ stabil";
  press.append(html("div", "tile-big", `${round(cur.pressure_msl)}<small> hPa</small>`));
  press.append(el("div", "tile-sub", `${trend} (${diff >= 0 ? "+" : ""}${diff.toFixed(1)} in 3 h)`));
  tiles.push(press);

  // Sichtweite
  const vis = tile("// SICHT");
  const km = (h.visibility[s] ?? 0) / 1000;
  vis.append(html("div", "tile-big", `${km >= 10 ? round(km) : km.toFixed(1)}<small> km</small>`));
  vis.append(el("div", "tile-sub", km >= 20 ? "Sehr gute Fernsicht" : km >= 10 ? "Gute Sicht" : km >= 1 ? "Eingeschränkte Sicht" : "Nebel – sehr schlechte Sicht"));
  tiles.push(vis);

  // UV
  const uvT = tile("// UV-INDEX");
  const uv = d.uv_index_max[0] ?? 0;
  const uvText = uv < 3 ? "Niedrig" : uv < 6 ? "Mäßig" : uv < 8 ? "Hoch" : uv < 11 ? "Sehr hoch" : "Extrem";
  uvT.append(html("div", "tile-big", `${uv.toFixed(1)}`));
  uvT.append(el("div", "tile-sub", `${uvText}${uv >= 3 ? " · Sonnenschutz empfohlen" : ""}`));
  uvT.append(html("div", "meter", `<i style="left:${clamp(uv / 11, 0, 1) * 100}%"></i>`));
  tiles.push(uvT);

  // Mond
  const moon = moonPhase();
  const moonT = tile("// MOND");
  moonT.append(html("div", "tile-big", `${moon.icon} <small>${round(moon.illum * 100)} %</small>`));
  moonT.append(el("div", "tile-sub", `${moon.name}${moon.toFull > 0.5 ? ` · Vollmond in ${round(moon.toFull)} Tagen` : ""}`));
  tiles.push(moonT);

  // Sonne
  const sun = tile("// SONNE", "wide");
  sun.append(html("div", null, sunArcSvg(w)));
  const dl = d.daylight_duration[0] || 0;
  sun.append(html("div", "kv", `<span>Aufgang</span><b>${fmtTime(d.sunrise[0])}</b><span>Untergang</span><b>${fmtTime(d.sunset[0])}</b><span>Tageslänge</span><b>${Math.floor(dl / 3600)} h ${round((dl % 3600) / 60)} min</b>`));
  tiles.push(sun);

  // Luftqualität & Pollen
  if (air && air.current) {
    const a = air.current;
    const aqi = a.european_aqi ?? 0;
    const levels = [[20, "Gut", 1], [40, "Ziemlich gut", 1], [60, "Mäßig", 2], [80, "Schlecht", 3], [100, "Sehr schlecht", 4], [Infinity, "Extrem schlecht", 4]];
    const [, aqiText, aqiLvl] = levels.find(([l]) => aqi < l);
    const aq = tile("// LUFTQUALITÄT", "wide");
    aq.append(html("div", "tile-big", `${round(aqi)} <small class="lvl-${aqiLvl}">${aqiText}</small>`));
    aq.append(html("div", "meter", `<i style="left:${clamp(aqi / 120, 0, 1) * 100}%"></i>`));
    aq.append(html("div", "kv", `<span>Feinstaub PM2.5</span><b>${round(a.pm2_5 ?? 0)} µg/m³</b><span>Feinstaub PM10</span><b>${round(a.pm10 ?? 0)} µg/m³</b><span>Ozon O₃</span><b>${round(a.ozone ?? 0)} µg/m³</b><span>Stickstoffdioxid NO₂</span><b>${round(a.nitrogen_dioxide ?? 0)} µg/m³</b>`));
    aq.lastChild.style.marginTop = "12px";
    tiles.push(aq);

    const pollen = Object.entries(POLLEN).filter(([k]) => a[k] !== null && a[k] !== undefined);
    if (pollen.length) {
      const pl = tile("// POLLENFLUG", "wide");
      const level = (v) => (v < 1 ? ["keine", 0] : v < 20 ? ["gering", 1] : v < 100 ? ["mäßig", 2] : ["hoch", 4]);
      const rows = pollen.map(([k, name]) => {
        const [txt, lv] = level(a[k]);
        return `<span>${name}</span><b class="lvl-${lv}">${txt}</b>`;
      });
      pl.append(html("div", "kv", rows.join("")));
      tiles.push(pl);
    }
  }

  $("#tiles").replaceChildren(...tiles);
}

function renderUpdated(t, live) {
  const time = new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const gps = state.place?.gps ? " · GPS" : "";
  $("#updated").innerHTML = `${live ? '<span class="live">● LIVE</span>' : "○ OFFLINE"} · ${time}${gps}`;
}

function renderAll() {
  const { place, w, air } = state;
  $("#place").textContent = place.name;
  if (!w) return;
  renderHero(w);
  renderWarnings(place, w);
  renderNowcast(w);
  renderChart();
  renderHourly(w);
  renderDaily(w);
  renderTiles(w, air);
  radar.center?.(place);
}

let loadSeq = 0;
async function showPlace(place) {
  const seq = ++loadSeq;
  state.place = place;
  store("place", place);
  $("#place").textContent = place.name;

  const cacheKey = `wx:${place.lat},${place.lon}`;
  const cached = store(cacheKey);
  if (cached && cached.w) {
    Object.assign(state, { w: cached.w, air: cached.air });
    renderAll();
    renderUpdated(cached.t, false);
  }

  $("#btn-refresh").classList.add("spin");
  try {
    const [w, air] = await Promise.all([fetchWeather(place), fetchAir(place).catch(() => null)]);
    if (seq !== loadSeq) return; // inzwischen anderer Ort gewählt
    const t = Date.now();
    store(cacheKey, { t, w, air });
    Object.assign(state, { w, air });
    renderAll();
    renderUpdated(t, true);
    hideStatus();
  } catch {
    if (seq !== loadSeq) return;
    showStatus(cached ? "Offline – zeige zuletzt geladene Daten." : "Wetterdaten konnten nicht geladen werden.");
    if (!cached) $("#condition").textContent = "Keine Verbindung";
  } finally {
    if (seq === loadSeq) $("#btn-refresh").classList.remove("spin");
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
      showStatus("Standort nicht verfügbar – Ort über die Lupe suchen.", 4000);
      if (!state.place) showPlace(DEFAULT_PLACE);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 }
  );
}

// ---------- Radar (RainViewer + Leaflet, wird erst bei Bedarf geladen) ----------

const radar = { map: null, frames: [], layers: [], pos: 0, timer: null, marker: null, center: null };

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  document.head.append(css);
  return new Promise((resolve, reject) => {
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = resolve;
    js.onerror = reject;
    document.head.append(js);
  });
}

function showFrame(pos) {
  if (!radar.layers.length) return;
  radar.pos = (pos + radar.layers.length) % radar.layers.length;
  radar.layers.forEach((l, k) => l.setOpacity(k === radar.pos ? 0.75 : 0));
  const f = radar.frames[radar.pos];
  const t = new Date(f.time * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  $("#radar-time").textContent = `${t}${f.nowcast ? " · PROGNOSE" : ""}`;
  $("#radar-slider").value = radar.pos;
}

function toggleRadarPlay(force) {
  const play = force ?? !radar.timer;
  clearInterval(radar.timer);
  radar.timer = play ? setInterval(() => showFrame(radar.pos + 1), 700) : null;
  $("#radar-play").innerHTML = play
    ? '<svg viewBox="0 0 24 24"><path class="fill" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path class="fill" d="M8 5v14l11-7z"/></svg>';
}

async function initRadar() {
  if (radar.map) {
    radar.map.invalidateSize();
    return;
  }
  $("#radar-msg").textContent = "Radar wird geladen …";
  try {
    await loadLeaflet();
    const p = state.place || DEFAULT_PLACE;
    radar.map = L.map("map", { zoomControl: false, attributionControl: false }).setView([p.lat, p.lon], 7);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 12, subdomains: "abcd" }).addTo(radar.map);
    radar.marker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [14, 14] }) }).addTo(radar.map);
    radar.center = (place) => {
      radar.map.setView([place.lat, place.lon], radar.map.getZoom());
      radar.marker.setLatLng([place.lat, place.lon]);
    };

    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    const data = await res.json();
    radar.frames = [...(data.radar?.past || []), ...(data.radar?.nowcast || []).map((f) => ({ ...f, nowcast: true }))];
    if (!radar.frames.length) throw new Error("keine Radardaten");
    radar.layers = radar.frames.map((f) =>
      L.tileLayer(`${data.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, maxNativeZoom: 7, maxZoom: 12, zIndex: 5 }).addTo(radar.map)
    );
    const slider = $("#radar-slider");
    slider.max = radar.layers.length - 1;
    slider.addEventListener("input", () => {
      toggleRadarPlay(false);
      showFrame(+slider.value);
    });
    const latest = radar.frames.findLastIndex((f) => !f.nowcast);
    showFrame(latest < 0 ? radar.frames.length - 1 : latest);
    $("#radar-msg").textContent = "Regenradar der letzten 2 Stunden. ▶ startet die Animation.";
  } catch {
    $("#radar-msg").textContent = "Radar konnte nicht geladen werden. Bitte später erneut versuchen.";
  }
}

// ---------- Tabs ----------

function setTab(tab) {
  document.body.dataset.tab = tab;
  $$(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  ["wetter", "radar", "psalm", "warn"].forEach((t) => ($(`#view-${t}`).hidden = t !== tab));
  store("tab", tab);
  window.scrollTo(0, 0);
  if (tab === "wetter") renderChart();
  if (tab === "radar") initRadar();
  else if (radar.timer) toggleRadarPlay(false);
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
      if (seq === searchSeq) $("#search-results").replaceChildren(el("li", "empty", "Suche nicht möglich (offline?)"));
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

// ---------- Push-Warnungen (ntfy) ----------

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
      const btn = el("button", "btn", "Kopieren");
      btn.addEventListener("click", () => copyTopic(ort.topic, btn));
      li.append(grow, btn);
      return li;
    })
  );
  $("#alerts-card").hidden = false;
}

// ---------- Start ----------

$$(".tabbar button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
$$("#chart-seg button").forEach((b) => {
  b.classList.toggle("on", b.dataset.m === state.chart);
  b.addEventListener("click", () => {
    state.chart = b.dataset.m;
    store("chartMetric", state.chart);
    $$("#chart-seg button").forEach((x) => x.classList.toggle("on", x === b));
    renderChart();
  });
});
$("#psalm-prev").addEventListener("click", () => shiftPsalm(-1));
$("#psalm-next").addEventListener("click", () => shiftPsalm(1));
$("#psalm-today").addEventListener("click", () => shiftPsalm(0));
$("#psalm-share").addEventListener("click", sharePsalm);
$("#psalm-copy").addEventListener("click", copyPsalm);
$("#font-up").addEventListener("click", () => setFontSize(2));
$("#font-down").addEventListener("click", () => setFontSize(-2));
$("#verse-card").addEventListener("click", () => {
  shiftPsalm(0);
  setTab("psalm");
});
$("#warn-banner").addEventListener("click", () => setTab("warn"));
$("#radar-play").addEventListener("click", () => toggleRadarPlay());
$("#btn-locate").addEventListener("click", locate);
$("#btn-refresh").addEventListener("click", () => state.place && showPlace(state.place));
$("#btn-search").addEventListener("click", openSearch);
$("#search-input").addEventListener("input", onSearchInput);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderChart, 150);
});

loadPsalms().catch(() => {
  $("#psalm-ref").textContent = "Psalm konnte nicht geladen werden";
});
loadAlerts().catch(() => {});

setTab(store("tab") || "wetter");

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
    renderVerse();
  }
  if (state.place) showPlace(state.place);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
