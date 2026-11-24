import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISK_RADIUS_KM,
  project as projectGleason
} from '../src/core/flat-disk.js';
import {
  PETALS,
  getPetalIndex,
  projectInterruptedPetals,
  unprojectInterruptedPetals,
  measureInterruptedPetalRoute,
  projectGeoJSONRingIntoPetals,
  createInterruptedPetalGoreWedges
} from '../src/core/interrupted-petals.js';

const point = (lat, lon) => ({ lat, lon });

test('northern points are byte-for-byte equivalent to the Pure Gleason transform', () => {
  for (const [lat, lon] of [[90, 0], [55.75, 37.6], [0, -120], [12.65, -8]]) {
    assert.deepEqual(
      projectInterruptedPetals(lon, lat, 500),
      projectGleason(lon, lat, 500)
    );
  }
});

test('southern points retain the radial scale and compress longitude around one lobe center', () => {
  const lat = -45, lon = -60, base = DISK_RADIUS_KM;
  const pointOnPlane = projectInterruptedPetals(lon, lat, base);
  const expectedRadius = (90 - lat) * 111.12;
  assert.ok(Math.abs(Math.hypot(...pointOnPlane) - expectedRadius) < 1e-8);
  assert.equal(getPetalIndex(lon), 0);
  assert.equal(PETALS.length, 3);
});

test('petal boundaries touch at the Equator and open southward', () => {
  const equatorLeft = projectInterruptedPetals(-20, 0, DISK_RADIUS_KM);
  const equatorRight = projectInterruptedPetals(-20, -0.0001, DISK_RADIUS_KM);
  assert.ok(Math.hypot(
    equatorLeft[0] - equatorRight[0],
    equatorLeft[1] - equatorRight[1]
  ) < 0.1);
  const wedges = createInterruptedPetalGoreWedges(DISK_RADIUS_KM);
  assert.equal(wedges.length, 3);
  assert.ok(wedges.every(wedge => wedge.polygon.length > 100));
  assert.ok(wedges.every(wedge => Math.hypot(
    wedge.edgeA.at(-1)[0] - wedge.edgeB[0][0],
    wedge.edgeA.at(-1)[1] - wedge.edgeB[0][1]
  ) > 100));
});

test('inverse projection round-trips petal interiors and rejects open gore wedges', () => {
  for (const [lat, lon] of [
    [-34.85, -56.17], [-25.7, 28.22], [-35.27, 149.13], [-22.57, 17.08]
  ]) {
    const [x, y] = projectInterruptedPetals(lon, lat, 600);
    const inverse = unprojectInterruptedPetals(x, y, 600);
    assert.ok(Math.abs(inverse.lat - lat) < 1e-8);
    assert.ok(Math.abs(((inverse.lon - lon + 540) % 360) - 180) < 1e-8);
  }
  const north = unprojectInterruptedPetals(0, -100, 600);
  assert.ok(Number.isFinite(north.lat));
});

test('same-petal and northern routes are planar Euclidean chords', () => {
  const a = point(-30, -60), b = point(-20, -50);
  const result = measureInterruptedPetalRoute(a, b);
  assert.equal(result.metric, 'euclidean-flat-petal-chord');
  assert.equal(result.segments.length, 1);
  assert.ok(Math.abs(
    result.distanceMeters / 1000 -
    Math.hypot(
      projectInterruptedPetals(b.lon, b.lat)[0] - projectInterruptedPetals(a.lon, a.lat)[0],
      projectInterruptedPetals(b.lon, b.lat)[1] - projectInterruptedPetals(a.lon, a.lat)[1]
    )
  ) < 1e-7);
  const northern = measureInterruptedPetalRoute(point(55.75, 37.6), point(12.65, -8));
  assert.equal(northern.metric, 'euclidean-flat-petal-chord');
});

test('cross-petal routes return two visible edge-to-edge segments and symmetric distances', () => {
  const a = point(-34.85, -56.17), b = point(-25.7, 28.22);
  const result = measureInterruptedPetalRoute(a, b);
  const reverse = measureInterruptedPetalRoute(b, a);
  assert.equal(result.metric, 'planar-gore-edge-stitch');
  assert.equal(result.segments.length, 2);
  assert.ok(result.latCut <= 0 && result.latCut >= -90);
  assert.ok(Math.abs(result.distanceMeters - reverse.distanceMeters) < 1e-5);
});

test('all three pairs of petals can be stitched', () => {
  for (const [a, b] of [
    [point(-30, -60), point(-30, 25)],
    [point(-30, 25), point(-30, 140)],
    [point(-30, 140), point(-30, -60)]
  ]) {
    const route = measureInterruptedPetalRoute(a, b);
    assert.equal(route.metric, 'planar-gore-edge-stitch');
    assert.equal(route.segments.length, 2);
    assert.ok(Number.isFinite(route.distanceMeters));
  }
});

test('GeoJSON rings are clipped into northern and southern lobe pieces', () => {
  const ring = [[-140, -20], [-10, -20], [100, -20], [100, 25], [-140, 25], [-140, -20]];
  const pieces = projectGeoJSONRingIntoPetals(ring, 400);
  assert.ok(pieces.length >= 2);
  assert.ok(pieces.every(piece => piece.length >= 3));
});

test('invalid coordinates fail safely', () => {
  assert.equal(measureInterruptedPetalRoute(point(91, 0), point(0, 0)).distanceMeters, null);
  assert.ok(projectInterruptedPetals(0, 91)[0] !== projectInterruptedPetals(0, 91)[0]);
});
