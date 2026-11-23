"use strict";

// Logik ohne Browser: Teletext-Auswertung (fcb-live.js) und Chat mit Dani (dani-chat.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const FcbLive = require("../fcb-live.js");
const swiss = FcbLive.zurichParts;
const DaniChat = require("../dani-chat.js");
const GtaArt = require("../gta-art.js");

test("Teletext: Partie mit Resultat und Halbzeitstand", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 22.11.26 17:45 Super League GC - Lugano 1:1 (0:0) Basel - YB 2:1 (1:0) Sion - Thun 0:0");
  assert.equal(fx.home, "Basel");
  assert.equal(fx.away, "YB");
  assert.equal(fx.baselHome, true);
  assert.deepEqual(fx.score, [2, 1]);
  assert.deepEqual(fx.half, [1, 0]);
  assert.equal(fx.updated.toISOString(), "2026-11-22T16:45:00.000Z"); // 17:45 Schweizer Winterzeit
});

test("Teletext: Auswärtsspiel mit Anpfiff im Titelbereich der Runde", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 18.11.26 10:00 Super League (21.-23.11.) Lugano - Basel SO 16.30 Uhr Thun - GC SA 18.00 Uhr");
  assert.equal(fx.baselHome, false);
  assert.equal(fx.home, "Lugano");
  assert.deepEqual(swiss(fx.kickoff), { y: 2026, mo: 10, d: 22, h: 16, mi: 30 }); // 22.11.2026 ist ein Sonntag
});

test("Teletext: Runde im neuen Jahr (Seite noch vom Dezember)", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 20.12.26 10:00 Super League (30.1.-1.2.) Basel - Sion SA 18.00 Uhr");
  assert.deepEqual(swiss(fx.kickoff), { y: 2027, mo: 0, d: 30, h: 18, mi: 0 }); // Samstag, 30.1.2027
});

test("Teletext: Anpfiff am Tag der Umstellung auf Sommerzeit", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 27.03.27 12:00 Super League Basel - GC SO 16.30 Uhr");
  assert.equal(fx.kickoff.toISOString(), "2027-03-28T14:30:00.000Z"); // 16:30 MESZ
});

