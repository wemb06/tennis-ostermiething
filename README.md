# UTC Ostermiething — Vereinsmeisterschaft 2026

Dashboard zur Vereinsmeisterschaft: Wer spielt als Nächstes, wann und auf welchem Platz?
Wie sind die bisherigen Spiele ausgegangen? Dazu das komplette 16er-Raster von A- und
B-Bewerb — der Sieger eines Spiels rückt automatisch in die nächste Runde.

**Live:** https://wemb06.github.io/tennis-ostermiething/ — ohne Login, gemacht fürs Handy.

## Wer darf was eintragen

**Jedes Vereinsmitglied** kann über den Link — ohne Login — bei einem spielbereiten Spiel

- das **Ergebnis melden** — es genügt anzuhaken, wer weiter ist; Sätze sind freiwillig
  (trägt man sie ein, wird der Sieger automatisch erkannt),
- den **Termin und Platz eintragen** oder ändern,
- ein Spiel **teilen** — Paarung, Termin und Platz als fertige Nachricht für die WhatsApp-Gruppe.

Jede Meldung landet als eigener Commit im Repo, mit dem Namen des Melders in der
Commit-Nachricht. Ein Fehleintrag ist damit über die GitHub-Historie („Revert")
zurückzunehmen. Bereits gewertete Spiele sind gesperrt — Korrekturen macht die
Turnierleitung direkt in der Datei.

Dafür muss die **Melde-API** einmalig eingerichtet sein: [backend/ANLEITUNG.md](backend/ANLEITUNG.md)
(ca. 10 Minuten, Google-Apps-Script + GitHub-Token). Solange das Feld `api` in der
Turnierdatei `null` ist, versteckt die Seite die Eintrage-Knöpfe von selbst.

## Ergebnisse & Termine von Hand pflegen

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
| `npm test` | Unit-Tests der Turnierlogik (Node-Bordmittel, keine Abhängigkeiten) |
| `node scripts/check-data.mjs` | Turnierdaten und Versionsstempel prüfen — vor jedem Push |
| `node scripts/version.mjs` | Versionsstempel setzen — nach jeder Änderung an app.js/app.css/bracket.js |
| `scripts\New-Turnier.ps1 -A a.txt -B b.txt -Force` | Raster aus Spielerlisten neu erzeugen (Zeile = Name, Reihenfolge = Setzung) |
| `node scripts/bilder.mjs` | App-Icons und WhatsApp-Vorschaubild neu zeichnen |

Ein Spiel dauerhaft hervorheben geht auch direkt in der Datei: `"top": true` beim Spiel.

Kein Build, keine Abhängigkeiten — `docs/` wird von GitHub Pages direkt ausgeliefert.
Derzeit sind Demo-Daten eingespielt (`"demo": true`); die echten Nennungen kommen per
`New-Turnier.ps1` hinein.
