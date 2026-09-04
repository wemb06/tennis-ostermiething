/**
 * Unit-Tests der Turnierlogik (docs/assets/bracket.js).
 *
 *   node --test scripts/
 *
 * Nur Node-Bordmittel (node:test, node:assert), keine Abhängigkeiten.
 * Die Tests arbeiten mit erfundenen Mini-Rastern, nie mit den echten Daten.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  alleSpiele,
  anzahlRunden,
  bereiteBewerbAuf,
  bereiteTurnierAuf,
  gespielteSpiele,
  istSichtbar,
  naechsteSpiele,
  pruefeTurnier,
  rundenName,
  saetzeText,
  seitenName,
  siegerAusSaetzen,
} from '../docs/assets/bracket.js';

/* ------------------------------------------------------------ Hilfsdaten -- */

const spieler = (...namen) => namen.map((name, i) => ({ pos: i + 1, name }));

/** Zwei Spieler, ein Spiel. */
function zweierBewerb(namen, ergebnis = null) {
  return {
    id: 'T',
    name: 'Testbewerb',
    groesse: 2,
    spieler: spieler(...namen),
    spiele: [
      { id: 'T-R1-1', runde: 1, heim: { quelle: 'spieler', pos: 1 }, gast: { quelle: 'spieler', pos: 2 }, ergebnis },
    ],
  };
}

/** Vier Spieler, zwei Halbfinali plus Finale. */
function viererBewerb(namen, ergebnisse = {}) {
  const spiel = (id, runde, heim, gast) => ({ id, runde, heim, gast, ergebnis: ergebnisse[id] ?? null });
  return {
    id: 'V',
    name: 'Viererbewerb',
    groesse: 4,
    deadlines: { 1: '2026-09-01', 2: '2026-09-08' },
    spieler: spieler(...namen),
    spiele: [
      spiel('V-R1-1', 1, { quelle: 'spieler', pos: 1 }, { quelle: 'spieler', pos: 2 }),
      spiel('V-R1-2', 1, { quelle: 'spieler', pos: 3 }, { quelle: 'spieler', pos: 4 }),
      spiel('V-R2-1', 2, { quelle: 'sieger', spiel: 'V-R1-1' }, { quelle: 'sieger', spiel: 'V-R1-2' }),
    ],
  };
}

/** Viererbewerb plus Spiel um Platz 3 (hängt an den Verlierern der Halbfinali). */
function viererMitPlatz3(namen, ergebnisse = {}) {
  const bewerb = viererBewerb(namen, ergebnisse);
  bewerb.spiele.push({
    id: 'V-P3',
    runde: 2,
    art: 'platz3',
    heim: { quelle: 'verlierer', spiel: 'V-R1-1' },
    gast: { quelle: 'verlierer', spiel: 'V-R1-2' },
    ergebnis: ergebnisse['V-P3'] ?? null,
  });
  return bewerb;
}

const sieg = (sieger, saetze = [[6, 4], [6, 3]], extra = {}) => ({ datum: '2026-08-20', saetze, sieger, ...extra });
const finde = (bewerb, id) => bewerb.spiele.find((s) => s.id === id);

/* -------------------------------------------------------------- Grundlagen */

describe('Rundennamen und Rastergrößen', () => {
  test('16er-Raster benennt die Runden korrekt', () => {
    assert.equal(rundenName(16, 1), 'Achtelfinale');
    assert.equal(rundenName(16, 2), 'Viertelfinale');
    assert.equal(rundenName(16, 3), 'Halbfinale');
    assert.equal(rundenName(16, 4), 'Finale');
  });

  test('andere Rastergrößen', () => {
    assert.equal(rundenName(2, 1), 'Finale');
    assert.equal(rundenName(4, 1), 'Halbfinale');
    assert.equal(rundenName(8, 1), 'Viertelfinale');
    assert.equal(rundenName(32, 1), 'Sechzehntelfinale');
  });

  test('unerwartete Runde bekommt einen neutralen Namen', () => {
    assert.equal(rundenName(16, 9), '9. Runde');
  });

  test('Anzahl Runden', () => {
    assert.equal(anzahlRunden(2), 1);
    assert.equal(anzahlRunden(16), 4);
    assert.equal(anzahlRunden(32), 5);
  });
});

