/**
 * Dashboard der Vereinsmeisterschaft — Anzeige.
 * Die gesamte Turnierlogik steckt in bracket.js; hier wird nur dargestellt.
 */

import {
  alleSpiele,
  anzahlRunden,
  bereiteTurnierAuf,
  gespielteSpiele,
  ladeTurnier,
  naechsteSpiele,
  rundenName,
  seitenName,
} from './bracket.js';

const ANSICHTEN = ['naechste', 'ergebnisse', 'raster'];

const zustand = {
  turnier: null,
  ansicht: 'naechste',
  bewerb: 'alle',
  geladen: 0,
};

const knoten = {
  inhalt: document.getElementById('inhalt'),
  stand: document.getElementById('stand'),
  bewerbwahl: document.getElementById('bewerbwahl'),
  aktualisieren: document.getElementById('aktualisieren'),
  detail: document.getElementById('detail'),
  detailInhalt: document.getElementById('detail-inhalt'),
  tabs: [...document.querySelectorAll('.tab')],
};

/* ------------------------------------------------------------- Werkzeug --- */

function el(tag, eigenschaften = {}, ...kinder) {
  const element = document.createElement(tag);
  for (const [name, wert] of Object.entries(eigenschaften)) {
    if (wert === null || wert === undefined || wert === false) continue;
    if (name === 'class') element.className = wert;
    else if (name === 'text') element.textContent = wert;
    else if (name.startsWith('on')) element.addEventListener(name.slice(2), wert);
    else element.setAttribute(name, wert === true ? '' : String(wert));
  }
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    element.append(kind);
  }
  return element;
}

const fmtTagKurz = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtTagLang = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtUhr = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' });
const fmtStand = new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function alsDatum(wert) {
  if (!wert) return null;
  const datum = new Date(wert);
  return Number.isNaN(datum.getTime()) ? null : datum;
}

