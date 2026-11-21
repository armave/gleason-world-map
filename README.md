# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar circular map with straight projected-line distance and planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app draws a two-dimensional circular disk. The North Pole is at the centre, meridians radiate outward from it, and parallels form concentric circles. This is the app's flat coordinate construction; the running measurement code does not call an external projection or globe-geometry library.

The disk's nominal radial scale **R is fitted from observed ADS-B flight mileage**, not from a published shortest-distance table or a geometric globe model. The fitted model also recalibrates latitude-ring spacing with a smooth, monotonic radial warp. For latitude phi and longitude lambda:

```text
theta = pi/2 - phi
t = theta / pi
q = ((t + epsilon)^exponent - epsilon^exponent) /
    ((1 + epsilon)^exponent - epsilon^exponent)
r = pi * R * q
x = r cos(lambda)
y = -r sin(lambda)
```

The current fitted warp uses exponent 0.9 and epsilon 0.005. It has a finite positive derivative at the North Pole, preserves the pole at the centre and the Antarctic rim as a complete circle, and moves intermediate latitude rings smoothly. The outer disk radius remains **pi * R**. R is regenerated from the current ADS-B training sample; it is a flat-map empirical scale, not a globe radius. Coastlines, capitals, grid lines and map-clicks all use this same forward/inverse transform. Polygon area and perimeter remain planar measurements of the recalibrated map. The A–B flight-mileage estimate retains a local correction inferred from nearby sampled airport pairs.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

The Gleason disk remains the measurement plane for the A–B tool. The visible connector is always one straight segment between the projected endpoints. The interface displays the ADS-B flight-mileage estimate as the primary A–B value and the raw Euclidean flat-disk chord as a secondary reference. The empirical estimate applies a fitted radial scale and a quality-weighted local nearest-route correction using mean warped radial fraction and the radial/tangential shares of the unit-disk chord. It estimates typical flown mileage for sampled airport pairs, not a shortest path or the track of a particular flight. Polar/out-of-range support and nearest reference routes are available in the expanded measurement details. The active distance engine contains no globe-distance formula or geodesic library. The 60°S Restricted Line is a visual reference only.

## Flat-map direct-line distance and planar area measurements

The A–B tool draws one straight projected segment and reports both the raw Euclidean chord in the disk plane and a separate ADS-B flight-mileage estimate. Polygon area remains a shoelace calculation in projected coordinates and polygon perimeter remains the sum of its straight projected edges.

**Direct A–B distance**

The engine projects A and B into the calibrated disk plane and exposes the Euclidean chord as the **raw flat-disk reading**. The dashed connector is one straight segment, and its map label reports the **ADS-B flight-mileage estimate**. The raw Euclidean chord remains a secondary reference reading. The panel separately shows the same **ADS-B flight-mileage estimate** as its primary value, which predicts mileage per unit chord from the two nearest training routes in standardized flat-disk feature space (mean warped radial fraction, radial share of the unit chord, and tangential share of the unit chord). It uses inverse-distance weights and a geometric mean of the neighbours' observed mileage ratios. The panel also shows the correction factor and adjustment versus the raw chord; calibration diagnostics remain internal and are not displayed as a warning box. The runtime engine does not calculate a globe-distance or geodesic length. Moving an endpoint across 60°S does not trigger a metric switch.

The 60°S parallel is drawn as a red dashed Restricted Line with two opposing callouts. It is a cartographic reference only and does not change A–B distance calculations. Direct distance connectors and user-drawn polygon edges, including the closing edge, may cross it.

The distance tool always uses the straight projected A–B segment, including when either endpoint lies in the Antarctic band. There is no latitude-triggered metric change.

**ADS-B flight-telemetry calibration**

The replacement calibration target is measured flown mileage from historical ADS-B telemetry. For each accepted flight, the collector reads the ground-speed series `path_gs`, whose samples are timestamped in Unix seconds and expressed in knots. Within each contiguous series, each speed observation is held to the next timestamp and integrated:

```text
observed nautical miles = sum(ground_speed_knots * interval_seconds / 3600)
observed kilometres = observed nautical miles * 1.852
estimated telemetry-span kilometres = observed kilometres / time_coverage
```

No distance is calculated from the aircraft's latitude/longitude trace, no API-provided path-length field is used, and no sphere, ellipsoid, great-circle or geodesic method is part of the target. Time gaps are not bridged with invented speeds: the observed mean ground speed is expanded over the first-to-last telemetry span and the measured coverage and largest gap are retained with every flight. Airport coordinates are used only as endpoint locations on the flat disk and to select flights at the source API.

