/**
 * Dashboard der Vereinsmeisterschaft — Anzeige und Eintragen.
 * Die gesamte Turnierlogik steckt in bracket.js; hier wird dargestellt und
 * werden Meldungen (Ergebnis/Termin) an die Melde-API geschickt.
 */

import {
  alleSpiele,
  anzahlRunden,
  bereiteTurnierAuf,
  istSichtbar,
  ladeTurnier,
  naechsteSpiele,
  rundenName,
  seitenName,
  siegerAusSaetzen,
} from './bracket.js?v=abe122d9';

// Ansichten: 'naechste' = Startseite, sonst die ID eines Bewerbs (Raster)
const MERKER_SCHLUESSEL = 'vm-gemeldet';
const NAME_SCHLUESSEL = 'vm-melder';

const zustand = {
  turnier: null,
  ansicht: 'naechste',
  bewerb: 'alle',
  geladen: 0,
};

const knoten = {
  inhalt: document.getElementById('inhalt'),
  stand: document.getElementById('stand'),
  tableiste: document.querySelector('.tableiste'),
  aktualisieren: document.getElementById('aktualisieren'),
  detail: document.getElementById('detail'),
  detailInhalt: document.getElementById('detail-inhalt'),
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

/* -------------------------------------------- Gemeldet-Merker (dieses Handy) */

function gelesenerMerker() {
  try {
    return JSON.parse(localStorage.getItem(MERKER_SCHLUESSEL)) ?? {};
  } catch {
    return {};
  }
}

function merkeMeldung(spielId, typ) {
  try {
    const merker = gelesenerMerker();
    merker[spielId] = { typ, zeit: Date.now() };
    localStorage.setItem(MERKER_SCHLUESSEL, JSON.stringify(merker));
  } catch {
    /* privates Fenster o. Ä. — dann eben ohne Merker */
  }
}

/** Der Name des Melders wird gemerkt, damit man ihn nur einmal tippen muss. */
function gemerkterName() {
  try {
    return localStorage.getItem(NAME_SCHLUESSEL) ?? '';
  } catch {
    return '';
  }
}

function merkeName(name) {
  try {
    if (name) localStorage.setItem(NAME_SCHLUESSEL, name);
  } catch {
    /* privates Fenster o. Ä. */
  }
}

/** Merker löschen, sobald die Meldung in den geladenen Daten angekommen ist. */
function raeumeMerkerAuf() {
  try {
    const merker = gelesenerMerker();
    const spiele = new Map(alleSpiele(zustand.turnier).map((spiel) => [spiel.id, spiel]));
    let geaendert = false;
    for (const [id, eintrag] of Object.entries(merker)) {
      const spiel = spiele.get(id);
      const angekommen =
        !spiel ||
        (eintrag.typ === 'ergebnis' && spiel.ergebnis) ||
        (eintrag.typ === 'termin' && spiel.termin) ||
        Date.now() - eintrag.zeit > 3600_000;
      if (angekommen) {
        delete merker[id];
        geaendert = true;
      }
    }
    if (geaendert) localStorage.setItem(MERKER_SCHLUESSEL, JSON.stringify(merker));
    return merker;
  } catch {
    return {};
  }
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
  let punkte = null;
  if (saetze.length) {
    punkte = el(
      'div',
      { class: 'punkte' },
      saetze.map((satz) => el('span', { text: String(welche === 'heim' ? satz[0] : satz[1]) })),
    );
  } else if (istSieger && spiel.status === 'gespielt') {
    // Sieger gemeldet, Satzergebnis unbekannt — Haken statt Zahlen
    punkte = el('div', { class: 'punkte haken' }, el('span', { text: '✓' }));
  }

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

function partieKarte(spiel, { zeigeZeit = true, zeigeDatum = false, heute = new Date(), merker = {} } = {}) {
  const kopfRechts = zeigeDatum
    ? { text: alsDatum(spiel.datum) ? fmtTagKurz.format(alsDatum(spiel.datum)) : '', klasse: '' }
    : wannText(spiel, heute);

  const platz = spiel.platz && zeigeZeit ? el('div', { class: 'partie-fuss', text: spiel.platz }) : null;
  // "ohne Satzangabe" sagt schon der Haken beim Sieger — nicht doppelt schreiben
  const notizText = spiel.ergebnis?.notiz === 'ohne Satzangabe' ? '' : spiel.ergebnis?.notiz;
  const notiz = notizText ? el('div', { class: 'partie-fuss', text: notizText }) : null;
  const gemeldet = merker[spiel.id]
    ? el('div', { class: 'partie-fuss gemeldet', text: '✓ Meldung übermittelt — erscheint in Kürze' })
    : null;

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
    gemeldet,
  );
}

function gruppe(titel, spiele, optionen, klasse = '') {
  return el(
    'section',
    { class: `gruppe ${klasse}`.trim() },
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

function sichtbareBewerbe() {
  return (zustand.turnier?.bewerbe ?? []).filter(istSichtbar);
}

/** Spiele aller sichtbaren Bewerbe — Grundlage der Startseite. */
function gefilterteSpiele() {
  return sichtbareBewerbe().flatMap((bewerb) => bewerb.spiele);
}

/** Vereinsmeister eines entschiedenen Bewerbs — die wichtigste Nachricht zuerst. */
function meisterBanner() {
  return sichtbareBewerbe()
    .filter((bewerb) => bewerb.meister)
    .map((bewerb) =>
      el(
        'p',
        { class: 'meister' },
        el('span', { text: '🏆' }),
        el('span', { text: `${bewerb.name}: ${bewerb.meister.name} ist Vereinsmeister` }),
      ),
    );
}

function ansichtNaechste() {
  const heute = new Date();
  const merker = raeumeMerkerAuf();
  const optionen = { heute, merker };
  const spiele = naechsteSpiele(gefilterteSpiele());
  const meister = meisterBanner();
  if (spiele.length === 0) {
    const alleGespielt = gefilterteSpiele().every((s) => s.status !== 'spielbereit' && s.status !== 'wartet');
    return [
      ...meister,
      el('p', {
        class: 'leer',
        text: alleGespielt
          ? 'Alle Spiele sind gespielt — die Bewerbe sind entschieden.'
          : 'Derzeit ist kein Spiel spielbereit.',
      }),
    ];
  }

  const teile = [...meister];
  const bewerbe = sichtbareBewerbe();

  // Erst der ganze A-Bewerb, dann der nächste — innerhalb jedes Bewerbs
  // chronologisch: überfällig → Tage aufsteigend → Termin noch offen.
  for (const bewerb of bewerbe) {
    const eigene = spiele.filter((spiel) => spiel.bewerbId === bewerb.id);
    if (eigene.length === 0) continue;
    if (bewerbe.length > 1) teile.push(el('h2', { class: 'bewerb-titel', text: bewerb.name }));
    teile.push(...tagesGruppen(eigene, heute, optionen));
  }
  return teile;
}

/** Spiele eines Bewerbs nach Tag gruppieren, in der Reihenfolge der Anzeige. */
function tagesGruppen(spiele, heute, optionen) {
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
    .map(([, eintrag]) => gruppe(eintrag.titel, eintrag.spiele, optionen));
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
    bewerb.meister
      ? el('p', { class: 'meister' }, el('span', { text: '🏆' }), el('span', { text: `Vereinsmeister: ${bewerb.meister.name}` }))
      : null,
    el('div', { class: 'raster-huelle' }, el('div', { class: 'raster' }, spalten)),
  );
}

/** Raster genau eines Bewerbs — das ist der Inhalt der Bewerb-Tabs. */
function ansichtBewerb(bewerbId) {
  const bewerb = sichtbareBewerbe().find((b) => b.id === bewerbId);
  if (!bewerb) return [el('p', { class: 'leer', text: 'Dieser Bewerb ist derzeit nicht freigeschaltet.' })];
  return [rasterBlock(bewerb)];
}

/* --------------------------------------------------------------- Melden ---- */

/**
 * Schickt eine Meldung an die Melde-API (Google Apps Script → Commit ins Repo).
 * text/plain vermeidet den CORS-Preflight, den Apps Script nicht beantwortet.
 */
async function sendeMeldung(nutzlast) {
  const antwort = await fetch(zustand.turnier.api, {
    method: 'POST',
    body: JSON.stringify(nutzlast),
  });
  if (!antwort.ok) throw new Error(`Übertragung fehlgeschlagen (HTTP ${antwort.status})`);
  // Google antwortet bei Andrang gelegentlich mit einer HTML-Seite statt JSON —
  // dann ist unklar, ob die Meldung durchging. Das klärt danach nachgesehen().
  const ergebnis = await antwort.json().catch(() => ({ unklar: true }));
  if (ergebnis.unklar) throw new Error('Antwort unklar');
  if (ergebnis.ok !== true) throw new Error(ergebnis.fehler ?? 'Die Meldung wurde nicht angenommen.');
  return ergebnis;
}

/**
 * Nach einem Fehler nachsehen, ob die Meldung trotzdem angekommen ist.
 * Verhindert, dass jemand nach einer unklaren Antwort ein zweites Mal meldet.
 */
async function nachgesehen(nutzlast) {
  try {
    const frisch = await fetch(`${zustand.turnier.api}?daten=1&x=${Date.now()}`).then((r) => r.json());
    const spiel = (frisch.bewerbe ?? []).flatMap((b) => b.spiele).find((s) => s.id === nutzlast.spiel);
    if (!spiel) return false;
    if (nutzlast.typ === 'ergebnis') return Boolean(spiel.ergebnis);
    if (nutzlast.typ === 'termin') return spiel.termin === nutzlast.termin;
    return false;
  } catch {
    return false;
  }
}

function feld(beschriftung, eingabe) {
  return el('label', { class: 'feld' }, el('span', { text: beschriftung }), eingabe);
}

function meldeknopfzeile(sendenText) {
  return el(
    'div',
    { class: 'knopf-zeile' },
    el('button', { class: 'knopf-breit', type: 'submit', text: sendenText }),
    el('button', {
      class: 'knopf-breit zweitrangig',
      type: 'button',
      text: 'Zurück',
      onclick: () => zeigeDetail(zustand.detailSpiel),
    }),
  );
}

async function verarbeiteFormular(formular, nutzlast, typ, spiel) {
  const senden = formular.querySelector('button[type="submit"]');
  const fehlerfeld = formular.querySelector('.formular-fehler');
  senden.disabled = true;
  senden.textContent = 'Wird übertragen …';
  fehlerfeld.textContent = '';
  try {
    await sendeMeldung(nutzlast);
    merkeName(nutzlast.von);
    merkeMeldung(spiel.id, typ);
    // Sofort den frischen Stand holen, damit die Meldung nicht erst nach dem
    // Seiten-Build (~1 min) sichtbar wird.
    await holeFrischeDaten();
    knoten.detailInhalt.replaceChildren(
      el('h2', { text: 'Danke!' }),
      el('p', {
        class: 'formular-hinweis',
        text:
          typ === 'ergebnis'
            ? 'Das Ergebnis ist übermittelt und erscheint in etwa einer Minute für alle.'
            : 'Der Termin ist übermittelt und erscheint in etwa einer Minute für alle.',
      }),
    );
    zeichne();
  } catch (fehler) {
    // Vielleicht ist sie doch angekommen — dann nicht zum Doppelmelden verleiten
    if (await nachgesehen(nutzlast)) {
      merkeName(nutzlast.von);
      merkeMeldung(spiel.id, typ);
      await holeFrischeDaten();
      knoten.detailInhalt.replaceChildren(
        el('h2', { text: 'Danke!' }),
        el('p', { class: 'formular-hinweis', text: 'Die Meldung ist angekommen.' }),
      );
      zeichne();
      return;
    }
    senden.disabled = false;
    senden.textContent = typ === 'ergebnis' ? 'Ergebnis melden' : 'Termin speichern';
    fehlerfeld.textContent = `${String(fehler.message ?? fehler)} — bitte nochmal versuchen.`;
  }
}

function terminFormular(spiel) {
  const terminAlt = alsDatum(spiel.termin);
  const datum = el('input', {
    type: 'date',
    required: true,
    value: terminAlt ? tagesSchluessel(terminAlt) : '',
  });
  const uhrzeit = el('input', {
    type: 'time',
    required: true,
    value: terminAlt ? `${String(terminAlt.getHours()).padStart(2, '0')}:${String(terminAlt.getMinutes()).padStart(2, '0')}` : '',
  });
  const platzliste = el(
    'datalist',
    { id: 'platzliste' },
    ['Platz 1', 'Platz 2', 'Platz 3'].map((p) => el('option', { value: p })),
  );
  const platz = el('input', { type: 'text', list: 'platzliste', maxlength: '40', value: spiel.platz ?? '', placeholder: 'z. B. Platz 2' });
  const von = el('input', { type: 'text', required: true, maxlength: '60', value: gemerkterName(), placeholder: 'damit man weiß, von wem die Meldung ist' });

  const formular = el(
    'form',
    {
      class: 'formular',
      onsubmit: (ereignis) => {
        ereignis.preventDefault();
        verarbeiteFormular(
          formular,
          {
            typ: 'termin',
            spiel: spiel.id,
            von: von.value.trim(),
            termin: `${datum.value}T${uhrzeit.value}`,
            platz: platz.value.trim() || null,
          },
          'termin',
          spiel,
        );
      },
    },
    feld('Datum', datum),
    feld('Uhrzeit', uhrzeit),
    feld('Platz (optional)', platz),
    platzliste,
    feld('Dein Name', von),
    el('p', { class: 'formular-fehler' }),
    meldeknopfzeile('Termin speichern'),
  );

  knoten.detailInhalt.replaceChildren(
    el('h2', { text: 'Termin eintragen' }),
    el('p', { class: 'formular-hinweis', text: `${seitenName(spiel.heim)} – ${seitenName(spiel.gast)} · ${spiel.rundeName}` }),
    formular,
  );
}

function ergebnisFormular(spiel) {
  const saetzeEingaben = [1, 2, 3].map((nr) => {
    const heim = el('input', { type: 'number', min: '0', max: '30', inputmode: 'numeric', 'aria-label': `Satz ${nr} ${seitenName(spiel.heim)}` });
    const gast = el('input', { type: 'number', min: '0', max: '30', inputmode: 'numeric', 'aria-label': `Satz ${nr} ${seitenName(spiel.gast)}` });
    return { heim, gast };
  });
  const notiz = el('input', { type: 'text', list: 'notizliste', maxlength: '60', placeholder: 'optional' });
  const notizliste = el(
    'datalist',
    { id: 'notizliste' },
    ['Match-Tiebreak', 'w.o.', 'Aufgabe'].map((n) => el('option', { value: n })),
  );
  const datum = el('input', { type: 'date', required: true, value: tagesSchluessel(new Date()) });
  const von = el('input', { type: 'text', required: true, maxlength: '60', value: gemerkterName(), placeholder: 'damit man weiß, von wem die Meldung ist' });
  const siegerHeim = el('input', { type: 'radio', name: 'sieger', value: 'heim', required: true });
  const siegerGast = el('input', { type: 'radio', name: 'sieger', value: 'gast', required: true });
  const vorschau = el('p', { class: 'formular-hinweis satz-hinweis', text: 'Sätze sind freiwillig — trägst du sie ein, wird der Sieger automatisch erkannt.' });

  function gelesenesSaetze() {
    const saetze = [];
    for (const { heim, gast } of saetzeEingaben) {
      if (heim.value === '' && gast.value === '') continue;
      if (heim.value === '' || gast.value === '') return null; // halb ausgefüllte Zeile
      saetze.push([Number(heim.value), Number(gast.value)]);
    }
    return saetze;
  }

  function aktualisiereSieger() {
    const saetze = gelesenesSaetze();
    const berechnet = saetze ? siegerAusSaetzen(saetze) : null;
    if (berechnet) {
      (berechnet === 'heim' ? siegerHeim : siegerGast).checked = true;
      vorschau.textContent = `Sieger laut Sätzen: ${seitenName(berechnet === 'heim' ? spiel.heim : spiel.gast)}`;
    } else {
      vorschau.textContent = 'Sätze sind freiwillig — trägst du sie ein, wird der Sieger automatisch erkannt.';
    }
  }
  for (const { heim, gast } of saetzeEingaben) {
    heim.addEventListener('input', aktualisiereSieger);
    gast.addEventListener('input', aktualisiereSieger);
  }

  /** Große, gut treffbare Zeile je Spieler — das ist die Hauptangabe. */
  function siegerZeile(knopf, seite) {
    return el('label', { class: 'sieger-zeile' }, knopf, el('span', { text: seitenName(seite) }));
  }

  const formular = el(
    'form',
    {
      class: 'formular',
      onsubmit: (ereignis) => {
        ereignis.preventDefault();
        const fehlerfeld = formular.querySelector('.formular-fehler');
        const saetze = gelesenesSaetze();
        if (saetze === null) {
          fehlerfeld.textContent = 'Eine Satz-Zeile ist nur halb ausgefüllt.';
          return;
        }
        const sieger = siegerHeim.checked ? 'heim' : 'gast';
        const berechnet = siegerAusSaetzen(saetze);
        if (berechnet && berechnet !== sieger && !notiz.value.trim()) {
          fehlerfeld.textContent = 'Der angehakte Sieger passt nicht zu den Sätzen.';
          return;
        }
        // Ohne Sätze halten wir fest, dass nur der Sieger bekannt ist
        const anmerkung = notiz.value.trim() || (saetze.length === 0 ? 'ohne Satzangabe' : '');
        verarbeiteFormular(
          formular,
          {
            typ: 'ergebnis',
            spiel: spiel.id,
            von: von.value.trim(),
            ergebnis: {
              datum: datum.value,
              saetze,
              sieger,
              ...(anmerkung ? { notiz: anmerkung } : {}),
            },
          },
          'ergebnis',
          spiel,
        );
      },
    },
    el('p', { class: 'feld-titel', text: 'Wer ist weiter?' }),
    el('div', { class: 'sieger-wahl' }, siegerZeile(siegerHeim, spiel.heim), siegerZeile(siegerGast, spiel.gast)),
    el('p', { class: 'feld-titel', text: 'Satzergebnis (optional)' }),
    el(
      'div',
      { class: 'saetze-gitter' },
      el('span', {}),
      el('span', { class: 'satz-kopf', text: 'Satz 1' }),
      el('span', { class: 'satz-kopf', text: 'Satz 2' }),
      el('span', { class: 'satz-kopf', text: '3. / MTB' }),
      el('span', { class: 'satz-name', text: seitenName(spiel.heim) }),
      saetzeEingaben.map(({ heim }) => heim),
      el('span', { class: 'satz-name', text: seitenName(spiel.gast) }),
      saetzeEingaben.map(({ gast }) => gast),
    ),
    vorschau,
    feld('Gespielt am', datum),
    feld('Anmerkung', notiz),
    notizliste,
    feld('Dein Name', von),
    el('p', { class: 'formular-fehler' }),
    meldeknopfzeile('Ergebnis melden'),
  );

  knoten.detailInhalt.replaceChildren(
    el('h2', { text: 'Ergebnis melden' }),
    el('p', { class: 'formular-hinweis', text: `${seitenName(spiel.heim)} – ${seitenName(spiel.gast)} · ${spiel.bewerbName}, ${spiel.rundeName}` }),
    formular,
  );
}

/* ---------------------------------------------------------------- Teilen -- */

/** Nachrichtentext zu einem Spiel — gedacht für die WhatsApp-Gruppe. */
export function teilenText(spiel, turnier = zustand.turnier) {
  const zeilen = [`🎾 ${turnier?.titel ?? 'Vereinsmeisterschaft'} · ${spiel.bewerbName}, ${spiel.rundeName}`];
  zeilen.push(`${seitenName(spiel.heim)} – ${seitenName(spiel.gast)}`);

  const termin = alsDatum(spiel.termin);
  const deadline = alsDatum(spiel.deadline);
  if (spiel.status === 'gespielt') {
    const satz = saetzeText(spiel);
    zeilen.push(`Sieger: ${spiel.sieger?.name}${satz ? ` (${satz})` : ''}`);
  } else if (termin) {
    zeilen.push(`📅 ${fmtTagLang.format(termin)}, ${fmtUhr.format(termin)} Uhr`);
  } else if (deadline) {
    zeilen.push(`📅 Termin offen — bis ${fmtTagLang.format(deadline)}`);
  } else {
    zeilen.push('📅 Termin noch offen');
  }
  if (spiel.platz && spiel.status !== 'gespielt') zeilen.push(`📍 ${spiel.platz}`);

  return zeilen.join('\n');
}

function seitenAdresse() {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Teilt das Spiel. Am Handy öffnet sich das übliche Teilen-Fenster (dort ist
 * WhatsApp dabei), sonst geht es direkt zu WhatsApp; klappt beides nicht,
 * landet der Text in der Zwischenablage.
 */
async function teileSpiel(spiel, knopf) {
  const text = teilenText(spiel);
  const adresse = seitenAdresse();
  const melde = (was) => {
    if (!knopf) return;
    const alt = knopf.textContent;
    knopf.textContent = was;
    setTimeout(() => { knopf.textContent = alt; }, 2500);
  };

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Vereinsmeisterschaft', text, url: adresse });
      return;
    } catch (fehler) {
      if (fehler?.name === 'AbortError') return; // abgebrochen ist kein Fehler
    }
  }

  const fenster = window.open(
    `https://wa.me/?text=${encodeURIComponent(`${text}\n\n${adresse}`)}`,
    '_blank',
    'noopener',
  );
  if (fenster) return;

  try {
    await navigator.clipboard.writeText(`${text}\n\n${adresse}`);
    melde('In die Zwischenablage kopiert');
  } catch {
    melde('Teilen hat nicht geklappt');
  }
}

/* ---------------------------------------------------------------- Detail -- */

function detailZeile(bezeichnung, wert) {
  if (!wert) return null;
  return el('div', { class: 'zeile' }, el('dt', { text: bezeichnung }), el('dd', { text: wert }));
}

function zeigeDetail(spiel) {
  zustand.detailSpiel = spiel;
  const termin = alsDatum(spiel.termin);
  const datum = alsDatum(spiel.datum);
  const deadline = alsDatum(spiel.deadline);

  const status = {
    gespielt: 'gespielt',
    spielbereit: termin ? 'angesetzt' : 'Termin noch zu vereinbaren',
    wartet: 'wartet auf die Vorrunde',
    freilos: 'Freilos — Aufstieg ohne Spiel',
  }[spiel.status];

  // Eintragen: für alle offen — Ergebnis, sobald das Spiel spielbereit ist,
  // Termin, solange noch kein Ergebnis feststeht.
  const aktionen = [];
  if (zustand.turnier.api) {
    if (spiel.status === 'spielbereit') {
      aktionen.push(el('button', { class: 'knopf-breit', type: 'button', text: 'Ergebnis melden', onclick: () => ergebnisFormular(spiel) }));
      aktionen.push(
        el('button', {
          class: 'knopf-breit zweitrangig',
          type: 'button',
          text: spiel.termin ? 'Termin ändern' : 'Termin eintragen',
          onclick: () => terminFormular(spiel),
        }),
      );
    } else if (spiel.status === 'gespielt') {
      aktionen.push(el('p', { class: 'formular-hinweis', text: 'Falsch eingetragen? Bitte kurz der Turnierleitung schreiben.' }));
    }
  } else if (spiel.status === 'spielbereit') {
    aktionen.push(el('p', { class: 'formular-hinweis', text: 'Online-Eintragen wird gerade eingerichtet — Ergebnis bitte an die Turnierleitung melden.' }));
  }

  // Teilen: Paarung, Termin und Platz als Nachricht — für die WhatsApp-Gruppe
  if (spiel.heim.bekannt && spiel.gast.bekannt && !spiel.heim.freilos && !spiel.gast.freilos) {
    const teilen = el(
      'button',
      { class: 'knopf-breit zweitrangig', type: 'button', onclick: () => teileSpiel(spiel, teilen) },
      symbol(SYMBOLE.teilen),
      el('span', { text: 'Spiel teilen' }),
    );
    aktionen.push(teilen);
  }

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
    ...aktionen,
  );
  if (!knoten.detail.open) knoten.detail.showModal();
}

