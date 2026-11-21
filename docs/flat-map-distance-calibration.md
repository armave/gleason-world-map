# Flat-disk flight-telemetry calibration

## Purpose and scope

The distance tool shows two values for the same pair of endpoints:

1. **Raw flat-disk chord** — Euclidean length of the straight segment between the two projected positions.
2. **Flight-empirical estimate** — the raw disk chord multiplied by a radial scale and a small endpoint-feature correction fitted against sampled flown mileage.

The new calibration target is **observed aircraft mileage**, estimated from ADS-B ground-speed and timestamp telemetry. It is not a shortest path, a great-circle distance, an airline schedule estimate, or a guaranteed prediction of the track an aircraft will fly. The distinction matters: real flights may route around weather, restricted airspace, traffic flows or operational constraints.

No globe-distance equation, sphere radius, ellipsoidal formula, geodesic library, or coordinate-derived trajectory length is used to create the calibration targets or at app runtime. Latitude/longitude is retained as the location encoding needed to position airports on the flat radial disk and to derive the disk's own endpoint features. Airport boundary geometry is used only by the ADS-B source API to find candidate flights for a route pair; it is not used to calculate distance.

## Empirical source

The collector uses the public historical ADS-B archive exposed by adsb.lol through:

- API documentation: https://adsb.aero/api/docs
- Open-data archive: https://www.adsb.lol/docs/open-data/historical
- API root: https://adsb.aero/api/v1
- Dataset license: Open Database License 1.0 (ODbL-1.0); attribution is included in the generated dataset.

The source's flight detail contains `path_gs`, a time series of pairs `[unix_timestamp_seconds, ground_speed_knots]`. The timestamps are from the observed flight record. The collector also reads airport identifiers and the airport endpoint records to select and label airport pairs.

### Mileage calculation

Within each contiguous `path_gs` subsequence, a speed sample is treated as step-interpolated until the next timestamp in that same subsequence. Missing-data gaps between subsequences are never joined with a fabricated speed.

For each accepted interval:

```text
interval_nautical_miles = ground_speed_knots * elapsed_seconds / 3600
```

The intervals are summed and converted using the unit conversion:

```text
observed_track_km = sum(interval_nautical_miles) * 1.852
```

The archive can have gaps in an otherwise valid telemetry span. To estimate mileage over the first-to-last observed speed timestamp, the collector expands the observed integral using the **measured time coverage**:

```text
time_coverage = accepted_speed_interval_seconds / telemetry_span_seconds
estimated_track_km = observed_track_km / time_coverage
```

This is a measured-mean-speed estimate across missing intervals, not a claim that the aircraft maintained one exact speed during the gaps. Each flight stores both the observed-only integral and the coverage-expanded estimate, plus coverage, largest contiguous gap, elapsed flight time, telemetry-span time, interval count and mean measured ground speed. The route reference is the median estimated track mileage across accepted flights for that airport pair.

### Data-quality filters

The filters are defined once in `src/core/flight-telemetry.js` and copied into the dataset metadata by the collector:

- Ground-speed samples below 40 knots or above 750 knots are excluded from the airborne integration.
- Telemetry span must be at least 35 minutes.
- At least 8 valid speed intervals are required.
- Valid speed intervals must cover at least 30% of the first-to-last telemetry span.
- No time is inferred outside the first and last speed timestamps.

The minimum coverage threshold is a collection-quality floor, not a guarantee of high accuracy. Coverage and largest-gap statistics remain in the dataset so a reviewer can decide whether a route observation is sufficiently representative.

## Route sampling and validation

Routes are collected by airport-pair identifier. The collector tries to fill a target of 5 accepted flights per route and stores every accepted observation. It uses the airport's published terminal boundary when available, or a 20 km airport-centred fallback search circle, only to ask the source API for flights with the requested origin and destination. It then checks the flight's own departure/arrival identifiers against the requested pair.

The calibration split is at the **airport-pair level**:

- Training routes are used to estimate the radial scale and endpoint correction.
- Holdout routes are not used during fitting. They are evaluated only after the model has been fitted.
- Leave-one-route-out validation refits the model after removing each training route in turn.

A route needs at least 3 accepted flights before it can be used as a calibration observation. The fitter requires at least 10 training routes and 4 holdout routes. If route coverage is below that threshold, it does not write a production parameter file.

