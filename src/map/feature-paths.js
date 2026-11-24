import { projectGeoJSONRing } from '../core/flat-disk.js';
import { projectGeoJSONRingIntoPetals } from '../core/interrupted-petals.js';

export function createFeaturePath(
  feature, project, preserveAntarcticRim = false, PathConstructor = globalThis.Path2D,
  layoutMode = 'gleason', baseRadius
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
      const rings = layoutMode === 'interrupted-petals'
        ? projectGeoJSONRingIntoPetals(ring, baseRadius)
        : [projectGeoJSONRing(ring, project, { preserveAntarcticRim })];
      for (const points of rings) {
        if (!points || points.length < 3) continue;
        path.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
        path.closePath();
      }
    }
  }
  return path;
}
