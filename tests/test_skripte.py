"""Tests für die Skripte, die Push-Nachrichten verschicken (ohne Internet).

    python3 -m unittest discover -s tests -p 'test_*.py'
"""
import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
ORTE = str(SCRIPTS.parent / "warnungen" / "orte.json")


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def forecast(temp=10.0, code=2, gust=20.0, snow=0.0, rain=0.0, hours=48):
    """Open-Meteo-Antwort: konstante Werte, "jetzt" ist 10:15 am ersten Tag."""
    start = datetime(2026, 11, 23)
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)]
    n = len(times)
    return {
        "current": {"time": "2026-11-23T10:15"},
        "hourly": {"time": times, "temperature_2m": [temp] * n, "weather_code": [code] * n,
                   "wind_gusts_10m": [gust] * n, "snowfall": [snow] * n, "rain": [rain] * n, "showers": [0.0] * n},
    }


class Warnungen(unittest.TestCase):
    def setUp(self):
        self.w = load("warnungen")

    def labels(self, **kw):
        return sorted(x["label"] for x in self.w.find_warnings(forecast(**kw)))

    def test_ruhiges_wetter(self):
        self.assertEqual(self.labels(), [])

    def test_wind_stufen(self):
        self.assertEqual(self.labels(gust=59), [])
        self.assertEqual(self.labels(gust=60), ["Starke Windböen"])
        self.assertEqual(self.labels(gust=80), ["Sturmböen"])
        self.assertEqual(self.labels(gust=125), ["Orkanböen"])

    def test_gewitter_hitze_kaelte(self):
        self.assertEqual(self.labels(code=95), ["Gewitter"])
        self.assertEqual(self.labels(code=96), ["Gewitter mit Hagel"])
        self.assertEqual(self.labels(temp=36), ["Starke Hitze"])
        self.assertEqual(self.labels(temp=-12), ["Strenger Frost"])

    def test_schnee_und_glaette(self):
        # 0.5 cm pro Stunde = 12 cm in 24 Stunden, bei Frost auch Glättegefahr
        self.assertEqual(self.labels(temp=-1, code=73, snow=0.5), ["Glättegefahr", "Starker Schneefall"])
        self.assertEqual(self.labels(temp=0, code=67, rain=1), ["Glatteis"])

    def test_zeitpunkt_ab_naechster_stunde(self):
        warnings = self.w.find_warnings(forecast(gust=70))
        self.assertEqual(warnings[0]["when"], "2026-11-23T11:00")
        self.assertEqual(self.w.when_text("2026-11-23T11:00"), "Mo 23.11. ab 11 Uhr")

    def run_main(self, fc, state_file):
        sent = []
        with mock.patch.object(self.w, "fetch_forecast", return_value=fc), \
             mock.patch.object(self.w, "send", side_effect=lambda topic, title, *a: sent.append(title)), \
             mock.patch("builtins.print"):
            self.w.main(ORTE, state_file)
        return sent

    def test_gleiche_warnung_nur_einmal_ausser_schlimmer(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = os.path.join(tmp, "status.json")
            self.assertEqual(len(self.run_main(forecast(gust=65), state)), 1)
            self.assertEqual(self.run_main(forecast(gust=65), state), [])  # schon verschickt
            worse = self.run_main(forecast(gust=95), state)
            self.assertEqual(len(worse), 1)
            self.assertIn("Schwere Sturmböen", worse[0])
            with open(state, encoding="utf-8") as f:
                self.assertTrue(json.load(f))


class FcbLive(unittest.TestCase):
    def setUp(self):
        self.f = load("fcb_live")

    def test_partie_mit_resultat(self):
        fx = self.f.fixture(["FUSSBALL 22.11.26 17:45 GC - Lugano 1:1 (0:0) Basel - YB 2:1 (1:0)"])
        self.assertEqual((fx["home"], fx["away"], fx["basel_home"], fx["score"]), ("Basel", "YB", True, (2, 1)))

    def test_anpfiff_aus_rundentitel(self):
        fx = self.f.fixture(["FUSSBALL 18.11.26 10:00 (21.-23.11.) Lugano - Basel SO 16.30 Uhr"])
        self.assertEqual(fx["kickoff"], datetime(2026, 11, 22, 16, 30, tzinfo=self.f.TZ))
        self.assertFalse(fx["basel_home"])

    def simulate(self, scored):
        """Spieltag ab 16:20 durchspielen, Anpfiff 16:30; optional 1:0 ab 17:00."""
        clock = [datetime(2026, 11, 22, 16, 20, tzinfo=self.f.TZ)]

        def page(n):
            if n != 202:
                return [""]
            if scored and clock[0] > datetime(2026, 11, 22, 17, 0, tzinfo=self.f.TZ):
                return ["FUSSBALL 22.11.26 17:00 Basel - YB 1:0 (1:0) "]
            return ["FUSSBALL 22.11.26 10:00 (21.-23.11.) Basel - YB SO 16.30 Uhr "]

        sent = []
        with mock.patch.object(self.f, "now", lambda: clock[0]), \
             mock.patch.object(self.f.time, "sleep", lambda s: clock.__setitem__(0, clock[0] + timedelta(seconds=s))), \
             mock.patch.object(self.f, "page", page), \
             mock.patch.object(self.f, "send", lambda topics, title, msg, tags, prio=4: sent.append(f"{title}: {msg}")), \
             mock.patch("builtins.print"):
            self.f.main(ORTE)
        return sent

    def test_tor_und_schlusspfiff(self):
        self.assertEqual(self.simulate(True), ["⚽ TOR für Basel!: FC Basel – Young Boys 1:0",
                                               "Schlusspfiff: FC Basel – Young Boys 1:0"])

    def test_verschobenes_spiel_ohne_meldung(self):
        self.assertEqual(self.simulate(False), [])


class UpdateNachricht(unittest.TestCase):
    def test_titel_und_info_zeile(self):
        u = load("update_nachricht")
        bodies = []

        class Res:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b""

        def urlopen(req, timeout):
            bodies.append(json.loads(req.data))
            return Res()

        with mock.patch.object(u.urllib.request, "urlopen", urlopen), mock.patch("builtins.print"):
            u.main(ORTE, "Neue Funktion\n\nDetails\nInfo: Das ist neu.\n")
        self.assertEqual(bodies[0]["title"], "✨ Update: Neue Funktion")
        self.assertTrue(bodies[0]["message"].startswith("Das ist neu."))


if __name__ == "__main__":
    unittest.main()
