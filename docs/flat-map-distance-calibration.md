# Flat-map distance calibration: data and methodology

**Status:** Describes the empirical A–B distance correction introduced on the `calibration/empirical-direct-line-correction` branch (PR #48).

## 1. What this calibration is intended to estimate

The A–B tool still draws one straight segment between the two locations after projecting them into the circular flat-disk coordinate plane. The value shown beside that line is:

```text
displayed distance = flat-disk straight-chord length × empirical correction factor
```

This is a point-to-point benchmark estimate. It is **not** an estimate of the length flown by a particular airline, on a particular date, at a particular altitude. It is also not a route planner, a track reconstruction, or a proof that the projection is a physical model of the Earth.

The production A–B calculation does not evaluate a sphere, ellipsoid, great-circle arc, or geodesic. Published straight-line reference values are used offline as calibration targets; the running app evaluates the fixed empirical formula documented below.

## 2. Important distinction: straight-line reference distance versus flown distance

The word *flying* in the reference pages is easy to misread. Travelmath describes its flight distance as the straight-line distance “as the crow flies”; its distance documentation says the result is calculated with a great-circle formula, using the Vincenty algorithm and WGS84 ellipsoid. It is **not** a measured aircraft track or an airline's filed/actual route.

Sources:
- [Travelmath distance-calculator methodology](https://www.travelmath.com/distance/)
- [Example: ORD–HKG distance](https://www.travelmath.com/distance/from/ORD/to/HKG) — explicitly describes straight-line flying distance and WGS84/Vincenty.
- [Example: HEL–NRT distance](https://www.travelmath.com/distance/from/HEL/to/NRT) — same methodology.
- [Example: JFK–SIN distance](https://www.travelmath.com/distance/from/JFK/to/SIN) — same methodology.

This means that operational flight detours do **not** explain the residual errors in the calibration tables below: the target values are already point-to-point straight-line references. If we instead calibrate to recorded airline tracks, we would be fitting a different quantity. Such tracks may be longer because of winds, weather, airspace restrictions, routing rules, diversion-airport requirements, and airline operations.

For example, Flightpaths describes its SCL–SYD data as recorded flights and separately reports a shortest great-circle distance. Its recorded distances vary by flight; they are not interchangeable with the straight-line benchmark used here: [Flightpaths: SCL–SYD](https://www.flightpaths.com/SCL-SYD).

### About routes near the North Pole

It is not accurate to say that commercial aircraft never fly through the North Polar region. The FAA defines the North Polar Area for operations as the region north of 78°N and specifies additional operational requirements for flights entering it. Transport Canada's Aeronautical Information Manual describes long-range routes via the North Pole as routine. This does **not** mean every airline route crosses the exact geographic point at 90°N; it means polar-area operations do occur and are governed by specific operational considerations.

Sources:
- [FAA Advisory Circular 120-42B, Polar Operations](https://www.faa.gov/documentlibrary/media/advisory_circular/120-42b.pdf)
- [Transport Canada Aeronautical Information Manual, Polar Routes](https://tc.canada.ca/sites/default/files/2023-10/aim-2023-2_rac-e.pdf)

The current calibration does not use an actual polar flight track. Its HEL–NRT airport-pair holdout is a straight-line Travelmath reference, not evidence of the route any airline flew.

## 3. Data used

The benchmark consists of two groups:

1. **15 city pairs used to fit the correction.** Reference values are published Travelmath straight-line flying distances, rounded to whole kilometres. The coordinates used for the map chord are the corresponding entries in `data/capitals.json`.
2. **Five airport pairs held out from fitting.** Their reference values are also Travelmath straight-line airport-to-airport distances. The endpoint coordinates are the fixed test-fixture values shared with `tests/geodesic.test.js`.

“Held out” means those five route pairs were not used when estimating the regression coefficients. It does **not** mean they are from an independent provider: both groups use Travelmath references. They are an out-of-fit route check, not an independent-source validation.

### 3.1 Fitted city-pair data

Coordinates are shown as latitude, longitude in decimal degrees. The “map result” column is the current implementation's corrected reading, rounded to the nearest kilometre. Error is `(map result / reference − 1) × 100`.

| City pair | A coordinate | B coordinate | Reference | Map result | Error |
|---|---:|---:|---:|---:|---:|
| [Helsinki–Wellington](https://www.travelmath.com/distance/from/Helsinki,+Finland/to/Wellington,+New+Zealand) | 60.17, 24.93 | −41.30, 174.78 | 17,068 km | 16,890 km | −1.0% |
| [Suva–New Delhi](https://www.travelmath.com/distance/from/Suva,+Fiji/to/New+Delhi,+India) | −18.13, 178.42 | 28.60, 77.20 | 12,028 km | 12,123 km | +0.8% |
| [Mexico City–Lisbon](https://www.travelmath.com/distance/from/Mexico+City,+Mexico/to/Lisbon,+Portugal) | 19.43, −99.13 | 38.72, −9.13 | 8,686 km | 8,609 km | −0.9% |
| [Ankara–Washington, D.C.](https://www.travelmath.com/distance/from/Ankara,+Turkey/to/Washington,+DC) | 39.93, 32.87 | 38.89, −77.05 | 8,746 km | 8,469 km | −3.2% |
| [Santiago–Paris](https://www.travelmath.com/distance/from/Santiago,+Chile/to/Paris,+France) | −33.45, −70.67 | 48.87, 2.33 | 11,627 km | 11,789 km | +1.4% |
| [Brasília–London](https://www.travelmath.com/distance/from/Brasilia,+Brazil/to/London,+United+Kingdom) | −15.79, −47.88 | 51.50, −0.08 | 8,772 km | 8,916 km | +1.6% |
| [Buenos Aires–Canberra](https://www.travelmath.com/distance/from/Buenos+Aires,+Argentina/to/Canberra,+Australia) | −34.58, −58.67 | −35.27, 149.13 | 11,759 km | 11,746 km | −0.1% |
| [Tokyo–Madrid](https://www.travelmath.com/distance/from/Tokyo,+Japan/to/Madrid,+Spain) | 35.68, 139.75 | 40.40, −3.68 | 10,789 km | 10,858 km | +0.6% |
| [Santiago–Canberra](https://www.travelmath.com/flying-time/from/Santiago,+Chile/to/Canberra,+Australia) | −33.45, −70.67 | −35.27, 149.13 | 11,345 km | 11,497 km | +1.3% |
| [Paris–Rome](https://www.travelmath.com/distance/from/Paris,+France/to/Rome,+Italy) | 48.87, 2.33 | 41.90, 12.48 | 1,109 km | 1,110 km | +0.1% |
| [Tokyo–Seoul](https://www.travelmath.com/distance/from/Tokyo,+Japan/to/Seoul,+South+Korea) | 35.68, 139.75 | 37.55, 126.98 | 1,160 km | 1,205 km | +3.9% |
| [Yerevan–Moscow](https://www.travelmath.com/distance/from/Yerevan,+Armenia/to/Moscow,+Russia) | 40.17, 44.50 | 55.75, 37.60 | 1,804 km | 1,792 km | −0.7% |
| [Nairobi–Cairo](https://www.travelmath.com/distance/from/Nairobi,+Kenya/to/Cairo,+Egypt) | −1.28, 36.82 | 30.05, 31.25 | 3,518 km | 3,304 km | −6.1% |
| [London–Reykjavik](https://www.travelmath.com/distance/from/London,+United+Kingdom/to/Reykjavik,+Iceland) | 51.50, −0.08 | 64.15, −21.95 | 1,894 km | 1,920 km | +1.4% |
| [Mexico City–Washington, D.C.](https://www.travelmath.com/distance/from/Mexico+City,+Mexico/to/Washington,+DC) | 19.43, −99.13 | 38.89, −77.05 | 3,030 km | 3,067 km | +1.2% |

The city coordinates above match the bundled records in `data/capitals.json`. That file's source is pinned in `data/metadata.json` to `iliyaj/country-data`, commit `2a34180a6573aaff977589b8b3644266c0a8c24f`, file `data/country-capital.csv`; its metadata identifies REST Countries v3.1 as the underlying data source. Coordinates are rounded in that source, so they should not be interpreted as survey-grade city-centre positions.

### 3.2 Held-out airport-pair data

These five airport pairs were not used to fit the correction. Travelmath's airport pages give straight-line point-to-point flying distances, not track lengths.

| Airport pair | A coordinate | B coordinate | Reference | Map result | Error |
|---|---:|---:|---:|---:|---:|
| [SCL–SYD](https://www.travelmath.com/distance/from/SCL/to/SYD) | −33.3929, −70.7858 | −33.9461, 151.1772 | 11,363 km | 11,380 km | +0.1% |
| [LHR–SIN](https://www.travelmath.com/distance/from/LHR/to/SIN) | 51.4700, −0.4543 | 1.3644, 103.9915 | 10,886 km | 11,171 km | +2.6% |
| [ORD–HKG](https://www.travelmath.com/distance/from/ORD/to/HKG) | 41.9742, −87.9073 | 22.3080, 113.9185 | 12,543 km | 12,971 km | +3.4% |
| [HEL–NRT](https://www.travelmath.com/distance/from/HEL/to/NRT) | 60.3172, 24.9633 | 35.7720, 140.3929 | 7,848 km | 8,496 km | +8.3% |
| [JFK–SIN](https://www.travelmath.com/distance/from/JFK/to/SIN) | 40.6413, −73.7781 | 1.3644, 103.9915 | 15,347 km | 15,843 km | +3.2% |

The airport coordinate literals are preserved in `tests/measurement-engine.test.js` and were copied from the existing fixture in `tests/geodesic.test.js`. The repository does not currently record a versioned upstream airport-coordinate dataset for those literals. They are included here exactly as used, rather than silently assigning them a provenance that the source files do not record.

## 4. Flat-disk base geometry

The base projection uses:

```text
theta = pi/2 - latitudeRadians
r = R * theta
x = r * cos(longitudeRadians)
y = -r * sin(longitudeRadians)
```

The base radial scale is:

```text
R = 2,778.193571010486 km
outer disk radius = pi * R = 8,727.952512936938 km
```

This R was set so that the uncorrected flat-disk chord between the bundled capital coordinates for Canberra and Santiago is 11,340 km. That is the base coordinate scale only. The new A–B correction is applied after the chord is calculated, so the final A–B readout for that route is the model result shown in the fitted table (about 11,497 km).

For endpoints A and B, the raw map-plane chord is:

```text
D_chord = hypot(x_B - x_A, y_B - y_A)
```

## 5. Empirical correction model

The correction estimates a positive multiplier from the two endpoints. All angle inputs below are in radians.

```text
thetaA = pi/2 - latitudeA
thetaB = pi/2 - latitudeB
meanTheta = (thetaA + thetaB) / 2
thetaSpan = abs(thetaA - thetaB)
longitudeSpan = abs(wrapLongitude(longitudeB - longitudeA))
```

The nine polynomial features, in the exact code order, are:

```text
f = [
  meanTheta,
  thetaSpan,
  longitudeSpan,
  meanTheta^2,
  thetaSpan^2,
  longitudeSpan^2,
  meanTheta * thetaSpan,
  meanTheta * longitudeSpan,
  thetaSpan * longitudeSpan
]
```

Each feature is standardized using the training-set mean `mu` and scale `s`. The fitted log multiplier is:

```text
z = intercept + sum(beta[j] * ((f[j] - mu[j]) / s[j]))
factor = clamp(exp(z), 0.9, 2.5)
```

The coefficients, feature means, scales, and intercept currently embedded in `src/core/measurement-engine.js` are recorded here for reproducibility:

```json
{
  "intercept": 0.6553547535763362,
  "ridgeLambda": 0.1,
  "factorBounds": [0.9, 2.5],
  "featureOrder": [
    "meanTheta", "thetaSpan", "longitudeSpan",
    "meanTheta^2", "thetaSpan^2", "longitudeSpan^2",
    "meanTheta*thetaSpan", "meanTheta*longitudeSpan",
    "thetaSpan*longitudeSpan"
  ],
  "featureMeans": [
    1.211485393686824, 0.48081493786774454, 1.2647353891651711,
    1.6806202539625672, 0.5279777387195358, 2.5425472893449252,
    0.6209351570979428, 1.8063142195331707, 0.6728322207183389
  ],
  "featureScales": [
    0.46143623053033955, 0.5447887060528813, 0.9710775894531543,
    1.3234576976415762, 0.908673582085491, 2.6742718373525842,
    0.782050517114795, 1.8024416254621414, 1.1946839238877458
  ],
  "coefficients": [
    -0.008916724670290893, 0.06619917556528573, 0.008375163763085678,
    -0.12753843897844064, -0.056992860455687, 0.13746596492543817,
    0.07422938110820021, -0.2283527194504505, 0.0007986676416541728
  ],
  "meanThetaClampRadians": [0.5615596868291755, 2.180352568053916],
  "thetaSpanClampRadians": [0, 1.7709855919986461]
}
```

### 5.1 How the coefficients were fitted

For each of the 15 city pairs:

1. Calculate `D_chord` from the existing flat-disk projection and the bundled capital coordinates.
2. Form the target `y = ln(referenceDistanceKm / D_chordKm)`.
3. Build and standardize the nine features using their training-set means and population standard deviations.
4. Fit a ridge-regularized least-squares model to `y`, with penalty `lambda = 0.1` on the nine standardized feature coefficients; the intercept is not penalized.
5. At runtime, apply the fitted polynomial, exponentiate it to obtain a positive multiplier, and clamp the result to [0.9, 2.5].

The runtime clamps mean colatitude to the observed training interval [0.56156, 2.18035] radians and colatitude span to [0, 1.77099] radians. Those clamps and the factor bounds prevent unstable values; they do not make predictions outside the observed route sample reliable.

The features use absolute wrapped longitude separation, not the absolute longitude origin. The factor is therefore invariant to a common rotation of both endpoints around the disk, and reversing A and B produces the same factor.

## 6. Validation results

The reported percentage error is:

```text
errorPercent = (predictedKm / referenceKm - 1) * 100
```

| Evaluation | Mean absolute percentage error | Root-mean-square percentage error | Maximum absolute error |
|---|---:|---:|---:|
| 15 fitted city pairs (in-sample) | 1.62% | 2.24% | 6.09% |
| 5 held-out airport pairs | 3.53% | 4.41% | 8.26% |
| 15 city pairs, leave-one-out | 4.79% | 7.90% | 24.47% |

Leave-one-out means the model is refitted 15 times, each time omitting one city pair and predicting the omitted pair. This is a more demanding check than the in-sample table. Its 24.47% worst case is a warning that the dataset is too small and route coverage is uneven. The airport holdouts are useful, but because they use the same Travelmath source and methodology, they are not independent-source validation.

The automated regression tests in `tests/measurement-engine.test.js` enforce maximum errors of 7% for the fitted city pairs and 9% for the five held-out airport pairs, along with symmetry, longitude wrapping, bounds, invalid-coordinate handling, and behavior across the 60°S reference line.

## 7. What the calibration does not establish

- It does not predict a real airline's flown route. It uses straight-line point-to-point reference distances.
- It does not remove the underlying limitations of the radial flat-disk projection. It adds an empirical correction to the numeric result.
- It does not prove that the map projection represents the physical shape of the Earth.
- It does not provide survey-grade city-centre or airport reference coordinates. City coordinates are rounded capital records; the airport fixture coordinates currently lack a pinned dataset release in the repository.
- It does not guarantee accuracy for arbitrary coordinates, especially outside the training set's geographic and angular coverage.
- The fit target is a WGS84-based external reference even though the production map measurement code does not run WGS84 or geodesic algorithms. This distinction is essential to understanding the methodology.

The separate WGS84 implementation and actual-flight comparisons in `src/core/geodesic.js` and `tests/geodesic.test.js` are not called by the active A–B tool and were not used to fit this correction.

## 8. Recommended next validation step

Keep the current A–B label as a straight-line point-to-point estimate. For a separate aviation-oriented feature, build a versioned dataset of recorded flights containing airline/flight identifier, date, origin/destination airport, source of track observations, and measured track length. Compare those track lengths with the great-circle baseline, but do not mix them into the current point-to-point calibration. Actual-track distance depends on flight and date; a single static city-pair correction cannot represent every operational route.
