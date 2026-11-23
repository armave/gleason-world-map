# Legacy ADS-B route-mileage correction and flight-path calibration

> **Current status:** This document preserves the former ADS-B route-feature correction and telemetry methodology for historical reference. The runtime A–B ruler, scale bar and polygon perimeter no longer use that correction. Direct measurements now use the Euclidean chord in the visible flat-disk geometry, through `measureDirectDistance()` and `measureDistanceMeters()`. See the current measurement implementation in `src/core/measurement-engine.js` and `src/core/flat-disk.js`.

## Historical purpose and scope

This section describes the former A–B distance model, which used a calibrated base flat-disk chord and one bounded ADS-B route-feature correction. That endpoint correction has been retired from the runtime measurement engine. The active A–B measurement instead equals the Euclidean chord between endpoints in the visible flat-disk projection.

The correction is fitted to observed ADS-B ground-speed/time mileage. The output is a calibrated map distance, not a reconstruction of one selected flight's track, a guaranteed airline itinerary, or a shortest point-to-point route. Its performance depends on the reference-route coverage and the bound applied to the correction.

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

The visible map projection has its own accepted display-transform parameter file: `src/core/flight-path-calibration-parameters.js`. The endpoint-distance correction formerly described in this document was separately stored in `src/core/flight-calibration-parameters.js`; it is retained as a historical calibration artifact and is not applied to direct map measurements.

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

The endpoint-only chord fitter and the former route-feature correction are legacy artifacts. The runtime direct-measurement function no longer reads or applies their route-mileage correction; the legacy base-projection helpers are retained for analysis only and do not supply a ruler value or fallback. The active direct-distance formula uses the visible projection in `src/core/flat-disk.js`.

## Route sampling and validation

Routes are collected by airport-pair identifier. The collector searches historical seven-day windows for up to 560 days by default, capped automatically by the archive's published first and last dates, and tries to fill a target of 6 accepted flights per route while storing every accepted observation. The workflow runs automatically on relevant pushes to `main`, remains available for manual dispatch, and performs a scheduled full refresh at 03:15 UTC on the first day of each month. Monthly rather than weekly cadence is deliberate: each collection can revisit up to 560 days of seven-day windows for sparse airport pairs, so a monthly archive refresh balances discovery of newly archived seasonal Antarctic flights against repeated historical scanning. The longer lookback is intended to improve independent route coverage; it does not relax the observed-only telemetry filters or imply that every route has usable records. It uses the airport's published terminal boundary when available, or a 20 km airport-centred fallback search circle, only to ask the source API for flights with the requested origin and destination. It then checks the flight's own departure/arrival identifiers against the requested pair.

The calibration split is at the **airport-pair level**:

- Training routes are used to estimate the radial scale and endpoint correction.
- Holdout routes are not used during fitting. They are evaluated only after the model has been fitted.
- Leave-one-route-out validation refits the model after removing each training route in turn.

A route needs at least three accepted high-coverage flights. Each route contributes one median observed-only mileage value. Entire airport pairs are held out from fitting. The refreshed path-fit production gate requires at least 20 usable training routes, 6 usable holdout routes, 4 training and 2 holdout routes with an endpoint south of 30°S, at least 2 training and 2 independent holdout routes south of 45°S, and at least 1 training and 1 independent holdout route south of 60°S. These counts must also remain true after projection; a route whose flights have zero projected path length does not count. These deeper-southern counts are mandatory acceptance gates, not informational warnings. The gate applies in addition to the error limits. Polar regions remain unvalidated until suitable independent records are collected. If any gate fails, the last accepted production coefficients remain active.

### Expanded deep-southern route search

### Added regularly operated southern training and holdout pairs

The collector supplements the Antarctic airbridge search with scheduled southern South American regional services. These provide a better chance of obtaining complete timestamped ADS-B paths than the sparsely covered Antarctic logistics flights, while extending route coverage below 45°S:

- `SCEL–SCCI` (Santiago–Punta Arenas), training. Direct aircraft discovery includes LATAM A320s CC-BEE (`E80446`), CC-BHU (`E80496`), CC-BEC (`E80442`) and CC-BAL (`E8041E`).
- `SAEZ–SAWH` (Ezeiza–Ushuaia), training. Discovery includes Aerolíneas Argentinas B737s LV-KIT (`E0B254`), LV-KIU (`E0B255`), LV-HKW (`E082D7`) and LV-GFQ (`E07191`).
- `SABE–SAWH` (Aeroparque–Ushuaia), a separate training airport pair. It is kept separate from the Ezeiza pair because the departure airports differ.
- `SAWG–SABE` (Rio Gallegos–Aeroparque), independent holdout. Discovery includes LV-FQC (`E06443`), LV-KID (`E0B244`) and LV-GUC (`E07543`).
- `SCCI–SCBA` (Punta Arenas–Balmaceda), independent holdout. DAP's scheduled regional service includes CC-DHT (`E803CF`) and CC-DCU (`E803CC`).

