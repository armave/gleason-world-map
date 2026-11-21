import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  COUNTRY_DATA_FILES, CAPITAL_DATA_FILE, MAP_QUALITY_OPTIONS,
  validateCountryDataset, validateCapitalDataset
} from '../src/data/datasets.js';
import { isoFor, nameFor } from '../src/data/geojson.js';

const expected = { low: 177, medium: 242, high: 258 };

for (const quality of ['low', 'medium', 'high']) {
  test(`bundled ${quality} country boundaries are valid, local and complete`, async () => {
    assert.ok(COUNTRY_DATA_FILES[quality].pathname.endsWith(`/data/countries/${quality}.geojson.gz`));
    const bytes = await readFile(COUNTRY_DATA_FILES[quality]);
    const json = gunzipSync(bytes).toString('utf8');
    const data = validateCountryDataset(JSON.parse(json));
    assert.equal(data.features.length, expected[quality]);
    const antarctica = data.features.find(feature => isoFor(feature) === 'ATA' || nameFor(feature).toLowerCase() === 'antarctica');
    assert.ok(antarctica, 'Antarctica feature is present');
    assert.ok(['Polygon', 'MultiPolygon'].includes(antarctica.geometry.type));
    assert.ok(data.features.some(feature => isoFor(feature) === 'ARM' || nameFor(feature) === 'Armenia'));
  });
}

test('bundled capitals JSON contains valid coordinates and Yerevan', async () => {
  assert.ok(CAPITAL_DATA_FILE.pathname.endsWith('/data/capitals.json'));
  const capitals = validateCapitalDataset(JSON.parse(await readFile(CAPITAL_DATA_FILE, 'utf8')));
  assert.equal(capitals.length, 197);
  assert.deepEqual(capitals.find(point => point.iso === 'ARM'), { iso: 'ARM', city: 'Yerevan', lat: 40.18, lon: 44.5 });
});

test('quality selector maps to the three bundled Natural Earth scales', () => {
  assert.equal(MAP_QUALITY_OPTIONS.low.scale, '1:110m');
  assert.equal(MAP_QUALITY_OPTIONS.medium.scale, '1:50m');
  assert.equal(MAP_QUALITY_OPTIONS.high.scale, '1:10m');
});

test('bundled metadata checksums match the compressed country assets', async () => {
  const metadata = JSON.parse(await readFile(new URL('../data/metadata.json', import.meta.url), 'utf8'));
  for (const quality of ['low', 'medium', 'high']) {
    const bytes = await readFile(COUNTRY_DATA_FILES[quality]);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, metadata.boundaryDatasets[quality].sha256);
    assert.equal(bytes.length, metadata.boundaryDatasets[quality].compressedBytes);
  }
});
