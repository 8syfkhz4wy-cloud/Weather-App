"use strict";

// Chat mit dem fiktiven Kurven-Experten Dani «Joggeli» Meier.
// Läuft ganz im Gerät: Antworten nach Stichworten, dazu die Daten, die die App ohnehin
// schon geladen hat (Spielstand, Tabelle, News, Kader, Wetter). Kein Server; was man
// schreibt, verlässt das Gerät nicht. Frische Sprüche kommen fertig aus dani.json, die
// der Veröffentlichungs-Ablauf mit GitHub Models schreibt (scripts/dani_ki.py).
// Wie in scripts/fcb.py gilt: derb und emotional, aber keine Gewaltaufrufe und keine
// Beleidigung echter, namentlich genannter Personen. Geflucht wird über Situationen.
const DaniChat = (() => {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
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

  function when(date) {
    const days = ["Sunntig", "Mäntig", "Zyschtig", "Mittwuch", "Dunnschtig", "Frytig", "Samschtig"];
    const time = date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    return `am ${days[date.getDay()]}, ${date.getDate()}.${date.getMonth() + 1}., um ${time}`;
  }

  // ---------- Antworten aus den Daten der App ----------

  function nextMatch(ctx) {
    const d = ctx.live;
    if (!d) return ["Dr Teletext git mir grad kai Antwort, gopfertelli! Lueg im Ticker noche, dört stoht s, sobald s wieder goht."];
    if (d.live && d.score) return score(ctx);
    const fx = [d.fx, d.next].find((f) => f && f.kickoff && f.kickoff.getTime() > Date.now());
    if (!fx) return ["Im Momänt isch kai Spiel agsetzt – und ych halt das fascht nit us, ohni Fuessball! Lueg im Ticker, sobald d nögschti Rundi stoht."];
    const place = fx.baselHome ? "dehai im Joggeli" : "usswärts";
    const days = Math.round((fx.kickoff.getTime() - Date.now()) / 86400000);
    const wait = days <= 0 ? "Das isch HÜT, ych ha scho Härzchlopfe!" : days === 1 ? "Das isch scho MORN – ych cha hüt z Nacht nit schlofe!" : `No ${days} Dääg – ych zell d Stunde!`;
    return [
      `Gege ${opponent(fx)}, ${place}, ${when(fx.kickoff)}. ${wait}`,
      fx.baselHome ? "Schal um, Stimm ööle und ab in d Kurve – s Joggeli mues bebe!" : "Usswärts isch d Kurve erscht rächt lut. Wär mitfahrt, isch e Guete!",
    ];
  }

  function score(ctx) {
    const d = ctx.live;
    const fx = d && d.fx;
    if (!fx || !d.score) return ["Grad lauft kai Spiel und ych ha kai Resultat. " + nextMatch(ctx)[0]];
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

  function table(ctx) {
    const rows = (ctx.live && ctx.live.table) || [];
    const us = rows.find((r) => r.team === "Basel");
    if (!us) return ["D Tabälle han ych grad nit do – dr Teletext schloft. Lueg im Ticker, dört kunnt si, sobald s goht."];
    const first = rows[0];
    const base = `Mir sinn uf Platz ${us.rank} mit ${us.points} Pünkt us ${us.played} Spiel (Tor ${us.goals}).`;
    if (us.rank === 1) return [`${base} GANZ OBE, wo mir ane ghöre! Vo dört obe gseht me dr Rhy am beschte!`];
    const gap = first.points - us.points;
    const mood = us.rank <= 3 ? "Mir sinn dra, das wird no heiss!" : us.rank <= 6 ? "Do goht no meh, gopferdammi – ufe mit uns!" : "Das isch nit unsere Platz, verreckt nomol. Aber d Kurve singt in jedere Lag!";
    return [`${base} Vorne isch ${team(first.team)}, ${gap} Pünkt vor uns. ${mood}`];
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

  function weather(ctx) {
    const c = ctx.w && ctx.w.current;
    if (!c) return ["S Wätter lädt grad no. Aber egal: E Rotblaue goht bi jedem Wätter an Match!"];
    const t = Math.round(c.temperature_2m);
    const code = c.weather_code;
    const where = ctx.place && ctx.place.name ? `Z ${ctx.place.name}` : "Dusse";
    const sky = code >= 95 ? "und es gwitteret" : code >= 71 && code <= 86 && code !== 80 && code !== 81 && code !== 82 ? "und es schneit" : code >= 51 ? "und es schifft" : code >= 45 ? "und es het Näbel" : code >= 2 ? "und es isch bewölggt" : "und dr Himmel isch offe";
    const tip = code >= 95 ? "Bi däm Wätter blybt sogar ych e Momänt unterem Dach." : code >= 51 ? "Rägejagge aa – e Schirm in dr Kurve isch öbbis für Zürcher!" : t <= 3 ? "Schal dopplet umwiggle und e Glüehwy in d Hand, denn goht das." : t >= 27 ? "Viel trinke, Lüt. Und ych main nit nur Bier. Aber au." : "Perfekts Fuessballwätter, was wotsch meh?";
    return [`${where} het s ${t} Grad ${sky}. ${tip}`];
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
    [/bist du (echt|ein mensch|eine? ki|ein bot|ein roboter)|bisch (du )?(ächt|echt|e mensch|e bot|e ki)|chatgpt|künstliche intelligenz|\bki\b|\bbot\b|roboter|wer hat dich|programmiert/, (q, ctx) => [
      ctx.ai && ctx.ai.answers
        ? "Ohni Seich: Ych bi e erfundeni Figur, kai Mensch. E Dail vo myne Sprüch schrybt e KI alli paar Stund neu, aber die loost dir nit zue – d App suecht numme dr passend Spruch use."
        : "Ohni Seich: Ych bi e erfundeni Figur. Kai Mensch und kai gschydi Maschine – numme e Huffe feschti Sprüch in dere App, wo uf dyni Wörter loose.",
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
    [/wetter|wätter|regen|räge|regnet|schifft|schnee|schneit|kalt|warm|heiss\b|sonne|temperatur|schirm|jacke/, (q, ctx) => weather(ctx)],
    [/\blive\b|spielstand|wie stehts|wie steht es|wie stoht|resultat|ergebnis|gewonnen|verloren|gwunne|verlore|hän mir|haben wir|tore heute|letztes spiel|letscht/, (q, ctx) => score(ctx)],
    [/nächst|nögscht|naechst|wann spiel|wenn spiel|gegen wen|gege wär|gegner|anpfiff|spieltag|match|heimspiel|auswärts|usswärts/, (q, ctx) => nextMatch(ctx)],
    [/tabelle|tabälle|\bplatz\b|\brang\b|punkte|pünkt|leader|tabellen|wo stehen|wo stöhn|meister werden|maischter wärde/, (q, ctx) => table(ctx)],
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
    [/muttenzerkurve|kurve|ultra|choreo|fahne|trummle|trommel|capo|sektor/, () => [pick([
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

  const CHIPS = ["Nächstes Spiel?", "Wie stehts?", "Tabelle", "Was gibts Neues?", "Wetter fürs Spiel", "Sing ein Lied", "Was hältst du von Zürich?", "Erzähl einen Witz"];

  // Themen, zu denen dani.json frische Sprüche liefern kann (scripts/dani_ki.py, über GitHub Models).
  // Ein Beispielwort bestimmt die Regel; Fragen nach Daten und nach Dani selbst bleiben fest.
  const AI_KEYS = {
    sali: "gruss", "alles klar": "befinden", fcz: "zuerich", grasshopper: "gc", "young boys": "yb", sanggalle: "stgallen",
    servette: "andere", europacup: "europa", joggeli: "joggeli", choreo: "kurve", schiri: "schiri", taktik: "trainer",
    bier: "bier", wurscht: "essen", fasnacht: "fasnacht", bebbi: "basel", witz: "witz", allez: "hopp", merci: "danke", adieu: "tschuess",
  };
  for (const [sample, key] of Object.entries(AI_KEYS)) RULES.find(([pattern]) => pattern.test(sample)).key = key;
  const AI_SHARE = 0.6; // so oft kommt ein frischer statt ein fester Spruch

  function reply(text, ctx = {}) {
    const q = String(text).toLowerCase().replace(/[!?.,;:«»"()]+/g, " ").replace(/\s+/g, " ").trim();
    const ai = ctx.ai || {};
    const fresh = (key, fixed) => {
      const lines = (ai.answers || {})[key] || [];
      return lines.length && Math.random() < AI_SHARE ? [pick(lines)] : fixed();
    };
    const fallback = () => fresh("fallback", () => [pick(FALLBACK)]);
    if (!q) return fallback();
    const hit = (rules) => rules.find(([pattern]) => pattern.test(q));
    // Reihenfolge: Schutzregeln (Gewalt, Pyro) → Fragen nach Daten und nach Dani selbst →
    // Schlagzeile von heute → Spieler aus dem Kader → Sprüche → nicht verstanden
    const guard = hit(RULES.slice(0, GUARDS));
    if (guard) return guard[1](q, ctx);
    const rule = hit(RULES.slice(GUARDS));
    if (rule && !rule.key && rule[1] !== squadRule) return rule[1](q, ctx);
    const topic = (ai.topics || []).find((t) => t.words.some((w) => ` ${q} `.includes(` ${w} `)));
    if (topic) return [pick(topic.answers)];
    const p = findPlayer(ctx, q);
    if (p) return player(p);
    return rule ? fresh(rule.key, () => rule[1](q, ctx)) : fallback();
  }

  function greeting() {
    return ["Sali, du Bebbi! Dr Dani isch do – Schal um, Schnuure uf. 🧣", "Frog mi nach em nögschte Spiel, dr Tabälle, de News, em Kader oder em Wätter. Oder schwätz aifach mit mir über dr FCB!"];
  }

  return { reply, greeting, CHIPS };
})();

if (typeof module !== "undefined") module.exports = DaniChat;
