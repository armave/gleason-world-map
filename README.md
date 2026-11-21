# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar circular map with straight projected-line distance and planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app draws a two-dimensional circular disk. Its geographic layout follows the north-polar azimuthal-equidistant arrangement used by Gleason's 1892 sheet: the North Pole is at the centre, the meridians radiate outward, and parallels form circles.

The disk uses a fixed planar radial calibration with **R = 2,778.193571 km** as its uniform flat-map scale constant. This value is calibrated so that the straight projected segment between the bundled capital coordinates for Canberra (-35.27°, 149.13°) and Santiago (-33.45°, -70.67°) measures **11,340 km**. Two independent city-distance references quote 11,340–11,345 km. It is an empirical map-plane scale, not a globe radius or geodesic parameter. For latitude phi in radians and longitude lambda in radians:

theta = pi/2 - phi
r = R * theta
x = r cos(lambda)
y = -r sin(lambda)

The outer disk radius is **pi * R = 8,727.952513 km**. These values define the X/Y coordinate scale on the flat disk; the south-pole rim corresponds to theta = pi. The same linear scale applies to every direct-line and perimeter measurement, and area values scale by its square. Canberra–Santiago is the calibration anchor, not a universal route fit. Cross-checks against other real-distance pairs show that the current polar disk's straight chords can differ substantially by route; the table below reports that limitation rather than applying route-specific corrections.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

The Gleason disk remains the measurement plane for the A–B tool. The visible connector is always one straight segment between the projected endpoints. Its displayed distance is the flat-disk chord multiplied by a bounded empirical correction fitted to city-distance references using the endpoints' mean colatitude, colatitude separation, and wrapped longitude separation. The active measurement engine does not calculate globe or geodesic distances. The 60°S Restricted Line is a visual reference only and does not change the correction.

## Flat-map direct-line distance and planar area measurements

The A–B tool draws one straight projected segment and reports its empirically corrected flat-map length. Polygon area remains a shoelace calculation in projected coordinates and polygon perimeter remains the sum of its straight projected edges.

**Direct A–B distance**

The engine projects A and B into the calibrated disk plane, calculates the Euclidean chord, and multiplies it by a bounded empirical factor derived from mean endpoint colatitude, colatitude separation, and wrapped longitude separation. The dashed connector remains exactly one straight segment. The correction was fitted to 15 city-to-city distance references and checked against five separate airport-pair references. The app does not use globe or geodesic calculations for the A–B readout. Moving an endpoint across 60°S does not trigger a metric switch.

The 60°S parallel is drawn as a red dashed Restricted Line with two opposing callouts. It is a cartographic reference only and does not change A–B distance calculations. Direct distance connectors and user-drawn polygon edges, including the closing edge, may cross it.

The distance tool always uses the straight projected A–B segment, including when either endpoint lies in the Antarctic band. There is no latitude-triggered metric change.

**Real-distance cross-checks**

The empirical correction is fitted on the 15 city pairs below. Five separate airport pairs were excluded from fitting and used as holdout checks. The visible connector remains straight; only the numeric length receives the correction. Results are empirical benchmark comparisons, not proof of universal accuracy.

**Fitted city-pair benchmarks (15 routes)**

| Pair | Reference | Calibrated map reading | Error |
|---|---:|---:|---:|
| Helsinki–Wellington | 17,068 km | 16,890 km | −1.0% |
| Suva–New Delhi | 12,028 km | 12,123 km | +0.8% |
| Mexico City–Lisbon | 8,686 km | 8,609 km | −0.9% |
| Ankara–Washington, D.C. | 8,746 km | 8,469 km | −3.2% |
| Santiago–Paris | 11,627 km | 11,789 km | +1.4% |
| Brasília–London | 8,772 km | 8,916 km | +1.6% |
| Buenos Aires–Canberra | 11,759 km | 11,746 km | −0.1% |
| Tokyo–Madrid | 10,789 km | 10,858 km | +0.6% |
| Santiago–Canberra | 11,345 km | 11,497 km | +1.3% |
| Paris–Rome | 1,109 km | 1,110 km | +0.1% |
| Tokyo–Seoul | 1,160 km | 1,205 km | +3.9% |
| Yerevan–Moscow | 1,804 km | 1,792 km | −0.7% |
| Nairobi–Cairo | 3,518 km | 3,304 km | −6.1% |
| London–Reykjavik | 1,894 km | 1,920 km | +1.4% |
| Mexico City–Washington, D.C. | 3,030 km | 3,067 km | +1.2% |

