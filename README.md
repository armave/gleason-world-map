# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar radial disk with a nonlinear latitude warp, a separate ADS-B estimate of typical flown mileage, and an observed-flight-path calibration pipeline gated by independent route validation, plus flat-disk chord and planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app renders a custom Gleason-style north-polar radial disk: the North Pole sits at the centre, meridians radiate outward, and parallels are concentric circles. Latitude is mapped to radius with the regularized-power warp below. This is **not the standard azimuthal-equidistant formula**, whose radial coordinate is linear in colatitude. The app makes no claim that this warped disk preserves ground distance or surface area. The disk is an explicit mathematical drawing plane; no external projection or globe-geometry library is used.

The current production map retains the last accepted radial scale and 12-circle profile. The strict observed-only ADS-B refresh is a candidate process; it must pass independent route validation before replacing production geometry. New candidates are fitted against the same displayed 12-circle chord that the map renders, and a separate projection-only error score—not the route-neighbour flight-mileage estimate—controls whether their radial scale can be promoted. For latitude phi and longitude lambda:

```text
theta = pi/2 - phi
t = theta / pi
q = ((t + epsilon)^exponent - epsilon^exponent) /
    ((1 + epsilon)^exponent - epsilon^exponent)
r_base = pi * R_base * q
x_base = r_base cos(lambda)
y_base = -r_base sin(lambda)
```

The fitted latitude warp currently uses exponent 0.9 and epsilon 0.005. The 12-circle profile is a positive, smooth power taper sampled at 12 equally spaced base-ring anchors: m(q) = 0.5 + 0.5(1 − q)^a, with a = 1 in the currently active legacy profile. The path fitter now searches a constrained set of profile exponents alongside the latitude-warp exponent; both parameters are selected within nested route-level validation. The profile remains monotonic from 1.00× at the North Pole to 0.50× at the Ice Wall, with no hard joins. Its integral is I(q) = 0.5q + 0.5[1 − (1 − q)^(a + 1)]/(a + 1), and its mean is μ = 0.5 + 0.5/(a + 1). Physical radius is **r = πR_base·I(q)**, so the local radial derivative is **dr/dq = πR_base·m(q)**. The normalized screen radius is q_visual = I(q)/μ, preserving the North Pole and Ice Wall anchors. The measured disk radius is **μ·πR_base**, not πR_base. R_base and the profile remain on the last accepted production calibration until a strict observed-only candidate passes the independent accuracy and southern-coverage gates. Coastlines, capitals, grid lines, labels, clicks, inverse lookup, ruler, area tools and scale bar use the same shared projection. The table and dotted map rings sample the same 12 positions and multipliers. Primary A–B distance is the Euclidean length of the visible connector after both endpoints are projected through this profile; polygon edge lengths and the scale bar use the same final map-plane kilometre metric.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

The primary A–B number is the Euclidean length of the same straight segment drawn between the projected endpoints in the flat-disk coordinate plane. Both endpoints use the fitted latitude warp and the continuous 12-circle transformation, so the measured segment and map visuals share exactly the same geometry. The scale bar and polygon edge lengths use the same map-plane kilometre metric. The currently active nominal radial scale is carried forward from the previous approved ADS-B fit; its legacy dataset is not eligible for the new strict observed-only fitter. A replacement must be trained on directly observed full-flight mileage and pass independent route and visible-chord projection validation before map coefficients change. The scale is a flat-disk model parameter, not a globe radius or universal ground-distance constant. The displayed map uses a separate path-calibration parameter set. For every accepted flight, the collector stores the ADS-B API's timestamp-aligned GeoJSON MultiLineString path and the independently measured ground-speed/time mileage. Each recorded position is projected into the candidate flat-disk geometry, and the Euclidean lengths of consecutive projected track points are summed within each trajectory sequence (sequence gaps are never connected). For each airport pair, the fitter takes the median of that route's paired per-flight ratios: observed ground-speed mileage divided by projected path length. It jointly fits a shared radial scale, regularized-power latitude exponent and constrained radial-profile exponent using training routes only, then evaluates full held-out airport pairs and nested leave-one-route-out validation. The 1.00×→0.50× 12-circle endpoint multipliers stay fixed while a constrained smooth profile exponent is tested jointly with the latitude warp. A candidate that misses route-count, southern-coverage or error gates never replaces the active visible map parameters. The earlier endpoint-chord calibration remains separate and is used only for the secondary typical-flight-mileage estimate. No sphere, globe, ellipsoid, great-circle or geodesic formula is used for the primary distance. A separate ADS-B flight-mileage estimate remains available as an empirical reference for typical flown mileage on sampled airport pairs. Its route-neighbour correction estimates this secondary value only; it does not alter map coordinates or the displayed connector. It is not the actual track of a selected flight and can differ from the map-plane segment because airline routes, winds, weather, airspace and operational constraints vary. The 60°S Restricted Line is a visual reference only. On this disk, longitude remains an angular coordinate at 90°S, so the Antarctic rim consists of distinct longitude-indexed boundary positions rather than one collapsed spherical South Pole.

