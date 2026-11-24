"use strict";

// ---------- Hilfsfunktionen ----------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    const json = JSON.stringify(value);
    try {
      localStorage.setItem(key, json);
    } catch {
      pruneWeatherCache(0); // Speicher voll: alte Wetterdaten weg, dann noch einmal
      localStorage.setItem(key, json);
    }
  } catch {
    return null;
  }
}

// Zwischengespeicherte Wetterdaten ("wx:Breite,Länge") nur für die zuletzt gezeigten Orte
// behalten. Beim Folgen des Standorts käme sonst mit jedem Ortswechsel ein Eintrag dazu,
// bis der Speicher voll ist und sich gar nichts mehr merken lässt.
function pruneWeatherCache(keep, except) {
  try {
    const entries = Object.keys(localStorage)
      .filter((k) => k.startsWith("wx:") && k !== except)
      .map((k) => {
        let t = 0;
        try {
          t = JSON.parse(localStorage.getItem(k)).t || 0;
        } catch {}
        return [k, t];
      })
      .sort((a, b) => b[1] - a[1]);
    for (const [k] of entries.slice(keep)) localStorage.removeItem(k);
  } catch {}
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
// Sekunden -> [Stunden, Minuten], gerundet auf ganze Minuten (nie "8 h 60 min")
const hoursMinutes = (sec) => {
  const total = Math.round((sec || 0) / 60);
  return [Math.floor(total / 60), total % 60];
};

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

// Neon-Symbol (Sprite aus gta-art.js) je Wettercode
function wiId(code, isDay) {
  if (code <= 1) return isDay ? "wi-sun" : "wi-moon";
  if (code === 2) return isDay ? "wi-partly-day" : "wi-partly-night";
  if (code === 45 || code === 48) return "wi-fog";
  if ([56, 57, 66, 67].includes(code)) return "wi-freezing";
  if (code >= 51 && code <= 55) return "wi-drizzle";
  if (code === 65 || code === 82) return "wi-heavy-rain";
  if ((code >= 61 && code <= 64) || code === 80 || code === 81) return "wi-rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "wi-snow";
  if (code === 96 || code === 99) return "wi-hail";
  if (code >= 95) return "wi-storm";
  return "wi-cloudy";
}
const wiSvg = (id, label) =>
  `<svg class="wi" viewBox="0 0 48 48" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><use href="#${id}"/></svg>`;

function wmo(code, isDay = true) {
  const [text, day, night, sky] = WMO[code] || ["Unbekannt", "🌡️", "🌡️", "cloudy"];
  return { text, icon: isDay ? day : night, wi: wiId(code, isDay), sky: `${sky}-${isDay ? "day" : "night"}` };
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

// ---------- Breaking News Fussball ----------

// Eigene Illustration: Stadion bei Nacht mit Flutlicht, Rasen und fliegendem Ball
function newsArtSvg(accent) {
  const stands = Array.from({ length: 46 }, (_, i) => {
    const x = i * 14;
    const hgt = 18 + ((i * 37) % 11);
    return `<rect x="${x}" y="${150 - hgt}" width="12" height="${hgt}" rx="2" fill="#0d1428"/>`;
  }).join("");
  const crowd = Array.from({ length: 120 }, (_, i) => {
    const x = (i * 53) % 640;
    const y = 124 + ((i * 29) % 22);
    return `<circle cx="${x}" cy="${y}" r="1.3" fill="${i % 7 === 0 ? accent : "#3a4a72"}" opacity="0.7"/>`;
  }).join("");
  return `<svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b1d"/><stop offset="1" stop-color="#1a1240"/></linearGradient>
    <linearGradient id="npitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f5c35"/><stop offset="1" stop-color="#06301c"/></linearGradient>
    <linearGradient id="ncone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.55"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>
    <radialGradient id="nglow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${accent}" stop-opacity="0.55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <linearGradient id="nscan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="ntrail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent}" stop-opacity="0"/><stop offset="1" stop-color="${accent}" stop-opacity="0.8"/></linearGradient>
    <clipPath id="nclip"><rect width="640" height="320"/></clipPath>
  </defs>
  <g clip-path="url(#nclip)">
    <rect width="640" height="320" fill="url(#nsky)"/>
    <circle cx="470" cy="70" r="140" fill="url(#nglow)"/>
    <!-- Flutlichtmasten -->
    <g class="flood"><polygon points="70,40 -60,320 260,320" fill="url(#ncone)"/></g>
    <g class="flood b"><polygon points="570,40 380,320 700,320" fill="url(#ncone)"/></g>
    <g fill="#c9d4ff"><rect x="54" y="22" width="32" height="18" rx="3"/><rect x="554" y="22" width="32" height="18" rx="3"/></g>
    <g fill="#fffbe6">${[0, 1, 2, 3].map((k) => `<circle cx="${60 + k * 7}" cy="31" r="2.4"/><circle cx="${560 + k * 7}" cy="31" r="2.4"/>`).join("")}</g>
    <rect x="68" y="40" width="4" height="110" fill="#1b2442"/><rect x="568" y="40" width="4" height="110" fill="#1b2442"/>
    <!-- Tribüne mit Zuschauern und Blitzlichtern -->
    ${stands}${crowd}
    <circle class="flash" cx="150" cy="130" r="3" fill="#fff"/><circle class="flash b" cx="420" cy="134" r="3" fill="#fff"/><circle class="flash c" cx="300" cy="128" r="3" fill="#fff"/>
    <!-- Spielfeld in Perspektive -->
    <polygon points="120,150 520,150 680,320 -40,320" fill="url(#npitch)"/>
    ${[0, 1, 2, 3, 4, 5].map((k) => `<polygon points="${120 + k * 66.7},150 ${120 + (k + 0.5) * 66.7},150 ${-40 + (k + 0.5) * 120},320 ${-40 + k * 120},320" fill="#ffffff" opacity="0.035"/>`).join("")}
    <g fill="none" stroke="#e9fff2" stroke-opacity="0.6" stroke-width="2">
      <polygon points="120,150 520,150 680,320 -40,320"/>
      <line x1="320" y1="150" x2="320" y2="320"/>
      <ellipse cx="320" cy="222" rx="70" ry="22"/>
      <polygon points="250,150 390,150 404,170 236,170"/>
    </g>
    <!-- Tor -->
    <g stroke="#ffffff" stroke-width="3" fill="none"><path d="M290 150 V128 H350 V150"/></g>
    <g stroke="#ffffff" stroke-opacity="0.25" stroke-width="1"><path d="M296 130 V150 M304 130 V150 M312 130 V150 M320 130 V150 M328 130 V150 M336 130 V150 M344 130 V150 M292 136 H348 M292 143 H348"/></g>
    <!-- Ball mit Flugspur -->
    <g class="ball">
      <path d="M150 268 Q 260 170 368 196" stroke="url(#ntrail)" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="378" cy="198" r="22" fill="${accent}" opacity="0.25"/>
      <g class="ball-spin">
        <circle cx="378" cy="198" r="15" fill="#ffffff"/>
        <polygon points="378,190 385,195 382,203 374,203 371,195" fill="#101828"/>
        <path d="M378 183 v7 M392 194 l-7 1 M387 210 l-5 -7 M369 210 l5 -7 M364 194 l7 1" stroke="#101828" stroke-width="2"/>
      </g>
    </g>
    <rect class="scan" width="640" height="90" fill="url(#nscan)"/>
    <rect width="640" height="320" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>
  </g></svg>`;
}

const NEWS_ACCENTS = {
  "Champions League": "#4d9bff",
  "Europa League": "#ff8a3d",
  "Conference League": "#3ddc97",
  "WM": "#ffd34d",
  "EM": "#4dd2ff",
  "Nationalteam": "#ff4d6a",
  "Transfer": "#3ddc97",
  "Trainer": "#c77dff",
  "Premier League": "#c77dff",
  "La Liga": "#ff7a3d",
  "Serie A": "#4d9bff",
  "Bundesliga": "#ff4d4d",
  "Super League": "#ff4d6a",
};

function timeAgo(iso) {
  if (!iso || isNaN(new Date(iso))) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  return h < 24 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} Tg.`;
}

async function loadNews() {
  const res = await fetch("news.json", { cache: "no-cache" });
  if (!res.ok) return;
  const n = await res.json();
  if (!n.title) return;
  const accent = NEWS_ACCENTS[n.topic] || "#ffd34d";
  const card = $("#news-card");
  if (n.url) card.href = n.url;
  else card.removeAttribute("href");
  card.style.setProperty("--news-accent", accent);
  $("#news-art").innerHTML = newsArtSvg(accent);
  $("#news-topic").textContent = `${n.emoji || "⚽"} ${n.topic || "Top-Meldung"}`;
  $("#news-title").textContent = n.title;
  $("#news-teaser").textContent = n.teaser || "";
  $("#news-teaser").hidden = !n.teaser;
  $("#news-source").textContent = `Quelle: ${n.source}`;
  $("#news-age").textContent = n.published ? timeAgo(n.published) : "";
  const track = $("#news-ticker-track");
  track.replaceChildren();
  // Zweimal hintereinander, damit das Laufband nahtlos weiterläuft
  for (let k = 0; k < 2; k++) {
    track.append(el("b", null, "⚽ BREAKING"), n.title.toUpperCase(), el("b", null, "●"), (n.source || "").toUpperCase());
  }
  card.hidden = false;
}

// ---------- GTA 6: Tipp des Tages ----------

const GTA_CATS = [
  ["tipps", "💡", "Tipps", "#ffd34d"],
  ["cheats", "🎮", "Cheats", "#3ddcff"],
  ["orte", "🗺️", "Orte", "#3ddc97"],
  ["autos", "🏎️", "Autos", "#ff8a3d"],
  ["waffen", "🔫", "Waffen", "#ff4d6a"],
  ["geld", "💰", "Geld", "#7dff8a"],
];

const gta = { data: null, sel: "heute" };
const gtaColor = (key) => (GTA_CATS.find((c) => c[0] === key) || [])[3] || "#ff3d8b";
// Neon-Symbol eines Themas (Sprite aus gta-art.js), unbekannte Themen bekommen den Stern
const gtaIcon = (key) => {
  const k = GTA_CATS.some((c) => c[0] === key) ? key : "heute";
  return html("span", "gta-ico", `<svg class="wi" viewBox="0 0 48 48" aria-hidden="true"><use href="#cat-${k}"/></svg>`);
};
// Thema mit Symbol und Text (Text aus den Daten, deshalb als Textknoten)
const gtaLabel = (key, text) => [gtaIcon(key), document.createTextNode(text)];

function gtaLink(m) {
  const a = el("a");
  a.href = m.url;
  a.target = "_blank";
  a.rel = "noopener";
  a.style.setProperty("--c", gtaColor(m.category));
  const label = el("span", "gta-more-cat");
  label.append(...gtaLabel(m.category, m.label || "GTA 6"));
  a.append(label, el("span", "gta-more-title", m.title), el("span", "gta-more-src mono", m.source));
  const li = el("li");
  li.append(a);
  return li;
}

// Angezeigter Schwerpunkt: "heute" = Tipp des Tages, sonst die Artikel der gewählten Kategorie
function renderGta() {
  const d = gta.data;
  const cats = d.cats || {};
  const list = gta.sel === "heute" ? null : cats[gta.sel] || [];
  const t = list ? list[0] : d.top;
  const cat = GTA_CATS.find((c) => c[0] === (list ? gta.sel : t.category));
  const accent = cat ? cat[3] : "#ff3d8b";
  $("#gta-card").style.setProperty("--gta-accent", accent);
  $("#gta-art").innerHTML = GtaArt.svg(accent, list ? gta.sel : "heute");
  $("#gta-kicker").textContent = list ? `GTA 6 · ${cat[2].toUpperCase()}` : "GTA 6 · TIPP DES TAGES";

  const link = $("#gta-link");
  if (t) {
    link.href = t.url;
    link.classList.remove("empty");
    $("#gta-topic").replaceChildren(...gtaLabel(list ? gta.sel : t.category, t.label || "News"));
    $("#gta-title").textContent = t.title;
    $("#gta-teaser").textContent = t.teaser || "";
    $("#gta-teaser").hidden = !t.teaser;
    $("#gta-source").textContent = `Quelle: ${t.source}`;
    $("#gta-age").textContent = timeAgo(t.published);
  } else {
    link.removeAttribute("href");
    link.classList.add("empty");
    $("#gta-topic").replaceChildren(...gtaLabel(cat[0], cat[2]));
    $("#gta-title").textContent = "Gerade keine Artikel zu diesem Thema";
    $("#gta-teaser").textContent = "Schau später wieder vorbei – die Artikel werden alle paar Stunden neu gesammelt.";
    $("#gta-teaser").hidden = false;
    $("#gta-source").textContent = "";
    $("#gta-age").textContent = "";
  }

  // Darunter: weitere Artikel der Kategorie bzw. beim Tagestipp je Schwerpunkt der beste
  const more = list ? list.slice(1) : d.more || [];
  $("#gta-more").replaceChildren(...more.map(gtaLink));
  $("#gta-more").hidden = !more.length;

  $$("#gta-cats button").forEach((b) => {
    const on = b.dataset.k === gta.sel;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
  });
}

function selectGta(key) {
  gta.sel = key;
  renderGta();
  const on = $("#gta-cats .on");
  const box = $("#gta-cats");
  if (on) box.scrollTo({ left: on.offsetLeft - box.offsetLeft - 14, behavior: "smooth" });
}

async function loadGta() {
  const res = await fetch("gta6.json", { cache: "no-cache" });
  if (!res.ok) return;
  const d = await res.json();
  if (!d.top || !d.top.title) return;
  gta.data = d;
  const cats = d.cats || {};
  // Chips: Tipp des Tages und die sechs Schwerpunkte, jeder einzeln antippbar
  $("#gta-cats").replaceChildren(
    ...[["heute", "⭐", "Heute"], ...GTA_CATS].map(([key, , name]) => {
      const b = el("button");
      b.append(...gtaLabel(key, name));
      b.type = "button";
      b.dataset.k = key;
      b.style.setProperty("--c", gtaColor(key));
      if (key !== "heute" && d.cats && !(cats[key] || []).length) b.classList.add("none");
      if (key === d.focus) b.title = "Schwerpunkt heute";
      b.addEventListener("click", () => selectGta(key));
      return b;
    })
  );
  if (gta.sel !== "heute" && !(cats[gta.sel] || []).length) gta.sel = "heute";
  renderGta();
  $("#gta-card").hidden = false;
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

// fetch mit Zeitlimit, damit die App bei schlechtem Netz nicht endlos lädt
function fetchT(url, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

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
      "visibility", "pressure_msl", "uv_index",
    ].join(","),
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max",
      "precipitation_sum", "sunrise", "sunset", "uv_index_max", "wind_gusts_10m_max", "daylight_duration",
    ].join(","),
  });
  const res = await fetchT(`${FORECAST_URL}?${params}`);
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
  const res = await fetchT(`${AIR_URL}?${params}`, 10000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Index der zuletzt begonnenen Stunde (z. B. 14:00 bei 14:45)
function hourStart(w) {
  const key = w.current.time.slice(0, 13);
  const i = w.hourly.time.findIndex((t) => t.slice(0, 13) >= key);
  return i < 0 ? 0 : i;
}

// Index der nächsten vollen Stunde nach "jetzt". Mengen wie Niederschlag gelten
// bei Open-Meteo für die vorausgehende Stunde, der Wert um 15:00 also für 14–15 Uhr.
function nextHour(w) {
  const i = w.hourly.time.findIndex((t) => t > w.current.time);
  return i < 0 ? w.hourly.time.length - 1 : i;
}

// Stündlichen Wert auf die aktuelle Uhrzeit interpolieren (z. B. Taupunkt, UV)
function nowValue(w, key) {
  const h = w.hourly;
  if (!h[key]) return null; // z. B. ältere zwischengespeicherte Daten ohne dieses Feld
  const s = hourStart(w);
  const a = h[key][s];
  const b = h[key][Math.min(s + 1, h[key].length - 1)];
  if (a == null || b == null) return a ?? b ?? null;
  const frac = (parseLocal(w.current.time) - parseLocal(h.time[s])) / 3600000;
  return a + (b - a) * clamp(frac, 0, 1);
}

// ---------- Warnungen (gleiche Schwellen wie scripts/warnungen.py) ----------

function computeWarnings(w) {
  const h = w.hourly;
  const start = nextHour(w);
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
    add(hail ? "wi-hail" : "wi-storm", hail ? "Gewitter mit Hagel" : "Gewitter", hail, h.time[storm[0]],
      hail ? "Gewitter mit Hagel möglich." : "Blitz, Starkregen und Böen möglich.");
  }

  const gust = Math.max(...idx.map((i) => h.wind_gusts_10m[i] || 0));
  if (gust >= 50) {
    const label = gust >= 120 ? "Orkanböen" : gust >= 105 ? "Orkanartige Böen" : gust >= 90 ? "Schwere Sturmböen" : gust >= 75 ? "Sturmböen" : gust >= 60 ? "Starke Windböen" : "Windböen";
    add("wi-wind", label, gust >= 90, first((i) => (h.wind_gusts_10m[i] || 0) >= 50), `Böen bis ${round(gust)} km/h.`);
  }

  const tmax = Math.max(...idx.map((i) => h.temperature_2m[i]));
  if (tmax >= 30) {
    add("wi-heat", tmax >= 35 ? "Starke Hitze" : "Hitze", tmax >= 35, first((i) => h.temperature_2m[i] >= 30),
      `Bis ${round(tmax)} °C. Viel trinken, Mittagssonne meiden.`);
  }

  const tmin = Math.min(...idx.map((i) => h.temperature_2m[i]));
  if (tmin <= -10) {
    add("wi-cold", tmin <= -15 ? "Sehr strenger Frost" : "Strenger Frost", tmin <= -15, first((i) => h.temperature_2m[i] <= -10),
      `Bis ${round(tmin)} °C. Warm anziehen, Leitungen schützen.`);
  }

  const snow = idx.reduce((s, i) => s + (h.snowfall[i] || 0), 0);
  if (snow >= 3) {
    add("wi-flake", snow >= 25 ? "Extrem starker Schneefall" : snow >= 10 ? "Starker Schneefall" : "Schneefall", snow >= 10,
      first((i) => (h.snowfall[i] || 0) > 0), `Etwa ${round(snow)} cm Neuschnee in 24 Stunden.`);
  }

  const wet = (i) => (h.rain[i] || 0) + (h.showers[i] || 0) + (h.snowfall[i] || 0) > 0;
  const freezing = first((i) => [56, 57, 66, 67].includes(h.weather_code[i]));
  if (freezing) {
    add("wi-ice", "Glatteis", true, freezing, "Gefrierender Regen – Straßen können spiegelglatt werden.");
  } else {
    add("wi-ice", "Glättegefahr", false,
      // Niederschlag um den Gefrierpunkt oder Nässe der letzten 3 Stunden, die bei Frost überfriert
      first((i) => (h.temperature_2m[i] <= 1 && wet(i)) || (h.temperature_2m[i] <= 0 && [1, 2, 3].some((k) => i - k >= 0 && wet(i - k)))),
      "Nässe oder Schnee um den Gefrierpunkt – Vorsicht auf Wegen.");
  }
  return out;
}

// Höchste Unwetterstufe im HUD oben und gross auf der Warnseite
function setWanted(list) {
  const n = list.length ? Math.max(...list.map((x) => +warnStars(x).dataset.n)) : 0;
  const fill = (node) => {
    node.replaceChildren("★".repeat(n), el("i", null, "★".repeat(5 - n)));
    node.setAttribute("aria-label", `Unwetterstufe ${n} von 5`);
    node.dataset.n = n;
  };
  fill($("#hud-stars"));
  fill($("#wanted-stars"));
  $("#wanted").classList.toggle("on", n > 0);
  $("#wanted-label").textContent = n ? (list.length === 1 ? list[0].label : `${list.length} Warnungen`) : "Keine Unwetter";
  $("#wanted-sub").textContent = `Unwetterstufe ${n} von 5`;
}

// Unwetterstufe als Fahndungssterne (GTA-Look): Warnung 2, Unwetter 4, extrem 5 von 5
function warnStars(x) {
  const n = x.severe ? (/Orkan|Extrem|Sehr strenger|Hagel/.test(x.label) ? 5 : 4) : 2;
  const s = el("span", "stars", "★".repeat(n));
  s.append(el("i", null, "★".repeat(5 - n)));
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", `Stufe ${n} von 5`);
  s.dataset.n = n;
  return s;
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

  setWanted(list);
  if (!list.length) {
    banner.hidden = true;
    badge.hidden = true;
    $("#warn-list").replaceChildren(html("li", null, `<span class="ico">${wiSvg("wi-ok")}</span><div><b class="ok">Keine Warnungen</b><small>Für die nächsten 24 Stunden ist kein Unwetter vorhergesagt.</small></div>`));
    return;
  }

  const severe = list.some((x) => x.severe);
  banner.hidden = false;
  banner.className = `warn-banner${severe ? " danger" : ""}`;
  banner.replaceChildren(html("span", "ico", wiSvg(list[0].icon)));
  const g = el("span", "grow", list.length === 1 ? list[0].label : `${list.length} Wetterwarnungen`);
  g.append(el("small", null, list.length === 1 ? whenText(list[0].when) : list.map((x) => x.label).join(" · ")));
  // Höchste Stufe aller Warnungen als Sterne
  const top = list.map(warnStars).sort((a, b) => b.dataset.n - a.dataset.n)[0];
  banner.append(g, top, el("span", null, "›"));
  badge.hidden = false;
  badge.textContent = list.length;

  $("#warn-list").replaceChildren(
    ...list.map((x) => {
      const li = el("li");
      const body = el("div");
      const b = el("b", null, x.label);
      b.append(el("span", `lv ${x.severe ? "lv2" : "lv1"}`, x.severe ? "UNWETTER" : "WARNUNG"));
      body.append(b, warnStars(x), el("small", null, `${whenText(x.when)} · ${x.text}`));
      li.append(html("span", "ico", wiSvg(x.icon)), body);
      return li;
    })
  );
}

// ---------- Darstellung Wetter ----------

const state = { place: null, w: null, air: null, chart: store("chartMetric") || "temp" };

// Kurzer Überblick über die nächsten Stunden: Temperatur, Niederschlag, Wind
function daySummary(w) {
  const h = w.hourly;
  const cur = w.current;
  const start = nextHour(w);
  const idx = [];
  for (let i = start; i < Math.min(start + 12, h.time.length); i++) idx.push(i);
  if (!idx.length) return "";
  const hourNow = +cur.time.slice(11, 13);
  const parts = [];

  // Temperatur: tagsüber der Höchstwert, abends der Tiefstwert der Nacht
  const temps = idx.map((i) => h.temperature_2m[i]);
  const evening = idx.find((i) => +h.time[i].slice(11, 13) === 19);
  if (hourNow >= 5 && hourNow < 12) parts.push(`Heute bis ${round(Math.max(w.daily.temperature_2m_max[0], cur.temperature_2m))}°`);
  else if (hourNow >= 12 && hourNow < 17 && evening !== undefined) parts.push(`Am Abend um ${round(h.temperature_2m[evening])}°`);
  else parts.push(`In der Nacht bis ${round(Math.min(cur.temperature_2m, ...temps))}°`);

  // Niederschlag: Der Wert einer Stunde gilt für die Stunde davor
  const wet = (i) => (h.precipitation[i] || 0) >= 0.2 && (h.precipitation_probability[i] ?? 100) >= 40;
  const hourBefore = (i) => `${(+h.time[i].slice(11, 13) + 23) % 24} Uhr`;
  // Art nach dem aktuellen Wetter bzw. nach der Stunde, in der es losgeht
  const snowNow = [71, 73, 75, 77, 85, 86].includes(cur.weather_code);
  const raining = cur.weather_code >= 51 && cur.weather_code !== 77;
  const firstWet = idx.find(wet);
  if (raining) {
    const kind = snowNow ? "Schnee" : "Regen";
    const firstDry = idx.find((i) => !wet(i));
    // Ist schon die laufende Stunde trocken gerechnet, hört es bald auf (keine Uhrzeit in der Vergangenheit)
    parts.push(firstDry === undefined ? `${kind} hält an` : firstDry === start ? `${kind} hört bald auf` : `${kind} bis etwa ${hourBefore(firstDry)}`);
  } else if (firstWet !== undefined) {
    const kind = (h.snowfall[firstWet] || 0) > 0 ? "Schnee" : "Regen";
    parts.push(firstWet === start ? `gleich ${kind}` : `${kind} ab etwa ${hourBefore(firstWet)}`);
  } else {
    parts.push("trocken");
  }

  // Wind nur, wenn er auffällt
  const gust = Math.max(cur.wind_gusts_10m || 0, ...idx.map((i) => h.wind_gusts_10m[i] || 0));
  if (gust >= 45) parts.push(`Böen bis ${round(gust)} km/h`);
  return `${parts.join(" · ")}.`;
}

function renderHero(w) {
  const cur = w.current;
  const now = wmo(cur.weather_code, cur.is_day === 1);
  document.body.dataset.sky = now.sky;
  WeatherFx.set({
    code: cur.weather_code,
    isDay: cur.is_day === 1,
    wind: cur.wind_speed_10m,
    windDir: cur.wind_direction_10m,
    cloud: cur.cloud_cover,
  });
  $("#hero-icon").innerHTML = wiSvg(now.wi, now.text);
  $("#temp").textContent = `${round(cur.temperature_2m)}°`;
  $("#condition").textContent = now.text;
  $("#summary").textContent = daySummary(w);
  $("#h-max").textContent = `${round(Math.max(w.daily.temperature_2m_max[0], cur.temperature_2m))}°`;
  $("#h-min").textContent = `${round(Math.min(w.daily.temperature_2m_min[0], cur.temperature_2m))}°`;
  $("#h-feel").textContent = `${round(cur.apparent_temperature)}°`;
  $("#hud-temp").textContent = `${round(cur.temperature_2m)}°`;
  // Regenwahrscheinlichkeit für den Rest des heutigen Tages (nicht für bereits vergangene Stunden)
  const h = w.hourly;
  const today = w.current.time.slice(0, 10);
  const rest = [];
  for (let i = nextHour(w); i < h.time.length && h.time[i].slice(0, 10) === today; i++) rest.push(h.precipitation_probability[i] ?? 0);
  if (h.time[nextHour(w)]?.slice(0, 10) !== today) rest.push(h.precipitation_probability[nextHour(w)] ?? 0);
  $("#h-rain").textContent = `${Math.max(0, ...rest)}%`;
  renderStats(w, Math.max(0, ...rest));
}

// Statistiken wie die Fähigkeiten im Spiel: Wert als Balken aus 10 Segmenten
function renderStats(w, rainPct) {
  const cur = w.current;
  const air = state.air && state.air.current;
  const uv = Math.max(0, nowValue(w, "uv_index") ?? 0);
  const rows = [
    ["Jetzt", cur.temperature_2m, -10, 35, `${round(cur.temperature_2m)}°`],
    ["Gefühlt", cur.apparent_temperature, -10, 35, `${round(cur.apparent_temperature)}°`],
    ["Max", Math.max(w.daily.temperature_2m_max[0], cur.temperature_2m), -10, 35, `${round(Math.max(w.daily.temperature_2m_max[0], cur.temperature_2m))}°`],
    ["Min", Math.min(w.daily.temperature_2m_min[0], cur.temperature_2m), -10, 35, `${round(Math.min(w.daily.temperature_2m_min[0], cur.temperature_2m))}°`],
    ["Regen", rainPct, 0, 100, `${rainPct}%`],
    ["Wind", cur.wind_speed_10m, 0, 100, `${round(cur.wind_speed_10m)} km/h`],
    ["Böen", cur.wind_gusts_10m || 0, 0, 120, `${round(cur.wind_gusts_10m || 0)} km/h`],
    ["Feuchte", cur.relative_humidity_2m, 0, 100, `${cur.relative_humidity_2m}%`],
    ["UV", uv, 0, 11, uv.toFixed(1)],
  ];
  if (air && air.european_aqi != null) rows.push(["Luft", air.european_aqi, 0, 100, `${round(air.european_aqi)} AQI`]);
  $("#gstats-list").replaceChildren(
    ...rows.map(([label, v, lo, hi, text]) => {
      const n = clamp(Math.round(((v - lo) / (hi - lo)) * 10), v > lo ? 1 : 0, 10);
      const row = el("div", "gstat");
      const bar = el("span", "gbar");
      for (let k = 0; k < 10; k++) bar.append(el("i", k < n ? "on" : null));
      bar.setAttribute("aria-hidden", "true");
      row.append(el("span", "gl", label), bar, el("span", "gv", text));
      return row;
    })
  );
  $("#gstats").hidden = false;
  $("#sum-stats").textContent = `${round(cur.temperature_2m)}° · Regen ${rainPct}%`;
}

function renderNowcast(w) {
  const m = w.minutely_15;
  // Jeder Wert gilt für die vorausgehenden 15 Minuten: "15:15" = 15:00–15:15.
  // Angezeigt wird deshalb der Beginn des Zeitfensters.
  const start = m ? m.time.findIndex((t) => t > w.current.time) : -1;
  if (start < 0) {
    $("#nowcast-text").textContent = "Keine Kurzfristvorhersage verfügbar.";
    $("#nowcast-sum").textContent = "";
    $("#nowcast").replaceChildren();
    return;
  }
  const begin = (t) => {
    const d = new Date(parseLocal(t).getTime() - 15 * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const slots = m.time.slice(start, start + 8).map((t, k) => ({ t: begin(t), v: m.precipitation[start + k] || 0 }));
  const max = Math.max(0.5, ...slots.map((s) => s.v));
  const sum = slots.reduce((s, x) => s + x.v, 0);
  const snowCodes = [71, 73, 75, 77, 85, 86];
  const kind = snowCodes.includes(w.current.weather_code) || w.current.temperature_2m <= 0.5 ? "Schnee" : "Regen";

  let text;
  const wet = kind === "Schnee" ? "wi-snow" : "wi-rain";
  let ico = wet;
  // Spuren unter 0.05 mm (Rundungsrauschen) zählen nicht als Niederschlag
  const firstWet = slots.findIndex((s) => s.v >= 0.05);
  if (firstWet < 0) {
    ico = "wi-umbrella";
    text = `Kein ${kind} in den nächsten 2 Stunden.`;
  } else if (firstWet === 0) {
    const dry = slots.findIndex((s) => s.v < 0.05);
    if (kind === "Regen" && dry < 0) ico = "wi-heavy-rain";
    text = dry < 0 ? `${kind} hält mindestens 2 Stunden an.` : `${kind} lässt gegen ${slots[dry].t} Uhr nach.`;
  } else text = `${kind} ab etwa ${slots[firstWet].t} Uhr erwartet.`;

  $("#nowcast-text").replaceChildren(html("span", "nc-ico", wiSvg(ico)), document.createTextNode(text));
  // Bleibt es trocken, reicht der Satz – keine leeren Balken
  $("#nowcast").hidden = firstWet < 0;
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
  const cur = w.current;
  // Punkt 0 = jetzt (aktuelle Werte), danach die nächsten 24 vollen Stunden
  const start = nextHour(w);
  const idx = [];
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) idx.push(i);
  const n = idx.length + 1;
  // Seitlicher Rand, damit die Beschriftungen am Anfang und Ende nicht abgeschnitten werden
  const x = (k) => 18 + (k * (W - 36)) / (n - 1);
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
    if (labelUnit !== null) {
      const hi = vals.indexOf(Math.max(...vals));
      const lo = vals.indexOf(Math.min(...vals));
      // alle 3 Stunden beschriften; Höchst- und Tiefstwert ersetzen die Nachbarbeschriftung,
      // damit sich keine Zahlen überlappen
      const marks = new Set(vals.map((_, k) => k).filter((k) => k % 3 === 0));
      for (const k of [hi, lo]) {
        if (k % 3 === 0) continue;
        marks.delete(k % 3 === 1 ? k - 1 : k + 1);
        marks.add(k);
      }
      vals.forEach((v, k) => {
        if (marks.has(k)) {
          s += `<circle cx="${x(k)}" cy="${y(v)}" r="2.5" fill="${color}"/>`;
          s += `<text class="val" x="${x(k)}" y="${y(v) - 6}" text-anchor="middle">${round(v)}${labelUnit}</text>`;
        }
      });
    }
    return s;
  };

  if (state.chart === "temp") {
    svg += line([cur.temperature_2m, ...idx.map((i) => h.temperature_2m[i])], "var(--accent)", false, "°");
  } else if (state.chart === "wind") {
    const gusts = [cur.wind_gusts_10m || 0, ...idx.map((i) => h.wind_gusts_10m[i] || 0)];
    const speed = [cur.wind_speed_10m || 0, ...idx.map((i) => h.wind_speed_10m[i] || 0)];
    // gemeinsame Skala für Wind und Böen
    const min = Math.min(...speed, ...gusts);
    const max = Math.max(...gusts, ...speed);
    svg += line(gusts, "var(--accent-2)", true, null, min, max);
    svg += line(speed, "var(--accent)", false, "", min, max);
    svg += `<text x="${W - 4}" y="12" text-anchor="end">km/h · - - Böen bis ${round(max)}</text>`;
  } else {
    // Balken zwischen den Stunden: der Wert um 15:00 gilt für 14–15 Uhr
    const bw = Math.max(3, (W - 16) / n - 3);
    const maxMm = Math.max(1, ...idx.map((i) => h.precipitation[i] || 0));
    idx.forEach((i, j) => {
      const k = j + 0.5;
      const p = h.precipitation_probability[i] || 0;
      const mm = h.precipitation[i] || 0;
      const ph = ((bottom - top) * p) / 100;
      svg += `<rect x="${x(k) - bw / 2}" y="${bottom - ph}" width="${bw}" height="${ph}" rx="2" fill="var(--rain)" opacity="0.28"/>`;
      const mh = ((bottom - top) * mm) / maxMm;
      if (mm > 0) svg += `<rect x="${x(k) - bw / 2}" y="${bottom - mh}" width="${bw}" height="${mh}" rx="2" fill="var(--rain)"/>`;
      if (j % 3 === 0 && p > 0) svg += `<text class="val" x="${x(k)}" y="${bottom - ph - 4}" text-anchor="middle">${p}%</text>`;
    });
    const total = idx.reduce((s, i) => s + (h.precipitation[i] || 0), 0);
    svg += `<text x="${W - 4}" y="12" text-anchor="end">hell % · kräftig mm · Σ ${total.toFixed(1)} mm</text>`;
  }

  svg += `<text x="${x(0)}" y="${H - 4}" text-anchor="middle">jetzt</text>`;
  idx.forEach((i, j) => {
    if ((j + 1) % 3 === 0) svg += `<text x="${x(j + 1)}" y="${H - 4}" text-anchor="middle">${h.time[i].slice(11, 13)}</text>`;
  });
  box.innerHTML = `${svg}</svg>`;
}

function renderHourly(w) {
  const h = w.hourly;
  const cur = w.current;
  const start = nextHour(w);
  const items = [];
  const item = (cls, label, wi, temp, p) => {
    const node = el("div", cls);
    node.append(el("span", "t", label), html("span", "i", wiSvg(wi)), el("span", "v", `${round(temp)}°`), el("span", "p", p >= 20 ? `${p}%` : ""));
    return node;
  };
  items.push(item("hour now", "JETZT", wmo(cur.weather_code, cur.is_day === 1).wi, cur.temperature_2m, h.precipitation_probability[start]));
  for (let i = start; i < Math.min(start + 23, h.time.length); i++) {
    items.push(item("hour", `${h.time[i].slice(11, 13)}h`, wmo(h.weather_code[i], h.is_day[i] === 1).wi, h.temperature_2m[i], h.precipitation_probability[i]));
  }
  $("#hourly").replaceChildren(...items);
  // Vorschau in der zugeklappten Kopfzeile: Spanne der nächsten 24 Std. und Regenrisiko
  const next = h.temperature_2m.slice(start, start + 24).concat(cur.temperature_2m);
  const rain = Math.max(0, ...h.precipitation_probability.slice(start, start + 24));
  $("#sum-verlauf").textContent = `${round(Math.min(...next))}° bis ${round(Math.max(...next))}°${rain >= 20 ? ` · Regen ${rain}%` : ""}`;
}

function renderDaily(w) {
  const d = w.daily;
  $("#sum-tage").textContent = `${round(Math.min(...d.temperature_2m_min))}° bis ${round(Math.max(...d.temperature_2m_max))}°`;
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
      row.append(el("span", "n", name), html("span", "i", wiSvg(info.wi, info.text)), el("span", "p", p >= 20 ? `${p}%` : ""), range);

      const [hours, mins] = hoursMinutes(d.daylight_duration[i]);
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
      row.setAttribute("aria-expanded", "false");
      row.addEventListener("click", () => {
        detail.hidden = !detail.hidden;
        row.setAttribute("aria-expanded", String(!detail.hidden));
      });
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
  return { icon, name, illum, toFull, phase };
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
  const groups = { wind: [], feuchte: [], sonne: [], luft: [] };
  const put = (g, t) => groups[g].push(t);

  // Wind
  const wind = tile("WIND");
  wind.append(html("div", null, compassSvg(cur.wind_direction_10m)));
  wind.append(html("div", "tile-big", `${round(cur.wind_speed_10m)}<small> km/h</small>`));
  wind.append(el("div", "tile-sub", `Aus ${dirName(cur.wind_direction_10m)} · Böen ${round(cur.wind_gusts_10m)} km/h · ${beaufort(cur.wind_speed_10m)} Bft`));
  put("wind", wind);

  // Luftfeuchte & Taupunkt
  const hum = tile("FEUCHTE");
  hum.append(html("div", "tile-big", `${cur.relative_humidity_2m}<small> %</small>`));
  const dew = nowValue(w, "dew_point_2m");
  const feel = dew >= 21 ? "drückend schwül" : dew >= 18 ? "schwül" : dew >= 16 ? "leicht schwül" : dew >= 10 ? "angenehm" : "trocken";
  if (dew != null) hum.append(el("div", "tile-sub", `Taupunkt ${round(dew)}° · ${feel}`));
  const meter = html("div", "meter", `<i style="left:${cur.relative_humidity_2m}%"></i>`);
  meter.style.background = "linear-gradient(90deg,#ffb020,#3ddc97,#4da3ff)";
  hum.append(meter);
  hum.append(el("div", "tile-sub", `Bewölkung ${cur.cloud_cover} %`));
  put("feuchte", hum);

  // Luftdruck mit Tendenz
  const press = tile("LUFTDRUCK");
  // Barometrische Tendenz wie am Barometer: Änderung der letzten 3 Stunden.
  // Kurz nach Mitternacht fehlen die Vorstunden, dann die nächsten 3 Stunden.
  // Für die Differenz durchgehend die Stundenreihe verwenden (gleiche Datenbasis)
  const nowP = cur.pressure_msl;
  const series = h.pressure_msl || [];
  const seriesNow = nowValue(w, "pressure_msl") ?? nowP;
  const past = s >= 3 ? series[s - 3] : null;
  const diff = past != null ? seriesNow - past : (series[Math.min(s + 3, series.length - 1)] ?? seriesNow) - seriesNow;
  const span = past != null ? "letzte 3 h" : "nächste 3 h";
  const trend = diff >= 3 ? "⇈ stark steigend" : diff >= 1 ? "↗ steigend" : diff <= -3 ? "⇊ stark fallend" : diff <= -1 ? "↘ fallend" : "→ stabil";
  const hint = diff <= -3 ? " · Wetterverschlechterung möglich" : nowP >= 1020 && diff > -1 ? " · Hochdruck" : nowP < 1000 ? " · Tiefdruck" : "";
  press.append(html("div", "tile-big", `${round(nowP)}<small> hPa</small>`));
  press.append(el("div", "tile-sub", `${trend} (${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} hPa, ${span})${hint}`));
  put("wind", press);

  // Sichtweite
  const visM = nowValue(w, "visibility");
  if (visM != null) {
    const vis = tile("SICHT");
    const km = visM / 1000;
    const kmText = km >= 10 ? round(km) : km.toFixed(1);
    vis.append(html("div", "tile-big", `${km < 1 ? round(km * 1000) : kmText}<small> ${km < 1 ? "m" : "km"}</small>`));
    vis.append(el("div", "tile-sub", km >= 20 ? "Sehr gute Fernsicht" : km >= 10 ? "Gute Sicht" : km >= 4 ? "Mäßige Sicht (Dunst)" : km >= 1 ? "Schlechte Sicht (Dunst)" : "Nebel – sehr schlechte Sicht"));
    put("feuchte", vis);
  }

  // UV
  const uvT = tile("UV-INDEX");
  const uvLabel = (v) => (v < 3 ? "Niedrig" : v < 6 ? "Mäßig" : v < 8 ? "Hoch" : v < 11 ? "Sehr hoch" : "Extrem");
  const uvNow = Math.max(0, nowValue(w, "uv_index") ?? 0);
  const uvMax = d.uv_index_max[0] ?? 0;
  uvT.append(html("div", "tile-big", `${uvNow.toFixed(1)}<small> jetzt</small>`));
  uvT.append(el("div", "tile-sub", `${uvLabel(uvNow)} · Max heute ${uvMax.toFixed(1)} (${uvLabel(uvMax)})${uvMax >= 3 ? " · Sonnenschutz empfohlen" : ""}`));
  uvT.append(html("div", "meter", `<i style="left:${clamp(uvNow / 11, 0, 1) * 100}%"></i>`));
  put("sonne", uvT);

  // Mond
  const moon = moonPhase();
  const moonT = tile("MOND");
  const moonImg = typeof GtaArt !== "undefined" ? GtaArt.moonPhase(moon.phase) : moon.icon;
  moonT.append(html("div", "tile-big", `${moonImg} <small>${round(moon.illum * 100)} %</small>`));
  moonT.append(el("div", "tile-sub", `${moon.name}${moon.toFull > 0.5 ? ` · Vollmond in ${round(moon.toFull)} Tagen` : ""}`));
  put("sonne", moonT);

  // Sonne
  const sun = tile("SONNE", "wide");
  sun.append(html("div", null, sunArcSvg(w)));
  const [dlH, dlM] = hoursMinutes(d.daylight_duration[0]);
  sun.append(html("div", "kv", `<span>Aufgang</span><b>${fmtTime(d.sunrise[0])}</b><span>Untergang</span><b>${fmtTime(d.sunset[0])}</b><span>Tageslänge</span><b>${dlH} h ${dlM} min</b>`));
  put("sonne", sun);

  // Luftqualität & Pollen
  if (air && air.current) {
    const a = air.current;
    const aqi = a.european_aqi ?? 0;
    const levels = [[20, "Gut", 1], [40, "Ziemlich gut", 1], [60, "Mäßig", 2], [80, "Schlecht", 3], [100, "Sehr schlecht", 4], [Infinity, "Extrem schlecht", 4]];
    const [, aqiText, aqiLvl] = levels.find(([l]) => aqi < l);
    const aq = tile("LUFTQUALITÄT", "wide");
    aq.append(html("div", "tile-big", `${round(aqi)} <small class="lvl-${aqiLvl}">${aqiText}</small>`));
    aq.append(html("div", "meter", `<i style="left:${clamp(aqi / 120, 0, 1) * 100}%"></i>`));
    aq.append(html("div", "kv", `<span>Feinstaub PM2.5</span><b>${round(a.pm2_5 ?? 0)} µg/m³</b><span>Feinstaub PM10</span><b>${round(a.pm10 ?? 0)} µg/m³</b><span>Ozon O₃</span><b>${round(a.ozone ?? 0)} µg/m³</b><span>Stickstoffdioxid NO₂</span><b>${round(a.nitrogen_dioxide ?? 0)} µg/m³</b>`));
    aq.lastChild.style.marginTop = "12px";
    put("luft", aq);

    const pollen = Object.entries(POLLEN).filter(([k]) => a[k] !== null && a[k] !== undefined);
    if (pollen.length) {
      const pl = tile("POLLENFLUG", "wide");
      // Stufen in Pollen/m³ je Art (angelehnt an MeteoSchweiz: schwach, mässig, stark, sehr stark)
      const limits = {
        alder_pollen: [10, 70, 300], birch_pollen: [10, 70, 300], grass_pollen: [20, 50, 150],
        mugwort_pollen: [6, 15, 50], olive_pollen: [20, 50, 200], ragweed_pollen: [6, 11, 40],
      };
      const level = (k, v) => {
        if (v < 1) return ["keine", 0];
        const [m, s, vs] = limits[k];
        return v < m ? ["schwach", 1] : v < s ? ["mäßig", 2] : v < vs ? ["stark", 3] : ["sehr stark", 4];
      };
      const active = pollen.filter(([k]) => a[k] >= 1);
      const rows = active.map(([k, name]) => {
        const [txt, lv] = level(k, a[k]);
        return `<span>${name}</span><b class="lvl-${lv}">${txt}${lv ? ` · ${round(a[k])}/m³` : ""}</b>`;
      });
      if (active.length) pl.append(html("div", "kv", rows.join("")));
      else pl.append(el("div", "tile-sub", `Zurzeit kein Pollenflug (${pollen.map(([, name]) => name).join(", ")}).`));
      put("luft", pl);
    }
  }

  for (const [g, list] of Object.entries(groups)) {
    $(`#grp-${g}`).replaceChildren(...list);
    $(`.wxg[data-k="${g}"]`).hidden = !list.length;
  }
  // Vorschau in den Kopfzeilen der zugeklappten Gruppen
  const sum = (k, text) => ($(`#sum-${k}`).textContent = text);
  sum("wind", `${round(cur.wind_speed_10m)} km/h · ${round(cur.pressure_msl)} hPa`);
  sum("feuchte", `${cur.relative_humidity_2m} %${visM != null ? ` · ${round(visM / 1000)} km` : ""}`);
  sum("sonne", `UV ${uvNow.toFixed(1)} · ↓ ${fmtTime(d.sunset[0])}`);
  sum("luft", air && air.current ? `AQI ${round(air.current.european_aqi ?? 0)}` : "");
}

