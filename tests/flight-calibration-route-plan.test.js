import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const collectorSource = await readFile(
  new URL('../scripts/collect-flight-calibration.mjs', import.meta.url),
  'utf8'
);

function calibrationRoutes() {
  const routes = [];
  const pattern = /\{\s*from:\s*'([A-Z0-9]+)'\s*,\s*to:\s*'([A-Z0-9]+)'\s*,\s*split:\s*'(train|holdout)'\s*\}/g;
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
  assert.match(workflow, /cron:\s*'15 3 1 \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /timeout-minutes:\s*120/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
  assert.doesNotMatch(workflow, /package\.json/);
  assert.doesNotMatch(workflow, /\.github\/workflows\/collect-flight-calibration\.yml/);
});
