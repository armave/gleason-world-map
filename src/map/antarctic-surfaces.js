import { createFeaturePath } from './feature-paths.js';

export const ANTARCTIC_SURFACES = Object.freeze([
  'land',
  'ice shelf',
  'ice tongue',
  'rumple'
]);

const SURFACE_SET = new Set(ANTARCTIC_SURFACES);

function surfaceName(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function validRing(ring) {
  return Array.isArray(ring) && ring.length >= 4 && ring.every(point =>
    Array.isArray(point) && point.length >= 2 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    point[0] >= -180 && point[0] <= 180 &&
    point[1] >= -90 && point[1] <= 90
  );
}

export function validateAntarcticAddDataset(data, { minimumFeatures = 1 } = {}) {
  if (!data || data.type !== 'FeatureCollection' ||
      !Array.isArray(data.features) || data.features.length < minimumFeatures) {
    throw new Error('The bundled Antarctic Digital Database surface dataset is invalid or incomplete.');
  }

  const counts = Object.fromEntries(ANTARCTIC_SURFACES.map(surface => [surface, 0]));
  for (const feature of data.features) {
    const surface = surfaceName(feature?.properties?.surface);
    const geometry = feature?.geometry;
    if (!SURFACE_SET.has(surface) ||
        !geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      throw new Error('The Antarctic Digital Database contains an unsupported surface feature.');
    }
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(polygons) || !polygons.length ||
        polygons.some(rings => !Array.isArray(rings) || !rings.length || rings.some(ring => !validRing(ring)))) {
      throw new Error('The Antarctic Digital Database contains invalid polygon coordinates.');
    }
    counts[surface]++;
  }

  if (!counts.land || !counts['ice shelf']) {
    throw new Error('The Antarctic Digital Database is missing land or ice-shelf polygons.');
  }
  return { ...data, surfaceCounts: counts };
}

/**
 * Convert the BAS ADD surface polygons into reusable projected paths.
 * The Antarctic source uses geographic lon/lat coordinates; map projection
 * and antimeridian handling are delegated to the same ring projector used
 * for Natural Earth country boundaries.
 */
function yieldToMainThread(){
  return new Promise(resolve=>{
    if(typeof globalThis.requestIdleCallback==='function')globalThis.requestIdleCallback(()=>resolve(),{timeout:80});
    else setTimeout(resolve,0);
  });
}

export function createAntarcticSurfacePaths(
  data, project, PathConstructor = globalThis.Path2D
) {
  if (typeof PathConstructor !== 'function') {
    throw new Error('Path2D is required to build Antarctic surface geometry.');
  }
  if (!data || !Array.isArray(data.features) || typeof project !== 'function') return {};

  const paths = Object.fromEntries(ANTARCTIC_SURFACES.map(surface =>
    [surface, new PathConstructor()]
  ));
  for (const feature of data.features) {
    const surface = surfaceName(feature?.properties?.surface);
    if (!SURFACE_SET.has(surface)) continue;
    const featurePath = createFeaturePath(feature, project, false, PathConstructor);
    paths[surface].addPath(featurePath);
  }
  return paths;
}

export async function createAntarcticSurfacePathsAsync(
  data, project, PathConstructor = globalThis.Path2D,
  { batchSize = 8, yieldControl = yieldToMainThread } = {}
) {
  if (typeof PathConstructor !== 'function') {
    throw new Error('Path2D is required to build Antarctic surface geometry.');
  }
  if (!data || !Array.isArray(data.features) || typeof project !== 'function') return {};
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Antarctic surface batch size must be a positive integer.');
  }

  const paths = Object.fromEntries(ANTARCTIC_SURFACES.map(surface =>
    [surface, new PathConstructor()]
  ));
  for (let index = 0; index < data.features.length; index++) {
    const feature = data.features[index];
    const surface = surfaceName(feature?.properties?.surface);
    if (SURFACE_SET.has(surface)) {
      const featurePath = createFeaturePath(feature, project, false, PathConstructor);
      paths[surface].addPath(featurePath);
    }
    if ((index + 1) % batchSize === 0 && index + 1 < data.features.length) {
      await yieldControl();
    }
  }
  return paths;
}