function renderUpdated(t, live) {
  const time = new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const gps = state.place?.gps ? " · 📍" : ""; // kurz, passt auch auf kleine iPhones
  $("#updated").innerHTML = `${live ? '<span class="live">● LIVE</span>' : "○ OFFLINE"} · ${time}${gps}`;
}

function renderAll() {
  const { place, w, air } = state;
  $("#place").textContent = place.name;
  $("#place").classList.toggle("gps", Boolean(place.gps));
  if (!w) return;
  renderHero(w);
  renderWarnings(place, w);
  renderNowcast(w);
  renderChart();
  renderHourly(w);
  renderDaily(w);
  renderTiles(w, air);
  radar.center?.(place);
  intro.ready();
}

// Neuer Ort ohne zwischengespeicherte Daten: nicht die Werte des vorigen Orts unter
// dem neuen Namen stehen lassen
function clearWeatherView() {
  Object.assign(state, { w: null, air: null, fetchedAt: 0 });
  $("#hero-icon").textContent = "–";
  $("#temp").textContent = "--°";
  $("#condition").textContent = "Wird geladen …";
  $("#summary").textContent = "";
  ["#h-max", "#h-min", "#h-feel"].forEach((id) => ($(id).textContent = "--°"));
  $("#h-rain").textContent = "--%";
  $("#hud-temp").textContent = "--°";
  $("#gstats").hidden = true;
  $("#updated").textContent = "Lade …";
  $("#warn-banner").hidden = true;
  $("#warn-badge").hidden = true;
  $("#warn-list").replaceChildren();
  $("#nowcast-text").textContent = "";
  $("#nowcast-sum").textContent = "";
  ["#nowcast", "#chart", "#hourly", "#daily", "#tiles"].forEach((id) => $(id).replaceChildren());
}

