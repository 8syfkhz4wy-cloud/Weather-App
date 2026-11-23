"use strict";

// Datendateien und Zusammenspiel der Dateien: Psalmen, Manifest, Offline-Liste, Veröffentlichung
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ROOT, f));

test("psalms.json: 171 Tageslesungen, alle 150 Psalmen, Psalm 119 in 22 Abschnitten", () => {
  const data = JSON.parse(read("psalms.json"));
  assert.equal(data.readings.length, 171);
  const psalms = new Set(data.readings.map((r) => r.psalm));
  assert.equal(psalms.size, 150);
  for (let n = 1; n <= 150; n++) assert.ok(psalms.has(n), `Psalm ${n} fehlt`);
  assert.equal(data.readings.filter((r) => r.psalm === 119).length, 22);
  for (const r of data.readings) {
    assert.ok(r.ref && r.verses.length > 0, r.ref);
    for (const [n, v] of r.verses) assert.ok(Number.isInteger(n) && typeof v === "string" && v.trim(), `${r.ref},${n}`);
  }
});

test("warnungen/orte.json: Orte mit Koordinaten und eindeutigem Thema", () => {
  const { orte } = JSON.parse(read("warnungen/orte.json"));
  assert.ok(orte.length > 0);
  const topics = new Set();
  for (const o of orte) {
    assert.ok(o.name && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180, o.name);
    assert.match(o.topic, /^[A-Za-z0-9_-]{12,64}$/, `${o.name}: Thema zu kurz oder ungültig`);
    assert.ok(!topics.has(o.topic), `Thema doppelt: ${o.topic}`);
    topics.add(o.topic);
  }
});

test("Manifest: Pflichtfelder und vorhandene Symbole", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  for (const k of ["name", "short_name", "start_url", "display", "icons"]) assert.ok(m[k], k);
  for (const icon of m.icons) assert.ok(exists(icon.src), icon.src);
});

// Lokale Dateien, die index.html lädt
function pageFiles() {
  const html = read("index.html");
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith("http"));
  return [...new Set(refs)];
}

test("index.html: alle eingebundenen Dateien existieren", () => {
  for (const f of pageFiles()) assert.ok(exists(f), f);
});

test("Service Worker: Offline-Liste vollständig und vorhanden", () => {
  const sw = read("sw.js");
  const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  for (const f of assets) if (f !== "./") assert.ok(exists(f), `sw.js: ${f} fehlt`);
  for (const f of pageFiles().filter((f) => /\.(js|css|json|webmanifest)$/.test(f))) {
    assert.ok(assets.includes(f), `${f} fehlt in der Offline-Liste von sw.js`);
  }
  assert.ok(assets.includes("psalms.json"));
});

test("Veröffentlichung: pages.yml kopiert alle Dateien der App", () => {
  const yml = read(".github/workflows/pages.yml");
  const cp = yml.match(/cp -r ([^\n]+) _site\//)[1].split(/\s+/);
  const needed = new Set([...pageFiles().map((f) => f.split("/")[0]), "sw.js", "psalms.json", "warnungen"]);
  for (const f of needed) assert.ok(cp.includes(f), `pages.yml kopiert ${f} nicht`);
  // Update-Nachricht nur, wenn sich die App ändert: dieselben Dateien beobachten
  const diff = yml.match(/git diff --quiet "\$BEFORE" HEAD -- ([^;\n]+)/)[1].split(/\s+/);
  for (const f of cp.filter((f) => f !== "warnungen")) assert.ok(diff.includes(f), `Update-Nachricht beobachtet ${f} nicht`);
});

test("Versionshinweise: Überschriften im Format ## vX.Y.Z, neueste zuerst", () => {
  const versions = [...read("CHANGELOG.md").matchAll(/^## (v\d+\.\d+\.\d+)$/gm)].map((m) => m[1]);
  assert.ok(versions.length > 0);
  const num = (v) => v.slice(1).split(".").map(Number);
  for (let i = 1; i < versions.length; i++) {
    const [a, b] = [num(versions[i - 1]), num(versions[i])];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))), `${versions[i - 1]} vor ${versions[i]}`);
  }
});
