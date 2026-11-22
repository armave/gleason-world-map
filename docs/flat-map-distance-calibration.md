# Flat-disk flight-telemetry calibration

## Purpose and scope

The A–B measurement panel displays two distinct quantities for the same pair of endpoints:

1. **Primary empirical route-mileage estimate** — predicts typical observed flown mileage from airport-pair examples whose projected endpoint features are similar to the query. It is calibrated against ADS-B ground-speed/time mileage.
2. **Flat-disk connector length** — the exact Euclidean length of the straight segment between the two final projected points in the visibly warped flat-disk plane. This is the segment actually drawn on the map.

The exact connector length, local scale bar, map-drawn measurement labels and polygon edge lengths remain map-plane measurements. The primary route estimate is a separate prediction; it does not change endpoint positions, the connector or the scale bar. There is no globe, sphere, ellipsoid, great-circle or geodesic formula in either implementation.

The route estimate is a prediction of typical flown mileage, not a specific flight path, a guaranteed airline itinerary, or a shortest point-to-point distance. Real flights may route around weather, restricted airspace, traffic flows or operational constraints. Its reliability is limited to the airport-pair feature and chord-length range represented by the training and independent holdout records. The UI explicitly flags requests beyond this support range as **Extrapolated** rather than implying that an accurate estimate has been validated.

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

## Recorded ADS-B trajectory path and visible-map calibration

The visible map projection has its own calibration parameter file: `src/core/flight-path-calibration-parameters.js`. It is deliberately separate from `src/core/flight-calibration-parameters.js`, which supplies only the secondary endpoint-based typical-flight-mileage estimate.

For each accepted flight, the collector requests the full flight detail from `GET /flights/{flight_id}` and stores:

- `path`: the source GeoJSON `MultiLineString` of recorded aircraft positions.
- `timestamps`: Unix UTC timestamps aligned one-to-one with `path.coordinates`.
- `trackCoordinates` and `trackTimestamps`: the normalized sequences stored with the observed-mileage record.
- `observedTrackKm`: the independent ground-speed × elapsed-time integral described above.

Each `MultiLineString` component is treated as its own observed sequence. The projected-path calculation never adds a straight connector between separate components, nor bridges an invalid point or timestamp gap. Every sequence must have matching coordinate and timestamp counts, valid longitude/latitude values, and strictly increasing timestamps. Every timestamp must fall inside the recorded start-to-end flight interval. The combined timestamp span of the path sequences must cover at least 98% of the complete flight duration, and no gap within a sequence, between sequences, or at the flight start/end may exceed 15 minutes. A flight that misses either path-coverage condition is excluded from visual path calibration; its independently measured ground-speed mileage remains in the raw telemetry diagnostics.

### Projection of recorded track points

The target mileage is calculated exclusively from recorded ground speed and elapsed time. Flight coordinates are used separately to test whether the candidate flat-disk drawing corresponds to the observed track geometry.

For each recorded position `(longitude, latitude)`, calculate the candidate base radial fraction `q` using the regularized-power latitude warp, then apply the integrated 12-circle profile and the fitted longitude shear:

```text
t = (90° - latitude) / 180°
q(t) = regularized_power(t, exponent, epsilon)
m(q) = outer + (inner - outer) * (1 - q)^a
I(q) = integral(0..q, m(u) du)
     = outer*q + (inner - outer) * [1 - (1 - q)^(a + 1)] / (a + 1)
r_unit = π * I(q)
g(q) = 4q(1 - q)
F(λ) = a1 sin(λ) + b1(1 - cos(λ))
     + a2 sin(2λ) + b2(1 - cos(2λ))
λ_display = λ + g(q) * F(λ)
x_unit = r_unit * cos(λ_display)
y_unit = -r_unit * sin(λ_display)
```