/* ------------------------------------------------------------- Steuerung -- */

function zeichne() {
  if (!zustand.turnier) return;

  const teile = zustand.ansicht === 'naechste' ? ansichtNaechste() : ansichtBewerb(zustand.ansicht);

  const band = zustand.turnier.demo
    ? el('p', { class: 'demo-band', text: 'Demo-Daten — noch keine echten Nennungen eingetragen' })
    : null;
  // Freitext aus der Turnierdatei — Platz für Ansagen der Turnierleitung
  const hinweis = zustand.turnier.hinweis && zustand.ansicht === 'naechste'
    ? el('p', { class: 'hinweis-band', text: zustand.turnier.hinweis })
    : null;

  knoten.inhalt.replaceChildren(...[band, hinweis, ...teile].filter(Boolean));
  zeichneTabs();
  window.scrollTo({ top: 0 });
}

const SYMBOLE = {
  kalender: 'M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  raster: 'M3 5h6v4H3zM3 15h6v4H3zM13 10h6v4h-6zM9 7h2v5h2M9 17h2v-5',
  teilen: 'M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .17 1L8.7 8.51a3 3 0 1 0 0 6.98l6.47 3.51A3 3 0 1 0 18 16a3 3 0 0 0-2.3 1.07L9.3 13.5a3 3 0 0 0 0-3l6.4-3.57A3 3 0 0 0 18 8Z',
};