describe('Sieger aus Sätzen', () => {
  test('zwei Sätze für heim', () => assert.equal(siegerAusSaetzen([[6, 4], [6, 3]]), 'heim'));
  test('zwei Sätze für gast', () => assert.equal(siegerAusSaetzen([[4, 6], [3, 6]]), 'gast'));
  test('drei Sätze mit Match-Tiebreak', () => assert.equal(siegerAusSaetzen([[6, 4], [3, 6], [10, 7]]), 'heim'));
  test('Gleichstand ergibt keinen Sieger', () => assert.equal(siegerAusSaetzen([[6, 4], [3, 6]]), null));
  test('leere Liste', () => assert.equal(siegerAusSaetzen([]), null));
  test('kein Array', () => assert.equal(siegerAusSaetzen(null), null));
  test('unbrauchbare Einträge werden übergangen', () => {
    assert.equal(siegerAusSaetzen([['a', 'b'], [6, 4]]), 'heim');
  });
  test('unentschiedener Satz zählt für niemanden', () => {
    assert.equal(siegerAusSaetzen([[6, 6], [6, 4]]), 'heim');
  });
});

describe('Satzergebnis als Text', () => {
  test('aus Sicht des Siegers, wenn heim gewinnt', () => {
    const bewerb = bereiteBewerbAuf(zweierBewerb(['A', 'B'], sieg('heim', [[6, 4], [3, 6], [10, 7]])));
    assert.equal(saetzeText(finde(bewerb, 'T-R1-1')), '6:4  3:6  10:7');
  });

  test('wird gedreht, wenn gast gewinnt', () => {
    const bewerb = bereiteBewerbAuf(zweierBewerb(['A', 'B'], sieg('gast', [[4, 6], [6, 3], [7, 10]])));
    assert.equal(saetzeText(finde(bewerb, 'T-R1-1')), '6:4  3:6  10:7');
  });

  test('ohne Sätze leer', () => {
    const bewerb = bereiteBewerbAuf(zweierBewerb(['A', 'B'], sieg('heim', [])));
    assert.equal(saetzeText(finde(bewerb, 'T-R1-1')), '');
  });
});

describe('Sichtbarkeit', () => {
  test('fehlendes Feld bedeutet sichtbar', () => assert.equal(istSichtbar({ id: 'A' }), true));
  test('true bleibt sichtbar', () => assert.equal(istSichtbar({ sichtbar: true }), true));
  test('false versteckt', () => assert.equal(istSichtbar({ sichtbar: false }), false));
});

/* --------------------------------------------------------- Raster auflösen */

