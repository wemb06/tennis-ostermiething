/**
 * Prueft die Turnierdaten gegen die Logik aus docs/assets/bracket.js.
 *
 *   node scripts/check-data.mjs [pfad-zur-json]
 *
 * Beendet sich mit Code 1, sobald ein Fehler gefunden wird — vor jedem Push laufen lassen.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  alleSpiele,
  bereiteTurnierAuf,
  gespielteSpiele,
  naechsteSpiele,
  pruefeTurnier,
  saetzeText,
  seitenName,
} from '../docs/assets/bracket.js';

const pfad = process.argv[2]
  ? process.argv[2]
  : fileURLToPath(new URL('../docs/data/vm-2026.json', import.meta.url));

let turnier;
try {
  turnier = JSON.parse(await readFile(pfad, 'utf8'));
} catch (fehler) {
  console.error(`Turnierdatei nicht lesbar: ${pfad}\n${fehler.message}`);
  process.exit(1);
}

const meldungen = pruefeTurnier(turnier);
const fehler = meldungen.filter((m) => m.stufe === 'fehler');
const warnungen = meldungen.filter((m) => m.stufe === 'warnung');

console.log(`Datei:  ${pfad}`);
console.log(`Turnier: ${turnier.verein ?? '?'} — ${turnier.titel ?? '?'}`);
if (turnier.demo) console.log('Hinweis: Datei ist als Demo-Datensatz markiert ("demo": true).');
console.log('');

const aufbereitet = bereiteTurnierAuf(turnier);
for (const bewerb of aufbereitet.bewerbe) {
  const spiele = bewerb.spiele;
  const zaehle = (status) => spiele.filter((s) => s.status === status).length;
  const besetzt = (bewerb.spieler ?? []).filter(
    (s) => String(s.name ?? '').trim() && s.name !== 'Freilos',
  ).length;

  console.log(`${bewerb.name} (${bewerb.groesse}er-Raster)`);
  console.log(`  Spieler:  ${besetzt} besetzt, ${bewerb.groesse - besetzt} Freilose`);
  console.log(
    `  Spiele:   ${zaehle('gespielt')} gespielt · ${zaehle('spielbereit')} spielbereit · ` +
      `${zaehle('wartet')} warten auf Vorrunde · ${zaehle('freilos')} Freilos`,
  );
  if (bewerb.meister) console.log(`  Meister:  ${bewerb.meister.name}`);

  const naechste = naechsteSpiele(spiele).slice(0, 3);
  for (const spiel of naechste) {
    const wann = spiel.termin
      ? new Date(spiel.termin).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })
      : `Termin offen${spiel.deadline ? ` (bis ${spiel.deadline})` : ''}`;
    console.log(`    → ${spiel.rundeName}: ${seitenName(spiel.heim)} – ${seitenName(spiel.gast)} · ${wann}`);
  }
  const letzte = gespielteSpiele(spiele)[0];
  if (letzte) {
    console.log(
      `    zuletzt: ${letzte.sieger?.name} d. ${letzte.verlierer?.name} ${saetzeText(letzte)}`.trimEnd(),
    );
  }
  console.log('');
}

console.log(`Spiele gesamt: ${alleSpiele(aufbereitet).length}`);
console.log('');

for (const meldung of warnungen) console.log(`WARNUNG  ${meldung.text}`);
for (const meldung of fehler) console.error(`FEHLER   ${meldung.text}`);

if (fehler.length > 0) {
  console.error(`\n${fehler.length} Fehler — Datei ist nicht veroeffentlichungsreif.`);
  process.exit(1);
}
console.log(warnungen.length > 0 ? `\nOK, mit ${warnungen.length} Warnung(en).` : '\nAlles in Ordnung.');
