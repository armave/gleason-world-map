# Empirical distance calibration for the flat-disk map

## Status

This is an active research implementation on the `calibration/empirical-distance-warp-v1` branch. It fits a separate two-dimensional candidate transformation against independently measured physical distances. It does **not** replace the pure Gleason reference map or activate a candidate in the website.

The calibration is now allowed to move any mapped feature, including the North Pole centre and Antarctic outer rim. It can stretch, compress, shear locally, translate and change the overall output extent. The output does not have to remain circular. The source domain remains the original Gleason disk, while the transformed map may extend beyond its original rim.

A positive-Jacobian topology check, finite output extent, uncertainty-aware fit and independent holdout tests remain mandatory. No transform is promoted solely because it makes selected coastlines or a small set of distances look right.

## What qualifies as a distance observation

Three measurement types are accepted:

- `direct-straight-line`: a traceable, independently measured straight endpoint-to-endpoint length.
- `direct-survey-baseline`: a physical survey baseline whose published value is the **adjusted horizontal distance**, with its uncertainty and coordinate references for both exact monument marks.
- `direct-survey-reduced-horizontal`: a recorded **measured horizontal distance reduced to sea level** from an authoritative survey-observation table, with its matching observation variance, exact monument endpoints and traceable coordinate records. This is a reduced observation, not an adjusted network output.

Direct survey records (`direct-survey-baseline` or `direct-survey-reduced-horizontal`) must have:
- `split`: `train` or `holdout`
- `a`, `b`: stable monument IDs, their latitude/longitude inputs, and each point's `coordinateSource.provider` and `coordinateSource.reference`
- `distanceKm`: the published measured horizontal distance in kilometres
- `measurementType`: exactly `direct-survey-baseline` or `direct-survey-reduced-horizontal`
- `measurementBasis`: exactly `adjusted-horizontal` for baseline certificates or `sea-level-horizontal` for reduced LINZ observations
- `uncertaintyKm`: the published distance uncertainty in kilometres
- `source.provider`, `source.reference`: provenance for the measured baseline
- `source.groupId`: stable baseline/site identifier

Every pair from one survey line or site must remain in one split. A baseline group cannot contribute some segments to training and other segments to holdout. Holdout baselines should be geographically independent from training sites.

The fitter weights surveyed lengths by their stated relative uncertainty, normalised to the median relative uncertainty and clamped to prevent a single record from dominating. Uncertainty is not invented when missing; a survey observation without a stated positive uncertainty is rejected. For LINZ, the square root of the recorded distance variance in m² may be converted to one-sigma distance uncertainty in km. The observation remains labelled as a reduced distance, not an adjusted network output.

Do not use airline mileage, ADS-B track length, travel time multiplied by speed, shortest-route distance, an inferred map scale, or distances calculated from globe/sphere/ellipsoid/geodesic formulas. Surveyed horizontal lengths must be taken as the published reference values, not recomputed from endpoint coordinates.

## Sources being evaluated

### NOAA National Geodetic Survey EDMI Calibration Baselines

The National Geodetic Survey (NGS) publishes more than 400 EDMI Calibration Baselines (CBLs) across the United States. The public archive provides state-level ASCII files with baseline descriptions and adjusted pairwise distances. NGS describes these CBLs as local length standards and publishes adjusted distances between the marks.

Use only the **ADJUSTED DISTANCE HORIZONTAL (m)** column. The same table also contains **ADJUSTED DISTANCE MARK-MARK (m)**, which NOAA defines as the spatial chord between the centres of the disks. The horizontal value is defined at the mean elevation of the two stations and is the only column compatible with this project's horizontal-length target. Never substitute the mark-to-mark value.

The seven published columns are FROM STATION; ELEVATION (m); TO STATION; ELEVATION (m); ADJUSTED DISTANCE HORIZONTAL (m); ADJUSTED DISTANCE MARK-MARK (m); and S.E. (mm). NOAA notes that station names are arbitrary and may not match the stamping on the physical monument disks. NOAA also cautions that the published standard error is estimated from the adjustment and may indicate repeatability of the instruments used to measure the baseline more than actual baseline accuracy; it may be optimistic. The importer therefore retains S.E. as source metadata and does not automatically convert it into uncertaintyKm.

