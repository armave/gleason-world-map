# Experimental multi-anchor flat-disk calibration

## Status

This is a parallel research candidate. It does not replace or modify the active map projection, active coordinate inverse, or production distance engine. A fitted model is written separately and requires manual review before any runtime integration.

The current repository contains observed ADS-B ground-speed/time mileage and timestamped aircraft paths. Those are not direct endpoint-to-endpoint distances. Flown mileage includes route detours and must not be substituted for a straight-line distance target.

## Method

1. Start with the existing circular flat disk as the seed drawing plane.
2. Load independently sourced straight-line distances between named reference anchors.
3. Split complete unordered endpoint pairs into training and holdout sets before fitting.
4. Adjust training-anchor positions with a confidence-weighted Huber loss to reduce relative distance error while regularizing movement from the seed map.
5. Fit a regularized Gaussian radial-basis field to the optimized anchor displacements, excluding fixed centre/rim controls from the solve.
6. Multiply the field by a smooth radial envelope that is zero at the North Pole and at the full Antarctic rim.
7. Test independent holdout errors, dense sampled Jacobian determinants, maximum interpolated displacement, and radial-boundary overshoot.

This is a constrained two-dimensional drawing-plane fit. It does not infer or assert the physical shape of the Earth.

## Input

Copy data/multi-anchor-distance-observations.template.json to data/multi-anchor-distance-observations.json and add records with this shape:

- split: train or holdout
- a, b: stable anchor IDs with latitude and longitude
- distanceKm: independently measured endpoint-to-endpoint straight distance
- measurementType: exactly direct-straight-line
- source.provider, source.reference: traceable provenance for that specific observation
- confidence: optional value from 0.1 to 1

Do not use airline mileage, ADS-B track length, travel time multiplied by speed, or a route's flown mileage as a straight-line target. Do not calculate a distance from a globe, sphere, ellipsoid, great-circle, or geodesic formula for this project.

The calibration requires at least 30 training and 12 independent holdout pairs, at least 12 distinct training anchors, coverage across four training latitude bands and four training longitude sectors, and a 3-vertex-connected training anchor graph with minimum degree three. It also computes the planar distance-constraint rigidity matrix at the seed positions and requires rank 2N−3, where N is the number of training anchors; a graph that is connected but geometrically flexible is rejected. Holdout data must cover at least eight distinct anchors, three latitude bands and four longitude sectors; at least four holdout anchors must be absent from the training anchor set. A pair may appear only once and in only one split. The fitter also reports how many holdout anchors overlap training so pair-level validation is not mistaken for geographic extrapolation validation.

## Run

Run npm run fit:multi-anchor to produce a candidate summary. Run npm test for the regression suite.

## Promotion gates

- Training MAPE no greater than 8%.
- Independent holdout MAPE no greater than 10%.
- Maximum holdout pair error no greater than 20%.
- Holdout MAPE improves over the current flat-disk baseline by at least 0.25 percentage points.
- Planar rigidity matrix rank exactly 2N−3.
- Minimum sampled Jacobian determinant at least 0.2.
- Forward/inverse coordinate round-trip validation across the disk.
- Maximum training-anchor and interpolated-warp displacement no greater than 12% of disk radius.
- No sampled radial overshoot beyond the circular rim and numerical pole/rim displacement below 1e-5 km.
- At least eight independent holdout anchors, three holdout latitude bands, four holdout longitude sectors, and four holdout anchors never used for fitting.

The fitting script writes data/multi-anchor-distance-calibration-summary.json. It writes src/core/multi-anchor-flat-disk-parameters.js only when every gate passes. Even then, it does not automatically activate the model.

Runtime integration requires a separate change to both forward and inverse coordinate transforms and all map measurement surfaces, followed by browser tests and independent review. Until then the existing production map remains unchanged.
