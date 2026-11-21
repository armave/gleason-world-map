import test from 'node:test';
import assert from 'node:assert/strict';
import { geodesicDistanceMeters, geodesicLinePath } from '../src/core/geodesic.js';
import { project, unproject } from '../src/core/flat-disk.js';

const point = (lat, lon) => ({ lat, lon });
const close = (actual, expected, tolerance, message = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    message || `${actual} is not within ${tolerance} of ${expected}`);

const flightBenchmarks = [
  {
    route: 'SCL–SYD',
    first: point(-33.3929, -70.7858),
    second: point(-33.9461, 151.1772),
    publicGreatCircleKm: 11341,
    recordedFlightKm: [11489, 11953]
  },
  {
    route: 'LHR–SIN',
    first: point(51.47, -0.4543),
    second: point(1.3644, 103.9915),
    publicGreatCircleKm: 10882,
    recordedFlightKm: [11261, 11853]
  },
  {
    route: 'ORD–HKG',
    first: point(41.9742, -87.9073),
    second: point(22.308, 113.9185),
    publicGreatCircleKm: 12522,
    recordedFlightKm: [12836, 12933]
  },
  {
    route: 'HEL–NRT',
    first: point(60.3172, 24.9633),
    second: point(35.772, 140.3929),
    publicGreatCircleKm: 7828,
    recordedFlightKm: [10992, 12088]
  },
  {
    route: 'JFK–SIN',
    first: point(40.6413, -73.7781),
    second: point(1.3644, 103.9915),
    publicGreatCircleKm: 15339,
    recordedFlightKm: [16821, 17057]
  }
];

test('WGS84 direct distances agree with southern-to-northern flight benchmarks', () => {
  for (const route of flightBenchmarks) {
    const actualKm = geodesicDistanceMeters(route.first, route.second) / 1000;
    const toleranceKm = route.publicGreatCircleKm * 0.0035;
    close(actualKm, route.publicGreatCircleKm, toleranceKm,
      `${route.route}: ${actualKm.toFixed(1)} km vs public great-circle ${route.publicGreatCircleKm} km`);
    assert.ok(actualKm < route.recordedFlightKm[0],
      `${route.route}: direct geodesic should be shorter than recorded aircraft tracks`);
  }
});

test('Santiago–Sydney corrects the disk chord by more than 14,000 km', () => {
  const first = point(-33.3929, -70.7858);
  const second = point(-33.9461, 151.1772);
  const radius = 6371;
  const radial1 = radius * (Math.PI / 2 - first.lat * Math.PI / 180);
  const radial2 = radius * (Math.PI / 2 - second.lat * Math.PI / 180);
  const deltaLongitude = (second.lon - first.lon) * Math.PI / 180;
  const diskChordKm = Math.hypot(
    radial2 * Math.cos(second.lon * Math.PI / 180) - radial1 * Math.cos(first.lon * Math.PI / 180),
    -radial2 * Math.sin(second.lon * Math.PI / 180) + radial1 * Math.sin(first.lon * Math.PI / 180)
  );
  const directKm = geodesicDistanceMeters(first, second) / 1000;
  assert.ok(diskChordKm > 25000);
  assert.ok(directKm > 11300 && directKm < 11400);
  assert.ok(diskChordKm - directKm > 14000);
  assert.ok(Number.isFinite(deltaLongitude));
});

test('near-polar JFK–Singapore geodesic is sampled through the inner disk', () => {
  const first = point(40.6413, -73.7781);
  const second = point(1.3644, 103.9915);
  const radius = 400;
  const path = geodesicLinePath(first, second,
    (lon, lat) => project(lon, lat, radius));
  assert.ok(path.length > 100);
  const closestApproach = Math.min(...path.map(([x, y]) => Math.hypot(x, y)));
  assert.ok(closestApproach < radius * 0.06,
    `polar geodesic should approach the North Pole; closest disk radius was ${closestApproach}`);
  const decodedFirst = unproject(path[0][0], path[0][1], radius);
  const decodedLast = unproject(path.at(-1)[0], path.at(-1)[1], radius);
  close(decodedFirst.lat, first.lat, 1e-9);
  close(decodedFirst.lon, first.lon, 1e-9);
  close(decodedLast.lat, second.lat, 1e-9);
  close(decodedLast.lon, second.lon, 1e-9);
});

test('geodesic sampling draws a projected shortest path, not a Euclidean chord', () => {
  const first = point(-33.3929, -70.7858);
  const second = point(-33.9461, 151.1772);
  const radius = 400;
  const projectPoint = (lon, lat) => project(lon, lat, radius);
  const path = geodesicLinePath(first, second, projectPoint, 150);
  assert.ok(path.length > 50);
  assert.deepEqual(path[0], projectPoint(first.lon, first.lat));
  assert.deepEqual(path.at(-1), projectPoint(second.lon, second.lat));
  const midpoint = path[Math.floor(path.length / 2)];
  const chordMidpoint = [
    (path[0][0] + path.at(-1)[0]) / 2,
    (path[0][1] + path.at(-1)[1]) / 2
  ];
  assert.ok(Math.hypot(midpoint[0] - chordMidpoint[0], midpoint[1] - chordMidpoint[1]) > radius * 0.5);
});

test('distance is symmetric, wraps the antimeridian, and returns zero for identical points', () => {
  const a = point(12.5, 179.9), b = point(13.1, -179.8);
  close(geodesicDistanceMeters(a, b), geodesicDistanceMeters(b, a), 1e-7);
  assert.ok(geodesicDistanceMeters(a, b) < 100000);
  close(geodesicDistanceMeters(a, a), 0, 1e-9);
  close(geodesicDistanceMeters(point(90, -170), point(90, 150)), 0, 1e-7);
  const antipodal = geodesicDistanceMeters(point(0, 0), point(0, 180));
  assert.ok(antipodal > 19900000 && antipodal < 20100000);
});

test('near-antipodal fallback remains finite and the path retains exact endpoints', () => {
  const first = point(0, 0), second = point(0.0001, 179.9999);
  const distance = geodesicDistanceMeters(first, second);
  assert.ok(Number.isFinite(distance));
  assert.ok(distance > 19900000 && distance < 20100000);
  const path = geodesicLinePath(first, second, (lon, lat) => [lon, lat], 500);
  assert.ok(path.length > 20);
  assert.deepEqual(path[0], [0, 0]);
  assert.ok(Math.abs(path.at(-1)[0] - 179.9999) < 1e-9);
  assert.ok(Math.abs(path.at(-1)[1] - 0.0001) < 1e-9);
});

test('invalid coordinates or projection callbacks fail safely', () => {
  assert.equal(geodesicDistanceMeters(point(91, 0), point(0, 0)), null);
  assert.equal(geodesicDistanceMeters(point(0, 0), point(0, NaN)), null);
  assert.deepEqual(geodesicLinePath(point(0, 0), point(0, 1), null), []);
  assert.deepEqual(geodesicLinePath(point(0, 0), point(91, 1), (lon, lat) => [lon, lat]), []);
  assert.deepEqual(geodesicLinePath(point(0, 0), point(0, 1), () => [NaN, 0]), []);
});


test('southern rim benchmark distances match the shortest WGS84 surface paths',()=>{
 const nearRimA=point(-85.07,-2.74),nearRimB=point(-88.52,-179.66);
 close(geodesicDistanceMeters(nearRimA,nearRimB)/1000,715.760507,0.01);
 const antarcticA=point(-65.59,-5.78),antarcticB=point(-74.88,-176.24);
 close(geodesicDistanceMeters(antarcticA,antarcticB)/1000,4398.260680,0.01);
});
