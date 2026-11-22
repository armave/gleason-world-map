/**
 * Smooth, periodic longitude remapping for the flat disk.
 * Four Fourier coefficients are fitted from observed ADS-B paths. The radial
 * envelope vanishes at the North Pole and Antarctic Ice Wall, preserving both.
 */
import { FLIGHT_PATH_CALIBRATION } from './flight-path-calibration-parameters.js';

const TAU = Math.PI * 2;
const DEFAULT_WARP = Object.freeze({
  kind: 'anchored-fourier',
  firstSine: 0,
  firstCosine: 0,
  secondSine: 0,
  secondCosine: 0
});

function normalizeWarp(warp) {
  if (!warp || warp.kind !== 'anchored-fourier') return DEFAULT_WARP;
  const keys = ['firstSine', 'firstCosine', 'secondSine', 'secondCosine'];
  if (!keys.every(key => Number.isFinite(warp[key]))) return DEFAULT_WARP;
  return {
    kind: 'anchored-fourier',
    firstSine: warp.firstSine,
    firstCosine: warp.firstCosine,
    secondSine: warp.secondSine,
    secondCosine: warp.secondCosine
  };
}

export const DEFAULT_VISUAL_LONGITUDE_WARP = DEFAULT_WARP;
export const ACTIVE_VISUAL_LONGITUDE_WARP = Object.freeze(
  normalizeWarp(FLIGHT_PATH_CALIBRATION.longitudeWarp || DEFAULT_WARP)
);

const clampUnit = value => Math.max(0, Math.min(1, value));

/** Zero at both disk anchors, maximum at mid-radius. */
export function longitudeWarpEnvelope(baseRadialFraction) {
  if (!Number.isFinite(baseRadialFraction)) return NaN;
  const q = clampUnit(baseRadialFraction);
  return 4 * q * (1 - q);
}

/** Periodic angular displacement before applying the radial envelope. */
export function longitudeWarpHarmonic(longitudeRadians, warp = ACTIVE_VISUAL_LONGITUDE_WARP) {
  if (!Number.isFinite(longitudeRadians)) return NaN;
  const config = normalizeWarp(warp);
  return config.firstSine * Math.sin(longitudeRadians) +
    config.firstCosine * (1 - Math.cos(longitudeRadians)) +
    config.secondSine * Math.sin(2 * longitudeRadians) +
    config.secondCosine * (1 - Math.cos(2 * longitudeRadians));
}

/** Forward map from source longitude to displayed angle. */
export function warpLongitudeRadians(longitudeRadians, baseRadialFraction, warp = ACTIVE_VISUAL_LONGITUDE_WARP) {
  if (!Number.isFinite(longitudeRadians) || !Number.isFinite(baseRadialFraction)) return NaN;
  return longitudeRadians + longitudeWarpEnvelope(baseRadialFraction) *
    longitudeWarpHarmonic(longitudeRadians, warp);
}

/** Angular derivative; positive values prevent foldovers. */
export function longitudeWarpDerivative(longitudeRadians, baseRadialFraction, warp = ACTIVE_VISUAL_LONGITUDE_WARP) {
  if (!Number.isFinite(longitudeRadians) || !Number.isFinite(baseRadialFraction)) return NaN;
  const config = normalizeWarp(warp);
  const harmonicDerivative =
    config.firstSine * Math.cos(longitudeRadians) +
    config.firstCosine * Math.sin(longitudeRadians) +
    2 * config.secondSine * Math.cos(2 * longitudeRadians) +
    2 * config.secondCosine * Math.sin(2 * longitudeRadians);
  return 1 + longitudeWarpEnvelope(baseRadialFraction) * harmonicDerivative;
}

/** Conservative minimum angular stretch over all latitudes and longitudes. */
export function minimumLongitudeWarpStretch(warp = ACTIVE_VISUAL_LONGITUDE_WARP) {
  const config = normalizeWarp(warp);
  let minimumHarmonicDerivative = 0;
  const samples = 4096;
  for (let index = 0; index < samples; index++) {
    const longitude = -Math.PI + TAU * index / samples;
    const derivative =
      config.firstSine * Math.cos(longitude) +
      config.firstCosine * Math.sin(longitude) +
      2 * config.secondSine * Math.cos(2 * longitude) +
      2 * config.secondCosine * Math.sin(2 * longitude);
    minimumHarmonicDerivative = Math.min(minimumHarmonicDerivative, derivative);
  }
  return 1 + minimumHarmonicDerivative;
}

export function maximumLongitudeWarpDisplacementRadians(warp = ACTIVE_VISUAL_LONGITUDE_WARP) {
  const config = normalizeWarp(warp);
  let maximum = 0;
  const samples = 4096;
  for (let index = 0; index < samples; index++) {
    const longitude = -Math.PI + TAU * index / samples;
    maximum = Math.max(maximum, Math.abs(longitudeWarpHarmonic(longitude, config)));
  }
  return maximum;
}

export function wrapRadians(longitudeRadians) {
  if (!Number.isFinite(longitudeRadians)) return NaN;
  return ((longitudeRadians + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** Invert the monotonic longitude warp at a known radial fraction. */
export function unwarpLongitudeRadians(displayedLongitudeRadians, baseRadialFraction, warp = ACTIVE_VISUAL_LONGITUDE_WARP) {
  if (!Number.isFinite(displayedLongitudeRadians) || !Number.isFinite(baseRadialFraction)) return NaN;
  const config = normalizeWarp(warp);
  if (config.firstSine === 0 && config.firstCosine === 0 &&
      config.secondSine === 0 && config.secondCosine === 0) {
    return wrapRadians(displayedLongitudeRadians);
  }
  const q = clampUnit(baseRadialFraction);
  if (q === 0 || q === 1) return wrapRadians(displayedLongitudeRadians);

  let lower = -Math.PI;
  let upper = Math.PI;
  const mappedLower = warpLongitudeRadians(lower, q, config);
  const mappedUpper = warpLongitudeRadians(upper, q, config);
  let target = wrapRadians(displayedLongitudeRadians);
  target += TAU * Math.ceil((mappedLower - target) / TAU);
  if (target > mappedUpper) target -= TAU;

  for (let iteration = 0; iteration < 64; iteration++) {
    const midpoint = (lower + upper) / 2;
    if (warpLongitudeRadians(midpoint, q, config) < target) lower = midpoint;
    else upper = midpoint;
  }
  return wrapRadians((lower + upper) / 2);
}
