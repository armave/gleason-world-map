# Empirical distance calibration for the flat-disk map

## Status

This is an active research implementation on the `calibration/empirical-distance-warp-v1` branch. It fits a separate two-dimensional candidate transformation against independently measured physical distances. It does **not** replace the pure Gleason reference map or activate a candidate in the website.

The calibration is now allowed to move any mapped feature, including the North Pole centre and Antarctic outer rim. It can stretch, compress, shear locally, translate and change the overall output extent. The output does not have to remain circular. The source domain remains the original Gleason disk, while the transformed map may extend beyond its original rim.

A positive-Jacobian topology check, finite output extent, uncertainty-aware fit and independent holdout tests remain mandatory. No transform is promoted solely because it makes selected coastlines or a small set of distances look right.

## What qualifies as a distance observation

Two measurement types are accepted:

- `direct-straight-line`: a traceable, independently measured straight endpoint-to-endpoint length.
- `direct-survey-baseline`: a physical survey baseline whose published value is the **adjusted horizontal distance**, with its uncertainty and coordinate references for both exact monument marks.

Survey baseline records must have:
- `split`: `train` or `holdout`
- `a`, `b`: stable monument IDs, their latitude/longitude inputs, and each point's `coordinateSource.provider` and `coordinateSource.reference`
- `distanceKm`: the published adjusted horizontal distance in kilometres
- `measurementType`: exactly `direct-survey-baseline`
- `measurementBasis`: exactly `adjusted-horizontal`
- `uncertaintyKm`: the published distance uncertainty in kilometres
- `source.provider`, `source.reference`: provenance for the measured baseline
- `source.groupId`: stable baseline/site identifier

Every pair from one survey line or site must remain in one split. A baseline group cannot contribute some segments to training and other segments to holdout. Holdout baselines should be geographically independent from training sites.

The fitter weights surveyed lengths by their stated relative uncertainty, normalised to the median relative uncertainty and clamped to prevent a single record from dominating. Uncertainty is not invented when missing; a direct-survey-baseline without a stated positive uncertainty is rejected.

Do not use airline mileage, ADS-B track length, travel time multiplied by speed, shortest-route distance, an inferred map scale, or distances calculated from globe/sphere/ellipsoid/geodesic formulas. Surveyed horizontal lengths must be taken as the published reference values, not recomputed from endpoint coordinates.

## Sources being evaluated

### NOAA National Geodetic Survey EDMI Calibration Baselines

The NGS EDMI Calibration Baseline programme reports more than 400 calibration lines across the United States and publishes location descriptions plus adjusted calibration-baseline measurement results. Typical baselines have several monuments and multiple measured segments. These are promising local distance constraints, but each record must include exact monument coordinates from a traceable source before it can be admitted to this dataset.

The existence of a baseline certificate is not, by itself, enough to locate every monument precisely on this map. Approximate site pins or a site-centre coordinate are not accepted as endpoint coordinates.

### Nummela Standard Baseline, Finland

The National Land Survey of Finland describes the Nummela line as a length standard with observation pillars from 24 m to 864 m. Its published full-line result is 864,122.9 mm ± 0.1 mm, and the scale is traceable to the definition of the metre. The 2024 work also describes six EDM observation pillars and a series of underlying markers.

This is a high-quality European reference, but it contributes a local measurement network, not global coverage. Each segment used by the fitter must have the certified length and exact endpoint coordinate references for the physical marks.

### EURO5000 Reference Baseline, Poland

The 2026 EURO5000 publication describes a 5 km reference baseline established and validated in Poland using repeated GNSS and EDM campaigns. The reported measurement uncertainty is below 1 mm (k=2), with independent checks by two external institutions.

This is another valuable regional constraint. It is not a substitute for measured points in other continents or the deep southern map.

## Why the observations file is still empty

The repository currently has no observation records that satisfy the complete requirements of measured length **and** exact endpoint coordinate provenance. Published baseline length alone is not enough. No NOAA, Nummela or EURO5000 values have been fabricated into the input file.

The earlier ADS-B archive remains unsuitable for this task: it records flown mileage integrated from observed speed and elapsed time. A flight track is longer than, or otherwise different from, a direct straight-line endpoint measurement. The old visual-path calibration was also rejected for insufficient southern geographic coverage.

## Candidate fit and safeguards

Run:

```bash
npm run fit:multi-anchor
npm test
```

The fit:
1. validates every source record and coordinate reference;
2. rejects duplicate endpoint pairs and split leakage within surveyed baseline groups;
3. checks latitude/longitude coverage and independent, unseen holdout anchors;
4. checks the planar distance-constraint rigidity rank and graph redundancy;
5. optimizes anchor positions against measured lengths with a robust loss and a weak prior to the pure Gleason seed;
6. fits an unconstrained Gaussian radial-basis displacement field across the full source disk, including its centre and rim;
7. tests the Jacobian over a dense disk grid and adaptive samples around every control;
8. tests forward/inverse round trips and the maximum transformed map extent;
9. reports training and independent holdout errors separately.

The current global acceptance requirements include at least 30 training and 12 holdout distances, 12 training anchors, broad latitude and longitude coverage, independent unseen holdout anchors, at least one training and holdout anchor south of 60°S, training MAPE at most 8%, holdout MAPE at most 10%, maximum holdout-pair error at most 20%, and no foldover. The candidate can move the pole and outer rim and can expand to five times the original radius; this is a numerical safety bound, not an assertion about final map scale.

A passing candidate is still written separately. The fitting script never modifies the production projection or measurement engine. Runtime integration requires its own review, map-wide rendering and inverse-transform work, scale-bar and measurement tests, browser tests, and independent geographic validation.

## Provenance links

- NOAA NGS EDMI Calibration Baseline Program: https://www.ngs.noaa.gov/CBLINES/index.shtml
- NOAA NGS baseline data products: https://geodesy.noaa.gov/CBLINES/BASELINES/
- National Land Survey of Finland, Nummela Standard Baseline: https://www.maanmittauslaitos.fi/en/research/research/other-research-and-measuring-stations/nummela-standard-baseline
- National Land Survey of Finland, Nummela measurement update: https://www.maanmittauslaitos.fi/en/topical_issues/nummela-finland-home-worlds-most-accurate-line
- EURO5000 reference baseline (2026): https://doi.org/10.1016/j.measurement.2026.121347