Flights are grouped by airport pair. Each route's median flight mileage is one calibration observation; entire airport pairs are reserved for holdout validation so no flights from a holdout route enter fitting. The generated dataset, raw flight observations, source attribution, filters, telemetry coverage and per-route statistics are stored in `data/flight-calibration.json`. The fitted parameters and train/holdout/leave-one-route-out diagnostics are generated by `npm run fit:flight-calibration` and stored in `src/core/flight-calibration-parameters.js` and `data/flight-calibration-summary.json` only when the independent validation gate passes.

The live estimate is explicitly a **flight-empirical mileage estimate**. The current dataset contains 33 training airport pairs and 4 independent holdout pairs, with five accepted flights per route. The smooth radial warp plus route-neighbour fit reports approximately 7.59% leave-one-route-out MAPE and 4.10% holdout MAPE; the worst holdout error is 8.96%. The largest leave-one-route-out error is 29.28%, so performance is not uniform. Three of the four holdout routes have median telemetry coverage between 30.7% and 53.6%; their full-span mileage is estimated by expanding measured mean ground speed over telemetry gaps. Airline tracks can vary with routing, weather, wind and airspace constraints. These results describe this sample only; they do not establish a universal shortest distance or a guaranteed prediction for a future flight.

**Polygon area and perimeter**

User-drawn polygon area uses the ordinary shoelace formula in projected disk coordinates. Polygon edges and the closing edge may cross 60°S; the polygon is rejected only when it is invalid, such as a self-intersection:

A = 1/2 * abs(sum(x_i * y_(i+1) - x_(i+1) * y_i))

Perimeter is the sum of Euclidean lengths of the same straight projected edges. Each boundary edge is labelled on the map with its projected-plane length in kilometres; the finished polygon also receives an area label in square kilometres. The engine rejects self-intersecting user polygons instead of returning a misleading area.

Selected-country areas are calculated from the same densified projected boundary rings used to draw their outlines, subtracting interior holes and summing separate Polygon/MultiPolygon components. Antarctica's full 360° outer-rim edge is retained in its area calculation. Natural Earth geometry is generalized cartographic data, not cadastral or survey-grade boundary data.

**Planar sector area**

For two radii r1 and r2 and longitude span delta-lambda:

A = 1/2 * abs(r2^2 - r1^2) * abs(delta-lambda)

The complete disk area in this model is pi * (pi * R)^2. This is the mathematical area of the calibrated flat disk; it is not a spherical or ellipsoidal surface area.

The scale bar is locally calibrated at the current view-centre anchor in the displayed horizontal direction. It uses the same local ADS-B route-neighbour correction as A–B. Because map scale varies by position and direction in the base projection, the scale-bar reading is local rather than one uniform scale for the entire disk. Resizing the canvas does not change the calibrated flat-map distance or planar area results. See [the calibration methodology note](docs/flat-map-distance-calibration.md) for the observed-flight data and limitations.

## Antarctica / Ice Wall

The Antarctica feature is drawn as a white ice band between its mapped coastline and the circular disk rim. Natural Earth's Antarctic polygon closes its southern edge with a longitude sweep from 180° to −180° at 90°S. In this disk convention, that coordinate edge represents the complete circumference of the projected rim. The Antarctic path builder preserves the full 360° sweep instead of normalizing it to a zero-length antimeridian crossing. The Antarctic land polygon is filled white, its texture is clipped to that polygon, and the outer rim receives a continuous blue-white double edge. Concentric ice strata, gently irregular radial ridges, short crevasse marks, and repeated tangential rim lettering distinguish the ice wall from ordinary country boundaries.

The Antarctic layer can be toggled independently. Its shape follows the selected Natural Earth boundary scale and its cartographic generalization; it is not a survey of the ice-shelf edge or a measurement of sea-ice extent.

## Historical Gleason overlay · 1892

The optional overlay loads the Boston Public Library scan of Alexander Gleason's *New Standard Map of the World* (1892), held by the Norman B. Leventhal Map & Education Center and served through Digital Commonwealth's IIIF image service.

- Toggle the historical scan on or off.
- Adjust opacity, crop centre X/Y, crop diameter, overlay scale, and fine rotation for fallback alignment.
- For control-point registration, pick a geographic location on the vector map and then the same point in the scan preview.
- At least three non-collinear points are required; 8–12 or more well-distributed points around the disk are recommended.
- With control points present, the image is warped using piecewise-affine triangles into the current ADS-B-calibrated flat-disk coordinate system.

The historical scan is a printed sheet, not a surveyed or automatically georeferenced overlay. Manual registration improves the fit but cannot remove cartographic generalization, compilation error, plate distortion, or print deformation. Treat it as a historical comparison layer, not ground truth.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: commonwealth:7h149v867. The catalogue reports no known copyright restrictions. The image is loaded on demand; first use requires access to the archive's IIIF image service.