const placeKey = (place) => `wx:${place.lat},${place.lon}`;

let loadSeq = 0;
async function showPlace(place) {
  const seq = ++loadSeq;
  const prev = state.place;
  state.place = place;
  store("place", place);
  $("#place").textContent = place.name;

  const cacheKey = placeKey(place);
  state.loading = cacheKey;
  const cached = store(cacheKey);
  if (cached && cached.w) {
    Object.assign(state, { w: cached.w, air: cached.air });
    renderAll();
    renderUpdated(cached.t, false);
  } else if (state.w && (!prev || placeKey(prev) !== cacheKey)) {
    clearWeatherView();
    renderAll();
  }

  $("#btn-refresh").classList.add("spin");
  try {
    const [w, air] = await Promise.all([fetchWeather(place), fetchAir(place).catch(() => null)]);
    if (seq !== loadSeq) return; // inzwischen anderer Ort gewählt
    const t = Date.now();
    pruneWeatherCache(5, cacheKey);
    store(cacheKey, { t, w, air });
    state.fetchedAt = t;
    Object.assign(state, { w, air });
    renderAll();
    renderUpdated(t, true);
    hideStatus();
  } catch {
    if (seq !== loadSeq) return;
    intro.ready();
    showStatus(cached ? "Offline – zeige zuletzt geladene Daten." : "Wetterdaten konnten nicht geladen werden.");
    if (!cached) {
      $("#condition").textContent = "Keine Verbindung";
      $("#updated").textContent = "○ OFFLINE";
    }
  } finally {
    if (seq === loadSeq) {
      state.loading = null;
      $("#btn-refresh").classList.remove("spin");
    }
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetchT(`${REVERSE_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=de`, 6000);
    const r = await res.json();
    // Die Gemeinde (Verwaltungsebene 8) ist genauer als die nächste Stadt
    const admin = ((r.localityInfo && r.localityInfo.administrative) || []).find((a) => a.adminLevel === 8);
    return (admin && admin.name) || r.city || r.locality || r.principalSubdivision || "Mein Standort";
  } catch {
    return "Mein Standort";
  }
}

