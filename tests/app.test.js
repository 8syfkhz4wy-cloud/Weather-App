"use strict";

// Browser-Tests: die App auf einem simulierten iPhone (und anderen Bildschirmgrössen),
// alle externen Dienste nachgebaut. Start: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const { startServer, weather, mockNetwork, watchErrors, ttStamp, ROOT } = require("./helpers.js");

let browser;
let srv;
test.before(async () => {
  srv = await startServer();
  browser = await chromium.launch();
});
test.after(async () => {
  await browser?.close();
  srv?.server.close();
});

const BASEL = { latitude: 47.55, longitude: 7.55 };

// Neue App-Instanz. storage: Einträge, die vor dem Start im Speicher stehen (wie bei einem früheren Besuch)
async function openApp({ device = devices["iPhone 13"], viewport, storage, net, serviceWorkers = "block", wait = true, timezoneId = "Europe/Zurich" } = {}) {
  const ctx = await browser.newContext({ ...device, ...(viewport ? { viewport } : {}), geolocation: BASEL, permissions: ["geolocation"], serviceWorkers, locale: "de-CH", timezoneId });
  if (storage) {
    await ctx.addInitScript((entries) => {
      if (sessionStorage.getItem("__init")) return; // nur beim ersten Laden, nicht nach Reload
      sessionStorage.setItem("__init", "1");
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, JSON.stringify(v));
    }, storage);
  }
  await ctx.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector(".intro")) window.__intro = true;
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const ctl = await mockNetwork(page, net);
  await page.goto(srv.url);
  if (wait) await page.waitForFunction(() => document.querySelector("#temp").textContent !== "--°" && document.querySelectorAll("#daily li").length === 7);
  return { ctx, page, errors, ctl };
}

const text = async (page, sel) => (await page.locator(sel).first().textContent()).trim();

