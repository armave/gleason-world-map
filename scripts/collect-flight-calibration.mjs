#!/usr/bin/env node
/**
 * Collect reproducible flight-track mileage benchmarks from historical ADS-B.
 *
 * Route mileage is integrated from measured ground speed and time. No
 * latitude/longitude pair is used to calculate a distance.
 */
import process from 'node:process';

const API_ROOT = 'https://adsb.aero/api/v1';
const KNOT_TO_KM_PER_HOUR = 1.852;
const MIN_AIRBORNE_SPEED_KT = 40;
const MAX_AIRBORNE_SPEED_KT = 750;
const MIN_FLIGHT_MINUTES = 35;
const MIN_TELEMETRY_COVERAGE = 0.75;
const MAX_CONCURRENT_DETAILS = 4;

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
  { from: 'OMDB', to: 'WSSS', split: 'holdout' },
  { from: 'OTHH', to: 'RJAA', split: 'holdout' },
  { from: 'OJAI', to: 'LTFM', split: 'holdout' },
  { from: 'SCEL', to: 'YSSY', split: 'train' }
];

function option(name, fallback) {
  const prefix = '--' + name + '=';
  const value = process.argv.find(argument => argument.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number(value.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const MAX_PAGES = option('max-pages', 24);
const SAMPLES_PER_ROUTE = option('samples-per-route', 5);
const MAX_CANDIDATES_PER_ROUTE = SAMPLES_PER_ROUTE * 3;

const routeKey = (a, b) =>
  [String(a).toUpperCase(), String(b).toUpperCase()].sort().join('--');
const routes = new Map(ROUTES.map(route => {
  const key = routeKey(route.from, route.to);
  return [key, {
    ...route,
    key,
    observations: [],
    candidateIds: new Set(),
    airportCodes: [...new Set([route.from, route.to])]
  }];
}));

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
 * pathGs[i][j] is [unixSeconds, knots], with each value forward-filled to the
 * next timestamp. A break between subsequences is never bridged.
 */
export function integrateGroundSpeedSeries(pathGs, startTs, endTs) {
  const start = epochSeconds(startTs);
  const end = epochSeconds(endTs);
  const durationSeconds = end - start;
  if (!Array.isArray(pathGs) || !(durationSeconds > 0)) return null;

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
      const deltaSeconds = nextTimestamp - timestamp;
      if (!(deltaSeconds > 0) ||
          !Number.isFinite(speedKnots) ||
          speedKnots < MIN_AIRBORNE_SPEED_KT ||
          speedKnots > MAX_AIRBORNE_SPEED_KT) continue;

      // Knots are nautical miles per hour. This scalar speed/time integration
      // is the calibration target; no route coordinates enter this formula.
      nauticalMiles += speedKnots * (deltaSeconds / 3600);
      coveredSeconds += deltaSeconds;
      intervalCount++;
    }
  }

  if (intervalCount < 2 || !(coveredSeconds > 0)) return null;
  const coverage = Math.min(1, coveredSeconds / durationSeconds);
  const trackKm = nauticalMiles * KNOT_TO_KM_PER_HOUR;
  const durationMinutes = durationSeconds / 60;
  if (durationMinutes < MIN_FLIGHT_MINUTES ||
      coverage < MIN_TELEMETRY_COVERAGE ||
      !Number.isFinite(trackKm) || trackKm <= 0) return null;

  return {
    trackKm,
    durationMinutes,
    coveredMinutes: coveredSeconds / 60,
    coverage,
    meanGroundSpeedKnots: nauticalMiles / (coveredSeconds / 3600),
    speedIntervals: intervalCount
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

async function collect() {
  const dataRange = await getJson('/data-range');
  if (!dataRange || !dataRange.last_date) {
    throw new Error('ADS-B archive did not return a last_date.');
  }

  let cursor = null;
  const candidateDetails = new Map();
  const windowHistory = [];
  let pagesScanned = 0;

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const body = {
      end_date: dataRange.last_date + 'T23:59:59Z',
      window_days: 7,
      limit: 10000,
      include_path: false,
      ...(cursor ? { cursor } : {})
    };
    const page = await postJson('/query', body);
    pagesScanned++;
    const flights = Array.isArray(page.flights) ? page.flights : [];
    windowHistory.push({
      page: pageNumber + 1,
      windowFrom: page.window_from || null,
      flightsListed: flights.length
    });

    const pageCandidates = [];
    for (const flight of flights) {
      const from = flight.start_airport_ident;
      const to = flight.end_airport_ident;
      if (!from || !to) continue;
      const key = routeKey(from, to);
      const route = routes.get(key);
      if (!route || route.observations.length >= SAMPLES_PER_ROUTE) continue;
      if (route.candidateIds.size >= MAX_CANDIDATES_PER_ROUTE) continue;
      if (!flight.flight_id || candidateDetails.has(flight.flight_id)) continue;

      route.candidateIds.add(flight.flight_id);
      candidateDetails.set(flight.flight_id, { routeKey: key, summary: flight });
      pageCandidates.push({ flightId: flight.flight_id, routeKey: key, summary: flight });
    }

    const details = await mapLimit(pageCandidates, MAX_CONCURRENT_DETAILS, async candidate => {
      await sleep(80);
      try {
        const detail = await getJson('/flights/' + encodeURIComponent(candidate.flightId));
        const integrated = integrateGroundSpeedSeries(
          detail.path_gs,
          detail.start_ts,
          detail.end_ts
        );
        if (!integrated) return null;
        return {
          routeKey: candidate.routeKey,
          flightId: detail.flight_id,
          startTs: detail.start_ts,
          endTs: detail.end_ts,
          startAirportIdent: detail.start_airport_ident,
          endAirportIdent: detail.end_airport_ident,
          startPoint: coordinatesFromPoint(detail.start_point),
          endPoint: coordinatesFromPoint(detail.end_point),
          rawPointCount: detail.raw_point_count === undefined ? null : detail.raw_point_count,
          pointCount: detail.point_count === undefined ? null : detail.point_count,
          ...integrated
        };
      } catch (error) {
        console.warn('Skipping flight ' + candidate.flightId + ': ' + error.message);
        return null;
      }
    });

    for (const observation of details) {
      if (!observation) continue;
      const route = routes.get(observation.routeKey);
      if (route && route.observations.length < SAMPLES_PER_ROUTE) {
        route.observations.push(observation);
      }
    }

    const complete = [...routes.values()].every(route =>
      route.observations.length >= SAMPLES_PER_ROUTE
    );
    const completeCount = [...routes.values()].filter(route =>
      route.observations.length >= SAMPLES_PER_ROUTE
    ).length;
    console.log(
      'Scanned page ' + (pageNumber + 1) + ': ' + flights.length +
      ' flights; ' + pageCandidates.length + ' candidate details; ' +
      completeCount + '/' + routes.size + ' routes at target sample count.'
    );
    if (complete || !page.cursor) break;
    cursor = page.cursor;
  }

  const airports = new Map();
  const airportCodes = [...new Set([...routes.values()].flatMap(route => route.airportCodes))];
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
          country: airport.country
        });
      }
    } catch (error) {
      console.warn('Airport lookup ' + code + ' failed: ' + error.message);
    }
  });

  const outputRoutes = [...routes.values()].map(route => {
    const observations = route.observations
      .sort((a, b) => a.startTs.localeCompare(b.startTs));
    const distances = observations.map(item => item.trackKm);
    const codes = route.key.split('--');
    return {
      routeId: route.key,
      split: route.split,
      airportA: airports.get(codes[0]) || null,
      airportB: airports.get(codes[1]) || null,
      sampleCount: observations.length,
      medianTrackKm: percentile(distances, 0.5),
      p10TrackKm: percentile(distances, 0.1),
      p90TrackKm: percentile(distances, 0.9),
      medianDurationMinutes: percentile(observations.map(item => item.durationMinutes), 0.5),
      observations
    };
  });

  const result = {
    schemaVersion: 1,
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
      target: 'Observed flown path distance estimated from ADS-B ground-speed telemetry',
      method: 'For each contiguous path_gs sequence, forward-fill each ground-speed sample to the next timestamp and integrate speed over elapsed time. Do not bridge breaks between sequences.',
      formula: 'track_km = sum(speed_knots * delta_seconds / 3600) * 1.852',
      units: 'ground speed in knots; elapsed time in seconds; final track distance in kilometres',
      filters: {
        minSpeedKnots: MIN_AIRBORNE_SPEED_KT,
        maxSpeedKnots: MAX_AIRBORNE_SPEED_KT,
        minFlightMinutes: MIN_FLIGHT_MINUTES,
        minTelemetryCoverage: MIN_TELEMETRY_COVERAGE
      },
      explicitlyNotUsed: [
        'path_length_m from the API',
        'latitude/longitude-derived distances',
        'great-circle, spherical, ellipsoidal, or geodesic calculations',
        'scheduled or block flight-time estimates'
      ],
      airportCoordinatesUse: 'Airport coordinates are stored only as endpoint locations for the flat-disk projection; they are never used to calculate the flight-track distance target.'
    },
    collection: {
      pagesScanned,
      samplesPerRouteTarget: SAMPLES_PER_ROUTE,
      maxPages: MAX_PAGES,
      windowHistory
    },
    routes: outputRoutes
  };

  const trainRoutes = outputRoutes.filter(route => route.split === 'train' && route.sampleCount >= 3);
  const holdoutRoutes = outputRoutes.filter(route => route.split === 'holdout' && route.sampleCount >= 3);
  const inadequate = outputRoutes.filter(route => route.sampleCount < 3);

  console.log('FLIGHT_CALIBRATION_DATA_BEGIN');
  console.log(JSON.stringify(result, null, 2));
  console.log('FLIGHT_CALIBRATION_DATA_END');
  console.log('Route coverage: ' + trainRoutes.length + ' train routes, ' +
    holdoutRoutes.length + ' holdout routes with >=3 usable flights; ' +
    inadequate.length + ' routes below 3.');

  if (trainRoutes.length < 6 || holdoutRoutes.length < 2) {
    throw new Error(
      'Insufficient telemetry coverage: require at least 6 train and 2 holdout routes ' +
      'with >=3 usable flights; got ' + trainRoutes.length + ' and ' + holdoutRoutes.length + '.'
    );
  }
}

collect().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