The four Fourier coefficients are fitted on training routes only. The radial envelope `g(q)` is zero at both the North Pole (`q=0`) and Ice Wall (`q=1`), so the centre and complete circular rim keep their anchors. The longitude function is periodic; its angular derivative is constrained to remain at least 0.35 across the full disk, preventing longitude lines from crossing or folding over. The inverse projection solves the same monotonic angle mapping at the recovered radial fraction.

For each adjacent pair of vertices within one source sequence, calculate the Euclidean segment length in the candidate flat disk. The unit-scale path length for a flight is the sum of those segment lengths across all source sequences:

```text
L_path = sum_over_sequences(
  sum_over_adjacent_points(
    sqrt((x[j+1] - x[j])² + (y[j+1] - y[j])²)
  )
)
projected_path_km = R_base * L_path
```

No great-circle, spherical, ellipsoidal or geodesic calculation is used. The source path coordinates are not used to calculate the observed-mileage target; that target remains the independent ground-speed/time integral.

### Path-fit procedure and acceptance

For each flight, the paired scale ratio is:

```text
flight_scale_ratio = observed_track_km / L_path
route_scale_ratio = median(flight_scale_ratio for that airport pair)
R_base = median(route_scale_ratio across training airport pairs)
```

Each airport pair contributes one route-level observation, regardless of how many flights that route contains. The fitter jointly selects the regularized-power latitude exponent, integrated radial-profile exponent, four periodic longitude coefficients and one global radial scale. Candidate longitude coefficients are regularized and bounded, and the minimum angular stretch must remain at least 0.35. The objective uses route-level leave-one-out error within the training split; the outer leave-one-route-out validation refits the complete geometry after excluding each training airport pair. The six preassigned holdout airport pairs are not used to fit the final model.

A path candidate requires at least 20 usable training airport pairs and 6 usable holdout pairs, plus 4 training and 2 holdout pairs with an endpoint south of 30°S. A route is usable only when at least three quality-qualified flights produce non-zero projected path lengths. The route counts are rechecked after projection. The current archive has 26 training and 6 holdout routes, including 4 and 2 respectively south of 30°S, but no qualified routes south of 45°S or 60°S. Those deeper southern bands are reported as explicit extrapolation warnings rather than hidden behind a false validation claim. The shear itself fades to identity at the Ice Wall, but that anchor does not empirically validate the intervening Antarctic geometry.

The fitted model is judged against these error and geometry limits:

- Training-route MAPE no greater than 10%.
- Independent holdout MAPE no greater than 12%.
- Worst independent holdout route error no greater than 20%.
- Nested leave-one-route-out MAPE no greater than 15%.
- Worst nested leave-one-route-out route error no greater than 45%.
- Minimum angular stretch no less than 0.35.

A rejected candidate is recorded in `data/flight-path-calibration-summary.json`; it does not overwrite the active `src/core/flight-path-calibration-parameters.js`. An accepted candidate writes radial scale, latitude warp, radial profile and longitude warp to that file. The renderer, inverse lookup, coastlines, markers, map-click coordinates, ruler, scale bar and planar measurements all use the same forward/inverse geometry.

The previous endpoint-chord fitter still creates `data/flight-calibration-summary.json` and `src/core/flight-calibration-parameters.js`. Its local route-neighbour estimate remains a secondary reference for typical flown mileage only; it does not control the visible projection.

## Route sampling and validation

Routes are collected by airport-pair identifier. The collector searches historical seven-day windows for up to 560 days by default, capped automatically by the archive's published first and last dates, and tries to fill a target of 6 accepted flights per route while storing every accepted observation. The longer lookback is intended to improve independent route coverage; it does not relax the observed-only telemetry filters or imply that every route has usable records. It uses the airport's published terminal boundary when available, or a 20 km airport-centred fallback search circle, only to ask the source API for flights with the requested origin and destination. It then checks the flight's own departure/arrival identifiers against the requested pair.

The calibration split is at the **airport-pair level**:

- Training routes are used to estimate the radial scale and endpoint correction.
- Holdout routes are not used during fitting. They are evaluated only after the model has been fitted.
- Leave-one-route-out validation refits the model after removing each training route in turn.