function symbol(pfad) {
  const NS = 'http://www.w3.org/2000/svg';
  const bild = document.createElementNS(NS, 'svg');
  bild.setAttribute('viewBox', '0 0 24 24');
  bild.setAttribute('aria-hidden', 'true');
  const linie = document.createElementNS(NS, 'path');
  linie.setAttribute('d', pfad);
  linie.setAttribute('fill', 'none');
  linie.setAttribute('stroke', 'currentColor');
  linie.setAttribute('stroke-width', '1.8');
  linie.setAttribute('stroke-linecap', 'round');
  linie.setAttribute('stroke-linejoin', 'round');
  bild.append(linie);
  return bild;
}

/** Tableiste: Startseite plus ein Tab je freigeschaltetem Bewerb. */
function zeichneTabs() {
  const eintraege = [
    { id: 'naechste', name: 'Nächste Spiele', symbol: SYMBOLE.kalender },
    ...sichtbareBewerbe().map((bewerb) => ({ id: bewerb.id, name: bewerb.name, symbol: SYMBOLE.raster })),
  ];
  knoten.tableiste.replaceChildren(
    ...eintraege.map((eintrag) =>
      el(
        'button',
        {
          class: 'tab',
          type: 'button',
          'aria-current': zustand.ansicht === eintrag.id ? 'page' : 'false',
          onclick: () => {
            zustand.ansicht = eintrag.id;
            schreibeAdresse();
            zeichne();
          },
        },
        symbol(eintrag.symbol),
        el('span', { text: eintrag.name }),
      ),
    ),
  );
}

