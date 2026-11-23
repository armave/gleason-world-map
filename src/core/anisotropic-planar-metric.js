/**
 * Deterministic anisotropic distance integration in the flat-disk (x, y) plane.
 * The metric changes only tangential travel; radial travel remains unscaled.
 */
export const ANISOTROPIC_PLANAR_SAMPLE_COUNT = 64;
export const DEFAULT_TANGENTIAL_SCALE_C1 = 0.08;
export const DEFAULT_TANGENTIAL_SCALE_C2 = 0.20;

export function tangentialScaleAtRadius(
  radius,
  equatorRadius,
  c1 = DEFAULT_TANGENTIAL_SCALE_C1,
  c2 = DEFAULT_TANGENTIAL_SCALE_C2
) {
  if (![radius, equatorRadius, c1, c2].every(Number.isFinite) ||
      radius < 0 || equatorRadius <= 0 || c1 < 0 || c2 < 0) return NaN;
  const normalizedRadius = radius / equatorRadius;
  const squared = normalizedRadius * normalizedRadius;
  return 1 / (1 + c1 * squared + c2 * squared * squared);
}

/**
 * Integrate one straight segment using 64 equal linear steps and midpoint
 * radial/tangential decomposition. Returns distance in the input plane units.
 */
export function integrateAnisotropicPlanarSegment(
  start,
  end,
  {
    equatorRadius = 1,
    c1 = DEFAULT_TANGENTIAL_SCALE_C1,
    c2 = DEFAULT_TANGENTIAL_SCALE_C2
  } = {}
) {
  if (!Array.isArray(start) || !Array.isArray(end) ||
      start.length < 2 || end.length < 2 ||
      ![start[0], start[1], end[0], end[1],
        equatorRadius, c1, c2].every(Number.isFinite) ||
      equatorRadius <= 0 || c1 < 0 || c2 < 0) return NaN;

  const dx = (end[0] - start[0]) / ANISOTROPIC_PLANAR_SAMPLE_COUNT;
  const dy = (end[1] - start[1]) / ANISOTROPIC_PLANAR_SAMPLE_COUNT;
  let total = 0;

  for (let index = 0; index < ANISOTROPIC_PLANAR_SAMPLE_COUNT; index++) {
    const x = start[0] + (index + 0.5) * dx;
    const y = start[1] + (index + 0.5) * dy;
    const radius = Math.hypot(x, y);
    let radialStep;
    let tangentialStep;

    if (radius > 1e-12) {
      radialStep = (x * dx + y * dy) / radius;
      tangentialStep = (x * dy - y * dx) / radius;
    } else {
      // At the origin polar direction is undefined; w(0)=1, so any
      // orthonormal decomposition gives the same local Euclidean length.
      radialStep = dx;
      tangentialStep = dy;
    }

    const weight = tangentialScaleAtRadius(radius, equatorRadius, c1, c2);
    total += Math.hypot(radialStep, weight * tangentialStep);
  }
  return total;
}
