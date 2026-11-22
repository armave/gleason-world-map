/**
 * The single radial-distance profile implementation used by the map renderer,
 * inverse lookup, ruler, polygon measurements and observed-path calibration.
 *
 * The local multiplier tapers smoothly from innerFactor at the North Pole to
 * outerFactor at the Antarctic Ice Wall. Its integral is normalized only for
 * screen positioning; kilometre coordinates use the unnormalized integral.
 */
import { FLIGHT_PATH_CALIBRATION } from './flight-path-calibration-parameters.js';

export const RADIAL_DISTANCE_CIRCLE_COUNT = 12;
const DEFAULT_PROFILE = Object.freeze({
  innerFactor: 1,
  outerFactor: 0.5,
  exponent: 1
});

function normalizeProfile(profile) {
  if (!profile || !Number.isFinite(profile.innerFactor) ||
      !Number.isFinite(profile.outerFactor) ||
      !Number.isFinite(profile.exponent) ||
      profile.innerFactor <= 0 ||
      profile.outerFactor <= 0 ||
      profile.innerFactor < profile.outerFactor ||
      profile.exponent <= 0) return null;
  return {
    innerFactor: profile.innerFactor,
    outerFactor: profile.outerFactor,
    exponent: profile.exponent
  };
}

export const ACTIVE_RADIAL_DISTANCE_PROFILE = Object.freeze(
  normalizeProfile(FLIGHT_PATH_CALIBRATION.radialProfile) || DEFAULT_PROFILE
);
export const RADIAL_DISTANCE_INNER_FACTOR = ACTIVE_RADIAL_DISTANCE_PROFILE.innerFactor;
export const RADIAL_DISTANCE_OUTER_FACTOR = ACTIVE_RADIAL_DISTANCE_PROFILE.outerFactor;
export const RADIAL_DISTANCE_PROFILE_EXPONENT = ACTIVE_RADIAL_DISTANCE_PROFILE.exponent;

const clampUnit = value => Math.max(0, Math.min(1, value));
const resolveProfile = profile =>
  normalizeProfile(profile) || ACTIVE_RADIAL_DISTANCE_PROFILE;

/** Local radial-distance multiplier at base radial fraction q. */
export function radialDistanceCorrectionFactor(
  radialFraction,
  profile = ACTIVE_RADIAL_DISTANCE_PROFILE
) {
  if (!Number.isFinite(radialFraction)) return null;
  const config = resolveProfile(profile);
  const q = clampUnit(radialFraction);
  return config.outerFactor +
    (config.innerFactor - config.outerFactor) *
    Math.pow(1 - q, config.exponent);
}

/** Unnormalized integral of the local multiplier from the pole to base fraction q. */
export function integratedRadialDistanceMultiplier(
  baseFraction,
  profile = ACTIVE_RADIAL_DISTANCE_PROFILE
) {
  if (!Number.isFinite(baseFraction)) return NaN;
  const config = resolveProfile(profile);
  const q = clampUnit(baseFraction);
  const taper = config.innerFactor - config.outerFactor;
  return config.outerFactor * q +
    taper * (1 - Math.pow(1 - q, config.exponent + 1)) /
      (config.exponent + 1);
}

/** Integral mean of the local radial-distance multiplier. */
export function radialDistanceProfileMean(profile = ACTIVE_RADIAL_DISTANCE_PROFILE) {
  return integratedRadialDistanceMultiplier(1, profile);
}
export const RADIAL_DISTANCE_PROFILE_MEAN = radialDistanceProfileMean();

/** Baseline linear-profile step, retained for reference-table compatibility. */
export const RADIAL_DISTANCE_CIRCLE_STEP =
  (RADIAL_DISTANCE_INNER_FACTOR - RADIAL_DISTANCE_OUTER_FACTOR) /
  (RADIAL_DISTANCE_CIRCLE_COUNT - 1);

/** Convert base radius q to normalized canvas radius while preserving both anchors. */
export function visualRadialFractionFromBaseFraction(
  baseFraction,
  profile = ACTIVE_RADIAL_DISTANCE_PROFILE
) {
  if (!Number.isFinite(baseFraction)) return NaN;
  const mean = radialDistanceProfileMean(profile);
  return mean > 0
    ? integratedRadialDistanceMultiplier(baseFraction, profile) / mean
    : NaN;
}

/** Local multipliers sampled at the 12 equally spaced base-ring anchors. */
export const RADIAL_DISTANCE_CIRCLE_FACTORS = Object.freeze(
  Array.from({ length: RADIAL_DISTANCE_CIRCLE_COUNT }, (_, index) =>
    radialDistanceCorrectionFactor(index / (RADIAL_DISTANCE_CIRCLE_COUNT - 1))
  )
);

/** Shared 12 reference positions for the calibration table and map guide rings. */
export const RADIAL_DISTANCE_VISUAL_CIRCLES = Object.freeze(
  Array.from({ length: RADIAL_DISTANCE_CIRCLE_COUNT }, (_, index) => {
    const baseFraction = index / (RADIAL_DISTANCE_CIRCLE_COUNT - 1);
    return Object.freeze({
      circle: index + 1,
      baseFraction,
      visualFraction: visualRadialFractionFromBaseFraction(baseFraction),
      distanceMultiplier: RADIAL_DISTANCE_CIRCLE_FACTORS[index]
    });
  })
);

/** Inverse of the integrated profile, solved monotonically for a given shape. */
export function baseRadialFractionFromVisualFraction(
  visualFraction,
  profile = ACTIVE_RADIAL_DISTANCE_PROFILE
) {
  if (!Number.isFinite(visualFraction)) return NaN;
  const target = clampUnit(visualFraction);
  if (target === 0 || target === 1) return target;

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 64; iteration++) {
    const midpoint = (lower + upper) / 2;
    const projected = visualRadialFractionFromBaseFraction(midpoint, profile);
    if (projected < target) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
}

/** Local derivative dq_visual/dq in normalized screen units. */
export function visualRadialSpacingScale(
  baseFraction,
  profile = ACTIVE_RADIAL_DISTANCE_PROFILE
) {
  if (!Number.isFinite(baseFraction)) return NaN;
  const mean = radialDistanceProfileMean(profile);
  return mean > 0
    ? radialDistanceCorrectionFactor(baseFraction, profile) / mean
    : NaN;
}
