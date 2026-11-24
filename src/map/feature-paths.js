import { projectGeoJSONRingParts } from '../core/dual-disk.js';

function appendRing(path, points) {
  if (!Array.isArray(points) || points.length < 3) return;
  path.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) {
    path.lineTo(points[index][0], points[index][1]);
  }
  path.closePath();
}

/** Country and island polygons are clipped at the hinge before projection. */
export function createFeaturePath(
  feature, projectPoint, preserveAntarcticRim = false, PathConstructor = globalThis.Path2D
) {
  if (typeof PathConstructor !== 'function') {
    throw new Error('Path2D is required to build feature geometry.');
  }
  const path = new PathConstructor();
  const geometry = feature?.geometry;
  if (!geometry) return path;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [];

  for (const polygon of polygons) {
    for (const ring of polygon || []) {
      for (const part of projectGeoJSONRingParts(ring, projectPoint, {
        maxStepDegrees: preserveAntarcticRim ? 1 : 2
      })) appendRing(path, part.points);
    }
  }
  return path;
}
