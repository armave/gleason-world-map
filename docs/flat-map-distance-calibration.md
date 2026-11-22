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

Within each contiguous `path_gs` subsequence, a speed sample is integrated only to the next timestamp in that same sequence. Coverage is measured against the full flight duration from `start_ts` to `end_ts`, including missing time before the first and after the last sample. Each accepted interval contributes:

```text
interval_nautical_miles = ground_speed_knots * elapsed_seconds / 3600
observed_track_km = sum(interval_nautical_miles) * 1.852
```

The calibration accepts only directly observed integrals with at least 98% full-flight coverage, no unsupported gap longer than 15 minutes, at least eight valid intervals and at least 35 minutes of recorded flight. Missing intervals are never filled, and a partial observation is never divided by coverage to create an estimated full-flight total.

### Data-quality filters

The filters are defined once in `src/core/flight-telemetry.js` and copied into the dataset metadata by the collector:

- Ground-speed samples below 40 knots or above 750 knots are excluded from the airborne integration.
- Telemetry span must be at least 35 minutes.
- At least 8 valid speed intervals are required.
- Valid speed intervals must cover at least 98% of the complete flight start-to-end duration.
- No single ground-speed sample is held across an interval longer than 15 minutes; such intervals are excluded and counted as telemetry gaps.
- Time missing before the first or after the last speed timestamp counts against coverage.

Coverage is an explicit acceptance gate, not an expansion factor. The observed-only distance policy is versioned in the dataset metadata; legacy datasets with a different or ambiguous coverage policy are ineligible for the strict fitter.

## Route sampling and validation

Routes are collected by airport-pair identifier. The collector searches historical seven-day windows for up to 180 days and tries to fill a target of 6 accepted flights per route and stores every accepted observation. It uses the airport's published terminal boundary when available, or a 20 km airport-centred fallback search circle, only to ask the source API for flights with the requested origin and destination. It then checks the flight's own departure/arrival identifiers against the requested pair.

The calibration split is at the **airport-pair level**:

- Training routes are used to estimate the radial scale and endpoint correction.
- Holdout routes are not used during fitting. They are evaluated only after the model has been fitted.
- Leave-one-route-out validation refits the model after removing each training route in turn.

A route needs at least three accepted high-coverage flights. Each route contributes one median observed-only mileage value. Entire airport pairs are held out from fitting. The refreshed production gate requires at least 20 training routes, 6 holdout routes, 4 training routes with an endpoint south of 30°S and 2 holdout routes with an endpoint south of 30°S, in addition to the existing error limits. Polar regions remain unvalidated unless suitable independent records become available. If any gate fails, the last accepted production coefficients remain active.

## Flat-disk model

The map remains a circular radial disk. Its current latitude-to-radius relation and 12-circle profile are carried forward from the last accepted calibration; a replacement based on the stricter observed-only records is not promoted until its independent holdout gates pass. This changes the map's latitude-ring spacing as well as the numeric radial scale; it is not merely a multiplier applied to a distance readout.

For latitude `phi`, define colatitude `theta = pi/2 - phi` and normalized colatitude `t = theta / pi`. The current radial warp is a regularized power curve:

```text
q(t) = ((t + epsilon)^exponent - epsilon^exponent) /
       ((1 + epsilon)^exponent - epsilon^exponent)

exponent = 0.9
epsilon = 0.005
r_base = pi * R_base * q(t)
x_base = r_base * cos(longitude)
y_base = -r_base * sin(longitude)
```

The positive epsilon makes the derivative finite at the North Pole. The warp is strictly increasing, maps the North Pole to the centre, maps 90°S to the outer circle, and keeps every meridian radial and every parallel circular. The current fitted nominal radial scale `R_base` is regenerated from the approved training routes. Before the 12-circle profile, the base radius is `pi * R_base`; the final measured disk radius after applying the profile is `0.75 * pi * R_base`. Adding a candidate airport pair does not change the fitted base scale until its measured observations pass the independent acceptance gate.

Airport latitude/longitude values are only the endpoint encoding required to position observations on this disk. No coordinate-derived route length, globe-distance equation, sphere radius, ellipsoid or geodesic library is used to create the ADS-B mileage targets.

The radial warp moves interior rings relative to a linear `r = R * theta` disk while retaining the same centre/rim topology. With the current fit, the 45°N ring is about 592 km farther from the centre than it would be in a linear disk using the same fitted `R`; the maximum shift among the sampled 15° latitude markers is about 621 km. The outer rim and North Pole do not move. This adjustment changes coastline, capital, grid, map-click coordinates and the primary A–B distance consistently because all are rendered or measured through the same final transform. At 90°S, longitude remains the angular coordinate of a point on the outer circle. Different longitudes therefore indicate different positions on the disk rim; they are not collapsed into a single globe South Pole.

## 12-circle radial distance multipliers

The 12 values are the local radial-distance multipliers used by the map itself. They taper linearly from 1.00× at circle 1 to 0.50× at circle 12. The exact step is `0.50 / 11 = 0.0454545…`; the table rounds each multiplier to two decimals.

Let `q` be the original fitted radial fraction, from 0 at the North Pole to 1 at the Ice Wall. The continuous local multiplier profile is:

```text
m(q) = 1.00 - 0.50q
mean multiplier = integral(0..1, m(u) du) = 0.75
```

The profile is integrated—not applied as twelve separate bands—so the map remains smooth. Its physical radial integral is:

