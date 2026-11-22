/**
 * Calibration mileage from recorded ADS-B ground-speed telemetry.
 *
 * Only the actually observed speed × time integral is eligible for fitting.
 * Missing intervals are never expanded or imputed. Flights are rejected if
 * full-flight coverage is below 98% or any unsupported gap exceeds 15 minutes.
 * Geographic coordinates and route geometry are absent from this module.
 */
export const FLIGHT_TELEMETRY_FILTERS = Object.freeze({
  knotsToKm: 1.852,
  minSpeedKnots: 40,
  maxSpeedKnots: 750,
  minFlightMinutes: 35,
  minCoverage: 0.98,
  maxTelemetryGapMinutes: 15,
  maxSpeedSampleIntervalSeconds: 900,
  minSpeedIntervals: 8
});

const KNOT_TO_KM = FLIGHT_TELEMETRY_FILTERS.knotsToKm;
const MIN_AIRBORNE_SPEED_KT = FLIGHT_TELEMETRY_FILTERS.minSpeedKnots;
const MAX_AIRBORNE_SPEED_KT = FLIGHT_TELEMETRY_FILTERS.maxSpeedKnots;
const MIN_FLIGHT_MINUTES = FLIGHT_TELEMETRY_FILTERS.minFlightMinutes;
const MIN_TELEMETRY_COVERAGE = FLIGHT_TELEMETRY_FILTERS.minCoverage;
const MIN_SPEED_INTERVALS = FLIGHT_TELEMETRY_FILTERS.minSpeedIntervals;

function epochSeconds(value) {
  if (typeof value === 'number') return value;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : NaN;
}

/**
 * Integrate step-interpolated ADS-B ground speed within each contiguous
 * subsequence. No gap between subsequences is directly filled with invented
 * speed. To estimate the full telemetry-span distance, observed mean ground
 * speed is expanded across the full timestamp span and reported with coverage.
 *
 * pathGs[i][j] is [unixSeconds, knots], forward-filled to the next timestamp.
 */
export function integrateGroundSpeedSeries(pathGs, startTs, endTs) {
  const flightStart = epochSeconds(startTs);
  const flightEnd = epochSeconds(endTs);
  const flightDurationSeconds = flightEnd - flightStart;
  if (!Array.isArray(pathGs) || !(flightDurationSeconds > 0)) {
    return { accepted: false, reason: 'missing-ground-speed-or-duration' };
  }

  const timestamps = pathGs.flatMap(sequence =>
    Array.isArray(sequence)
      ? sequence.filter(item => Array.isArray(item) && Number.isFinite(Number(item[0])))
        .map(item => Number(item[0]))
      : []
  );
  if (timestamps.length < 2) {
    return { accepted: false, reason: 'missing-ground-speed-or-duration' };
  }

  const telemetryStart = Math.min(...timestamps);
  const telemetryEnd = Math.max(...timestamps);
  const telemetrySpanSeconds = telemetryEnd - telemetryStart;
  if (!(telemetrySpanSeconds > 0)) {
    return { accepted: false, reason: 'invalid-telemetry-span' };
  }

  let observedNauticalMiles = 0;
  let coveredSeconds = 0;
  let intervalCount = 0;
  let maxGapSeconds = 0;
  const sequenceBounds = [];

  for (const sequence of pathGs) {
    if (!Array.isArray(sequence) || sequence.length < 2) continue;
    let sequenceStart = Infinity;
    let sequenceEnd = -Infinity;
    for (let index = 0; index < sequence.length - 1; index++) {
      const current = sequence[index];
      const next = sequence[index + 1];
      if (!Array.isArray(current) || !Array.isArray(next)) continue;

      const timestamp = Number(current[0]);
      const nextTimestamp = Number(next[0]);
      const speedKnots = Number(current[1]);
      const intervalStart = Math.max(telemetryStart, timestamp);
      const intervalEnd = Math.min(telemetryEnd, nextTimestamp);
      const deltaSeconds = intervalEnd - intervalStart;
      if (!(deltaSeconds > 0)) continue;
      if (deltaSeconds > FLIGHT_TELEMETRY_FILTERS.maxSpeedSampleIntervalSeconds) {
        // A single speed sample must not be treated as representative across
        // a long blind interval. Leave it uncovered and report the gap.
        maxGapSeconds = Math.max(maxGapSeconds, deltaSeconds);
        continue;
      }

      if (!Number.isFinite(speedKnots) ||
          speedKnots < MIN_AIRBORNE_SPEED_KT ||
          speedKnots > MAX_AIRBORNE_SPEED_KT) {
        maxGapSeconds = Math.max(maxGapSeconds, deltaSeconds);
        continue;
      }

      sequenceStart = Math.min(sequenceStart, intervalStart);
      sequenceEnd = Math.max(sequenceEnd, intervalEnd);
      observedNauticalMiles += speedKnots * (deltaSeconds / 3600);
      coveredSeconds += deltaSeconds;
      intervalCount++;
    }
    if (Number.isFinite(sequenceStart) && Number.isFinite(sequenceEnd)) {
      sequenceBounds.push([sequenceStart, sequenceEnd]);
    }
  }

  maxGapSeconds = Math.max(
    maxGapSeconds,
    telemetryStart - flightStart,
    flightEnd - telemetryEnd,
    0
  );
  const coverage = Math.min(1, coveredSeconds / flightDurationSeconds);
  const observedTrackKm = observedNauticalMiles * KNOT_TO_KM;
  const maxGapMinutes = maxGapSeconds / 60;
  const telemetrySpanMinutes = telemetrySpanSeconds / 60;
  const flightDurationMinutes = flightDurationSeconds / 60;
  const orderedBounds = sequenceBounds.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < orderedBounds.length; index++) {
    maxGapSeconds = Math.max(
      maxGapSeconds,
      orderedBounds[index][0] - orderedBounds[index - 1][1]
    );
  }

  if (intervalCount < MIN_SPEED_INTERVALS) {
    return { accepted: false, reason: 'too-few-speed-intervals', coverage, intervalCount };
  }
  if (telemetrySpanMinutes < MIN_FLIGHT_MINUTES) {
    return { accepted: false, reason: 'flight-too-short', coverage, intervalCount };
  }
  if (maxGapMinutes > FLIGHT_TELEMETRY_FILTERS.maxTelemetryGapMinutes) {
    return {
      accepted: false,
      reason: 'telemetry-gap-too-large',
      coverage,
      intervalCount,
      telemetrySpanMinutes,
      maxGapMinutes
    };
  }
  if (coverage < MIN_TELEMETRY_COVERAGE) {
    return {
      accepted: false,
      reason: 'low-telemetry-coverage',
      coverage,
      intervalCount,
      telemetrySpanMinutes,
      maxGapMinutes
    };
  }
  if (!Number.isFinite(observedTrackKm) || observedTrackKm <= 0) {
    return { accepted: false, reason: 'invalid-integrated-distance', coverage, intervalCount };
  }

  return {
    accepted: true,
    trackKm: observedTrackKm,
    observedTrackKm,
    flightDurationMinutes,
    telemetrySpanMinutes,
    coveredMinutes: coveredSeconds / 60,
    coverage,
    maxGapMinutes,
    meanGroundSpeedKnots: observedNauticalMiles / (coveredSeconds / 3600),
    speedIntervals: intervalCount,
    distanceMethod: 'observed-ground-speed-integral-only'
  };
}
