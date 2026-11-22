import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_PATH_PROFILE,
  FLIGHT_PATH_PROFILE_EXPONENT_CANDIDATES,
  normalizeFlightTrack,
  unitProjectedFlightPathLength,
  summarizeFlightPathCoverage,
  fitFlightPathCalibration
} from '../src/core/flight-path-calibration.js';
import { DEFAULT_RADIAL_WARP } from '../src/core/radial-warp.js';

const close = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('normalizes timestamped GeoJSON flight paths and preserves sequence boundaries', () => {
  const path = {
    type: 'MultiLineString',
    coordinates: [
      [[10, 40, 35000], [11, 41, 36000]],
      [[100, -20, 37000], [101, -21, 37000]]
    ]
  };
  const timestamps = [[1000, 1060], [2000, 2080]];
  const normalized = normalizeFlightTrack(path, timestamps);
  assert.deepEqual(normalized.trackCoordinates, path.coordinates);
  assert.deepEqual(normalized.trackTimestamps, timestamps);
  assert.equal(normalized.trackPointCount, 4);
});

test('rejects path/timestamp misalignment, invalid coordinates and non-monotonic times', () => {
  const line = {type:'MultiLineString', coordinates:[[[0,0,0],[1,1,0]]]};
  assert.equal(normalizeFlightTrack(line, []), null);
  assert.equal(normalizeFlightTrack({
    type:'MultiLineString',
    coordinates:[[[0,0,0],[181,1,0]]]
  }, [[1000,2000]]), null);
  assert.equal(normalizeFlightTrack(line, [[1000,900]]), null);
  assert.equal(normalizeFlightTrack({type:'LineString',coordinates:[]}, []), null);
});

test('projected flight-path length respects independent sequence breaks', () => {
  const first = [[-20, 20, 35000], [-19, 21, 35000]];
  const second = [[100, -10, 35000], [101, -11, 35000]];
  const separated = unitProjectedFlightPathLength([first, second]);
  const incorrectlyJoined = unitProjectedFlightPathLength([[...first, ...second]]);
  assert.ok(Number.isFinite(separated) && separated > 0);
  assert.ok(incorrectlyJoined > separated);
});

function syntheticDataset() {
  const radialWarp = {...DEFAULT_RADIAL_WARP, exponent:0.9};
  const routes = [];
  const trainingCount = 24;
  const holdoutCount = 7;
  const scaleKm = 5200;

  for (let index = 0; index < trainingCount + holdoutCount; index++) {
    const split = index < trainingCount ? 'train' : 'holdout';
    const localIndex = split === 'train' ? index : index - trainingCount;
    const southern = split === 'train' ? localIndex < 5 : localIndex < 3;
    const polar = split === 'train' ? localIndex < 2 : localIndex === 0;
    const startLat = polar
      ? -64 - (localIndex % 2) * 2
      : southern ? -34 - (localIndex % 4) * 1.5 : 12 + (localIndex % 8) * 4.5;
    const endLat = startLat + (polar ? 2.5 : southern ? 3.5 : 5 + (localIndex % 3));
    const startLon = -150 + index * 8;
    const endLon = startLon + 2.5 + (index % 5) * 0.7;
    const coordinates = [
      [
        [startLon, startLat, 35000],
        [startLon + 0.6, startLat + 0.8, 35000],
        [startLon + 1.4, endLat - 0.7, 36000],
        [endLon, endLat, 36000]
      ]
    ];
    const unitLength = unitProjectedFlightPathLength(coordinates, radialWarp);
    const observations = Array.from({length:3}, (_,sample) => ({
      accepted: true,
      observedTrackKm: unitLength * scaleKm * (1 + (sample - 1) * 0.0005),
      coverage: 1,
      maxGapMinutes: 0,
      trackCoordinates: coordinates,
      startTs: '1970-01-01T00:16:40Z',
      endTs: '1970-01-01T00:41:40Z',
      trackTimestamps: [[1000,1500,2000,2500]],
      trackPointCount: 4
    }));
    routes.push({
      routeId: `SYNTH-${index}`,
      split,
      airportA:{ident:`A${index}`,lat:startLat,lon:startLon},
      airportB:{ident:`B${index}`,lat:endLat,lon:endLon},
      observations
    });
  }

  return {
    schemaVersion:4,
    measurement:{
      coverageDenominator:'full-flight-duration',
      distancePolicy:'observed-only'
    },
    source:{retrievedAt:'2026-11-22T00:00:00Z'},
    routes
  };
}

test('path coverage counts independent route splits and southern observations', () => {
  const coverage = summarizeFlightPathCoverage(syntheticDataset());
  assert.equal(coverage.trainingRouteCount, 24);
  assert.equal(coverage.holdoutRouteCount, 7);
  assert.equal(coverage.trainingRoutesSouthOf30S, 5);
  assert.equal(coverage.holdoutRoutesSouthOf30S, 3);
  assert.equal(coverage.trainingRoutesSouthOf45S, 2);
  assert.equal(coverage.holdoutRoutesSouthOf45S, 1);
  assert.equal(coverage.trainingRoutesSouthOf60S, 2);
  assert.equal(coverage.holdoutRoutesSouthOf60S, 1);
  assert.equal(coverage.trainingFlightsWithPaths, 72);
  assert.equal(coverage.holdoutFlightsWithPaths, 21);
  assert.equal(coverage.totalTrajectoryPoints, 372);
});

