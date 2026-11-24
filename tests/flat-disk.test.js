import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAUTICAL_MILES_PER_DEGREE,
  KILOMETRES_PER_NAUTICAL_MILE,
  KILOMETRES_PER_DEGREE,
  DISK_RADIUS_KM,
  DISK_RADIUS_METERS,
  EQUATOR_RADIUS_KM,
  colatitudeRadians,
  radialFraction,
  radialDistanceFromNorthKm,
  latitudeFromRadialDistanceKm,
  project,
  unproject,
  flatDiskDistanceMeters,
  baseFlatDiskDistanceMeters,
  flatDiskLinePath,
  northSouthDistanceKm,
  eastWestDistanceKm,
  flatDiskSectorAreaKm2,
  flatDiskPolygonMetrics,
  flatDiskFeatureAreaM2,
  projectGeoJSONRing
} from '../src/core/flat-disk.js';

const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`);
const point = (lat, lon) => ({ lat, lon });
const projectKm = (lon, lat) => project(lon, lat, DISK_RADIUS_KM);

test('pure Gleason scale uses 60 nautical miles per degree on a linear disk', () => {
  assert.equal(NAUTICAL_MILES_PER_DEGREE, 60);
  assert.equal(KILOMETRES_PER_NAUTICAL_MILE, 1.852);
  assert.equal(KILOMETRES_PER_DEGREE, 111.12);
  close(DISK_RADIUS_KM, 180 * 111.12, 1e-9);
  close(DISK_RADIUS_METERS, DISK_RADIUS_KM * 1000, 1e-6);
  close(EQUATOR_RADIUS_KM, DISK_RADIUS_KM / 2, 1e-9);
  close(colatitudeRadians(90), 0);
  close(colatitudeRadians(0), Math.PI / 2);
  close(colatitudeRadians(-90), Math.PI);
});

test('equal latitude increments create equal radial spacing from pole to rim', () => {
  const expectedStep = DISK_RADIUS_KM / 12;
  const latitudes = [90, 75, 60, 45, 30, 15, 0, -15, -30, -45, -60, -75, -90];
  const radii = latitudes.map(radialDistanceFromNorthKm);
  close(radii[0], 0);
  close(radii.at(-1), DISK_RADIUS_KM);
  for (let i = 1; i < radii.length; i++) {
    close(radii[i] - radii[i - 1], expectedStep, 1e-8);
  }
  for (let lat = 90; lat >= -90; lat -= 1) {
    const fraction = radialFraction(lat);
    close(fraction, (90 - lat) / 180);
    close(latitudeFromRadialDistanceKm(radialDistanceFromNorthKm(lat)), lat);
  }
  assert.ok(Number.isNaN(radialFraction(91)));
  assert.equal(northSouthDistanceKm(90, 75), 1666.8);
});

test('forward and inverse mapping preserve the Gleason longitude orientation', () => {
  const radius = 700;
  close(Math.hypot(...project(0, 90, radius)), 0);
  const equator = project(0, 0, radius);
  close(equator[0], radius / 2);
  close(equator[1], 0);
  const east = project(90, 0, radius);
  close(east[0], 0, 1e-8);
  close(east[1], -radius / 2);
  const west = project(-90, 0, radius);
  close(west[0], 0, 1e-8);
  close(west[1], radius / 2);

  for (const [lat, lon] of [
    [41.7151, 44.8271],
    [0, 0],
    [-32.5, 151.2],
    [75, -179.4],
    [-88, 90]
  ]) {
    const [x, y] = project(lon, lat, radius);
    const decoded = unproject(x, y, radius);
    close(decoded.lat, lat);
    close(((decoded.lon - lon + 540) % 360) - 180, 0);
  }
  assert.deepEqual(project(180, 10, radius), project(-180, 10, radius));
  assert.deepEqual(project(540, 10, radius), project(-180, 10, radius));
  assert.ok(Number.isNaN(project(0, 91, radius)[0]));
});

test('Antarctic rim stays a circle and longitude selects a position on it', () => {
  const radius = 600;
  const rimPoints = [0, 90, 180, 270].map(lon => project(lon, -90, radius));
  for (const [x, y] of rimPoints) close(Math.hypot(x, y), radius);
  close(Math.hypot(
    rimPoints[0][0] - rimPoints[2][0],
    rimPoints[0][1] - rimPoints[2][1]
  ), 2 * radius);
});

test('A–B uses the Euclidean chord in the projected 2D plane', () => {
  const first = point(0, 0), second = point(0, 90);
  const a = project(first.lon, first.lat, DISK_RADIUS_KM);
  const b = project(second.lon, second.lat, DISK_RADIUS_KM);
  const expected = Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000;
  close(flatDiskDistanceMeters(first, second), expected, 1e-6);
  close(baseFlatDiskDistanceMeters(first, second), expected, 1e-6);
  close(flatDiskDistanceMeters(first, second),
    flatDiskDistanceMeters(second, first), 1e-6);
  close(flatDiskDistanceMeters(point(90, -170), point(90, 150)), 0);
  close(flatDiskDistanceMeters(point(0, 180), point(0, -180)), 0);
  assert.equal(flatDiskDistanceMeters(point(91, 0), second), null);
});

test('straight connector contains exactly the two projected endpoints', () => {
  const a = point(40.17, 44.5), b = point(-8.0476, -34.877);
  const path = flatDiskLinePath(a, b, projectKm);
  assert.equal(path.length, 2);
  assert.deepEqual(path[0], projectKm(a.lon, a.lat));
  assert.deepEqual(path[1], projectKm(b.lon, b.lat));
  close(Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) * 1000,
    flatDiskDistanceMeters(a, b), 1e-5);
  assert.deepEqual(flatDiskLinePath(a, b, () => [NaN, 0]), []);
});

test('same-latitude helper measures a planar chord and sector area remains Euclidean', () => {
  const radius = radialDistanceFromNorthKm(25);
  close(eastWestDistanceKm(25, Math.PI / 3),
    2 * radius * Math.sin(Math.PI / 6));
  close(flatDiskSectorAreaKm2(0, DISK_RADIUS_KM, 2 * Math.PI),
    Math.PI * DISK_RADIUS_KM ** 2);
  assert.equal(eastWestDistanceKm(91, 1), null);
});

test('polygon area uses shoelace and perimeter sums Euclidean map-plane chords', () => {
  const vertices = [
    point(-10, -10), point(-10, 10),
    point(10, 10), point(10, -10)
  ];
  const result = flatDiskPolygonMetrics(
    vertices, projectKm, DISK_RADIUS_KM, flatDiskDistanceMeters
  );
  assert.ok(result && result.areaM2 > 0 && result.perimeterM > 0);
  const expectedPerimeter = vertices.reduce((sum, vertex, index) =>
    sum + flatDiskDistanceMeters(vertex, vertices[(index + 1) % vertices.length]), 0);
  close(result.perimeterM, expectedPerimeter, 1e-5);

  const crossed = [
    point(-10, -10), point(10, 10),
    point(-10, 10), point(10, -10)
  ];
  assert.equal(flatDiskPolygonMetrics(
    crossed, projectKm, DISK_RADIUS_KM, flatDiskDistanceMeters
  ), null);
});

test('GeoJSON rings use the same projection and polygon area subtracts holes', () => {
  const ring = [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]];
  const projected = projectGeoJSONRing(ring, projectKm, { maxStepDegrees: 2 });
  assert.ok(projected && projected.length > ring.length);
  const feature = {
    geometry: {
      type: 'Polygon',
      coordinates: [
        ring,
        [[-2, -2], [-2, 2], [2, 2], [2, -2], [-2, -2]]
      ]
    }
  };
  const full = flatDiskFeatureAreaM2({
    geometry: { type: 'Polygon', coordinates: [ring] }
  }, projectKm, DISK_RADIUS_KM);
  const withHole = flatDiskFeatureAreaM2(feature, projectKm, DISK_RADIUS_KM);
  assert.ok(full > 0 && withHole > 0 && withHole < full);
  assert.equal(flatDiskFeatureAreaM2({
    geometry: { type: 'Point', coordinates: [0, 0] }
  }, projectKm, DISK_RADIUS_KM), null);
});
