/**
 * Published coordinate fallbacks for remote Antarctic aerodromes that may not
 * be present in the ADS-B provider's airport index.
 *
 * These coordinates are metadata only: they support route search geometry,
 * endpoint coverage classification and labels. They are never used to
 * calculate observed flown mileage or to change the flat-disk projection.
 */
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
