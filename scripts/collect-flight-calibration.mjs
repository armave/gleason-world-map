#!/usr/bin/env node
/**
 * Collect reproducible flown-distance benchmarks from historical ADS-B.
 *
 * Target mileage is integrated from ground speed and elapsed time only:
 *   track_km = sum(ground_speed_knots * elapsed_seconds / 3600) * 1.852
 *
 * Flight coordinates are not used to calculate a distance. Airport geometry
 * is used only by the upstream query API to retrieve flights for an airport
 * pair; airport lat/lon are retained only as flat-disk endpoint coordinates.
 */
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';

const API_ROOT = 'https://adsb.aero/api/v1';
const OUTPUT_PATH = 'data/flight-calibration.json';
const KNOT_TO_KM_PER_HOUR = 1.852;
const MIN_AIRBORNE_SPEED_KT = 40;
const MAX_AIRBORNE_SPEED_KT = 750;
const MIN_FLIGHT_MINUTES = 35;
const MIN_TELEMETRY_COVERAGE = 0.60;
const MIN_SPEED_INTERVALS = 3;
const MAX_CONCURRENT_DETAILS = 4;
const AIRPORT_FALLBACK_RADIUS_METERS = 20000;

const ROUTES = [
  { from: 'KJFK', to: 'EGLL', split: 'train' },
  { from: 'EGLL', to: 'WSSS', split: 'train' },
  { from: 'KORD', to: 'VHHH', split: 'train' },
  { from: 'EFHK', to: 'RJAA', split: 'train' },
  { from: 'EGLL', to: 'OMDB', split: 'train' },
  { from: 'EHAM', to: 'KLAX', split: 'train' },
  { from: 'LFPG', to: 'VIDP', split: 'train' },
  { from: 'WMKK', to: 'EGLL', split: 'train' },
  { from: 'EGLL', to: 'KDFW', split: 'train' },
  { from: 'SCEL', to: 'YSSY', split: 'train' },
  { from: 'OMDB', to: 'WSSS', split: 'holdout' },
  { from: 'OTHH', to: 'RJAA', split: 'holdout' },
  { from: 'LTFM', to: 'OJAI', split: 'holdout' }
];

function option(name, fallback) {
  const prefix = '--' + name + '=';
  const value = process.argv.find(argument => argument.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number(value.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const MAX_PAGES_PER_ROUTE = option('max-pages-per-route', 16);
const SAMPLES_PER_ROUTE = option('samples-per-route', 5);
const MAX_DETAILS_PER_ROUTE = SAMPLES_PER_ROUTE * 8;
const ROUTE_PAGE_LIMIT = 1000;

const routeKey = (a, b) =>
  [String(a).toUpperCase(), String(b).toUpperCase()].sort().join('--');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function requestJson(url, init = {}, label = url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { accept: 'application/json', ...(init.headers || {}) },
        signal: AbortSignal.timeout(45000)
      });
      if (response.status === 429 || response.status >= 500) {
        const retryHeader = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryHeader) && retryHeader > 0
          ? retryHeader * 1000 : 700 * (2 ** attempt);
        lastError = new Error(label + ': HTTP ' + response.status);
        if (attempt < 4) {
          await sleep(Math.min(waitMs, 15000));
          continue;
        }
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(label + ': HTTP ' + response.status + ' ' + body.slice(0, 300));
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(500 * (2 ** attempt));
    }
  }
  throw lastError || new Error(label + ': request failed');
}

async function getJson(path) {
  return requestJson(API_ROOT + path, {}, path);
}

async function postJson(path, body) {
  return requestJson(API_ROOT + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }, path);
}

