# Archived research: experimental multi-anchor flat-disk calibration

> **Archive notice (24 November 2026):** This research proposal predates the reset to pure Gleason geometry. It is not part of the active map, and none of its experimental transforms or fitting routines are imported by the runtime projection. The active baseline remains the unwarped linear disk in `src/core/flat-disk.js`.

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
7. Test independent holdout errors, a denser full-disk Jacobian grid plus adaptive samples around every RBF control point, forward/inverse round trips across the disk, maximum interpolated displacement, and radial-boundary overshoot. The local stencils specifically check narrow Gaussian features that can fall between uniform grid nodes.

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

The calibration requires at least 30 training and 12 independent holdout pairs, at least 12 distinct training anchors, coverage across four training latitude bands and four training longitude sectors, at least two training anchors and two independent holdout anchors south of 45°S, and at least one training plus one holdout anchor south of 60°S. This prevents a predominantly northern sample from passing as a global calibration. The training anchor graph must also be 3-vertex-connected with minimum degree three. It also computes the planar distance-constraint rigidity matrix at the seed positions and requires rank 2N−3, where N is the number of training anchors; a graph that is connected but geometrically flexible is rejected. Holdout data must cover at least eight distinct anchors, three latitude bands and four longitude sectors; at least four holdout anchors must be absent from the training anchor set. A pair may appear only once and in only one split. The fitter also reports how many holdout anchors overlap training so pair-level validation is not mistaken for geographic extrapolation validation.

## Run

Run npm run fit:multi-anchor to produce a candidate summary. Run npm test for the regression suite.

## Promotion gates

- Training MAPE no greater than 8%.
- Independent holdout MAPE no greater than 10%.
- Maximum holdout pair error no greater than 20%.
- Holdout MAPE improves over the current flat-disk baseline by at least 0.25 percentage points.
- Planar rigidity matrix rank exactly 2N−3.
- Minimum sampled Jacobian determinant at least 0.2.
- Forward/inverse coordinate round-trip validation across a 12-ring / 48-spoke disk sample and every RBF control point, with maximum drawing-plane error no greater than 0.01 km and no failed inversions.
- Maximum training-anchor and interpolated-warp displacement no greater than 12% of disk radius.
- No sampled radial overshoot beyond the circular rim and numerical pole/rim displacement below 1e-5 km.
- At least eight independent holdout anchors, three holdout latitude bands, four holdout longitude sectors, and four holdout anchors never used for fitting.

The fitting script writes data/multi-anchor-distance-calibration-summary.json. It writes src/core/multi-anchor-flat-disk-parameters.js only when every gate passes. Even then, it does not automatically activate the model.

Runtime integration requires a separate change to both forward and inverse coordinate transforms and all map measurement surfaces, followed by browser tests and independent review. Until then the existing production map remains unchanged.
