"use strict";

// Logik ohne Browser: Teletext-Auswertung (fcb-live.js) und Chat mit Dani (dani-chat.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const FcbLive = require("../fcb-live.js");
const DaniChat = require("../dani-chat.js");

test("Teletext: Partie mit Resultat und Halbzeitstand", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 22.11.26 17:45 Super League GC - Lugano 1:1 (0:0) Basel - YB 2:1 (1:0) Sion - Thun 0:0");
  assert.equal(fx.home, "Basel");
  assert.equal(fx.away, "YB");
  assert.equal(fx.baselHome, true);
  assert.deepEqual(fx.score, [2, 1]);
  assert.deepEqual(fx.half, [1, 0]);
  assert.equal(fx.updated.getFullYear(), 2026);
});

test("Teletext: Auswärtsspiel mit Anpfiff im Titelbereich der Runde", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 18.11.26 10:00 Super League (21.-23.11.) Lugano - Basel SO 16.30 Uhr Thun - GC SA 18.00 Uhr");
  assert.equal(fx.baselHome, false);
  assert.equal(fx.home, "Lugano");
  assert.equal(fx.kickoff.getDay(), 0); // Sonntag
  assert.equal(fx.kickoff.getDate(), 22); // 22.11.2026 ist ein Sonntag
  assert.equal(fx.kickoff.getMonth(), 10);
  assert.equal(fx.kickoff.getHours(), 16);
  assert.equal(fx.kickoff.getMinutes(), 30);
});

test("Teletext: Runde im neuen Jahr (Seite noch vom Dezember)", () => {
  const fx = FcbLive.parseFixture("FUSSBALL 20.12.26 10:00 Super League (30.1.-1.2.) Basel - Sion SA 18.00 Uhr");
  assert.equal(fx.kickoff.getFullYear(), 2027);
  assert.equal(fx.kickoff.getMonth(), 0);
  assert.equal(fx.kickoff.getDay(), 6);
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

test("Dani: Spiel heute Abend heisst «HÜT», auch wenn es noch über 12 Stunden dauert", (t) => {
  const now = new Date();
  if (now.getHours() >= 23) return t.skip("kurz vor Mitternacht nicht aussagekräftig");
  const tonight = new Date(now);
  tonight.setHours(23, 59, 0, 0);
  assert.match(DaniChat.reply("nächstes spiel", ctxWith(tonight))[0], /HÜT/);
  assert.match(DaniChat.greeting(ctxWith(tonight))[1], /^HÜT/);
});

test("Dani: Spiel morgen früh heisst «MORN»", () => {
  const tomorrow = new Date(Date.now() + 86400e3);
  tomorrow.setHours(9, 0, 0, 0);
  assert.match(DaniChat.reply("nächstes spiel", ctxWith(tomorrow))[0], /MORN/);
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
