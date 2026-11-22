# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar radial disk with a nonlinear latitude warp, an ADS-B-derived estimate of typical flown mileage, raw flat-disk chord and planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app renders a custom Gleason-style north-polar radial disk: the North Pole sits at the centre, meridians radiate outward, and parallels are concentric circles. Latitude is mapped to radius with the regularized-power warp below. This is **not the standard azimuthal-equidistant formula**, whose radial coordinate is linear in colatitude. The app makes no claim that this warped disk preserves ground distance or surface area. The disk is an explicit mathematical drawing plane; no external projection or globe-geometry library is used.

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

The fitted latitude warp uses exponent 0.9 and epsilon 0.005. A second, visually applied 12-circle calibration redistributes the intermediate rings with one smooth function while preserving the North Pole at the centre and the Antarctic Ice Wall at the outer rim. Let q be the original fitted radial fraction; the displayed fraction is **q_visual = q + q(1-q)/3**. Its derivative, (4-2q)/3, remains continuous and positive from centre to rim, so there are no hard joins between circle sections. Inner sections gradually gain radial spacing while outer sections gradually compress. The outer disk radius remains **pi * R**. R is regenerated from the current ADS-B training sample; it is a flat-map empirical scale, not a globe radius. Coastlines, capitals, grid lines, labels, clicks and inverse lookup all use the same visually calibrated transform. Polygon area and perimeter are planar measurements on the displayed, rewarped disk. The separate A–B readout and ADS-B estimate continue using the original fitted calibration coordinates; the scale bar follows the displayed visual projection.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

The distance tool draws one straight connector between the endpoints in the visually warped disk, but the primary numeric A–B value is independent of that drawing: it uses a coordinate-only spherical great-circle formula (haversine) with a fixed mean Earth radius of 6,371,008.8 m. The result depends only on endpoint latitude/longitude and does not use ADS-B telemetry, the fitted map scale, or the 12-circle visual warp. The 12-circle transformation affects displayed map geometry only. A separate ADS-B flight-mileage estimate remains available as an empirical reference for typical flown mileage on sampled airport pairs; it is not the actual track of a selected flight and may differ from the great-circle distance because aircraft route around weather, airspace restrictions and operational constraints. Polar/out-of-range support and nearest reference routes are available in the expanded measurement details. The 60°S Restricted Line is a visual reference only.

## Flat-disk mileage estimates and planar area measurements

The A–B tool draws one straight projected segment on the visually calibrated disk. Its primary numeric readout is the coordinate-only spherical great-circle distance between the selected endpoints. The straight connector and its visual chord are display geometry only; the 12-circle warp does not change the great-circle result. A separate ADS-B estimate predicts typical flown mileage from the telemetry-trained route model. Polygon area remains a shoelace calculation in projected coordinates and polygon perimeter remains the sum of its straight projected edges.

**Direct A–B distance**

The primary A–B readout is a spherical great-circle distance calculated only from the two endpoint coordinates. With endpoint latitudes φ₁, φ₂ and wrapped longitude difference Δλ, it uses the haversine formula: `a = sin²(Δφ/2) + cos(φ₁)cos(φ₂)sin²(Δλ/2)` and `d = 2R asin(√a)`, where `R = 6,371,008.8 m` is the fixed mean Earth radius. This value is independent of ADS-B data, fitted map parameters and the visual 12-circle radial warp. The straight connector remains a projected map-display line; it is not the great-circle arc. A separate **ADS-B flight-mileage estimate** is displayed as a secondary reference: the original fitted map chord multiplied by a fitted radial scale and a local correction inferred from the two nearest training routes in standardized flat-disk feature space (mean warped radial fraction, radial share of the unit chord, and tangential share of the unit chord). The model uses inverse-distance weights and a geometric mean of the neighbours' observed mileage ratios. It estimates typical flown mileage in the sampled airport-pair domain, not a specific selected flight's track. Flight mileage can differ from great-circle distance due to airline routing, weather and operational constraints. Moving an endpoint across 60°S does not change the primary distance formula.

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

The scale bar reports map-plane kilometres using the visually calibrated projection and fixed chord-to-pixel conversion; it applies neither the separate A–B readout multiplier nor the route-specific ADS-B correction. Resizing the canvas does not change the calibrated flat-map distance or planar area results. See [the calibration methodology note](docs/flat-map-distance-calibration.md) for the observed-flight data and limitations.

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
- A–B distance: smooth 12-circle visual radial redistribution plus the separate 1.00× to 0.50× calibrated readout, with original/visual chords and ADS-B flight-mileage reference shown separately
- The 60°S Restricted Line is a visual reference only and never changes the direct-line metric
- Planar polygon area by shoelace formula with km labels on every projected boundary edge and a km² area label
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally calibrated flat-disk scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Search and select U.S. county-equivalents using 2026 Census Gazetteer internal-point coordinates; this is a searchable point index, not a rendered county-boundary layer
- View-centred scale bar uses the visually calibrated map-plane chord metric; the A–B readout multiplier is separate
- Compact in-frame Find and Measure overlays; mode-specific distance/area details, icons, and enabled action states
- Manual historical-scan registration using geographic/image control points
- Full-screen map mode with automatic canvas resizing and pan preservation when the disk is rebuilt
- Collision-aware capital markers in dense regions; every capital remains searchable and selectable
- Compact mobile Find/Measure dock that collapses over the map until opened
- Toggle country outlines, physical coastlines and islands, grid, capital markers and names, country names, ocean/sea labels, and Antarctica
- Optional 1892 scan overlay with opacity, crop, scale, and rotation controls
- Export the map as PNG
- Share URLs preserving zoom, pan, layers, overlay settings, endpoints, area vertices, and historical registration points
- Repository-bundled geographic datasets, browser HTTP caching, and explicit retry button

