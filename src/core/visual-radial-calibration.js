/**
 * Smooth, edge-anchored radial redistribution for the 12-circle map.
 *
 * The circle factors decrease linearly from 1.00 at the North Pole to 0.50
 * at the Ice Wall. Integrating that profile and normalizing its total keeps
 * both endpoints fixed while smoothly redistributing every intermediate ring.
 * The resulting single quadratic transform has no per-ring joins or hard bands.
 */
export const RADIAL_DISTANCE_CIRCLE_COUNT = 12;
export const RADIAL_DISTANCE_INNER_FACTOR = 1;
export const RADIAL_DISTANCE_OUTER_FACTOR = 0.5;

export const RADIAL_DISTANCE_CIRCLE_FACTORS = Object.freeze([
  1.00, 0.95, 0.91, 0.86, 0.82, 0.77,
  0.73, 0.68, 0.64, 0.59, 0.55, 0.50
]);

const clampUnit = value => Math.max(0, Math.min(1, value));

/** Linear calibration profile, sampled by the 12 published circle markers. */
export function radialDistanceCorrectionFactor(radialFraction) {
  if (!Number.isFinite(radialFraction)) return null;
  const q = clampUnit(radialFraction);
  return RADIAL_DISTANCE_INNER_FACTOR -
    (RADIAL_DISTANCE_INNER_FACTOR - RADIAL_DISTANCE_OUTER_FACTOR) * q;
}

/**
 * Map the original warped-disk radius q to its visual radius q′.
 *
 * q′ = integral(0..q, 1 - 0.5u) du / integral(0..1, 1 - 0.5u) du
 *    = q + q(1-q)/3
 *
 * Its derivative is positive and continuous over the whole disk. All 12
 * reference circles therefore blend into one another without rigid joins.
 */
export function visualRadialFractionFromBaseFraction(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  const q = clampUnit(baseFraction);
  return q + q * (1 - q) / 3;
}

/** Exact inverse of visualRadialFractionFromBaseFraction. */
export function baseRadialFractionFromVisualFraction(visualFraction) {
  if (!Number.isFinite(visualFraction)) return NaN;
  const visual = clampUnit(visualFraction);
  return 2 - Math.sqrt(4 - 3 * visual);
}

/** Local radial spacing scale relative to the fixed total disk radius. */
export function visualRadialSpacingScale(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  const q = clampUnit(baseFraction);
  return (4 - 2 * q) / 3;
}
