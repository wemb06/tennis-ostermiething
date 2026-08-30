/**
 * Turnierlogik der Vereinsmeisterschaft — die einzige Stelle mit Raster-Wissen.
 *
 * Genutzt von:
 *   docs/assets/app.js       — Anzeige im Dashboard
 *   scripts/check-data.mjs   — Prüfung der Turnierdaten
 *   (später) docs/admin.html — Ergebnis-Eingabe
 *
 * Kernidee: Das Raster speichert keine kopierten Namen, sondern Referenzen
 * ({ quelle: "sieger", spiel: "A-R2-1" }). Wer im Halbfinale steht, wird beim
 * Anzeigen aus dem Viertelfinal-Ergebnis aufgelöst — ein eingetragener Sieger
 * rückt dadurch von selbst weiter.
 *
 * Läuft unverändert im Browser und in Node (nur Standard-APIs).
 */

export const FREILOS = 'Freilos';

/** Lädt die Turnierdaten. Cache-Buster, weil Handys die JSON sonst festhalten. */
export async function ladeTurnier(pfad = 'data/vm-2026.json') {
  const antwort = await fetch(`${pfad}?stand=${Date.now()}`, { cache: 'no-store' });
  if (!antwort.ok) throw new Error(`Turnierdaten nicht erreichbar (HTTP ${antwort.status})`);
  return antwort.json();
}

/** Anzahl Runden eines Rasters: 16 Spieler → 4 Runden. */
export function anzahlRunden(groesse) {
  return Math.log2(groesse);
}

/** Achtelfinale/Viertelfinale/… — abgeleitet aus Rastergröße und Runde. */
export function rundenName(groesse, runde) {
  const verbleibend = groesse / 2 ** (runde - 1);
  const namen = {
    2: 'Finale',
    4: 'Halbfinale',
    8: 'Viertelfinale',
    16: 'Achtelfinale',
    32: 'Sechzehntelfinale',
  };
  return namen[verbleibend] ?? `${runde}. Runde`;
}

/** Sieger aus den Sätzen bestimmen: [[6,4],[3,6],[10,7]] → 'heim'. */
export function siegerAusSaetzen(saetze) {
  if (!Array.isArray(saetze) || saetze.length === 0) return null;
  let heim = 0;
  let gast = 0;
  for (const satz of saetze) {
    const [a, b] = Array.isArray(satz) ? satz : [];
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (a > b) heim += 1;
      else if (b > a) gast += 1;
    }
  }
  if (heim === gast) return null;
  return heim > gast ? 'heim' : 'gast';
}

/** Satzergebnis als Text — immer aus Sicht des Siegers ("6:4 3:6 10:7"). */
export function saetzeText(spiel) {
  const saetze = spiel?.ergebnis?.saetze;
  if (!Array.isArray(saetze) || saetze.length === 0) return '';
  const drehen = spiel.ergebnis.sieger === 'gast';
  return saetze
    .map(([a, b]) => (drehen ? `${b}:${a}` : `${a}:${b}`))
    .join('  ');
}

/** Anzeigename einer Seite: entweder der Spieler oder die Herkunft ("Sieger aus …"). */
export function seitenName(seite) {
  if (!seite) return 'offen';
  return seite.bekannt ? seite.name : seite.herkunft;
}

function offeneSeite(herkunft) {
  return { name: null, bekannt: false, freilos: false, herkunft };
}

function spielerSeite(bewerb, pos) {
  const eintrag = bewerb.spieler?.find((s) => s.pos === pos);
  const name = String(eintrag?.anzeigename ?? eintrag?.name ?? '').trim();
  if (!name || name.toLowerCase() === FREILOS.toLowerCase()) {
    return { name: FREILOS, bekannt: true, freilos: true, herkunft: null, pos };
  }
  return { name, bekannt: true, freilos: false, herkunft: null, pos };
}

/**
 * Löst ein komplettes Raster auf: Namen einsetzen, Freilose durchreichen,
 * Sieger in die nächste Runde schieben.
 */
