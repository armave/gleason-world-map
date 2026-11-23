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