test("Startseite: Wetter, Kacheln, News und GTA-Tipp ohne Fehler", async () => {
  const { ctx, page, errors } = await openApp();
  assert.equal(await text(page, "#place"), "Allschwil");
  assert.match(await text(page, "#updated"), /LIVE/);
  assert.match(await text(page, "#temp"), /^-?\d+°$/);
  assert.ok((await text(page, "#summary")).length > 5);
  assert.equal(await page.locator("#hourly .hour").count(), 24);
  assert.equal(await page.locator("#nowcast .b").count(), 8);
  // Kacheln: Wind, Feuchte, Luftdruck, Sicht, UV, Mond, Sonne, Luftqualität, Pollen
  assert.equal(await page.locator("#tiles > .panel").count(), 9);
  const sun = await page.locator("#tiles .kv").first().innerText();
  assert.match(sun, /9 h 0 min/);
  assert.doesNotMatch(sun, /60 min/);
  assert.equal(await page.locator("#news-card").isVisible(), true);
  assert.equal(await page.locator("#gta-card").isVisible(), true);
  // Versionszeile ohne interne Vermerke der Commit-Nachricht
  assert.match(await text(page, "#version"), /^Version 9\.9\.9 · Stand .+ · Neu: Testversion$/);
  assert.match(await text(page, "#verse-ref"), /^PS \d+,\d+$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Diagramm, 7-Tage-Details und GTA-Themen reagieren auf Tippen", async () => {
  const { ctx, page, errors } = await openApp();
  for (const m of ["rain", "wind", "temp"]) {
    await page.click(`#chart-seg [data-m=${m}]`);
    assert.ok(await page.locator("#chart svg polyline, #chart svg rect").count() > 0, m);
  }
  const row = page.locator("#daily .day-row").nth(1);
  await row.click();
  assert.equal(await row.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator("#daily .day-detail").nth(1).isVisible(), true);
  // GTA: Illustration mit Sportwagen, Chips und Artikel in ihrer Themenfarbe
  assert.equal(await page.locator("#gta-art svg .ga-car").count(), 1);
  assert.equal(await page.locator('#gta-cats [data-k="geld"]').evaluate((b) => b.style.getPropertyValue("--c")), "#7dff8a");
  await page.click('#gta-cats [data-k="tipps"]');
  assert.match(await text(page, "#gta-kicker"), /TIPPS/);
  assert.equal(await page.locator("#gta-card").evaluate((c) => c.style.getPropertyValue("--gta-accent")), "#ffd34d");
  assert.match(await page.locator("#gta-art svg").innerHTML(), /stop-color="#ffd34d"/); // Lack in der Themenfarbe
  assert.equal(await page.locator("#gta-more a").first().evaluate((a) => a.style.getPropertyValue("--c")), "#ffd34d");
  assert.equal(await page.locator("#gta-more li").count(), 1);
  await page.click('#gta-cats [data-k="orte"]'); // Thema ohne Artikel
  assert.match(await text(page, "#gta-title"), /keine Artikel/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Warnungen: gleich wie das Push-Skript (scripts/warnungen.py)", async () => {
  const data = weather({ storm: true, hail: true, gust: 95, snow: 1 });
  const { ctx, page, errors } = await openApp({ net: { weather: { storm: true, hail: true, gust: 95, snow: 1 } } });
  await page.route(/api\.open-meteo\.com\/v1\/forecast/, (r) => r.fulfill({ json: data }));
  await page.click("#btn-refresh");
  await page.waitForFunction(() => !document.querySelector("#warn-banner").hidden);
  const appLabels = await page.$$eval("#warn-list li b", (bs) => bs.map((b) => b.firstChild.textContent.trim()));
  assert.equal(await text(page, "#warn-badge"), String(appLabels.length));
  assert.match(await page.locator("#warn-banner").getAttribute("class"), /danger/);

  const py = spawnSync("python3", ["-I", "-c", `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("w", sys.argv[1]); w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
print(json.dumps([x["label"] for x in w.find_warnings(json.load(sys.stdin))]))`, path.join(ROOT, "scripts/warnungen.py")], { input: JSON.stringify(data), encoding: "utf8" });
  assert.equal(py.status, 0, py.stderr);
  const pyLabels = JSON.parse(py.stdout);
  assert.deepEqual([...appLabels].sort(), [...pyLabels].sort());
  assert.ok(appLabels.includes("Gewitter mit Hagel") && appLabels.includes("Schwere Sturmböen") && appLabels.includes("Starker Schneefall"), appLabels.join());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Ortssuche: Enter sucht bzw. wählt den ersten Treffer, Dialog bleibt bis dahin offen", async () => {
  const { ctx, page, errors } = await openApp();
  await page.click("#btn-search");
  await page.fill("#search-input", "Zürich");
  await page.press("#search-input", "Enter");
  await page.waitForSelector("#search-results li");
  assert.equal(await page.evaluate(() => document.querySelector("#search-dialog").open), true);
  await page.press("#search-input", "Enter");
  await page.waitForFunction(() => document.querySelector("#place").textContent === "Zürich");
  assert.equal(await page.evaluate(() => document.querySelector("#search-dialog").open), false);
  // gewählter Ort wird gespeichert und das Folgen des Standorts beendet
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("followGps"))), false);
  await page.click("#btn-search");
  assert.match(await text(page, "#saved-list"), /Zürich/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Ortswechsel ohne Netz zeigt nicht die Daten des vorigen Orts", async () => {
  const { ctx, page, ctl } = await openApp({ net: { geocode: [{ name: "Oslo", country: "Norwegen", latitude: 59.91, longitude: 10.75 }] } });
  ctl.failForecast = true;
  await page.click("#btn-search");
  await page.fill("#search-input", "Oslo");
  await page.waitForSelector("#search-results li");
  await page.click("#search-results li");
  await page.waitForFunction(() => document.querySelector("#condition").textContent === "Keine Verbindung");
  assert.equal(await text(page, "#place"), "Oslo");
  assert.equal(await text(page, "#temp"), "--°");
  assert.equal(await page.locator("#daily li").count(), 0);
  assert.match(await text(page, "#updated"), /OFFLINE/);
  await ctx.close();
});