describe('Raster auflösen', () => {
  test('offenes Spiel: beide Namen bekannt, kein Sieger', () => {
    const spiel = finde(bereiteBewerbAuf(zweierBewerb(['Müller', 'Huber'])), 'T-R1-1');
    assert.equal(spiel.status, 'spielbereit');
    assert.equal(spiel.heim.name, 'Müller');
    assert.equal(spiel.gast.name, 'Huber');
    assert.equal(spiel.sieger, null);
  });

  test('Sieger rückt in die nächste Runde', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['A', 'B', 'C', 'D'], { 'V-R1-1': sieg('gast') }));
    const finale = finde(bewerb, 'V-R2-1');
    assert.equal(finale.heim.name, 'B', 'Sieger des ersten Halbfinales steht im Finale');
    assert.equal(finale.heim.bekannt, true);
    assert.equal(finale.gast.bekannt, false, 'zweites Halbfinale ist noch offen');
    assert.equal(finale.status, 'wartet');
  });

  test('beide Vorrunden gespielt macht das Finale spielbereit', () => {
    const bewerb = bereiteBewerbAuf(
      viererBewerb(['A', 'B', 'C', 'D'], { 'V-R1-1': sieg('heim'), 'V-R1-2': sieg('gast') }),
    );
    const finale = finde(bewerb, 'V-R2-1');
    assert.equal(finale.status, 'spielbereit');
    assert.deepEqual([finale.heim.name, finale.gast.name], ['A', 'D']);
  });

  test('Ergebnis ohne Sätze zählt trotzdem als gespielt', () => {
    const bewerb = bereiteBewerbAuf(
      viererBewerb(['A', 'B', 'C', 'D'], { 'V-R1-1': sieg('heim', [], { notiz: 'ohne Satzangabe' }) }),
    );
    const halbfinale = finde(bewerb, 'V-R1-1');
    assert.equal(halbfinale.status, 'gespielt');
    assert.equal(halbfinale.sieger.name, 'A');
    assert.equal(finde(bewerb, 'V-R2-1').heim.name, 'A');
  });

  test('Meister erst nach dem Finale', () => {
    const offen = bereiteBewerbAuf(viererBewerb(['A', 'B', 'C', 'D'], { 'V-R1-1': sieg('heim') }));
    assert.equal(offen.meister, null);

    const fertig = bereiteBewerbAuf(
      viererBewerb(['A', 'B', 'C', 'D'], {
        'V-R1-1': sieg('heim'),
        'V-R1-2': sieg('heim'),
        'V-R2-1': sieg('gast'),
      }),
    );
    assert.equal(fertig.meister.name, 'C');
  });

  test('Deadline der Runde landet am Spiel', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['A', 'B', 'C', 'D']));
    assert.equal(finde(bewerb, 'V-R1-1').deadline, '2026-09-01');
    assert.equal(finde(bewerb, 'V-R2-1').deadline, '2026-09-08');
  });

  test('Bewerbszugehörigkeit steht am Spiel', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['A', 'B', 'C', 'D']));
    assert.equal(finde(bewerb, 'V-R1-1').bewerbId, 'V');
    assert.equal(finde(bewerb, 'V-R1-1').bewerbName, 'Viererbewerb');
  });
});

describe('Beschriftung offener Paarungen', () => {
  test('nennt die Vorrunden-Partie, solange beide Namen feststehen', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['Müller', 'Huber', 'Gruber', 'Mayr']));
    assert.equal(seitenName(finde(bewerb, 'V-R2-1').heim), 'Sieger aus Müller – Huber');
  });

  test('weicht auf Runde und Nummer aus, wenn die Vorrunde selbst offen ist', () => {
    const achter = {
      id: 'X',
      name: 'Achter',
      groesse: 8,
      spieler: spieler('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
      spiele: [
        ...[1, 2, 3, 4].map((n) => ({
          id: `X-R1-${n}`,
          runde: 1,
          heim: { quelle: 'spieler', pos: n * 2 - 1 },
          gast: { quelle: 'spieler', pos: n * 2 },
          ergebnis: null,
        })),
        ...[1, 2].map((n) => ({
          id: `X-R2-${n}`,
          runde: 2,
          heim: { quelle: 'sieger', spiel: `X-R1-${n * 2 - 1}` },
          gast: { quelle: 'sieger', spiel: `X-R1-${n * 2}` },
          ergebnis: null,
        })),
        {
          id: 'X-R3-1',
          runde: 3,
          heim: { quelle: 'sieger', spiel: 'X-R2-1' },
          gast: { quelle: 'sieger', spiel: 'X-R2-2' },
          ergebnis: null,
        },
      ],
    };
    const bewerb = bereiteBewerbAuf(achter);
    assert.equal(seitenName(finde(bewerb, 'X-R3-1').heim), 'Sieger Halbfinale 1');
  });
});