/** Tagesschlüssel in Ortszeit, z. B. "2026-09-01". */
function tagesSchluessel(datum) {
  const jahr = datum.getFullYear();
  const monat = String(datum.getMonth() + 1).padStart(2, '0');
  const tag = String(datum.getDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

function tagesTitel(datum, heute) {
  const abstand = Math.round((new Date(tagesSchluessel(datum)) - new Date(tagesSchluessel(heute))) / 86400000);
  if (abstand === 0) return 'Heute';
  if (abstand === 1) return 'Morgen';
  if (abstand === -1) return 'Gestern';
  return fmtTagKurz.format(datum);
}

/* -------------------------------------------------------------- Partien --- */

/** Eine Seite der Partie: Name (oder "Sieger aus …") plus Satzergebnisse. */
function seitenZeile(spiel, welche) {
  const seite = spiel[welche];
  const istSieger = spiel.sieger && spiel.sieger === seite;
  const klassen = ['seite'];
  if (!seite.bekannt) klassen.push('offen');
  if (seite.freilos) klassen.push('freilos');
  if (istSieger && spiel.status === 'gespielt') klassen.push('sieger');

  const saetze = spiel.ergebnis?.saetze ?? [];
  const punkte = saetze.length
    ? el(
        'div',
        { class: 'punkte' },
        saetze.map((satz) => el('span', { text: String(welche === 'heim' ? satz[0] : satz[1]) })),
      )
    : null;

  return el('div', { class: klassen.join(' ') }, el('div', { class: 'name', text: seitenName(seite) }), punkte);
}

/** Zeitangabe rechts oben auf der Karte. */
function wannText(spiel, heute) {
  const termin = alsDatum(spiel.termin);
  if (termin) {
    const heutigerTag = tagesSchluessel(termin) === tagesSchluessel(heute);
    const vergangen = tagesSchluessel(termin) < tagesSchluessel(heute);
    const text = heutigerTag
      ? fmtUhr.format(termin)
      : `${fmtTagKurz.format(termin)}, ${fmtUhr.format(termin)}`;
    return { text, klasse: vergangen && spiel.status === 'spielbereit' ? 'ausstaendig' : '' };
  }
  const deadline = alsDatum(spiel.deadline);
  if (deadline) return { text: `bis ${fmtTagKurz.format(deadline)}`, klasse: 'offen' };
  return { text: 'Termin offen', klasse: 'offen' };
}

function partieKarte(spiel, { zeigeZeit = true, zeigeDatum = false, heute = new Date() } = {}) {
  const kopfRechts = zeigeDatum
    ? { text: alsDatum(spiel.datum) ? fmtTagKurz.format(alsDatum(spiel.datum)) : '', klasse: '' }
    : wannText(spiel, heute);

  const platz = spiel.platz && zeigeZeit ? el('div', { class: 'partie-fuss', text: spiel.platz }) : null;
  const notiz = spiel.ergebnis?.notiz ? el('div', { class: 'partie-fuss', text: spiel.ergebnis.notiz }) : null;

  return el(
    'button',
    { class: 'partie', type: 'button', onclick: () => zeigeDetail(spiel) },
    el(
      'div',
      { class: 'partie-kopf' },
      el(
        'div',
        { class: 'links' },
        el('span', { class: 'marke', text: spiel.bewerbId }),
        el('span', { text: spiel.rundeName }),
      ),
      kopfRechts.text ? el('span', { class: `wann ${kopfRechts.klasse}`, text: kopfRechts.text }) : null,
    ),
    el('div', { class: 'seiten' }, seitenZeile(spiel, 'heim'), seitenZeile(spiel, 'gast')),
    platz,
    notiz,
  );
}

function gruppe(titel, spiele, optionen) {
  return el(
    'section',
    { class: 'gruppe' },
    el(
      'h2',
      { class: 'gruppe-titel' },
      el('span', { text: titel }),
      el('span', { class: 'anzahl', text: `${spiele.length} ${spiele.length === 1 ? 'Spiel' : 'Spiele'}` }),
    ),
    el('div', { class: 'karten' }, spiele.map((spiel) => partieKarte(spiel, optionen))),
  );
}

/* ------------------------------------------------------------- Ansichten -- */

function gefilterteSpiele() {
  const bewerbe = zustand.turnier.bewerbe.filter(
    (bewerb) => zustand.bewerb === 'alle' || bewerb.id === zustand.bewerb,
  );
  return bewerbe.flatMap((bewerb) => bewerb.spiele);
}

function ansichtNaechste() {
  const heute = new Date();
  const spiele = naechsteSpiele(gefilterteSpiele());
  if (spiele.length === 0) {
    return [el('p', { class: 'leer', text: 'Derzeit ist kein Spiel spielbereit.' })];
  }

  // Gruppierung: überfällig → Tage aufsteigend → ohne Termin
  const gruppen = new Map();
  for (const spiel of spiele) {
    const termin = alsDatum(spiel.termin);
    let schluessel;
    let titel;
    if (!termin) {
      schluessel = '3';
      titel = 'Termin noch offen';
    } else if (tagesSchluessel(termin) < tagesSchluessel(heute)) {
      schluessel = '0';
      titel = 'Ergebnis ausständig';
    } else {
      schluessel = `1-${tagesSchluessel(termin)}`;
      titel = tagesTitel(termin, heute);
    }
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, { titel, spiele: [] });
    gruppen.get(schluessel).spiele.push(spiel);
  }

  return [...gruppen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, eintrag]) => gruppe(eintrag.titel, eintrag.spiele, { heute }));
}