A route needs at least three accepted high-coverage flights. Each route contributes one median observed-only mileage value. Entire airport pairs are held out from fitting. The refreshed path-fit production gate requires at least 20 usable training routes, 6 usable holdout routes, 4 training and 2 holdout routes with an endpoint south of 30°S, at least 2 training and 1 holdout route south of 45°S, and at least 1 training and 1 holdout route south of 60°S. These counts must also remain true after projection; a route whose flights have zero projected path length does not count. The gate applies in addition to the error limits. Polar regions remain unvalidated until suitable independent records are collected. If any gate fails, the last accepted production coefficients remain active.

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

The positive epsilon makes the derivative finite at the North Pole. The warp is strictly increasing, maps the North Pole to the centre, maps 90°S to the outer circle, and keeps every meridian radial and every parallel circular. The currently deployed `R_base` and smooth radial-profile exponent are frozen from the last accepted production calibration. The strict observed-only refresh creates a separate candidate and does not change the production scale or ring spacing unless its route coverage, Southern Hemisphere and visual-projection validation gates all pass. Before the radial profile, the base radius is `pi * R_base`; the final measured disk radius is `mu * pi * R_base`, where `mu` is the integral mean of the local profile. Adding a candidate airport pair does not change deployed geometry until its measurements pass the independent acceptance gate.

Airport latitude/longitude values are only the endpoint encoding required to position observations on this disk. No coordinate-derived route length, globe-distance equation, sphere radius, ellipsoid or geodesic library is used to create the ADS-B mileage targets.

The radial warp moves interior rings relative to a linear `r = R * theta` disk while retaining the same centre/rim topology. With the current fit, the 45°N ring is about 592 km farther from the centre than it would be in a linear disk using the same fitted `R`; the maximum shift among the sampled 15° latitude markers is about 621 km. The outer rim and North Pole do not move. This adjustment changes coastline, capital, grid, map-click coordinates and the primary A–B distance consistently because all are rendered or measured through the same final transform. At 90°S, longitude remains the angular coordinate of a point on the outer circle. Different longitudes therefore indicate different positions on the disk rim; they are not collapsed into a single globe South Pole.

## 12-circle radial distance multipliers

The 12 values are local radial-distance multipliers sampled at the 12 equally spaced base-ring anchors. The active production profile currently has exponent `a = 1`, which produces the familiar linear taper from 1.00× at circle 1 to 0.50× at circle 12. Candidate fits can change the smooth curve's exponent while preserving those endpoint multipliers; their actual sampled values and spacing are generated from the active profile.

Let `q` be the original fitted radial fraction, from 0 at the North Pole to 1 at the Ice Wall. The continuous local multiplier profile is:

```text
m(q) = 0.50 + 0.50(1 - q)^a
mu = integral(0..1, m(u) du) = 0.50 + 0.50/(a + 1)
```

The profile is integrated—not applied as twelve separate bands—so the map remains smooth. Its physical radial integral is:

```text
I(q) = integral(0..q, m(u) du)
     = 0.50q + 0.50[1 - (1 - q)^(a + 1)]/(a + 1)
r_km = pi * R_base * I(q)
dr_km/dq = pi * R_base * m(q)
R_disk = pi * R_base * mu
       = pi * R_base * [0.50 + 0.50/(a + 1)]
```

For screen positioning, the normalized radial fraction is `q_visual = I(q) / mu`. This preserves the visible disk boundary and the 12 reference circles on the canvas. The normalization is **not** used as an extra multiplier in measured kilometre coordinates. The physical local radial-distance multiplier is exactly `m(q)`: 1.00× at the centre and 0.50× at the Ice Wall. The derivative remains positive and continuous, with no hard joins, while `q_visual(0) = 0` and `q_visual(1) = 1` preserve the North Pole centre and Antarctic outer rim.

