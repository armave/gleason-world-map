export const HISTORICAL_SCAN_URL = 'https://iiif.digitalcommonwealth.org/commonwealth:7h149v867/full/,2048/0/default.jpg';

export const MAP_QUALITY_OPTIONS = Object.freeze({
  low: { label: 'Low · fastest', scale: '1:110m' },
  medium: { label: 'Medium · balanced', scale: '1:50m' },
  high: { label: 'High · detailed', scale: '1:10m' }
});

export const COUNTRY_DATA_FILES = Object.freeze({
  low: new URL('../../data/countries/low.geojson.gz', import.meta.url),
  medium: new URL('../../data/countries/medium.geojson.gz', import.meta.url),
  high: new URL('../../data/countries/high.geojson.gz', import.meta.url)
});
export const CAPITAL_DATA_FILE = new URL('../../data/capitals.json', import.meta.url);

export function validateCountryDataset(data) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length < 150) {
    throw new Error('The bundled country boundary dataset is invalid or incomplete.');
  }
  const hasAntarctica = data.features.some(feature => {
    const p = feature?.properties || {};
    return [p.ISO_A3_EH, p.ISO_A3, p.ADM0_A3, p.SOV_A3].includes('ATA') || p.ADMIN === 'Antarctica';
  });
  if (!hasAntarctica) throw new Error('The bundled country boundaries do not contain Antarctica.');
  return data;
}

export function validateCapitalDataset(data) {
  if (!Array.isArray(data) || data.length < 150 || !data.some(point =>
    point?.iso === 'ARM' && String(point.city).toLowerCase() === 'yerevan'
  )) {
    throw new Error('The bundled capital-coordinate dataset is invalid or incomplete.');
  }
  for (const point of data) {
    if (!point.iso || !point.city || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
        point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) {
      throw new Error('The bundled capital-coordinate dataset contains an invalid record.');
    }
  }
  return data;
}

export async function loadCountryDataset(quality = 'medium') {
  if (!Object.hasOwn(COUNTRY_DATA_FILES, quality)) throw new Error(`Unknown map quality: ${quality}`);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support local gzip decompression. Please use a current browser version.');
  }
  const response = await fetch(COUNTRY_DATA_FILES[quality]);
  if (!response.ok) throw new Error(`Unable to load the bundled ${quality} country boundaries (HTTP ${response.status}).`);
  if (!response.body) throw new Error('The bundled country-boundary response has no data stream.');
  const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(decompressed).text();
  let data;
  try { data = JSON.parse(text); }
  catch (error) { throw new Error(`The bundled ${quality} country boundaries are not valid JSON: ${error.message}`); }
  return validateCountryDataset(data);
}

export async function loadCapitalDataset() {
  const response = await fetch(CAPITAL_DATA_FILE);
  if (!response.ok) throw new Error(`Unable to load the bundled capital coordinates (HTTP ${response.status}).`);
  let data;
  try { data = await response.json(); }
  catch (error) { throw new Error(`The bundled capital coordinates are not valid JSON: ${error.message}`); }
  return validateCapitalDataset(data);
}

export const COUNTY_DATA_FILE = new URL('../../data/us-counties.json', import.meta.url);
export function validateCountyDataset(data) {
  if (!data || data.schemaVersion !== 1 || data.sourceYear !== 2026 || !Array.isArray(data.counties) || data.counties.length < 3000) {
    throw new Error('The bundled 2026 U.S. county-label dataset is invalid or incomplete.');
  }
  const seen = new Set();
  for (const row of data.counties) {
    if (!Array.isArray(row) || row.length !== 5 || !/^\d{5}$/.test(String(row[0])) ||
        !/^[A-Z]{2}$/.test(String(row[1])) || !String(row[2] || '').trim() ||
        !Number.isFinite(row[3]) || !Number.isFinite(row[4]) || row[3] < -90 || row[3] > 90 ||
        row[4] < -180 || row[4] > 180 || seen.has(row[0])) {
      throw new Error('The bundled county-label dataset contains an invalid or duplicate row.');
    }
    seen.add(row[0]);
  }
  return data.counties.map(([geoid,stateCode,name,lat,lon])=>({geoid,stateCode,name,lat,lon}));
}
export async function loadCountyDataset() {
  const response=await fetch(COUNTY_DATA_FILE);
  if(!response.ok)throw new Error(`Unable to load the bundled U.S. county labels (HTTP ${response.status}).`);
  let data;
  try{data=await response.json();}catch(error){throw new Error(`The bundled county-label data is not valid JSON: ${error.message}`);}
  return validateCountyDataset(data);
}


// Current official county-equivalent polygons from U.S. Census TIGERweb.
// Layer 82 is the January 1, 2026 Counties layer (TIGERweb ACS2026).
export const COUNTY_BOUNDARY_SERVICE_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2026/MapServer/82';

export function validateCountyBoundaryDataset(data) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length < 3000) {
    throw new Error('The Census 2026 county-boundary response is invalid or incomplete.');
  }
  const seen = new Set();
  for (const feature of data.features) {
    const p = feature?.properties || {};
    const geoid = String(p.GEOID || '');
    const state = String(p.STATE || '');
    const name = String(p.BASENAME || p.NAME || '').trim();
    const lat = Number(p.INTPTLAT), lon = Number(p.INTPTLON);
    const geometry = feature?.geometry;
    if (!/^\\d{5}$/.test(geoid) || !/^\\d{2}$/.test(state) || !name ||
        !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 ||
        lon < -180 || lon > 180 || !geometry ||
        !['Polygon', 'MultiPolygon'].includes(geometry.type) ||
        !Array.isArray(geometry.coordinates) || seen.has(geoid)) {
      throw new Error('The Census 2026 county-boundary response contains an invalid or duplicate feature.');
    }
    seen.add(geoid);
  }
  return data;
}

export async function loadCountyBoundaryDataset() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'GEOID,STATE,BASENAME,NAME,INTPTLAT,INTPTLON',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '5',
    maxAllowableOffset: '0.002',
    resultRecordCount: '10000',
    f: 'geojson'
  });
  const response = await fetch(`${COUNTY_BOUNDARY_SERVICE_URL}/query?${params}`, {
    headers: { Accept: 'application/geo+json, application/json' }
  });
  if (!response.ok) {
    throw new Error(`Unable to load 2026 Census county polygons (HTTP ${response.status}).`);
  }
  let data;
  try { data = await response.json(); }
  catch (error) { throw new Error(`The Census county-boundary response is not valid JSON: ${error.message}`); }
  if (data?.error) {
    throw new Error(data.error.message || 'The Census county-boundary service returned an error.');
  }
  return validateCountyBoundaryDataset(data);
}
