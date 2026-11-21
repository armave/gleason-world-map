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

The map remains a circular radial disk, but the latitude-to-radius relation is now smoothly warped using the ADS-B route sample. This changes the map's latitude-ring spacing as well as the numeric radial scale; it is not merely a multiplier applied to a distance readout.

For latitude `phi`, define colatitude `theta = pi/2 - phi` and normalized colatitude `t = theta / pi`. The current radial warp is a regularized power curve:

```text
q(t) = ((t + epsilon)^exponent - epsilon^exponent) /
       ((1 + epsilon)^exponent - epsilon^exponent)

exponent = 0.9
epsilon = 0.005
r = pi * R * q(t)
x = r * cos(longitude)
y = -r * sin(longitude)
```

The positive epsilon makes the derivative finite at the North Pole. The warp is strictly increasing, maps the North Pole to the centre, maps 90°S to the outer circle, and keeps every meridian radial and every parallel circular. The current fitted nominal radial scale is regenerated from the training routes; the outer disk radius is `pi * R`.

Airport latitude/longitude values are only the endpoint encoding required to position observations on this disk. No coordinate-derived route length, globe-distance equation, sphere radius, ellipsoid or geodesic library is used to create the ADS-B mileage targets.

The radial warp moves interior rings relative to a linear `r = R * theta` disk while retaining the same pole/rim topology. With the current fit, the 45°N ring is about 592 km farther from the centre than it would be in a linear disk using the same fitted `R`; the maximum shift among the sampled 15° latitude markers is about 621 km. The outer rim and North Pole do not move. This adjustment changes coastline, capital, grid and map-click coordinates consistently because all are rendered through the same transform.

For each route, let `qA` and `qB` be the warped radial fractions, and let `deltaLambda` be the wrapped longitude span. The exact Euclidean chord components in the warped unit disk are:

```text
radial_component = pi * abs(qA - qB)
tangential_component = pi * 2 * sqrt(qA * qB) * sin(abs(deltaLambda) / 2)
unit_chord = sqrt(radial_component^2 + tangential_component^2)
features = [
  (qA + qB) / 2,
  radial_component / unit_chord,
  tangential_component / unit_chord
]
```

The base scale `R` is the median of route median ADS-B mileage divided by this warped unit chord. The local model then predicts the route-mileage-per-unit-chord ratio from the two nearest training routes in standardized feature space, using inverse-distance weights and a weighted geometric mean:

```text
route_ratio_i = route_median_flight_km_i / unit_chord_i
predicted_ratio = weighted_geometric_mean(two_nearest_route_ratios)
flight_empirical_estimate = unit_chord * clamp(predicted_ratio, 0.5 * R, 2.5 * R)
```

The radial/tangential split distinguishes movement across concentric rings from movement around a ring. On the current 33-route training / 4-route holdout snapshot, the smooth warp plus local route model reports **7.59% leave-one-route-out MAPE** and **4.10% independent holdout MAPE**; the worst holdout route error is **8.96%**. The previous unwarped radial geometry on the same sample reported 8.61%, 4.66%, and 7.59%, respectively. The worst leave-one-out route error remains 29.28%, so accuracy is not uniform. These are route-sample results, not proof of universal map or physical-distance accuracy.

The generated parameter file records the fitted radial scale and warp, feature means/scales/ranges, the route-level ratios used by the neighbour lookup, factor bounds, route counts, and source dataset version.
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
