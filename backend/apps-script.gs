/**
 * Melde-API der Vereinsmeisterschaft — Google Apps Script.
 *
 * Nimmt Meldungen (Ergebnis / Termin) von der Dashboard-Seite entgegen, prüft
 * sie und schreibt sie als Commit in docs/data/vm-2026.json des GitHub-Repos.
 * Jede Meldung = ein Commit — die komplette Historie bleibt nachvollziehbar,
 * Fehleinträge kann die Turnierleitung per "Revert" zurücknehmen.
 *
 * Einrichtung: siehe backend/ANLEITUNG.md im Repo.
 *
 * Script-Eigenschaften (Projekteinstellungen → Script-Eigenschaften):
 *   GITHUB_TOKEN  Fine-grained PAT, nur dieses Repo, nur Contents: Read & Write
 *   REPO          z. B. wemb06/tennis-ostermiething
 *   BRANCH        main            (optional, Standard: main)
 *   PFAD          docs/data/vm-2026.json   (optional, Standard wie hier)
 */

var EINSTELLUNGEN = PropertiesService.getScriptProperties();

function einstellung(name, standard) {
  return EINSTELLUNGEN.getProperty(name) || standard || null;
}

/* --------------------------------------------------------------- GitHub --- */

function githubAnfrage(methode, pfad, nutzlast) {
  var antwort = UrlFetchApp.fetch('https://api.github.com' + pfad, {
    method: methode,
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + einstellung('GITHUB_TOKEN'),
      Accept: 'application/vnd.github+json',
    },
    payload: nutzlast ? JSON.stringify(nutzlast) : undefined,
    muteHttpExceptions: true,
  });
  var code = antwort.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('GitHub antwortet mit HTTP ' + code + ': ' + antwort.getContentText().slice(0, 200));
  }
  return JSON.parse(antwort.getContentText());
}

function holeTurnierdatei() {
  var repo = einstellung('REPO', 'wemb06/tennis-ostermiething');
  var pfad = einstellung('PFAD', 'docs/data/vm-2026.json');
  var branch = einstellung('BRANCH', 'main');
  var datei = githubAnfrage('get', '/repos/' + repo + '/contents/' + pfad + '?ref=' + branch);
  var text = Utilities.newBlob(Utilities.base64Decode(datei.content)).getDataAsString('UTF-8');
  return { turnier: JSON.parse(text), sha: datei.sha, repo: repo, pfad: pfad, branch: branch };
}

function speichereTurnierdatei(datei, nachricht) {
  var text = JSON.stringify(datei.turnier, null, 2) + '\n';
  githubAnfrage('put', '/repos/' + datei.repo + '/contents/' + datei.pfad, {
    message: nachricht,
    content: Utilities.base64Encode(text, Utilities.Charset.UTF_8),
    sha: datei.sha,
    branch: datei.branch,
  });
}

/* ------------------------------------------------------------- Prüfung --- */

function sauberText(wert, maxLaenge) {
  if (typeof wert !== 'string') return '';
  // Steuerzeichen und spitze Klammern raus, Umlaute bleiben erhalten
  var erlaubt = wert.split("").filter(function (zeichen) {
    return zeichen.charCodeAt(0) >= 32 && zeichen !== "<" && zeichen !== ">";
  });
  return erlaubt.join("").trim().slice(0, maxLaenge);
}

function findeSpiel(turnier, spielId) {
  for (var b = 0; b < turnier.bewerbe.length; b += 1) {
    var spiele = turnier.bewerbe[b].spiele;
    for (var s = 0; s < spiele.length; s += 1) {
      if (spiele[s].id === spielId) return spiele[s];
    }
  }
  return null;
}