export function bereiteBewerbAuf(bewerb) {
  const spieleRoh = Array.isArray(bewerb.spiele) ? bewerb.spiele : [];
  const nachId = new Map(spieleRoh.map((spiel) => [spiel.id, spiel]));
  const fertig = new Map();
  const laufend = new Set();

  // Nummer innerhalb der Runde (für Beschriftungen wie "Sieger Achtelfinale 3")
  const nummern = new Map();
  const gezaehlt = new Map();
  for (const spiel of spieleRoh) {
    const nr = (gezaehlt.get(spiel.runde) ?? 0) + 1;
    gezaehlt.set(spiel.runde, nr);
    nummern.set(spiel.id, nr);
  }

  function beschriftung(spiel) {
    if (spiel.heim.bekannt && spiel.gast.bekannt) {
      return `Sieger aus ${spiel.heim.name} – ${spiel.gast.name}`;
    }
    return `Sieger ${spiel.rundeName} ${spiel.nr}`;
  }

  function seite(referenz) {
    if (!referenz) return offeneSeite('offen');
    if (referenz.quelle === 'spieler') return spielerSeite(bewerb, referenz.pos);
    if (referenz.quelle === 'sieger') {
      const vorspiel = aufloesen(referenz.spiel);
      if (!vorspiel) return offeneSeite('offen');
      if (vorspiel.sieger) return { ...vorspiel.sieger, herkunft: null };
      return offeneSeite(beschriftung(vorspiel));
    }
    return offeneSeite('offen');
  }

  function aufloesen(id) {
    if (fertig.has(id)) return fertig.get(id);
    const roh = nachId.get(id);
    if (!roh || laufend.has(id)) return null; // fehlende Referenz / Ringschluss → check-data meldet es
    laufend.add(id);

    const heim = seite(roh.heim);
    const gast = seite(roh.gast);

    // Sieger: erst Freilose (die entscheiden sich von selbst), dann das Ergebnis
    let sieger = null;
    let verlierer = null;
    let automatisch = false;
    if (heim.freilos && gast.freilos) {
      sieger = heim;
      automatisch = true;
    } else if (heim.freilos && gast.bekannt) {
      sieger = gast;
      verlierer = heim;
      automatisch = true;
    } else if (gast.freilos && heim.bekannt) {
      sieger = heim;
      verlierer = gast;
      automatisch = true;
    } else if (roh.ergebnis?.sieger && heim.bekannt && gast.bekannt) {
      const heimGewinnt = roh.ergebnis.sieger !== 'gast';
      sieger = heimGewinnt ? heim : gast;
      verlierer = heimGewinnt ? gast : heim;
    }

    const gespielt = Boolean(roh.ergebnis?.sieger) && heim.bekannt && gast.bekannt && !automatisch;
    let status;
    if (gespielt) status = 'gespielt';
    else if (automatisch) status = 'freilos';
    else if (heim.bekannt && gast.bekannt) status = 'spielbereit';
    else status = 'wartet';

    const spiel = {
      id: roh.id,
      runde: roh.runde,
      nr: nummern.get(roh.id) ?? 0,
      bewerbId: bewerb.id,
      top: roh.top === true,
      bewerbName: bewerb.name,
      groesse: bewerb.groesse,
      rundeName: rundenName(bewerb.groesse, roh.runde),
      termin: roh.termin ?? null,
      platz: roh.platz ?? null,
      ergebnis: roh.ergebnis ?? null,
      deadline: bewerb.deadlines?.[String(roh.runde)] ?? null,
      heim,
      gast,
      sieger,
      verlierer,
      automatisch,
      status,
      // Datum für Sortierung/Gruppierung: gemeldeter Spieltag vor Ansetzung
      datum: roh.ergebnis?.datum ?? roh.termin ?? null,
    };

    laufend.delete(id);
    fertig.set(id, spiel);
    return spiel;
  }

  const spiele = spieleRoh.map((roh) => aufloesen(roh.id)).filter(Boolean);
  const letzteRunde = anzahlRunden(bewerb.groesse);
  const finale = spiele.find((spiel) => spiel.runde === letzteRunde);
  const meister = finale?.sieger && !finale.sieger.freilos ? finale.sieger : null;

  return { ...bewerb, spiele, meister };
}

/** Ganzes Turnier (alle Bewerbe) auflösen. */
export function bereiteTurnierAuf(turnier) {
  const bewerbe = (turnier.bewerbe ?? []).map(bereiteBewerbAuf);
  return { ...turnier, bewerbe };
}

/** Alle Spiele aller Bewerbe als flache Liste. */
export function alleSpiele(turnier) {
  return (turnier.bewerbe ?? []).flatMap((bewerb) => bewerb.spiele);
}

function zeitwert(wert) {
  if (!wert) return null;
  const zeit = new Date(wert).getTime();
  return Number.isNaN(zeit) ? null : zeit;
}

/**
 * Anstehende Spiele: beide Teilnehmer stehen fest, Ergebnis fehlt noch.
 * Sortiert nach Termin; Spiele ohne Termin hängen sich hinten an (nach Runde).
 */
