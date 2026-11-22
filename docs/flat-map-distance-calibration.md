# Flat-disk flight-telemetry calibration

## Purpose and scope

The distance tool shows two values for the same pair of endpoints:

1. **Radially adjusted A–B readout** — the Euclidean chord of the straight projected segment multiplied by the user-defined 12-circle factor. The factor tapers from 1.00× at the North Pole to 0.50× at the Antarctic rim and is linearly interpolated using the endpoints' mean normalized radial position.
2. **ADS-B flight-empirical estimate** — a separate estimate of typical flown mileage, calculated by multiplying the raw projected chord by a fitted radial scale and a small endpoint-feature correction.

The raw projected chord is retained in the measurement result and identified below the primary readout. The visible connector and scale bar remain based on unadjusted map geometry; the connector label displays the radially adjusted readout. The ADS-B correction remains a separate empirical reference and does not feed the 12-circle multiplier.


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

The archive can have gaps in an otherwise valid telemetry span. Speed observations are used only when the next timestamp is no more than 15 minutes away; longer intervals are excluded and recorded as gaps rather than carrying a stale speed forward. To estimate mileage over the first-to-last observed speed timestamp, the collector expands the observed integral using the **measured time coverage**:

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
- Valid speed intervals must cover at least 35% of the first-to-last telemetry span.
- No single ground-speed sample is held across an interval longer than 15 minutes; such intervals are excluded and counted as telemetry gaps.
- No time is inferred outside the first and last speed timestamps.

The minimum coverage threshold is a collection-quality floor, not a guarantee of high accuracy. Coverage and largest-gap statistics remain in the dataset so a reviewer can decide whether a route observation is sufficiently representative.

## Route sampling and validation

Routes are collected by airport-pair identifier. The collector tries to fill a target of 8 accepted flights per route and stores every accepted observation. It uses the airport's published terminal boundary when available, or a 20 km airport-centred fallback search circle, only to ask the source API for flights with the requested origin and destination. It then checks the flight's own departure/arrival identifiers against the requested pair.

The calibration split is at the **airport-pair level**:

- Training routes are used to estimate the radial scale and endpoint correction.
- Holdout routes are not used during fitting. They are evaluated only after the model has been fitted.
- Leave-one-route-out validation refits the model after removing each training route in turn.

A route needs at least 3 accepted flights before it can be used as a calibration observation. The fitter recomputes each route target from individual observations and retains only flights with at least 35% telemetry coverage and a largest gap no greater than 5 hours. Route examples with better coverage, shorter gaps and more accepted flights receive greater model weight. The candidate fitter requires at least 10 training routes and 4 holdout routes to calculate validation metrics; the production acceptance gate is stricter: at least 30 training routes, 4 holdout routes, 4 training routes south of 45°S, at least one training and one holdout route south of 60°S, and at least one southern holdout route. Existing error limits also have to pass. If any requirement fails, it does not write a production parameter file and the last approved coefficients remain active.

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

The positive epsilon makes the derivative finite at the North Pole. The warp is strictly increasing, maps the North Pole to the centre, maps 90°S to the outer circle, and keeps every meridian radial and every parallel circular. The current fitted nominal radial scale is regenerated from the approved training routes; the outer disk radius is `pi * R`. Adding a candidate airport pair does not change this value until its measured observations pass the independent acceptance gate.

Airport latitude/longitude values are only the endpoint encoding required to position observations on this disk. No coordinate-derived route length, globe-distance equation, sphere radius, ellipsoid or geodesic library is used to create the ADS-B mileage targets.

The radial warp moves interior rings relative to a linear `r = R * theta` disk while retaining the same pole/rim topology. With the current fit, the 45°N ring is about 592 km farther from the centre than it would be in a linear disk using the same fitted `R`; the maximum shift among the sampled 15° latitude markers is about 621 km. The outer rim and North Pole do not move. This adjustment changes coastline, capital, grid and map-click coordinates consistently because all are rendered through the same transform.

