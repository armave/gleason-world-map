import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANISOTROPIC_PLANAR_SAMPLE_COUNT,
  DEFAULT_TANGENTIAL_SCALE_C1,
  DEFAULT_TANGENTIAL_SCALE_C2,
  integrateAnisotropicPlanarSegment,
  tangentialScaleAtRadius
} from '../src/core/anisotropic-planar-metric.js';
import {
  EQUATOR_RADIUS_KM,
  DISK_RADIUS_KM,
  project
} from '../src/core/flat-disk.js';

const close = (actual, expected, tolerance, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    message || `${actual} != ${expected}`);

// Benchmark-tuned candidate for the feasible first five routes; the active seed remains 0.08/0.20.
const benchmarkMetric = Object.freeze({ c1: 0.78081279, c2: 1.0 });
const pointKm = (latitude, longitude) =>
  project(longitude, latitude, DISK_RADIUS_KM);

function radialVariationLowerBound(start, end) {
  const dx = (end[0] - start[0]) / ANISOTROPIC_PLANAR_SAMPLE_COUNT;
  const dy = (end[1] - start[1]) / ANISOTROPIC_PLANAR_SAMPLE_COUNT;
  let variation = 0;
  for (let index = 0; index < ANISOTROPIC_PLANAR_SAMPLE_COUNT; index++) {
    const x = start[0] + (index + 0.5) * dx;
    const y = start[1] + (index + 0.5) * dy;
    const radius = Math.hypot(x, y);
    const dr = radius > 1e-12 ? (x * dx + y * dy) / radius : dx;
    variation += Math.abs(dr);
  }
  return variation;
}

test('the canonical metric uses exactly 64 planar midpoint samples', () => {
  assert.equal(ANISOTROPIC_PLANAR_SAMPLE_COUNT, 64);
  const actual = integrateAnisotropicPlanarSegment([100, 0], [0, 100], {
    equatorRadius: 100,
    c1: 0,
    c2: 0
  });
  close(actual, Math.hypot(100, 100), 1e-10);
});

test('default coefficients retain the requested weight near the 35°S radius', () => {
  close(EQUATOR_RADIUS_KM, 8945.06, 0.1);
  close(tangentialScaleAtRadius(0, EQUATOR_RADIUS_KM), 1, 1e-12);
  const weight = tangentialScaleAtRadius(
    12865, EQUATOR_RADIUS_KM,
    DEFAULT_TANGENTIAL_SCALE_C1, DEFAULT_TANGENTIAL_SCALE_C2
  );
  assert.ok(weight >= 0.47 && weight <= 0.50,
    `expected w(12865 km) in [0.47, 0.50], got ${weight}`);
});

test('radial-only segments retain exact North–South distance', () => {
  const first = [3000, 4000];
  const second = [9000, 12000];
  const distance = integrateAnisotropicPlanarSegment(first, second, {
    equatorRadius: EQUATOR_RADIUS_KM,
    c1: 2.5,
    c2: 2.5
  });
  close(distance, Math.hypot(second[0] - first[0], second[1] - first[1]), 1e-9);
});

test('anisotropic planar segment integration is symmetric and contracts only tangential travel', () => {
  const a = [8000, -2500], b = [-4000, 9000];
  const forward = integrateAnisotropicPlanarSegment(a, b, {
    equatorRadius: EQUATOR_RADIUS_KM, ...benchmarkMetric
  });
  const reverse = integrateAnisotropicPlanarSegment(b, a, {
    equatorRadius: EQUATOR_RADIUS_KM, ...benchmarkMetric
  });
  assert.ok(forward > 0);
  close(forward, reverse, 1e-9);
  const unweighted = integrateAnisotropicPlanarSegment(a, b, {
    equatorRadius: EQUATOR_RADIUS_KM, c1: 0, c2: 0
  });
  assert.ok(forward <= unweighted);
});

