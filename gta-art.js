"use strict";

// GTA-6-Banner: eigene Illustration einer Küstenstadt im Neonlicht – Sportwagen auf der
// Uferstrasse, Skyline mit beleuchteten Fenstern, Palmen und eine Leuchtreklame zum
// gewählten Thema. Reines SVG ohne Bilder; Lack und Reklame in der Farbe des Themas,
// abends und nachts mit Mond statt Sonne. Bewegt wird nur per CSS (styles.css,
// ".gta-art .ga-…"), bei "Bewegung reduzieren" steht alles still.
const GtaArt = (() => {
  const hex2 = (n) => n.toString(16).padStart(2, "0");
  // Farbe aufhellen (amt > 0) oder abdunkeln (amt < 0), amt zwischen -1 und 1
  function shade(color, amt) {
    const n = parseInt(color.slice(1), 16);
    const mix = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => hex2(mix(c))).join("")}`;
  }
  // Gleichbleibender Zufall: das Bild sieht bei jedem Aufbau gleich aus
  const rnd = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const f = (n) => Math.round(n * 10) / 10;
  const at = (cx, cy, r, deg) => [f(cx + Math.cos((deg * Math.PI) / 180) * r), f(cy + Math.sin((deg * Math.PI) / 180) * r)];

  // ---------- Himmel ----------

  function stars(night) {
    let s = "";
    const n = night ? 64 : 26;
    for (let i = 0; i < n; i++) {
      const x = f(rnd(i) * 640);
      const y = f(rnd(i + 99) * (night ? 150 : 80));
      const r = f(0.4 + rnd(i + 7) * (night ? 1.1 : 0.6));
      s += `<circle class="ga-star" cx="${x}" cy="${y}" r="${r}" style="animation-delay:${f(rnd(i + 3) * 3)}s"/>`;
    }
    return `<g fill="#fff" opacity="${night ? 0.9 : 0.5}">${s}</g>`;
  }

  function sun() {
    return `<circle cx="320" cy="176" r="160" fill="url(#gaSunGlow)"/>
      <g class="ga-sun" mask="url(#gaSunMask)"><circle cx="320" cy="176" r="76" fill="url(#gaSun)"/></g>`;
  }

  function moon() {
    const craters = [[-7, -5, 4], [6, 4, 3], [-2, 9, 2.4], [8, -8, 2]];
    return `<circle cx="472" cy="64" r="70" fill="url(#gaMoonGlow)"/>
      <circle cx="472" cy="64" r="22" fill="#f4f0ff"/>
      ${craters.map(([dx, dy, r]) => `<circle cx="${472 + dx}" cy="${64 + dy}" r="${r}" fill="#d8d0f4"/>`).join("")}`;
  }

  // Kleines Flugzeug mit Werbebanner (fliegt per CSS über den Himmel)
  function plane(accent, night) {
    const body = night ? "#2a2350" : "#ffe1f0";
    return `<g class="ga-plane">
      <path d="M38 41 L96 40" stroke="${body}" stroke-width="0.6" opacity="0.7"/>
      <rect x="2" y="35" width="36" height="11" rx="1.5" fill="${accent}" opacity="0.9"/>
      <path d="M6 40.5 H34" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 2" opacity="0.85"/>
      <path d="M96 40 q4 -3 14 -2 l4 2 -4 2 q-10 1 -14 -2 Z" fill="${body}"/>
      <path d="M104 39 l-3 -7 h3 l5 7 Z M104 41 l-3 6 h3 l5 -6 Z" fill="${body}"/>
      <circle class="ga-blink" cx="114" cy="40" r="1.3" fill="#ff3d5a"/></g>`;
  }

  // ---------- Stadt ----------

  function farCity(night) {
    let s = "";
    let x = -6;
    for (let i = 0; x < 646; i++) {
      const w = 14 + Math.round(rnd(i + 40) * 18);
      const center = Math.abs(x + w / 2 - 320) < 95; // vor der Sonne nur flache Häuser
      const h = center ? 8 + Math.round(rnd(i + 80) * 16) : 24 + Math.round(rnd(i + 80) * 56);
      s += `<rect x="${x}" y="${200 - h}" width="${w}" height="${h}"/>`;
      x += w + 2;
    }
    return `<g fill="${night ? "#1b1042" : "#5e1f6c"}" opacity="${night ? 1 : 0.75}">${s}</g>`;
  }

  // x, Breite, Höhe, Form – die Lücke in der Mitte lässt die Sonne sehen
  const TOWERS = [
    [-4, 30, 70, "flat"], [28, 22, 96, "flat"], [52, 30, 58, "flat"], [86, 26, 74, "flat"],
    [148, 54, 84, "deco"], [208, 18, 126, "spire"], [230, 30, 66, "flat"],
    [392, 34, 110, "round"], [430, 26, 80, "flat"], [460, 44, 62, "flat"], [508, 26, 100, "spire"],
    [538, 42, 74, "deco"], [584, 30, 90, "flat"], [618, 26, 64, "flat"],
  ];

  function tower([x, w, h, kind], i, night, accent) {
    const top = 200 - h;
    let shape;
    if (kind === "deco") shape = `<path d="M${x} 200 V${top + 12} H${x + 5} V${top + 6} H${x + 11} V${top} H${x + w - 11} V${top + 6} H${x + w - 5} V${top + 12} H${x + w} V200 Z"/>`;
    else if (kind === "round") shape = `<path d="M${x} 200 V${top + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${top + w / 2} V200 Z"/>`;
    else shape = `<rect x="${x}" y="${top}" width="${w}" height="${h}"/>`;
    // Fenster: ein Teil brennt, warm oder kühl
    let win = "";
    const lit = night ? 0.5 : 0.32;
    for (let wx = x + 4; wx <= x + w - 6; wx += 6) {
      for (let wy = top + (kind === "deco" ? 16 : 10); wy < 194; wy += 8) {
        const r = rnd(wx * 7.3 + wy * 1.7 + i);
        if (r > lit) continue;
        const c = r < lit * 0.62 ? "#ffcf6b" : r < lit * 0.88 ? "#7ce8ff" : "#ff8fc8";
        win += `<rect x="${wx}" y="${wy}" width="2.4" height="3.4" fill="${c}"/>`;
      }
    }
    let extra = "";
    if (kind === "spire") {
      extra = `<path d="M${x + w / 2} ${top} V${top - 18}" stroke="${night ? "#2a1a55" : "#2a0f45"}" stroke-width="2"/>
        <circle class="ga-blink" cx="${x + w / 2}" cy="${top - 19}" r="2" fill="#ff3d5a" style="animation-delay:${i % 3 * 0.4}s"/>`;
    }
    if (kind === "round") {
      const neon = `M${x + 2} ${top + w / 2 + 2} A${w / 2 - 2} ${w / 2 - 2} 0 0 1 ${x + w - 2} ${top + w / 2 + 2}`;
      extra = `<path d="${neon}" fill="none" stroke="${accent}" stroke-width="5" opacity="0.3"/>
        <path class="ga-flicker" d="${neon}" fill="none" stroke="${shade(accent, 0.5)}" stroke-width="1.6"/>`;
    }
    return `${shape}<g opacity="0.9">${win}</g>${extra}`;
  }

  function city(night, accent) {
    const body = TOWERS.map((t, i) => tower(t, i, night, accent)).join("");
    // Senkrechtes Neonschild am Hotel rechts
    const letters = "HOTEL".split("").map((ch, k) => `<text x="${581}" y="${148 + k * 10}">${ch}</text>`).join("");
    const sign = `<rect x="574" y="139" width="14" height="52" rx="2" fill="#12061f" stroke="#7ce8ff" stroke-width="1" opacity="0.95"/>
      <g class="ga-flicker" font-family="Arial Black, Helvetica, sans-serif" font-size="8.5" font-weight="900" text-anchor="middle">
        <g fill="none" stroke="#7ce8ff" stroke-width="2.6" opacity="0.35">${letters}</g><g fill="#d9fbff">${letters}</g></g>`;
    return `<g fill="${night ? "#120a2b" : "#2a0f45"}">${body}</g>${sign}`;
  }

  // ---------- Leuchtreklame zum Thema ----------

  // Vierzackiger Funkelstern
  const sparkle = (x, y, r) => {
    const q = f(r * 0.28);
    return `<path d="M${x} ${y - r} L${f(x + q)} ${f(y - q)} L${x + r} ${y} L${f(x + q)} ${f(y + q)} L${x} ${y + r} L${f(x - q)} ${f(y + q)} L${x - r} ${y} L${f(x - q)} ${f(y - q)} Z"/>`;
  };

  const ICONS = {
    heute: (cx, cy) => {
      const pts = Array.from({ length: 10 }, (_, k) => at(cx, cy + 2, k % 2 ? 7.5 : 18, -90 + k * 36).join(",")).join(" ");
      return `<polygon points="${pts}"/>`;
    },
    tipps: (cx, cy) => {
      const rays = [-150, -120, -90, -60, -30].map((a) => `M${at(cx, cy - 3, 15, a).join(" ")} L${at(cx, cy - 3, 20, a).join(" ")}`).join(" ");
      return `<path d="M${cx - 5} ${cy + 9} C${cx - 5} ${cy + 3} ${cx - 11} ${cy + 1} ${cx - 11} ${cy - 5} A11 11 0 1 1 ${cx + 11} ${cy - 5} C${cx + 11} ${cy + 1} ${cx + 5} ${cy + 3} ${cx + 5} ${cy + 9} Z"/>
        <path d="M${cx - 5} ${cy + 13} H${cx + 5} M${cx - 3} ${cy + 17} H${cx + 3} ${rays}"/>`;
    },
    cheats: (cx, cy) => `<path d="M${cx - 21} ${cy + 1} Q${cx - 21} ${cy - 10} ${cx - 11} ${cy - 10} H${cx + 11} Q${cx + 21} ${cy - 10} ${cx + 21} ${cy + 1} L${cx + 23} ${cy + 10} Q${cx + 23} ${cy + 17} ${cx + 16} ${cy + 15} L${cx + 9} ${cy + 7} H${cx - 9} L${cx - 16} ${cy + 15} Q${cx - 23} ${cy + 17} ${cx - 23} ${cy + 10} Z"/>
      <path d="M${cx - 15} ${cy - 1} H${cx - 7} M${cx - 11} ${cy - 5} V${cy + 3}"/>
      <circle cx="${cx + 9}" cy="${cy - 3}" r="1.7"/><circle cx="${cx + 14}" cy="${cy + 1}" r="1.7"/>`,
    orte: (cx, cy) => `<path d="M${cx} ${cy + 17} C${cx - 4} ${cy + 10} ${cx - 12} ${cy + 3} ${cx - 12} ${cy - 5} A12 12 0 1 1 ${cx + 12} ${cy - 5} C${cx + 12} ${cy + 3} ${cx + 4} ${cy + 10} ${cx} ${cy + 17} Z"/>
      <circle cx="${cx}" cy="${cy - 5}" r="4.2"/>
      <path d="M${cx - 30} ${cy + 15} Q${cx - 20} ${cy + 6} ${cx - 10} ${cy + 15}" stroke-dasharray="2 3"/>`,
    autos: (cx, cy) => {
      const ticks = [210, 245, 280, 315, 350].map((a) => `M${at(cx, cy + 6, 13, a).join(" ")} L${at(cx, cy + 6, 17, a).join(" ")}`).join(" ");
      return `<path d="M${at(cx, cy + 6, 20, 200).join(" ")} A20 20 0 1 1 ${at(cx, cy + 6, 20, 340).join(" ")}"/>
        <path d="${ticks}"/>
        <g class="ga-needle" style="transform-origin:${cx}px ${cy + 6}px"><path d="M${cx} ${cy + 6} L${cx + 11} ${cy - 5}"/></g>
        <circle cx="${cx}" cy="${cy + 6}" r="2"/>`;
    },
    waffen: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="14"/><circle cx="${cx}" cy="${cy}" r="5.5"/>
      <path d="M${cx - 21} ${cy} H${cx - 9} M${cx + 9} ${cy} H${cx + 21} M${cx} ${cy - 21} V${cy - 9} M${cx} ${cy + 9} V${cy + 21}"/>`,
    geld: (cx, cy) => `<path d="M${cx + 9} ${cy - 10} C${cx + 4} ${cy - 15} ${cx - 10} ${cy - 14} ${cx - 10} ${cy - 6} C${cx - 10} ${cy + 2} ${cx + 10} ${cy - 2} ${cx + 10} ${cy + 7} C${cx + 10} ${cy + 15} ${cx - 5} ${cy + 16} ${cx - 11} ${cy + 10} M${cx} ${cy - 18} V${cy + 18}"/>
      ${sparkle(cx + 23, cy - 11, 6)}${sparkle(cx - 22, cy + 11, 4.5)}${sparkle(cx + 19, cy + 13, 3.2)}`,
  };

  function billboard(motif, accent) {
    const x = 126;
    const y = 36;
    const w = 98;
    const h = 60;
    const cx = x + w / 2;
    const cy = y + h / 2;
    let bulbs = "";
    let k = 0;
    for (let bx = x + 4; bx <= x + w - 4; bx += 9) {
      bulbs += `<circle class="ga-bulb" cx="${bx}" cy="${y + 0.5}" r="1.3" style="animation-delay:${k++ % 2 ? 0.6 : 0}s"/>`;
      bulbs += `<circle class="ga-bulb" cx="${bx}" cy="${y + h - 0.5}" r="1.3" style="animation-delay:${k++ % 2 ? 0.6 : 0}s"/>`;
    }
    const icon = (ICONS[motif] || ICONS.heute)(cx, cy);
    return `<g>
      <path d="M${x + 22} ${y + h} V117 M${x + w - 22} ${y + h} V117" stroke="#1a0b2e" stroke-width="3"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#gaBoard)" stroke="${accent}" stroke-width="7" stroke-opacity="0.22"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="none" stroke="${shade(accent, 0.25)}" stroke-width="1.6"/>
      <g fill="#ffe9a8">${bulbs}</g>
      <g fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.28">${icon}</g>
      <g class="ga-flicker" fill="none" stroke="${shade(accent, 0.55)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
    </g>`;
  }

  // ---------- Meer, Promenade, Palmen ----------

  function sea(night) {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const w = 160 - k * 17;
      const cx = night ? 472 : 320;
      return `<rect class="ga-shimmer" x="${f(cx - w / 2)}" y="${204 + k * 5}" width="${f(w * (night ? 0.45 : 1))}" height="2" rx="1" fill="${night ? "#d8d0ff" : "#ff9a76"}" opacity="${f((night ? 0.45 : 0.75) - k * 0.07)}" style="animation-delay:${f(k * 0.3)}s"/>`;
    }).join("");
    return `<rect y="200" width="640" height="46" fill="url(#gaSea)"/>${rows}`;
  }

  function promenade() {
    let posts = "";
    for (let x = 8; x < 640; x += 32) posts += `<rect x="${x}" y="240" width="2" height="7" fill="#1a0b2e"/>`;
    return `${posts}<path d="M0 241 H640" stroke="#3ddcff" stroke-width="5" opacity="0.18"/>
      <path d="M0 241 H640" stroke="#8ff0ff" stroke-width="1.3"/>`;
  }

  // Palme: leicht gebogener Stamm mit Ringen, Krone aus hängenden Wedeln
  function palm(x, base, h, s, lean, delay) {
    const tx = x + lean;
    const ty = base - h;
    const qx = x + lean * 0.15;
    const qy = base - h * 0.55;
    const trunk = `M${f(x - 5 * s)} ${base} Q${f(qx - 4 * s)} ${f(qy)} ${f(tx - 2.2 * s)} ${f(ty)} L${f(tx + 2.2 * s)} ${f(ty)} Q${f(qx + 4 * s)} ${f(qy)} ${f(x + 5 * s)} ${base} Z`;
    let rings = "";
    for (let t = 0.12; t < 0.95; t += 0.085) {
      const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * qx + t * t * tx;
      const py = (1 - t) * (1 - t) * base + 2 * (1 - t) * t * qy + t * t * ty;
      const half = (5 - 2.8 * t) * s;
      rings += `M${f(px - half)} ${f(py)} L${f(px + half)} ${f(py + 1.2 * s)} `;
    }
    // Wedel: Winkel (0 = rechts, -90 = oben), Länge, Hängen
    const fronds = [[-178, 64, 28], [-152, 60, 16], [-124, 50, 8], [-96, 40, 4], [-70, 44, 6], [-44, 54, 12], [-18, 62, 20], [6, 64, 30], [160, 48, 30], [28, 50, 34]];
    const leaves = fronds.map(([a, len, droop]) => {
      const L = len * s;
      const ex = tx + Math.cos((a * Math.PI) / 180) * L;
      const ey = ty + Math.sin((a * Math.PI) / 180) * L * 0.55 + droop * s;
      const mx = (tx + ex) / 2;
      const my = (ty + ey) / 2;
      const lift = 13 * s;
      return `M${f(tx)} ${f(ty)} Q${f(mx)} ${f(my - lift)} ${f(ex)} ${f(ey)} Q${f(mx)} ${f(my - lift + 11 * s)} ${f(tx)} ${f(ty + 3 * s)} Z`;
    }).join(" ");
    return `<g fill="#0b0316">
      <path d="${trunk}"/><path d="${rings}" stroke="#2a1440" stroke-width="${f(1.1 * s)}" fill="none"/>
      <g class="ga-palm" style="transform-origin:${f(tx)}px ${f(ty)}px;animation-delay:${delay}s">
        <path d="${leaves}" stroke="#ff5c9a" stroke-opacity="0.35" stroke-width="0.8"/>
        <circle cx="${f(tx - 3 * s)}" cy="${f(ty + 4 * s)}" r="${f(3 * s)}"/><circle cx="${f(tx + 3 * s)}" cy="${f(ty + 5 * s)}" r="${f(2.8 * s)}"/>
      </g></g>`;
  }

  // ---------- Strasse und Sportwagen ----------

  function road() {
    // Muster immer 60 lang, damit die Bewegung (translateX -60) nahtlos weiterläuft;
    // die hintere Spur zieht langsamer vorbei als die vordere
    const dashes = (cls, y, w, pattern, op) => `<g class="${cls}"><path d="M-80 ${y} H760" stroke="#ffffff" stroke-width="${w}" stroke-dasharray="${pattern}" opacity="${op}"/></g>`;
    // Lichtspuren anderer Autos auf der Gegenfahrbahn
    const trails = [[256, "#ffd9a8", 0], [261, "#ff4d6a", 0.55]].map(([y, c, d]) =>
      `<path class="ga-trail" d="M560 ${y} H640" stroke="${c}" stroke-width="1.6" stroke-linecap="round" opacity="0.8" style="animation-delay:${d}s"/>`).join("");
    return `<rect y="246" width="640" height="54" fill="url(#gaRoad)"/>
      ${dashes("ga-dash-far", 265, 1.4, "24 36", 0.35)}${trails}${dashes("ga-dash", 294, 2.4, "34 26", 0.55)}`;
  }

  function wheel(cx, cy, accent) {
    const spokes = Array.from({ length: 10 }, (_, k) => {
      const a = k * 36 + (k % 2 ? 6 : 0);
      return `M${at(cx, cy, 3, a).join(" ")} L${at(cx, cy, 10.6, a).join(" ")}`;
    }).join(" ");
    const caliper = `M${at(cx, cy, 7.8, 196).join(" ")} A7.8 7.8 0 0 1 ${at(cx, cy, 7.8, 252).join(" ")}`;
    return `<path d="M${cx - 20.5} ${cy} A20.5 20.5 0 0 1 ${cx + 20.5} ${cy} Z" fill="#05030b"/>
      <circle cx="${cx}" cy="${cy}" r="17" fill="#08070d"/>
      <circle cx="${cx}" cy="${cy}" r="15.6" fill="none" stroke="#2b2838" stroke-width="1.2"/>
      <circle cx="${cx}" cy="${cy}" r="11.6" fill="#161824"/>
      <path d="${caliper}" fill="none" stroke="${accent}" stroke-width="3.4" stroke-linecap="round"/>
      <g class="ga-spin"><path d="${spokes}" stroke="#cfd6f5" stroke-width="2.1" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="11.6" fill="none" stroke="#e3e8ff" stroke-width="1.3"/></g>
      <circle cx="${cx}" cy="${cy}" r="2.6" fill="#eef1ff"/>`;
  }

  function car(accent) {
    const dark = shade(accent, -0.72);
    // Seitenansicht eines flachen Sportwagens, Front nach rechts
    const body = "M306 274 L300 262 L303 248 L352 240 C372 238 392 226 418 221 C432 219 444 220 452 224 L486 240 C512 244 536 248 552 254 L557 262 L553 270 L540 274 L521 274 L521 267 A21 21 0 0 0 479 267 L479 274 L373 274 L373 267 A21 21 0 0 0 331 267 L331 274 Z";
    return `<g class="ga-car" transform="translate(430 284) scale(1.18) translate(-430 -284)">
      <ellipse cx="430" cy="286" rx="132" ry="4.5" fill="#000" opacity="0.6"/>
      <ellipse cx="428" cy="284" rx="156" ry="11" fill="url(#gaUnder)"/>
      <path d="M300 251.6 H150" stroke="url(#gaTail)" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M302 270 H232" stroke="url(#gaTail)" stroke-width="1.2" opacity="0.6"/>
      <g class="ga-body">
        <path d="M298 239 L338 236.5 L339 240.5 L302 243 Z" fill="${shade(accent, -0.35)}"/>
        <path d="M318 242 L321 247" stroke="${dark}" stroke-width="2"/>
        <path d="${body}" fill="url(#gaPaint)"/>
        <path d="M384 238 L404 229 L428 224 L447 225 L471 238 Z" fill="url(#gaGlass)"/>
        <path d="M419 224.6 L429 224.1 L411 238 L401 238 Z" fill="#fff" opacity="0.16"/>
        <path d="M430 224.5 L427 238" stroke="${shade(accent, -0.25)}" stroke-width="2.2"/>
        <path d="M306 247 L352 239.6 C372 237.6 392 225.6 418 220.6 C432 218.6 444 219.6 452 223.6" fill="none" stroke="#fff" stroke-width="1.1" opacity="0.55"/>
        <path d="M486 240.6 C512 244.6 536 248.6 551.5 254.6" fill="none" stroke="#fff" stroke-width="1.1" opacity="0.5"/>
        <path d="M312 256 C380 254 470 253 548 259" fill="none" stroke="${shade(accent, 0.6)}" stroke-width="1" opacity="0.7"/>
        <path d="M396 262 L408 250 L428 249 L424 262 Z" fill="${dark}"/>
        <path d="M402 258 H423 M406 254 H425" stroke="${shade(accent, -0.45)}" stroke-width="0.9"/>
        <path d="M431 226 C433 238 433 256 429 272" fill="none" stroke="${shade(accent, -0.5)}" stroke-width="0.9"/>
        <path d="M444 246 H452" stroke="${shade(accent, -0.5)}" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M468 236 L478 234 L479 239 L470 240 Z" fill="${shade(accent, -0.25)}"/>
        <path d="M373 271 H479 V276 H373 Z M304 272 H331 V277 H308 Z M540 273.5 L558 271.5 L556 276 L536 277 Z" fill="#0b0714"/>
        <path d="M376 274 H476" stroke="${shade(accent, 0.4)}" stroke-width="1"/>
        <path d="M536 253 L553 256.5 L550 259.5 L534 256 Z" fill="#fff" opacity="0.35" stroke="#bff7ff" stroke-width="3"/>
        <path d="M536 253 L553 256.5 L550 259.5 L534 256 Z" fill="#f2feff"/>
        <path d="M299.5 251.6 H312" stroke="#ff2a4d" stroke-width="5" opacity="0.35"/>
        <rect x="299.5" y="250" width="7" height="3.2" rx="1" fill="#ff3355"/>
        <circle cx="303" cy="270" r="2.2" fill="#1a1726" stroke="#8a8fa8" stroke-width="0.8"/>
        <path class="ga-flame" d="M301 270 L292 268.6 L295 270 L290 271.6 Z" fill="#7cdcff"/>
      </g>
      ${wheel(352, 267, accent)}${wheel(500, 267, accent)}
      <path d="M556 257 L640 232 V296 L556 262 Z" fill="url(#gaBeam)"/>
      <ellipse cx="612" cy="288" rx="44" ry="5" fill="#fff" opacity="0.08"/>
      <g class="ga-speed" stroke="#fff" stroke-linecap="round" opacity="0.5">
        <path d="M250 232 H286" stroke-width="1"/><path d="M226 246 H276" stroke-width="1.2"/><path d="M262 261 H292" stroke-width="0.8"/>
      </g>
    </g>`;
  }

  // ---------- Bild zusammensetzen ----------

  // accent: Farbe des Themas, motif: heute | tipps | cheats | orte | autos | waffen | geld
  function svg(accent, motif, now = new Date()) {
    const hour = now.getHours();
    const night = hour >= 20 || hour < 6;
    const sky = night
      ? [["0", "#020109"], [".45", "#0a0630"], [".8", "#251050"], ["1", "#4a1a63"]]
      : [["0", "#0c0422"], [".35", "#2c0b50"], [".62", "#8c1d6f"], [".85", "#ff5e62"], ["1", "#ffb36b"]];
    const bars = [0, 1, 2, 3, 4, 5].map((k) => `<rect x="230" y="${150 + k * 9}" width="180" height="${f(1.3 + k * 1.05)}" fill="#000"/>`).join("");
    return `<svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="gaSky" x1="0" y1="0" x2="0" y2="1">${sky.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>
    <linearGradient id="gaSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b0"/><stop offset=".45" stop-color="#ffb347"/><stop offset="1" stop-color="#ff3d8b"/></linearGradient>
    <radialGradient id="gaSunGlow"><stop offset="0" stop-color="#ff7a59" stop-opacity=".6"/><stop offset="1" stop-color="#ff3d8b" stop-opacity="0"/></radialGradient>
    <radialGradient id="gaMoonGlow"><stop offset="0" stop-color="#b9a8ff" stop-opacity=".45"/><stop offset="1" stop-color="#6c4dff" stop-opacity="0"/></radialGradient>
    <mask id="gaSunMask"><rect width="640" height="300" fill="#fff"/>${bars}</mask>
    <linearGradient id="gaSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${night ? "#120a3a" : "#3c0f55"}"/><stop offset="1" stop-color="#0a0418"/></linearGradient>
    <linearGradient id="gaRoad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0e2e"/><stop offset="1" stop-color="#06030c"/></linearGradient>
    <linearGradient id="gaBoard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c0b33"/><stop offset="1" stop-color="#0b0418"/></linearGradient>
    <linearGradient id="gaPaint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(accent, 0.5)}"/><stop offset=".42" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent, -0.6)}"/></linearGradient>
    <linearGradient id="gaGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a72"/><stop offset="1" stop-color="#07051a"/></linearGradient>
    <linearGradient id="gaTail" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff2a4d" stop-opacity=".95"/><stop offset="1" stop-color="#ff2a4d" stop-opacity="0"/></linearGradient>
    <linearGradient id="gaBeam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#eaffff" stop-opacity=".55"/><stop offset="1" stop-color="#eaffff" stop-opacity="0"/></linearGradient>
    <radialGradient id="gaUnder"><stop offset="0" stop-color="${accent}" stop-opacity=".85"/><stop offset=".6" stop-color="${accent}" stop-opacity=".25"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <clipPath id="gaClip"><rect width="640" height="300"/></clipPath>
  </defs>
  <g clip-path="url(#gaClip)">
    <rect width="640" height="300" fill="url(#gaSky)"/>
    ${stars(night)}${night ? moon() : sun()}${plane(accent, night)}
    ${farCity(night)}${city(night, accent)}${billboard(motif, accent)}
    ${sea(night)}${promenade()}
    ${palm(34, 246, 150, 1.05, 10, 0)}${palm(82, 246, 96, 0.72, -6, 1.3)}${palm(616, 246, 138, 0.98, -12, 0.7)}
    ${road()}${car(accent)}
    <rect width="640" height="300" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>
  </g></svg>`;
  }

  // ---------- Hintergrund der App (GTA-Look, ausser FCB) ----------

  // Retro-Sonne am Horizont mit flacher Skyline davor und Palmen an beiden Rändern.
  // Wo und wie hell das erscheint (Wetter, Tageszeit, FCB-Tab ohne), regelt styles.css.
  function backdrop() {
    const bars = [0, 1, 2, 3, 4, 5, 6].map((k) => `<rect x="40" y="${f(90 + k * 9.5)}" width="320" height="${f(1.6 + k * 1.3)}" fill="#000"/>`).join("");
    let city = "";
    let x = 0;
    for (let i = 0; x < 400; i++) {
      const w = 10 + Math.round(rnd(i + 500) * 22);
      const h = 6 + Math.round(rnd(i + 600) * (Math.abs(x + w / 2 - 200) < 95 ? 16 : 42));
      city += `<rect x="${x}" y="${160 - h}" width="${w}" height="${h}"/>`;
      x += w + 1;
    }
    const sun = `<svg class="bg-sun" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="bgSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ff9f4a"/><stop offset="1" stop-color="#ff3d8b"/></linearGradient>
        <radialGradient id="bgSunGlow"><stop offset="0" stop-color="#ff7a59" stop-opacity=".5"/><stop offset="1" stop-color="#ff3d8b" stop-opacity="0"/></radialGradient>
        <mask id="bgSunMask"><rect width="400" height="160" fill="#fff"/>${bars}</mask>
      </defs>
      <g class="bg-sundisc"><circle cx="200" cy="160" r="200" fill="url(#bgSunGlow)"/>
        <circle cx="200" cy="160" r="128" fill="url(#bgSun)" mask="url(#bgSunMask)"/></g>
      <g fill="#150628">${city}</g></svg>`;
    const palms = (side, content) => `<svg class="bg-palms ${side}" viewBox="0 0 220 420" preserveAspectRatio="xMinYMax meet">${content}</svg>`;
    return sun
      + palms("l", palm(70, 420, 330, 2, 34, 0) + palm(160, 420, 220, 1.35, -10, 1.4))
      + palms("r", palm(80, 420, 300, 1.85, 28, 0.8));
  }

  return { svg, backdrop, shade };
})();

if (typeof module !== "undefined") module.exports = GtaArt;
