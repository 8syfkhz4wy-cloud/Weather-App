"use strict";

// Live-Spielstand des FC Basel aus dem SRF-Teletext (api.teletext.ch, frei abrufbar).
// Seite 202: aktuelle Runde mit Resultaten (Totomat), 203: Tabelle,
// 205–210: Telegramme der Super-League-Spiele (Tore, Karten), 217: nächste Runde.
const FcbLive = (() => {
  const API = "https://api.teletext.ch/channels/SRF1/pages/";
  const DAYS = { SO: 0, MO: 1, DI: 2, MI: 3, DO: 4, FR: 5, SA: 6 };
  const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const TEAMS = {
    GC: "Grasshoppers", YB: "Young Boys", "St.Gallen": "St. Gallen", Zürich: "FC Zürich", Basel: "FC Basel",
    Luzern: "FC Luzern", Lugano: "FC Lugano", Sion: "FC Sion", Thun: "FC Thun", Vaduz: "FC Vaduz",
    Lausanne: "Lausanne-Sport", Servette: "Servette FC", Winterthur: "FC Winterthur",
  };
  const teamName = (t) => TEAMS[t] || t;

  async function page(n) {
    const res = await fetch(`${API}${n}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Teletext ${n}: ${res.status}`);
    const d = await res.json();
    return (d.subpages || []).map((s) => (s.ep1Info && s.ep1Info.contentText) || "");
  }

  // Kopfzeile "FUSSBALL  09.11.26 13:29" = letzte Aktualisierung der Seite
  function stamp(text) {
    const m = text.match(/(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
    return m ? new Date(2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : null;
  }

  // Datum des Anpfiffs: Wochentag innerhalb der Spanne im Seitentitel "(20.-22.11.)",
  // sonst der nächste passende Wochentag ab dem Datum der Seite
  function kickoffDate(text, base, weekday, hh, mm) {
    const r = text.match(/\((\d{1,2})\.(?:(\d{1,2})\.)?\s*-\s*(\d{1,2})\.(\d{1,2})\.\)/);
    if (r) {
      const endMonth = +r[4] - 1;
      const startMonth = r[2] ? +r[2] - 1 : endMonth;
      let year = base.getFullYear();
      if (startMonth < base.getMonth() - 6) year += 1; // Runde im neuen Jahr
      const d = new Date(year, startMonth, +r[1], hh, mm);
      for (let i = 0; i < 10; i++) {
        if (d.getDay() === weekday) return d;
        d.setDate(d.getDate() + 1);
      }
    }
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm);
    d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
    return d;
  }

  // Basel-Partie in einer Teletext-Seite finden: angesetzt ("SO 16.30 Uhr") oder mit Resultat ("2:1 (1:0)")
  function parseFixture(text) {
    let m = text.match(/(?:^|\s)Basel\s+-\s+(\S+)\s+/);
    let home = true;
    if (!m) {
      m = text.match(/(?:^|\s)(\S+)\s+-\s+Basel\s+/);
      home = false;
    }
    if (!m) return null;
    const rest = text.slice(m.index + m[0].length);
    const fx = { home: home ? "Basel" : m[1], away: home ? m[1] : "Basel", baselHome: home, updated: stamp(text), rest };
    const sched = rest.match(/^(SA|SO|MO|DI|MI|DO|FR)\s+(\d{1,2})\.(\d{2})\s+Uhr\s*/);
    const score = rest.match(/^(\d{1,2}):(\d{1,2})(?:\s*\((\d{1,2}):(\d{1,2})\))?\s*/);
    if (sched) {
      fx.kickoff = kickoffDate(text, fx.updated || new Date(), DAYS[sched[1]], +sched[2], +sched[3]);
      fx.after = rest.slice(sched[0].length);
    } else if (score) {
      fx.score = [+score[1], +score[2]];
      if (score[3] !== undefined) fx.half = [+score[3], +score[4]];
      fx.after = rest.slice(score[0].length);
    } else {
      fx.note = rest.slice(0, 24).trim(); // z. B. "verschoben"
      fx.after = "";
    }
    return fx;
  }

  // Tore und Platzverweise aus dem Telegramm lesen (Format tolerant, Rohtext bleibt sichtbar)
  function parseTelegram(text, fx) {
    const events = [];
    const body = fx ? fx.after || "" : text;
    const goalPart = (body.match(/Tore?:\s*(.*?)(?=\s(?:Bemerkungen|Bem\.|Verwarnungen|Gelb|Basel:|Zuschauer|SR\b)|$)/s) || [])[1] || "";
    let prev = [0, 0];
    for (const g of goalPart.matchAll(/(\d{1,3})\.(?:\s*\(\+\d+\))?\s*([^\d.][^.]*?)\s+(\d{1,2}):(\d{1,2})/g)) {
      const now = [+g[3], +g[4]];
      const homeScored = now[0] > prev[0];
      events.push({
        type: "goal", min: +g[1], who: g[2].trim().replace(/\s+/g, " "), score: `${now[0]}:${now[1]}`,
        basel: fx ? homeScored === fx.baselHome : null,
      });
      prev = now;
    }
    for (const c of body.matchAll(/(\d{1,3})\.\s*((?:Gelb-)?[Rr]ote?\s+Karte[^.]*|Platzverweis[^.]*|Gelb-Rot[^.]*)/g)) {
      events.push({ type: "red", min: +c[1], who: c[2].trim().replace(/\s+/g, " ") });
    }
    events.sort((a, b) => a.min - b.min);
    return events;
  }

  function parseTable(text) {
    const rows = [];
    for (const r of text.matchAll(/(\d{1,2})\.\s+([A-Za-zÄÖÜäöü.]+(?: [A-Z]{2})?)\s*(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,3}):\s*(\d{1,3})\s+(\d{1,3})/g)) {
      rows.push({ rank: +r[1], team: r[2], played: +r[3], goals: `${+r[7]}:${+r[8]}`, points: +r[9] });
    }
    return rows;
  }

  // Läuft das Spiel gerade? Entweder im Zeitfenster nach dem gespeicherten Anpfiff
  // oder die Seite mit Resultat wurde in den letzten 25 Minuten aktualisiert.
  function isLive(fx, kickoff) {
    if (!fx || !fx.score) return false;
    const now = Date.now();
    if (kickoff && now >= kickoff && now <= kickoff + 125 * 60000) return true;
    return Boolean(fx.updated) && now - fx.updated.getTime() < 25 * 60000 && now - fx.updated.getTime() > -5 * 60000;
  }

  return { page, parseFixture, parseTelegram, parseTable, isLive, teamName, DAY_NAMES };
})();