export function naechsteSpiele(spiele) {
  return spiele
    .filter((spiel) => spiel.status === 'spielbereit')
    .sort((a, b) => {
      const za = zeitwert(a.termin);
      const zb = zeitwert(b.termin);
      if (za !== null && zb !== null) return za - zb;
      if (za !== null) return -1;
      if (zb !== null) return 1;
      const da = zeitwert(a.deadline) ?? Number.MAX_SAFE_INTEGER;
      const db = zeitwert(b.deadline) ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      if (a.runde !== b.runde) return a.runde - b.runde;
      return String(a.id).localeCompare(String(b.id));
    });
}

/** Gespielte Partien, neueste zuerst. */
export function gespielteSpiele(spiele) {
  return spiele
    .filter((spiel) => spiel.status === 'gespielt')
    .sort((a, b) => {
      const za = zeitwert(a.datum) ?? 0;
      const zb = zeitwert(b.datum) ?? 0;
      if (za !== zb) return zb - za;
      if (a.runde !== b.runde) return b.runde - a.runde;
      return String(a.id).localeCompare(String(b.id));
    });
}

/* ------------------------------------------------------------------ *
 * Prüfung der Rohdaten — von scripts/check-data.mjs genutzt.
 * Liefert eine Liste { stufe: 'fehler' | 'warnung', text }.
 * ------------------------------------------------------------------ */

