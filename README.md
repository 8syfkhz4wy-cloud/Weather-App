# Wetter & Psalm

Eine Wetter-App für das iPhone mit einem Psalm für jeden Tag.

- **Aktuelles Wetter** für deinen Standort oder jeden anderen Ort (Suche, gespeicherte Orte)
- **Stündliche Vorhersage** für die nächsten 24 Stunden und **7-Tage-Vorhersage**
- **Details:** gefühlte Temperatur, Wind, Luftfeuchte, Luftdruck, Niederschlag, Sonnenauf-/-untergang, UV-Index
- **Psalm des Tages** aus der Lutherbibel 1912: alle 150 Psalmen der Reihe nach, Psalm 119 aufgeteilt in seine 22 Abschnitte (171 Tageslesungen, danach beginnt der Zyklus von vorne). Mit „Gestern“/„Morgen“ blätterst du, mit „Teilen“ schickst du den Psalm per Nachricht weiter.
- Hintergrund passt sich dem Wetter und der Tageszeit an
- Funktioniert offline mit den zuletzt geladenen Daten

## Wetterwarnungen per Push-Nachricht

Ein GitHub-Actions-Ablauf (`.github/workflows/warnungen.yml`) prüft **stündlich** die
Vorhersage der nächsten 24 Stunden für die Orte in `warnungen/orte.json`. Bei Gefahr
schickt er über [ntfy.sh](https://ntfy.sh) eine Push-Nachricht, auch wenn die App geschlossen ist.

| Warnung | Schwelle |
|---|---|
| Wind / Sturm | Böen ab 60 km/h (Sturm ab 75, Orkan ab 120 km/h) |
| Gewitter | Gewitter in der Vorhersage, mit Hagel höhere Stufe |
| Hitze | ab 30 °C (starke Hitze ab 35 °C) |
| Kälte | ab −10 °C (sehr strenger Frost ab −15 °C) |
| Schnee | ab 3 cm Neuschnee in 24 Stunden |
| Glätte / Eis | gefrierender Regen oder Niederschlag bei höchstens 1 °C |

Jede Warnung kommt pro Ort und Tag nur einmal, außer sie wird schlimmer.

**Abonnieren:** kostenlose App *ntfy* aus dem App Store laden, in der Wetter-App unten
bei „Wetterwarnungen“ den Namen des Orts kopieren und in ntfy über „+“ abonnieren.

**Ort hinzufügen:** einen Eintrag mit Name, Koordinaten und einem schwer zu erratenden
`topic` in `warnungen/orte.json` ergänzen.

**Test:** unter *Actions → Wetterwarnungen → Run workflow* die Option
„Testnachricht“ anhaken und starten.

## Auf dem iPhone installieren

Die App ist eine Web-App (PWA). Sie braucht keinen Mac, kein Xcode und keinen App Store.

1. **GitHub Pages einschalten (einmalig):** Im Repository auf GitHub unter
   *Settings → Pages → Build and deployment → Source* die Option **GitHub Actions** wählen.
   Danach den Workflow „Auf GitHub Pages veröffentlichen“ unter *Actions* starten
   (oder einen neuen Commit pushen).
2. Die Adresse der Seite öffnen, z. B. `https://<benutzername>.github.io/Weather-App/`, und zwar **in Safari**.
3. Auf **Teilen** (Quadrat mit Pfeil) tippen → **Zum Home-Bildschirm** → **Hinzufügen**.
4. Die App vom Home-Bildschirm aus starten und den Standortzugriff erlauben.

## Lokal ausprobieren

```sh
python3 -m http.server 8000
# dann http://localhost:8000 im Browser öffnen
```

## Datenquellen

- Wetter: [Open-Meteo](https://open-meteo.com/) (kostenlos, ohne API-Schlüssel, CC BY 4.0)
- Ortsname zum Standort: BigDataCloud Reverse Geocoding (kostenlos, ohne Schlüssel)
- Psalmen: Lutherbibel 1912 (gemeinfrei), aus dem npm-Paket `xmlbible-lut1912` (CC0).
  `psalms.json` wird mit `scripts/build_psalms.py` erzeugt.
