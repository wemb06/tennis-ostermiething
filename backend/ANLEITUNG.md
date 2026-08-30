# Melde-API einrichten (einmalig, ca. 10 Minuten)

Damit **jeder** über den WhatsApp-Link Ergebnisse und Termine eintragen kann, braucht es
eine kleine Vermittlungsstelle: Die Seite selbst liegt statisch auf GitHub Pages und kann
nichts speichern. Ein Google-Apps-Script nimmt die Meldungen entgegen, prüft sie und
schreibt sie als Commit in `docs/data/vm-2026.json`.

Warum so: kostenlos, kein Server, läuft auf dem Google-Konto, das du ohnehin hast — und
**jede Meldung ist ein Commit**. Wer was gemeldet hat, steht in der Git-Historie; ein
Fehleintrag ist mit einem Klick auf „Revert" wieder weg.

## 1. GitHub-Token erzeugen

1. https://github.com/settings/personal-access-tokens/new
2. **Token name:** `Melde-API Vereinsmeisterschaft`
3. **Expiration:** z. B. 1 Jahr (Kalendereintrag zum Erneuern setzen!)
4. **Repository access:** „Only select repositories" → `wemb06/tennis-ostermiething`
5. **Permissions → Repository permissions → Contents:** `Read and write`
   (sonst nichts — mehr braucht die API nicht)
6. Token erzeugen und kopieren (wird nur einmal angezeigt).

## 2. Apps Script anlegen

1. https://script.google.com → **Neues Projekt**
2. Projekt umbenennen auf `Vereinsmeisterschaft Melde-API`
3. Inhalt von [`apps-script.gs`](apps-script.gs) komplett in den Editor kopieren
   (den vorhandenen Beispielcode ersetzen), speichern.
4. Links auf **Projekteinstellungen** (Zahnrad) → ganz unten **Script-Eigenschaften** →
   **Script-Eigenschaft hinzufügen**:

   | Eigenschaft | Wert |
   |---|---|
   | `GITHUB_TOKEN` | das Token aus Schritt 1 |
   | `REPO` | `wemb06/tennis-ostermiething` |

   (`BRANCH` und `PFAD` nur setzen, wenn vom Standard `main` / `docs/data/vm-2026.json` abgewichen wird.)

## 3. Als Web-App veröffentlichen

1. Rechts oben **Bereitstellen → Neue Bereitstellung** → Typ **Web-App**
2. **Ausführen als:** *Ich* (dein Konto)
3. **Zugriff:** **Jeder** — nötig, damit die Vereinsmitglieder ohne Google-Login melden können
4. Bereitstellen → Google fragt nach Berechtigungen → zulassen
   („nicht überprüfte App" → *Erweitert* → *Weiter zu …*, es ist dein eigenes Skript)
5. Die **Web-App-URL** kopieren (Form: `https://script.google.com/macros/s/AKfy…/exec`)

## 4. URL in die Seite eintragen

In [`../docs/data/vm-2026.json`](../docs/data/vm-2026.json) das Feld `api` setzen:

```json
"api": "https://script.google.com/macros/s/AKfy…/exec",
```

Dann `node scripts/check-data.mjs`, committen, pushen. Ab sofort erscheinen im Dashboard
bei jedem spielbereiten Spiel die Knöpfe **Ergebnis melden** und **Termin eintragen**.

Ohne `api` (also `null`) versteckt die Seite die Knöpfe von selbst und zeigt stattdessen
den Hinweis, das Ergebnis der Turnierleitung zu melden — die Seite funktioniert also auch,
solange das Backend noch nicht steht.

## Änderungen am Skript später

Nach jeder Code-Änderung: **Bereitstellen → Bereitstellungen verwalten → Bearbeiten
(Stift) → Version: Neu → Bereitstellen.** Die URL bleibt dabei gleich. Wird stattdessen
eine *neue Bereitstellung* angelegt, ändert sich die URL und muss neu ins JSON.

## Was die API zulässt (bewusste Grenzen)

- Ergebnis nur für Spiele, bei denen **beide Teilnehmer feststehen** und **noch kein
  Ergebnis** eingetragen ist — Korrekturen laufen über die Turnierleitung (Git-Revert
  oder Hand-Edit). Das verhindert, dass ein fertiges Raster nachträglich umgeschrieben wird.
- Termin nur, solange das Spiel nicht gespielt ist.
- Sätze müssen plausibel sein (0–30, höchstens 5 Sätze), der gemeldete Sieger muss zu den
  Sätzen passen — außer es ist eine Anmerkung wie „w.o." dabei.
- Name des Melders ist Pflicht und landet in der Commit-Nachricht.
- Ein `LockService` serialisiert gleichzeitige Meldungen, damit nichts überschrieben wird.

## Wenn etwas klemmt

- **„Die Meldung wurde nicht angenommen"** → im Apps Script links **Ausführungen**
  öffnen, dort steht der Fehler (meist Token abgelaufen oder falsches `REPO`).
- **Meldung kommt an, Seite zeigt sie nicht** → GitHub Pages baut ca. 1 Minute. Die Seite
  fragt zusätzlich direkt bei der API nach dem frischen Stand; hilft „Aktualisieren".
- **Token abgelaufen** → neues Token erzeugen und die Script-Eigenschaft `GITHUB_TOKEN`
  überschreiben, keine Neu-Bereitstellung nötig.
