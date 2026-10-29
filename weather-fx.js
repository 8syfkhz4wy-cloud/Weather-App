"use strict";

// Animierter Hintergrund für das aktuelle Wetter: Regen, Schnee, Gewitter,
// Wolken, Nebel, Sonne, Sterne und Wind. Läuft auf einem Canvas hinter der App.
const WeatherFx = (() => {
  const canvas = document.getElementById("fx");
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let W = 0;
  let H = 0;
  let dpr = 1;
  let cfg = null;
  let parts = [];
  let clouds = [];
  let stars = [];
  let fog = [];
  let flash = 0;
  let bolt = null;
  let nextBolt = 0;
  let last = 0;
  let raf = 0;
  let t = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  // Stärke des Niederschlags aus dem WMO-Code (0–1)
  function intensity(code) {
    if ([51, 56, 61, 71, 77, 80, 85].includes(code)) return 0.35;
    if ([53, 63, 73, 81].includes(code)) return 0.65;
    if ([55, 57, 65, 66, 67, 75, 82, 86, 95, 96, 99].includes(code)) return 1;
    return 0;
  }

  function kind(code) {
    if (code >= 95) return "storm";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
    if (code >= 51) return "rain";
    if (code === 45 || code === 48) return "fog";
    return "dry";
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cfg) build();
  }

  function build() {
    const k = kind(cfg.code);
    const amount = intensity(cfg.code);
    const area = (W * H) / (390 * 844); // relativ zur iPhone-Größe

    parts = [];
    if (k === "rain" || k === "storm") {
      const drizzle = cfg.code >= 51 && cfg.code <= 57;
      const n = Math.round((60 + 220 * amount) * area);
      for (let i = 0; i < n; i++) {
        parts.push({
          x: rand(-50, W + 50), y: rand(-H, H),
          len: drizzle ? rand(6, 10) : rand(12, 24),
          v: drizzle ? rand(420, 560) : rand(800, 1150),
          a: rand(0.25, 0.6),
        });
      }
    } else if (k === "snow") {
      const n = Math.round((50 + 150 * amount) * area);
      for (let i = 0; i < n; i++) {
        parts.push({ x: rand(0, W), y: rand(-H, H), r: rand(1, 3.2), v: rand(30, 80), ph: rand(0, 6.28), a: rand(0.5, 0.95) });
      }
    } else if (cfg.wind >= 35) {
      // Windlinien bei trockenem, windigem Wetter
      const n = Math.round(14 * area + cfg.wind / 6);
      for (let i = 0; i < n; i++) parts.push({ x: rand(-W, W), y: rand(0, H * 0.75), len: rand(60, 160), v: rand(300, 600), a: rand(0.05, 0.16) });
    }

    // Wolken je nach Bewölkung
    const cover = k === "dry" ? cfg.cloud : Math.max(cfg.cloud, 80);
    const nc = Math.round((cover / 100) * 7);
    clouds = [];
    for (let i = 0; i < nc; i++) {
      const s = rand(0.7, 1.4);
      clouds.push({ x: rand(-200, W), y: rand(-40, H * 0.4), s, blobs: Array.from({ length: 5 }, () => [rand(-90, 90) * s, rand(-25, 25) * s, rand(45, 85) * s]) });
    }

    // Sterne bei klarer Nacht
    stars = [];
    if (!cfg.isDay && cover < 75 && k !== "fog") {
      const n = Math.round(110 * area * (1 - cover / 100));
      for (let i = 0; i < n; i++) stars.push({ x: rand(0, W), y: rand(0, H * 0.7), r: rand(0.4, 1.4), ph: rand(0, 6.28), sp: rand(0.6, 2) });
    }

    fog = k === "fog" ? Array.from({ length: 4 }, (_, i) => ({ y: H * (0.15 + i * 0.2), x: rand(0, W), v: rand(8, 20), h: rand(80, 140) })) : [];
    nextBolt = performance.now() + rand(1500, 4000);
  }

  function drawSky() {
    const k = kind(cfg.code);
    if (cfg.isDay && k === "dry" && cfg.cloud < 85) {
      // Sonne: pulsierendes Leuchten mit langsam drehenden Strahlen
      const x = W * 0.82;
      const y = H * 0.1;
      const pulse = 1 + Math.sin(t * 1.2) * 0.06;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 220 * pulse);
      g.addColorStop(0, "rgba(255,214,110,0.55)");
      g.addColorStop(0.25, "rgba(255,180,60,0.18)");
      g.addColorStop(1, "rgba(255,160,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.05);
      ctx.strokeStyle = "rgba(255,200,90,0.07)";
      ctx.lineWidth = 18;
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(70, 0);
        ctx.lineTo(W, 0);
        ctx.stroke();
      }
      ctx.restore();
    } else if (!cfg.isDay && k === "dry" && cfg.cloud < 85) {
      const x = W * 0.8;
      const y = H * 0.1;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 160);
      g.addColorStop(0, "rgba(190,205,255,0.35)");
      g.addColorStop(1, "rgba(150,170,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = "#dfe8ff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawClouds(dt) {
    const dark = kind(cfg.code) !== "dry" || !cfg.isDay;
    const speed = 6 + cfg.wind * 0.6;
    for (const c of clouds) {
      c.x += speed * c.s * dt;
      if (c.x - 200 * c.s > W) c.x = -200 * c.s;
      for (const [bx, by, r] of c.blobs) {
        const g = ctx.createRadialGradient(c.x + bx, c.y + by, 0, c.x + bx, c.y + by, r);
        g.addColorStop(0, dark ? "rgba(120,140,170,0.16)" : "rgba(220,235,255,0.14)");
        g.addColorStop(1, "rgba(120,140,170,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x + bx, c.y + by, r, 0, 6.283);
        ctx.fill();
      }
    }
  }

  function drawFog(dt) {
    for (const f of fog) {
      f.x = (f.x + f.v * dt) % (W * 2);
      for (const off of [-W * 2, 0]) {
        const g = ctx.createLinearGradient(0, f.y - f.h / 2, 0, f.y + f.h / 2);
        g.addColorStop(0, "rgba(180,195,210,0)");
        g.addColorStop(0.5, "rgba(180,195,210,0.12)");
        g.addColorStop(1, "rgba(180,195,210,0)");
        ctx.fillStyle = g;
        ctx.fillRect(f.x + off, f.y - f.h / 2, W * 2, f.h);
      }
    }
  }

  function drawParticles(dt) {
    const k = kind(cfg.code);
    const slant = Math.max(-0.6, Math.min(0.6, (cfg.wind / 100) * cfg.windSign));

    if (k === "rain" || k === "storm") {
      ctx.strokeStyle = "rgba(140,200,255,1)";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      for (const p of parts) {
        p.y += p.v * dt;
        p.x += p.v * slant * dt;
        if (p.y > H) {
          p.y = rand(-60, -10);
          p.x = rand(-80, W + 80);
        }
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len * slant, p.y - p.len);
        ctx.stroke();
      }
    } else if (k === "snow") {
      ctx.fillStyle = "#f2f8ff";
      for (const p of parts) {
        p.y += p.v * dt;
        p.ph += dt * 1.5;
        p.x += (Math.sin(p.ph) * 20 + p.v * slant) * dt;
        if (p.y > H + 5) {
          p.y = -5;
          p.x = rand(0, W);
        }
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      }
    } else if (parts.length) {
      ctx.strokeStyle = "rgba(200,230,255,1)";
      ctx.lineWidth = 1;
      for (const p of parts) {
        p.x += p.v * dt * cfg.windSign;
        if (p.x > W + 200) p.x = -p.len - rand(0, W);
        if (p.x < -W - 200) p.x = W + rand(0, W);
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + p.len / 2, p.y - 6, p.x + p.len, p.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function makeBolt() {
    const pts = [[rand(W * 0.15, W * 0.85), 0]];
    while (pts[pts.length - 1][1] < H * rand(0.45, 0.7)) {
      const [x, y] = pts[pts.length - 1];
      pts.push([x + rand(-40, 40), y + rand(25, 60)]);
    }
    return { pts, life: 0.25 };
  }

  function drawStorm(now, dt) {
    if (kind(cfg.code) !== "storm") return;
    if (now > nextBolt) {
      flash = 1;
      bolt = makeBolt();
      nextBolt = now + rand(3500, 9000);
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(200,210,255,${flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 3);
    }
    if (bolt && bolt.life > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(230,220,255,${bolt.life * 4})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#c77dff";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
      bolt.life -= dt;
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    if (now - last < 30) return; // höchstens ~30 Bilder pro Sekunde, schont den Akku
    last = now;
    t += dt;
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawClouds(dt);
    drawFog(dt);
    drawParticles(dt);
    drawStorm(now, dt);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (!cfg || document.hidden) return;
    if (reduced.matches) {
      // Bewegung reduziert: nur ein ruhiges Standbild
      ctx.clearRect(0, 0, W, H);
      drawSky();
      drawClouds(0);
      drawFog(0);
      drawParticles(0);
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", start);
  reduced.addEventListener?.("change", start);
  resize();

  return {
    // code: WMO-Code, isDay, wind: km/h, windDir: Grad (woher), cloud: Bewölkung in %
    set({ code, isDay, wind, windDir, cloud }) {
      // Wind aus Westen weht nach Osten, also nach rechts
      const windSign = Math.sin(((windDir ?? 270) * Math.PI) / 180) > 0 ? -1 : 1;
      const next = { code, isDay, wind: wind || 0, windSign, cloud: cloud ?? 50 };
      const same = cfg && cfg.code === next.code && cfg.isDay === next.isDay && Math.abs(cfg.wind - next.wind) < 10 && Math.abs(cfg.cloud - next.cloud) < 20;
      cfg = next;
      if (!same) build();
      start();
    },
  };
})();
