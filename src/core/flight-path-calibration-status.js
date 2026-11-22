import { FLIGHT_PATH_CALIBRATION_FILTERS } from './flight-path-calibration.js';

/**
 * One shared acceptance check for every user-facing indication of the latest
 * visual-path calibration. The summary is historical build data, so it must
 * be checked against current runtime thresholds rather than trusting an
 * older summary's accepted flag alone.
 */
export function isGloballyValidatedFlightPathCalibration(summary) {
  if (!summary || summary.accepted !== true) return false;
  const limits = FLIGHT_PATH_CALIBRATION_FILTERS;
  const quality = summary.qualityGate;
  if (!quality || typeof quality !== 'object') return false;

  const meetsGlobalCoverage = coverage =>
    !!coverage &&
    Number.isFinite(coverage.trainingRouteCount) &&
    coverage.trainingRouteCount >= limits.minimumTrainingRoutes &&
    Number.isFinite(coverage.holdoutRouteCount) &&
    coverage.holdoutRouteCount >= limits.minimumHoldoutRoutes &&
    Number.isFinite(coverage.trainingRoutesSouthOf30S) &&
    coverage.trainingRoutesSouthOf30S >= limits.minimumSouthernTrainingRoutes &&
    Number.isFinite(coverage.holdoutRoutesSouthOf30S) &&
    coverage.holdoutRoutesSouthOf30S >= limits.minimumSouthernHoldoutRoutes &&
    Number.isFinite(coverage.trainingRoutesSouthOf45S) &&
    coverage.trainingRoutesSouthOf45S >= limits.minimumTrainingRoutesSouthOf45S &&
    Number.isFinite(coverage.holdoutRoutesSouthOf45S) &&
    coverage.holdoutRoutesSouthOf45S >= limits.minimumHoldoutRoutesSouthOf45S &&
    Number.isFinite(coverage.trainingRoutesSouthOf60S) &&
    coverage.trainingRoutesSouthOf60S >= limits.minimumTrainingRoutesSouthOf60S &&
    Number.isFinite(coverage.holdoutRoutesSouthOf60S) &&
    coverage.holdoutRoutesSouthOf60S >= limits.minimumHoldoutRoutesSouthOf60S;

  const projectedCoverage = quality.usableProjectedPathCoverage ||
    summary.metrics?.usableProjectedPathCoverage;
  const activeProjectedCoverage = quality.activeProfileUsableProjectedPathCoverage;
  return meetsGlobalCoverage(quality) &&
    meetsGlobalCoverage(projectedCoverage) &&
    (!activeProjectedCoverage || meetsGlobalCoverage(activeProjectedCoverage));
}
