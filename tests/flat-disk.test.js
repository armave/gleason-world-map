import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DISK_RADIUS_KM,
  flatDiskDistanceMeters,
  flatDiskFeatureAreaM2,
  flatDiskPolygonMetrics
} from '../src/core/flat-disk.js';

const point = (lon, lat) => ({ lon, lat });
const identity = (lon, lat) => [lon, lat];

test('distance is Euclidean in projected disk coordinates with calibrated units', () => {
  const distance = flatDiskDistanceMeters(point(0, 0), point(3, 4), identity, 10, 100);
  assert.equal(distance, 50000);
});

test('distance is independent of canvas size when projected geometry scales with it', () => {
  const small = flatDiskDistanceMeters(point(0, 0), point(3, 4), (x, y) => [x, y], 10, 100);
  const large = flatDiskDistanceMeters(point(0, 0), point(3, 4), (x, y) => [x * 2, y * 2], 20, 100);
  assert.equal(small, large);
});

test('default disk radius is an explicit unit calibration', () => {
  assert.ok(DEFAULT_DISK_RADIUS_KM > 20000 && DEFAULT_DISK_RADIUS_KM < 20010);
  const acrossRadius = flatDiskDistanceMeters(
    point(0, 0), point(0, 1), (_lon, lat) => [0, lat * 10], 10,
    DEFAULT_DISK_RADIUS_KM
  );
  assert.equal(acrossRadius, DEFAULT_DISK_RADIUS_KM * 1000);
});

test('polygon area uses shoelace geometry and perimeter uses straight edges', () => {
  const result = flatDiskPolygonMetrics(
    [point(0, 0), point(3, 0), point(0, 4)],
    identity, 10, 100
  );
  assert.ok(result);
  assert.equal(result.areaM2, 600000000);
  assert.equal(result.perimeterM, 120000);
});

test('polygon metrics close the ring without requiring a repeated final vertex', () => {
  const open = [point(0, 0), point(4, 0), point(4, 4), point(0, 4)];
  const closed = [...open, point(0, 0)];
  assert.deepEqual(
    flatDiskPolygonMetrics(open, identity, 10, 10),
    flatDiskPolygonMetrics(closed, identity, 10, 10)
  );
});

test('self-intersecting polygons are rejected instead of returning misleading area', () => {
  const bowTie = [point(0, 0), point(4, 4), point(0, 4), point(4, 0)];
  assert.equal(flatDiskPolygonMetrics(bowTie, identity, 10, 10), null);
});

test('GeoJSON Polygon subtracts holes from its exterior ring', () => {
  const feature = {
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]
      ]
    }
  };
  assert.equal(flatDiskFeatureAreaM2(feature, identity, 10, 10), 12000000);
});

test('GeoJSON MultiPolygon sums disjoint projected components', () => {
  const feature = {
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
        [[[5, 0], [7, 0], [7, 2], [5, 2], [5, 0]]]
      ]
    }
  };
  assert.equal(flatDiskFeatureAreaM2(feature, identity, 10, 10), 8000000);
});

test('invalid coordinates and invalid calibration fail safely', () => {
  assert.equal(flatDiskDistanceMeters(point(0, 0), point(NaN, 2), identity, 10, 10), null);
  assert.equal(flatDiskDistanceMeters(point(0, 0), point(1, 1), identity, 0, 10), null);
  assert.equal(flatDiskPolygonMetrics([point(0, 0), point(1, 0), point(NaN, 1)], identity, 10, 10), null);
  assert.equal(flatDiskFeatureAreaM2({ geometry: { type: 'Point', coordinates: [0, 0] } }, identity, 10, 10), null);
});