function epochSeconds(value) {
  if (typeof value === 'number') return value;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : NaN;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
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
  let acceptedSpeedSum = 0;

  for (const sequence of pathGs) {
    if (!Array.isArray(sequence) || sequence.length < 2) continue;
    for (let index = 0; index < sequence.length - 1; index++) {
      const current = sequence[index];
      const next = sequence[index + 1];
      if (!Array.isArray(current) || !Array.isArray(next)) continue;

      const timestamp = Number(current[0]);
      const nextTimestamp = Number(next[0]);
      const speedKnots = Number(current[1]);
      const deltaSeconds = nextTimestamp - timestamp;
      if (!(deltaSeconds > 0) ||
          !Number.isFinite(speedKnots) ||
          speedKnots < MIN_AIRBORNE_SPEED_KT ||
          speedKnots > MAX_AIRBORNE_SPEED_KT) continue;

      // Knots are nautical miles/hour; this scalar integration is the sole
      // source of target mileage. No path coordinate enters the calculation.
      nauticalMiles += speedKnots * (deltaSeconds / 3600);
      coveredSeconds += deltaSeconds;
      acceptedSpeedSum += speedKnots;
      intervalCount++;
    }
  }

  const coverage = Math.min(1, coveredSeconds / durationSeconds);
  const trackKm = nauticalMiles * KNOT_TO_KM_PER_HOUR;
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

function airportGeometry(airport) {
  const published = Array.isArray(airport.airspaces) && airport.airspaces.length
    ? airport.airspaces[0].geometry : null;
  if (published && (published.type === 'Polygon' || published.type === 'MultiPolygon')) {
    return published;
  }
  return {
    type: 'Circle',
    coordinates: [airport.lon, airport.lat],
    radius: AIRPORT_FALLBACK_RADIUS_METERS
  };
}

function coordinatesFromPoint(point) {
  const coordinates = point && point.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return null;
  return { lat, lon };
}

async function mapLimit(items, limit, callback) {
  const output = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      output[index] = await callback(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function fetchFlightDetail(candidate, airportA, airportB, counters) {
  try {
    const detail = await getJson('/flights/' + encodeURIComponent(candidate.flight_id));
    const integrated = integrateGroundSpeedSeries(
      detail.path_gs,
      detail.start_ts,
      detail.end_ts
    );
    if (!integrated.accepted) {
      counters[integrated.reason] = (counters[integrated.reason] || 0) + 1;
      return null;
    }
    return {
      flightId: detail.flight_id,
      callsign: detail.callsign || null,
      icaoType: detail.icao_type || null,
      operator: detail.operator || null,
      startTs: detail.start_ts,
      endTs: detail.end_ts,
      startAirportIdent: detail.start_airport_ident || null,
      endAirportIdent: detail.end_airport_ident || null,
      startPoint: coordinatesFromPoint(detail.start_point),
      endPoint: coordinatesFromPoint(detail.end_point),
      rawPointCount: detail.raw_point_count === undefined ? null : detail.raw_point_count,
      pointCount: detail.point_count === undefined ? null : detail.point_count,
      ...integrated
    };
  } catch (error) {
    counters.detailRequestFailed = (counters.detailRequestFailed || 0) + 1;
    console.warn('Skipping flight ' + candidate.flight_id + ': ' + error.message);
    return null;
  }
}

async function collectRoute(route, airports, endDate) {
  const airportA = airports.get(route.from);
  const airportB = airports.get(route.to);
  const counters = {};
  const observations = [];
  const seen = new Set();
  let cursor = null;
  let pagesScanned = 0;
  let candidatesSeen = 0;

  if (!airportA || !airportB) {
    return { route, airportA, airportB, observations, counters: { airportLookupFailed: 1 }, pagesScanned, candidatesSeen };
  }

  const geometryA = airportGeometry(airportA);
  const geometryB = airportGeometry(airportB);
  const match = {
    or: [
      {
        and: [
          { endpoint_within: { mode: 'start', geometry: geometryA } },
          { endpoint_within: { mode: 'end', geometry: geometryB } }
        ]
      },
      {
        and: [
          { endpoint_within: { mode: 'start', geometry: geometryB } },
          { endpoint_within: { mode: 'end', geometry: geometryA } }
        ]
      }
    ]
  };

  for (let pageNumber = 0; pageNumber < MAX_PAGES_PER_ROUTE; pageNumber++) {
    const body = {
      match,
      end_date: endDate,
      window_days: 7,
      limit: ROUTE_PAGE_LIMIT,
      include_path: false,
      ...(cursor ? { cursor } : {})
    };
    const page = await postJson('/query', body);
    pagesScanned++;
    const flights = Array.isArray(page.flights) ? page.flights : [];
    const candidates = flights.filter(flight => {
      if (!flight.flight_id || seen.has(flight.flight_id)) return false;
      seen.add(flight.flight_id);
      return true;
    });
    candidatesSeen += candidates.length;

    const details = await mapLimit(candidates, MAX_CONCURRENT_DETAILS, async candidate => {
      await sleep(60);
      return fetchFlightDetail(candidate, airportA, airportB, counters);
    });

    for (const observation of details) {
      if (observation) observations.push(observation);
      if (observations.length >= SAMPLES_PER_ROUTE) break;
    }

    console.log(
      route.from + '-' + route.to + ': page ' + (pageNumber + 1) +
      ', summaries ' + flights.length +
      ', candidates ' + candidates.length +
      ', accepted telemetry ' + observations.length + '/' + SAMPLES_PER_ROUTE
    );
    if (observations.length >= SAMPLES_PER_ROUTE || !page.cursor) break;
    cursor = page.cursor;
  }

  observations.sort((a, b) => String(a.startTs).localeCompare(String(b.startTs)));
  return { route, airportA, airportB, observations, counters, pagesScanned, candidatesSeen };
}

async function collect() {
  const dataRange = await getJson('/data-range');
  if (!dataRange || !dataRange.last_date) {
    throw new Error('ADS-B archive did not return a last_date.');
  }

  const airportCodes = [...new Set(ROUTES.flatMap(route => [route.from, route.to]))];
  const airports = new Map();
  const airportErrors = {};
  await mapLimit(airportCodes, 4, async code => {
    try {
      const airport = await getJson('/airports/' + encodeURIComponent(code));
      if (Number.isFinite(airport.lat) && Number.isFinite(airport.lon)) {
        airports.set(code, {
          ident: airport.ident,
          iataCode: airport.iata_code,
          name: airport.name,
          lat: airport.lat,
          lon: airport.lon,
          country: airport.country,
          airspaces: airport.airspaces || []
        });
      }
    } catch (error) {
      airportErrors[code] = error.message;
    }
  });

  const endDate = dataRange.last_date + 'T23:59:59Z';
  const results = [];
  for (const route of ROUTES) {
    const result = await collectRoute(route, airports, endDate);
    results.push(result);
    const counterSummary = Object.entries(result.counters)
      .map(([key, count]) => key + '=' + count).join(', ') || 'none';
    console.log(
      'Route summary ' + route.from + '-' + route.to +
      ': ' + result.observations.length + ' accepted; ' +
      result.candidatesSeen + ' candidate details; filters: ' + counterSummary
    );
  }

  const outputRoutes = results.map(result => {
    const distances = result.observations.map(item => item.trackKm);
    return {
      routeId: routeKey(result.route.from, result.route.to),
      directionListed: result.route.from + '-' + result.route.to,
      split: result.route.split,
      airportA: result.airportA ? {
        ident: result.airportA.ident,
        iataCode: result.airportA.iataCode,
        name: result.airportA.name,
        lat: result.airportA.lat,
        lon: result.airportA.lon,
        country: result.airportA.country
      } : null,
      airportB: result.airportB ? {
        ident: result.airportB.ident,
        iataCode: result.airportB.iataCode,
        name: result.airportB.name,
        lat: result.airportB.lat,
        lon: result.airportB.lon,
        country: result.airportB.country
      } : null,
      sampleCount: result.observations.length,
      medianTrackKm: percentile(distances, 0.5),
      p10TrackKm: percentile(distances, 0.1),
      p90TrackKm: percentile(distances, 0.9),
      medianDurationMinutes: percentile(result.observations.map(item => item.durationMinutes), 0.5),
      telemetryDiagnostics: result.counters,
      pagesScanned: result.pagesScanned,
      candidatesSeen: result.candidatesSeen,
      observations: result.observations
    };
  });

  const trainRoutes = outputRoutes.filter(route => route.split === 'train' && route.sampleCount >= 3);
  const holdoutRoutes = outputRoutes.filter(route => route.split === 'holdout' && route.sampleCount >= 3);
  const result = {
    schemaVersion: 2,
    dataset: 'Flight-track distance benchmarks for the Gleason flat-disk map',
    source: {
      provider: 'adsb.lol historical ADS-B archive',
      accessApi: 'https://adsb.aero/api/docs',
      apiRoot: API_ROOT,
      archiveUrl: 'https://www.adsb.lol/docs/open-data/historical',
      license: 'Open Database License 1.0 (ODbL-1.0)',
      attribution: 'Contains data from the adsb.lol open ADS-B archive; ODbL 1.0.',
      retrievedAt: new Date().toISOString(),
      availableRange: dataRange
    },
    measurement: {
      target: 'Observed flown-path length estimated by integrating measured ADS-B ground speed over elapsed time',
      method: 'Integrate step-interpolated path_gs values within each contiguous time-series sequence; do not bridge missing-data gaps.',
      formula: 'track_km = sum(speed_knots * delta_seconds / 3600) * 1.852',
      units: 'ground speed in knots; elapsed time in seconds; nautical miles converted to kilometres using 1.852',
      filters: {
        minSpeedKnots: MIN_AIRBORNE_SPEED_KT,
        maxSpeedKnots: MAX_AIRBORNE_SPEED_KT,
        minFlightMinutes: MIN_FLIGHT_MINUTES,
        minTelemetryCoverage: MIN_TELEMETRY_COVERAGE,
        minSpeedIntervals: MIN_SPEED_INTERVALS
      },
      explicitlyNotUsed: [
        'API path_length_m',
        'latitude/longitude-derived distances',
        'great-circle, spherical, ellipsoidal, or geodesic calculations',
        'scheduled flight times or estimated cruise-speed averages'
      ],
      airportBoundaryUse: 'Airport airspace polygons, or a 20 km airport-centred fallback circle, are used only by the source API to identify flights departing and arriving at the selected airports. No airport or trajectory coordinates enter the track-distance integration.'
    },
    collection: {
      endDate,
      maxPagesPerRoute: MAX_PAGES_PER_ROUTE,
      samplesPerRouteTarget: SAMPLES_PER_ROUTE,
      routesWithAtLeastThreeTrainFlights: trainRoutes.length,
      routesWithAtLeastThreeHoldoutFlights: holdoutRoutes.length,
      airportLookupErrors: airportErrors
    },
    routes: outputRoutes
  };

  await mkdir('data', { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');

  console.log('FLIGHT_CALIBRATION_DATA_BEGIN');
  console.log(JSON.stringify(result, null, 2));
  console.log('FLIGHT_CALIBRATION_DATA_END');
  console.log('Wrote ' + OUTPUT_PATH);
  console.log(
    'Usable routes: ' + trainRoutes.length + ' train, ' +
    holdoutRoutes.length + ' holdout (minimum 3 observed flights per route).'
  );
}

collect().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
