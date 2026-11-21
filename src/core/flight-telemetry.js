/**
 * Flight-mileage integration from ADS-B ground-speed telemetry.
 *
 * All outputs are derived from scalar ground speed and timestamps. Geographic
 * coordinates, route geometry, and spherical/ellipsoidal distance methods are
 * deliberately absent from this module.
 */
export const FLIGHT_TELEMETRY_FILTERS = Object.freeze({
  knotsToKm: 1.852,
  minSpeedKnots: 40,
  maxSpeedKnots: 750,
  minFlightMinutes: 35,
  minCoverage: 0.60,
  minSpeedIntervals: 3
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
 * Integrate step-interpolated ADS-B ground speed over contiguous subsequences.
 * pathGs[i][j] is [unixSeconds, knots], forward-filled to the next timestamp.
 * Gaps between subsequences are never bridged.
 */
export function integrateGroundSpeedSeries(pathGs, startTs, endTs) {
  const start = epochSeconds(startTs);
  const end = epochSeconds(endTs);
  const durationSeconds = end - start;
  if (!Array.isArray(pathGs) || !(durationSeconds > 0)) {
    return { accepted: false, reason: 'missing-ground-speed-or-duration' };
  }

  let nauticalMiles = 0;
  let coveredSeconds = 0;
  let intervalCount = 0;

  for (const sequence of pathGs) {
    if (!Array.isArray(sequence) || sequence.length < 2) continue;
    for (let index = 0; index < sequence.length - 1; index++) {
      const current = sequence[index];
      const next = sequence[index + 1];
      if (!Array.isArray(current) || !Array.isArray(next)) continue;

      const timestamp = Number(current[0]);
      const nextTimestamp = Number(next[0]);
      const speedKnots = Number(current[1]);
      const clippedStart = Math.max(start, timestamp);
      const clippedEnd = Math.min(end, nextTimestamp);
      const deltaSeconds = clippedEnd - clippedStart;
      if (!(deltaSeconds > 0) ||
          !Number.isFinite(speedKnots) ||
          speedKnots < MIN_AIRBORNE_SPEED_KT ||
          speedKnots > MAX_AIRBORNE_SPEED_KT) continue;

      // Knots are nautical miles/hour; this scalar integration is the only
      // source of target mileage. No path coordinate enters this calculation.
      nauticalMiles += speedKnots * (deltaSeconds / 3600);
      coveredSeconds += deltaSeconds;
      intervalCount++;
    }
  }

  const coverage = Math.min(1, coveredSeconds / durationSeconds);
  const trackKm = nauticalMiles * KNOT_TO_KM;
  const durationMinutes = durationSeconds / 60;

  if (intervalCount < MIN_SPEED_INTERVALS) {
    return { accepted: false, reason: 'too-few-speed-intervals', coverage, intervalCount };
  }
  if (durationMinutes < MIN_FLIGHT_MINUTES) {
    return { accepted: false, reason: 'flight-too-short', coverage, intervalCount };
  }
  if (coverage < MIN_TELEMETRY_COVERAGE) {
    return { accepted: false, reason: 'low-telemetry-coverage', coverage, intervalCount };
  }
  if (!Number.isFinite(trackKm) || trackKm <= 0) {
    return { accepted: false, reason: 'invalid-integrated-distance', coverage, intervalCount };
  }

  return {
    accepted: true,
    trackKm,
    durationMinutes,
    coveredMinutes: coveredSeconds / 60,
    coverage,
    meanGroundSpeedKnots: nauticalMiles / (coveredSeconds / 3600),
    speedIntervals: intervalCount
  };
}