const benchmarkRoutes = [
  {
    name: 'Ottawa–Reykjavik',
    a: [45.42, -75.70], b: [64.15, -21.95], observedKm: 3335
  },
  {
    name: 'Bogotá–Reykjavik',
    a: [4.71, -74.07], b: [64.15, -21.95], observedKm: 7714
  },
  {
    name: 'Brasília–Reykjavik',
    a: [-15.79, -47.88], b: [64.15, -21.95], observedKm: 9163
  },
  {
    name: 'Santiago–Madrid',
    a: [-33.45, -70.67], b: [40.40, -3.68], observedKm: 10705
  },
  {
    name: 'Brasília–Luanda',
    a: [-15.79, -47.88], b: [-8.83, 13.22], observedKm: 6650
  }
];

for (const route of benchmarkRoutes.slice(0, 3)) {
  test(`default metric seed preserves the radial/northern benchmark for ${route.name}`, () => {
    const start = pointKm(...route.a);
    const end = pointKm(...route.b);
    const predictedKm = integrateAnisotropicPlanarSegment(start, end, {
      equatorRadius: EQUATOR_RADIUS_KM,
      c1: DEFAULT_TANGENTIAL_SCALE_C1,
      c2: DEFAULT_TANGENTIAL_SCALE_C2
    });
    const errorPercent = (predictedKm / route.observedKm - 1) * 100;
    assert.ok(Math.abs(errorPercent) <= 5,
      `${route.name}: ${predictedKm.toFixed(1)} km vs ${route.observedKm} km (${errorPercent.toFixed(2)}%)`);
  });
}

for (const route of benchmarkRoutes) {
  test(`benchmark-tuned coefficients remain within ±5% for ${route.name}`, () => {
    const start = pointKm(...route.a);
    const end = pointKm(...route.b);
    const predictedKm = integrateAnisotropicPlanarSegment(start, end, {
      equatorRadius: EQUATOR_RADIUS_KM,
      ...benchmarkMetric
    });
    const errorPercent = (predictedKm / route.observedKm - 1) * 100;
    assert.ok(Math.abs(errorPercent) <= 5,
      `${route.name}: ${predictedKm.toFixed(1)} km vs ${route.observedKm} km (${errorPercent.toFixed(2)}%)`);
  });
}

test('Santiago–Canberra exposes the radial lower bound that prevents a ±5% fit under this metric', () => {
  const start = pointKm(-33.45, -70.67);
  const end = pointKm(-35.27, 149.13);
  const minimumPossibleKm = radialVariationLowerBound(start, end);
  const actualKm = integrateAnisotropicPlanarSegment(start, end, {
    equatorRadius: EQUATOR_RADIUS_KM,
    ...benchmarkMetric
  });
  const observedKm = 11340;
  assert.ok(minimumPossibleKm > observedKm * 1.05,
    `radial lower bound ${minimumPossibleKm.toFixed(1)} km must exceed the +5% ceiling`);
  assert.ok(actualKm >= minimumPossibleKm - 1e-8);
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:js|mjs|cjs|ts)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('source code defines or imports no spherical/geodesic distance routines', async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const paths = [
    ...await sourceFiles(join(root, 'src')),
    ...await sourceFiles(join(root, 'scripts')),
    ...await sourceFiles(join(root, 'tests'))
  ];
  const names = [
    ['haver', 'sine'].join(''),
    ['vin', 'centy'].join(''),
    ['great', 'Circle', 'Distance'].join(''),
    ['geodesic', 'Distance'].join(''),
    ['spherical', 'Distance'].join(''),
    ['ellipsoid', 'Distance'].join('')
  ];
  const declarationOrImportFor = name => new RegExp(
    `(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=|export\\s*\\{[^}]*\\b${name}\\b|import\\s+[^;]*\\b${name}\\b)`
  );
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    for (const name of names) {
      assert.doesNotMatch(source, declarationOrImportFor(name),
        `${path} must not define or export ${name}`);
    }
  }
});