// Wie ein iPhone in einer anderen Zeitzone (Ferien, Auswärtsfahrt): gleicher Zeitpunkt überall
test("Teletext: Anpfiff stimmt in jeder Zeitzone des Geräts", () => {
  const code = `
    const F = require(${JSON.stringify(path.join(__dirname, "../fcb-live.js"))});
    const D = require(${JSON.stringify(path.join(__dirname, "../dani-chat.js"))});
    const a = F.parseFixture("FUSSBALL 18.11.26 10:00 Super League (21.-23.11.) Lugano - Basel SO 16.30 Uhr");
    const b = F.parseFixture("FUSSBALL 20.12.26 23:30 Super League (30.1.-1.2.) Basel - Sion SA 18.00 Uhr");
    const c = F.parseFixture("FUSSBALL 27.03.27 12:00 Super League Basel - GC SO 16.30 Uhr");
    const live = { fx: { home: "Basel", away: "YB", baselHome: true, kickoff: new Date(Date.now() + 3 * 86400e3) }, events: [], table: [] };
    const dani = D.reply("nächstes spiel", { live })[0];
    console.log(JSON.stringify([a.kickoff, a.updated, b.kickoff, c.kickoff, dani.match(/um \\d\\d:\\d\\d/)[0]]));`;
  const run = (tz) => {
    const r = spawnSync(process.execPath, ["-e", code], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const zurich = run("Europe/Zurich");
  for (const tz of ["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Auckland"]) assert.equal(run(tz), zurich, tz);
  assert.match(zurich, /"2026-11-22T15:30:00.000Z","2026-11-18T09:00:00.000Z","2027-01-30T17:00:00.000Z","2027-03-28T14:30:00.000Z"/);
});

test("Teletext: ohne Basel-Spiel keine Partie", () => {
  assert.equal(FcbLive.parseFixture("FUSSBALL 22.11.26 17:45 GC - Lugano 1:1 (0:0)"), null);
});

test("Teletext: Tore und Platzverweise aus dem Telegramm", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 22.11.26 17:45 Basel - YB 2:1 (1:0) St. Jakob-Park. 25000 Zuschauer. Tore: 12. Ajeti 1:0. 50. Monteiro 1:1. 88. Shaqiri 2:1. Bemerkungen: 75. Rote Karte gegen Muster.");
  const events = FcbLive.parseTelegram("", fx);
  const goals = events.filter((e) => e.type === "goal");
  assert.deepEqual(goals.map((g) => [g.min, g.who, g.score, g.basel]), [
    [12, "Ajeti", "1:0", true], [50, "Monteiro", "1:1", false], [88, "Shaqiri", "2:1", true],
  ]);
  const reds = events.filter((e) => e.type === "red");
  assert.equal(reds.length, 1);
  assert.equal(reds[0].min, 75);
});

test("Teletext: Tabelle", () => {
  const rows = FcbLive.parseTable("Tabelle 1. Basel 15 10 3 2 30:12 33 2. YB 15 9 3 3 28:15 30 10. St.Gallen 15 2 4 9 11:29 10");
  assert.deepEqual(rows[0], { rank: 1, team: "Basel", played: 15, goals: "30:12", points: 33 });
  assert.equal(rows.length, 3);
  assert.equal(rows[2].team, "St.Gallen");
  assert.equal(FcbLive.teamName("YB"), "Young Boys");
});

// Kontext wie in der App: Spiel des FCB zur angegebenen Zeit
const ctxWith = (kickoff, extra = {}) => ({ live: { fx: { home: "Basel", away: "YB", baselHome: true, kickoff }, events: [], table: [], ...extra } });
// Heute bzw. morgen (Schweizer Kalender) um hh:mm Schweizer Zeit
const swissDay = (add, hh, mm) => {
  const s = swiss(new Date());
  return FcbLive.zurichDate(s.y, s.mo, s.d + add, hh, mm);
};

test("GTA-Illustration: Sportwagen, Leuchtreklame je Thema, Tag und Nacht", () => {
  const day = new Date(2026, 10, 23, 15, 0);
  const night = new Date(2026, 10, 23, 23, 0);
  const motifs = ["heute", "tipps", "cheats", "orte", "autos", "waffen", "geld"];
  const svgs = motifs.map((m) => GtaArt.svg("#3ddcff", m, day));
  for (const [i, s] of svgs.entries()) {
    assert.match(s, /^<svg viewBox="0 0 640 300"/, motifs[i]);
    assert.match(s, /class="ga-car"/, motifs[i]);
    assert.equal((s.match(/class="ga-spin"/g) || []).length, 2, `${motifs[i]}: zwei Räder`);
    assert.doesNotMatch(s, /NaN|undefined|Infinity/, motifs[i]);
  }
  assert.equal(new Set(svgs).size, motifs.length, "jedes Thema hat eine eigene Leuchtreklame");
  assert.match(svgs[0], /class="ga-sun"/);
  const n = GtaArt.svg("#3ddcff", "heute", night);
  assert.doesNotMatch(n, /class="ga-sun"/);
  assert.match(n, /url\(#gaMoonGlow\)/);
  assert.doesNotMatch(n, /NaN|undefined/);
  // Lack in der Farbe des Themas, unbekanntes Thema fällt auf den Stern zurück
  assert.match(GtaArt.svg("#ff8a3d", "autos", day), /stop-color="#ff8a3d"/);
  assert.equal(GtaArt.svg("#3ddcff", "gibtsnicht", day), svgs[0]);
  assert.equal(GtaArt.shade("#808080", 0.5), "#c0c0c0");
  assert.equal(GtaArt.shade("#808080", -0.5), "#404040");
});

test("Dani: Spiel heute Abend heisst «HÜT», auch wenn es noch über 12 Stunden dauert", (t) => {
  if (swiss(new Date()).h >= 23) return t.skip("kurz vor Mitternacht nicht aussagekräftig");
  const tonight = swissDay(0, 23, 59);
  assert.match(DaniChat.reply("nächstes spiel", ctxWith(tonight))[0], /HÜT/);
  assert.match(DaniChat.greeting(ctxWith(tonight))[1], /^HÜT/);
});

test("Dani: Spiel morgen früh heisst «MORN»", () => {
  assert.match(DaniChat.reply("nächstes spiel", ctxWith(swissDay(1, 9, 0)))[0], /um 09:00\. Das isch scho MORN/);
});

test("Dani: Wetter zum Anpfiff aus der Stunde in Ortszeit des Wetterorts", () => {
  const kickoff = swissDay(1, 18, 30);
  // Wetterort in der Schweiz (UTC+1 im Winter, +2 im Sommer): Stundenwert der Ortszeit 18:00
  const off = (Date.UTC(...(() => { const s = swiss(kickoff); return [s.y, s.mo, s.d, s.h, s.mi]; })()) - kickoff.getTime()) / 1000;
  const s = swiss(kickoff);
  const pad = (n) => String(n).padStart(2, "0");
  const key = `${s.y}-${pad(s.mo + 1)}-${pad(s.d)}T18:00`;
  const w = { utc_offset_seconds: off, current: { temperature_2m: 5, weather_code: 0 }, hourly: { time: ["x", key], temperature_2m: [0, 12.4], weather_code: [0, 61], precipitation_probability: [0, 80] } };
  const out = DaniChat.reply("wetter fürs spiel", { ...ctxWith(kickoff), w, place: { name: "Basel" } })[0];
  assert.match(out, /12 Grad, es schifft, Rägerisiko 80 %/);
});

test("Dani: Tabelle, Spieler, Wetter und Schutzregeln", () => {
  const table = [{ rank: 2, team: "Basel", played: 15, goals: "30:12", points: 30 }, { rank: 1, team: "YB", played: 15, goals: "28:15", points: 33 }];
  const ctx = { ...ctxWith(null, { table: [table[1], table[0]] }) };
  assert.match(DaniChat.reply("Tabelle", ctx).join(" "), /Platz 2 mit 30 Pünkt/);
  assert.match(DaniChat.reply("wo steht yb in der tabelle", ctx).join(" "), /Platz 1/);
  assert.match(DaniChat.reply("Schlägerei nach dem Spiel?", ctx).join(" "), /(Nai|nit mit|Vergiss)/);
  const fcb = { squad: { groups: [{ group: "Sturm", players: [{ name: "Albian Ajeti", nr: "10", since: "2024" }] }] } };
  assert.match(DaniChat.reply("was hältst du von ajeti", { fcb }).join(" "), /Albian Ajeti/);
  const w = { current: { temperature_2m: 2.4, weather_code: 61 } };
  assert.match(DaniChat.reply("wie ist das wetter", { w, place: { name: "Basel" } })[0], /z Basel 2 Grad und es schifft/);
});

test("Dani: Tippfehler und «Noch einen!»", () => {
  assert.notEqual(DaniChat.reply("tabele", {})[0], undefined);
  const first = DaniChat.reply("Erzähl einen Witz", {});
  const again = DaniChat.reply("Noch einen!", {});
  assert.match(first[0], /😄/);
  assert.match(again[0], /😄/);
});

test("Dani: jede Antwort ist nichtleerer Text", () => {
  for (const chip of DaniChat.CHIPS) {
    const out = DaniChat.reply(chip, {});
    assert.ok(out.length > 0, chip);
    for (const line of out) assert.ok(typeof line === "string" && line.trim().length > 5, `${chip}: ${line}`);
  }
});
