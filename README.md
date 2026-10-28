# Wetter & Psalm

Eine Wetter-App für das iPhone mit einem Psalm für jeden Tag.

- **Aktuelles Wetter** für deinen Standort oder jeden anderen Ort (Suche, gespeicherte Orte)
- **Stündliche Vorhersage** für die nächsten 24 Stunden und **7-Tage-Vorhersage**
- **Details:** gefühlte Temperatur, Wind, Luftfeuchte, Luftdruck, Niederschlag, Sonnenauf-/-untergang, UV-Index
- **Psalm des Tages** aus der Lutherbibel 1912: alle 150 Psalmen der Reihe nach, Psalm 119 aufgeteilt in seine 22 Abschnitte (171 Tageslesungen, danach beginnt der Zyklus von vorne). Mit „Gestern“/„Morgen“ blätterst du, mit „Teilen“ schickst du den Psalm per Nachricht weiter.
- Hintergrund passt sich dem Wetter und der Tageszeit an
- Funktioniert offline mit den zuletzt geladenen Daten

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
