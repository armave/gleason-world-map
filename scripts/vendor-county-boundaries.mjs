#!/usr/bin/env node
// Download the public-domain 2026 Census county-equivalent polygons and bundle
// a generalized GeoJSON copy for local static hosting.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const OUT = resolve('data/us-counties-boundaries.geojson.gz');
const SERVICE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2026/MapServer/82';
const PAGE_SIZE = 2000;
const features = [];
for (let offset = 0; ; offset += PAGE_SIZE) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'GEOID,STATE,BASENAME,NAME,INTPTLAT,INTPTLON',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '5',
    maxAllowableOffset: '0.002',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    orderByFields: 'GEOID ASC',
    f: 'geojson'
  });
  const response = await fetch(`${SERVICE}/query?${params}`, {
    headers: { Accept: 'application/geo+json, application/json' }
  });
  if (!response.ok) throw new Error(`Census TIGERweb request failed: HTTP ${response.status}`);
  const page = await response.json();
  if (page?.error) throw new Error(page.error.message || 'Census TIGERweb returned an error.');
  if (page.type !== 'FeatureCollection' || !Array.isArray(page.features)) {
    throw new Error('Census TIGERweb returned invalid GeoJSON.');
  }
  features.push(...page.features);
  console.log(`Fetched ${features.length.toLocaleString()} county features…`);
  if (page.features.length < PAGE_SIZE) break;
}
const seen = new Set();
for (const feature of features) {
  const p = feature.properties || {};
  const geoid = String(p.GEOID || '');
  if (!/^\\d{5}$/.test(geoid) || !/^\\d{2}$/.test(String(p.STATE || '')) ||
      !p.BASENAME || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) ||
      !Array.isArray(feature.geometry.coordinates) || seen.has(geoid)) {
    throw new Error(`Invalid or duplicate Census county feature: ${geoid || '(missing GEOID)'}`);
  }
  seen.add(geoid);
}
if (features.length < 3000) throw new Error(`Expected at least 3,000 county equivalents; received ${features.length}.`);
const geojson = JSON.stringify({
  type: 'FeatureCollection',
  name: 'U.S. Census TIGERweb ACS2026 county equivalents',
  source: 'U.S. Census Bureau TIGERweb ACS2026, Counties layer 82',
  sourceYear: 2026,
  features
});
const compressed = gzipSync(Buffer.from(geojson), { level: 9 });
await mkdir(resolve('data'), { recursive: true });
await writeFile(OUT, compressed);
const hash = createHash('sha256').update(compressed).digest('hex');
console.log(`Saved ${features.length.toLocaleString()} features to ${OUT}`);
console.log(`Compressed: ${compressed.length.toLocaleString()} bytes; SHA-256: ${hash}`);