function zeigeStand() {
  const stand = alsDatum(zustand.turnier?.stand);
  // Nur freigeschaltete Bewerbe zaehlen — versteckte gibt es fuer Besucher nicht
  const anzahl = gefilterteSpiele().length;
  knoten.stand.textContent = stand
    ? `Stand: ${fmtStand.format(stand)} Uhr · ${anzahl} Spiele im Raster`
    : `${anzahl} Spiele im Raster`;
}

function lesAdresse() {
  const [teil1, teil2] = window.location.hash.replace('#', '').split('/');
  const bekannt = (id) => sichtbareBewerbe().some((bewerb) => bewerb.id === id);
  if (teil1 === 'raster' && bekannt(teil2)) zustand.ansicht = teil2; // alter Link
  else if (bekannt(teil1)) zustand.ansicht = teil1;
  else zustand.ansicht = 'naechste';
}

function schreibeAdresse() {
  const ziel = `#${zustand.ansicht}`;
  if (window.location.hash !== ziel) window.history.replaceState(null, '', ziel);
}

function uebernimm(roh) {
  zustand.turnier = bereiteTurnierAuf(roh);
  zustand.geladen = Date.now();
  document.title = `${roh.verein} — ${roh.titel}`;
  zeigeStand();
  lesAdresse(); // erst mit geladenen Daten ist klar, welche Bewerbe es gibt
  zeichne();
}

