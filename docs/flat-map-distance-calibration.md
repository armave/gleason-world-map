# Flat-disk flight-telemetry calibration

## Purpose and scope

The distance tool shows two distinct values for the same pair of endpoints:

1. **Primary A–B distance** — the Euclidean length of the straight segment between the two final projected points in the visibly warped flat-disk plane. The number is calculated from exactly the same projected coordinates used to draw the connector.
2. **ADS-B flight-empirical estimate** — a separate estimate of typical flown mileage, calculated from the original fitted-projection chord and the ADS-B radial scale / endpoint-feature correction.

The primary distance, its visible connector, the scale bar and polygon edge lengths share the same flat-disk coordinate geometry. There is no globe, sphere, ellipsoid, great-circle or geodesic formula in the primary measurement path. The 12-circle transform is applied to endpoint positions before their Euclidean separation is measured; it is not applied a second time as a post-measurement multiplier.

The ADS-B estimate is not a shortest path, a globe distance, an airline schedule estimate, or a guaranteed prediction of the track an aircraft will fly. Real flights may route around weather, restricted airspace, traffic flows or operational constraints. It is an empirical estimate of typical flown mileage for sampled airport pairs, not the length of the displayed segment or the actual track of a selected flight.

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

The radial warp moves interior rings relative to a linear `r = R * theta` disk while retaining the same centre/rim topology. With the current fit, the 45°N ring is about 592 km farther from the centre than it would be in a linear disk using the same fitted `R`; the maximum shift among the sampled 15° latitude markers is about 621 km. The outer rim and North Pole do not move. This adjustment changes coastline, capital, grid, map-click coordinates and the primary A–B distance consistently because all are rendered or measured through the same final transform. At 90°S, longitude remains the angular coordinate of a point on the outer circle. Different longitudes therefore indicate different positions on the disk rim; they are not collapsed into a single globe South Pole.

## 12-circle radial distance multipliers

The 12 values are the local radial-distance multipliers used by the map itself. They taper linearly from 1.00× at circle 1 to 0.50× at circle 12. The exact step is `0.50 / 11 = 0.0454545…`; the table rounds each multiplier to two decimals.

Let `q` be the original fitted radial fraction, from 0 at the North Pole to 1 at the Ice Wall. The continuous local multiplier profile is:

```text
m(q) = 1.00 - 0.50q
mean multiplier = integral(0..1, m(u) du) = 0.75
```

The profile is integrated—not applied as twelve separate bands—so the map remains smooth. It is normalized by its 0.75 mean to preserve the centre and the full outer-rim radius:

```text
q_visual = integral(0..q, m(u) du) / 0.75
         = (q - 0.25q²) / 0.75
         = q + q(1 - q) / 3
dq_visual/dq = m(q) / 0.75 = (4 - 2q) / 3
```

This means the radial spacing between any two adjacent reference circles is the average of their endpoint multipliers, normalized by 0.75. The inner radial intervals are wider and the outer intervals progressively narrower. The derivative remains positive and continuous, with no hard joins, while `q_visual(0) = 0` and `q_visual(1) = 1` keep the North Pole at the centre and the Ice Wall at the outer edge.

| Circle | Distance multiplier |
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

The same shared 12-circle data drives both the calibration table and the ten dotted interior guide rings drawn on the map. All latitude circles, coastlines, country boundaries, labels, map clicks, inverse lookup and the scale bar use the same transformed coordinates.

**Measurement correspondence:** A–B endpoints are projected through this exact radial multiplier profile first. The primary distance is then the Euclidean length of the straight connector between those displayed points. Thus the A–B number and visible line correspond exactly; the radial multiplier is not applied a second time to the finished chord. Polygon edge lengths and the scale bar use the same final map-plane coordinates and kilometre conversion. For a segment spanning several circles, its measured length reflects the full transform across both endpoint positions, not one arbitrarily selected circle's multiplier.

## Primary flat-disk Euclidean distance

The primary measurement operates entirely in the displayed flat-disk coordinate plane. For each endpoint longitude `λ` and latitude `φ`:

```text
t = (π/2 − φ) / π
q(t) = ((t + epsilon)^exponent − epsilon^exponent) /
       ((1 + epsilon)^exponent − epsilon^exponent)
q_visual = q + q(1 − q) / 3
r = π * R * q_visual
x = r * cos(λ)
y = −r * sin(λ)
```

For projected endpoints `A=(x₁,y₁)` and `B=(x₂,y₂)`, the reported A–B distance is:

```text
d_flat = sqrt((x₂ − x₁)^2 + (y₂ − y₁)^2)
```

This is exactly the length of the straight connector drawn between those same projected points. The canvas connector label and the primary numeric readout therefore describe the same segment. The scale bar and polygon edge lengths use the same final projected-plane metric. The 12-circle function is already included in `q_visual`; no additional 12-circle multiplier is applied after measuring the chord.

The scale `R` is an empirical flat-disk calibration derived from ADS-B ground-speed/time observations. It is not a globe radius, sphere radius or universal physical constant. The resulting kilometre values are map-plane kilometres under this model, not a claim of survey-grade ground distance. There is no sphere, ellipsoid, great-circle or geodesic calculation in the primary measurement path.

**Antarctic rim convention:** when `φ = −90°`, `q_visual = 1` and the radial coordinate is the disk boundary. Longitude `λ` continues to set the angular position around that boundary. Thus two coordinates at 90°S with different longitudes are different disk points. This deliberate convention preserves the circular Antarctic rim rather than collapsing it to one spherical pole.

A separate ADS-B flight-mileage estimate is retained as an empirical reference. It uses the original fitted base chord and local route-neighbour correction to estimate typical flown mileage for sampled airport pairs. It does not define or alter the primary flat-disk distance and is not a specific flight path.

For the ADS-B fit, let `qA` and `qB` remain the original fitted radial fractions (before the visual redistribution), and let `deltaLambda` be the wrapped longitude span. The exact Euclidean chord components in the warped unit disk are:

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

The radial/tangential split distinguishes movement across concentric rings from movement around a ring. This local correction is used only by the secondary ADS-B flight-mileage estimate on the original fitted projection; it does not change the primary flat-disk Euclidean distance, either radial transform, or the visually calibrated scale bar. On the current 33-route training / 4-route holdout snapshot, the smooth warp plus local route model reports **7.59% leave-one-route-out MAPE** and **4.10% independent holdout MAPE**; the worst holdout route error is **8.96%**. The previous unwarped radial geometry on the same sample reported 8.61%, 4.66%, and 7.59%, respectively. The worst leave-one-out route error remains 29.28%, so accuracy is not uniform. These are route-sample results, not proof of universal map or physical-distance accuracy.

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