The CBL files provide independently measured local horizontal lengths, but they do not by themselves provide fit-ready map anchors. The exact physical monument IDs must be resolved for both station labels, traceable horizontal coordinates for those same marks must be obtained independently, and the current condition of each monument must be checked. Approximate site-map positions or general site locations are not acceptable anchor coordinates. Keep each complete site group intact in either training or holdout.

Sources: [NGS CBL program overview](https://geodesy.noaa.gov/CBLINES/CBL_One_Pager.pdf); [state baseline files](https://geodesy.noaa.gov/CBLINES/BASELINES/); [NOAA Technical Memorandum NOS NGS-10, Use of Calibration Base Lines](https://www.ngs.noaa.gov/PUBS_LIB/TMNOSNGS10.pdf).

#### Public NOAA inspection script

No API key is required. Inspect all state files currently listed in the archive:

```bash
npm run inspect:noaa-cbl
```

Or inspect a selected state file:

```bash
npm run inspect:noaa-cbl -- --state md
```

The optional NOAA_CBL_STATES comma-separated environment variable selects multiple two-letter state codes; NOAA_CBL_REVIEW_OUTPUT changes the report path. The report defaults to tmp/noaa-cbl-baseline-review.json, which is ignored by Git. A manual GitHub Actions workflow can also run the public inspection and upload the report as a short-lived workflow artifact.

The report is review-only. It records the exact horizontal adjusted distance, the separate mark-to-mark value, the reported standard error and its caveat, baseline/site metadata, and source-line provenance. It does not attach guessed coordinates, derive target lengths from coordinate data, populate the fitting dataset, or activate a map deformation.

### Nummela Standard Baseline, Finland

The National Land Survey of Finland describes the Nummela line as a length standard with observation pillars from 24 m to 864 m. Its published full-line result is 864,122.9 mm ± 0.1 mm, traceable to the definition of the metre. A 2026 FIG paper describes six EDM observation pillars at 0, 24, 72, 216, 432 and 864 m, but notes that the precision baseline itself is preserved between six underground markers about two metres away from the pillar line. That connection is checked annually by theodolite-based projection measurements with up to 0.2 mm standard uncertainty.

The exact physical endpoints therefore matter: an observation-pillar coordinate is not automatically the coordinate of the underground marker defining the measured baseline. This is a high-quality European local reference, but it contributes neither global coverage nor fit-ready anchors until exact coordinates for the underground marker endpoints are traceable.

### EURO5000 Reference Baseline, Poland

The 2026 EURO5000 publication describes a 5 km reference baseline established and validated in Poland using repeated GNSS and EDM campaigns. The reported measurement uncertainty is below 1 mm (k=2), with independent checks by two external institutions.

This is another valuable regional constraint. The 2022 preliminary study reports an EDM EUR1–EUR2 result of 5,177.1758 m ± 0.0073 m (k=1), with several approximate inter-pillar lengths; its five published latitude/longitude positions are explicitly captioned as approximate. They are not precise anchor coordinates and have not been inserted into the fitting dataset. The 2026 publication establishes the final 5 km standard with uncertainty below 1 mm (k=2), but the final reference-distance table and precise coordinate records for each exact pillar still need to be extracted from the source. It does not provide southern-hemisphere or global coverage by itself.

### Australian EDM calibration baselines

Two additional southern-hemisphere source programmes are under review:

- Landgate maintains three certified EDM baselines in Western Australia at Curtin University, Kalgoorlie and Busselton. Certified distances and calibration records are supplied through the Medjil portal, with periodic re-certification.
- The NSW Surveyor General publishes EDM baseline certificates and facility information for multiple sites, including Coffs Harbour, Dubbo, Eglinton, Lethbridge Park, Seaham and Ulan.

These sites can broaden source coverage in the southern hemisphere (roughly mid-southern latitudes), but they do not provide deep-southern or Antarctic coverage. The exact pillar IDs, certified horizontal distances, uncertainty, reference height, certification epoch and traceable coordinates for the same physical pillars must be extracted before import. The portal's coordinate-based geometric corrections must not be reproduced in this map; only its published certified length values are candidates for the observation file.

### Geoscience Australia Antarctic total-station and AAGN networks

The strongest high-southern lead found so far is Geoscience Australia's **Technical Report 5: Antarctic Geodesy, Summer 2000–2001**. It documents Mawson and Davis local monitoring networks and the Australian Antarctic Geodetic Network (AAGN) traverse in East Antarctica. At Mawson and Davis, a Leica TC2003 total station with precision prisms observed horizontal and vertical angles and slope distances. The report says reduced distances were corrected for temperature, humidity and pressure, and the network was least-squares adjusted in GEOLAB. It publishes adjusted coordinates and standard deviations for three local reference marks at each of AUS064 (Mawson) and AUS099 (Davis). The AAGN upgrade also publishes adjusted coordinates for selected traverse marks, including Landing Bluff, Mount Caroline Mickelson, Rubeli Bluff and Corry Rocks.

This is the first source found that combines high-southern physical survey observations with published precise monument positions. However, the PDF does **not** reproduce the adjusted horizontal pair lengths or the full observation/adjustment files for the local networks. It identifies the missing primary records as AUSLIG Geodesy field books #35 and #38 (Mawson) and #37 (Davis). Geoscience Australia's N.H. (Doc) Fisher Geoscience Library provides research assistance and document-supply services; the identified records can be requested from reference.library@ga.gov.au. Request the original distance and angle observations, atmospheric corrections, and GEOLAB reductions—not just the station coordinate sheets. The AADC archive also lists a 265 kB `survey_2010-11_davis_mawson.zip` package containing CAD and Word files from later Davis/Mawson surveys. Its contents need inspection to determine whether it contains additional adjusted line lengths tied to identified monuments. The report gives slope-distance observations and coordinate outputs, but it is not acceptable to calculate the target distances from those latitude/longitude coordinates.

There are also monument identity issues. The NMS 143 AAGN antenna was set up on a cairn under the assumption it was concentric with the buried station mark; the report records that the eccentric mark was not found. That coordinate is not accepted as an exact station-mark position without a resolved tie. The 2006/07 AADC report also states that deep-field ground-control GPS observations were not completed that season. Its coverage should not be overstated.

Sources: [Geoscience Australia Technical Report 5 (GA5033)](https://www.ga.gov.au/bigobj/GA5033.pdf); [AADC 2006/07 Antarctic Geodesy report metadata](https://data.aad.gov.au/metadata/records/survey_2006-2007_geodesy); [AADC Antarctic survey report catalogue](https://data.aad.gov.au/aadc/portal/drill_down.cfm?id=69).

### Japanese GSI Antarctic Control Point Survey

The Geospatial Information Authority of Japan (GSI) publishes an Antarctic control-point programme and a data list/particulars index for JARE survey marks. Its method history notes that the network was integrated from the 1960s and that the 1970s introduced Geodimeter Model 8 electro-optical distance measurements and high-precision Wild T3 theodolites for long-distance control. The NIPR data catalogue describes the historical control-point survey material as analog, with results published through survey reports, and identifies the GSI Antarctic geodesy contact as jare_geo@gsi.go.jp.

This is a promising East Antarctic source around Syowa Station and Lützow-Holm Bay. The official GSI description also says the historical terrestrial network integration was limited to the southern surroundings of Syowa because line of sight between distant ice-free areas was difficult. Public control-point lists and particulars are available, but the actual adjusted horizontal line distances and original observations must be extracted from the report archive or requested from GSI. Coordinate tables alone are not eligible distance targets.

Sources: [GSI Control Point Survey overview](https://web2.gsi.go.jp/antarctic/07-e.html); [GSI Control Point Data List and Particulars](https://web2.gsi.go.jp/antarctic/07_index_point-e.html); [NIPR data catalogue entry](https://polaris.nipr.ac.jp/~dbase/900/gsi/pdf/Control_point_survey-j.REV1.pdf).

## Why the observations file is still empty

The repository currently has no observation records that satisfy the complete requirements of measured length **and** exact endpoint coordinate provenance. NOAA now provides a public pipeline for reviewing its horizontal adjusted baseline values, but station labels still need to be tied to exact monument IDs and traceable endpoint coordinates. Its reported standard error is not assumed to be baseline accuracy. No NOAA, Nummela or EURO5000 values have been fabricated into the input file.

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