The physical spacing between two adjacent reference circles is the integral of `pi * R_base * m(q)` over that interval. There is no post-measurement multiplier applied to the resulting A–B chord.

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

**Measurement correspondence:** The local profile controls radial spacing: along a fixed meridian, `dr/dq = πR_base·m(q)`, so each radial interval is the integral of that local multiplier over the interval. For arbitrary A–B endpoints, the map projects both coordinates through the same profile and reports the Euclidean chord between their final radius-and-longitude positions. A diagonal or tangential component is therefore governed by the cumulative radius `r(q) = πR_base·I(q)` and the longitude span; it is not valid to multiply the entire chord by one circle's local radial factor. The A–B number is exactly the length of the visible connector. Polygon edge lengths and the scale bar use the same final map-plane coordinates and kilometre conversion.

## Exact flat-disk connector length

The visible A–B connector is one straight segment between the two endpoints after the active flat-disk projection. For each endpoint the current projection applies:

- the fitted regularized-power latitude warp,
- the integrated smooth 12-circle radial-distance profile, and
- the fitted periodic longitude shear that fades to identity at the North Pole and Ice Wall.

If the final projected endpoints are (A=(x_1,y_1)) and (B=(x_2,y_2)), the connector length is:

```text
d_chord = sqrt((x2 - x1)^2 + (y2 - y1)^2)
```

This is exactly the Euclidean length of the straight line drawn between those two points. It is displayed as the secondary **Flat-disk connector length**. The map's local scale bar and projected polygon edges continue to use this flat-disk Euclidean metric. The connector length is not promoted as the primary route-mileage estimate, and no post-measurement radial multiplier is applied.

At 90°S, longitude continues to determine angular position around the outer disk rim. Thus two coordinates at 90°S with different longitudes remain different points around the circular Antarctic boundary; longitude is not collapsed into a single point.

## Empirical endpoint route-mileage estimate

The primary A–B readout estimates typical observed flown mileage from the directly integrated ADS-B ground-speed/time dataset. Each usable airport pair contributes one median observed mileage and one displayed-disk endpoint chord. The fitted route model predicts the observed-mileage-to-displayed-chord ratio from four endpoint/chord features:

```text
[
  mean radial fraction,
  radial share of displayed chord,
  tangential share of displayed chord,
  log(displayed chord length in km)
]
```

The predictor selects the four nearest training airport pairs in standardized feature space. It weights their observed mileage/chord ratios by inverse feature distance and combines the ratios with a weighted geometric mean. The factor is bounded to **0.75–1.50** and applied to the exact flat-disk connector length.

The logarithmic chord-length feature is essential. Endpoint shape alone would make a multi-continent route appear supported by unrelated short regional pairs. Including chord length allows the model to recognize that a request is far beyond the mileage scale represented by its reference routes.

### Training filters and independent validation

A training route must contain at least three accepted observed flights. Its mileage spread, calculated as `(p90TrackKm - p10TrackKm) / medianTrackKm`, must not exceed **0.60**. This excludes unstable airport-pair samples such as YBBN–YBCG, whose three accepted flights have a spread fraction of approximately 1.60.

The model is built from **25 training airport pairs** and evaluated against **6 independent holdout pairs**. Support is defined by a nearest standardized four-feature distance no greater than **0.90**. The reported accuracy applies only to supported routes:

- Training leave-one-route-out: **20 of 25 pairs supported**, **7.06% MAPE**, maximum supported error **18.36%**.
- Independent holdout: **4 of 6 pairs supported**, **1.15% MAPE**, maximum supported error **2.56%**.
- The two unsupported holdouts are not included in those MAPE values. The model does not claim validated performance on them.

The internal predictor can calculate a provisional value beyond the support threshold for diagnostic review, but the UI **withholds that number** and displays **Not validated** with the nearest-feature distance. A numerical extrapolation must not be presented as a usable route-mileage estimate.

### Santiago–Canberra validation example