## 12-circle A–B readout correction

The primary A–B readout applies a second, explicitly user-defined radial multiplier. It does not alter the map projection, point locations, line geometry, scale bar, polygon calculations or ADS-B flight-empirical estimate.

Let `qA` and `qB` be the normalized warped-disk radial fractions of the two endpoints, each ranging from 0 at the North Pole to 1 at the Antarctic rim. The mean radial fraction and multiplier are:

```text
q_mean = (qA + qB) / 2
factor = 1.00 - 0.50 * q_mean
circle_position = 1 + 11 * q_mean
adjusted_A_B_readout = raw_projected_chord * factor
```

This produces the approved 12 reference values at equally spaced normalized radii:

| Circle | Multiplier |
|---:|---:|
| 1 | 1.00× |
| 2 | 0.95× |
| 3 | 0.91× |
| 4 | 0.86× |
| 5 | 0.82× |
| 6 | 0.77× |
| 7 | 0.73× |
| 8 | 0.68× |
| 9 | 0.64× |
| 10 | 0.59× |
| 11 | 0.55× |
| 12 (Ice Wall) | 0.50× |

Between reference circles, the factor is interpolated continuously rather than stepped. For endpoints on different circles, the mean endpoint radial fraction determines the intermediate factor. This is a custom readout convention requested for this map, not a multiplier fitted from ADS-B telemetry and not evidence that the adjusted number is a geographic ground distance. The raw chord remains separately available; the scale bar intentionally remains unadjusted.

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

The base scale `R` is the median of route median ADS-B mileage divided by this warped unit chord. It converts the projected disk chord into map-plane kilometres. The local model separately predicts the route-mileage-per-unit-chord ratio from the two nearest training routes in standardized feature space, using inverse-distance weights and a weighted geometric mean:

```text
route_ratio_i = route_median_flight_km_i / unit_chord_i
predicted_ratio = weighted_geometric_mean(two_nearest_route_ratios)
flight_empirical_estimate = unit_chord * clamp(predicted_ratio, 0.5 * R, 2.5 * R)
```

The radial/tangential split distinguishes movement across concentric rings from movement around a ring. This local correction is used only by the ADS-B flight-mileage estimate; it does not change the projected chord, the 12-circle A–B readout factor, or the scale bar. On the current 33-route training / 4-route holdout snapshot, the smooth warp plus local route model reports **7.59% leave-one-route-out MAPE** and **4.10% independent holdout MAPE**; the worst holdout route error is **8.96%**. The previous unwarped radial geometry on the same sample reported 8.61%, 4.66%, and 7.59%, respectively. The worst leave-one-out route error remains 29.28%, so accuracy is not uniform. These are route-sample results, not proof of universal map or physical-distance accuracy.

**Important southern-limit note:** the currently approved production snapshot has no training or holdout airport pair with an endpoint south of 60°S; its southernmost accepted endpoint is about 37.7°S. Therefore estimates near the Antarctic rim are still bounded extrapolations, not polar-validated predictions. The new southern/Antarctic airport pairs are collection candidates only. The model will keep the existing approved coefficients until actual ADS-B observations produce sufficient independent southern training and polar holdout coverage and the error gate passes.

The latest collection attempt (retrieved 21 November 2026 at 12:17 UTC) contains 61 candidate airport pairs and 253 accepted flight records. After the 35% coverage and 5-hour maximum-gap filters, 32 training routes and 2 holdout routes remain—below the minimum 4 holdouts needed even to score a candidate. The eight added southern/polar candidates were each scanned for 24 pages but produced zero exact-route flight candidates. None of the accepted routes reaches 45°S. The generated fit summary now records this as a rejected candidate with current route counts and candidate diagnostics instead of leaving the previous run's `accepted: true` metrics beside the newer dataset.

The generated parameter file records the fitted radial scale and warp, feature means/scales/ranges, the route-level ratios used by the flight-estimate neighbour lookup, factor bounds, route counts, and source dataset version.
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