describe('Freilose', () => {
  test('Gegner steigt ohne Spiel auf', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['A', 'Freilos', 'C', 'D']));
    const spiel = finde(bewerb, 'V-R1-1');
    assert.equal(spiel.status, 'freilos');
    assert.equal(spiel.sieger.name, 'A');
    assert.equal(finde(bewerb, 'V-R2-1').heim.name, 'A');
  });

  test('leerer Name wirkt wie Freilos', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['A', '   ', 'C', 'D']));
    assert.equal(finde(bewerb, 'V-R1-1').sieger.name, 'A');
  });

  test('Freilos gegen Freilos reicht ein Freilos weiter', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['Freilos', 'Freilos', 'C', 'D']));
    const finale = finde(bewerb, 'V-R2-1');
    assert.equal(finale.heim.freilos, true);
    assert.equal(finale.status, 'wartet', 'kein spielbereites Finale gegen ein Freilos');
  });

  test('Freilos entscheidet nichts, solange der Gegner offen ist', () => {
    const roh = viererBewerb(['A', 'B', 'C', 'D']);
    roh.spiele[2].heim = { quelle: 'spieler', pos: 1 }; // unsauber, aber prüft die Bedingung
    roh.spieler[0].name = 'Freilos';
    const bewerb = bereiteBewerbAuf(roh);
    assert.equal(finde(bewerb, 'V-R1-1').sieger.name, 'B');
  });

  test('Freilos-Sieger wird nicht Meister', () => {
    const bewerb = bereiteBewerbAuf(
      viererBewerb(['Freilos', 'Freilos', 'Freilos', 'Freilos']),
    );
    assert.equal(bewerb.meister, null);
  });
});

describe('Spiel um Platz 3', () => {
  test('heißt so und zählt nicht zu den Rasterrunden', () => {
    const bewerb = bereiteBewerbAuf(viererMitPlatz3(['A', 'B', 'C', 'D']));
    assert.equal(finde(bewerb, 'V-P3').rundeName, 'Spiel um Platz 3');
    assert.equal(finde(bewerb, 'V-R2-1').rundeName, 'Finale');
    assert.equal(finde(bewerb, 'V-R2-1').nr, 1, 'das Finale bleibt Nr. 1 seiner Runde');
  });

  test('nennt die Verlierer, solange die Halbfinali offen sind', () => {
    const bewerb = bereiteBewerbAuf(viererMitPlatz3(['Müller', 'Huber', 'Gruber', 'Mayr']));
    assert.equal(seitenName(finde(bewerb, 'V-P3').heim), 'Verlierer aus Müller – Huber');
    assert.equal(finde(bewerb, 'V-P3').status, 'wartet');
  });

  test('die Verlierer der Halbfinali rücken nach', () => {
    const bewerb = bereiteBewerbAuf(
      viererMitPlatz3(['A', 'B', 'C', 'D'], { 'V-R1-1': sieg('heim'), 'V-R1-2': sieg('gast') }),
    );
    const spiel = finde(bewerb, 'V-P3');
    assert.equal(spiel.heim.name, 'B');
    assert.equal(spiel.gast.name, 'C');
    assert.equal(spiel.status, 'spielbereit');
  });

  test('ein Freilos-Verlierer bleibt draußen — die Seite bleibt offen', () => {
    const bewerb = bereiteBewerbAuf(viererMitPlatz3(['A', 'Freilos', 'C', 'D']));
    const spiel = finde(bewerb, 'V-P3');
    assert.equal(spiel.heim.bekannt, false);
    assert.equal(seitenName(spiel.heim), 'kein Gegner (Freilos)');
    assert.equal(spiel.status, 'wartet');
  });

  test('Meister kommt aus dem Finale, nicht aus dem Spiel um Platz 3', () => {
    const bewerb = bereiteBewerbAuf(
      viererMitPlatz3(['A', 'B', 'C', 'D'], {
        'V-R1-1': sieg('heim'),
        'V-R1-2': sieg('heim'),
        'V-R2-1': sieg('gast'),
        'V-P3': sieg('heim'),
      }),
    );
    assert.equal(bewerb.meister.name, 'C');
    assert.equal(bewerb.dritter.name, 'B');
  });

  test('ohne Spiel um Platz 3 gibt es keinen Dritten', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['A', 'B', 'C', 'D']));
    assert.equal(bewerb.dritter, null);
  });
});

