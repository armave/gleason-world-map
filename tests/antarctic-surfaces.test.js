import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANTARCTIC_SURFACES,
  validateAntarcticAddDataset,
  createAntarcticSurfacePaths
} from '../src/map/antarctic-surfaces.js';

class FakePath2D {
  constructor() { this.commands = []; }
  moveTo(x, y) { this.commands.push(['M', x, y]); }
  lineTo(x, y) { this.commands.push(['L', x, y]); }
  closePath() { this.commands.push(['Z']); }
  addPath(path) { this.commands.push(...path.commands); }
}

const ring = [
  [0, -70], [1, -70], [1, -71], [0, -71], [0, -70]
];
const collection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { surface: 'land' }, geometry: { type: 'Polygon', coordinates: [ring] } },
    { type: 'Feature', properties: { surface: 'ice shelf' }, geometry: { type: 'Polygon', coordinates: [ring] } },
    { type: 'Feature', properties: { surface: 'ice_tongue' }, geometry: { type: 'Polygon', coordinates: [ring] } },
    { type: 'Feature', properties: { surface: 'rumple' }, geometry: { type: 'Polygon', coordinates: [ring] } }
  ]
};

test('BAS ADD surface validator accepts the four supported surface classes', () => {
  const validated = validateAntarcticAddDataset(collection);
  assert.deepEqual(validated.surfaceCounts, {
    land: 1, 'ice shelf': 1, 'ice tongue': 1, rumple: 1
  });
  assert.deepEqual(ANTARCTIC_SURFACES, ['land', 'ice shelf', 'ice tongue', 'rumple']);
});

test('BAS ADD surface validator rejects unsupported classes and malformed rings', () => {
  const unsupported = structuredClone(collection);
  unsupported.features[0].properties.surface = 'glacier';
  assert.throws(() => validateAntarcticAddDataset(unsupported), /unsupported surface/);

  const malformed = structuredClone(collection);
  malformed.features[0].geometry.coordinates = [[[0, -70], [1, -70], [1, -71]]];
  assert.throws(() => validateAntarcticAddDataset(malformed), /invalid polygon coordinates/);
});

test('surface polygons are separated into reusable projected paths', () => {
  const validated = validateAntarcticAddDataset(collection);
  const paths = createAntarcticSurfacePaths(validated, (lon, lat) => [lon * 2, lat * 2], FakePath2D);
  assert.deepEqual(Object.keys(paths), ANTARCTIC_SURFACES);
  for (const surface of ANTARCTIC_SURFACES) {
    assert.ok(paths[surface] instanceof FakePath2D);
    assert.equal(paths[surface].commands[0][0], 'M');
    assert.ok(paths[surface].commands.some(command => command[0] === 'Z'));
  }
});