The route identities and train/holdout assignments are fixed at the complete airport-pair level. All aircraft hints broaden discovery only; an observation still requires full-detail airport identifiers matching the configured pair or a recognized exact IATA alias, followed by the existing observed-only ground-speed/time interval, full-flight coverage, path timestamp and minimum sample-count filters. The schedules and aircraft histories establish that the services operate; they do not establish ADS-B coverage or calibration eligibility.

Sources: [DAP — Punta Arenas–Balmaceda regular route and weekly/seasonal schedule](https://dapairline.com/en/flights-punta-arenas-balmaceda/), [AirNav — DAP430 SCCI/PUQ–SCBA/BBA and CC-DHT Mode-S E803CF](https://www.airnavradar.com/data/flights/DAP430/3013816108), [Plane Finder — AR1886 Buenos Aires–Ushuaia flight history](https://planefinder.net/data/flight/AR1886), [Flightradar24 — AR1886 recent Ushuaia services](https://www.flightradar24.com/data/flights/AR1886), [PlaneTrack — CC-BAL Mode-S E8041E](https://www.planetrack.ai/aircraft/cc-bal), [Plane Finder — AR1863 Rio Gallegos–Buenos Aires history](https://planefinder.net/data/flight/AR1863), [Flightradar24 — AR1863 route history](https://www.flightradar24.com/data/flights/AR1863).

The collector now includes additional route candidates backed by published Antarctic air operations:

- `SCCI–EGAR` (Punta Arenas–Rothera), training. The British Antarctic Survey describes regular Dash-7 shuttle flights between Rothera and Punta Arenas.
- `SCCI–SCGC` (Punta Arenas–Union Glacier), training. Antarctic Logistics & Expeditions publishes seasonal passenger and cargo flights on this air bridge.
- `SCCI–SCRM`, `SAWG–SAWB` and `NZCH–NZWD`, holdout candidates. Their complete airport pairs remain excluded from fitting.
- `YMHB–YWKS` (Hobart–Wilkins Aerodrome), a future holdout candidate. The published 2026–27 Australian Antarctic Program schedule lists flights beginning 25 November 2026; this pair cannot contribute until those flights are present in the historical archive.

The ADS-B airport lookup does not recognise the Phoenix Airfield alias `NZFX`; the C-17 fallback is assigned to the single Christchurch–Williams Field pair `NZCH–NZWD` in holdout. The nearby McMurdo Sea Ice Runway alias `NZIR` is not assigned to a separate training pair, because the same physical Christchurch–McMurdo airbridge must not be split across runway aliases. The USAF C-17A Mode-S fallback is queried for its aircraft address only, then returned records are grouped by their observed endpoint identifiers. The Union Glacier route now searches two independently documented aircraft: Icelandair B757 TF-FIA (`4CC269`), with a Punta Arenas–Union Glacier service on 18 November 2026, and Zebu Air IL-76TD 7Q-ASS (`058082`), with Punta Arenas–Union Glacier operations on 20 November 2026. The Marambio holdout is the observed Rio Gallegos–Marambio airport pair (`SAWG–SAWB`) using Argentina Air Force KC-130H TC-69 (`E20022`); public flight history lists both directions on 20 November 2026 and earlier recorded arrivals at Marambio. The ADS-B provider may report an endpoint as either its ICAO code or its known IATA alias (for example `SCCI/PUQ`, `SCGC/UGL`, `SCRM/TNM`, `SAWG/RGL`, or `SAWB/QAB`). Aircraft-query summaries with a missing endpoint identifier are deferred to the full flight-detail lookup, but an explicit mismatch is rejected immediately. The full detail must then identify the same preassigned airport pair using one of the recognized exact ICAO/IATA identifiers before the observation is accepted. Other airport pairs flown by the same aircraft are retained as mismatch diagnostics, not accepted observations. Operational schedules and airport listings justify searching these pairs; they do **not** prove that ADS-B telemetry is available or of sufficient quality. The Rothera–Punta Arenas training pair also has a targeted discovery path by the published Mode-S address of the British Antarctic Survey Dash-7 VP-FBQ (`43BE5B`). Its airport-endpoint geometry search returned no candidate records in the November 2026 collection, while public aircraft history lists recent Rothera/Punta Arenas services. For aircraft-specific routes, the ICAO24 predicate is intentionally not combined with endpoint geometry: remote strips and Antarctic runways may be missing from or positioned differently in the archive's endpoint index. A summary row with missing airport identifiers can proceed to its full detail record only for a documented aircraft query; the detail must identify the exact airport pair using the airport's ICAO code or a recognized IATA alias. A summary row with explicit, nonmatching endpoint identifiers is rejected. Observed-only mileage, timestamped-path quality, and complete-pair split rules remain unchanged. The collector also carries published coordinate fallbacks for remote Antarctic aerodromes when the archive's `/airports/{ident}` index has no record (Rothera, Union Glacier, Williams Field, Marambio, King George Island and Wilkins). Aircraft-only searches may proceed even if endpoint metadata is absent; if no published fallback exists, an endpoint's coordinates are derived only from exact-match flight-detail `start_point`/`end_point` records after airport identifiers have passed the route check. The dataset records whether coordinates came from the archive index, published airport metadata or observed exact-route endpoints. These coordinates are used only for geographic coverage classification and map-endpoint metadata, never for the observed ground-speed/time mileage target. Other calibration routes continue using the airport's published endpoint geometry. A route contributes to calibration only after the collector finds at least three flights meeting all observed-only mileage and timestamped-path quality filters. The same route's entire pair remains assigned to a single training or holdout split. A zero-sample candidate is diagnostic only and cannot satisfy any coverage gate.

### Aircraft-only discovery fallback — 23 November 2026

The aircraft-specific ADS-B query now uses only its normalized `icao24` list. It no longer combines that identity with endpoint geometry in the source query. The collector records the airport identifiers returned by the archive and compares the complete unordered airport pair with the route's preassigned training/holdout entry before requesting full trajectory details. This is deliberate: the API may have no usable endpoint geometry index for a remote Antarctic runway even when its historical flight record exists. Mismatched airport pairs are stored as diagnostics and cannot enter fitting. Ordinary routes without an aircraft hint continue to use the two endpoint geometries. This change broadens discovery only; it does not weaken route identity, observation-quality or calibration acceptance gates.

Sources: [British Antarctic Survey — Rothera Air Facility](https://www.bas.ac.uk/polar-operations/sites-and-facilities/facility/rothera/rothera-air-facility/), [Antarctic Logistics & Expeditions — Air Transport](https://antarctic-logistics.com/services/air-transport/), [ALE flight schedule](https://antarctic-logistics.com/services/air-transport/flight-schedule/), [Australian Antarctic Program — 2026–27 flight schedule](https://www.antarctica.gov.au/antarctic-operations/travel-and-logistics/shipping-and-air-schedules/2627/), [USAP Air Operations Manual](https://www.usap.gov/logistics/documents/Air_Operations_Manual.pdf), [NOTAC Williams Field coordinates](https://notac.aero/airports/NZWD/), [VATNZ McMurdo Ice Runway coordinates](https://www.vatnz.net/airspace/airport/NZIR), [DGAC Chile SCRM airport record](https://aipchile.dgac.gob.cl/aerodromo/show?designador=SCRM), [Marambio Base coordinates](https://opennav.com/airport/SAWB), [Australian Antarctic Program Wilkins Aerodrome](https://www.antarctica.gov.au/antarctic-operations/travel-and-logistics/aviation/intercontinental-operations/wilkins-aerodrome/), and [Antarctic airport identifiers](https://www.flightradar24.com/data/airports/antarctica). The Rothera airframe lookup is documented by [Flightradar24's VP-FBQ aircraft history](https://www.flightradar24.com/data/aircraft/vp-fbq), which lists the aircraft's 43BE5B Mode-S address and recent Rothera–Punta Arenas flights. [Argentine Air Force — Antarctic Saab 340 operations](https://noticiasenvuelo.faa.mil.ar/public/articulos.php?idn=1113), [Flightradar24 — TC-69 aircraft history and Mode-S E20022](https://www.flightradar24.com/data/aircraft/tc-69), [AirNav — FAG628 Marambio–Rio Gallegos flights on 20 November 2026](https://ja.airnavradar.com/data/flights/FAG628), and [Flightradar24 — FAG628 flight playback](https://www.flightradar24.com/data/playback/42a9f128). [Flightradar24 — TF-FIA / 4CC269 Union Glacier flights](https://www.flightradar24.com/data/aircraft/tf-fia), [Flightradar24 — 7Q-ASS / 058082 Union Glacier flights](https://www.flightradar24.com/data/aircraft/7q-ass), [Flightradar24 — TC-69 / E20022](https://www.flightradar24.com/data/aircraft/tc-69), and [Marambio Airport IATA QAB / ICAO SAWB](https://www.flightradar24.com/data/airports/qab).

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

The same shared 12-circle data drives both the calibration table and the ten dotted interior guide rings drawn on the map. Latitude circles, coastlines, country boundaries, labels, map clicks and inverse lookup use the display transform. The scale bar samples coordinates through that transform and evaluates the reading with the one canonical distance function.

**Measurement correspondence:** Every displayed distance uses one canonical formula implemented by `measureDistanceMeters()`. The projected endpoints are encoded using the flat disk's base radial warp; the direct base-disk chord is multiplied by one bounded ADS-B route-feature correction. The same function supplies A–B, the on-map distance label, scale-bar sampling, polygon edge labels, polygon perimeter and PNG metadata. The visual map renderer remains unchanged; the number shown is the calibrated map distance, not a separate measurement of the screen-pixel chord.
## One canonical distance formula

The application has one source of truth for distance. `measureDirectDistance()` computes it, and `measureDistanceMeters()` is the shared numeric entry point used by all display surfaces.

For endpoints A and B, the formula is:

```text
C_base(A,B) = Euclidean chord between A and B in the calibrated base flat disk
f(A,B)      = [mean radial fraction, radial chord share, tangential chord share]

r_hat       = inverse-distance weighted geometric mean of the two nearest
              training routes' observed-mileage / base-chord ratios

factor      = clamp(r_hat / radialScaleKm, 0.50, 2.50)

D(A,B)      = C_base(A,B) * factor
```

The three endpoint features are calculated from the same base radial warp used by the ADS-B calibration examples. The predictor uses the two nearest training airport pairs in standardized feature space. Their inverse-feature-distance weights are multiplied by any available route-quality weight, then normalized for the geometric mean. The result is bounded by the accepted factor limits before being applied to the base chord.

The observed mileage targets are integrated from ADS-B ground speed and timestamp intervals; no distance derived from endpoint coordinates is used as a calibration target. This is the single map distance formula, not an additional estimate alongside an uncorrected chord.

### Santiago–Canberra reference check

For Santiago (−33.45°, −70.67°) to Canberra (−35.27°, 149.13°), the current canonical output is approximately **11,389.1 km**. Its nearest training examples include YPAD–YSSY and YPAD–YPPH. The unbounded correction is below the accepted lower bound, so the single applied factor is **0.50×**. This places the result inside the 11,000–11,700 km reference range supplied for this pair.

The calibration factor is clamped rather than silently switching formulas. The diagnostics expose the bound and nearest reference routes. The value is still a calibrated map distance based on the observed route sample; it is not a reconstruction of a particular flight's track or a promise about a specific carrier's routing.

### Shared implementation

- `src/core/measurement-engine.js` — canonical ADS-B-calibrated base-chord formula and shared `measureDistanceMeters()` entry point.
- `src/core/flight-calibration-fit.js` and `src/core/flight-calibration-parameters.js` — route-feature predictor and its observed-flight calibration data.
- `src/app.js` — calls the shared function for the A–B display, connector label, scale bar and PNG footer; passes the same function to polygon edge labels and perimeter calculations.
- `src/core/flat-disk.js` — computes polygon area and requires the supplied canonical distance callback for perimeter.

The retired endpoint-only estimator has been removed from the project. There is no secondary projected-chord readout and no fallback to an uncorrected chord. The map's circular layout, 12-circle rendering, North Pole centre, longitude-indexed Antarctic rim and coastline geometry are not changed by this consolidation.

Regenerate the route-feature fit locally with:

```bash
npm run fit:flight-calibration
npm test
```

## Validation gate and interpretation

The visible-map display transform and the canonical distance correction have separate calibration records because they serve different roles. The display transform controls how the map is drawn. The distance correction controls the one number shown for every measured pair. Neither creates an alternate distance readout.

The active distance model predicts a bounded mileage-per-base-chord correction from three endpoint/chord features and the nearest observed airport-pair examples. Independent ADS-B route-holdout tests verify that the canonical distance remains within the configured route-error limits for the reference routes.

The relevant sources are:

- `data/flight-calibration.json` — observed flight-mileage records, path coordinates, matching timestamps and telemetry quality fields.
- `data/flight-path-calibration-summary.json` — visible-map path-fit coverage and independent validation.
- `src/core/flight-calibration-parameters.js` — active three-feature ADS-B distance correction, bounded factor and route reference examples.
- `tests/measurement-engine.test.js` — independent route-holdout checks for the canonical distance returned by `measureDirectDistance()`.
- `src/core/flight-path-calibration-parameters.js` — active visible map scale, latitude warp, radial profile and longitude warp.

To collect and fit locally:

```bash
npm run collect:flight-calibration
npm run fit:flight-path-calibration
npm run fit:flight-calibration
npm test
```

The single distance formula is evaluated against observed reference-route mileage. Its correction is bounded for every pair; diagnostics report when a reference-range or correction-bound warning applies. The same returned number is used by all map distance surfaces.

## Latest end-to-end replacement review — 23 November 2026

The completed archive refresh is [GitHub Actions run #45114200598](https://github.com/armave/gleason-world-map/actions/runs/45114200598). It queried the published historical range from 19 May 2025 through 22 November 2026 (560 days) and committed a 103-airport-pair dataset containing 194 observed-only ADS-B flights with timestamped paths. The dataset yielded 26 training and 6 independent holdout airport pairs with at least three accepted mileage observations each; the visual-path fitter used 151 training and 36 holdout trajectories with 29,855 timestamped path points.

In the completed pre-fallback collection snapshot (run `#45114200598`), the additional Antarctic/very-southern candidate routes returned zero matching flights. That run preceded the aircraft-only query fix and the airport-metadata fallback: aircraft discovery was still constrained by endpoint geometry, and routes whose remote endpoints were absent from the archive airport index were skipped before querying. Its zero counts therefore did not establish that the documented aircraft had no archive flights on those routes. The subsequent collector changes query known aircraft by Mode-S alone, then require exact route identifiers in both the summary and full flight detail; they also supply published remote-airport coordinates when the index is missing. The next completed archive snapshot is needed to determine whether any of these candidate routes actually have enough observed telemetry.

The latest visible-map fit remains **rejected**:
- South of 30°S: 4 training and 2 holdout route pairs (minimum met).
- South of 45°S: 0 training and 0 holdout pairs; minimum is 2/2.
- South of 60°S: 0 training and 0 holdout pairs; minimum is 1/1.
- No global path-fit error metrics can be scored until the required independent southern coverage is present.

The separate route-mileage distance correction is also **rejected**:
- Training MAPE 11.70% (maximum 10%).
- Independent holdout MAPE 23.15% (maximum 12%).
- Worst holdout route error 56.83% (maximum 20%).
- Leave-one-route-out MAPE 11.70% (maximum 15%); worst leave-one-out route error 75.79% (maximum 45%).

Both fit scripts completed, but neither candidate passed its acceptance gates. The generated reports were committed without replacing the active parameter files. The current visible transform remains at source dataset version 4 and the last approved route-mileage correction remains at source dataset version 2. The calibration panel now reports both fit decisions and their separate roles.

The parallel multi-anchor experiment is not ready to substitute either: `data/multi-anchor-distance-observations.json` still contains no independently sourced direct-straight-line observations, so its fitter correctly refuses to generate a candidate. Flown ADS-B mileage is not a straight-line endpoint distance and must not be substituted for one.

**Replacement decision:** the new collector, diagnostics, UI and deployment work are complete, but the new map/distance calibration is not approved for replacement. Keep the last approved map active until actual qualifying southern observations and passing independent distance-validation data are available. Do not relax the geographic or error gates to force promotion.

## What this method does not establish

- It does not estimate the shortest distance between two endpoints.
- It does not reproduce the flown path of any selected flight.
- It does not prove that the radial disk is a physical model of the Earth.
- It does not use coordinates to calculate the observed aircraft mileage.
- It does not claim that one empirical correction fits every route; holdout and leave-one-route-out results are essential to judging its limitations.

Country, coast, capital, airport and county coordinates remain necessary **location data** for the map and search interface. They are not distance-reference values and do not feed the flight-mileage integration.


The collector deliberately keeps Christchurch–Williams Field (NZCH–NZWD) as one independent holdout pair. It does not also assign Christchurch–McMurdo Sea Ice Runway (NZCH–NZIR) to training: both are runway identities serving the same McMurdo airfield complex, and using the same identified C-17 airbridge under two nearby runway aliases could leak a physical route between training and holdout. A route-pair alias is not an independent holdout.