## A–B distances and planar area measurements

The A–B tool draws one straight projected segment on the visually calibrated disk. Its primary numeric readout is the Euclidean length of that same segment in the displayed flat-disk plane. The 12-circle warp is included in both endpoint positions before the distance is calculated; no separate radial multiplier is applied to the resulting chord. Consequently, the connector label and primary readout are the same measurement. The scale bar and polygon edge lengths use the same projected-plane metric. A separate ADS-B estimate predicts typical flown mileage from the telemetry-trained route model. Polygon area remains a shoelace calculation in projected coordinates and polygon perimeter remains the sum of its straight projected edges.

**Direct A–B distance**

The primary A–B readout is the Euclidean straight-line distance between the two final projected points. For longitude λ and latitude φ, the map computes `t = (π/2 − φ)/π`, then fitted base fraction `q(t)`, then the integrated fitted profile `I(q) = ∫₀ᵠ m(u)du`. With the current endpoint multipliers, `m(q) = 0.5 + 0.5(1 − q)^a`; the profile exponent `a` is explicit in the active calibration and can change only after the path-fit gate accepts a candidate. The physical radial coordinate is `r = πR_base·I(q)`; the normalized screen radius is `qᵥ = I(q)/μ`, where `μ = I(1)`, and the measured disk radius is `R_disk = μ·πR_base`. The final projected point is `x = r cos(λ)`, `y = −r sin(λ)`. The reported distance is `sqrt((x₂−x₁)² + (y₂−y₁)²)`, exactly the Euclidean length of the connector drawn between those points. The radial derivative is `dr/dq = πR_base·m(q)`. No globe, sphere, ellipsoid, great-circle or geodesic formula is used in the primary measurement path.

At 90°S, the radial fraction is 1 and longitude continues to determine angular position on the outer circle. Thus `(−90°, 0°)` and `(−90°, 180°)` are opposite points on the disk rim, not one collapsed spherical South Pole. This is a deliberate flat-disk boundary convention that keeps the Antarctic Ice Wall circular and measurable; it is not a claim about a physical South Pole.

A separate **ADS-B flight-mileage estimate** remains as a secondary reference. It applies an empirical route-neighbour correction to the original fitted calibration chord, using mean radial fraction and radial/tangential chord shares. It predicts typical flown mileage for sampled airport pairs, not the distance of the displayed segment and not the actual track of a selected flight. Its accuracy depends on the telemetry sample and is not validated at the Antarctic rim.

The 60°S parallel is drawn as a red dashed Restricted Line with two opposing callouts. It is a cartographic reference only and does not change A–B distance calculations. Direct distance connectors and user-drawn polygon edges, including the closing edge, may cross it.

The visible connector is always one straight projected A–B segment, including when either endpoint lies in the Antarctic band. The numeric primary distance is the Euclidean length of that exact segment in the final warped disk; there is no latitude-triggered metric change.

**ADS-B flight-telemetry calibration**

The replacement calibration target is directly observed flown mileage from historical ADS-B telemetry. For each accepted flight, the collector integrates `path_gs` ground-speed/time intervals and measures coverage against the full `start_ts`–`end_ts` flight duration. Only flights with at least 98% full-flight coverage, no unsupported gap over 15 minutes and at least eight valid intervals are accepted. The target is `observed_track_km = sum(speed_knots * interval_seconds / 3600) * 1.852`; no missing interval is imputed, and partial mileage is never expanded by dividing by coverage. Coverage and the largest gap are retained with each source record. Airport coordinates select route pairs and locate their endpoints on the disk, but they are not used to calculate flown mileage.

Flights are grouped by airport pair. Each route's median flight mileage is one calibration observation; entire airport pairs are reserved for holdout validation so no flights from a holdout route enter fitting. The generated dataset, raw flight observations, source attribution, filters, telemetry coverage and per-route statistics are stored in `data/flight-calibration.json`. The fitted parameters and train/holdout/leave-one-route-out diagnostics are generated by `npm run fit:flight-calibration` and stored in `src/core/flight-calibration-parameters.js` and `data/flight-calibration-summary.json` only when the independent validation gate passes.

The current production map still uses its last accepted calibration and 12-circle display profile. The stricter observed-only refresh jointly tests a smooth radial-spacing profile exponent and latitude warp; it remains a candidate process, not an approved replacement. The path-fit gate requires at least 20 usable training airport pairs and 6 usable independent holdout pairs, 4 training and 2 holdout routes with an endpoint south of 30°S, at least 2 training and 1 holdout route south of 45°S, and at least 1 training and 1 holdout route south of 60°S. It also enforces separate training, leave-one-route-out and independent holdout error limits. A route counts only when enough accepted flights produce non-zero projected paths. Only those projection-only metrics can approve a new visual scale. If those tests do not pass, production coefficients remain unchanged. A flat-disk straight connector cannot be assumed to equal an individual aircraft's flown mileage; that measurement belongs to a specific ADS-B flight record.