test('path coverage rejects incomplete telemetry and gaps over 15 minutes', () => {
  const dataset = syntheticDataset();
  dataset.routes[0].observations[0].trackTimestamps[0][1] = 2000;
  dataset.routes[0].observations[0].trackTimestamps[0][2] = 2300;
  const coverage = summarizeFlightPathCoverage(dataset);
  assert.equal(coverage.trainingRouteCount, 23);

  const incomplete = syntheticDataset();
  incomplete.routes[1].observations[0].endTs = '1970-01-01T01:06:40Z';
  const incompleteCoverage = summarizeFlightPathCoverage(incomplete);
  assert.equal(incompleteCoverage.trainingRouteCount, 23);

  const outOfBounds = syntheticDataset();
  for (const observation of outOfBounds.routes[2].observations) {
    observation.trackTimestamps = observation.trackTimestamps.map(sequence =>
      sequence.map(timestamp => timestamp + 60)
    );
  }
  const outOfBoundsCoverage = summarizeFlightPathCoverage(outOfBounds);
  assert.equal(outOfBoundsCoverage.trainingRouteCount, 23);
});

test('path fit recovers a known radial scale and warp on independent held-out routes', () => {
  const result = fitFlightPathCalibration(syntheticDataset());
  assert.equal(result.model.radialProfile.innerFactor, FLIGHT_PATH_PROFILE.innerFactor);
  assert.equal(result.model.radialProfile.outerFactor, FLIGHT_PATH_PROFILE.outerFactor);
  assert.ok(Math.abs(result.model.radialProfile.exponent - 1) < 1e-12);
  assert.equal(result.metrics.selectedProfileExponent, 1);
  assert.equal(
    result.metrics.profileExponentCandidatesTested,
    FLIGHT_PATH_PROFILE_EXPONENT_CANDIDATES.length
  );
  assert.ok(Math.abs(result.model.radialWarp.exponent - 0.9) <= 0.025);
  close(result.model.radialScaleKm, 5200, 3);
  assert.ok(result.metrics.training.meanAbsolutePercent < 0.1);
  assert.ok(result.metrics.holdout.meanAbsolutePercent < 0.1);
  assert.ok(result.metrics.leaveOneOut.meanAbsolutePercent < 0.1);
  assert.equal(result.metrics.holdout.routeCount, 7);
});

test('path fit rejects routes that pass timestamp checks but have zero projected length', () => {
  const dataset = syntheticDataset();
  const zeroPathRoutes = [
    ...dataset.routes.filter(route => route.split === 'train').slice(0, 5),
    ...dataset.routes.filter(route => route.split === 'holdout').slice(0, 1)
  ];
  for (const route of zeroPathRoutes) {
    for (const observation of route.observations) {
      const coordinate = observation.trackCoordinates[0][0];
      observation.trackCoordinates = [[
        [...coordinate], [...coordinate], [...coordinate], [...coordinate]
      ]];
    }
  }

  const reportedCoverage = summarizeFlightPathCoverage(dataset);
  assert.equal(reportedCoverage.trainingRouteCount, 24);
  assert.equal(reportedCoverage.holdoutRouteCount, 7);
  assert.throws(
    () => fitFlightPathCalibration(dataset),
    /Insufficient usable projected-path airport-pair coverage/
  );
});

test('usable projected-path coverage independently enforces southern and polar route coverage', () => {
  const dataset = syntheticDataset();
  const polarHoldout = dataset.routes.find(route =>
    route.split === 'holdout' &&
    Math.min(route.airportA.lat, route.airportB.lat) <= -60
  );
  assert.ok(polarHoldout);
  for (const observation of polarHoldout.observations) {
    const coordinate = observation.trackCoordinates[0][0];
    observation.trackCoordinates = [[
      [...coordinate], [...coordinate], [...coordinate], [...coordinate]
    ]];
  }

  const candidate = fitFlightPathCalibration(dataset);
  assert.equal(candidate.metrics.spatialCoverage.holdoutRoutesSouthOf60S, 1);
  assert.equal(candidate.metrics.usableProjectedPathCoverage.holdoutRouteCount, 6);
  assert.equal(candidate.metrics.usableProjectedPathCoverage.holdoutRoutesSouthOf30S, 2);
  assert.equal(candidate.metrics.usableProjectedPathCoverage.holdoutRoutesSouthOf45S, 0);
  assert.equal(candidate.metrics.usableProjectedPathCoverage.holdoutRoutesSouthOf60S, 0);
});

test('path fit refuses legacy or non-observed-only datasets', () => {
  const dataset = syntheticDataset();
  dataset.schemaVersion = 3;
  assert.throws(() => fitFlightPathCalibration(dataset), /schema-4 observed-only/);
  dataset.schemaVersion = 4;
  dataset.measurement.distancePolicy = 'imputed';
  assert.throws(() => fitFlightPathCalibration(dataset), /schema-4 observed-only/);
});


test('candidate radial-profile exponents alter the projected track, not just its reported scale', () => {
  const dataset = syntheticDataset();
  const coordinates = dataset.routes[0].observations[0].trackCoordinates;
  const base = unitProjectedFlightPathLength(coordinates, DEFAULT_RADIAL_WARP, FLIGHT_PATH_PROFILE);
  const shallow = unitProjectedFlightPathLength(coordinates, DEFAULT_RADIAL_WARP, {
    ...FLIGHT_PATH_PROFILE, exponent: 0.7
  });
  const steep = unitProjectedFlightPathLength(coordinates, DEFAULT_RADIAL_WARP, {
    ...FLIGHT_PATH_PROFILE, exponent: 1.3
  });
  assert.ok(Number.isFinite(base) && base > 0);
  assert.ok(Number.isFinite(shallow) && shallow > 0);
  assert.ok(Number.isFinite(steep) && steep > 0);
  assert.notEqual(shallow, base);
  assert.notEqual(steep, base);
  assert.notEqual(shallow, steep);
});
