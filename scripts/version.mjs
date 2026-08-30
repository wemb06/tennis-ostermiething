/**
 * Versionsstempel für die Seiten-Dateien.
 *
 * GitHub Pages liefert alles mit `Cache-Control: max-age=600` aus. Nach einem
 * Deploy kann ein Browser deshalb bis zu zehn Minuten lang neues index.html mit
 * alter app.js mischen — die Seite bricht dann mit einem Folgefehler ab.
 *
 * Abhilfe ohne Build-Werkzeug: an die Adressen von CSS/JS hängt ein `?v=<Kürzel>`,
 * das sich aus dem Inhalt der Dateien ergibt. Ändert sich der Code, ändert sich
 * die Adresse — der Browser muss neu laden und kann nicht mischen.
 *
 *   node scripts/version.mjs            stempelt die aktuelle Version ein
 *   node scripts/version.mjs --pruefen  meldet nur, ob der Stempel aktuell ist
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wurzel = new URL('../', import.meta.url);
const datei = (relativ) => fileURLToPath(new URL(relativ, wurzel));

const SEITE = datei('docs/index.html');
const APP = datei('docs/assets/app.js');
const CSS = datei('docs/assets/app.css');
const LOGIK = datei('docs/assets/bracket.js');

/** Vorhandene ?v=-Angaben ausblenden, damit der Stempel sich nicht selbst beeinflusst. */
function ohneStempel(text) {
  return text.replaceAll(/\?v=[0-9a-f]{8}/g, '');
}

export function berechneVersion() {
  const inhalt = [APP, CSS, LOGIK].map((pfad) => ohneStempel(readFileSync(pfad, 'utf8'))).join('\n');
  return createHash('sha256').update(inhalt).digest('hex').slice(0, 8);
}

function ersetze(text, muster, ersatz) {
  if (!muster.test(text)) throw new Error(`Stelle nicht gefunden: ${muster}`);
  return text.replace(muster, ersatz);
}

export function stempele() {
  const version = berechneVersion();

  let seite = readFileSync(SEITE, 'utf8');
  seite = ersetze(seite, /href="assets\/app\.css(\?v=[0-9a-f]{8})?"/, `href="assets/app.css?v=${version}"`);
  seite = ersetze(seite, /src="assets\/app\.js(\?v=[0-9a-f]{8})?"/, `src="assets/app.js?v=${version}"`);
  writeFileSync(SEITE, seite, 'utf8');

  // app.js lädt bracket.js selbst — auch dieser Import braucht den Stempel
  let app = readFileSync(APP, 'utf8');
  app = ersetze(app, /from '\.\/bracket\.js(\?v=[0-9a-f]{8})?'/, `from './bracket.js?v=${version}'`);
  writeFileSync(APP, app, 'utf8');

  return version;
}

/** Prüft, ob der eingetragene Stempel zum Inhalt passt. */
export function pruefeVersion() {
  const erwartet = berechneVersion();
  const seite = readFileSync(SEITE, 'utf8');
  const app = readFileSync(APP, 'utf8');
  const gefunden = [
    seite.match(/assets\/app\.css\?v=([0-9a-f]{8})/)?.[1],
    seite.match(/assets\/app\.js\?v=([0-9a-f]{8})/)?.[1],
    app.match(/bracket\.js\?v=([0-9a-f]{8})/)?.[1],
  ];
  return { aktuell: gefunden.every((wert) => wert === erwartet), erwartet, gefunden };
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) {
  if (process.argv.includes('--pruefen')) {
    const stand = pruefeVersion();
    if (stand.aktuell) {
      console.log(`Versionsstempel aktuell: ${stand.erwartet}`);
    } else {
      console.error(`Versionsstempel veraltet — erwartet ${stand.erwartet}, gefunden ${stand.gefunden.join(', ')}`);
      console.error('Bitte "node scripts/version.mjs" ausfuehren und die Aenderung mitcommitten.');
      process.exit(1);
    }
  } else {
    console.log(`Versionsstempel gesetzt: ${stempele()}`);
  }
}