test("Start mit gespeichertem Standort: nur ein Wetterabruf, gespeicherter Tab bleibt", async () => {
  const storage = { place: { name: "Allschwil", region: "Aktueller Standort", lat: 47.55, lon: 7.55, gps: true }, tab: "psalm" };
  const { ctx, page, ctl, errors } = await openApp({ storage });
  await page.waitForTimeout(1500); // Standortbestimmung im Hintergrund abwarten
  assert.equal(ctl.forecastCalls, 1);
  assert.equal(await page.evaluate(() => document.body.dataset.tab), "psalm");
  assert.equal(await page.locator("#view-psalm").isVisible(), true);
  // Aktualisieren lädt neu, ebenfalls nur einmal
  await page.click("#btn-refresh");
  await page.waitForTimeout(1500);
  assert.equal(ctl.forecastCalls, 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Unbekannter gespeicherter Tab führt zur Wetterseite", async () => {
  const { ctx, page, errors } = await openApp({ storage: { tab: "gibtsnicht" } });
  assert.equal(await page.evaluate(() => document.body.dataset.tab), "wetter");
  assert.equal(await page.locator("#view-wetter").isVisible(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Psalm: Blättern, Heute, Schriftgrösse und Vers des Tages", async () => {
  const { ctx, page, errors } = await openApp();
  await page.click("#verse-card");
  assert.equal(await page.evaluate(() => document.body.dataset.tab), "psalm");
  assert.match(await text(page, "#psalm-date"), /^Heute · /);
  const today = await text(page, "#psalm-ref");
  const [n, total] = (await text(page, "#psalm-num")).split("/").map(Number);
  assert.equal(total, 171);
  assert.ok((await page.locator("#psalm-text p").count()) > 0);
  assert.equal(await page.locator("#psalm-today").isVisible(), false);
  await page.click("#psalm-next");
  assert.match(await text(page, "#psalm-date"), /^Morgen · /);
  assert.equal(Number((await text(page, "#psalm-num")).split("/")[0]), (n % 171) + 1);
  await page.click("#psalm-prev");
  await page.click("#psalm-prev");
  assert.match(await text(page, "#psalm-date"), /^Gestern · /);
  await page.click("#psalm-today");
  assert.equal(await text(page, "#psalm-ref"), today);
  const size = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--psalm-size").trim());
  await page.click("#font-up");
  assert.equal(await size(), "20px");
  for (let i = 0; i < 10; i++) await page.click("#font-up");
  assert.equal(await size(), "28px"); // Obergrenze
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("FCB: News, Kader, Live-Ticker mit Toren und Tabelle, Chat mit Dani", async () => {
  const { ctx, page, errors } = await openApp();
  await page.click(".tabbar [data-tab=fcb]");
  assert.equal(await page.locator("#fcb-news-list li").count(), 2);
  await page.click("#fcb-seg [data-s=kader]");
  assert.match(await text(page, "#fcb-kader-list"), /Albian Ajeti/);
  await page.click("#fcb-seg [data-s=ticker]");
  await page.waitForFunction(() => document.querySelector("#sb-score").textContent === "2:1");
  assert.equal(await text(page, "#sb-home"), "FC Basel");
  assert.equal(await text(page, "#sb-away"), "Young Boys");
  assert.equal(await page.locator("#match-events li").count(), 4); // 3 Tore, 1 Platzverweis
  await page.waitForFunction(() => document.querySelectorAll("#sl-table tr").length === 10);
  assert.equal(await page.locator("#sl-table tr.fcb").count(), 1);
  await page.click("#fcb-seg [data-s=kurve]");
  assert.equal(await page.locator("#kurve-feed li").count(), 1);
  assert.equal(await page.locator("#rumor-feed li").count(), 1);
  await page.click("#fcb-seg [data-s=chat]");
  await page.waitForFunction(() => document.querySelectorAll("#chat-log p:not(.typing)").length >= 2); // Begrüssung
  const before = await page.locator("#chat-log p:not(.typing)").count();
  await page.fill("#chat-input", "Tabelle");
  await page.press("#chat-input", "Enter");
  await page.waitForFunction((n) => document.querySelectorAll("#chat-log p:not(.typing)").length >= n + 2, before);
  assert.match(await page.locator("#chat-log p:not(.typing)").last().innerText(), /Platz 1/);
  assert.equal(await page.inputValue("#chat-input"), "");
  // Chat bleibt nach dem Neuladen erhalten
  await page.reload();
  await page.waitForSelector("#chat-log p.me");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Angesetztes Spiel am nächsten Samstag um 18:00 Schweizer Zeit, angezeigt auf iPhones in
// verschiedenen Zeitzonen. Erwartet: Ortszeit des Geräts, im Ausland mit Schweizer Zeit dahinter.
const FcbLive = require("../fcb-live.js");
function nextSaturdaySwiss() {
  const s = FcbLive.zurichParts(new Date());
  const wd = new Date(Date.UTC(s.y, s.mo, s.d)).getUTCDay();
  return FcbLive.zurichDate(s.y, s.mo, s.d + ((6 - wd + 7) % 7), 18, 0);
}
for (const tz of ["Europe/Zurich", "America/New_York", "Asia/Tokyo"]) {
  test(`FCB-Ticker: Anpfiff richtig auf einem iPhone mit Zeitzone ${tz}`, async (t) => {
    const kickoff = nextSaturdaySwiss();
    if (kickoff.getTime() < Date.now() + 3600e3) return t.skip("Samstagabend: Anpfiff schon vorbei oder zu nah");
    const local = kickoff.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    const expected = tz === "Europe/Zurich" ? /, 18:00 Uhr · noch/ : new RegExp(`, ${local} Uhr \\(18:00 Uhr Schweizer Zeit\\)`);
    const net = { teletext: { 202: () => `FUSSBALL ${ttStamp()} Super League Basel - YB SA 18.00 Uhr GC - Thun SO 14.00 Uhr` } };
    const { ctx, page, errors } = await openApp({ timezoneId: tz, net });
    await page.click(".tabbar [data-tab=fcb]");
    await page.click("#fcb-seg [data-s=ticker]");
    await page.waitForFunction(() => /Uhr/.test(document.querySelector("#match-status").textContent));
    const status = await text(page, "#match-status");
    assert.match(status, expected, status);
    if (/Europe/.test(tz)) assert.doesNotMatch(status, /Schweizer Zeit/);
    // Dani nennt die Schweizer Zeit
    await page.click("#fcb-seg [data-s=chat]");
    await page.waitForFunction(() => document.querySelectorAll("#chat-log p:not(.typing)").length >= 2); // Begrüssung
    const n = await page.locator("#chat-log p:not(.typing)").count();
    await page.fill("#chat-input", "Nächstes Spiel?");
    await page.press("#chat-input", "Enter");
    await page.waitForFunction((k) => document.querySelectorAll("#chat-log p:not(.typing)").length >= k + 2, n);
    assert.match(await page.locator("#chat-log p:not(.typing)").nth(n + 1).innerText(), /am Samschtig, .*um 18:00/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test("GTA-Look in allen Bereichen, der FCB-Inhalt bleibt rot-blau", async () => {
  const { ctx, page, errors } = await openApp();
  const look = () => page.evaluate(() => ({
    ortsname: getComputedStyle(document.querySelector("#place")).fontStyle,
    szene: getComputedStyle(document.querySelector("#bg-scene")).display,
    palmen: document.querySelectorAll("#bg-scene .bg-palms").length,
    sonne: document.querySelectorAll("#bg-scene .bg-sun").length,
  }));
  for (const tab of ["wetter", "radar", "psalm", "warn"]) {
    await page.click(`.tabbar [data-tab=${tab}]`);
    assert.deepEqual(await look(), { ortsname: "italic", szene: "block", palmen: 2, sonne: 1 }, tab);
  }
  // FCB: Rahmen (Kopf, Reiter) im GTA-Layout, Inhalt und Hintergrund wie bisher
  await page.click(".tabbar [data-tab=fcb]");
  assert.deepEqual(await look(), { ortsname: "italic", szene: "none", palmen: 2, sonne: 1 });
  const fcb = await page.evaluate(() => ({
    akzent: getComputedStyle(document.body).getPropertyValue("--accent").trim(),
    flaeche: getComputedStyle(document.body).getPropertyValue("--panel").trim(),
    panel: getComputedStyle(document.querySelector("#view-fcb .panel")).backgroundColor,
    rand: getComputedStyle(document.querySelector("#view-fcb .panel")).borderTopColor,
  }));
  assert.deepEqual(fcb, { akzent: "#ff3b4e", flaeche: "rgba(13, 20, 34, 0.66)", panel: "rgba(13, 20, 34, 0.66)", rand: "rgba(120, 200, 255, 0.14)" });
  // zurück: wieder GTA
  await page.click(".tabbar [data-tab=wetter]");
  assert.equal((await look()).szene, "block");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("GTA-Look: Neon-Symbole statt Emojis, Fahndungssterne, Ladebildschirm", async () => {
  const { ctx, page, errors } = await openApp({ net: { weather: { storm: true, hail: true, gust: 95 } } });
  // Ladebildschirm erscheint beim Start und verschwindet, sobald das Wetter steht
  assert.equal(await page.evaluate(() => window.__intro), true);
  await page.waitForFunction(() => !document.querySelector(".intro"), null, { timeout: 5000 });
  // Symbole aus dem Sprite statt Emojis
  assert.ok((await page.locator("body > svg symbol[id^='wi-']").count()) >= 20);
  assert.equal(await page.locator("#hero-icon svg.wi use").getAttribute("href"), "#wi-cloudy");
  assert.equal(await page.locator("#hourly svg.wi").count(), 24);
  assert.equal(await page.locator("#hourly .hour:not(.now) use").first().getAttribute("href"), "#wi-hail");
  assert.equal(await page.locator("#daily svg.wi").count(), 7);
  assert.equal(await page.locator("#nowcast-text svg.wi").count(), 1);
  assert.equal(await page.locator("#tiles .moonphase").count(), 1);
  // Die früheren Wetter-Emojis kommen in den Wetterbereichen nicht mehr vor
  const weatherText = await page.$$eval("#hero-icon, #hourly, #daily, #nowcast-text, #warn-banner, #warn-list, #tiles, .thresholds", (els) => els.map((e) => e.textContent).join(" "));
  assert.doesNotMatch(weatherText, /[☀🌤🌙⛅☁🌫🌦🌧🌨❄⛈🌡💨🥵🥶🧊✅☂🌑🌒🌓🌔🌕🌖🌗🌘]/u, "keine Wetter-Emojis mehr");
  // Fahndungssterne: Gewitter mit Hagel 5, Sturmböen 4, Banner zeigt die höchste Stufe
  const stars = await page.$$eval("#warn-list li", (lis) => lis.map((li) => [li.querySelector("b").firstChild.textContent, li.querySelector(".stars").dataset.n]));
  assert.deepEqual(Object.fromEntries(stars.filter(([l]) => /Hagel|Sturm/.test(l))), { "Gewitter mit Hagel": "5", "Schwere Sturmböen": "4" });
  assert.equal(await page.locator("#warn-banner .stars").getAttribute("data-n"), "5");
  // Überschriften ohne "//" (ausser im FCB-Bereich), Schrift im GTA-Look
  const tags = await page.$$eval(".view:not(#view-fcb) .tag", (t) => t.map((x) => x.textContent));
  assert.ok(tags.length >= 9 && tags.every((t) => !t.startsWith("//")), tags.join());
  assert.ok((await page.$$eval("#view-fcb .tag", (t) => t.map((x) => x.textContent))).every((t) => t.startsWith("//")));
  assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /^"Avenir Next"/);
  await page.click(".tabbar [data-tab=fcb]");
  assert.doesNotMatch(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /Avenir Next/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("GTA-Layout: HUD-Kopf mit Reitern, Statistiken, Fahndung, Briefing", async () => {
  const { ctx, page, errors } = await openApp({ net: { weather: { storm: true, hail: true, gust: 95 } } });
  await page.waitForFunction(() => !document.querySelector(".intro"), null, { timeout: 5000 });
  // Reiter oben im Kopf, HUD mit Temperatur und Fahndungssternen
  assert.equal(await page.locator(".topbar .tabbar button").count(), 5);
  assert.equal(await text(page, "#hud-temp"), await text(page, "#temp"));
  assert.equal(await page.locator("#hud-stars").getAttribute("data-n"), "5");
  const top = await page.evaluate(() => document.querySelector(".tabbar").getBoundingClientRect().top);
  assert.ok(top < 150, `Reiterleiste oben (${top})`);
  // Startseite nach Wichtigkeit: jetzt, Warnung, Regen gleich, Verlauf, 7 Tage, Vers, GTA, Fussball, Details
  const ids = ["warn-banner", "nowcast", "chart", "daily", "verse-card", "gta-card", "news-card", "gstats", "tiles"];
  const tops = await page.evaluate((list) => list.map((id) => document.getElementById(id).getBoundingClientRect().top), ids);
  assert.deepEqual([...tops].sort((x, y) => x - y), tops, "Reihenfolge der Startseite");
  // Statistiken mit Segmentbalken
  assert.equal(await page.locator("#gstats .gstat").count(), 10);
  assert.equal(await page.locator("#gstats .gstat").first().locator(".gbar i").count(), 10);
  assert.equal(await page.locator("#view-wetter .hero-stats").isVisible(), false);
  // Warnungen: grosse Fahndungsanzeige
  await page.click(".tabbar [data-tab=warn]");
  assert.equal(await page.locator("#wanted").isVisible(), true);
  assert.equal(await page.locator("#wanted-stars").getAttribute("data-n"), "5");
  assert.match(await text(page, "#wanted-sub"), /5 von 5/);
  // Psalm als Briefing: Menü über dem Text
  await page.click(".tabbar [data-tab=psalm]");
  const order = await page.evaluate(() => [document.querySelector("#psalm-prev").getBoundingClientRect().top, document.querySelector("#psalm-text").getBoundingClientRect().top]);
  assert.ok(order[0] < order[1], "Menü über dem Psalm");
  // Ortssuche als Schnellreise
  await page.click("#btn-search");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#search-dialog"), "::before").content), '"SCHNELLREISE"');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Kein Ladebildschirm, wenn die App im FCB-Bereich startet", async () => {
  const { ctx, page, errors } = await openApp({ storage: { tab: "fcb" } });
  assert.equal(await page.evaluate(() => window.__intro || false), false);
  assert.equal(await page.evaluate(() => document.body.dataset.tab), "fcb");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Radar-Tab: ohne Kartendienst eine verständliche Meldung statt eines Fehlers", async () => {
  const { ctx, page, errors } = await openApp();
  await page.click(".tabbar [data-tab=radar]");
  await page.waitForFunction(() => /nicht geladen/.test(document.querySelector("#radar-msg").textContent));
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Layout: auf keinem Gerät darf sich die Seite seitlich verschieben lassen
const SCREENS = [
  ["iPhone SE (1. Gen.)", { device: devices["iPhone SE"] }],
  ["iPhone 13", { device: devices["iPhone 13"] }],
  ["iPhone 15 Pro Max", { device: devices["iPhone 15 Pro Max"] || devices["iPhone 14 Pro Max"] }],
  ["iPad", { device: devices["iPad (gen 7)"] }],
  ["Desktop", { device: {}, viewport: { width: 1366, height: 900 } }],
];
for (const [name, opts] of SCREENS) {
  test(`Layout ${name}: kein seitliches Scrollen in allen Bereichen`, async () => {
    const { ctx, page, errors } = await openApp(opts);
    for (const tab of ["wetter", "radar", "psalm", "fcb", "warn"]) {
      await page.click(`.tabbar [data-tab=${tab}]`);
      const sections = tab === "fcb" ? ["news", "kader", "ticker", "kurve", "chat"] : [null];
      for (const s of sections) {
        if (s) await page.click(`#fcb-seg [data-s=${s}]`);
        await page.waitForTimeout(150);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 1, `${tab}${s ? `/${s}` : ""}: ${over}px zu breit`);
      }
    }
    assert.equal(await page.locator(".tabbar").isVisible(), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test("Offline: die App startet aus dem Zwischenspeicher des Service Workers", async () => {
  const { ctx, page } = await openApp({ serviceWorkers: "allow", wait: false });
  await page.evaluate(() => navigator.serviceWorker.ready);
  // warten, bis der Service Worker die Seite steuert und die Dateien gespeichert hat
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length >= 10);
  await ctx.setOffline(true);
  await page.reload();
  await page.click(".tabbar [data-tab=psalm]");
  await page.waitForFunction(() => document.querySelectorAll("#psalm-text p").length > 0);
  assert.equal(await page.locator(".tabbar").isVisible(), true);
  await ctx.close();
});
