# Projekt: Tennis Ostermiething — UTC Ostermiething

Arbeitsumgebung für die Digital-Werkzeuge des Tennisvereins, zuerst das Dashboard der
Vereinsmeisterschaft 2026. Kommunikation und Doku auf Deutsch.

## Was hier läuft

Statische Website ohne Build-Schritt und ohne Abhängigkeiten (HTML + CSS + ES-Module).
Veröffentlicht über GitHub Pages aus dem Ordner `docs/` — **`docs/` ist die Website,
nicht die Dokumentation.** Push nach `main` = online.

- Repo: `wemb06/tennis-ostermiething` (öffentlich, Voraussetzung für Pages)
- Link für WhatsApp: `https://wemb06.github.io/tennis-ostermiething/`
- Zugriff ohne Login, gedacht fürs Handy (WhatsApp-Link an alle Mitglieder)

## Struktur

- `docs/index.html` — das Dashboard: drei Ansichten (Nächste Spiele / Ergebnisse / Raster),
  Umschalter A-/B-Bewerb, Detail-Dialog je Spiel
- `docs/assets/bracket.js` — **einzige Stelle mit Turnierlogik**: Referenzen auflösen,
  Freilose durchreichen, Sieger in die nächste Runde schieben, Datenprüfung.
  Läuft unverändert im Browser und in Node.
- `docs/assets/app.js` / `app.css` — nur Darstellung, mobile-first, hell/dunkel automatisch
- `docs/data/vm-2026.json` — die einzige Datenquelle (Spieler, Spiele, Ergebnisse)
- `scripts/` — Werkzeuge (Node ohne npm-Pakete bzw. PowerShell)
- `backend/apps-script.gs` — Melde-API als Google-Apps-Script: nimmt Ergebnis-, Termin-
  und Markierungs-Meldungen entgegen, prüft sie und schreibt sie als Commit ins Repo.
  Einrichtung: `backend/ANLEITUNG.md`. Die URL steht im Feld `api` der Turnierdatei;
  ist sie `null`, blendet die Seite alle Eintrage-Knöpfe aus.

## Datenmodell — der zentrale Kniff

Spiele speichern keine Namen, sondern **Referenzen**:
`{"quelle":"spieler","pos":3}` (Runde 1) bzw. `{"quelle":"sieger","spiel":"A-R1-2"}`.
Wer im Halbfinale steht, wird beim Anzeigen aus dem Viertelfinal-Ergebnis aufgelöst —
ein eingetragener Sieger rückt dadurch automatisch weiter. Ergebnis-Format:
`{"datum":"2026-08-29","saetze":[[6,4],[3,6],[10,7]],"sieger":"heim","notiz":"Match-Tiebreak"}`.
`"sichtbar": false` blendet einen ganzen Bewerb aus — kein Tab, keine Spiele auf der
Startseite (fehlt das Feld, ist der Bewerb sichtbar).
`"top": true` hebt ein Spiel hervor — solche Spiele stehen auf der Startseite ganz oben
unter „Im Blickpunkt".
Ein Ergebnis darf **ohne Sätze** gemeldet werden — dann steht nur der Sieger fest
(`"saetze": []`, `"notiz": "ohne Satzangabe"`). Die Seite zeigt statt Zahlen einen Haken.
Die Notiz setzt das Formular selbst, damit das bereits veröffentlichte Apps Script
unverändert bleiben kann (es verlangt Sätze **oder** eine Notiz).
Termine sind gemischt: fixer `termin` **oder** `null` = „Termin offen" mit Runden-Deadline
aus `deadlines`. Spieler namens `Freilos` (oder unbesetzte Positionen) lassen den Gegner
kampflos aufsteigen.

## Workflows

- **Daten prüfen (vor jedem Push!):** `node scripts/check-data.mjs`
- **Vorschau:** `node scripts/serve.mjs` → `http://localhost:4173`, im WLAN auch am Handy
- **Neues Turnier / echte Nennungen einspielen:** `scripts\New-Turnier.ps1 -A liste-a.txt -B liste-b.txt -Force`
  (eine Zeile pro Name, Reihenfolge = Setzung; überschreibt vorhandene Ergebnisse!)
- **Ergebnis eintragen (derzeit):** von Hand in `docs/data/vm-2026.json` beim passenden
  Spiel `ergebnis` setzen und `stand` aktualisieren, prüfen, committen, pushen
- **Icons neu erzeugen:** `node scripts/bilder.mjs` (zeichnet die PNGs selbst, keine Bibliothek)

## Konventionen

- Alles auf Deutsch: Code-Bezeichner, Kommentare, Commits, UI-Texte
- Keine npm-Abhängigkeiten, keine externen Requests zur Laufzeit (Seite muss am
  Tennisplatz mit schlechtem Empfang laden); Node-Skripte nur mit Bordmitteln
- `.ps1`-Dateien mit UTF-8-**BOM** speichern (PowerShell 5.1 liest sie sonst als ANSI)
- Demo-Daten tragen `"demo": true` im JSON — die Seite zeigt dann ein Hinweisband
- `_archiv/` ist unversionierte lokale Ablage (Spielerlisten-Entwürfe u. Ä.)

## Nächster Schritt (geplant, noch nicht gebaut)

Ergebnis-Eingabe für die Turnierleitung: `docs/admin.html` (unverlinkt), Schutz per
fine-grained GitHub-Token (nur dieses Repo, nur Contents R/W), Speichern = Commit über
die GitHub-Contents-API. Durch das Referenz-Datenmodell braucht das keine neue
Turnierlogik. Details im Plan: `C:\Users\manue\.claude\plans\bereitet-mir-ein-projekt-luminous-floyd.md`.