// Standort folgen: Die App zeigt das Wetter am aktuellen Standort, bis ein Ort
// über die Suche gewählt wird. Der Standort-Knopf schaltet das Folgen wieder ein.
const followsGps = () => store("followGps") !== false;

function locate(silent = false) {
  if (!navigator.geolocation) {
    if (!silent) showStatus("Standortbestimmung wird nicht unterstützt.", 3000);
    if (!state.place) showPlace(DEFAULT_PLACE);
    return;
  }
  if (!silent) showStatus("Standort wird ermittelt …");
  $("#btn-locate").classList.add("busy");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      $("#btn-locate").classList.remove("busy");
      store("followGps", true);
      const lat = +pos.coords.latitude.toFixed(3);
      const lon = +pos.coords.longitude.toFixed(3);
      const cur = state.place;
      // Gleicher Standort mit frischen (oder gerade ladenden) Daten: nichts neu laden
      const moved = !cur || !cur.gps || Math.abs(cur.lat - lat) > 0.005 || Math.abs(cur.lon - lon) > 0.005;
      if (!moved && (Date.now() - (state.fetchedAt || 0) < 5 * 60 * 1000 || state.loading === placeKey(cur))) {
        if (!silent) hideStatus();
        return;
      }
      const name = moved ? await reverseGeocode(lat, lon) : cur.name;
      showPlace({ name, region: "Aktueller Standort", lat, lon, gps: true });
    },
    (err) => {
      $("#btn-locate").classList.remove("busy");
      if (!silent) {
        showStatus(
          err.code === 1
            ? "Standortzugriff ist ausgeschaltet. iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites → „Beim Verwenden“."
            : "Standort gerade nicht verfügbar – Ort über die Lupe suchen.",
          err.code === 1 ? 9000 : 4000
        );
      }
      if (!state.place) showPlace(DEFAULT_PLACE);
      else if (silent && Date.now() - (state.fetchedAt || 0) > 5 * 60 * 1000) showPlace(state.place);
    },
    // Genaue Ortung, damit Nachbargemeinden (z. B. Allschwil / Basel) richtig erkannt werden
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60 * 1000 }
  );
}

