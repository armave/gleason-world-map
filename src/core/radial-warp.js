/**
 * Smooth, monotonic latitude-to-radius warp used by both the map projection
 * and ADS-B route fitting.
 *
 * t is normalized colatitude in [0, 1]. The regularized power curve preserves
 * the North Pole and outer rim while keeping a finite positive derivative.
 */
export const DEFAULT_RADIAL_WARP = Object.freeze({
  kind: 'regularized-power',
  exponent: 0.9,
  epsilon: 0.005
});

const clampUnit = value => Math.max(0, Math.min(1, value));

function parameters(warp = DEFAULT_RADIAL_WARP) {
  if (!warp || warp.kind !== 'regularized-power' ||
      !Number.isFinite(warp.exponent) || warp.exponent <= 0 ||
      !Number.isFinite(warp.epsilon) || warp.epsilon <= 0) return null;
  const exponent = warp.exponent;
  const epsilon = warp.epsilon;
  const denominator =
    Math.pow(1 + epsilon, exponent) - Math.pow(epsilon, exponent);
  if (!(denominator > 0) || !Number.isFinite(denominator)) return null;
  return { exponent, epsilon, denominator };
}

export function radialFractionFromUnitColatitude(t, warp = DEFAULT_RADIAL_WARP) {
  if (!Number.isFinite(t)) return NaN;
  const normalized = clampUnit(t);
  const config = parameters(warp);
  if (!config) return normalized;
  const { exponent, epsilon, denominator } = config;
  return clampUnit((
    Math.pow(normalized + epsilon, exponent) -
    Math.pow(epsilon, exponent)
  ) / denominator);
}

export function unitColatitudeFromRadialFraction(q, warp = DEFAULT_RADIAL_WARP) {
  if (!Number.isFinite(q)) return NaN;
  const normalized = clampUnit(q);
  const config = parameters(warp);
  if (!config) return normalized;
  const { exponent, epsilon, denominator } = config;
  const powered = normalized * denominator + Math.pow(epsilon, exponent);
  return clampUnit(Math.pow(powered, 1 / exponent) - epsilon);
}

export function radialWarpDerivative(t, warp = DEFAULT_RADIAL_WARP) {
  if (!Number.isFinite(t)) return NaN;
  const normalized = clampUnit(t);
  const config = parameters(warp);
  if (!config) return 1;
  const { exponent, epsilon, denominator } = config;
  return exponent * Math.pow(normalized + epsilon, exponent - 1) / denominator;
}