## Features

- Gleason-style 2D north-polar circular disk layout
- Smooth ADS-B-calibrated radial disk with a finite-derivative latitude warp; R fitted from observed flight mileage per warped-disk chord
- Separate Natural Earth physical coastlines and island shorelines, with dateline-safe projection
- Curved ocean and sea labels that fade by scale and avoid land and other labels
- Curved ocean and Antarctic rim labels keep their reading direction left-to-right at every map rotation, with glyph-level collision bounds
- Screen-anchored compass and UI-aware label placement prevent the map's labels from overlapping coordinate annotations and measurement controls
- White Antarctic ice-wall band with radial ridges, crevasse details and repeated rim lettering
- Greenwich-right, 90°E-up longitude orientation
- Smooth animated map rotation along the shortest angular path; geographic labels stay anchored to the disk while text remains screen-upright and readable
- Measurement mode buttons expose a clear selected state, while distance/area actions show enabled and disabled availability
- A–B distance: raw Euclidean flat-disk chord plus an ADS-B flight-mileage estimate from a local nearest-route model, with neighbour-support and fit-range diagnostics
- The 60°S Restricted Line is a visual reference only and never changes the direct-line metric
- Planar polygon area by shoelace formula with km labels on every projected boundary edge and a km² area label
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally calibrated flat-disk scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Search and select U.S. county-equivalents using 2026 Census Gazetteer internal-point coordinates; this is a searchable point index, not a rendered county-boundary layer
- View-centred scale bar calibrated with the same local ADS-B route-neighbour correction as A–B
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
    flat-disk.js                    flat-disk projection, planar area and perimeter
    flight-calibration-fit.js        local ADS-B route-neighbour predictor
    flight-calibration-parameters.js generated radial scale and route examples
    flight-telemetry.js              ground-speed × timestamp mileage integration
    measurement-engine.js            straight projected A–B estimate and 60°S reference-line geometry
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
  collect-flight-calibration.mjs historical ADS-B ground-speed/time samples
  fit-flight-calibration.mjs     local route-neighbour fit and validation
tests/
  flat-disk.test.js              projection, planar area and perimeter regressions
  flight-calibration-fit.test.js  radial scale, route-neighbour fit and holdout tests
  flight-telemetry.test.js        ground-speed/time mileage integration tests
  measurement-engine.test.js     ADS-B holdouts and 60°S geometry regressions
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

To refresh the bundled geographic files from their pinned upstream sources, run `npm run vendor:data` with Node.js 20 or newer. The SCAR Antarctic Digital Database v7.13 surface bundle is shipped as `data/antarctic-add-v7.13.geojson.gz`; rebuild it with `npm run vendor:antarctica`. The browser loads the bundled file locally and does not contact the upstream data host.

- Historical scan: Boston Public Library / Digital Commonwealth, item commonwealth:7h149v867; loaded only when the overlay is enabled.
- Antarctic land, ice shelf, ice tongue and rumple surfaces: SCAR Antarctic Digital Database v7.13, British Antarctic Survey / UK Polar Data Centre, DOI [10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb](https://doi.org/10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb), CC BY 4.0.
- A–B distance: primary ADS-B flight-mileage estimate plus secondary raw flat-disk chord. Calibration targets are generated from ground-speed/time observations, not coordinate-derived distances.

## Important limitations

- The radial disk uses a fitted base scale and a smooth latitude-dependent coordinate warp, plus a local nearest-route correction. It is not a universal physical distance law; the reported holdout and leave-one-route-out errors indicate how well it generalizes to new route pairs.
- The raw A–B result is a Euclidean chord in the displayed disk plane. The second result is an estimate of typical flown mileage inferred from ADS-B speed/time observations; it is not the actual track of a selected flight and is not a shortest-path distance. The running measurement engine uses no globe-distance formula or geodesic library; performance outside the sampled airport-pair domain is not guaranteed.
- The approved flight-calibration snapshot currently has no training or holdout route endpoint south of 60°S. Antarctic-rim values are therefore bounded extrapolations; candidate polar routes must be observed and independently validated before the production coefficients can change.
- Latest ADS-B collection (21 November 2026, 12:17 UTC): 61 candidate airport pairs, 253 flight records, 32 qualifying training routes and 2 qualifying holdouts. The eight southern/polar candidate pairs returned no matching flight records, so no polar calibration is promoted.
- Polygon areas and perimeters remain planar measurements in projected disk coordinates. They are not survey-grade ground measurements.
- Country, coastline, airport and capital coordinates remain as location data for rendering and endpoint selection. They are not used to calculate the calibration's distance targets.
- The flat-disk measurement conventions describe a mathematical map layout; they are not evidence or a claim about the physical shape of the Earth.
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
