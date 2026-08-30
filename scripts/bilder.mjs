/**
 * Erzeugt alle Bilder der Seite (App-Icons, Favicon, WhatsApp-Vorschaubild)
 * ohne Bildbibliothek: die Pixel werden direkt gezeichnet und als PNG
 * gespeichert (zlib bringt Node selbst mit).
 *
 *   node scripts/bilder.mjs
 *
 * Motiv: Tennisball auf Sandplatz-Grund.
 */

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const zielOrdner = fileURLToPath(new URL('../docs/bilder/', import.meta.url));

/* ------------------------------------------------------------ PNG-Ausgabe -- */

const crcTabelle = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(daten) {
  let crc = -1;
  for (const byte of daten) crc = crcTabelle[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function block(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const inhalt = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const pruefsumme = Buffer.alloc(4);
  pruefsumme.writeUInt32BE(crc32(inhalt));
  return Buffer.concat([laenge, inhalt, pruefsumme]);
}

/** RGBA-Puffer (Uint8Array, breite*hoehe*4) → PNG-Datei. */
function alsPng(pixel, breite, hoehe) {
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(hoehe, 4);
  kopf[8] = 8; // Bittiefe
  kopf[9] = 6; // RGBA
  const zeilen = Buffer.alloc(hoehe * (breite * 4 + 1));
  for (let y = 0; y < hoehe; y += 1) {
    zeilen[y * (breite * 4 + 1)] = 0; // Filter: keiner
    pixel.subarray(y * breite * 4, (y + 1) * breite * 4).forEach((wert, i) => {
      zeilen[y * (breite * 4 + 1) + 1 + i] = wert;
    });
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', kopf),
    block('IDAT', deflateSync(zeilen, { level: 9 })),
    block('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------- Zeichnen --- */

const farbe = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const SAND = farbe('#b8502a');
const SAND_DUNKEL = farbe('#9c3f20');
const BALL = farbe('#d7e34a');
const BALL_SCHATTEN = farbe('#b8c433');
const NAHT = farbe('#f7f9ec');

/**
 * Zeichnet ein Quadrat/Rechteck: Sandgrund, mittiger Tennisball mit Naht.
 * `deckung(x, y)` liefert pro Punkt die Farbe; 3×3-Unterabtastung glättet Kanten.
 */
function zeichne(breite, hoehe, ballX, ballY, ballRadius, { rundung = 0 } = {}) {
  const pixel = new Uint8Array(breite * hoehe * 4);

  const nahtAbstand = ballRadius * 1.05;
  const nahtRadius = ballRadius * 1.42;
  const nahtBreite = ballRadius * 0.075;

  function punktFarbe(x, y) {
    // Abgerundete Ecken des Hintergrunds (für das maskierbare Icon unnötig,
    // beim Favicon hübsch): außerhalb → durchsichtig
    if (rundung > 0) {
      const ex = Math.max(Math.abs(x - breite / 2) - (breite / 2 - rundung), 0);
      const ey = Math.max(Math.abs(y - hoehe / 2) - (hoehe / 2 - rundung), 0);
      if (ex * ex + ey * ey > rundung * rundung) return null;
    }

    const dx = x - ballX;
    const dy = y - ballY;
    const abstand = Math.hypot(dx, dy);

    if (abstand <= ballRadius) {
      // Naht: zwei Kreisbögen, deren Mittelpunkte außerhalb des Balls liegen
      const naht1 = Math.abs(Math.hypot(dx - nahtAbstand, dy + nahtAbstand) - nahtRadius) < nahtBreite;
      const naht2 = Math.abs(Math.hypot(dx + nahtAbstand, dy - nahtAbstand) - nahtRadius) < nahtBreite;
      if (naht1 || naht2) return NAHT;
      // leichte Wölbung: nach unten rechts weich abdunkeln
      const licht = Math.min(Math.max(((dx + dy) / (2 * ballRadius) - 0.15) / 0.7, 0), 1);
      return BALL.map((wert, i) => wert + (BALL_SCHATTEN[i] - wert) * licht);
    }
    // Sandgrund mit dezenter Linie (Platzmarkierung) unter dem Ball
    const linieY = ballY + ballRadius * 1.45;
    if (Math.abs(y - linieY) < hoehe * 0.008 && y < hoehe) return SAND_DUNKEL;
    return SAND;
  }

  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let uy = 0; uy < 3; uy += 1) {
        for (let ux = 0; ux < 3; ux += 1) {
          const wert = punktFarbe(x + (ux + 0.5) / 3, y + (uy + 0.5) / 3);
          if (wert) {
            r += wert[0];
            g += wert[1];
            b += wert[2];
            a += 255;
          }
        }
      }
      const i = (y * breite + x) * 4;
      const anteil = a / 255 || 1;
      pixel[i] = r / anteil;
      pixel[i + 1] = g / anteil;
      pixel[i + 2] = b / anteil;
      pixel[i + 3] = a / 9;
    }
  }
  return alsPng(pixel, breite, hoehe);
}

/* -------------------------------------------------------------- Ausgabe --- */

await mkdir(zielOrdner, { recursive: true });

const dateien = [
  // App-Icons: Ball mittig, genug Rand für "maskable"
  ['icon-512.png', zeichne(512, 512, 256, 256, 150)],
  ['icon-192.png', zeichne(192, 192, 96, 96, 56)],
  ['icon-180.png', zeichne(180, 180, 90, 90, 53)],
  ['favicon.png', zeichne(32, 32, 16, 16, 11, { rundung: 7 })],
  // WhatsApp/OG-Vorschau (1200×630): Ball rechts, viel ruhiger Grund
  ['og-bild.png', zeichne(1200, 630, 920, 315, 190)],
];

for (const [name, daten] of dateien) {
  await writeFile(new URL(name, `file://${zielOrdner.replaceAll('\\', '/')}`), daten);
  console.log(`geschrieben: docs/bilder/${name} (${(daten.length / 1024).toFixed(1)} kB)`);
}