**Polygon area and perimeter**

User-drawn polygon area uses the ordinary shoelace formula in projected disk coordinates. Polygon edges and the closing edge may cross 60°S; the polygon is rejected only when it is invalid, such as a self-intersection:

A = 1/2 * abs(sum(x_i * y_(i+1) - x_(i+1) * y_i))

Perimeter is the sum of Euclidean lengths of the same straight projected edges. Each boundary edge is labelled on the map with its projected-plane length in kilometres; the finished polygon also receives an area label in square kilometres. The engine rejects self-intersecting user polygons instead of returning a misleading area.

Selected-country areas are calculated from the same densified projected boundary rings used to draw their outlines, subtracting interior holes and summing separate Polygon/MultiPolygon components. Antarctica's full 360° outer-rim edge is retained in its area calculation. Natural Earth geometry is generalized cartographic data, not cadastral or survey-grade boundary data.

**Planar sector area**

For two radii r1 and r2 and longitude span delta-lambda:

A = 1/2 * abs(r2^2 - r1^2) * abs(delta-lambda)

The complete disk area in this model is pi * (mu * pi * R_base)^2, where mu is the integral mean of the active radial-spacing profile. This is the mathematical area of the calibrated flat disk; it is not a spherical or ellipsoidal surface area.

The scale bar reports map-plane kilometres using the same visibly calibrated projection and Euclidean metric as the primary A–B measurement. Resizing the canvas does not change the calibrated flat-map distance or planar area results. See [the calibration methodology note](docs/flat-map-distance-calibration.md) for the observed-flight data and limitations.

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
- Smooth ADS-B-calibrated radial disk with a finite-derivative latitude warp and integrated 12-circle radial-spacing profile; parameters promoted only after observed-path validation
- Separate Natural Earth physical coastlines and island shorelines, with dateline-safe projection
- Curved ocean and sea labels that fade by scale and avoid land and other labels
- Curved ocean and Antarctic rim labels keep their reading direction left-to-right at every map rotation, with glyph-level collision bounds
- Screen-anchored compass and UI-aware label placement prevent the map's labels from overlapping coordinate annotations and measurement controls
- White Antarctic ice-wall band with radial ridges, crevasse details and repeated rim lettering
- Greenwich-right, 90°E-up longitude orientation
- Smooth animated map rotation along the shortest angular path; geographic labels stay anchored to the disk while text remains screen-upright and readable
- Measurement mode buttons expose a clear selected state, while distance/area actions show enabled and disabled availability
- A–B distance: Euclidean length of the straight connector in the final 12-circle-warped flat disk; ADS-B flight-mileage estimate remains a separate empirical reference
- The 60°S Restricted Line is a visual reference only and never changes the direct-line metric
- Planar polygon area by shoelace formula with km labels on every projected boundary edge and a km² area label
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally calibrated flat-disk scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Search and select U.S. county-equivalents using 2026 Census Gazetteer internal-point coordinates; this is a searchable point index, not a rendered county-boundary layer
- View-centred scale bar and primary A–B measurement use the same visually calibrated map-plane Euclidean metric
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

The browser suite covers initial map loading, zoom and rotation, geographic search, flat-disk Euclidean A–B measurement, planar polygon area, share-link restoration, the mobile tools drawer, and PNG export. CI runs it separately from the fast Node.js unit suite.

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
- A–B distance: Euclidean length of the straight connector in the final 12-circle-warped flat disk, plus a separate ADS-B flight-mileage reference. ADS-B calibration targets are generated from ground-speed/time observations, not coordinate-derived distances.

## Important limitations

- The map is a custom radial disk with a nonlinear latitude warp, not the standard azimuthal-equidistant formula. It is a mathematical map construction, not a claim about Earth's physical shape. The radial disk uses a fitted base scale and a smooth latitude-dependent coordinate warp; a local nearest-route correction is applied only to the separate ADS-B flight-mileage estimate. It is not a universal physical distance law; the reported holdout and leave-one-route-out errors indicate how well the flight estimate generalizes to new route pairs.
- The primary A–B result is a flat-disk Euclidean distance: it is the exact length of the straight connector between the endpoints after the fitted latitude warp and integrated smooth 12-circle radial profile. Its map-plane kilometre scale is empirically calibrated and is not a universal physical ground-distance law. The secondary result is an estimate of typical flown mileage inferred from ADS-B speed/time observations; it is not the actual track of a selected flight or a guaranteed prediction of an airline route. Performance outside the sampled airport-pair domain is not guaranteed.
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
