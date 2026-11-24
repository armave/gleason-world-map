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

The NGS EDMI Calibration Baseline programme reports more than 400 calibration lines across the United States. The typical design uses four marks near 0, 150, 430 and 1,400 m. NGS publishes adjusted distances between mark pairs, monument descriptions and elevation differences; its technical material distinguishes mark-to-mark distances from horizontal distances. Only the published horizontal values match this fitter's distance definition.

There is a decisive coordinate limitation: NGS's own survey-mark guidance says accurate horizontal or vertical positions are not normally available for the CBL marks. The CBL site marker or a general location description is not a precise coordinate for each monument. Consequently, CBL values are high-quality local length references but are **not yet fit-ready geographic anchors**. Each monument requires a separate, traceable coordinate record with uncertainty and reference frame/epoch before a length can enter the optimizer. The CBL file's adjusted distance alone cannot locate its endpoints on the map.

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

### LINZ Antarctic Geodetic Marks — Ross Dependency

Land Information New Zealand publishes an Antarctic Geodetic Marks point layer with **490 marks**. Each feature includes a unique geodetic code, mark name/description/type, condition, quality order and coordinates in the Ross Sea Region Geodetic Datum 2000 (RSRGD2000, EPSG:4764), with ellipsoidal height where available. LINZ states that its underlying Landonline geodetic system contains the observations between marks and that the mark records may have been established by precise differential GPS or terrestrial horizontal-angle and distance observations.

This is a useful deep-southern **monument catalogue**, but the public point layer is not itself a table of measured pairwise distances. It can identify and locate physical marks, but it cannot be used to calculate the target distances from latitude/longitude. The actual Antarctic observation records between exact mark pairs, their adjusted horizontal-distance values and uncertainties still need to be obtained from the geodetic database or survey files. Mark condition also matters: inclusion in the layer does not guarantee that a mark is still physically present. Coordinate order and epoch must be interpreted using the RSRGD2000-specific accuracy definitions, not assumed to share mainland order semantics.