```text
I(q) = integral(0..q, m(u) du) = q - 0.25q²
r_km = pi * R_base * I(q)
dr_km/dq = pi * R_base * m(q)
R_disk = pi * R_base * integral(0..1, m(u) du)
       = 0.75 * pi * R_base
```

For screen positioning only, the normalized radial fraction is `q_visual = I(q) / 0.75 = q + q(1 - q) / 3`. This preserves the visible disk boundary and the 12 ring positions on the canvas. The normalization is **not** used as an extra multiplier in the measured kilometre coordinates. Consequently the physical local radial-distance multiplier is exactly `m(q)`: 1.00× at the centre, 0.50× at the Ice Wall. The derivative stays positive and continuous, with no hard joins, while `q_visual(0) = 0` and `q_visual(1) = 1` keep the North Pole at the centre and the Ice Wall at the display edge.

The physical spacing between two adjacent reference circles is the average of their endpoint multipliers times `pi * R_base / 11`. There is no division by 0.75 in this measured radial interval.

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

**Measurement correspondence:** The local profile controls radial spacing: along a fixed meridian, `dr/dq = πR_base·m(q)`, so each radial interval uses the average of its endpoint multipliers. For arbitrary A–B endpoints, the map projects both coordinates through the profile and reports the Euclidean chord between their final radius-and-longitude positions. A diagonal or tangential component is therefore governed by the cumulative radius `r(q) = πR_base·I(q)` and the longitude span; it is not valid to multiply the entire chord by one circle's local radial factor. The A–B number is exactly the length of the visible connector. Polygon edge lengths and the scale bar use the same final map-plane coordinates and kilometre conversion.

## Primary flat-disk Euclidean distance

The primary measurement operates entirely in the displayed flat-disk coordinate plane. For each endpoint longitude `λ` and latitude `φ`:

```text
t = (π/2 − φ) / π
q(t) = ((t + epsilon)^exponent − epsilon^exponent) /
       ((1 + epsilon)^exponent − epsilon^exponent)
I(q) = q − 0.25q²
q_visual = I(q) / 0.75 = q + q(1 − q) / 3
R_disk = 0.75 * π * R_base
r_km = π * R_base * I(q) = R_disk * q_visual
x = r_km * cos(λ)
y = −r_km * sin(λ)
```

For projected endpoints `A=(x₁,y₁)` and `B=(x₂,y₂)`, the reported A–B distance is:

```text
d_flat = sqrt((x₂ − x₁)^2 + (y₂ − y₁)^2)
```

This is exactly the length of the straight connector drawn between those same projected points. The canvas connector label and the primary numeric readout therefore describe the same segment. The scale bar and polygon edge lengths use the same final projected-plane metric. The 12-circle function is already included in `q_visual`; no additional 12-circle multiplier is applied after measuring the chord.

The base scale `R_base` is an empirical flat-disk calibration derived from ADS-B ground-speed/time observations. It is not a globe radius, sphere radius or universal physical constant. The 12-circle profile makes the final physical disk radius `R_disk = 0.75πR_base`; the original `πR_base` base radius is retained only for the separate ADS-B calibration chord. The resulting kilometre values are map-plane kilometres under this model, not a claim of survey-grade ground distance. There is no sphere, ellipsoid, great-circle or geodesic calculation in the primary measurement path.

**Antarctic rim convention:** when `φ = −90°`, `q_visual = 1` and the radial coordinate is the disk boundary. Longitude `λ` continues to set the angular position around that boundary. Thus two coordinates at 90°S with different longitudes are different disk points. This deliberate convention preserves the circular Antarctic rim rather than collapsing it to one spherical pole.

A separate ADS-B flight-mileage estimate is retained as an empirical reference. The active legacy model uses its original fitted base chord. New strict model versions are tagged `chordGeometry: visual-12-circle` and use the same displayed 12-circle chord as the map. In either case, the local route-neighbour correction estimates typical flown mileage only; it does not alter map coordinates or the primary A–B connector. It is not a specific flight path.

The legacy ADS-B model used the unmodified base radial fraction. Strict candidate model version 6 instead uses the displayed 12-circle radial positions. For that geometry, calculate `q_visual = (q - 0.25q²) / 0.75` at both endpoints, then use the wrapped longitude span. The physical chord is the following unit chord multiplied by the 0.75 disk-radius factor and the fitted radial scale:

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

The figures in the schema-2 dataset snapshot are now historical diagnostics only. That snapshot used a 35% telemetry-coverage floor, expanded incomplete mileage, and had only two usable holdout route pairs. It is deliberately ineligible for the strict schema-3 fitter. The updated collector now searches historical seven-day windows for up to 180 days across an expanded route set; its new result must be evaluated under the observed-only policy below before any coefficients are considered.

The generated parameter file records the fitted radial scale and warp, feature means/scales/ranges, the route-level ratios used by the flight-estimate neighbour lookup, factor bounds, route counts, and source dataset version.
## Validation gate and interpretation

The fitter reports mean absolute percentage error (MAPE), RMS percentage error and maximum absolute percentage error for two separate models:

- The route-neighbour model, which estimates typical flown mileage as a secondary empirical reference.
- The primary visual projection, which uses only the one global radial scale multiplied by the same displayed 12-circle chord used by the map. It is scored using leave-one-route-out training validation and independent holdout routes.

Production parameters are emitted only when both models, route-count and Southern Hemisphere coverage gates pass. In particular, the primary visual projection must meet its own MAPE and worst-route limits without relying on the local route-neighbour correction. A rejected fit still writes the summary for review and preserves the last approved production parameter file. This prevents a good secondary flight-mileage estimate from masking a poorly calibrated map visual scale.

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