function pruefeErgebnis(ergebnis) {
  if (!ergebnis || typeof ergebnis !== 'object') throw new Error('Ergebnis fehlt.');
  if (ergebnis.sieger !== 'heim' && ergebnis.sieger !== 'gast') throw new Error('Sieger fehlt.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ergebnis.datum || ''))) throw new Error('Datum fehlt oder ist ungültig.');

  var saetze = ergebnis.saetze;
  if (!Array.isArray(saetze) || saetze.length > 5) throw new Error('Sätze sind ungültig.');
  var heim = 0;
  var gast = 0;
  for (var i = 0; i < saetze.length; i += 1) {
    var satz = saetze[i];
    var a = satz && satz[0];
    var b = satz && satz[1];
    var ganzzahlig = typeof a === 'number' && typeof b === 'number' &&
      a === Math.floor(a) && b === Math.floor(b);
    if (!Array.isArray(satz) || satz.length !== 2 || !ganzzahlig || a < 0 || b < 0 || a > 30 || b > 30) {
      throw new Error('Satz ' + (i + 1) + ' ist ungültig.');
    }
    if (a > b) heim += 1;
    else if (b > a) gast += 1;
  }
  var notiz = sauberText(ergebnis.notiz, 60);
  if (saetze.length === 0 && !notiz) throw new Error('Ohne Sätze braucht es eine Anmerkung (z. B. w.o.).');
  var berechnet = heim === gast ? null : heim > gast ? 'heim' : 'gast';
  if (berechnet && berechnet !== ergebnis.sieger && !notiz) {
    throw new Error('Der gemeldete Sieger passt nicht zu den Sätzen.');
  }

  var sauber = { datum: ergebnis.datum, saetze: saetze, sieger: ergebnis.sieger };
  if (notiz) sauber.notiz = notiz;
  return sauber;
}

/* ---------------------------------------------------------- Web-Zugänge --- */

function jsonAntwort(objekt) {
  return ContentService.createTextOutput(JSON.stringify(objekt)).setMimeType(ContentService.MimeType.JSON);
}

/** GET ?daten=1 → aktueller Stand der Turnierdatei (frischer als der Pages-Cache). */
function doGet(e) {
  if (e && e.parameter && e.parameter.daten) {
    return jsonAntwort(holeTurnierdatei().turnier);
  }
  return jsonAntwort({ ok: true, dienst: 'Melde-API Vereinsmeisterschaft UTC Ostermiething' });
}

/**
 * POST (text/plain mit JSON-Rumpf, vermeidet CORS-Preflight):
 *   { typ: "ergebnis", spiel: "A-R2-3", von: "Name", ergebnis: {...} }
 *   { typ: "termin",   spiel: "A-R2-3", von: "Name", termin: "2026-09-05T10:00", platz: "Platz 2", top: true }
 */
function doPost(e) {
  var sperre = LockService.getScriptLock();
  sperre.waitLock(20000); // gleichzeitige Meldungen nacheinander abarbeiten
  try {
    var meldung = JSON.parse(e.postData.contents);
    var von = sauberText(meldung.von, 60);
    if (!von) throw new Error('Bitte einen Namen angeben.');

    var datei = holeTurnierdatei();
    var spiel = findeSpiel(datei.turnier, sauberText(meldung.spiel, 20));
    if (!spiel) throw new Error('Unbekanntes Spiel.');

    var nachricht;
    if (meldung.typ === 'ergebnis') {
      if (spiel.ergebnis) throw new Error('Für dieses Spiel ist schon ein Ergebnis eingetragen — Korrekturen bitte über die Turnierleitung.');
      spiel.ergebnis = pruefeErgebnis(meldung.ergebnis);
      nachricht = 'Ergebnis ' + spiel.id + ' (gemeldet von ' + von + ')';
    } else if (meldung.typ === 'termin') {
      if (spiel.ergebnis) throw new Error('Dieses Spiel ist bereits gespielt.');
      var termin = String(meldung.termin || '');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(termin)) throw new Error('Termin fehlt oder ist ungültig.');
      spiel.termin = termin;
      spiel.platz = sauberText(meldung.platz, 40) || null;
      if (typeof meldung.top === 'boolean') spiel.top = meldung.top;
      nachricht = 'Termin ' + spiel.id + ': ' + termin + ' (gemeldet von ' + von + ')';
    } else if (meldung.typ === 'markierung') {
      if (typeof meldung.top !== 'boolean') throw new Error('Markierung fehlt.');
      spiel.top = meldung.top;
      nachricht = (meldung.top ? 'Hervorgehoben: ' : 'Hervorhebung entfernt: ') + spiel.id + ' (von ' + von + ')';
    } else {
      throw new Error('Unbekannter Meldungstyp.');
    }

    datei.turnier.stand = Utilities.formatDate(new Date(), 'Europe/Vienna', "yyyy-MM-dd'T'HH:mm:ssXXX");
    speichereTurnierdatei(datei, nachricht);
    return jsonAntwort({ ok: true });
  } catch (fehler) {
    return jsonAntwort({ ok: false, fehler: String(fehler.message || fehler) });
  } finally {
    sperre.releaseLock();
  }
}
