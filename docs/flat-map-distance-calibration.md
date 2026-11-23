# Flat-disk direct measurement and flight-path calibration

## Direct A–B measurement

The A–B ruler measures the straight red connector as a Euclidean chord in the visible flat-disk plane. It does not use the legacy base-projection chord or an ADS-B route-mileage multiplier.

The active implementation is:

- `src/core/flat-disk.js` — `project()` renders the geographic endpoints in the active visible radial disk; `flatDiskDistanceMeters()` returns their chord length in kilometres converted to metres.
- `src/core/measurement-engine.js` — `measureDirectDistance()` delegates to that visible chord measurement, and `measureDistanceMeters()` is the shared numeric entry point.
- `src/app.js` — the red connector uses `flatDiskLinePath()` with the same `project()` function. The A–B readout and connector label both use `measureDirectDistance()`.
- Polygon edge labels, polygon perimeter and the local scale bar use `measureDistanceMeters()`, so all direct-distance surfaces share the same visible geometry and scale.

The required invariant is that the displayed A–B value equals the length of the straight projected segment in disk-kilometre units. Moving either endpoint changes the chord according to its new displayed position. No spherical, ellipsoidal, great-circle or geodesic calculation is used.

## Relationship to observed ADS-B data

Observed ADS-B ground-speed/time samples and timestamped aircraft path vertices remain part of the separate visible-map calibration workflow. The accepted flight-path parameter set controls the map's radial warp, 12-circle spacing profile, longitude deformation and disk kilometre scale. Those parameters define the displayed flat-disk geometry; they are not an endpoint-specific mileage correction.

The former route-feature distance correction fitted from flown ADS-B mileage is no longer used by the runtime measurement engine. Its generated parameters and data reports may remain in the repository for research provenance, but the active A–B, scale-bar and polygon measurements do not import that correction.

## Verification

`tests/measurement-engine.test.js` verifies that:

- the measured value equals `flatDiskDistanceMeters(A, B)`;
- the measured value equals the projected connector length converted with `DISK_RADIUS_KM`;
- moving an endpoint to a substantially different disk position changes the result;
- endpoint order and wrapped longitudes preserve the same chord;
- the longitude-indexed Antarctic rim remains measurable;
- the 60°S reference line does not switch the measurement method; and
- invalid coordinates fail safely.

The map remains a circular, north-polar flat disk with its continuous Antarctic rim. The correction changes only the consistency of direct measurements with that visible geometry.