## Flat-disk model

The geographic arrangement remains a flat radial disk:

[
	heta = rac{pi}{2} - phi,qquad
r = R	heta,qquad
x = rcoslambda,qquad
y = -rsinlambda
]

Here (phi) and (lambda) are the endpoint latitude/longitude values interpreted as angular map coordinates. (R) is no longer anchored to a city-pair distance from an external shortest-distance calculator. It is fitted from the training routes:

```text
unit_chord_i = Euclidean flat-disk chord for route i when R = 1
route_reference_i = median estimated ADS-B flight mileage for route i
R = median(route_reference_i / unit_chord_i) across training routes
```

The model predicts the mileage-per-unit-chord ratio from three symmetric flat-disk endpoint features:

1. Mean endpoint colatitude.
2. The radial component's share of the unit-disk chord.
3. The tangential component's share of the unit-disk chord.

The chord is decomposed exactly in the flat radial disk. For endpoint colatitudes `thetaA` and `thetaB`, and wrapped longitude span `deltaLambda`:

```text
radial_component = abs(thetaA - thetaB)
tangential_component = 2 * sqrt(thetaA * thetaB) * sin(abs(deltaLambda) / 2)
unit_chord = sqrt(radial_component^2 + tangential_component^2)
features = [
  (thetaA + thetaB) / 2,
  radial_component / unit_chord,
  tangential_component / unit_chord
]
```

For a new pair, it finds the **two nearest** training route examples in standardized feature space and takes an inverse-distance-weighted geometric mean of their observed mileage-per-unit-chord ratios. The weight is `1 / standardized_feature_distance`:

```text
route_ratio_i = route_median_flight_km_i / unit_chord_i
predicted_ratio = weighted_geometric_mean(two_nearest_route_ratios)
flight_empirical_estimate = unit_chord * clamp(predicted_ratio, 0.5 * R, 2.5 * R)
```

The radial/tangential split captures whether a route's disk chord is driven mostly by movement across concentric rings or around a ring. It resolves a weakness in the previous feature set, which supplied angular spans separately but did not describe their relative contribution to the actual chord. On the current 33-route training / 4-route holdout snapshot, this candidate reduced leave-one-route-out MAPE from 9.77% to approximately 8.61% and independent holdout MAPE from 5.58% to approximately 4.66%; the worst holdout error fell from 15.20% to approximately 7.59%. These are route-sample results, not a universal accuracy guarantee.

The generated parameter file records the fitted radial scale, feature means/scales/ranges, the route-level ratios used by the neighbour lookup, factor bounds, number of training and holdout routes, and source dataset version. The code is plain JavaScript; no external math or geodesic package is used.

## Validation gate and interpretation

The fitter reports mean absolute percentage error (MAPE), RMS percentage error and maximum absolute percentage error for:

- Training routes (in-sample fit).
- Independent holdout routes.
- Leave-one-route-out training validation.

Production parameters are emitted only when there are enough training/holdout route pairs and all configured error thresholds pass. A rejected fit still writes the summary for review, but removes/does not write the production parameter file. This prevents a poor or sparse sample from silently replacing the current map calibration.

The summary and raw source records are:

- `data/flight-calibration.json` — the reproducible route observations and telemetry quality fields.
- `data/flight-calibration-summary.json` — fitted candidate, train/holdout/leave-one-route-out metrics and acceptance decision.
- `src/core/flight-calibration-parameters.js` — generated runtime parameters, present only for a fit that passes the acceptance gate.

To collect and fit locally:

```bash
npm run collect:flight-calibration
npm run fit:flight-calibration
npm test
```

The GitHub Actions workflow runs the same steps and uploads the telemetry dataset as an artifact.

## What this method does not establish

- It does not estimate the shortest distance between two endpoints.
- It does not reproduce the flown path of any selected flight.
- It does not prove that the radial disk is a physical model of the Earth.
- It does not use coordinates to calculate the observed aircraft mileage.
- It does not claim that one empirical correction fits every route; holdout and leave-one-route-out results are essential to judging its limitations.

Country, coast, capital, airport and county coordinates remain necessary **location data** for the map and search interface. They are not distance-reference values and do not feed the flight-mileage integration.
