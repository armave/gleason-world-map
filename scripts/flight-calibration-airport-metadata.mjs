/**
 * Published coordinate fallbacks for remote Antarctic aerodromes that may not
 * be present in the ADS-B provider's airport index.
 *
 * These coordinates are metadata only: they support route search geometry,
 * endpoint coverage classification and labels. They are never used to
 * calculate observed flown mileage or to change the flat-disk projection.
 */
/**
 * Recognized public IATA aliases for airport identifiers used in the collector.
 * The archive's airport index sometimes omits iata_code on remote Antarctic
 * runways, while flight-history summaries may use the public three-letter code.
 */
export const AIRPORT_IDENTIFIER_ALIASES = Object.freeze({
  EGAR: Object.freeze(['QAR']),
  SCGC: Object.freeze(['UGL']),
  SAWB: Object.freeze(['QAB']),
  SCRM: Object.freeze(['TNM']),
  SAWG: Object.freeze(['RGL'])
});

export const ANTARCTIC_AIRPORT_METADATA_FALLBACKS = Object.freeze({
  EGAR: Object.freeze({
    ident: 'EGAR',
    name: 'Rothera Research Station',
    lat: -67.568889,
    lon: -68.1248,
    country: 'AQ',
    coordinateSource: 'https://www.bas.ac.uk/polar-operations/sites-and-facilities/facility/rothera/rothera-air-facility/'
  }),
  SCGC: Object.freeze({
    ident: 'SCGC',
    name: 'Union Glacier Blue-Ice Runway',
    lat: -79.767183,
    lon: -83.267433,
    country: 'AQ',
    coordinateSource: 'https://www.usap.gov/logistics/documents/Air_Operations_Manual.pdf'
  }),
  NZWD: Object.freeze({
    ident: 'NZWD',
    name: 'Williams Field',
    lat: -77.867401,
    lon: 167.057007,
    country: 'AQ',
    coordinateSource: 'https://notac.aero/airports/NZWD/'
  }),
  NZIR: Object.freeze({
    ident: 'NZIR',
    name: 'McMurdo Sound Sea Ice Runway',
    lat: -77.85395,
    lon: 166.46876,
    country: 'AQ',
    coordinateSource: 'https://www.vatnz.net/airspace/airport/NZIR'
  }),
  SAWB: Object.freeze({
    ident: 'SAWB',
    name: 'Marambio Base',
    lat: -64.238297,
    lon: -56.630797,
    country: 'AQ',
    coordinateSource: 'https://opennav.com/airport/SAWB'
  }),
  SCRM: Object.freeze({
    ident: 'SCRM',
    name: 'Teniente Rodolfo Marsh Martin Aerodrome',
    lat: -62.190833,
    lon: -58.986667,
    country: 'AQ',
    coordinateSource: 'https://aipchile.dgac.gob.cl/aerodromo/show?designador=SCRM'
  }),
  YWKS: Object.freeze({
    ident: 'YWKS',
    name: 'Wilkins Aerodrome',
    lat: -66.6908,
    lon: 111.526383,
    country: 'AQ',
    coordinateSource: 'https://www.antarctica.gov.au/antarctic-operations/travel-and-logistics/aviation/intercontinental-operations/wilkins-aerodrome/'
  })
});

/**
 * Prefer the live archive airport record. Use a published remote-airport
 * coordinate only when the archive index has no usable record for that code.
 */
export function resolveCalibrationAirport(code, indexedAirports) {
  const ident = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!ident) return null;
  const indexed = indexedAirports?.get(ident);
  if (indexed && Number.isFinite(indexed.lat) && Number.isFinite(indexed.lon)) {
    return {
      ...indexed,
      metadataSource: 'adsb.aero airport index',
      coordinateSource: 'adsb.aero airport index'
    };
  }
  const fallback = ANTARCTIC_AIRPORT_METADATA_FALLBACKS[ident];
  return fallback
    ? {
        ...fallback,
        iataCode: null,
        airspaces: [],
        metadataSource: 'published coordinate fallback'
      }
    : null;
}

/** A documented Mode-S search can run without airport-index geometry. */
export function routeHasAircraftDiscovery(route) {
  return Array.isArray(route?.icao24) &&
    route.icao24.some(value => typeof value === 'string' && value.trim().length > 0);
}

/** Endpoint-geometry searches require coordinates for both endpoints. */
export function canCollectCalibrationRoute(route, airportA, airportB) {
  return (airportA !== null && airportA !== undefined &&
      airportB !== null && airportB !== undefined) ||
    routeHasAircraftDiscovery(route);
}

/** All exact recognized identifiers for one airport, including its IATA alias. */
export function airportIdentifiers(airport) {
  const ident = typeof airport?.ident === 'string'
    ? airport.ident.trim().toUpperCase() : '';
  const values = [
    ident,
    airport?.iataCode,
    ...(AIRPORT_IDENTIFIER_ALIASES[ident] || [])
  ];
  return new Set(values
    .filter(value => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim().toUpperCase()));
}

/**
 * Match the same airport pair regardless of flight direction or whether the
 * archive reports the ICAO identifier or a published IATA alias.
 */
export function matchesAirportPairIdentifiers(
  airportA, airportB, observedFrom, observedTo
) {
  if (typeof observedFrom !== 'string' || typeof observedTo !== 'string') return false;
  const from = observedFrom.trim().toUpperCase();
  const to = observedTo.trim().toUpperCase();
  if (!from || !to) return false;
  const identifiersA = airportIdentifiers(airportA);
  const identifiersB = airportIdentifiers(airportB);
  return (identifiersA.has(from) && identifiersB.has(to)) ||
    (identifiersB.has(from) && identifiersA.has(to));
}

/**
 * Aircraft-address queries can return summary rows with missing airport IDs.
 * Defer those rows to the detail endpoint, where exact pair matching is still
 * mandatory. Explicit nonmatching IDs are never deferred.
 */
export function shouldDeferSummaryAirportPairCheck(route, observedFrom, observedTo) {
  return routeHasAircraftDiscovery(route) &&
    (typeof observedFrom !== 'string' || !observedFrom.trim() ||
      typeof observedTo !== 'string' || !observedTo.trim());
}
