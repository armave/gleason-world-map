import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const compressedUrl = new URL('../data/antarctic-add-v7.13.geojson.gz', import.meta.url);
const metadataUrl = new URL('../data/antarctic-add-metadata.json', import.meta.url);

test('bundled BAS Antarctic Digital Database asset matches its metadata and checksum', async () => {
  const [compressed, metadata] = await Promise.all([
    readFile(compressedUrl),
    readFile(metadataUrl, 'utf8').then(JSON.parse)
  ]);
  const sha256 = createHash('sha256').update(compressed).digest('hex');
  assert.equal(sha256, metadata.sha256);
  assert.equal(compressed.length, metadata.compressedBytes);

  const json = gunzipSync(compressed);
  assert.equal(json.length, metadata.uncompressedBytes);
  const collection = JSON.parse(json.toString('utf8'));
  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features.length, metadata.featureCount);
  assert.equal(metadata.edition, '7.13');

  const surfaceCounts = Object.fromEntries(
    ['land', 'ice shelf', 'ice tongue', 'rumple'].map(surface => [surface, 0])
  );
  for (const feature of collection.features) {
    const surface = feature?.properties?.surface;
    assert.ok(Object.hasOwn(surfaceCounts, surface), 'unexpected Antarctic surface class: ' + surface);
    assert.equal(feature.geometry?.type, 'Polygon');
    assert.ok(Array.isArray(feature.geometry.coordinates));
    surfaceCounts[surface]++;
    for (const ring of feature.geometry.coordinates) {
      assert.ok(Array.isArray(ring) && ring.length >= 4);
      for (const coordinate of ring) {
        assert.ok(Number.isFinite(coordinate[0]) && coordinate[0] >= -180 && coordinate[0] <= 180);
        assert.ok(Number.isFinite(coordinate[1]) && coordinate[1] >= -90 && coordinate[1] <= -50);
      }
    }
  }
  assert.deepEqual(surfaceCounts, metadata.surfaceCounts);
  assert.ok(surfaceCounts.land > 0 && surfaceCounts['ice shelf'] > 0);
});