Sources: [LINZ Antarctic Geodetic Marks layer](https://data.linz.govt.nz/layer/50789-antarctic-geodetic-marks/); [LINZ Geodetic Database](https://www.linz.govt.nz/products-services/geodetic/geodetic-marks/linz-geodetic-database); [LINZ geodetic data access](https://www.linz.govt.nz/products-services/data/types-linz-data/geodetic-data); [LINZ coordinate and height accuracy orders](https://www.linz.govt.nz/guidance/geodetic-system/coordinate-systems-used-new-zealand/coordinate-and-height-accuracy/coordinate-and-height-orders).

### Japanese GSI Antarctic Control Point Survey

The Geospatial Information Authority of Japan (GSI) publishes an Antarctic control-point programme and a data list/particulars index for JARE survey marks. Its method history notes that the network was integrated from the 1960s and that the 1970s introduced Geodimeter Model 8 electro-optical distance measurements and high-precision Wild T3 theodolites for long-distance control. The NIPR data catalogue describes the historical control-point survey material as analog, with results published through survey reports, and identifies the GSI Antarctic geodesy contact as jare_geo@gsi.go.jp.

This is a promising East Antarctic source around Syowa Station and Lützow-Holm Bay. The official GSI description also says the historical terrestrial network integration was limited to the southern surroundings of Syowa because line of sight between distant ice-free areas was difficult. Public control-point lists and particulars are available, but the actual adjusted horizontal line distances and original observations must be extracted from the report archive or requested from GSI. Coordinate tables alone are not eligible distance targets.

Sources: [GSI Control Point Survey overview](https://web2.gsi.go.jp/antarctic/07-e.html); [GSI Control Point Data List and Particulars](https://web2.gsi.go.jp/antarctic/07_index_point-e.html); [NIPR data catalogue entry](https://polaris.nipr.ac.jp/~dbase/900/gsi/pdf/Control_point_survey-j.REV1.pdf).

### LINZ Full Landonline survey-observation tables — highest-priority data extraction path

The Antarctic Geodetic Marks layer is a point catalogue. More importantly, LINZ also publishes a **Full Landonline Dataset** containing survey-observation and mark/coordinate relationships. Its data dictionary defines the tables needed to reconstruct a measured mark-to-mark line without calculating a distance from geographic coordinates:

| Data table | LDS ID | Relevant fields and purpose |
|---|---:|---|
| Observation | 51725 | Reduced observation type/subtype, local and remote setup IDs, observation date, status/class and measured values |
| Observation Accuracy | 51724 | For a distance observation, `VALUE_11` is the variance in m² when both observation IDs are the same |
| Observation Type / Element Type | 51732 / 51730 | Identifies line/point observation types, the values stored and their units |
| Setup | 51742 | Maps local/remote setups to the endpoint node IDs, survey work and equipment |
| Mark / Mark Name / Mark Physical State | 51989 / 51991 / 51990 | Identifies the physical monument, name/code, disturbance/replacement and latest condition |
| Node / Coordinate | 51993 / 52018 | Links the observation endpoint to its recorded coordinate system and coordinate values |
| Coordinate Order / Datum / Unit | 51712 / 51713 / 51748 | Describes coordinate order, reference datum and measurement units |
| Reduction Method / Run | 51736 / 51737 | Records how reduced observations were produced |

The critical join is:

1. `Observation.STP_ID_LOCAL` and `STP_ID_REMOTE` reference two rows in `Setup`.
2. Each `Setup.NOD_ID` identifies an endpoint `Node`.
3. `Mark.NOD_ID` tells whether that node is occupied by a physical monument. `Mark Physical State` and `Mark Name` identify its condition and identity.
4. The observation type and element-type tables identify which value is the horizontal distance and its unit.
5. `Observation Accuracy.VALUE_11` supplies distance variance in m² for a distance observation, allowing a one-sigma uncertainty to be derived as its square root.

**Admission rules:** Only measured, reduced, line-type horizontal-distance records with exact physical monument endpoints, a valid/current observation status, traceable date/work/equipment, verified metre units and a matching accuracy record are candidates. Calculated, adopted, pseudo, slope-distance, virtual-node and unresolved eccentric-mark records are excluded. The distance target is the stored observation value; endpoint coordinates are used only to locate the two anchors on the map, never to calculate that distance.

#### Access and current blocker

LINZ's public WFS is the intended access route. A free LINZ Data Service account and a data-access API key are required. The repository will read the key from `LINZ_LDS_API_KEY`; it must never be hard-coded or committed. WFS 2.0 supports attribute filters, JSON/CSV output and paging. LINZ recommends paged requests of no more than 250,000 features.

The table schema and relationships are verified from LINZ's January 2022 Full Landonline Data Dictionary (version 2.7). The live table export has **not yet been tested** because no API key is configured. We must first establish whether the exported Landonline tables contain the 490 Antarctic layer marks and their corresponding reduced observation rows; the separate Antarctic point layer alone does not prove that all 490 have available pairwise distance observations.

Official references: [Full Landonline Data Dictionary and Models](https://github.com/linz/linz-lds-bde-schema/blob/master/doc/lds-full-landonline-data-dictionary-and-models.md), [Geodetic data](https://www.linz.govt.nz/products-services/data/types-linz-data/geodetic-data), [LDS API and WFS guidance](https://www.linz.govt.nz/guidance/data-service/linz-data-service-guide/web-services/lds-apis-and-web-services), [Create an LDS API key](https://www.linz.govt.nz/guidance/data-service/linz-data-service-guide/web-services/creating-api-key), and [WFS filtering and paging](https://www.linz.govt.nz/guidance/data-service/linz-data-service-guide/web-services/wfs-filter-methods-and-parameters).

#### Local LINZ inspection script

The repository now includes a credential-safe inspection script:

```bash
export LINZ_LDS_API_KEY='your-data-access-only-key'
npm run inspect:linz-antarctic
```

Create the key in your own LINZ Data Service account. Do not put it in a source file, commit it, or paste it into a public issue. The script uses WFS 2.0 paged requests, joins the Antarctic marks layer to physical Mark records, endpoint Setups, reduced Observations, observation-type/element/unit metadata, self-variance records, element-level Adoption records, and reduction-run metadata.

The output defaults to the ignored local file `tmp/linz-antarctic-observation-review.json`; override this with `LINZ_REVIEW_OUTPUT` if needed. It is a diagnostic report only. It deliberately does **not** add rows to `data/multi-anchor-distance-observations.json), does not assign train/holdout splits, and does not activate a projection.

The report highlights distance-like value elements, converts only explicitly identified metre/kilometre values for review, records the exact source value and matching variance, flags any adoption link, keeps the bearing-only meaning of `SURVEYED_CLASS` distinct from distance status, and notes whether type descriptions explicitly identify a horizontal sea-level basis. If table joins do not resolve physical marks unambiguously, the affected pairs are omitted rather than guessed.

A live report has not yet been generated: it requires the user's LINZ LDS API key. After generation, each candidate still needs authoritative confirmation that the distance element was measured (not calculated/adopted), its correct horizontal/sea-level reduction basis, the identity and current condition of both exact monuments, and an appropriate survey-network grouping. Only then can approved records be manually promoted into the fitting dataset.

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