function ansichtErgebnisse() {
  const heute = new Date();
  const spiele = gespielteSpiele(gefilterteSpiele());
  if (spiele.length === 0) {
    return [el('p', { class: 'leer', text: 'Noch kein Spiel gewertet.' })];
  }

  const gruppen = new Map();
  for (const spiel of spiele) {
    const datum = alsDatum(spiel.datum);
    const schluessel = datum ? tagesSchluessel(datum) : 'ohne';
    const titel = datum ? `${tagesTitel(datum, heute)} · ${fmtTagLang.format(datum)}` : 'Ohne Datum';
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, { titel, spiele: [] });
    gruppen.get(schluessel).spiele.push(spiel);
  }

  return [...gruppen.entries()]
    .sort(([a], [b]) => (a === 'ohne' ? 1 : b === 'ohne' ? -1 : b.localeCompare(a)))
    .map(([, eintrag]) => gruppe(eintrag.titel, eintrag.spiele, { zeigeDatum: true, heute }));
}

function rasterBlock(bewerb) {
  const runden = anzahlRunden(bewerb.groesse);
  const spalten = [];

  for (let runde = 1; runde <= runden; runde += 1) {
    const spiele = bewerb.spiele.filter((spiel) => spiel.runde === runde);
    spalten.push(
      el(
        'div',
        { class: 'runde' },
        el('div', { class: 'rundenkopf', text: rundenName(bewerb.groesse, runde) }),
        el(
          'div',
          { class: 'paarungen' },
          spiele.map((spiel) => el('div', { class: 'slot' }, partieKarte(spiel, { zeigeZeit: false }))),
        ),
      ),
    );
    if (runde < runden) {
      const klammern = Math.floor(spiele.length / 2);
      spalten.push(
        el(
          'div',
          { class: 'verbinder', 'aria-hidden': 'true' },
          Array.from({ length: klammern }, () => el('div', { class: 'slot' }, el('div', { class: 'klammer' }))),
        ),
      );
    }
  }

  return el(
    'section',
    { class: 'raster-block' },
    el('h2', { class: 'raster-titel', text: bewerb.name }),
    bewerb.meister
      ? el('p', { class: 'meister' }, el('span', { text: '🏆' }), el('span', { text: `Vereinsmeister: ${bewerb.meister.name}` }))
      : null,
    el('div', { class: 'raster-huelle' }, el('div', { class: 'raster' }, spalten)),
  );
}

function ansichtRaster() {
  return zustand.turnier.bewerbe
    .filter((bewerb) => zustand.bewerb === 'alle' || bewerb.id === zustand.bewerb)
    .map(rasterBlock);
}

/* ---------------------------------------------------------------- Detail -- */

function detailZeile(bezeichnung, wert) {
  if (!wert) return null;
  return el('div', { class: 'zeile' }, el('dt', { text: bezeichnung }), el('dd', { text: wert }));
}

function zeigeDetail(spiel) {
  const termin = alsDatum(spiel.termin);
  const datum = alsDatum(spiel.datum);
  const deadline = alsDatum(spiel.deadline);

  const status = {
    gespielt: 'gespielt',
    spielbereit: termin ? 'angesetzt' : 'Termin noch zu vereinbaren',
    wartet: 'wartet auf die Vorrunde',
    freilos: 'Freilos — Aufstieg ohne Spiel',
  }[spiel.status];

  knoten.detailInhalt.replaceChildren(
    el('h2', { text: `${spiel.bewerbName} · ${spiel.rundeName}` }),
    el('div', { class: 'seiten', style: 'margin-top:.7rem' }, seitenZeile(spiel, 'heim'), seitenZeile(spiel, 'gast')),
    el(
      'dl',
      {},
      detailZeile('Status', status),
      detailZeile('Termin', termin ? `${fmtTagLang.format(termin)}, ${fmtUhr.format(termin)} Uhr` : null),
      detailZeile('Gespielt am', !termin && datum ? fmtTagLang.format(datum) : null),
      detailZeile('Platz', spiel.platz),
      detailZeile('Spätestens bis', !termin && deadline ? fmtTagLang.format(deadline) : null),
      detailZeile('Anmerkung', spiel.ergebnis?.notiz),
    ),
  );
  knoten.detail.showModal();
}