// Daten auffrischen: beim Folgen zuerst den Standort neu bestimmen
function refresh() {
  if (followsGps()) locate(true);
  else if (state.place) showPlace(state.place);
}

// ---------- Radar (RainViewer + Leaflet, wird erst bei Bedarf geladen) ----------

const radar = { map: null, frames: [], layers: [], pos: 0, timer: null, marker: null, center: null, kind: null, loadedAt: 0 };

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
  radar.layers.forEach((l, k) => l.setOpacity(k === radar.pos ? 0.7 : 0));
  const f = radar.frames[radar.pos];
  const t = new Date(f.time * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  $("#radar-time").textContent = `${t}${f.nowcast ? " · VORHERSAGE" : ""}`;
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

// Das Radar des Deutschen Wetterdienstes deckt Deutschland und die Grenzregion ab
// (Nordschweiz inkl. Basel). Ausserhalb davon kommt das weltweite RainViewer-Radar.
const inDwd = (p) => p.lat >= 47.0 && p.lat <= 55.0 && p.lon >= 5.8 && p.lon <= 15.0;

async function loadRadarFrames(place) {
  const kind = inDwd(place) ? "dwd" : "rv";
  if (radar.kind === kind && Date.now() - radar.loadedAt < 5 * 60000) return;
  toggleRadarPlay(false);
  radar.layers.forEach((l) => radar.map.removeLayer(l));
  radar.layers = [];
  radar.kind = kind;
  radar.loadedAt = Date.now();
  radar.frames = [];
  if (kind === "dwd") {
    // Amtliches Radar: letzte Stunde und Vorhersage für die nächste Stunde, alle 10 Minuten
    const step = 10 * 60000;
    const now = Math.floor((Date.now() - 4 * 60000) / (5 * 60000)) * 5 * 60000;
    radar.frames = [];
    for (let k = -6; k <= 6; k++) radar.frames.push({ time: (now + k * step) / 1000, nowcast: k > 0 });
    radar.layers = radar.frames.map((f) =>
      L.tileLayer.wms("https://maps.dwd.de/geoserver/dwd/wms", {
        layers: "dwd:Niederschlagsradar", format: "image/png", transparent: true, version: "1.3.0",
        time: new Date(f.time * 1000).toISOString(), tileSize: 512, opacity: 0, zIndex: 5,
      }).addTo(radar.map)
    );
    $("#radar-msg").textContent = "Amtliches Regenradar: letzte Stunde und Vorhersage für die nächste Stunde. ▶ startet die Animation.";
    $("#radar-src").textContent = "Deutscher Wetterdienst";
    $("#radar-src").href = "https://www.dwd.de/";
  } else {
    let data;
    try {
      const res = await fetchT("https://api.rainviewer.com/public/weather-maps.json", 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      radar.kind = null; // beim nächsten Öffnen erneut versuchen
      radar.loadedAt = 0;
      $("#radar-msg").textContent = "Radar konnte nicht geladen werden. Bitte später erneut versuchen.";
      throw err;
    }
    if (radar.kind !== kind) return; // inzwischen anderer Ort mit anderem Radar
    radar.frames = [...(data.radar?.past || []), ...(data.radar?.nowcast || []).map((f) => ({ ...f, nowcast: true }))];
    if (!radar.frames.length) {
      radar.kind = null;
      radar.loadedAt = 0;
      $("#radar-msg").textContent = "Gerade keine Radardaten verfügbar.";
      return;
    }
    radar.layers = radar.frames.map((f) =>
      L.tileLayer(`${data.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, maxNativeZoom: 7, maxZoom: 12, zIndex: 5 }).addTo(radar.map)
    );
    $("#radar-msg").textContent = "Regenradar der letzten 2 Stunden. ▶ startet die Animation.";
    $("#radar-src").textContent = "RainViewer";
    $("#radar-src").href = "https://www.rainviewer.com/";
  }
  $("#radar-slider").max = radar.layers.length - 1;
  const latest = radar.frames.findLastIndex((f) => !f.nowcast);
  showFrame(latest < 0 ? radar.frames.length - 1 : latest);
}

let radarInit = null;
async function initRadar() {
  if (radar.map) {
    radar.map.invalidateSize();
    loadRadarFrames(state.place || DEFAULT_PLACE).catch(() => {});
    return;
  }
  if (radarInit) return; // Leaflet lädt schon
  $("#radar-msg").textContent = "Radar wird geladen …";
  radarInit = buildRadar().finally(() => (radarInit = null));
}

async function buildRadar() {
  try {
    await loadLeaflet();
    // erst jetzt lesen: während des Ladens kann der Ort schon bestimmt worden sein
    const p = state.place || DEFAULT_PLACE;
    radar.map = L.map("map", { zoomControl: false, attributionControl: false, minZoom: 5, maxZoom: 12 }).setView([p.lat, p.lon], 8);
    L.control.zoom({ position: "topright", zoomInTitle: "Näher", zoomOutTitle: "Weiter weg" }).addTo(radar.map);
    // Karte: OpenStreetMap für die ganze Welt, darüber in der Schweiz und im Grenzgebiet
    // die amtliche Landeskarte von swisstopo (beide frei und ohne Schlüssel)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, className: "base-map" }).addTo(radar.map);
    const swiss = L.tileLayer("https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg", {
      minZoom: 7, maxZoom: 12, bounds: [[45.3, 5.0], [48.4, 11.6]], className: "base-map",
    });
    // Umschalter: ruhige Landeskarte oder Strassenkarte mit mehr Ortsnamen
    const setBase = (osm) => {
      store("radarOsm", osm);
      if (osm) radar.map.removeLayer(swiss);
      else swiss.addTo(radar.map);
      $("#radar-base").textContent = osm ? "Landeskarte" : "Mehr Orte";
    };
    setBase(store("radarOsm") === true);
    $("#radar-base").addEventListener("click", () => setBase(store("radarOsm") !== true));
    // Standort als Spielerpfeil (GTA-Look)
    const arrow = '<div class="me-dot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 L20.5 21 L12 16.5 L3.5 21 Z"/></svg></div>';
    radar.marker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: arrow, iconSize: [24, 24] }) }).addTo(radar.map);
    radar.center = (place) => {
      radar.map.setView([place.lat, place.lon], radar.map.getZoom());
      radar.marker.setLatLng([place.lat, place.lon]);
      if (document.body.dataset.tab === "radar") loadRadarFrames(place).catch(() => {});
    };
    $("#radar-slider").addEventListener("input", () => {
      toggleRadarPlay(false);
      showFrame(+$("#radar-slider").value);
    });
    await loadRadarFrames(p);
  } catch {
    $("#radar-msg").textContent = "Radar konnte nicht geladen werden. Bitte später erneut versuchen.";
  }
}

// ---------- FC Basel ----------

const FCB_SECTIONS = ["news", "kader", "ticker", "kurve", "chat"];

function setFcbSection(name) {
  if (!FCB_SECTIONS.includes(name)) name = "ticker";
  $$("#fcb-seg button").forEach((b) => b.classList.toggle("on", b.dataset.s === name));
  FCB_SECTIONS.forEach((s) => ($(`#fcb-${s}`).hidden = s !== name));
  if (name === "chat") openChat();
  store("fcbSection", name);
  if (name === "ticker") {
    if (Date.now() - feedsAt > 60000) loadFcb().catch(() => {});
    liveTick(true);
  }
}

// ---------- FCB live: Spielstand, Tore und Platzverweise aus dem SRF-Teletext ----------

const live = { timer: null, busy: false, data: null, fullAt: 0, toastTimer: null };
const MATCH_WINDOW = 125 * 60000; // Anpfiff bis Schlusspfiff inkl. Pause und Nachspielzeit
const DANI_GOAL = ["JAAAA, verdammt nomol! So goht das!", "Goooool! S Joggeli bebt, Kolleeg!", "Do isch er dinne! Rotblau, du geili Sau!", "Huere geil! Wyter so, Buebe!"];
const DANI_AGAINST = ["Gopferdammi nomol, wär deckt do?!", "Das darf doch nit wohr sy, huere Seich!", "Schlofe die hinde oder was?! Uffwache!", "Ich dräi düre! So eifach goht das nit!"];
const DANI_RED = ["Rot! Jetzt wird s heiss, Kolleeg!", "Platzverwiis! Das git no öbbis z rede!"];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const firstFixture = (texts) => {
  for (const t of texts) {
    const fx = FcbLive.parseFixture(t);
    if (fx) return fx;
  }
  return null;
};

async function liveLoad(full) {
  const fx = firstFixture(await FcbLive.page(202));
  const prev = live.data || {};
  const d = { fx, events: [], raw: "", table: prev.table || [], next: prev.next || null, score: null, live: false, soon: false, kickoff: null };
  if (fx) {
    const pair = `${fx.home}-${fx.away}`;
    if (fx.kickoff) store("fcbKickoff", { pair, t: fx.kickoff.getTime() });
    const ko = store("fcbKickoff");
    d.kickoff = ko && ko.pair === pair ? ko.t : null;
    const now = Date.now();
    const fresh = fx.updated && Math.abs(now - fx.updated.getTime()) < 25 * 60000;
    d.soon = Boolean(d.kickoff) && now > d.kickoff - 15 * 60000 && now < d.kickoff + MATCH_WINDOW;
    d.score = fx.score || null;
    // Telegramm des Spiels (Tore, Karten) auf den Seiten 205–210 suchen
    if (fx.score || d.soon) {
      const pages = await Promise.allSettled([205, 206, 207, 208, 209, 210].map((n) => FcbLive.page(n)));
      for (const p of pages) {
        const tfx = p.status === "fulfilled" && firstFixture(p.value);
        if (!tfx || tfx.home !== fx.home || tfx.away !== fx.away) continue;
        d.raw = (tfx.after || tfx.rest || "").replace(/\s+/g, " ").trim();
        d.events = FcbLive.parseTelegram("", { baselHome: fx.baselHome, after: tfx.after || tfx.rest });
        // Der neuere Stand zählt (Telegramm oder Resultatseite)
        const sum = (s) => (s ? s[0] + s[1] : -1);
        if (sum(tfx.score) > sum(d.score)) d.score = tfx.score;
        const lastGoal = d.events.filter((e) => e.type === "goal").pop();
        if (lastGoal) {
          const s = lastGoal.score.split(":").map(Number);
          if (sum(s) > sum(d.score)) d.score = s;
        }
        break;
      }
    }
    d.live = Boolean(d.score) && (d.kickoff ? now >= d.kickoff - 5 * 60000 && now <= d.kickoff + MATCH_WINDOW : Boolean(fresh));
  }
  // Tabelle und nächste Runde: selten nötig
  if (full || Date.now() - live.fullAt > 10 * 60000) {
    live.fullAt = Date.now();
    const [table, next] = await Promise.allSettled([FcbLive.page(203), FcbLive.page(217)]);
    if (table.status === "fulfilled") {
      const rows = FcbLive.parseTable(table.value.join(" "));
      if (rows.length >= 8) d.table = rows;
    }
    if (next.status === "fulfilled") d.next = firstFixture(next.value);
  }
  return d;
}

// Meldung bei Tor, Gegentor oder Platzverweis (in der Spielkarte und oben als Hinweis)
function matchToast(kind, title, text, dani) {
  const box = $("#match-toast");
  box.className = `match-toast ${kind}`;
  box.replaceChildren(el("b", null, title), document.createTextNode(text), el("i", null, `Dani: «${dani}»`));
  box.hidden = false;
  clearTimeout(live.toastTimer);
  live.toastTimer = setTimeout(() => (box.hidden = true), 3 * 60000);
  chatAdd(`${title} ${text} – ${dani}`); // steht auch im Chat mit Dani
  showStatus(`${title} ${text}`, 12000);
  const sc = $("#sb-score");
  sc.classList.remove("flash");
  void sc.offsetWidth;
  sc.classList.add("flash");
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// Änderungen seit dem letzten Abruf erkennen
function liveChanges(d) {
  const fx = d.fx;
  if (!fx) return;
  const key = `${fx.home}-${fx.away}`;
  const reds = d.events.filter((e) => e.type === "red");
  const old = store("fcbLive");
  const cur = { key, score: d.score || (fx.kickoff ? [0, 0] : null), reds: reds.length };
  store("fcbLive", cur);
  if (!old || old.key !== key || !old.score || !d.score || !d.live) return;
  const names = `${FcbLive.teamName(fx.home)} – ${FcbLive.teamName(fx.away)}`;
  const stand = `${names} ${d.score[0]}:${d.score[1]}`;
  const goals = d.events.filter((e) => e.type === "goal");
  const lastGoal = goals[goals.length - 1];
  const who = lastGoal && lastGoal.score === `${d.score[0]}:${d.score[1]}` ? ` (${lastGoal.min}. ${lastGoal.who})` : "";
  const mine = fx.baselHome ? 0 : 1;
  if (d.score[mine] > old.score[mine]) matchToast("good", "⚽ TOR für Basel!", `${stand}${who}`, pick(DANI_GOAL));
  else if (d.score[1 - mine] > old.score[1 - mine]) {
    const opp = FcbLive.teamName(fx.baselHome ? fx.away : fx.home);
    matchToast("bad", `Gegentor – ${opp} trifft`, `${stand}${who}`, pick(DANI_AGAINST));
  } else if (d.score[0] + d.score[1] < old.score[0] + old.score[1]) {
    matchToast("", "Tor aberkannt", `Neuer Stand: ${stand}`, "Was isch jetzt wider los?!");
  }
  if (reds.length > (old.reds || 0)) {
    const r = reds[reds.length - 1];
    matchToast("bad", "🟥 Platzverweis", `${r.min}. Minute: ${r.who} · ${stand}`, pick(DANI_RED));
  }
}

// Anpfiff in der Ortszeit des Geräts. Steht das iPhone nicht auf Schweizer Zeit
// (Ferien, Auswärtsfahrt), zusätzlich die Schweizer Zeit in Klammern.
const HHMM = { hour: "2-digit", minute: "2-digit" };
function kickoffTime(date) {
  const local = date.toLocaleTimeString("de-CH", HHMM);
  const swiss = date.toLocaleTimeString("de-CH", { ...HHMM, timeZone: FcbLive.TZ });
  const sameDay = date.toLocaleDateString("de-CH") === date.toLocaleDateString("de-CH", { timeZone: FcbLive.TZ });
  return local === swiss && sameDay ? `${local} Uhr` : `${local} Uhr (${swiss} Uhr Schweizer Zeit)`;
}

function fixtureWhen(date) {
  const day = date.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "numeric" });
  return `${day}, ${kickoffTime(date)}`;
}

function countdown(t) {
  const min = Math.round((t - Date.now()) / 60000);
  if (min <= 0) return "Anpfiff jeden Moment";
  if (min < 60) return `noch ${min} Min.`;
  if (min < 48 * 60) return `noch ${Math.round(min / 60)} Std.`;
  return `noch ${Math.round(min / 1440)} Tage`;
}

function renderLive(d) {
  const fx = d.fx;
  const card = $("#match-card");
  card.classList.toggle("live", d.live);
  const tag = $("#match-tag");
  tag.classList.toggle("on", d.live);
  tag.replaceChildren(...(d.live ? [el("i", "live-dot"), document.createTextNode("// LIVE")] : [document.createTextNode("// SPIEL")]));
  $("#match-meta").textContent = `Abruf ${new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  const status = $("#match-status");
  if (!fx) {
    $("#sb-home").textContent = "FC Basel";
    $("#sb-away").textContent = "–";
    $("#sb-score").textContent = "–:–";
    status.textContent = "In der aktuellen Runde ist kein FCB-Spiel angesetzt.";
  } else {
    for (const [id, team] of [["#sb-home", fx.home], ["#sb-away", fx.away]]) {
      $(id).textContent = FcbLive.teamName(team);
      $(id).classList.toggle("fcb", team === "Basel");
    }
    $("#sb-score").textContent = d.score ? `${d.score[0]}:${d.score[1]}` : "–:–";
    const half = fx.half ? ` · Halbzeit ${fx.half[0]}:${fx.half[1]}` : "";
    if (d.live) status.textContent = `Spiel läuft${d.kickoff ? ` · Anpfiff ${kickoffTime(new Date(d.kickoff))}` : ""}${half}`;
    else if (d.score) status.textContent = `Schlussresultat${half}`;
    else if (fx.kickoff) status.textContent = `${fixtureWhen(fx.kickoff)} · ${countdown(fx.kickoff.getTime())}`;
    else status.textContent = fx.note || "Noch kein Resultat";
  }
  // Tore und Platzverweise, neueste zuoberst
  $("#match-events").replaceChildren(
    ...d.events.slice().reverse().map((e) => {
      const li = el("li", e.type === "goal" && e.basel ? "fcb" : null);
      const text = el("div");
      text.append(el("b", null, e.who));
      if (e.type === "goal" && fx) text.append(el("small", null, e.basel ? "Tor für Basel" : `Tor für ${FcbLive.teamName(fx.baselHome ? fx.away : fx.home)}`));
      if (e.type === "red") text.append(el("small", null, "Platzverweis"));
      li.append(el("span", "min", `${e.min}.`), el("span", null, e.type === "goal" ? "⚽" : "🟥"), text, el("span", "sc", e.score || ""));
      return li;
    })
  );
  $("#match-raw-box").hidden = !d.raw || !d.score;
  $("#match-raw").textContent = d.raw;
  // Nächstes Spiel (aus der nächsten Runde), sobald das aktuelle vorbei ist oder fehlt
  const next = $("#match-next");
  const nx = d.next;
  const showNext = nx && nx.kickoff && nx.kickoff.getTime() > Date.now() && (!fx || !fx.kickoff) && !d.live;
  next.hidden = !showNext;
  if (showNext) {
    next.replaceChildren(el("small", null, "Nächstes Spiel"),
      document.createTextNode(`${FcbLive.teamName(nx.home)} – ${FcbLive.teamName(nx.away)} · ${fixtureWhen(nx.kickoff)}`));
  }
  // Tabelle
  $("#table-card").hidden = !d.table.length;
  $("#sl-table").replaceChildren(
    ...d.table.map((r) => {
      const tr = el("tr", r.team === "Basel" ? "fcb" : null);
      tr.append(el("td", null, `${r.rank}.`), el("td", null, FcbLive.teamName(r.team)), el("td", null, String(r.played)), el("td", null, r.goals), el("td", null, String(r.points)));
      return tr;
    })
  );
}

const tickerOpen = () => document.body.dataset.tab === "fcb" && !$("#fcb-ticker").hidden;

async function liveTick(full = false) {
  if (live.busy) return;
  live.busy = true;
  try {
    const d = await liveLoad(full);
    liveChanges(d);
    live.data = d;
    renderLive(d);
    renderKurveLage();
  } catch (err) {
    if (!live.data) $("#match-status").textContent = "Spielstand gerade nicht abrufbar (SRF-Teletext nicht erreichbar).";
  } finally {
    live.busy = false;
    liveNext();
  }
}

// Nächsten Abruf planen: 20 s rund ums Spiel, sonst selten
function liveNext() {
  clearTimeout(live.timer);
  if (document.visibilityState !== "visible") return;
  const d = live.data;
  let ms = d && (d.live || d.soon) ? 20000 : tickerOpen() ? 5 * 60000 : 30 * 60000;
  const ko = d && d.fx && d.fx.kickoff ? d.fx.kickoff.getTime() - 15 * 60000 - Date.now() : 0;
  if (ko > 0) ms = Math.min(ms, ko + 1000);
  live.timer = setTimeout(liveTick, ms);
}

function renderFcb(d) {
  chat.fcb = d;
  // News
  const news = d.news || [];
  $("#fcb-news-meta").textContent = d.updated ? `Stand ${new Date(d.updated).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "";
  $("#fcb-news-list").replaceChildren(
    ...(news.length
      ? news.map((n) => {
          const li = el("li");
          const a = el("a");
          a.href = n.url;
          a.target = "_blank";
          a.rel = "noopener";
          a.append(el("b", null, n.title), el("small", null, [n.source || "Quelle", timeAgo(n.published)].filter(Boolean).join(" · ")));
          li.append(a);
          return li;
        })
      : [el("li", "hint", "Gerade keine aktuellen FCB-Meldungen.")])
  );

  // Kader
  const squad = d.squad;
  if (squad) {
    $("#fcb-sub").textContent = `Männer · Super League${squad.season ? ` · ${squad.season}` : ""}`;
    $("#fcb-kader-meta").textContent = squad.stand ? `Stand ${squad.stand}` : "";
    $("#fcb-kader-src").href = squad.url;
    const parts = [];
    for (const g of squad.groups) {
      parts.push(el("div", "kader-group", `${g.group} (${g.players.length})`));
      for (const p of g.players) {
        const row = el("div", "kader-row");
        const info = el("div");
        info.append(el("div", "kader-name", `${p.name} ${p.flags || ""}`.trim()));
        const meta = [p.since && `seit ${p.since}`, p.from && (/^eigene/i.test(p.from) ? `aus der eigenen Jugend${p.from.replace(/^eigene Jugend/i, "")}` : `von ${p.from}`)].filter(Boolean).join(" · ");
        if (meta) info.append(el("div", "kader-meta", meta));
        row.append(el("span", "kader-nr", p.nr || "–"), info);
        parts.push(row);
      }
    }
    $("#fcb-kader-list").replaceChildren(...parts);
  } else {
    $("#fcb-kader-list").replaceChildren(el("p", "hint", "Kader gerade nicht verfügbar."));
  }

  // Spiel-Ticker
  const ticker = d.ticker || [];
  $("#ticker-meta").textContent = d.updated ? `Stand ${new Date(d.updated).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "";
  $("#ticker-list").replaceChildren(
    ...(ticker.length
      ? ticker.map((t) => {
          const li = el("li");
          const a = el("a");
          a.href = t.url;
          a.target = "_blank";
          a.rel = "noopener";
          const text = el("div");
          text.append(el("b", null, t.title));
          text.append(el("small", null, [t.source || "Quelle", timeAgo(t.published)].filter(Boolean).join(" · ")));
          a.append(el("span", `ticker-score${t.score ? "" : " none"}`, t.score || "⚽"), text);
          li.append(a);
          return li;
        })
      : [el("li", "hint", "Gerade keine Spielberichte. Nach FCB-Spielen erscheinen sie hier.")])
  );

  // Us dr Kurve & Gerüchteküche
  const feedList = (items, list, card) => {
    $(card).hidden = !items.length;
    $(list).replaceChildren(
      ...items.map((n) => {
        const li = el("li");
        const link = el("a");
        link.href = n.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.append(el("b", null, n.title), el("small", null, [n.source || "Quelle", timeAgo(n.published)].filter(Boolean).join(" · ")));
        li.append(link);
        return li;
      })
    );
  };
  feedList(d.kurve || [], "#kurve-feed", "#kurve-feed-card");
  feedList(d.rumors || [], "#rumor-feed", "#rumor-card");

  // Fiktiver Kurven-Experte
  if (d.expert) {
    $("#kurve-name").textContent = d.expert.name;
    $("#kurve-bio").textContent = d.expert.bio;
    $("#kurve-lines").replaceChildren(...d.expert.lines.map((l) => el("p", null, l)));
  }
  renderKurveLage();
}

// Dani zur aktuellen Lage (Spielstand, Resultat, nächstes Spiel, Tabelle) – live aus den App-Daten
function renderKurveLage() {
  if (typeof DaniChat === "undefined") return;
  $("#kurve-lage").replaceChildren(...DaniChat.lage(chatCtx()).map((l) => el("p", null, l)));
}

async function loadFcb() {
  const res = await fetch("fcb.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status);
  renderFcb(await res.json());
}

// ---------- Chat mit Dani (dani-chat.js): läuft ganz im Gerät ----------

const chat = { fcb: null, log: store("daniChat") || [], ready: false, typing: null, queue: [] };

function chatScroll() {
  const log = $("#chat-log");
  log.scrollTop = log.scrollHeight;
}

function chatAdd(text, me) {
  const m = { text, me: Boolean(me) };
  chat.log.push(m);
  chat.log = chat.log.slice(-60);
  store("daniChat", chat.log);
  $("#chat-log").insertBefore(el("p", me ? "me" : null, text), $("#chat-typing"));
  chatScroll();
}

// Dani "tippt" kurz, dann kommen seine Antworten nacheinander
function chatAnswer(lines) {
  chat.queue.push(...lines);
  if (chat.typing) return;
  const next = () => {
    chat.typing = null;
    $("#chat-typing").hidden = !chat.queue.length;
    if (!chat.queue.length) return;
    chatScroll();
    chat.typing = setTimeout(() => {
      chatAdd(chat.queue.shift());
      next();
    }, 450 + Math.min(900, chat.queue[0].length * 8));
  };
  next();
}

const chatCtx = () => ({ live: live.data, fcb: chat.fcb, w: state.w, place: state.place });

function chatSend(text) {
  text = text.trim();
  if (!text) return;
  if (chat.typing) {
    clearTimeout(chat.typing);
    chat.typing = null;
    while (chat.queue.length) chatAdd(chat.queue.shift());
  }
  chatAdd(text, true);
  chatAnswer(DaniChat.reply(text, chatCtx()));
}

function openChat() {
  if (!chat.ready) {
    chat.ready = true;
    const typing = el("p", "typing");
    typing.append(el("i"), el("i"), el("i"));
    typing.id = "chat-typing";
    typing.setAttribute("aria-label", "Dani schreibt");
    typing.hidden = true;
    $("#chat-log").replaceChildren(...chat.log.map((m) => el("p", m.me ? "me" : null, m.text)), typing);
    $("#chat-chips").replaceChildren(
      ...DaniChat.CHIPS.map((c) => {
        const b = el("button", null, c);
        b.type = "button";
        b.addEventListener("click", () => chatSend(c));
        return b;
      })
    );
    $("#chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      chatSend($("#chat-input").value);
      $("#chat-input").value = "";
    });
    $("#chat-clear").addEventListener("click", () => {
      clearTimeout(chat.typing);
      chat.typing = null;
      chat.queue = [];
      chat.log = [];
      store("daniChat", chat.log);
      $("#chat-log").replaceChildren($("#chat-typing"));
      chatAnswer(DaniChat.greeting(chatCtx()));
    });
    if (!chat.log.length) chatAnswer(DaniChat.greeting(chatCtx()));
  }
  chatScroll();
}

// ---------- Tabs ----------

const TABS = ["wetter", "radar", "psalm", "fcb", "warn"];

function setTab(tab) {
  if (!TABS.includes(tab)) tab = "wetter";
  document.body.dataset.tab = tab;
  $$(".tabbar button").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  TABS.forEach((t) => ($(`#view-${t}`).hidden = t !== tab));
  WeatherFx.restyle?.();
  store("tab", tab);
  window.scrollTo(0, 0);
  // Reiterleiste oben: den aktiven Reiter ins Bild schieben (schmale iPhones)
  const strip = $(".topbar .tabbar");
  const on = $(".topbar .tabbar .on");
  if (strip && on) strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
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
    store("followGps", false); // bewusst gewählter Ort bleibt, bis der Standort-Knopf getippt wird
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
let searchShown = ""; // Suchbegriff, zu dem die angezeigten Treffer gehören
function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = null;
  const q = $("#search-input").value.trim();
  if (q.length < 2) {
    searchSeq++; // noch laufende Suche nicht mehr anzeigen
    searchShown = "";
    $("#search-results").replaceChildren();
    return;
  }
  searchTimer = setTimeout(async () => {
    searchTimer = null;
    const seq = ++searchSeq;
    try {
      const res = await fetchT(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=8&language=de&format=json`, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      searchShown = q;
    } catch {
      if (seq === searchSeq) $("#search-results").replaceChildren(el("li", "empty", "Suche nicht möglich (offline?)"));
    }
  }, 300);
}

function openSearch() {
  renderSaved();
  $("#search-input").value = "";
  searchShown = "";
  $("#search-results").replaceChildren();
  $("#search-dialog").showModal();
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

// ---------- Ladebildschirm im GTA-Look ----------

// Beim Öffnen der App kurz ein Bild wie beim Laden im Spiel, mit einem Tipp zur App.
// Verschwindet, sobald das Wetter steht (frühestens nach 0,9 s, spätestens nach 3 s)
// oder beim Antippen. Nicht, wenn die App im FCB-Bereich startet.
const INTRO_TIPS = [
  "Tippe auf einen Tag der 7-Tage-Vorhersage, dann siehst du Regen, Böen, Sonne und UV.",
  "Der Vers des Tages führt direkt zum ganzen Psalm.",
  "Im Radar startet ▶ die Regenanimation.",
  "Unter „Warnungen“ kannst du Push-Nachrichten bei Unwetter abonnieren.",
  "Der Standort-Knopf oben schaltet das Folgen deines Standorts wieder ein.",
  "Beim GTA-Tipp kannst du jedes Thema einzeln antippen.",
  "Je höher die Unwetterstufe, desto mehr Sterne – wie die Fahndungsstufe im Spiel.",
];
const intro = { node: null, started: 0, ready() {} };

function showIntro() {
  if (store("tab") === "fcb" || typeof GtaArt === "undefined") return;
  const tip = INTRO_TIPS[Math.floor(Math.random() * INTRO_TIPS.length)];
  const node = html("div", "intro", `<div class="intro-art">${GtaArt.svg("#ff3d8b", "heute", new Date(), "in")}</div>
    <div class="intro-text"><div class="intro-title">Wetter <b>&amp;</b> Psalm</div><p class="intro-tip"><b>Tipp:</b> </p></div>
    <div class="intro-load"><i></i>Lädt</div>`);
  node.querySelector(".intro-tip").append(tip);
  node.setAttribute("aria-hidden", "true");
  document.body.append(node);
  intro.node = node;
  intro.started = Date.now();
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    node.classList.add("out");
    setTimeout(() => node.remove(), 450);
  };
  node.addEventListener("click", hide);
  intro.ready = () => setTimeout(hide, Math.max(0, 900 - (Date.now() - intro.started)));
  setTimeout(hide, 3000);
}

// ---------- Start ----------

// Wettergruppen: offen/zu merken (anfangs alle zu)
{
  const open = store("wxOpen2") || {};
  $$(".wxg").forEach((g) => {
    g.open = Boolean(open[g.dataset.k]);
    g.addEventListener("toggle", () => {
      open[g.dataset.k] = g.open;
      store("wxOpen2", open);
      // Diagramm braucht die echte Breite, die es erst aufgeklappt hat
      if (g.dataset.k === "verlauf" && g.open) renderChart();
    });
  });
}

// GTA-Look: Neon-Symbole (Sprite) und Hintergrund mit Retro-Sonne, Skyline und Palmen
// (im FCB-Tab ausgeblendet). Vor dem ersten Zeichnen, damit alle Symbole gleich erscheinen.
if (typeof GtaArt !== "undefined") {
  document.body.insertAdjacentHTML("afterbegin", GtaArt.sprite());
  $("#bg-scene").innerHTML = GtaArt.backdrop();
}
showIntro();

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
$("#btn-locate").addEventListener("click", () => locate());
$("#loc").addEventListener("click", openSearch);
$("#loc").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openSearch();
  }
});
$("#use-gps").addEventListener("click", () => {
  $("#search-dialog").close();
  locate();
});
$("#btn-refresh").addEventListener("click", () => {
  if (state.place) showPlace(state.place);
  if (followsGps()) locate(true); // beim Folgen auch den Standort neu bestimmen
  loadFeeds();
});
$("#btn-search").addEventListener("click", openSearch);
$("#search-input").addEventListener("input", onSearchInput);
// Enter / "Suchen" auf der Tastatur: sofort suchen statt den Dialog zu schliessen
// (das Formular mit method="dialog" würde ihn sonst beenden)
$("#search-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const first = $("#search-results li:not(.empty)");
  if (first && searchShown === $("#search-input").value.trim()) first.click();
  else {
    onSearchInput();
    $("#search-input").blur(); // Tastatur weg, Treffer sichtbar
  }
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderChart, 150);
});

loadPsalms().catch(() => {
  $("#psalm-ref").textContent = "Psalm konnte nicht geladen werden";
});
loadAlerts().catch(() => {});
// News, GTA-Tipp und FCB-Daten: werden auf dem Server alle paar Stunden neu erstellt
let feedsAt = 0;
function loadFeeds() {
  feedsAt = Date.now();
  loadNews().catch(() => {});
  loadGta().catch(() => {});
  loadFcb()
    .then(() => ($("#fcb-empty").hidden = true))
    .catch(() => ($("#fcb-empty").hidden = !!chat.fcb));
}
loadFeeds();
liveTick(); // Spielstand auch ausserhalb des FCB-Tabs im Blick behalten
$$("#fcb-seg button").forEach((b) => b.addEventListener("click", () => setFcbSection(b.dataset.s)));
setFcbSection(store("fcbSection") || "news");
fetch("version.json")
  .then((res) => res.json())
  .then((v) => {
    const date = new Date(v.date).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
    // Interne Vermerke der Commit-Zeile nicht anzeigen: "[ohne Nachricht]", Nummer des Pull Requests "(#8)"
    const title = String(v.title || "").replace(/\s*\[ohne Nachricht\]/gi, "").replace(/\s*\(#\d+\)\s*$/, "").trim();
    $("#version").textContent = `${v.version ? `Version ${v.version.replace(/^v/, "")} · ` : ""}Stand ${date}${title ? ` · Neu: ${title}` : ""}`;
    $("#version").hidden = false;
  })
  .catch(() => {});

const lastPlace = store("place");
if (lastPlace) {
  showPlace(lastPlace); // sofort die letzten Daten zeigen …
  if (followsGps()) locate(true); // … und im Hintergrund den aktuellen Standort holen
} else {
  locate();
}
// Erst nach dem Ort, damit z. B. das Radar gleich am richtigen Ort öffnet
setTab(store("tab") || "wetter");

// Neuer Tag (auch wenn die App über Mitternacht offen bleibt): Psalm und Vers des Tages wechseln
let lastDay = new Date().toDateString();
function checkNewDay() {
  if (new Date().toDateString() === lastDay) return;
  lastDay = new Date().toDateString();
  psalm.offset = 0;
  renderPsalm();
  renderVerse();
}

// Solange die App offen ist, alle 15 Minuten neue Daten laden
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  checkNewDay();
  if (state.place) refresh();
}, 15 * 60 * 1000);

// Beim Zurückkehren in die App: Daten und Tagespsalm aktualisieren
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  liveTick();
  if (Date.now() - feedsAt > 30 * 60 * 1000) loadFeeds();
  checkNewDay();
  // Nur neu laden, wenn die Daten älter als 5 Minuten sind (schont Akku und Datenvolumen)
  if (state.place && Date.now() - (state.fetchedAt || 0) > 5 * 60 * 1000) refresh();
});

if ("serviceWorker" in navigator) {
  // sw.js nie aus dem Zwischenspeicher, damit neue Versionen sofort erkannt werden
  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((reg) => {
      reg.update();
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && reg.update());
    })
    .catch(() => {});
  // Sobald eine neue Version aktiv wird, einmal neu laden, damit sie sofort sichtbar ist
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloaded) {
      reloaded = true;
      location.reload();
    }
  });
}
