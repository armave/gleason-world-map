import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildFlightCalibrationRoutePredicate,
  summarizeRouteIdentifierMismatches
} from '../scripts/flight-calibration-route-predicate.mjs';

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
    ['NZCH', 'NZIR', 'train'], // Christchurch–McMurdo (AAD)
    ['SCCI', 'SCRM', 'holdout'],
    ['NZCH', 'NZWD', 'holdout'],
    ['SCCI', 'SAWB', 'holdout'],
    ['NZCH', 'NZWD', 'holdout'],
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
  assert.match(collectorSource, /routeKey\(observedFrom, observedTo\) !== expectedRouteKey/);
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


test('documented Antarctic airframes are queried directly while retaining route split checks', () => {
  const routePairs = new Map(calibrationRoutes().map(route => [
    pairKey(route.from, route.to), route
  ]));
  assert.equal(routePairs.get(pairKey('SCCI', 'SCGC'))?.split, 'train');
  assert.equal(routePairs.get(pairKey('SCCI', 'SCRM'))?.split, 'holdout');
  assert.equal(routePairs.get(pairKey('NZCH', 'NZWD'))?.split, 'holdout');
  assert.ok(collectorSource.includes("from: 'SCCI', to: 'SCGC', split: 'train', icao24: ['4cc269']"));
  assert.ok(collectorSource.includes("from: 'SCCI', to: 'SCRM', split: 'holdout', icao24: ['e803cc', 'e803c5']"));
  assert.ok(collectorSource.includes("from: 'NZCH', to: 'NZWD', split: 'holdout', icao24: ['ae4d6a']"));
  assert.ok(collectorSource.includes("from: 'NZCH', to: 'NZIR', split: 'train', icao24: ['ae4d6a']"));
  assert.doesNotMatch(collectorSource, /to: 'NZFX'/);

  const geometryA = { type: 'Circle', coordinates: [-70.85, -53.0], radius: 20000 };
  const geometryB = { type: 'Circle', coordinates: [-58.9866, -62.1908], radius: 20000 };
  const predicate = buildFlightCalibrationRoutePredicate(
    { from: 'SCCI', to: 'SCRM', icao24: ['E803CC', 'E803C5', 'e803cc'] },
    geometryA, geometryB
  );
  assert.deepEqual(predicate, {
    and: [
      { icao24: ['e803cc', 'e803c5'] },
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
    ]
  });
  assert.ok(collectorSource.includes('routeKey(observedFrom, observedTo) !== expectedRouteKey'));
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


test('aircraft discovery combines Mode-S identity with endpoint geometry in the source query', () => {
  const a = { type: 'Circle', coordinates: [-70, -53], radius: 20000 };
  const b = { type: 'Circle', coordinates: [-68, -67], radius: 20000 };
  const predicate = buildFlightCalibrationRoutePredicate(
    { from: 'SCCI', to: 'EGAR', icao24: ['43BE5B'] }, a, b
  );
  assert.deepEqual(predicate, {
    and: [
      { icao24: ['43be5b'] },
      {
        or: [
          {
            and: [
              { endpoint_within: { mode: 'start', geometry: a } },
              { endpoint_within: { mode: 'end', geometry: b } }
            ]
          },
          {
            and: [
              { endpoint_within: { mode: 'start', geometry: b } },
              { endpoint_within: { mode: 'end', geometry: a } }
            ]
          }
        ]
      }
    ]
  });
});
