# UTC Ostermiething — Vereinsmeisterschaft 2026

Dashboard zur Vereinsmeisterschaft: Wer spielt als Nächstes, wann und auf welchem Platz?
Wie sind die bisherigen Spiele ausgegangen? Dazu das komplette 16er-Raster von A- und
B-Bewerb — der Sieger eines Spiels rückt automatisch in die nächste Runde.

**Live:** https://wemb06.github.io/tennis-ostermiething/ — ohne Login, gemacht fürs Handy.

## Ergebnisse & Termine pflegen

Alles steht in einer Datei: [docs/data/vm-2026.json](docs/data/vm-2026.json).

1. Beim Spiel das `ergebnis` setzen, z. B.
   `{ "datum": "2026-08-29", "saetze": [[6,4],[3,6],[10,7]], "sieger": "heim", "notiz": "Match-Tiebreak" }`
   — oder `termin`/`platz` für eine Ansetzung.
2. `stand` im Dateikopf aktualisieren.
3. Prüfen: `node scripts/check-data.mjs`
4. Committen und pushen — nach etwa einer Minute ist die Seite aktuell.

## Werkzeuge

| Befehl | Zweck |
|---|---|
| `node scripts/serve.mjs` | Lokale Vorschau (`http://localhost:4173`, im WLAN auch am Handy) |
| `node scripts/check-data.mjs` | Turnierdaten prüfen — vor jedem Push |
| `scripts\New-Turnier.ps1 -A a.txt -B b.txt -Force` | Raster aus Spielerlisten neu erzeugen (Zeile = Name, Reihenfolge = Setzung) |
| `node scripts/bilder.mjs` | App-Icons und WhatsApp-Vorschaubild neu zeichnen |

Kein Build, keine Abhängigkeiten — `docs/` wird von GitHub Pages direkt ausgeliefert.
Derzeit sind Demo-Daten eingespielt (`"demo": true`); die echten Nennungen kommen per
`New-Turnier.ps1` hinein.