describe('Kaputte Daten stürzen nicht ab', () => {
  test('Referenz auf ein nicht vorhandenes Spiel', () => {
    const roh = viererBewerb(['A', 'B', 'C', 'D']);
    roh.spiele[2].heim = { quelle: 'sieger', spiel: 'gibt-es-nicht' };
    const bewerb = bereiteBewerbAuf(roh);
    assert.equal(finde(bewerb, 'V-R2-1').heim.bekannt, false);
  });

  test('Ringschluss endet, statt hängen zu bleiben', () => {
    const roh = viererBewerb(['A', 'B', 'C', 'D']);
    roh.spiele[0].heim = { quelle: 'sieger', spiel: 'V-R2-1' };
    const bewerb = bereiteBewerbAuf(roh);
    assert.equal(bewerb.spiele.length, 3);
  });

  test('unbekannte Quelle ergibt eine offene Seite', () => {
    const roh = zweierBewerb(['A', 'B']);
    roh.spiele[0].heim = { quelle: 'zauberei' };
    assert.equal(bereiteBewerbAuf(roh).spiele[0].heim.bekannt, false);
  });

  test('Bewerb ohne Spiele', () => {
    const bewerb = bereiteBewerbAuf({ id: 'L', name: 'Leer', groesse: 2, spieler: [], spiele: [] });
    assert.deepEqual(bewerb.spiele, []);
    assert.equal(bewerb.meister, null);
  });

  test('Ergebnis ohne Sieger-Feld gilt nicht als gespielt', () => {
    const bewerb = bereiteBewerbAuf(zweierBewerb(['A', 'B'], { datum: '2026-08-20', saetze: [[6, 4]] }));
    assert.equal(finde(bewerb, 'T-R1-1').status, 'spielbereit');
  });
});

/* ------------------------------------------------------------- Sortierung */

describe('Nächste Spiele', () => {
  const bau = (spiele) => ({
    id: 'S',
    name: 'Sortierbewerb',
    groesse: 16,
    deadlines: { 1: '2026-09-10' },
    spieler: spieler(...Array.from({ length: 16 }, (_, i) => `P${i + 1}`)),
    spiele: spiele.map((s, i) => ({
      id: s.id,
      runde: 1,
      heim: { quelle: 'spieler', pos: i * 2 + 1 },
      gast: { quelle: 'spieler', pos: i * 2 + 2 },
      termin: s.termin ?? null,
      ergebnis: s.ergebnis ?? null,
    })),
  });

  test('nach Termin aufsteigend, Spiele ohne Termin zuletzt', () => {
    const bewerb = bereiteBewerbAuf(
      bau([
        { id: 'ohne' },
        { id: 'spaet', termin: '2026-09-05T10:00' },
        { id: 'frueh', termin: '2026-09-01T10:00' },
      ]),
    );
    assert.deepEqual(naechsteSpiele(bewerb.spiele).map((s) => s.id), ['frueh', 'spaet', 'ohne']);
  });

  test('gespielte Partien tauchen nicht auf', () => {
    const bewerb = bereiteBewerbAuf(
      bau([{ id: 'offen' }, { id: 'fertig', ergebnis: sieg('heim') }]),
    );
    assert.deepEqual(naechsteSpiele(bewerb.spiele).map((s) => s.id), ['offen']);
  });

  test('wartende Partien tauchen nicht auf', () => {
    const bewerb = bereiteBewerbAuf(viererBewerb(['A', 'B', 'C', 'D']));
    assert.deepEqual(naechsteSpiele(bewerb.spiele).map((s) => s.id), ['V-R1-1', 'V-R1-2']);
  });

  test('eine wartende Partie mit Termin steht dagegen im Kalender', () => {
    const roh = viererBewerb(['A', 'B', 'C', 'D']);
    roh.spiele.find((s) => s.id === 'V-R2-1').termin = '2026-09-08T18:00';
    const bewerb = bereiteBewerbAuf(roh);
    assert.deepEqual(naechsteSpiele(bewerb.spiele).map((s) => s.id), ['V-R2-1', 'V-R1-1', 'V-R1-2']);
  });

  test('auch das Spiel um Platz 3 lässt sich vorab ansetzen', () => {
    const roh = viererMitPlatz3(['A', 'B', 'C', 'D']);
    roh.spiele.find((s) => s.id === 'V-P3').termin = '2026-09-08T18:00';
    const bewerb = bereiteBewerbAuf(roh);
    assert.ok(naechsteSpiele(bewerb.spiele).some((s) => s.id === 'V-P3'));
  });
});

