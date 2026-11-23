/**
 * Build the ADS-B archive predicate used to discover candidate flights for one
 * airport pair. Most routes use the two aerodrome endpoint geometries. Some
 * remote Antarctic aerodromes are outside the archive's usable endpoint index;
 * for a documented aircraft we can query its Mode-S address first, then the
 * collector still requires the returned airport identifiers to match the
 * exact preassigned pair before a flight can count.
 */
export function buildFlightCalibrationRoutePredicate(route, geometryA, geometryB) {
  const addresses = Array.isArray(route?.icao24)
    ? route.icao24.map(value => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
  if (addresses.length) {
    return { icao24: [...new Set(addresses)] };
  }

  return {
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
}


/**
 * Summarize endpoint identifiers returned by broad aircraft-address searches
 * that did not match the route assigned to that aircraft. Keep the observed
 * airport-pair identity and count, but do not let these records enter fitting.
 */
export function summarizeRouteIdentifierMismatches(records, limit = 12) {
  if (!Array.isArray(records) || !Number.isInteger(limit) || limit < 1) return [];
  const pairs = new Map();
  for (const record of records) {
    const from = typeof record?.from === 'string' ? record.from.trim().toUpperCase() : '';
    const to = typeof record?.to === 'string' ? record.to.trim().toUpperCase() : '';
    if (!from || !to) continue;
    const routeId = [from, to].sort().join('--');
    if (!pairs.has(routeId)) pairs.set(routeId, { routeId, count: 0, directions: new Map() });
    const entry = pairs.get(routeId);
    entry.count++;
    const direction = from + '>' + to;
    entry.directions.set(direction, (entry.directions.get(direction) || 0) + 1);
  }
  return [...pairs.values()]
    .sort((a, b) => b.count - a.count || a.routeId.localeCompare(b.routeId))
    .slice(0, limit)
    .map(entry => ({
      routeId: entry.routeId,
      count: entry.count,
      directions: [...entry.directions.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([direction, count]) => ({ direction, count }))
    }));
}
