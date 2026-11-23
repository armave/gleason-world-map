import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildFlightCalibrationRoutePredicate,
  summarizeRouteIdentifierMismatches
} from '../scripts/flight-calibration-route-predicate.mjs';
import {
  ANTARCTIC_AIRPORT_METADATA_FALLBACKS,
  resolveCalibrationAirport,
  canCollectCalibrationRoute,
  routeHasAircraftDiscovery,
  airportIdentifiers,
  matchesAirportPairIdentifiers,
  shouldDeferSummaryAirportPairCheck
} from '../scripts/flight-calibration-airport-metadata.mjs';

const collectorSource = await readFile(
  new URL('../scripts/collect-flight-calibration.mjs', import.meta.url),
  'utf8'
);

function calibrationRoutes() {
  const routes = [];
  const pattern = /\{\s*from:\s*'([A-Z0-9]+)'\s*,\s*to:\s*'([A-Z0-9]+)'\s*,\s*split:\s*'(train|holdout)'(?:\s*,[^}]*)?\s*\}/g;
  for (const match of collectorSource.matchAll(pattern)) {
    routes.push({ from: match[1], to: match[2], split: match[3] });
  }
  return routes;
}

const pairKey = (from, to) => [from, to].sort().join('--');

test('remote Antarctic route metadata fallbacks allow aircraft discovery without airport-index records', () => {
  const indexed = new Map();
  const rothera = resolveCalibrationAirport('EGAR', indexed);
  const unionGlacier = resolveCalibrationAirport('SCGC', indexed);
  const williamsField = resolveCalibrationAirport('NZWD', indexed);
  const marambio = resolveCalibrationAirport('SAWB', indexed);
  const marsh = resolveCalibrationAirport('SCRM', indexed);
  const wilkins = resolveCalibrationAirport('YWKS', indexed);

  assert.equal(rothera.lat, -67.568889);
  assert.equal(rothera.lon, -68.1248);
  assert.equal(unionGlacier.lat, -79.767183);
  assert.equal(williamsField.lat, -77.867401);
  assert.equal(marambio.lat, -64.238297);
  assert.equal(marsh.lat, -62.190833);
  assert.equal(wilkins.lat, -66.6908);
  for (const airport of [rothera, unionGlacier, williamsField, marambio, marsh, wilkins]) {
    assert.equal(airport.metadataSource, 'published coordinate fallback');
    assert.match(airport.coordinateSource, /^https:\/\//);
    assert.ok(Number.isFinite(airport.lon));
  }

  assert.equal(
    resolveCalibrationAirport('EGAR', new Map([['EGAR', {
      ident: 'EGAR', lat: -67.57, lon: -68.13, airspaces: []
    }]])).metadataSource,
    'adsb.aero airport index'
  );
  assert.equal(ANTARCTIC_AIRPORT_METADATA_FALLBACKS.NZIR.ident, 'NZIR');
});

test('aircraft-only route collection does not require both endpoint index records', () => {
  const route = { from: 'SCCI', to: 'EGAR', split: 'train', icao24: ['43be5b'] };
  assert.equal(routeHasAircraftDiscovery(route), true);
  assert.equal(canCollectCalibrationRoute(route, null, null), true);
  assert.equal(canCollectCalibrationRoute(route, { ident: 'SCCI' }, null), true);
  assert.equal(canCollectCalibrationRoute({ from: 'SCCI', to: 'EGAR' }, null, null), false);
  assert.ok(collectorSource.includes('if (!canCollectCalibrationRoute(route, airportA, airportB))'));
  assert.ok(collectorSource.includes('deriveAirportFromObservedEndpoints(route, observations, route.from)'));
  assert.ok(collectorSource.includes('median of exact-match ADS-B flight endpoint coordinates'));
  assert.ok(collectorSource.includes('matchesAirportPairIdentifiers(airportA, airportB, detailFrom, detailTo)'));
  assert.ok(collectorSource.includes('detailRouteIdentifierMismatch'));
  assert.ok(collectorSource.includes('shouldDeferSummaryAirportPairCheck(route, observedFrom, observedTo)'));
  assert.ok(collectorSource.includes('summaryAirportPairDeferred'));
});

test('flight route identity accepts exact ICAO or published IATA airport aliases', () => {
  const puntaArenas = { ident: 'SCCI', iataCode: 'PUQ' };
  const unionGlacier = resolveCalibrationAirport('SCGC', new Map());
  const kingGeorge = { ident: 'SCRM', iataCode: 'TNM' };
  const rioGallegos = { ident: 'SAWG', iataCode: 'RGL' };
  const marambio = resolveCalibrationAirport('SAWB', new Map());

  assert.ok(airportIdentifiers(unionGlacier).has('SCGC'));
  assert.ok(airportIdentifiers(unionGlacier).has('UGL'));
  assert.ok(matchesAirportPairIdentifiers(puntaArenas, unionGlacier, 'PUQ', 'UGL'));
  assert.ok(matchesAirportPairIdentifiers(puntaArenas, unionGlacier, 'SCGC', 'SCCI'));
  assert.ok(matchesAirportPairIdentifiers(puntaArenas, kingGeorge, 'TNM', 'PUQ'));
  assert.ok(matchesAirportPairIdentifiers(rioGallegos, marambio, 'QAB', 'RGL'));
  assert.equal(matchesAirportPairIdentifiers(puntaArenas, unionGlacier, 'BIKF', 'KDEN'), false);
});

test('aircraft summaries with missing airport IDs defer only to the full detail check', () => {
  const aircraftRoute = {
    from: 'SCCI', to: 'SCGC', split: 'train', icao24: ['4cc269', '058082']
  };
  const ordinaryRoute = { from: 'SCCI', to: 'SCGC', split: 'train' };
  assert.equal(shouldDeferSummaryAirportPairCheck(aircraftRoute, null, 'UGL'), true);
  assert.equal(shouldDeferSummaryAirportPairCheck(aircraftRoute, 'PUQ', null), true);
  assert.equal(shouldDeferSummaryAirportPairCheck(aircraftRoute, 'PUQ', 'UGL'), false);
  assert.equal(shouldDeferSummaryAirportPairCheck(ordinaryRoute, null, 'UGL'), false);
});

test('McMurdo runway aliases are not split between training and holdout', () => {
  const keys = calibrationRoutes().map(route => pairKey(route.from, route.to));
  assert.ok(keys.includes(pairKey('NZCH', 'NZWD')));
  assert.ok(!keys.includes(pairKey('NZCH', 'NZIR')));
});


test('Marambio holdout uses a verified Rio Gallegos–Marambio KC-130H airbridge', () => {
  const route = calibrationRoutes().find(item =>
    pairKey(item.from, item.to) === pairKey('SAWG', 'SAWB')
  );
  assert.ok(route);
  assert.equal(route.split, 'holdout');
  assert.ok(collectorSource.includes("from: 'SAWG', to: 'SAWB', split: 'holdout', icao24: ['e20022']"));
  assert.doesNotMatch(collectorSource, /from: 'SCCI', to: 'SAWB'/);
});

test('collector assigns each unordered airport pair to exactly one split', () => {
  const routes = calibrationRoutes();
  assert.ok(routes.length >= 90, 'expected the broad calibration route plan');
  const seen = new Map();
  for (const route of routes) {
    assert.ok(['train', 'holdout'].includes(route.split));
    const key = pairKey(route.from, route.to);
    assert.ok(
      !seen.has(key),
      'duplicate airport pair ' + key + ' appears in both or multiple calibration entries'
    );
    seen.set(key, route.split);
  }
});

test('deep-southern training and holdout pairs cover documented Antarctic air bridges', () => {
  const routes = new Map(calibrationRoutes().map(route => [
    pairKey(route.from, route.to), route.split
  ]));
  const required = [
    ['SCCI', 'EGAR', 'train'], // Punta Arenas–Rothera (BAS)
    ['SCCI', 'SCGC', 'train'], // Punta Arenas–Union Glacier (ALE)
    ['SCEL', 'SCCI', 'train'],
    ['SAEZ', 'SAWH', 'train'],
    ['SABE', 'SAWH', 'train'],
    ['SAWG', 'SABE', 'holdout'],
    ['SCCI', 'SCBA', 'holdout'],
    ['SCCI', 'SCRM', 'holdout'],
    ['NZCH', 'NZWD', 'holdout'],
    ['SAWG', 'SAWB', 'holdout'],
    ['YMHB', 'YWKS', 'holdout'] // Future scheduled Hobart–Wilkins candidate
  ];

  for (const [from, to, expectedSplit] of required) {
    assert.equal(
      routes.get(pairKey(from, to)),
      expectedSplit,
      pairKey(from, to) + ' must remain assigned to ' + expectedSplit
    );
  }
});

test('the Antarctic route plan keeps whole airport pairs out of both splits', () => {
  const routes = calibrationRoutes();
  const training = new Set(routes.filter(route => route.split === 'train').map(route =>
    pairKey(route.from, route.to)
  ));
  const holdout = new Set(routes.filter(route => route.split === 'holdout').map(route =>
    pairKey(route.from, route.to)
  ));
  const overlaps = [...training].filter(key => holdout.has(key));
  assert.deepEqual(overlaps, []);
});


test('telemetry archive refresh is monthly, main-only on push, and manually dispatchable', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/collect-flight-calibration.yml', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /scripts\/flight-calibration-route-predicate\.mjs/);
  assert.match(workflow, /cron:\s*'15 3 1 \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /timeout-minutes:\s*120/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
  assert.doesNotMatch(workflow, /package\.json/);
  assert.doesNotMatch(workflow, /\.github\/workflows\/collect-flight-calibration\.yml/);
});

test('the BAS Rothera route can query a known aircraft when endpoint geometry finds no flights', () => {
  assert.match(
    collectorSource,
    /from: 'SCCI', to: 'EGAR', split: 'train', icao24: \['43be5b'\]/
  );

  const predicate = buildFlightCalibrationRoutePredicate(
    { from: 'SCCI', to: 'EGAR', icao24: ['43BE5B', '43be5b'] },
    { type: 'Circle', coordinates: [-70.85, -53.0], radius: 20000 },
    { type: 'Circle', coordinates: [-68.13, -67.57], radius: 20000 }
  );
  assert.deepEqual(predicate, { icao24: ['43be5b'] });

  // Broad aircraft discovery does not relax the airport-pair split or route
  // identity check: each selected flight must still name this exact pair.
  assert.match(collectorSource, /matchesAirportPairIdentifiers\(airportA, airportB, observedFrom, observedTo\)/);
  assert.match(collectorSource, /queryMode: Array\.isArray\(result\.route\.icao24\)/);
});

test('ordinary calibration routes keep using the airport endpoint geometry predicate', () => {
  const geometryA = { type: 'Circle', coordinates: [-70.85, -53.0], radius: 20000 };
  const geometryB = { type: 'Circle', coordinates: [-68.13, -67.57], radius: 20000 };
  assert.deepEqual(
    buildFlightCalibrationRoutePredicate({ from: 'SCCI', to: 'EGAR' }, geometryA, geometryB),
    {
      or: [
        {
          and: [
            { endpoint_within: { mode: 'start', geometry: geometryA } },
            { endpoint_within: { mode: 'end', geometry: geometryB } }
          ]
        },
        {
          and: [
            { endpoint_within: { mode: 'start', geometry: geometryB } },
            { endpoint_within: { mode: 'end', geometry: geometryA } }
          ]
        }
      ]
    }
  );
});


test('scheduled Southern South America routes provide distinct train and holdout pairs', () => {
  const routes = new Map(calibrationRoutes().map(route => [
    pairKey(route.from, route.to), route
  ]));
  assert.equal(routes.get(pairKey('SCEL', 'SCCI'))?.split, 'train');
  assert.equal(routes.get(pairKey('SAEZ', 'SAWH'))?.split, 'train');
  assert.equal(routes.get(pairKey('SABE', 'SAWH'))?.split, 'train');
  assert.equal(routes.get(pairKey('SAWG', 'SABE'))?.split, 'holdout');
  assert.equal(routes.get(pairKey('SCCI', 'SCBA'))?.split, 'holdout');

  assert.ok(collectorSource.includes("from: 'SCEL', to: 'SCCI', split: 'train', icao24: ['e80446', 'e80496', 'e80442', 'e8041e']"));
  assert.ok(collectorSource.includes("from: 'SAWH', to: 'SAEZ', split: 'train', icao24: ['e0b254', 'e0b255', 'e082d7', 'e07191']"));
  assert.ok(collectorSource.includes("from: 'SABE', to: 'SAWH', split: 'train', icao24: ['e0b254', 'e0b255', 'e082d7', 'e07191']"));
  assert.ok(collectorSource.includes("from: 'SAWG', to: 'SABE', split: 'holdout', icao24: ['e06443', 'e0b244', 'e07543']"));
  assert.ok(collectorSource.includes("from: 'SCCI', to: 'SCBA', split: 'holdout', icao24: ['e803cf', 'e803cc']"));
});

test('documented Antarctic airframes are queried directly while retaining route split checks', () => {
  const routePairs = new Map(calibrationRoutes().map(route => [
    pairKey(route.from, route.to), route
  ]));
  assert.equal(routePairs.get(pairKey('SCCI', 'SCGC'))?.split, 'train');
  assert.equal(routePairs.get(pairKey('SCCI', 'SCRM'))?.split, 'holdout');
  assert.equal(routePairs.get(pairKey('NZCH', 'NZWD'))?.split, 'holdout');
  assert.ok(collectorSource.includes("from: 'SCCI', to: 'SCGC', split: 'train', icao24: ['4cc269', '058082']"));
  assert.ok(collectorSource.includes("from: 'SCCI', to: 'SCRM', split: 'holdout', icao24: ['e803cc', 'e803c5']"));
  assert.ok(collectorSource.includes("from: 'NZCH', to: 'NZWD', split: 'holdout', icao24: ['ae4d6a']"));
  assert.ok(collectorSource.includes("from: 'SAWG', to: 'SAWB', split: 'holdout', icao24: ['e20022']"));
  assert.equal(routePairs.get(pairKey('SAWG', 'SAWB'))?.split, 'holdout');
  assert.doesNotMatch(collectorSource, /to: 'NZFX'/);

  const geometryA = { type: 'Circle', coordinates: [-70.85, -53.0], radius: 20000 };
  const geometryB = { type: 'Circle', coordinates: [-58.9866, -62.1908], radius: 20000 };
  const predicate = buildFlightCalibrationRoutePredicate(
    { from: 'SCCI', to: 'SCRM', icao24: ['E803CC', 'E803C5', 'e803cc'] },
    geometryA, geometryB
  );
  assert.deepEqual(predicate, { icao24: ['e803cc', 'e803c5'] });
  assert.ok(collectorSource.includes('matchesAirportPairIdentifiers(airportA, airportB, observedFrom, observedTo)'));
});


test('route mismatch diagnostics preserve actual returned airport pairs without accepting them', () => {
  const diagnostics = summarizeRouteIdentifierMismatches([
    { from: 'SCCI', to: 'EGAR' },
    { from: 'EGAR', to: 'SCCI' },
    { from: 'SCCI', to: 'SCGC' },
    { from: 'SCGC', to: 'SCCI' },
    { from: 'SCCI', to: 'SCGC' },
    { from: null, to: 'EGAR' }
  ]);
  assert.deepEqual(diagnostics, [
    {
      routeId: 'SCCI--SCGC',
      count: 3,
      directions: [
        { direction: 'SCCI>SCGC', count: 2 },
        { direction: 'SCGC>SCCI', count: 1 }
      ]
    },
    {
      routeId: 'EGAR--SCCI',
      count: 2,
      directions: [
        { direction: 'EGAR>SCCI', count: 1 },
        { direction: 'SCCI>EGAR', count: 1 }
      ]
    }
  ]);
  assert.deepEqual(summarizeRouteIdentifierMismatches([]), []);
});


test('aircraft discovery uses Mode-S only and exact airport identifiers are a post-query gate', () => {
  const a = { type: 'Circle', coordinates: [-70, -53], radius: 20000 };
  const b = { type: 'Circle', coordinates: [-68, -67], radius: 20000 };
  const predicate = buildFlightCalibrationRoutePredicate(
    { from: 'SCCI', to: 'EGAR', icao24: ['43BE5B', '43be5b'] }, a, b
  );
  assert.deepEqual(predicate, { icao24: ['43be5b'] });

  // The collector—not the query—enforces the exact airport-pair split.
  assert.ok(collectorSource.includes('matchesAirportPairIdentifiers(airportA, airportB, observedFrom, observedTo)'));
  assert.ok(collectorSource.includes('routeIdentifierMismatches.push'));
});