For Santiago (−33.45°, −70.67°) to Canberra (−35.27°, 149.13°), the projected flat-disk chord is **23,894.4 km** in the map plane. This is not a validated flown-mileage result. The endpoint model's nearest training-feature distance is approximately **5.09**, against a support threshold of **0.90**; the longest usable training chord is approximately **2,314 km**, over ten times shorter than this query chord. The app therefore displays **Not validated** and withholds the former provisional estimate of **24,754.5 km**. The archive has no qualifying Santiago–Australia route observations. Additional high-coverage long-haul route samples are required before an empirical route-mileage estimate can be shown.

The route estimate is a typical mileage reference, not a selected flight path or a shortest point-to-point distance. The separately shown connector is only the exact Euclidean chord in the displayed map plane; it is not a substitute for validated route mileage.

### Generated model files and reproducibility

- `src/core/endpoint-distance-calibration-parameters.js` — active endpoint mileage model, feature statistics and quality-screened training examples.
- `data/endpoint-distance-calibration-summary.json` — generation time, supported coverage, leave-one-route-out and independent holdout metrics, exclusions and limitations.
- `scripts/fit-endpoint-distance-calibration.mjs` — deterministic fitter for the endpoint estimator.
- `src/core/measurement-engine.js` — returns the flat-disk connector and empirical endpoint estimate as separate values.
- `src/app.js` — displays a numeric empirical estimate only inside validated support, withholds unsupported predictions, and labels the connector as a projected disk chord.

Regenerate the endpoint estimator with:

```bash
npm run fit:endpoint-distance-calibration
npm test
```

The endpoint fit does not change the accepted visible-map geometry. Its validation results are specific to the route sample and support range; a low supported holdout MAPE must not be generalized to unsupported endpoints such as Santiago–Canberra.

## Validation gate and interpretation

The visible-map geometry and the endpoint route-mileage estimator have separate calibration and acceptance records. The visible transform is fitted against projected, timestamped ADS-B paths and independently integrated ground-speed/time mileage. Its accepted snapshot and southern-coverage limitations are documented in `data/flight-path-calibration-summary.json`.

The endpoint model predicts typical flown mileage from airport-pair endpoint features and observed mileage/chord ratios. It is accepted only when it has at least 20 quality-screened training pairs and 6 independent holdout pairs, at least 20 supported leave-one-route-out pairs and 4 supported holdout pairs, with the supported-subset MAPE and maximum errors inside the configured limits. Unsupported holdouts are reported separately and do not enter the supported error score.

The relevant sources are:

- `data/flight-calibration.json` — observed flight-mileage records, path coordinates, matching timestamps and telemetry quality fields.
- `data/flight-path-calibration-summary.json` — visible-map path-fit coverage and independent validation.
- `data/endpoint-distance-calibration-summary.json` — endpoint-model support coverage, leave-one-route-out/holdout errors, exclusions and limitations.
- `src/core/endpoint-distance-calibration-parameters.js` — endpoint-model feature statistics and training examples.
- `src/core/flight-path-calibration-parameters.js` — active visible map scale, latitude warp, radial profile and longitude warp.

To collect and fit locally:

```bash
npm run collect:flight-calibration
npm run fit:flight-path-calibration
npm run fit:endpoint-distance-calibration
npm test
```

The route estimator never changes the projected endpoints, the visible connector or the map scale bar. A passing score applies only to the support domain represented by the training and independent holdout pairs.

## What this method does not establish

- It does not estimate the shortest distance between two endpoints.
- It does not reproduce the flown path of any selected flight.
- It does not prove that the radial disk is a physical model of the Earth.
- It does not use coordinates to calculate the observed aircraft mileage.
- It does not claim that one empirical correction fits every route; holdout and leave-one-route-out results are essential to judging its limitations.

Country, coast, capital, airport and county coordinates remain necessary **location data** for the map and search interface. They are not distance-reference values and do not feed the flight-mileage integration.