## Project structure

The interface uses Lit web components and Vite. The map remains a custom Canvas 2D renderer; its projection, geometry, measurements, calibration, and geographic data are independent of the UI framework.

```text
index.html                  page shell and Lit panel templates
styles.css                  application and map styling
vite.config.js              Vite dev/build/preview configuration
src/
  main.js                   Vite entry point
  app.js                    map initialization and interactions
  app/
    state.js                observable immutable application state
    map-controller.js       requestAnimationFrame redraw scheduler
  components/
    panels.js               declarative Lit UI panels
  core/                     projection, measurements, calibration
  data/                     geographic data validation and loading
  map/                      Canvas drawing, coastlines, labels, Ice Wall
  ui/                       specialized UI renderers
data/                       bundled map and reference datasets
scripts/                    data vendor and calibration utilities
tests/                      unit, regression and UI source checks
e2e/                        Playwright browser tests
.github/workflows/
  test.yml                  production build and Node regression tests
  browser-tests.yml         Playwright Chromium tests
  deploy-pages.yml          GitHub Pages build and deployment
```

Use Node.js 20.19+ or 22.12+.

Install dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

Create and preview the production build:

```bash
npm run build
npm run preview
```

Run the unit and regression suite with `npm test`. The separate Playwright workflow runs `npm run test:e2e` against the production Vite preview.

## Browser end-to-end tests

The Playwright suite launches the static site locally and exercises the real UI in Chromium. Install the project development dependencies and the browser once, then run:

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

The browser suite covers initial map loading, zoom and rotation, geographic search, A–B measurement, planar polygon area, share-link restoration, the mobile tools drawer, and PNG export. CI runs it separately from the fast Node.js unit suite.

## Run locally

Run the Vite development server from the repository root:

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally http://127.0.0.1:5173). The production bundle is generated in `dist/` by `npm run build`. Geographic datasets are bundled locally; internet access is needed only for the optional historical scan.

## Deploy with GitHub Pages

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The `.github/workflows/deploy-pages.yml` workflow builds the Vite app and deploys the `dist/` artifact on pushes to `main`.

Expected URL: https://armave.github.io/gleason-world-map/

## Geographic data sources

Country and Antarctica boundaries at 1:110m, 1:50m, and 1:10m are compressed and stored locally under `data/countries/`. The browser loads only the selected quality. Physical coastlines and island shorelines are bundled separately as Natural Earth 1:50m line geometry in `data/coastlines-50m.json`, allowing the app to emphasize coastlines without styling every political border as a shoreline. The datasets are vendored from the pinned Natural Earth source commit listed in `data/metadata.json`; Natural Earth identifies its vector data as public domain.

Capital coordinates are stored locally in `data/capitals.json` and were generated from the pinned `country-capital.csv` source in `iliyaj/country-data`. The source identifies REST Countries v3.1 as the underlying data source; its MIT license is included in `data/capital-data-LICENSE.txt`.

To refresh the bundled geographic files from their pinned upstream sources, run `npm run vendor:data` with Node.js 20 or newer. The SCAR Antarctic Digital Database v7.13 surface bundle is shipped as `data/antarctic-add-v7.13.geojson.gz`; rebuild it with `npm run vendor:antarctica`. The browser loads the bundled file locally and does not contact the upstream data host.

- Historical scan: Boston Public Library / Digital Commonwealth, item commonwealth:7h149v867; loaded only when the overlay is enabled.
- Antarctic land, ice shelf, ice tongue and rumple surfaces: SCAR Antarctic Digital Database v7.13, British Antarctic Survey / UK Polar Data Centre, DOI [10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb](https://doi.org/10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb), CC BY 4.0.
- A–B distance: primary coordinate-only spherical great-circle formula plus a separate ADS-B flight-mileage reference. ADS-B calibration targets are generated from ground-speed/time observations, not coordinate-derived distances.

## Important limitations

- The map is a custom radial disk with a nonlinear latitude warp, not the standard azimuthal-equidistant formula. It is a mathematical map construction, not a claim about Earth's physical shape. The radial disk uses a fitted base scale and a smooth latitude-dependent coordinate warp; a local nearest-route correction is applied only to the separate ADS-B flight-mileage estimate. It is not a universal physical distance law; the reported holdout and leave-one-route-out errors indicate how well the flight estimate generalizes to new route pairs.
- The primary A–B result is a spherical great-circle distance calculated from endpoint coordinates with a fixed mean Earth radius. It is a direct geographic-distance approximation, not actual flown mileage. The straight map connector is display geometry only. The secondary result is an estimate of typical flown mileage inferred from ADS-B speed/time observations; it is not the actual track of a selected flight or a guaranteed prediction of an airline route. Performance outside the sampled airport-pair domain is not guaranteed.
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
