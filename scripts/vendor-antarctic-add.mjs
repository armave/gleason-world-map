#!/usr/bin/env node
/**
 * Vendor the SCAR Antarctic Digital Database (ADD) high-resolution polygon
 * coastline. Surface polygons are simplified by the ArcGIS service in WGS84
 * at a tolerance appropriate to this whole-disk map, then bundled locally.
 *
 * Source: Gerrish et al. (2026), ADD v7.13, DOI 10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb.
 * License: CC BY 4.0. Required attribution: Data from the SCAR Antarctic Digital Database, 2026.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const SERVICE = 'https://services7.arcgis.com/tPxy1hrFDhJfZ0Mf/arcgis/rest/services/High_resolution_vector_polygons_of_the_Antarctic_coastline/FeatureServer';
const OUTPUT_PATH = 'data/antarctic-add-v7.13.geojson.gz';
const METADATA_PATH = 'data/antarctic-add-metadata.json';
const EDITION = '7.13';
const DOI = '10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb';
const ATTRIBUTION = 'Data from the SCAR Antarctic Digital Database, 2026';
const LICENSE = 'Creative Commons Attribution 4.0 International (CC BY 4.0)';
const BATCH_SIZE = 100;
const OUT_SR = 4326;
const MAX_ALLOWABLE_OFFSET_DEGREES = 0.003;
const SURFACES = new Set(['land', 'ice shelf', 'ice tongue', 'rumple']);

async function requestJson(url, label) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'gleason-world-map-add-vendor/1.0' },
        signal: AbortSignal.timeout(60000)
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(label + ': HTTP ' + response.status);
        if (attempt < 4) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await new Promise(resolve => setTimeout(resolve,
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 30000)
              : 800 * (2 ** attempt)));
          continue;
        }
      }
      if (!response.ok) {
        throw new Error(label + ': HTTP ' + response.status + ' ' + (await response.text()).slice(0, 300));
      }
      const payload = await response.json();
      if (payload.error) {
        const details = Array.isArray(payload.error.details) ? payload.error.details.join('; ') : '';
        const error = new Error(
          label + ': ArcGIS error ' + (payload.error.code ?? 'unknown') + ': ' +
          (payload.error.message || 'query failed') + (details ? ' (' + details + ')' : '')
        );
        error.retryable = Number(payload.error.code) === 429 || Number(payload.error.code) >= 500;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (error.retryable === false) throw error;
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 600 * (2 ** attempt)));
    }
  }
  throw lastError || new Error(label + ': request failed');
}

function addQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  return target.toString();
}

function normalizeSurface(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function attributeValue(attributes, fieldName) {
  if (!attributes || !fieldName) return null;
  if (Object.hasOwn(attributes, fieldName)) return attributes[fieldName];
  const match = Object.keys(attributes).find(key => key.toLowerCase() === fieldName.toLowerCase());
  return match ? attributes[match] : null;
}

function normalizeFeature(feature, fields = {}) {
  const surface = normalizeSurface(
    attributeValue(feature?.attributes, fields.surface) ?? feature?.properties?.surface
  );
  const rings = feature?.geometry?.rings;
  if (!SURFACES.has(surface) || !Array.isArray(rings)) return null;
  const coordinates = rings.map(ring => {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const cleaned = ring.map(point => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lon = Number(point[0]), lat = Number(point[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat) ||
          lon < -180 || lon > 180 || lat < -90 || lat > -50) return null;
      return [Number(lon.toFixed(4)), Number(lat.toFixed(4))];
    });
    return cleaned.every(Boolean) ? cleaned : null;
  }).filter(Boolean);
  if (!coordinates.length) return null;
  const attributes = feature.attributes || {};
  return {
    type: 'Feature',
    properties: {
      surface,
      sourceDate: attributeValue(attributes, fields.sourceDate) ?? null,
      revisionDate: attributeValue(attributes, fields.revisionDate) ?? null
    },
    // Esri polygon rings are retained together. The renderer uses even-odd
    // fill semantics so disconnected shells and holes remain correctly filled.
    geometry: { type: 'Polygon', coordinates }
  };
}

async function main() {
  console.log('Reading BAS Antarctic Digital Database FeatureServer metadata…');
  const service = await requestJson(addQuery(SERVICE, { f: 'json' }), 'FeatureServer metadata');
  const layers = Array.isArray(service.layers) ? service.layers : [];
  const layer = layers.find(candidate =>
    /polygon/i.test(candidate.name || '') && /coastline/i.test(candidate.name || '')
  ) || layers.find(candidate => /polygon/i.test(candidate.name || '')) || layers[0];
  if (!layer || !Number.isInteger(layer.id)) {
    throw new Error('The ADD FeatureServer did not expose a polygon feature layer.');
  }

  const layerUrl = SERVICE + '/' + layer.id;
  const layerMetadata = await requestJson(addQuery(layerUrl, { f: 'json' }), 'ADD layer metadata');
  if (!String(layerMetadata.geometryType || '').toLowerCase().includes('polygon')) {
    throw new Error('The selected ADD layer is not polygon geometry.');
  }

  const layerFields = Array.isArray(layerMetadata.fields) ? layerMetadata.fields : [];
  const findField = name => layerFields.find(field =>
    String(field.name || '').toLowerCase() === name.toLowerCase()
  )?.name || null;
  const fields = {
    surface: findField('surface'),
    sourceDate: findField('sourcedate'),
    revisionDate: findField('revdate')
  };
  if (!fields.surface) {
    throw new Error('The selected ADD layer has no surface field. Available fields: ' +
      layerFields.map(field => field.name).join(', '));
  }
  const outFields = [...new Set(Object.values(fields).filter(Boolean))].join(',');
  console.log('Using ADD layer ' + layer.id + ' (' + layer.name + '); requested fields: ' + outFields);

  const idPayload = await requestJson(addQuery(layerUrl + '/query', {
    where: '1=1',
    returnIdsOnly: 'true',
    f: 'json'
  }), 'ADD object ID query');
  const objectIds = Array.isArray(idPayload.objectIds) ? idPayload.objectIds : [];
  if (objectIds.length < 100) {
    throw new Error('The ADD service returned too few polygon object IDs (' + objectIds.length + ').');
  }

  const features = [];
  for (let offset = 0; offset < objectIds.length; offset += BATCH_SIZE) {
    const batch = objectIds.slice(offset, offset + BATCH_SIZE);
    const payload = await requestJson(addQuery(layerUrl + '/query', {
      objectIds: batch.join(','),
      outFields,
      returnGeometry: 'true',
      outSR: OUT_SR,
      geometryPrecision: 4,
      maxAllowableOffset: MAX_ALLOWABLE_OFFSET_DEGREES,
      f: 'json'
    }), 'ADD polygon batch ' + (Math.floor(offset / BATCH_SIZE) + 1));
    for (const candidate of payload.features || []) {
      const normalized = normalizeFeature(candidate, fields);
      if (normalized) features.push(normalized);
    }
    console.log('Fetched ' + Math.min(offset + batch.length, objectIds.length) +
      '/' + objectIds.length + ' ADD polygons; retained ' + features.length);
  }

  const surfaceCounts = Object.fromEntries([...SURFACES].map(surface => [surface, 0]));
  let minLatitude = 90, maxLatitude = -90;
  for (const feature of features) {
    surfaceCounts[feature.properties.surface]++;
    for (const ring of feature.geometry.coordinates) for (const [lon, lat] of ring) {
      minLatitude = Math.min(minLatitude, lat);
      maxLatitude = Math.max(maxLatitude, lat);
    }
  }
  if (features.length < 100 || !surfaceCounts.land || !surfaceCounts['ice shelf'] ||
      minLatitude > -80 || maxLatitude > -50) {
    throw new Error('ADD polygon validation failed: ' + JSON.stringify({
      features: features.length, surfaceCounts, minLatitude, maxLatitude
    }));
  }

  await mkdir('data', { recursive: true });
  const collection = {
    type: 'FeatureCollection',
    name: 'SCAR Antarctic Digital Database high-resolution coastline surfaces v' + EDITION,
    features
  };
  const json = Buffer.from(JSON.stringify(collection));
  const compressed = gzipSync(json, { level: 9 });
  await writeFile(OUTPUT_PATH, compressed);
  const sha256 = createHash('sha256').update(compressed).digest('hex');
  const metadata = {
    schemaVersion: 1,
    provider: 'British Antarctic Survey / SCAR Antarctic Digital Database',
    edition: EDITION,
    published: '2026-11-12',
    doi: DOI,
    service: SERVICE,
    layerId: layer.id,
    layerName: layer.name,
    attribution: ATTRIBUTION,
    license: LICENSE,
    sourceCrs: 'EPSG:4326 (reprojected by ArcGIS from EPSG:3031)',
    generalization: {
      method: 'ArcGIS maxAllowableOffset applied in WGS84 output coordinates',
      toleranceDegrees: MAX_ALLOWABLE_OFFSET_DEGREES,
      coordinatePrecisionDecimals: 4
    },
    surfaceCounts,
    featureCount: features.length,
    latitudeExtent: { min: minLatitude, max: maxLatitude },
    uncompressedBytes: json.length,
    compressedBytes: compressed.length,
    sha256,
    file: OUTPUT_PATH
  };
  await writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2) + '\n');
  console.log('ADD v' + EDITION + ' vendored: ' + features.length +
    ' polygons; ' + compressed.length.toLocaleString() + ' compressed bytes.');
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
