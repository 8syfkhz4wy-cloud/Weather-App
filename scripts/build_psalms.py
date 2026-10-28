#!/usr/bin/env python3
"""Erzeugt psalms.json aus der Zefania-XML-Datei der Lutherbibel 1912.

Quelle: npm-Paket "xmlbible-lut1912" (CC0-1.0), Datei text/Ps.xml.

    npm pack xmlbible-lut1912 && tar xzf xmlbible-lut1912-*.tgz
    python3 scripts/build_psalms.py package/text/Ps.xml psalms.json

Psalm 119 wird in seine 22 Abschnitte (je 8 Verse, nach dem hebräischen
Alphabet) aufgeteilt, damit jede Tageslesung eine angenehme Länge hat.
Daraus ergeben sich 171 Lesungen, die sich fortlaufend wiederholen.
"""
import json
import sys
import xml.etree.ElementTree as ET

HEBREW = [
    "Aleph", "Beth", "Gimel", "Daleth", "He", "Waw", "Sajin", "Heth",
    "Teth", "Jod", "Kaph", "Lamed", "Mem", "Nun", "Samech", "Ajin",
    "Pe", "Zade", "Koph", "Resch", "Schin", "Taw",
]


def main(src, dst):
    root = ET.parse(src).getroot()
    readings = []
    for chapter in root.iter("CHAPTER"):
        num = int(chapter.get("cnumber"))
        verses = [[int(v.get("vnumber")), " ".join((v.text or "").split())]
                  for v in chapter.iter("VERS")]
        if num == 119:
            for i, letter in enumerate(HEBREW):
                part = verses[i * 8:(i + 1) * 8]
                readings.append({
                    "psalm": 119,
                    "ref": f"Psalm 119,{part[0][0]}–{part[-1][0]}",
                    "part": letter,
                    "verses": part,
                })
        else:
            readings.append({"psalm": num, "ref": f"Psalm {num}", "verses": verses})

    data = {
        "translation": "Lutherbibel 1912 (gemeinfrei)",
        "readings": readings,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(readings)} Lesungen nach {dst} geschrieben")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