/**
 * Frische Daten direkt von der Melde-API (umgeht den Pages-Rebuild von ~1 min).
 * Läuft nach dem normalen Laden im Hintergrund; bei Fehlern bleibt einfach
 * der Stand aus der statischen Datei.
 */
async function holeFrischeDaten() {
  const api = zustand.turnier?.api;
  if (!api) return;
  try {
    const antwort = await fetch(`${api}?daten=1`, { redirect: 'follow' });
    if (!antwort.ok) return;
    const frisch = await antwort.json();
    if (frisch?.bewerbe && frisch.stand !== zustand.turnier.stand) uebernimm(frisch);
  } catch {
    /* offline oder API kalt — macht nichts */
  }
}

async function laden({ still = false } = {}) {
  if (!still) knoten.aktualisieren.classList.add('laeuft');
  try {
    uebernimm(await ladeTurnier());
    holeFrischeDaten();
  } catch (fehler) {
    knoten.inhalt.replaceChildren(
      el(
        'div',
        { class: 'fehler' },
        el('p', { text: 'Der Spielplan konnte nicht geladen werden.' }),
        el('p', { text: String(fehler.message ?? fehler) }),
        el('button', { class: 'knopf-breit', type: 'button', text: 'Nochmal versuchen', onclick: () => laden() }),
        // Haeufigster Fall: der Browser haelt noch eine alte Fassung der Seite
        el('button', {
          class: 'knopf-breit zweitrangig',
          type: 'button',
          text: 'Seite neu laden',
          onclick: () => window.location.reload(),
        }),
      ),
    );
  } finally {
    knoten.aktualisieren.classList.remove('laeuft');
  }
}

knoten.aktualisieren.addEventListener('click', () => laden());

window.addEventListener('hashchange', () => {
  lesAdresse();
  zeichne();
});

// Handy war in der Tasche: beim Zurückkommen stillschweigend nachladen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - zustand.geladen > 60_000) laden({ still: true });
});

laden();