export function pruefeTurnier(turnier) {
  const meldungen = [];
  const fehler = (text) => meldungen.push({ stufe: 'fehler', text });
  const warnung = (text) => meldungen.push({ stufe: 'warnung', text });

  if (!turnier || typeof turnier !== 'object') {
    fehler('Turnierdatei enthält kein Objekt.');
    return meldungen;
  }
  for (const feld of ['verein', 'titel']) {
    if (!turnier[feld]) warnung(`Feld "${feld}" fehlt — Kopfzeile bleibt unvollständig.`);
  }
  if (turnier.stand && Number.isNaN(new Date(turnier.stand).getTime())) {
    fehler(`"stand" ist kein gültiger Zeitpunkt: ${turnier.stand}`);
  }
  if (turnier.api !== undefined && turnier.api !== null && !/^https:\/\//.test(String(turnier.api))) {
    fehler(`"api" muss eine https-Adresse oder null sein (ist: ${turnier.api}).`);
  }
  if (!Array.isArray(turnier.bewerbe) || turnier.bewerbe.length === 0) {
    fehler('Keine Bewerbe vorhanden.');
    return meldungen;
  }

  for (const bewerb of turnier.bewerbe) {
    const wo = `Bewerb ${bewerb.id ?? '?'}`;
    const groesse = bewerb.groesse;
    if (!Number.isInteger(groesse) || groesse < 2 || (groesse & (groesse - 1)) !== 0) {
      fehler(`${wo}: "groesse" muss eine Zweierpotenz sein (ist: ${groesse}).`);
      continue;
    }
    const runden = anzahlRunden(groesse);

    // Spieler: Positionen 1..groesse, jede genau einmal
    const positionen = new Set();
    for (const spieler of bewerb.spieler ?? []) {
      if (!Number.isInteger(spieler.pos) || spieler.pos < 1 || spieler.pos > groesse) {
        fehler(`${wo}: Rasterposition ${spieler.pos} liegt außerhalb 1–${groesse}.`);
      } else if (positionen.has(spieler.pos)) {
        fehler(`${wo}: Rasterposition ${spieler.pos} ist doppelt vergeben.`);
      } else {
        positionen.add(spieler.pos);
      }
      if (!String(spieler.name ?? '').trim()) {
        warnung(`${wo}: Position ${spieler.pos} hat keinen Namen — gilt als Freilos.`);
      }
    }
    for (let pos = 1; pos <= groesse; pos += 1) {
      if (!positionen.has(pos)) warnung(`${wo}: Rasterposition ${pos} ist unbesetzt — gilt als Freilos.`);
    }

    // Spiele: vollständiges Raster, eindeutige IDs, saubere Referenzen
    const spiele = Array.isArray(bewerb.spiele) ? bewerb.spiele : [];
    const ids = new Set();
    const proRunde = new Map();
    for (const spiel of spiele) {
      if (!spiel.id) fehler(`${wo}: Ein Spiel hat keine ID.`);
      else if (ids.has(spiel.id)) fehler(`${wo}: Spiel-ID ${spiel.id} kommt doppelt vor.`);
      else ids.add(spiel.id);
      proRunde.set(spiel.runde, (proRunde.get(spiel.runde) ?? 0) + 1);
    }
    if (spiele.length !== groesse - 1) {
      fehler(`${wo}: ${spiele.length} Spiele statt ${groesse - 1} für ein ${groesse}er-Raster.`);
    }
    for (let runde = 1; runde <= runden; runde += 1) {
      const soll = groesse / 2 ** runde;
      const ist = proRunde.get(runde) ?? 0;
      if (ist !== soll) fehler(`${wo}: ${rundenName(groesse, runde)} hat ${ist} statt ${soll} Spiele.`);
    }

    for (const spiel of spiele) {
      for (const [seiteName, referenz] of [['heim', spiel.heim], ['gast', spiel.gast]]) {
        if (!referenz) {
          fehler(`${wo}/${spiel.id}: Seite "${seiteName}" fehlt.`);
        } else if (referenz.quelle === 'spieler') {
          if (spiel.runde !== 1) fehler(`${wo}/${spiel.id}: Spieler dürfen nur in Runde 1 direkt stehen.`);
          if (!positionen.has(referenz.pos)) {
            warnung(`${wo}/${spiel.id}: Seite "${seiteName}" zeigt auf unbesetzte Position ${referenz.pos}.`);
          }
        } else if (referenz.quelle === 'sieger') {
          const vorspiel = spiele.find((s) => s.id === referenz.spiel);
          if (!vorspiel) fehler(`${wo}/${spiel.id}: Referenz auf unbekanntes Spiel ${referenz.spiel}.`);
          else if (vorspiel.runde !== spiel.runde - 1) {
            fehler(`${wo}/${spiel.id}: Referenz auf ${referenz.spiel} überspringt eine Runde.`);
          }
        } else {
          fehler(`${wo}/${spiel.id}: Unbekannte Quelle "${referenz.quelle}".`);
        }
      }

      if (spiel.termin && Number.isNaN(new Date(spiel.termin).getTime())) {
        fehler(`${wo}/${spiel.id}: Termin "${spiel.termin}" ist kein gültiges Datum.`);
      }
      if (spiel.top !== undefined && typeof spiel.top !== 'boolean') {
        fehler(`${wo}/${spiel.id}: "top" muss true oder false sein.`);
      }

      const ergebnis = spiel.ergebnis;
      if (!ergebnis) continue;
      if (!['heim', 'gast'].includes(ergebnis.sieger)) {
        fehler(`${wo}/${spiel.id}: Ergebnis ohne gültigen Sieger ("heim" oder "gast").`);
      }
      if (ergebnis.datum && Number.isNaN(new Date(ergebnis.datum).getTime())) {
        fehler(`${wo}/${spiel.id}: Ergebnis-Datum "${ergebnis.datum}" ist ungültig.`);
      }
      const saetze = ergebnis.saetze;
      if (!Array.isArray(saetze) || saetze.length === 0) {
        continue;
      }
      for (const satz of saetze) {
        if (!Array.isArray(satz) || satz.length !== 2 || !satz.every((z) => Number.isInteger(z) && z >= 0 && z <= 30)) {
          fehler(`${wo}/${spiel.id}: Satz ${JSON.stringify(satz)} ist nicht in der Form [6, 4].`);
        } else if (satz[0] === satz[1]) {
          warnung(`${wo}/${spiel.id}: Satz ${satz[0]}:${satz[1]} hat keinen Gewinner.`);
        }
      }
      const berechnet = siegerAusSaetzen(saetze);
      if (berechnet && ergebnis.sieger && berechnet !== ergebnis.sieger && !ergebnis.notiz) {
        fehler(`${wo}/${spiel.id}: Sätze ergeben "${berechnet}", eingetragen ist "${ergebnis.sieger}".`);
      }
    }
  }

  // Auflösung muss durchlaufen (fängt Ringschlüsse und tote Referenzen ab)
  try {
    const aufbereitet = bereiteTurnierAuf(turnier);
    for (const bewerb of aufbereitet.bewerbe) {
      const soll = (bewerb.groesse ?? 0) - 1;
      if (Number.isInteger(soll) && soll > 0 && bewerb.spiele.length !== soll) {
        fehler(`Bewerb ${bewerb.id}: ${soll - bewerb.spiele.length} Spiel(e) ließen sich nicht auflösen.`);
      }
    }
  } catch (fehlerObjekt) {
    fehler(`Raster nicht auflösbar: ${fehlerObjekt.message}`);
  }

  return meldungen;
}