describe('Gespielte Spiele', () => {
  test('neueste zuerst', () => {
    const bewerb = bereiteBewerbAuf(
      viererBewerb(['A', 'B', 'C', 'D'], {
        'V-R1-1': { datum: '2026-08-10', saetze: [[6, 0]], sieger: 'heim' },
        'V-R1-2': { datum: '2026-08-20', saetze: [[6, 0]], sieger: 'heim' },
      }),
    );
    assert.deepEqual(gespielteSpiele(bewerb.spiele).map((s) => s.id), ['V-R1-2', 'V-R1-1']);
  });
});

describe('Turnier als Ganzes', () => {
  test('alle Bewerbe werden aufgelöst und zusammengefasst', () => {
    const turnier = bereiteTurnierAuf({
      verein: 'Test',
      titel: 'T',
      bewerbe: [viererBewerb(['A', 'B', 'C', 'D']), zweierBewerb(['E', 'F'])],
    });
    assert.equal(turnier.bewerbe.length, 2);
    assert.equal(alleSpiele(turnier).length, 4);
  });

  test('Turnier ohne Bewerbe', () => {
    assert.deepEqual(alleSpiele(bereiteTurnierAuf({})), []);
  });
});

/* ---------------------------------------------------------------- Prüfung */

describe('Datenprüfung meldet Fehler', () => {
  const fehlerTexte = (turnier) =>
    pruefeTurnier(turnier).filter((m) => m.stufe === 'fehler').map((m) => m.text);
  const gueltig = () => ({ verein: 'V', titel: 'T', bewerbe: [viererBewerb(['A', 'B', 'C', 'D'])] });

  test('gültige Daten ergeben keine Fehler', () => {
    assert.deepEqual(fehlerTexte(gueltig()), []);
  });

  test('ein Spiel um Platz 3 ist erlaubt', () => {
    const t = { verein: 'V', titel: 'T', bewerbe: [viererMitPlatz3(['A', 'B', 'C', 'D'])] };
    assert.deepEqual(fehlerTexte(t), []);
  });

  test('unbekannte Spielart', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[0].art = 'trostrunde';
    assert.ok(fehlerTexte(t).some((f) => /Unbekannte Spielart/.test(f)));
  });

  test('zwei Spiele um Platz 3', () => {
    const bewerb = viererMitPlatz3(['A', 'B', 'C', 'D']);
    bewerb.spiele.push({ ...bewerb.spiele.at(-1), id: 'V-P3b' });
    assert.ok(
      fehlerTexte({ verein: 'V', titel: 'T', bewerbe: [bewerb] }).some((f) => /nur eines geben/.test(f)),
    );
  });

  test('Spiel um Platz 3 in der falschen Runde', () => {
    const bewerb = viererMitPlatz3(['A', 'B', 'C', 'D']);
    bewerb.spiele.at(-1).runde = 1;
    assert.ok(
      fehlerTexte({ verein: 'V', titel: 'T', bewerbe: [bewerb] }).some((f) => /gehört in Runde 2/.test(f)),
    );
  });

  test('aus dem Spiel um Platz 3 geht es nicht weiter', () => {
    const bewerb = viererMitPlatz3(['A', 'B', 'C', 'D']);
    bewerb.spiele.find((s) => s.id === 'V-R2-1').heim = { quelle: 'sieger', spiel: 'V-P3' };
    assert.ok(
      fehlerTexte({ verein: 'V', titel: 'T', bewerbe: [bewerb] }).some((f) => /daraus geht es nicht weiter/.test(f)),
    );
  });

  test('Rastergröße muss Zweierpotenz sein', () => {
    const t = gueltig();
    t.bewerbe[0].groesse = 6;
    assert.match(fehlerTexte(t)[0], /Zweierpotenz/);
  });

  test('falsche Anzahl Spiele', () => {
    const t = gueltig();
    t.bewerbe[0].spiele.pop();
    assert.ok(fehlerTexte(t).some((f) => /Spiele statt/.test(f)));
  });

  test('doppelte Spiel-ID', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[1].id = t.bewerbe[0].spiele[0].id;
    assert.ok(fehlerTexte(t).some((f) => /doppelt/.test(f)));
  });

  test('doppelte Rasterposition', () => {
    const t = gueltig();
    t.bewerbe[0].spieler[1].pos = 1;
    assert.ok(fehlerTexte(t).some((f) => /doppelt vergeben/.test(f)));
  });

  test('Verweis auf unbekanntes Spiel', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[2].heim = { quelle: 'sieger', spiel: 'weg' };
    assert.ok(fehlerTexte(t).some((f) => /unbekanntes Spiel/.test(f)));
  });

  test('Spieler dürfen nur in Runde 1 direkt stehen', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[2].heim = { quelle: 'spieler', pos: 1 };
    assert.ok(fehlerTexte(t).some((f) => /nur in Runde 1/.test(f)));
  });

  test('Sieger passt nicht zu den Sätzen', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[0].ergebnis = { datum: '2026-08-20', saetze: [[6, 4], [6, 3]], sieger: 'gast' };
    assert.ok(fehlerTexte(t).some((f) => /eingetragen ist/.test(f)));
  });

  test('Notiz erlaubt abweichenden Sieger (w.o.)', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[0].ergebnis = { datum: '2026-08-20', saetze: [[6, 4]], sieger: 'gast', notiz: 'w.o.' };
    assert.deepEqual(fehlerTexte(t), []);
  });

  test('unsinniger Satz', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[0].ergebnis = { datum: '2026-08-20', saetze: [[99, 4]], sieger: 'heim' };
    assert.ok(fehlerTexte(t).some((f) => /nicht in der Form/.test(f)));
  });

  test('Ergebnis ohne Sätze ist erlaubt', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[0].ergebnis = { datum: '2026-08-20', saetze: [], sieger: 'heim' };
    assert.deepEqual(fehlerTexte(t), []);
  });

  test('ungültiger Termin', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[0].termin = 'morgen';
    assert.ok(fehlerTexte(t).some((f) => /kein gültiges Datum/.test(f)));
  });

  test('unbekannte Zusatzfelder stören nicht', () => {
    const t = gueltig();
    t.bewerbe[0].spiele[0].bemerkung = 'irgendwas';
    assert.deepEqual(fehlerTexte(t), []);
  });

  test('sichtbar muss boolesch sein', () => {
    const t = gueltig();
    t.bewerbe[0].sichtbar = 'nein';
    assert.ok(fehlerTexte(t).some((f) => /"sichtbar"/.test(f)));
  });

  test('api muss https sein', () => {
    const t = gueltig();
    t.api = 'http://unsicher.example';
    assert.ok(fehlerTexte(t).some((f) => /"api"/.test(f)));
  });

  test('api darf null sein', () => {
    const t = gueltig();
    t.api = null;
    assert.deepEqual(fehlerTexte(t), []);
  });

  test('versteckter Bewerb ohne Namen wird nicht bemängelt', () => {
    const t = gueltig();
    t.bewerbe[0].sichtbar = false;
    t.bewerbe[0].spieler = t.bewerbe[0].spieler.map((s) => ({ ...s, name: 'Freilos' }));
    const warnungen = pruefeTurnier(t).filter((m) => m.stufe === 'warnung');
    assert.deepEqual(warnungen, []);
  });

  test('sichtbarer Bewerb mit Lücke warnt', () => {
    const t = gueltig();
    t.bewerbe[0].spieler[0].name = '';
    const warnungen = pruefeTurnier(t).filter((m) => m.stufe === 'warnung');
    assert.ok(warnungen.length > 0);
  });

  test('kein Bewerb vorhanden', () => {
    assert.ok(fehlerTexte({ verein: 'V', titel: 'T', bewerbe: [] }).some((f) => /Keine Bewerbe/.test(f)));
  });

  test('gar kein Objekt', () => {
    assert.ok(fehlerTexte(null).length > 0);
  });
});
