/**
 * Shared 12-circle radial-spacing profile used by the renderer and all map
 * measurements. The local multiplier is a smooth power taper, fitted by the
 * observed ADS-B path calibration and integrated before coordinates are drawn.
 *
 * The current accepted model keeps exponent=1 (the legacy linear taper).
 * Future accepted fits may change the exponent without adding a separate
 * visual-only transform or changing the North Pole / Ice Wall anchors.
 */
import { FLIGHT_PATH_CALIBRATION } from './flight-path-calibration-parameters.js';

export const RADIAL_DISTANCE_CIRCLE_COUNT = 12;
export const RADIAL_DISTANCE_INNER_FACTOR = 1;
export const RADIAL_DISTANCE_OUTER_FACTOR = 0.5;
export const RADIAL_DISTANCE_PROFILE_EXPONENT =
  Number.isFinite(FLIGHT_PATH_CALIBRATION.radialProfile?.exponent) &&
  FLIGHT_PATH_CALIBRATION.radialProfile.exponent > 0
    ? FLIGHT_PATH_CALIBRATION.radialProfile.exponent
    : 1;
export const RADIAL_DISTANCE_PROFILE_MEAN =
  FLIGHT_PATH_CALIBRATION.radialProfile?.innerFactor * 0 +
  FLIGHT_PATH_CALIBRATION.radialProfile?.outerFactor * 0 +
  integratedRadialDistanceMultiplier(1);

const clampUnit = value => Math.max(0, Math.min(1, value));

function configuredProfile() {
  const profile = FLIGHT_PATH_CALIBRATION.radialProfile || {};
  const innerFactor = Number.isFinite(profile.innerFactor) && profile.innerFactor > 0
    ? profile.innerFactor : RADIAL_DISTANCE_INNER_FACTOR;
  const outerFactor = Number.isFinite(profile.outerFactor) && profile.outerFactor > 0
    ? profile.outerFactor : RADIAL_DISTANCE_OUTER_FACTOR;
  const exponent = Number.isFinite(profile.exponent) && profile.exponent > 0
    ? profile.exponent : 1;
  if (innerFactor < outerFactor) {
    return {
      innerFactor: RADIAL_DISTANCE_INNER_FACTOR,
      outerFactor: RADIAL_DISTANCE_OUTER_FACTOR,
      exponent: 1
    };
  }
  return { innerFactor, outerFactor, exponent };
}

const PROFILE = Object.freeze(configuredProfile());

/** Local radial-distance multiplier at base radial fraction q. */
export function radialDistanceCorrectionFactor(radialFraction) {
  if (!Number.isFinite(radialFraction)) return null;
  const q = clampUnit(radialFraction);
  return PROFILE.outerFactor +
    (PROFILE.innerFactor - PROFILE.outerFactor) *
    Math.pow(1 - q, PROFILE.exponent);
}

/** Integral of the local multiplier from the North Pole to base fraction q. */
export function integratedRadialDistanceMultiplier(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  const q = clampUnit(baseFraction);
  const taper = PROFILE.innerFactor - PROFILE.outerFactor;
  return PROFILE.outerFactor * q +
    taper * (1 - Math.pow(1 - q, PROFILE.exponent + 1)) /
      (PROFILE.exponent + 1);
}

/** Mean local multiplier; integrating it preserves the configured disk rim. */
export const RADIAL_DISTANCE_PROFILE_MEAN =
  integratedRadialDistanceMultiplier(1);

/** Baseline linear-profile step, retained for the calibration reference table. */
export const RADIAL_DISTANCE_CIRCLE_STEP =
  (RADIAL_DISTANCE_INNER_FACTOR - RADIAL_DISTANCE_OUTER_FACTOR) /
  (RADIAL_DISTANCE_CIRCLE_COUNT - 1);

/** Exact local multipliers sampled at the 12 equally spaced base-ring anchors. */
export const RADIAL_DISTANCE_CIRCLE_FACTORS = Object.freeze(
  Array.from({ length: RADIAL_DISTANCE_CIRCLE_COUNT }, (_, index) =>
    radialDistanceCorrectionFactor(index / (RADIAL_DISTANCE_CIRCLE_COUNT - 1))
  )
);

/**
 * Convert base radius q to the normalized radius used by the canvas. The
 * normalization keeps the outer Ice Wall fixed at the disk boundary.
 */
export function visualRadialFractionFromBaseFraction(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  return integratedRadialDistanceMultiplier(baseFraction) /
    RADIAL_DISTANCE_PROFILE_MEAN;
}

/** Shared 12 reference positions for the radial-calibration table and map. */
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

/** Inverse of the integrated profile, solved monotonically for any fitted taper. */
export function baseRadialFractionFromVisualFraction(visualFraction) {
  if (!Number.isFinite(visualFraction)) return NaN;
  const target = clampUnit(visualFraction);
  if (target === 0 || target === 1) return target;

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 64; iteration++) {
    const midpoint = (lower + upper) / 2;
    const projected = visualRadialFractionFromBaseFraction(midpoint);
    if (projected < target) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
}

/** Local radial spacing derivative dq_visual/dq, in normalized screen units. */
export function visualRadialSpacingScale(baseFraction) {
  if (!Number.isFinite(baseFraction)) return NaN;
  return radialDistanceCorrectionFactor(baseFraction) /
    RADIAL_DISTANCE_PROFILE_MEAN;
}