/* ------------------------------------------------------------- Steuerung -- */

function zeichne() {
  if (!zustand.turnier) return;

  const teile = {
    naechste: ansichtNaechste,
    ergebnisse: ansichtErgebnisse,
    raster: ansichtRaster,
  }[zustand.ansicht]();

  const band = zustand.turnier.demo
    ? el('p', { class: 'demo-band', text: 'Demo-Daten — noch keine echten Nennungen eingetragen' })
    : null;

  knoten.inhalt.replaceChildren(...[band, ...teile].filter(Boolean));
  for (const tab of knoten.tabs) {
    const aktiv = tab.dataset.ansicht === zustand.ansicht;
    tab.setAttribute('aria-current', aktiv ? 'page' : 'false');
  }
  window.scrollTo({ top: 0 });
}

function zeichneBewerbwahl() {
  const auswahl = [{ id: 'alle', name: 'Alle' }, ...zustand.turnier.bewerbe.map((b) => ({ id: b.id, name: b.name }))];
  knoten.bewerbwahl.replaceChildren(
    ...auswahl.map((eintrag) =>
      el('button', {
        type: 'button',
        text: eintrag.name,
        'aria-pressed': String(zustand.bewerb === eintrag.id),
        onclick: () => {
          zustand.bewerb = eintrag.id;
          schreibeAdresse();
          zeichneBewerbwahl();
          zeichne();
        },
      }),
    ),
  );
}

function zeigeStand() {
  const stand = alsDatum(zustand.turnier?.stand);
  const anzahl = zustand.turnier ? alleSpiele(zustand.turnier).length : 0;
  knoten.stand.textContent = stand
    ? `Stand: ${fmtStand.format(stand)} Uhr · ${anzahl} Spiele im Raster`
    : `${anzahl} Spiele im Raster`;
}

function lesAdresse() {
  const [ansicht, bewerb] = window.location.hash.replace('#', '').split('/');
  if (ANSICHTEN.includes(ansicht)) zustand.ansicht = ansicht;
  if (bewerb) zustand.bewerb = bewerb;
}

function schreibeAdresse() {
  const ziel = `#${zustand.ansicht}${zustand.bewerb !== 'alle' ? `/${zustand.bewerb}` : ''}`;
  if (window.location.hash !== ziel) window.history.replaceState(null, '', ziel);
}

async function laden({ still = false } = {}) {
  if (!still) knoten.aktualisieren.classList.add('laeuft');
  try {
    const roh = await ladeTurnier();
    zustand.turnier = bereiteTurnierAuf(roh);
    zustand.geladen = Date.now();
    document.title = `${roh.verein} — ${roh.titel}`;
    zeigeStand();
    zeichneBewerbwahl();
    zeichne();
  } catch (fehler) {
    knoten.inhalt.replaceChildren(
      el(
        'div',
        { class: 'fehler' },
        el('p', { text: 'Der Spielplan konnte nicht geladen werden.' }),
        el('p', { text: String(fehler.message ?? fehler) }),
        el('button', { class: 'knopf-breit', type: 'button', text: 'Nochmal versuchen', onclick: () => laden() }),
      ),
    );
  } finally {
    knoten.aktualisieren.classList.remove('laeuft');
  }
}

for (const tab of knoten.tabs) {
  tab.addEventListener('click', () => {
    zustand.ansicht = tab.dataset.ansicht;
    schreibeAdresse();
    zeichne();
  });
}

knoten.aktualisieren.addEventListener('click', () => laden());

window.addEventListener('hashchange', () => {
  lesAdresse();
  zeichneBewerbwahl();
  zeichne();
});

// Handy war in der Tasche: beim Zurückkommen stillschweigend nachladen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - zustand.geladen > 60_000) laden({ still: true });
});

lesAdresse();
laden();