**Independent airport-pair holdouts (5 routes not used to fit the correction)**

| Pair | Reference | Calibrated map reading | Error |
|---|---:|---:|---:|
| SCL–SYD | 11,363 km | 11,380 km | +0.1% |
| LHR–SIN | 10,886 km | 11,171 km | +2.6% |
| ORD–HKG | 12,543 km | 12,971 km | +3.4% |
| HEL–NRT | 7,848 km | 8,496 km | +8.3% |
| JFK–SIN | 15,347 km | 15,843 km | +3.2% |

The 15 fitted city pairs have 1.6% mean absolute in-sample error. The five held-out airport pairs have 3.5% mean absolute error and 8.3% maximum absolute error. Leave-one-out validation on the 15 city pairs has 4.8% mean absolute error but a 24.5% worst case, showing that the correction remains data-limited and should not be treated as universally accurate.

Distance references: [Helsinki–Wellington](https://www.travelmath.com/distance/from/Helsinki,+Finland/to/Wellington,+New+Zealand), [Suva–New Delhi](https://www.travelmath.com/distance/from/Suva,+Fiji/to/New+Delhi,+India), [Mexico City–Lisbon](https://www.travelmath.com/distance/from/Mexico+City,+Mexico/to/Lisbon,+Portugal), [Ankara–Washington](https://www.travelmath.com/distance/from/Ankara,+Turkey/to/Washington,+DC), [Santiago–Paris](https://www.travelmath.com/distance/from/Santiago,+Chile/to/Paris,+France), [Brasília–London](https://www.travelmath.com/distance/from/Brasilia,+Brazil/to/London,+United+Kingdom), [Buenos Aires–Canberra](https://www.travelmath.com/distance/from/Buenos+Aires,+Argentina/to/Canberra,+Australia), [Tokyo–Madrid](https://www.travelmath.com/distance/from/Tokyo,+Japan/to/Madrid,+Spain), [Santiago–Canberra](https://www.travelmath.com/flying-time/from/Santiago,+Chile/to/Canberra,+Australia), [Paris–Rome](https://www.travelmath.com/distance/from/Paris,+France/to/Rome,+Italy), [Tokyo–Seoul](https://www.travelmath.com/distance/from/Tokyo,+Japan/to/Seoul,+South+Korea), [Yerevan–Moscow](https://www.travelmath.com/distance/from/Yerevan,+Armenia/to/Moscow,+Russia), [Nairobi–Cairo](https://www.travelmath.com/distance/from/Nairobi,+Kenya/to/Cairo,+Egypt), [London–Reykjavik](https://www.travelmath.com/distance/from/London,+United+Kingdom/to/Reykjavik,+Iceland), and [Mexico City–Washington](https://www.travelmath.com/distance/from/Mexico+City,+Mexico/to/Washington,+DC). Airport-pair holdouts: [SCL–SYD](https://www.travelmath.com/distance/from/SCL/to/SYD), [LHR–SIN](https://www.travelmath.com/distance/from/LHR/to/SIN), [ORD–HKG](https://www.travelmath.com/distance/from/ORD/to/HKG), [HEL–NRT](https://www.travelmath.com/distance/from/HEL/to/NRT), and [JFK–SIN](https://www.travelmath.com/distance/from/JFK/to/SIN).

**Polygon area and perimeter**

User-drawn polygon area uses the ordinary shoelace formula in projected disk coordinates. Polygon edges and the closing edge may cross 60°S; the polygon is rejected only when it is invalid, such as a self-intersection:

A = 1/2 * abs(sum(x_i * y_(i+1) - x_(i+1) * y_i))

Perimeter is the sum of Euclidean lengths of the same straight projected edges. Each boundary edge is labelled on the map with its projected-plane length in kilometres; the finished polygon also receives an area label in square kilometres. The engine rejects self-intersecting user polygons instead of returning a misleading area.

Selected-country areas are calculated from the same densified projected boundary rings used to draw their outlines, subtracting interior holes and summing separate Polygon/MultiPolygon components. Antarctica's full 360° outer-rim edge is retained in its area calculation. Natural Earth geometry is generalized cartographic data, not cadastral or survey-grade boundary data.

**Planar sector area**

For two radii r1 and r2 and longitude span delta-lambda:

A = 1/2 * abs(r2^2 - r1^2) * abs(delta-lambda)

The complete disk area in this model is pi * (pi * R)^2. This is the mathematical area of the calibrated flat disk; it is not a spherical or ellipsoidal surface area.

The scale bar is locally calibrated at the current view-centre anchor in the displayed horizontal direction. It uses the same endpoint-based empirical correction as A–B. Because map scale varies by position and direction in an azimuthal projection, the scale-bar reading is local rather than one uniform scale for the entire disk. Resizing the canvas does not change the calibrated flat-map distance or planar area results.

## Separate WGS84 geodesic utility validation

The repository retains a standalone WGS84 geodesic utility in `src/core/geodesic.js`, with separate tests against published shortest airport-to-airport great-circle references and recorded aircraft-track ranges. This utility is not used by the map's A–B measurement tool. The examples span a southern Pacific route whose shortest path reaches about 61.8°S through to a New York–Singapore shortest path that approaches about 87.5°N. The utility column reports WGS84 inverse-geodesic distances from airport coordinates; published shortest-distance figures are rounded cross-checks, while recorded flight tracks are expected to be longer.

| Route | Published shortest-distance reference | Recorded aircraft-track range | Utility (WGS84) |
|---|---:|---:|---:|
| Santiago–Sydney (SCL–SYD) | 11,341 km | 11,489–11,953 km | 11,363 km |
| London–Singapore (LHR–SIN) | 10,882 km | 11,261–11,853 km | 10,886 km |
| Chicago–Hong Kong (ORD–HKG) | 12,522 km | 12,836–12,933 km | 12,543 km |
| Helsinki–Tokyo (HEL–NRT) | 7,828 km | 10,992–12,088 km | 7,849 km |
| New York–Singapore (JFK–SIN) | 15,339 km | 16,821–17,057 km | 15,347 km |

Published shortest-distance and recorded-track references: [SCL–SYD](https://www.flightpaths.com/SCL-SYD), [LHR–SIN](https://www.flightpaths.com/LHR-SIN), [ORD–HKG](https://www.flightpaths.com/ORD-HKG), [HEL–NRT](https://www.flightpaths.com/HEL-NRT), and [JFK–SIN](https://www.flightpaths.com/JFK-SIN). Track ranges are observed flown paths, not direct-distance calibration targets. Flight paths can be longer because of airspace restrictions, weather, winds, and operational routing; aircraft may avoid polar regions even when the shortest direct path approaches them.

## Antarctica / Ice Wall

The Antarctica feature is drawn as a white ice band between its mapped coastline and the circular disk rim. Natural Earth's Antarctic polygon closes its southern edge with a longitude sweep from 180° to −180° at 90°S. In this disk convention, that coordinate edge represents the complete circumference of the projected rim. The Antarctic path builder preserves the full 360° sweep instead of normalizing it to a zero-length antimeridian crossing. The Antarctic land polygon is filled white, its texture is clipped to that polygon, and the outer rim receives a continuous blue-white double edge. Concentric ice strata, gently irregular radial ridges, short crevasse marks, and repeated tangential rim lettering distinguish the ice wall from ordinary country boundaries.

The Antarctic layer can be toggled independently. Its shape follows the selected Natural Earth boundary scale and its cartographic generalization; it is not a survey of the ice-shelf edge or a measurement of sea-ice extent.

## Historical Gleason overlay · 1892

The optional overlay loads the Boston Public Library scan of Alexander Gleason's *New Standard Map of the World* (1892), held by the Norman B. Leventhal Map & Education Center and served through Digital Commonwealth's IIIF image service.

- Toggle the historical scan on or off.
- Adjust opacity, crop centre X/Y, crop diameter, overlay scale, and fine rotation for fallback alignment.
- For control-point registration, pick a geographic location on the vector map and then the same point in the scan preview.
- At least three non-collinear points are required; 8–12 or more well-distributed points around the disk are recommended.
- With control points present, the image is warped using piecewise-affine triangles into the same R = 2,778.193571 km flat-disk coordinate projection.

The historical scan is a printed sheet, not a surveyed or automatically georeferenced overlay. Manual registration improves the fit but cannot remove cartographic generalization, compilation error, plate distortion, or print deformation. Treat it as a historical comparison layer, not ground truth.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: commonwealth:7h149v867. The catalogue reports no known copyright restrictions. The image is loaded on demand; first use requires access to the archive's IIIF image service.

## Features

- Gleason-style 2D north-polar circular disk layout
- Fixed flat-disk radial calibration r = R * theta with R = 2,778.193571 km and disk radius pi * R, anchored to a straight Canberra–Santiago city-centre reference of 11,340 km
- Separate Natural Earth physical coastlines and island shorelines, with dateline-safe projection
- Curved ocean and sea labels that fade by scale and avoid land and other labels
- Curved ocean and Antarctic rim labels keep their reading direction left-to-right at every map rotation, with glyph-level collision bounds
- Screen-anchored compass and UI-aware label placement prevent the map's labels from overlapping coordinate annotations and measurement controls
- White Antarctic ice-wall band with radial ridges, crevasse details and repeated rim lettering
- Greenwich-right, 90°E-up longitude orientation
- Smooth animated map rotation along the shortest angular path; geographic labels stay anchored to the disk while text remains screen-upright and readable
- Measurement mode buttons expose a clear selected state, while distance/area actions show enabled and disabled availability
- A–B distance: one straight Euclidean segment in calibrated flat-disk coordinates
- The 60°S Restricted Line is a visual reference only and never changes the direct-line metric
- Planar polygon area by shoelace formula with km labels on every projected boundary edge and a km² area label
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally calibrated flat-disk scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Search and select U.S. county-equivalents using 2026 Census Gazetteer internal-point coordinates; this is a searchable point index, not a rendered county-boundary layer
- View-centred scale bar calibrated to the local flat-disk coordinate scale
- Compact in-frame Find and Measure overlays; mode-specific distance/area details, icons, and enabled action states
- Manual historical-scan registration using geographic/image control points
- Full-screen map mode with automatic canvas resizing
- Toggle country outlines, physical coastlines and islands, grid, capital markers and names, country names, ocean/sea labels, and Antarctica
- Optional 1892 scan overlay with opacity, crop, scale, and rotation controls
- Export the map as PNG
- Share URLs preserving zoom, pan, layers, overlay settings, endpoints, area vertices, and historical registration points
- Repository-bundled geographic datasets, browser HTTP caching, and explicit retry button

## Project structure

Static GitHub Pages deployment uses browser-native ES modules; no bundler is required.

```text
index.html                  page shell and app entry point
styles.css                  responsive styling
data/
  us-counties.json          U.S. Census 2026 county-equivalent search points
  countries/
    low.geojson.gz          Natural Earth 1:110m boundaries
    medium.geojson.gz       Natural Earth 1:50m boundaries
    high.geojson.gz         Natural Earth 1:10m boundaries
  capitals.json             vendored ISO/capital coordinates
  metadata.json             pinned sources, versions, checksums
  README.md                 data provenance and refresh instructions
src/
  app.js                    state, UI wiring, and lifecycle
  core/
    flat-disk.js            map projection, planar area and perimeter
    geodesic.js              WGS84 inverse/direct distances and projected geodesic paths
    measurement-engine.js    straight projected A–B distance and 60°S reference-line geometry
    format.js                coordinates, units, and search formatting
  data/
    datasets.js             local asset loading, decompression, and validation
    geojson.js              country identifiers, names, colours, centroids
  map/
    labels.js               zoom thresholds, collision-aware labels, and polygon containment checks
    ocean-labels.js         curved ocean/sea labels, scale bands, water-aware anchors and collision checks
    coastlines.js           dateline-safe projected Natural Earth coastline paths
    feature-paths.js        projected GeoJSON paths and Antarctic rim handling
    ice-wall.js             Antarctic land band and continuous rim
    registration.js         scan control-point triangulation and affine image warp
  ui/
    calibration.js          flat-disk radial calibration table
scripts/
  vendor-geodata.mjs        reproducible pinned-source data import
  vendor-county-labels.mjs  reproducible Census county-label data import
tests/
  flat-disk.test.js        projection, planar area and perimeter regressions
  geodesic.test.js         flight-route benchmarks, WGS84 distance and path regressions
  measurement-engine.test.js direct-line distance regressions across the 60°S reference line
  registration.test.js      registration transform regressions
  datasets.test.js          bundled-data integrity and quality tests
.github/workflows/test.yml automated Node tests
package.json                test and data-vendor commands
```

Run tests with Node.js 20 or newer:

```bash
npm test
```

## Run locally

Run a static web server from the repository root:

    python -m http.server 8000

Then open http://localhost:8000. Country boundaries and capital coordinates are bundled in the repository and load from the same site. Internet access is needed only for the optional historical scan.

## Deploy with GitHub Pages

1. Open **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**.
4. Save.

Expected URL: https://armave.github.io/gleason-world-map/

## Geographic data sources

Country and Antarctica boundaries at 1:110m, 1:50m, and 1:10m are compressed and stored locally under `data/countries/`. The browser loads only the selected quality. Physical coastlines and island shorelines are bundled separately as Natural Earth 1:50m line geometry in `data/coastlines-50m.json`, allowing the app to emphasize coastlines without styling every political border as a shoreline. The datasets are vendored from the pinned Natural Earth source commit listed in `data/metadata.json`; Natural Earth identifies its vector data as public domain.

Capital coordinates are stored locally in `data/capitals.json` and were generated from the pinned `country-capital.csv` source in `iliyaj/country-data`. The source identifies REST Countries v3.1 as the underlying data source; its MIT license is included in `data/capital-data-LICENSE.txt`.

To refresh the bundled geographic files from their pinned upstream sources, run `npm run vendor:data` with Node.js 20 or newer. The application itself does not contact those upstream data hosts.

- Historical scan: Boston Public Library / Digital Commonwealth, item commonwealth:7h149v867; loaded only when the overlay is enabled.
- A–B distance: a straight projected flat-disk chord multiplied by a bounded empirical calibration factor in `src/core/measurement-engine.js`; the separate WGS84 utility in `src/core/geodesic.js` is not used by the map's distance tool.

## Important limitations

- The radial disk geometry still uses one uniform base scale. The A–B readout adds a bounded empirical factor fitted to a finite set of route references; leave-one-out testing shows that untested route errors can still be substantial.
- A–B is an empirically calibrated straight-line map measurement, not a surveyed route or actual flight track. It does not use a globe or geodesic model in the running app; distances outside the benchmark domain can still differ from external references.
- Polygon areas and perimeters remain planar measurements in projected disk coordinates. They are not WGS84 ellipsoidal polygon areas or survey-grade ground measurements.
- The separate WGS84 utility uses a spherical fallback only for nearly antipodal pairs where Vincenty's iterative inverse does not converge; this fallback does not affect the active direct-line map measurement.
- The flat-disk measurement conventions describe a mathematical map layout; they are not evidence or a claim about the physical shape of the Earth. The Boston Public Library identifies the 1892 Gleason sheet as a polar azimuthal projection.
- Natural Earth 1:10m geometry is generalized cartographic data, not a cadastral or survey-grade boundary source. The browser falls back to 1:110m only when the high-resolution data cannot be fetched.
- The historical scan is not ground truth; manual control-point registration improves visual fit but cannot remove errors in the original engraving.
- Seam-crossing and high-latitude polygon topology should still be reviewed against the source geometry.


## County search

The county search index uses U.S. Census Bureau 2026 National Counties Gazetteer internal-point coordinates. It covers county-equivalents in the 50 states, the District of Columbia, and Puerto Rico. The separately published Island Areas (American Samoa, Guam, the Northern Mariana Islands, and the U.S. Virgin Islands) are not included in this national file.

County results are search-and-selection references only: the app does not render county polygons or county-name labels. Selecting a result displays its name, state or territory, GEOID, and internal-point coordinates.

The compact data file is generated from the Census Bureau's public-domain 2026 Gazetteer. Download and extract `2026_Gaz_counties_national.zip` from [the Census Gazetteer archive](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip), then run:

```bash
node scripts/vendor-county-labels.mjs --source-file 2026_Gaz_counties_national.txt
```

Older share links containing the original five-layer visibility code remain compatible; county search data is independent of map-layer visibility.
