"use strict";

// Chat mit dem fiktiven Kurven-Experten Dani «Joggeli» Meier.
// Läuft ganz im Gerät: Antworten nach Stichworten, dazu die Daten, die die App ohnehin
// schon geladen hat (Spielstand, Tabelle, News, Kader, Wetter). Kein Server, keine KI,
// keine Kosten; was man schreibt, verlässt das Gerät nicht. Reaktionen auf die
// Schlagzeilen des Tages kommen fertig aus fcb.json (scripts/fcb.py, chat_topics).
// Wie in scripts/fcb.py gilt: derb und emotional, aber keine Gewaltaufrufe und keine
// Beleidigung echter, namentlich genannter Personen. Geflucht wird über Situationen.
const DaniChat = (() => {
  // Zufällig wählen, aber nicht, was Dani gerade erst gesagt hat
  const recent = [];
  const pick = (list) => {
    const unused = list.filter((x) => !recent.includes(x));
    const pool = unused.length ? unused : list;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    recent.push(choice);
    if (recent.length > 25) recent.shift();
    return choice;
  };
  const OUT = [
    "ALLEZ FCB! ❤️💙", "HOPP BASEL, gopferdammi! ❤️💙", "Rotblau bis in d Chnoche! ❤️💙",
    "Mir gsehn is im Joggeli! ❤️💙", "Z Basel an mym Rhy! ❤️💙",
  ];
  const TEAMS = {
    GC: "GC", YB: "YB", "St.Gallen": "Sanggalle", Zürich: "dr FCZ", Luzern: "Luzärn", Lugano: "Lugano",
    Sion: "Sion", Thun: "Thun", Vaduz: "Vaduz", Lausanne: "Lausanne", Servette: "Servette", Winterthur: "Winterthur",
  };
  const team = (t) => TEAMS[t] || t;
  const opponent = (fx) => team(fx.baselHome ? fx.away : fx.home);

  // Dani ist Basler: Tage und Uhrzeiten immer in Schweizer Zeit, auch wenn das iPhone
  // gerade in einer anderen Zeitzone ist
  const swissFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  });
  const swiss = (date) => {
    const p = Object.fromEntries(swissFmt.formatToParts(date).map((x) => [x.type, +x.value]));
    return { y: p.year, mo: p.month - 1, d: p.day, h: p.hour % 24, mi: p.minute, wd: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
  };

  // Kalendertage bis zum Datum (0 = heute, 1 = morgen), unabhängig von der Uhrzeit
  const daysUntil = (date) => {
    const midnight = (s) => Date.UTC(s.y, s.mo, s.d);
    return Math.round((midnight(swiss(date)) - midnight(swiss(new Date()))) / 86400000);
  };

  function when(date) {
    const days = ["Sunntig", "Mäntig", "Zyschtig", "Mittwuch", "Dunnschtig", "Frytig", "Samschtig"];
    const s = swiss(date);
    const pad = (n) => String(n).padStart(2, "0");
    return `am ${days[s.wd]}, ${s.d}.${s.mo + 1}., um ${pad(s.h)}:${pad(s.mi)}`;
  }

  // ---------- Antworten aus den Daten der App ----------

  function nextMatch(ctx) {
    const d = ctx.live;
    if (!d) return ["Dr Teletext git mir grad kai Antwort, gopfertelli! Lueg im Ticker noche, dört stoht s, sobald s wieder goht."];
    if (d.live && d.score) return score(ctx);
    const fx = [d.fx, d.next].find((f) => f && f.kickoff && f.kickoff.getTime() > Date.now());
    if (!fx) return ["Im Momänt isch kai Spiel agsetzt – und ych halt das fascht nit us, ohni Fuessball! Lueg im Ticker, sobald d nögschti Rundi stoht."];
    const place = fx.baselHome ? "dehai im Joggeli" : "usswärts";
    const days = daysUntil(fx.kickoff);
    const wait = days <= 0 ? "Das isch HÜT, ych ha scho Härzchlopfe!" : days === 1 ? "Das isch scho MORN – ych cha hüt z Nacht nit schlofe!" : `No ${days} Dääg – ych zell d Stunde!`;
    return [
      `Gege ${opponent(fx)}, ${place}, ${when(fx.kickoff)}. ${wait}`,
      fx.baselHome ? "Schal um, Stimm ööle und ab in d Kurve – s Joggeli mues bebe!" : "Usswärts isch d Kurve erscht rächt lut. Wär mitfahrt, isch e Guete!",
    ];
  }

  function score(ctx) {
    const d = ctx.live;
    const fx = d && d.fx;
    if (!fx || !d.score) {
      const report = ((ctx.fcb && ctx.fcb.ticker) || [])[0];
      const last = report ? `Grad lauft kai Spiel. Dr letscht Bricht: «${report.title}» (${report.source || "Medie"}).` : "Grad lauft kai Spiel und ych ha kai Resultat.";
      return [last, nextMatch(ctx)[0]];
    }
    const mine = fx.baselHome ? 0 : 1;
    const [us, them] = [d.score[mine], d.score[1 - mine]];
    const stand = `${us}:${them} gege ${opponent(fx)}`;
    const goals = d.events.filter((e) => e.type === "goal" && e.basel).map((e) => `${e.min}. ${e.who}`);
    const extra = goals.length ? ` Unseri Tor: ${goals.join(", ")}.` : "";
    if (d.live) {
      if (us > them) return [`ES LAUFT! Mir füere ${stand}!${extra} Nit nochlo jetzt, Buebe, WYTER!`];
      if (us < them) return [`Mir ligge ${stand} hinde, hueresiech!${extra} Aber e Basler git nie uf – brüele, bis es dräit!`];
      return [`Es stoht ${stand}.${extra} Ych bi am Nägel bysse, gopferdammi – EIS MIEN MIR NO MACHE!`];
    }
    if (us > them) return [`${us}:${them} GWUNNE gege ${opponent(fx)}!${extra} Drüü Pünkt, ych bi heiser und glügglig!`];
    if (us < them) return [`${us}:${them} verlore gege ${opponent(fx)}. Schissdräck.${extra} Aber mir stöhn hinter dene Jungs – grad jetzt!`];
    return [`${us}:${them} gege ${opponent(fx)}.${extra} E Pünktli isch wie Bier ohni Schuum, aber besser als nyt.`];
  }

  // Wie man im Chat nach einem Team fragt → Name in der Teletext-Tabelle
  const TABLE_TEAMS = [
    [/\bgc\b|grasshopper|hoppers/, "GC"], [/\byb\b|young boys|bern|bärn/, "YB"], [/fcz|zürich|züri|zuerich/, "Zürich"],
    [/st\.? ?gallen|sanggalle/, "St.Gallen"], [/luzern|luzärn/, "Luzern"], [/lugano/, "Lugano"], [/sion|sitten/, "Sion"],
    [/thun/, "Thun"], [/lausanne/, "Lausanne"], [/servette|genf/, "Servette"], [/winterthur|winti/, "Winterthur"], [/vaduz/, "Vaduz"],
  ];

  function table(ctx, q = "") {
    const rows = (ctx.live && ctx.live.table) || [];
    const us = rows.find((r) => r.team === "Basel");
    if (!us) return ["D Tabälle han ych grad nit do – dr Teletext schloft. Lueg im Ticker, dört kunnt si, sobald s goht."];
    const asked = TABLE_TEAMS.find(([pattern]) => pattern.test(q));
    const other = asked && rows.find((r) => r.team === asked[1]);
    if (other) {
      const diff = other.points - us.points;
      const rel = diff > 0 ? `${diff} Pünkt vor uns – no, gopferdammi!` : diff < 0 ? `${-diff} Pünkt hinter uns, und dört blybe si au!` : "pünktglych mit uns. Das ändere mir glyy!";
      const name = team(other.team);
      return [`${name[0].toUpperCase()}${name.slice(1)} stoht uf Platz ${other.rank} mit ${other.points} Pünkt us ${other.played} Spiel, ${rel}`, `Mir sälber sinn uf Platz ${us.rank} mit ${us.points} Pünkt.`];
    }
    const first = rows[0];
    const base = `Mir sinn uf Platz ${us.rank} mit ${us.points} Pünkt us ${us.played} Spiel (Tor ${us.goals}).`;
    if (us.rank === 1) {
      const second = rows[1];
      return [`${base} GANZ OBE, wo mir ane ghöre!${second ? ` ${us.points - second.points} Pünkt vor ${team(second.team)}.` : ""} Vo dört obe gseht me dr Rhy am beschte!`];
    }
    const gap = first.points - us.points;
    const mood = us.rank <= 3 ? "Mir sinn dra, das wird no heiss!" : us.rank <= 6 ? "Do goht no meh, gopferdammi – ufe mit uns!" : "Das isch nit unsere Platz, verreckt nomol. Aber d Kurve singt in jedere Lag!";
    return [`${base} Vorne isch ${team(first.team)}, ${gap} Pünkt vor uns. ${mood}`];
  }

  // Fakten zu einer Kurven-Ankündigung: Quelle, Tag (Schweizer Zeit) und der erste Satz nach dem Titel
  function kurveFacts(item) {
    const d = item.published ? new Date(item.published) : null;
    const day = d && !isNaN(d) ? new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replace(/,/g, "") : "";
    const meta = [item.source, day].filter(Boolean).join(", ");
    let text = item.text || "";
    if (text.toLowerCase().startsWith(item.title.toLowerCase())) text = text.slice(item.title.length).replace(/^[\s.!:–-]+/, "");
    const first = text.split(/(?<=[.!?])\s/)[0].slice(0, 160);
    return `«${item.title}»${meta ? ` (${meta})` : ""}${first ? ` – ${first}` : "."}`;
  }

  // Bei Fragen zur Kurve zuerst die aktuelle Ankündigung (falls vorhanden)
  function kurveNow(ctx) {
    const item = ((ctx && ctx.fcb && ctx.fcb.kurve) || [])[0];
    return item ? [`Aktuell us dr Kurve: ${kurveFacts(item)}`] : [];
  }

  function kurveNews(ctx) {
    const items = (ctx.fcb && ctx.fcb.kurve) || [];
    if (!items.length) return ["Us dr Kurve git s grad nyt Neis. Aber kai Angscht: Sobald ebbis lauft, stoht s unter «Kurve»."];
    return [`Us dr Kurve: ${kurveFacts(items[0])}`, items[1] ? `Und no: ${kurveFacts(items[1])} Alles drzue findsch unter «Kurve» – alli derby, ihr Bebbi!` : "Meh drzue findsch unter «Kurve» – alli derby, ihr Bebbi!"];
  }

  function news(ctx) {
    const items = (ctx.fcb && ctx.fcb.news) || [];
    if (!items.length) return ["Hüt isch s ruhig um dr FCB. Viel z ruhig – ych bruuch Fuessball, gopferdammi!"];
    return [`S Neischte: «${items[0].title}» (${items[0].source || "Medie"}).`, items[1] ? `Und no das: «${items[1].title}». Dr Räscht stoht bi de News, lueg sälber!` : "Meh stoht bi de News, lueg sälber!"];
  }

  function rumors(ctx) {
    const items = (ctx.fcb && ctx.fcb.rumors) || [];
    if (!items.length) return ["D Grüchtchuchi isch grad chalt. Und ych glaub sowiso erscht ebbis, wenn s unterschriibe isch!"];
    return [`Us dr Grüchtchuchi: «${items[0].title}».`, "Ych glaub s erscht, wenn s unterschriibe isch. Bis denn: Gschnorr – aber spannends Gschnorr!"];
  }

  function players(ctx) {
    const groups = (ctx.fcb && ctx.fcb.squad && ctx.fcb.squad.groups) || [];
    return groups.flatMap((g) => g.players.map((p) => ({ ...p, group: g.group })));
  }

  // Nachname (oder ganzer Name) eines Spielers aus dem aktuellen Kader in der Frage?
  function findPlayer(ctx, q) {
    return players(ctx).find((p) => {
      const parts = p.name.toLowerCase().split(/\s+/).filter((s) => s.length > 3);
      return parts.length && new RegExp(`(^|[^a-zà-ÿ])(${parts.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})([^a-zà-ÿ]|$)`).test(q);
    });
  }

  function player(p) {
    const nr = p.nr ? ` mit dr Nummere ${p.nr}` : "";
    const since = p.since ? `, sit ${p.since} bi uns` : "";
    return [
      `Dr ${p.name}${nr}${since} – ${p.group}.`,
      pick(["Wär s rotblaue Lybli aaleggt, het d Kurve im Rugge. Gib alles, Brueder!", "E Rotblaue! Solang er rennt und kämpft, sing ych sy Name bis ych heiser bi.", "Für dä stand ych bi Räge und Schnee in dr Kurve. HOPP!"]),
    ];
  }

  function squad(ctx, q) {
    const all = players(ctx);
    if (!all.length) return ["Dr Kader han ych grad nit im Grind – lueg unter «Kader», dört stoht jede einzelne."];
    const wanted = /goalie|torh|tor(wart|hüter)|kasten/.test(q) ? /tor/i : /abwehr|verteidig/.test(q) ? /abwehr|verteid/i : /mittelfeld/.test(q) ? /mittelfeld/i : /sturm|stürm|angriff/.test(q) ? /sturm|angriff/i : null;
    const list = wanted ? all.filter((p) => wanted.test(p.group)) : [];
    if (list.length) return [`${list[0].group}: ${list.map((p) => p.name).join(", ")}. Alles Rotblaui, alles unseri Jungs!`];
    return [`${all.length} Maa stöhn im Kader. Alli Näme und Nummere findsch unter «Kader» – oder frog mi noch eim, zum Bispil noch em Goalie.`];
  }

  const skyText = (code) => (code >= 95 ? "es gwitteret" : code >= 71 && code <= 86 && ![80, 81, 82].includes(code) ? "es schneit" : code >= 51 ? "es schifft" : code >= 45 ? "es het Näbel" : code >= 2 ? "es isch bewölggt" : "dr Himmel isch offe");
  const wearTip = (code, t) => (code >= 95 ? "Bi däm Wätter blybt sogar ych e Momänt unterem Dach." : code >= 51 ? "Rägejagge aa – e Schirm in dr Kurve isch öbbis für Zürcher!" : t <= 3 ? "Schal dopplet umwiggle und e Glüehwy in d Hand, denn goht das." : t >= 27 ? "Viel trinke, Lüt. Und ych main nit nur Bier. Aber au." : "Perfekts Fuessballwätter, was wotsch meh?");

  // Vorhersage für die Stunde des Anpfiffs, falls sie in den geladenen Wetterdaten liegt
  function kickoffWeather(ctx) {
    const d = ctx.live;
    const fx = d && [d.fx, d.next].find((f) => f && f.kickoff && f.kickoff.getTime() > Date.now());
    const h = ctx.w && ctx.w.hourly;
    if (!fx || !h || !h.time) return null;
    // Die Stundenwerte stehen in der Ortszeit des Wetterorts (Open-Meteo, timezone=auto)
    const off = ctx.w.utc_offset_seconds;
    const k = typeof off === "number" ? new Date(fx.kickoff.getTime() + off * 1000) : null;
    const pad = (n) => String(n).padStart(2, "0");
    const key = k
      ? `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:00`
      : `${fx.kickoff.getFullYear()}-${pad(fx.kickoff.getMonth() + 1)}-${pad(fx.kickoff.getDate())}T${pad(fx.kickoff.getHours())}:00`;
    const i = h.time.indexOf(key);
    if (i < 0 || h.temperature_2m[i] == null) return null;
    return { fx, t: Math.round(h.temperature_2m[i]), code: h.weather_code[i], rain: (h.precipitation_probability || [])[i] };
  }

  function weather(ctx, q = "") {
    const c = ctx.w && ctx.w.current;
    if (!c) return ["S Wätter lädt grad no. Aber egal: E Rotblaue goht bi jedem Wätter an Match!"];
    const where = ctx.place && ctx.place.name ? `z ${ctx.place.name}` : "dusse";
    const k = /spiel|match|anpfiff|samstag|sonntag|samschtig|sunntig|wochenende|wuchenänd/.test(q) ? kickoffWeather(ctx) : null;
    if (k) {
      const rain = k.rain != null ? `, Rägerisiko ${k.rain} %` : "";
      return [`Bim Aapfiff gege ${opponent(k.fx)} (${when(k.fx.kickoff)}) git s ${where} ${k.t} Grad, ${skyText(k.code)}${rain}. ${wearTip(k.code, k.t)}`];
    }
    const t = Math.round(c.temperature_2m);
    return [`Jetzt het s ${where} ${t} Grad und ${skyText(c.weather_code)}. ${wearTip(c.weather_code, t)}`];
  }

  function tip(ctx) {
    const d = ctx.live;
    const fx = d && [d.fx, d.next].find((f) => f && f.kickoff && f.kickoff.getTime() > Date.now());
    const res = pick(["2:0", "2:1", "3:1", "1:0", "3:0", "4:1"]);
    const us = fx && !fx.baselHome ? res.split(":").reverse().join(":") : res;
    return [fx ? `Gege ${opponent(fx)}? ${us} – für uns natürlig, was dänggsch denn du!` : `Mi Tipp isch immer dr glych: ${res} für Basel.`,
      "Ych ha no nie gege dr FCB tippt und fang hüt nit aa. Aber wette tue ych nit um Gäld, nur um e Bier."];
  }

  // ---------- Feste Antworten nach Stichworten (erste Übereinstimmung gewinnt) ----------

  const squadRule = (q, ctx) => squad(ctx, q);

  const RULES = [
    // Gewalt: Dani macht da nicht mit
    [/schläger|schlägerei|prügel|verprügel|verhau|zusammenschlag|uf d schnure|aufs maul|hooligan|krawall|randal|abstechen|umbringen|töten|waffe|messer|boxe mer|haue mer/, () => [
      pick(["Nai, Kolleeg. Mir sinn lut, nit bled. Gschlage wird bi uns nur d Trummle.", "Do mach ych nit mit. D Kurve gwünnt mit dr Stimm, nit mit de Füscht.", "Vergiss es. Wär schlegle wott, het dr Fuessball nit verstande. Mir singe si an d Wand!"]),
    ]],
    [/pyro|fackel|bengal|rauch(topf|bombe)|böller|petarde/, () => ["Zu däm Thema sag ych nyt, usser: Finger und Auge bruuchsch no, also pass uf di uf. Singe isch gratis und git kai Buess."]],
    // Wer bist du? Ehrlich bleiben: erfundene Figur, kein Mensch, keine KI
    [/bist du (echt|ein mensch|eine? ki|ein bot|ein roboter)|bisch (du )?(ächt|echt|e mensch|e bot|e ki)|chatgpt|künstliche intelligenz|\bki\b|\bbot\b|roboter|wer hat dich|programmiert/, () => [
      "Ohni Seich: Ych bi e erfundeni Figur. Kai Mensch und kai gschydi Maschine – numme e Huffe feschti Sprüch in dere App, wo uf dyni Wörter loose.",
      "Aber s Härz isch ächt rotblau, das cha me nit programmiere!",
    ]],
    [/wer bist du|wer bisch|wie heisst du|wie heissisch|dein name|di name|stell dich vor|über dich|erzähl.*von dir/, () => [
      "Dr Dani «Joggeli» Meier! Sit 1998 in dr Muttenzerkurve, früener Brätscher, hüt Schnuuri vom Dienscht.",
      "Frog mi nach em nögschte Spiel, dr Tabälle, de News, em Kader oder em Wätter. Oder mir schimpfe aifach zämme über Züri.",
    ]],
    [/was kannst du|was chasch|hilfe|help|was weisst du|was waisch|befehle|themen/, () => [
      "Ych waiss: s nögschte Spiel, dr Spielstand, d Tabälle, d News, d Grüchtchuchi, dr Kader und s Wätter für an Match.",
      "Und susch schwätz ych über s Joggeli, d Kurve, Basel, Fasnacht, Bier und die andere Vereinli. Tipp aifach druff los!",
    ]],
    [/wie alt|dein alter|di alter|geburtstag/, () => ["Alt gnueg, zum mi an s alte Joggeli z erinnere, und jung gnueg, zum nünzig Minute z hüpfe. Meh verrot ych nit!"]],
    [/prognose|tipp|tippsch|tippst|wie geht.*aus|wie goht.*us|wer gewinnt|wär gwünnt|gewinnen wir|gwünne mir/, (q, ctx) => tip(ctx)],
    [/wie geht|wie gohts|wie goht s|wie gots|alles klar|was machst|was machsch|was lauft|was läuft bei dir/, () => [
      pick(["Wie s am ene Rotblaue halt goht: Härzrase vo Mäntig bis Sunntig!", "Guet! Ych ha e Kaffi, e Gipfeli und dr FCB im Grind. Meh bruucht s nit.", "Verchateret, heiser und glügglig. Also wie immer."]),
    ]],
    // Daten
    [/us dr kurve|aus der kurve|kurve.*(neu|news|los|lauft|läuft|termin|ankünd|plant)|extrazug|auswärtsfahrt|usswärtsfahrt|fanmarsch|treffpunkt/, (q, ctx) => kurveNews(ctx)],
    [/wetter|wätter|regen|räge|regnet|schifft|schnee|schneit|kalt|warm|heiss\b|sonne|temperatur|schirm|jacke/, (q, ctx) => weather(ctx, q)],
    [/\blive\b|spielstand|wie stehts|wie steht es|wie stoht|resultat|ergebnis|gewonnen|verloren|gwunne|verlore|hän mir|haben wir|tore heute|letztes spiel|letscht/, (q, ctx) => score(ctx)],
    [/nächst|nögscht|naechst|wann spiel|wenn spiel|gegen wen|gege wär|gegner|anpfiff|spieltag|match|heimspiel|auswärts|usswärts|wie lange noch|wie lang no|countdown/, (q, ctx) => nextMatch(ctx)],
    [/tabelle|tabälle|\bplatz\b|\brang\b|punkte|pünkt|leader|tabellen|wo stehen|wo stöhn|wo steht|wo stoht|rückstand|vorsprung|meister werden|maischter wärde/, (q, ctx) => table(ctx, q)],
    [/gerücht|grücht|transfer|wechsel|verpflicht|neuzugang|zugang|abgang/, (q, ctx) => rumors(ctx)],
    [/news|neues|neuigkeit|neis|schlagzeile|was gibts|was git s|was gits|was ist los|was isch los|aktuell/, (q, ctx) => news(ctx)],
    [/kader|mannschaft|spieler|goalie|torh|torwart|abwehr|verteidig|mittelfeld|sturm|stürmer|angriff|aufstellung|wer spielt/, squadRule],
    // Die anderen
    [/fcz|zürich|züri|zuerich|letzigrund/, () => [pick([
      "ZÜRI?! Do kunnt mir grad dr Kaffi obsi! E Stadt, wo dr See brucht, will si kai rächte Fluss het.",
      "Dr FCZ … die hän e Stadion mit Laufbahn, hösch! Do gsehsch dr Ball numme mit em Fäldstächer.",
      "Züri isch scho rächt – zum Durefahre. Die Pünkt nämme mir mit, dr Räscht chönne si bhalte!",
    ])]],
    [/\bgc\b|grasshopper|hoppers/, () => ["GC? Git s die no? Die hän meh Trainer gha als Zueschauer, gopfertelli! Aber e Sieg gege si schmeggt glych jedes Mol wie Wiehnachte."]],
    [/\byb\b|young boys|bern|bärn|wankdorf/, () => [pick([
      "YB! Die spile uf Plastiggras, das isch doch kai Fuessball, das isch Minigolf!",
      "D Bärner sinn scho rächt, numme e bitz langsam. Bis die «Goal» gsait hän, hän mir scho s zwaite gmacht!",
    ])]],
    [/st\.? ?gallen|sanggalle|espen/, () => ["Sanggalle? Gueti Brotwurscht, das mues me ne lo. Aber wär Sänf verbietet, dä het au susch e Problem. D Pünkt kömme mit uf Basel!"]],
    [/luzern|luzärn|servette|genf|lausanne|lugano|sion|sitten|winterthur|thun|vaduz|aarau/, () => ["Alles nätti Vereinli, ohni Seich. Aber wenn si ins Joggeli kömme, git s nyt z hole usser e Wurscht und e langi Heimreis!"]],
    [/bayern|münchen|barcelona|barça|barca/, () => ["Halt, halt! Dr ainzig FCB, wo zellt, spilt am Rhy und treit ROT und BLAU. Alli andere hän d Buechstabe numme usglehnt!"]],
    [/champions league|europa|königsklasse|conference|europacup/, () => ["Europa-Nächt im Joggeli – do stöhn mir d Hoor uf, wenn ych numme dra dängg! Fluetliecht, Hymne, Gänsehut. Dört ghöre mir ane, jedes Johr!"]],
    [/nati|nationalmannschaft|schweiz|\bwm\b|\bem\b/, () => ["D Nati lueg ych au, klar. Aber ohni Seich: Mi Härz het numme Platz für ei Mannschaft, und die isch rotblau."]],
    // Kurve, Stadion, Verein
    [/joggeli|stadion|st\.? ?jakob|sankt jakob/, () => [pick([
      "S Joggeli isch mi zwaiti Wohnig! Wenn s bebt, zitter ych am ganze Lyb. Das verstoht kai Mensch, wo nit dört gstande isch.",
      "St. Jakob-Park, schönscht Stadion vo dr Schwyz, fertig. Und d Wurscht isch au rächt, wenn d Schlange nit so lang wär!",
    ])]],
    [/muttenzerkurve|kurve|ultra|choreo|fahne|trummle|trommel|capo|sektor/, (q, ctx) => [...kurveNow(ctx), pick([
      "D Kurve isch unseri Wohnstube: lut, rotblau und mit Härz. Nünzig Minute stoh und singe, egal was uf dr Tafele stoht!",
      "E Choreo isch Handwärk, Kolleeg: wuchelang mole, schnyde, chläbe – und denn drüü Minute Gänsehut. Jede Pinselstrich wärt!",
      "In dr Kurve bisch nie ellai. Linggs e Brueder, rächts e Schwöschter, vorne dr FCB. Was «Us dr Kurve» grad lauft, gsehsch unter «Kurve».",
    ])]],
    [/sing|lied|gesang|fangesang|hymne|chant|anfeuern/, () => [pick([
      "🎶 «Rotblau isch unseri Farb, rotblau bis ins Grab – hopp FCB, hopp FCB, mir gänn di nie meh ab!» 🎶",
      "🎶 «Vom Rhy bis ins Joggeli, do tönt s us jedem Huus: Dr FCB, dr FCB, dä stirbt bi uns nie us!» 🎶",
      "🎶 «Olééé, olé olé olééé – FC Basel, FCB!» 🎶 Jetzt du, aber LUT!",
    ]), "Sälber dichtet, hösch. Dr Grammy kunnt no."]],
    [/gegründet|gründung|1893|geschichte|gschicht|tradition|wie alt ist der|seit wann gibt/, () => ["1893 gründet, Kolleeg! Sit do rot und blau. Dr FCB isch älter als dyni Urgrossmuetter und het meh erläbt als mir alli zämme."]],
    [/titel|meister|maischter|pokal|cup|double|erfolg/, () => ["Über zwanzig Mol Schwyzer Maischter und e ganze Schrank voll Cup-Pokal! Dr Platz in dr Vitrine wird knapp, aber für eine meh hän mir immer Platz."]],
    [/legende|bester spieler|beschte spieler|lieblingsspieler|idol/, () => ["Mi Lieblingsspieler isch immer dä, wo sich für s Lybli verrysst. Näme kömme und gönn, Rotblau blybt!"]],
    [/schiri|schiedsrichter|\bvar\b|penalty|elfmeter|abseits|offside/, () => [pick([
      "VAR, Linie, Standbild – ych drey dure! Früener het me aifach gjublet, hüt mues me zerscht drüü Minute warte, öb me darf!",
      "Pfiff gege uns sinn immer falsch, Pfiff für uns immer korräkt. Das isch kai Mainig, das isch Physik!",
    ])]],
    [/trainer|coach|taktik|system|aufstellen/, () => ["Taktik? Elf Maa, wo renne und kämpfe, und e Kurve, wo brüelt. Dr Räscht isch Gschnorr vo Lüt mit Laptop!"]],
    // Basel und das Leben
    [/bier|trinken|suufe|saufen|durst|stange|prost|zum wohl/, () => [pick([
      "E Stange vor em Match, eini in dr Pause, eini drnoch – das isch kai Suufe, das isch Tradition! Proscht!",
      "Proscht, Kolleeg! Aber dängg dra: Wär nümm cha singe, het z viel gha.",
    ])]],
    [/wurst|wurscht|\bessen\b|ässe|hunger|klöpfer|chlöpfer|läckerli|leckerli|mehlsuppe|mählsuppe|zibelewaie/, () => ["E Chlöpfer vom Grill mit Brot, und d Wält isch in Ornig. Und drhai e Läckerli zum Dessert. Basler Chuchi, beschti Chuchi!"]],
    [/fasnacht|morgestraich|morgenstreich|gugge|larve|räppli|schnitzelbank|schnitzelbangg/, () => ["Fasnacht! Die drei schönschte Dääg! Am Mäntig am vieri Morgestraich, und wenn dr FCB no am glyche Wuchenänd gwünnt, bruuch ych e Wuche Ferie."]],
    [/basel|rhein|rhy\b|bebbi|münster|kleinbasel|glaibasel/, () => ["Basel isch kai Stadt, Basel isch e Gfühl! Im Summer in Rhy gumpe, im Winter ins Joggeli – meh bruucht e Mensch nit."]],
    [/psalm|bibel|beten|bäte|gott|kirche|amen/, () => ["Ych bät vor jedem Penalty, das chasch mir glaube! Dr Psalm vom Daag findsch im Tab «Psalm» – schadet nie, grad vor eme Derby."]],
    [/frau|freundin|familie|kinder|mamme|mutter|hund/, () => ["D Mamme sait, ych syg nit ganz bache. Dr Hund verschlüfft sich unters Sofa, wenn ych brüel. Aber beidi hän e rotblaue Schal, do lueg ych druff!"]],
    [/arbeit|job|beruf|schaffe|büro|chef/, () => ["Schaffe tue ych vo Mäntig bis Frytig, läbe am Wuchenänd im Stadion. Und am Mäntig bin ych heiser, das waiss dr Chef."]],
    [/witz|lustig|bring mich zum lachen|joke/, () => [pick([
      "Was isch dr Unterschid zwüsche Züri und eme Joghurt? S Joghurt het e läbigi Kultur. 😄",
      "Wieso nämme d Bärner e Leitere mit ins Stadion? Will s heisst, d Tabälle göng obsi. 😄",
      "Was macht e Zürcher, wenn dr FCZ Maischter wird? D Playstation abstelle. 😄",
    ])]],
    // Wer es mit den anderen hält
    [/ich bin .*(fcz|zürcher|gc|yb|berner|bayern)|fan vo(n|m)? (zürich|fcz|gc|yb|bern|bayern)/, () => ["Oha. Mi Byleid, ohni Seich. Aber s isch nie z spoot: D Türe vom Joggeli stöhn offe, und e Schal han ych no eine übrig!"]],
    [/(fcb|basel|dani|du) (ist|isch|bist|bisch|sind|sinn) .*(scheisse|schiss|schlecht|blöd|bled|dumm|doof|peinlich|kacke)|halts maul|halt d schnure|idiot|trottel|depp|arschloch|lappi/, () => [pick([
      "Hösch, hösch! So schwätzt me nit mit em Dani. Chumm, mir trinke eis, und denn sing mer zämme. HOPP FCB!",
      "Jo spinnsch? Dä Satz hesch sicher in Züri glehrt. Ych nimm s dir nit übel – ych bi z guet ufgleggt.",
      "Brüel du numme. Ych bi sit 1998 in dr Kurve, mi bringt nyt meh us dr Rueh. Usser e Gegetor in dr 93.",
    ])]],
    [/hopp|allez|forza|rotblau|olé|ole ole/, () => [pick(["HOPP FCB!!! So gfallsch mir, Kolleeg! ❤️💙", "ALLEZ, ALLEZ, ALLEZ! Lüter, ych ghör di nit! ❤️💙", "ROTBLAU BIS IN TOD! Du bisch e Guete! ❤️💙"])]],
    [/liebe dich|lieb di|hab dich gern|ha di gärn|bester|beschte|cool|geil|super|stark|gut gemacht/, () => ["Jetzt wird ych grad rot – und blau drzue! Du bisch au e Guete. Mir gsehn is in dr Kurve!"]],
    [/danke|merci|dangge|dankschön/, () => [pick(["Gärn gscheh, Kolleeg! Für Rotblaui immer.", "Kai Ursach! Und jetzt: Schal um und HOPP FCB!"])]],
    [/tschüss|tschau|ciao|adieu|bis bald|bis später|gute nacht|guet nacht|ade\b|uf wiederluege/, () => [`Mach s guet, Kolleeg! ${pick(OUT)}`]],
    [/^(hoi|hey|hallo|sali|salü|salli|hi|hello|servus|grüezi|grüessech|guten (morgen|tag|abend)|guete (morge|daag|obe)|moin|tach|hösch)\b/, () => [
      pick(["Sali, du Bebbi! Dr Dani isch do. Was wotsch wüsse?", "HÖSCH! Schön, dass verby luegsch. Schal scho um?", "Sali zämme! Ych ha grad e Kaffi gmacht und bi parat. Schiess los!"]),
    ]],
  ];

  const GUARDS = 2; // die ersten Regeln gehen allem anderen vor

  const FALLBACK = [
    "Hä? Das han ych jetzt nit ganz verstande – ych bi e Fuessball-Grind, kai Brofässer. Frog mi nach em nögschte Spiel, dr Tabälle oder de News!",
    "Jä nu, do bin ych überfrogt. Aber wenn s um Rotblau goht, bin ych dy Maa: Spiel, Tabälle, Kader, Wätter – tipp aifach druff.",
    "Kai Ahnig, Kolleeg, ohni Seich. Ych waiss numme ebbis über dr FCB, s Joggeli, Bier und Wurscht. Probier s nomol!",
    "Das isch mir z hoch. Aber eis waiss ych sicher: HOPP FCB! Frog mi ebbis über dr Club.",
  ];

  const CHIPS = ["Nächstes Spiel?", "Wie stehts?", "Tabelle", "Was gibts Neues?", "Wetter fürs Spiel", "Us dr Kurve", "Sing ein Lied", "Was hältst du von Zürich?", "Erzähl einen Witz", "Noch einen!"];

  // Weitere Sprüche je Thema, damit Dani nicht immer dasselbe sagt. Ein Beispielwort bestimmt
  // die Regel, zu der sie gehören; gewählt wird aus diesen und den Sprüchen der Regel.
  const MORE = {
    sali: [
      "Sali, sali! Kumm yne, d Kurve het immer no e Platz frei. Was git s?",
      "Hoi zämme! Ych bi grad am Schal bügle – jo, das macht me. Was wotsch wüsse?",
      "Lueg do, e Bebbi! Sitz ane, nimm e Bier, verzell.",
    ],
    "alles klar": [
      "Solang dr FCB spilt, goht s mir guet. In dr Sommerpause bin ych e Wrack.",
      "Mi Stimm isch wäg, mi Härz isch voll. Besser goht s nit!",
      "Ych ha hüt scho drüümol d Tabälle agluegt. Also: normal.",
    ],
    fcz: [
      "Z Züri hän si alles: Gäld, See, Banke. Numme kai Fuessball, wo me cha aaluege.",
      "Dr FCZ isch wie s Wätter im Novämber: Me mues es halt ushalte. Aber d Pünkt blybe z Basel!",
      "Wenn ych «Züri» ghör, zuggt mi rächts Aug. Dr Doggter sait, das syg unheilbar.",
    ],
    grasshopper: [
      "GC – Rekordmaischter vo anno Tubak. Sit do lueget si uns vo unde zue.",
      "D Heugümper! Bi dene kennt me d Zueschauer bim Vorname. Alli zwölf.",
    ],
    "young boys": [
      "YB het johrzähntelang Zwaite gmacht, das mues me au zerscht könne. Ych gunn ne s – aber nit gege uns.",
      "Z Bärn isch alles gmüetlig. Usser wenn mir kömme, denn wird s ungmüetlig!",
    ],
    sanggalle: [
      "D Sanggaller sinn luti Sieche, Reschpäggt. Aber lut sy ellai längt nit – mir sinn lut UND guet.",
      "Oschtschwyz, dört wo d Wurscht ohni Sänf gässe wird. Do bruucht s kai wytere Kommentar.",
    ],
    servette: [
      "Jede Gegner isch e guete Gegner – wenn er mit null Pünkt wieder haigoht.",
      "Ych ha Reschpäggt vor allne, wo in d Kurve stöhn, egal wo. Aber gwünne tüen mir!",
    ],
    europacup: [
      "Unter dr Wuche Fuessball am Obe, Fluetliecht, grossi Näme – und mir mittedrin. Do läbt e Bebbi uf!",
      "Mir hän in Europa scho Grossi gärgeret, und mir mache s wieder. Dr Joggeli vergisst nyt!",
    ],
    joggeli: [
      "Bim erschte Schritt us em Tram gsehsch s Joggeli und s Härz macht e Gump. Jedes Mol, sit 1998.",
      "Dehai isch, wo s Joggeli stoht. D Wohnig isch numme zum Schlofe.",
    ],
    choreo: [
      "Mir sueche kai Applaus, mir sueche Gänsehut. Wenn dr Sektor als Aine singt, hesch si.",
      "Kurve haisst: früeh ko, lang blybe, alles gä. Wär sitze wott, het e Sofa dehai.",
      "D Trummle git dr Takt, d Kurve dr Räscht. Und ych mi Stimm – jedes Wuchenänd nei.",
    ],
    schiri: [
      "Dr Schiri het s nit eifach, ych waiss. Aber in däm Momänt waiss ych s amme nümme!",
      "Früener het e Tor zellt, wenn dr Ball dinne gsi isch. Hüt bruuchsch drzue e Sitzig.",
    ],
    taktik: [
      "Vierer-Kettene, Dreier-Kettene – Hauptsach d Kettene hebe. Und vorne aine, wo s Tor trifft.",
      "Ych ha kai Trainerschyn, aber e Mainig. Und die isch lut!",
    ],
    bier: [
      "S erschte Bier isch für dr Durscht, s zwaite für d Stimm, s dritte für d Träne – Fraid oder Leid.",
      "Ohni Bier kai Kurve? Dumms Züg. Aber mit Bier singt s sich ringer.",
    ],
    wurscht: [
      "Wurscht, Brot, Sänf – das isch e Basler Menü mit drei Gäng.",
      "Vor em Match e Wurscht, noch em Match e Wurscht. Dr Doggter sait nai, s Härz sait jo.",
    ],
    fasnacht: [
      "Piccolo, Drummle und Räppli in dr Unterhose bis im Mai. Das isch Basel!",
      "An dr Fasnacht bin ych still und los zue. Das isch s ainzig Mol im Johr.",
    ],
    bebbi: [
      "E Bebbi blybt e Bebbi, au wenn er wägzieht. Dr Rhy fliesst jo au wyter und isch glych vo do.",
      "Glaibasel oder Grossbasel, das isch e Glaubensfrog. Bim FCB sinn mir alli glych.",
    ],
    witz: [
      "Was isch s Schönschte an Züri? S Usfahrtsschild «Basel». 😄",
      "Zwei Zürcher laufe in e Bar. Dr FCZ verliert trotzdäm. 😄",
      "Wie haisst e Bärner im Sprint? Kunnt no. 😄",
    ],
    allez: [
      "HOPP FCB! Ych ha grad d Nochbere gweggt, aber das isch s wärt! ❤️💙",
      "JOOO! Genau so! Und jetzt alli zämme: ROT! BLAU! ❤️💙",
    ],
    merci: ["Scho rächt, Kolleeg. Under Rotblaue hilft me sich.", "Für das bin ych do! Susch no ebbis?"],
    adieu: ["Tschau zämme! Und nit vergässe: Am Matchdaag isch Pflicht. ❤️💙", "Mach s guet! Ych gang jetzt e Fahne go bügle. ❤️💙"],
  };
  for (const [sample, lines] of Object.entries(MORE)) RULES.find(([pattern]) => pattern.test(sample)).more = lines;
  // Zur Kurve immer zuerst die aktuelle Ankündigung, auch vor einem Spruch
  RULES.find(([pattern]) => pattern.test("muttenzerkurve")).facts = kurveNow;

  const wordIn = (q, w) => ` ${q} `.includes(` ${w} `);

  // Wörter, auf die die Regeln hören. Ein vertipptes Wort wird auf das nächstliegende gezogen.
  const VOCAB = ["tabelle", "spielstand", "resultat", "nächstes", "spiel", "gegner", "anpfiff", "wetter", "kader", "goalie", "spieler",
    "news", "gerüchte", "transfer", "zürich", "grasshoppers", "luzern", "lugano", "servette", "lausanne", "winterthur", "joggeli",
    "stadion", "kurve", "choreo", "schiri", "trainer", "fasnacht", "bier", "wurst", "witz", "lied", "basel", "danke", "tschüss", "hallo"];

  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row;
    }
    return prev[b.length];
  }

  // "tabele" → "tabelle", "naechstes" → "nächstes"; kurze Wörter bleiben, wie sie sind
  function fixTypos(q) {
    return q.split(" ").map((word) => {
      if (word.length < 5 || VOCAB.includes(word)) return word;
      const plain = word.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü");
      if (VOCAB.includes(plain)) return plain;
      const near = VOCAB.find((v) => v.length >= 5 && distance(word, v) <= (v.length >= 8 ? 2 : 1));
      return near || word;
    }).join(" ");
  }

  const AGAIN = /^(noch (einen|eine|eins|ein|mal|mehr)|nochmal|nochmals|nomol|no eine|no eis|no meh|mehr|weiter|und (noch|sonst)|gleich nochmal)\b/;
  let lastQuestion = "";

  // Gibt die Antwort oder null, wenn Dani nichts dazu weiss
  function answer(q, ctx) {
    const hit = (rules) => rules.find(([pattern]) => pattern.test(q));
    // Reihenfolge: Schutzregeln (Gewalt, Pyro) → Fragen nach Daten und nach Dani selbst →
    // Schlagzeile von heute → Spieler aus dem Kader → Sprüche
    const guard = hit(RULES.slice(0, GUARDS));
    if (guard) return guard[1](q, ctx);
    const rule = hit(RULES.slice(GUARDS));
    const banter = rule && rule.more;
    if (rule && !banter && rule[1] !== squadRule) return rule[1](q, ctx);
    const topic = ((ctx.fcb && ctx.fcb.chat) || []).find((t) => t.words.some((w) => wordIn(q, w)));
    // Zu einem Gegner gibt es Sprüche und vielleicht eine Schlagzeile: mal so, mal so
    if (topic && !(banter && Math.random() < 0.5)) return [pick(topic.answers)];
    const p = findPlayer(ctx, q);
    if (p) return player(p);
    if (!rule) return null;
    if (!banter) return rule[1](q, ctx);
    // Aus den Sprüchen der Regel und den zusätzlichen wählen, gewichtet nach Anzahl
    return Math.random() < rule.more.length / (rule.more.length + 2) ? [...(rule.facts ? rule.facts(ctx) : []), pick(rule.more)] : rule[1](q, ctx);
  }

  function reply(text, ctx = {}) {
    let q = String(text).toLowerCase().replace(/[!?.,;:«»"()]+/g, " ").replace(/\s+/g, " ").trim();
    if (!q) return [pick(FALLBACK)];
    // «Noch einen!» wiederholt die letzte Frage (noch ein Witz, noch ein Lied …)
    if (AGAIN.test(q) && lastQuestion) q = lastQuestion;
    let out = answer(q, ctx);
    if (!out) {
      const fixed = fixTypos(q);
      if (fixed !== q) {
        q = fixed;
        out = answer(q, ctx);
      }
    }
    if (!out) return [pick(FALLBACK)];
    lastQuestion = q;
    return out;
  }

  function greeting(ctx = {}) {
    const d = ctx.live;
    const fx = d && [d.fx, d.next].find((f) => f && f.kickoff && f.kickoff.getTime() > Date.now());
    const days = fx ? daysUntil(fx.kickoff) : Infinity;
    const second = d && d.live && d.fx
      ? `Mir spile GRAD gege ${opponent(d.fx)}! Frog mi, wie s stoht – ych lueg mit eim Aug uf e Platz.`
      : days <= 1
        ? `${days <= 0 ? "HÜT" : "Morn"} isch Matchdaag gege ${opponent(fx)}, ych ha scho Härzchlopfe! Frog mi, was de wotsch.`
        : "Frog mi nach em nögschte Spiel, dr Tabälle, de News, em Kader oder em Wätter. Oder schwätz aifach mit mir über dr FCB!";
    const hour = new Date().getHours();
    const hello = hour < 5 ? "Hösch, no wach? Dr Dani au" : hour < 10 ? "Guete Morge, du Bebbi! Dr Dani isch do" : hour >= 18 ? "Guete Obe, du Bebbi! Dr Dani isch do" : "Sali, du Bebbi! Dr Dani isch do";
    return [`${hello} – Schal um, Schnuure uf. 🧣`, second];
  }

  return { reply, greeting, CHIPS };
})();

if (typeof module !== "undefined") module.exports = DaniChat;
