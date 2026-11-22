/**
 * One authoritative radial-distance multiplier profile for the 12-circle map.
 *
 * The local radial-spacing multiplier tapers linearly from 1.00× at the
 * North Pole to 0.50× at the Ice Wall. It is integrated over the base radial
 * fraction and normalized by its mean (0.75) so the centre and outer rim stay
 * fixed. The resulting visual radius is used by every projected map feature
 * and by the flat-disk distance engine.
 */
export const RADIAL_DISTANCE_CIRCLE_COUNT = 12;
export const RADIAL_DISTANCE_INNER_FACTOR = 1;
export const RADIAL_DISTANCE_OUTER_FACTOR = 0.5;
export const RADIAL_DISTANCE_PROFILE_MEAN =
  (RADIAL_DISTANCE_INNER_FACTOR + RADIAL_DISTANCE_OUTER_FACTOR) / 2;
export const RADIAL_DISTANCE_CIRCLE_STEP =
  (RADIAL_DISTANCE_INNER_FACTOR - RADIAL_DISTANCE_OUTER_FACTOR) /
  (RADIAL_DISTANCE_CIRCLE_COUNT - 1);

const clampUnit = value => Math.max(0, Math.min(1, value));

/** Exact linear multiplier profile, 1.00×→0.50× over the normalized radius. */
export function radialDistanceCorrectionFactor(radialFraction) {
  if (!Number.isFinite(radialFraction)) return null;
  const q = clampUnit(radialFraction);
  return RADIAL_DISTANCE_INNER_FACTOR -
    (RADIAL_DISTANCE_INNER_FACTOR - RADIAL_DISTANCE_OUTER_FACTOR) * q;
}

/** Integral of the local radial multiplier from the centre to q. */
export function integratedRadialDistanceMultiplier(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  const q = clampUnit(baseFraction);
  const taper = RADIAL_DISTANCE_INNER_FACTOR - RADIAL_DISTANCE_OUTER_FACTOR;
  return RADIAL_DISTANCE_INNER_FACTOR * q - taper * q * q / 2;
}

/**
 * Map the original fitted radius q to its displayed radius q′.
 *
 * q′ = integral(0..q, m(u) du) / integral(0..1, m(u) du)
 *    = (q - 0.25q²) / 0.75
 *    = q + q(1-q)/3
 *
 * The normalization preserves the total disk radius. The local visual scale
 * is m(q)/0.75; therefore the listed 1.00×→0.50× values are the exact relative
 * radial-spacing profile, not a post-hoc multiplier on an arbitrary A–B chord.
 */
export function visualRadialFractionFromBaseFraction(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  return integratedRadialDistanceMultiplier(baseFraction) /
    RADIAL_DISTANCE_PROFILE_MEAN;
}

/**
 * Shared 12 reference positions for the table and the map's dotted circles.
 * Circle 1 is the North Pole (centre); circle 12 is the Antarctic rim.
 */
export const RADIAL_DISTANCE_VISUAL_CIRCLES = Object.freeze(
  Array.from({ length: RADIAL_DISTANCE_CIRCLE_COUNT }, (_, index) => {
    const baseFraction = index / (RADIAL_DISTANCE_CIRCLE_COUNT - 1);
    return Object.freeze({
      circle: index + 1,
      baseFraction,
      visualFraction: visualRadialFractionFromBaseFraction(baseFraction),
      distanceMultiplier: radialDistanceCorrectionFactor(baseFraction)
    });
  })
);

/** Exact inverse of visualRadialFractionFromBaseFraction. */
export function baseRadialFractionFromVisualFraction(visualFraction) {
  if (!Number.isFinite(visualFraction)) return NaN;
  const visual = clampUnit(visualFraction);
  return 2 - Math.sqrt(4 - 3 * visual);
}

/**
 * Local radial scale after normalizing the integrated profile to the fixed rim.
 * This is the derivative dq_visual/dq = multiplier(q) / profile mean.
 */
export function visualRadialSpacingScale(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  return radialDistanceCorrectionFactor(baseFraction) /
    RADIAL_DISTANCE_PROFILE_MEAN;
}
