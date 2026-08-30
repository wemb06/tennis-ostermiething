/**
 * Vorschau-Server fuer docs/ — ohne Abhaengigkeiten, nur Node.
 *
 *   node scripts/serve.mjs [port]
 *
 * Laeuft auf allen Netzwerk-Schnittstellen, damit die Seite vor dem
 * Veroeffentlichen am eigenen Handy im WLAN getestet werden kann.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('../docs/', import.meta.url));
const port = Number(process.argv[2] ?? 4173);

const typen = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (anfrage, antwort) => {
  const pfad = decodeURIComponent(new URL(anfrage.url, 'http://localhost').pathname);
  const relativ = normalize(pfad === '/' ? 'index.html' : pfad.replace(/^\/+/, ''));
  if (relativ.startsWith('..') || relativ.includes(`..${sep}`)) {
    antwort.writeHead(403).end('Verboten');
    return;
  }

  let datei = join(wurzel, relativ);
  try {
    if ((await stat(datei)).isDirectory()) datei = join(datei, 'index.html');
    const inhalt = await readFile(datei);
    antwort.writeHead(200, {
      'Content-Type': typen[extname(datei).toLowerCase()] ?? 'application/octet-stream',
      // Kein Caching — sonst zeigt das Handy beim Testen hartnaeckig alte Daten
      'Cache-Control': 'no-store, max-age=0',
    });
    antwort.end(inhalt);
  } catch {
    antwort.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    antwort.end(`Nicht gefunden: ${relativ}`);
  }
});

server.listen(port, '0.0.0.0', () => {
  const adressen = Object.values(networkInterfaces())
    .flat()
    .filter((netz) => netz && netz.family === 'IPv4' && !netz.internal)
    .map((netz) => netz.address);

  console.log(`Vorschau laeuft — Ordner: ${wurzel}`);
  console.log(`  am Rechner:  http://localhost:${port}/`);
  for (const adresse of adressen) console.log(`  am Handy:    http://${adresse}:${port}/   (gleiches WLAN)`);
  console.log('\nBeenden mit Strg+C');
});
