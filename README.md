# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar circular map with straight projected-line distance and planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app draws a two-dimensional circular disk. Its geographic layout follows the north-polar azimuthal-equidistant arrangement used by Gleason's 1892 sheet: the North Pole is at the centre, the meridians radiate outward, and parallels form circles.

The disk's radial scale **R is fitted from observed ADS-B flight mileage**, not from a published shortest-distance table or a geometric globe model. The fit uses airport-pair medians derived from measured ground speed and elapsed time. Airport latitude/longitude values are used only to place those endpoints in the disk coordinate system and to form flat-disk features; no coordinate-derived route length enters the calibration target. For latitude phi in radians and longitude lambda in radians:

theta = pi/2 - phi
r = R * theta
x = r cos(lambda)
y = -r sin(lambda)

The outer disk radius is **pi * R = 8,727.952513 km**. These values define the X/Y coordinate scale on the flat disk; the south-pole rim corresponds to theta = pi. The base linear scale applies to projected coordinates, polygon perimeter, and planar area (which scales by its square). The A–B numeric readout additionally applies the empirical endpoint correction described below. Canberra–Santiago defines the base radial scale, not a universal route fit.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

The Gleason disk remains the measurement plane for the A–B tool. The visible connector is always one straight segment between the projected endpoints. The interface displays both the raw Euclidean flat-disk chord and a separate flight-empirical estimate. The second reading uses a radial scale and a compact endpoint correction fitted to ADS-B ground-speed telemetry integrated over timestamps. It is an estimate of typical flown mileage for sampled airport pairs, not a shortest path or a prediction of the route a particular aircraft will fly. The app shows the multiplier and calibration-domain warnings alongside both readings. The active distance engine contains no globe-distance formula or geodesic library. The 60°S Restricted Line is a visual reference only.

## Flat-map direct-line distance and planar area measurements

The A–B tool draws one straight projected segment and reports both the raw Euclidean chord in the disk plane and a separate empirically corrected estimate. Polygon area remains a shoelace calculation in projected coordinates and polygon perimeter remains the sum of its straight projected edges.

**Direct A–B distance**

The engine projects A and B into the calibrated disk plane and exposes the Euclidean chord as the **raw flat-disk reading**. The second **empirical flat-map estimate** is that same chord multiplied by a bounded empirical factor derived from mean endpoint colatitude, colatitude separation, and wrapped longitude separation. The UI displays both values, the multiplier, the percentage adjustment relative to the raw chord, and diagnostics when mean colatitude, colatitude span, or wrapped longitude separation is outside fitted ranges, the correction is clamped, or an endpoint is at or beyond 85°S. The dashed connector remains exactly one straight segment. The correction was fitted to 15 city-to-city distance references and checked against five separate airport-pair references. The active A–B engine does not use globe equations or geodesic libraries. Moving an endpoint across 60°S does not trigger a metric switch.

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

The live estimate is explicitly a **flight-empirical mileage estimate**. Airline tracks can be longer than a straight point-to-point segment because of operational routing, weather, wind and airspace constraints, and the ADS-B archive can have gaps. Its validation errors and telemetry coverage must therefore be read alongside the number; this does not establish a universal shortest distance between the two locations.

**Polygon area and perimeter**

User-drawn polygon area uses the ordinary shoelace formula in projected disk coordinates. Polygon edges and the closing edge may cross 60°S; the polygon is rejected only when it is invalid, such as a self-intersection:

A = 1/2 * abs(sum(x_i * y_(i+1) - x_(i+1) * y_i))

Perimeter is the sum of Euclidean lengths of the same straight projected edges. Each boundary edge is labelled on the map with its projected-plane length in kilometres; the finished polygon also receives an area label in square kilometres. The engine rejects self-intersecting user polygons instead of returning a misleading area.

Selected-country areas are calculated from the same densified projected boundary rings used to draw their outlines, subtracting interior holes and summing separate Polygon/MultiPolygon components. Antarctica's full 360° outer-rim edge is retained in its area calculation. Natural Earth geometry is generalized cartographic data, not cadastral or survey-grade boundary data.

**Planar sector area**

For two radii r1 and r2 and longitude span delta-lambda:

A = 1/2 * abs(r2^2 - r1^2) * abs(delta-lambda)

The complete disk area in this model is pi * (pi * R)^2. This is the mathematical area of the calibrated flat disk; it is not a spherical or ellipsoidal surface area.

The scale bar is locally calibrated at the current view-centre anchor in the displayed horizontal direction. It uses the same endpoint-based empirical correction as A–B. Because map scale varies by position and direction in the base projection, the scale-bar reading is local rather than one uniform scale for the entire disk. Resizing the canvas does not change the calibrated flat-map distance or planar area results. See [the calibration methodology note](docs/flat-map-distance-calibration.md) for the reference data and limitations.

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
- A–B distance: simultaneous raw Euclidean flat-disk chord and empirical corrected estimate from the same two endpoints, with correction-factor and fit-range diagnostics
- The 60°S Restricted Line is a visual reference only and never changes the direct-line metric
- Planar polygon area by shoelace formula with km labels on every projected boundary edge and a km² area label
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally calibrated flat-disk scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Search and select U.S. county-equivalents using 2026 Census Gazetteer internal-point coordinates; this is a searchable point index, not a rendered county-boundary layer
- View-centred scale bar calibrated with the same local empirical endpoint correction as A–B
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
- A–B distance: raw flat-disk chord plus a separate ADS-B flight-telemetry calibration estimate. The calibration data are generated from ground-speed/time observations, not coordinate-derived distances.

## Important limitations

- The radial disk uses one empirical base scale fitted from sampled airport-pair flight mileage, plus an endpoint residual correction. It is not a universal physical distance law; the reported holdout and leave-one-route-out errors indicate how well it generalizes to new route pairs.
- The raw A–B result is a Euclidean chord in the displayed disk plane. The second result is an estimate of typical flown mileage inferred from ADS-B speed/time observations; it is not the actual track of a selected flight and is not a shortest-path distance. The running measurement engine uses no globe-distance formula or geodesic library; performance outside the sampled airport-pair domain is not guaranteed.
- Polygon areas and perimeters remain planar measurements in projected disk coordinates. They are not WGS84 ellipsoidal polygon areas or survey-grade ground measurements.
- Country, coastline, airport and capital coordinates remain as location data for rendering and endpoint selection. They are not used to calculate the calibration's distance targets.
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
