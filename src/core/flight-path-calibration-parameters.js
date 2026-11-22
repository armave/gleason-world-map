/** Active visual calibration. Replaced only by an accepted observed-path fit. */
export const FLIGHT_PATH_CALIBRATION = Object.freeze({
  schemaVersion: 1,
  sourceDatasetVersion: 0,
  source: 'legacy-approved-radial-scale-carried-forward; observed-path validation pending',
  trainingRouteCount: 0,
  holdoutRouteCount: 0,
  radialScaleKm: 5385.144981733761,
  radialWarp: {
    kind: 'regularized-power',
    exponent: 0.9,
    epsilon: 0.005
  },
  radialProfile: {
    innerFactor: 1,
    outerFactor: 0.5,
    exponent: 1
  }
});
