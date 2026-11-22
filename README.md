# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar radial disk with a nonlinear latitude warp, an ADS-B-calibrated typical route-mileage estimate, a separately measured flat-disk connector, and an observed-flight-path calibration pipeline gated by independent route validation, plus planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app renders a custom Gleason-style north-polar radial disk: the North Pole sits at the centre, meridians radiate outward, and parallels are concentric circles. Latitude is mapped to radius with the regularized-power warp below. This is **not the standard azimuthal-equidistant formula**, whose radial coordinate is linear in colatitude. The app makes no claim that this warped disk preserves ground distance or surface area. The disk is an explicit mathematical drawing plane; no external projection or globe-geometry library is used.

The active map is now fitted jointly to observed ADS-B flight paths: it uses a regularized-power latitude warp, an integrated 12-circle radial-spacing profile and a smooth, periodic longitude shear. The longitude shear is `lambdaPrime = lambda + 4q(1-q)F(lambda)`, with a four-coefficient Fourier function `F`; it fades to zero at the North Pole and Antarctic Ice Wall, keeping the pole centre and circular rim fixed. Its angular derivative is constrained to stay positive, so the map does not fold over. This deformation shifts intermediate meridians and coastlines in addition to changing latitude-ring spacing. The same forward and inverse transform drives rendering, map clicks, city markers, A–B distances, scale bar and polygon measurements. The coefficients were fitted to training airport pairs using observed ground-speed/time mileage and timestamped track paths, with nested route-level validation; a preassigned independent airport-pair holdout split is used to evaluate the fit. The current archive contains 26 training and 6 holdout pairs but no qualified endpoints south of 45°S, so southern polar geometry remains an extrapolation despite the anchored rim. For latitude phi and longitude lambda:

```text
theta = pi/2 - phi
t = theta / pi
q = ((t + epsilon)^exponent - epsilon^exponent) /
    ((1 + epsilon)^exponent - epsilon^exponent)
I(q) = 0.5q + 0.5[1 - (1 - q)^(a + 1)]/(a + 1)
r = pi * R_base * I(q)
g(q) = 4q(1 - q)
lambdaPrime = lambda + g(q) * F(lambda)
F(lambda) = a1 sin(lambda) + b1(1 - cos(lambda))
          + a2 sin(2lambda) + b2(1 - cos(2lambda))
x = r cos(lambdaPrime)
y = -r sin(lambdaPrime)
```

The active observed-path fit uses a regularized-power latitude warp with exponent **1.30** and epsilon **0.005**, an integrated 12-circle profile with inner factor **1.00**, outer factor **0.50** and exponent **a = 1.0328125**, plus a smooth periodic longitude shear. The local radial multiplier is m(q) = 0.5 + 0.5(1 − q)^a and its integral is I(q) = 0.5q + 0.5[1 − (1 − q)^(a + 1)]/(a + 1). The integral mean is μ = 0.7459646426. With the fitted base scale **R_base = 7,793.2338 km**, the physical disk radius is **R_disk = μ·πR_base = 18,263.5762 km**. The 12 reference rings sample the same continuous profile at equally spaced base fractions; their local multipliers (rounded to 0.01×) are **1.00, 0.95, 0.91, 0.86, 0.81, 0.77, 0.72, 0.68, 0.63, 0.59, 0.54, 0.50**. Longitude is transformed by λ′ = λ + 4q(1 − q)F(λ), where F(λ) = a₁sinλ + b₁(1 − cosλ) + a₂sin2λ + b₂(1 − cos2λ), with coefficients (a₁, b₁, a₂, b₂) = (0.3000, −0.2164, 0.0192, 0.1200). This angular shear is periodic, returns to zero at the North Pole and Ice Wall, and has a conservative minimum angular stretch of **0.3947**, preventing longitude foldover. Each latitude parallel remains a circle, while meridians and coastline shapes are smoothly deformed. The same forward and inverse transform drives the map, map clicks, labels, cities, ruler, area edges and scale bar.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. The empirically fitted longitude shear moves intermediate meridians smoothly while leaving the North Pole and Antarctic rim unchanged. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same shared transform.

The visible map geometry was accepted from **148 qualifying observed flights across 26 training airport pairs**, with **36 observed flights across 6 independent holdout pairs**. Its projected-path training MAPE is **5.57%** and independent holdout MAPE is **4.39%**, with a maximum holdout-route error of **6.98%**. The separate endpoint-mileage estimator uses 25 quality-screened training pairs and 6 independent holdout pairs. On the route pairs inside its endpoint-feature and chord-length support, leave-one-route-out MAPE is **7.06%** (20 of 25 pairs supported) and holdout MAPE is **1.15%** (4 of 6 pairs supported). The two unsupported holdouts are not included in those error scores. The primary A–B readout is an empirical estimate of typical flown mileage; the exact Euclidean length of the visible flat-disk connector is shown separately. The estimator uses the active flat-disk endpoint geometry and observed ADS-B mileage only.

## A–B distance estimates and planar area measurements

The measurement panel shows two different quantities. The **primary empirical route-mileage estimate** predicts typical flown mileage from observed ADS-B ground-speed/time records for similar airport pairs. The **flat-disk connector length** is the exact Euclidean length of the straight segment drawn between the two projected endpoints. It remains the metric for connector labels, the local scale bar and projected polygon edges. It is not the same as a typical flown route.

### Empirical route-mileage estimate

Each reference route contributes its median directly observed mileage divided by its endpoint chord in the current displayed flat disk. A route is eligible for fitting only when it has at least three accepted flights and its `(p90 - p10) / median` mileage spread is no greater than 0.60. This removes a strong three-flight Brisbane–Gold Coast mileage outlier from the training set.

The query endpoint feature vector is:

```text
[
  mean radial fraction,
  radial share of the displayed chord,
  tangential share of the displayed chord,
  log(displayed chord length in km)
]
```

The estimator finds the four nearest training routes after standardizing those features, applies inverse-feature-distance weights, and takes the weighted geometric mean of their observed mileage-per-chord ratios. The resulting factor is bounded to 0.75–1.50 and multiplied by the current displayed flat-disk chord. The log-chord feature is important: it prevents short regional examples from being treated as validation for extremely long endpoint separations.

Support is declared only when the nearest standardized feature distance is at most **0.90**. Otherwise the estimator can show a provisional number, but the UI marks it **Extrapolated**. The generated model and validation report are `src/core/endpoint-distance-calibration-parameters.js` and `data/endpoint-distance-calibration-summary.json`; regenerate them with `npm run fit:endpoint-distance-calibration`.

The current model has 25 training route pairs and 6 independent holdout pairs. Its supported leave-one-route-out subset contains 20 of 25 training pairs (7.06% MAPE, 18.36% maximum error). Its supported independent holdout subset contains 4 of 6 pairs (1.15% MAPE, 2.56% maximum error). Two holdout pairs are outside feature support and are not included in these scores. These metrics describe only the supported subsets, not every possible city pair.

**Santiago–Canberra example:** the displayed flat-disk connector is **23,894.4 km**. The empirical model gives a provisional estimate of **24,754.5 km**, but marks it **Extrapolated**: its endpoint feature distance is about 5.09, well beyond the 0.90 support limit, and its 23,894 km chord is more than ten times the longest usable training chord (about 2,314 km). The current telemetry sample therefore does not validate a Santiago–Canberra estimate. More observed long-haul route pairs are needed before that result can be considered reliable.

This output predicts typical observed flight mileage, not a specific flight path, a guaranteed airline itinerary, or a shortest point-to-point distance. Weather, airspace restrictions, routing and operational choices can change actual flown mileage.

### Exact flat-disk connector length

The connector length is the Euclidean straight-line distance between the two final projected points. For longitude `λ` and latitude `φ`, the map computes `t = (π/2 − φ)/π`, then fitted base fraction `q(t)`, then the integrated profile `I(q) = ∫₀ᵠ m(u)du`. With the active profile, `m(q) = 0.5 + 0.5(1 − q)^a` and `a = 1.0328125`. The physical radial coordinate is `r = πR_base·I(q)`; the normalized screen radius is `qᵥ = I(q)/μ`, where `μ = I(1)`, and the measured disk radius is `R_disk = μ·πR_base`. The angular coordinate is `λ′ = λ + 4q(1 − q)F(λ)` using the four fitted Fourier coefficients. The final projected point is `x = r cos(λ′)`, `y = −r sin(λ′)`. The connector length is:

```text
sqrt((x2 - x1)^2 + (y2 - y1)^2)
```

This is exactly the Euclidean length of the straight connector drawn between those points. It is a measurement in the custom map plane, not a route-mileage estimate. No globe, sphere, ellipsoid, great-circle or geodesic formula is used.

At 90°S, longitude continues to determine angular position around the outer disk rim. Thus `(−90°, 0°)` and `(−90°, 180°)` remain opposite disk-boundary points rather than one collapsed point.

### Polygon area and perimeter

User-drawn polygon area uses the ordinary shoelace formula in projected disk coordinates. Polygon edges and the closing edge may cross 60°S; the polygon is rejected only when it is invalid, such as a self-intersection:

```text
A = 1/2 * abs(sum(x_i * y_(i+1) - x_(i+1) * y_i))
```

Perimeter is the sum of Euclidean lengths of the same straight projected edges. Each boundary edge is labelled on the map with its projected-plane length in kilometres; the finished polygon also receives an area label in square kilometres. Selected-country areas use the same densified projected boundary rings used to draw their outlines, subtract interior holes and sum separate Polygon/MultiPolygon components. Antarctica's full 360° outer-rim edge is retained.

The scale bar reports map-plane kilometres using the same projected chord metric as the secondary flat-disk connector. Resizing the canvas does not change the calibrated map-plane distance or planar area results. See [the calibration methodology note](docs/flat-map-distance-calibration.md) for the observed-flight data and limitations.

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
- A–B distance: one ADS-B-calibrated flat-disk formula is the sole distance source; A–B, map labels, scale bar, polygon edges/perimeter and PNG exports all use the same function
- The 60°S Restricted Line is a visual reference only and never changes the direct-line metric
- Planar polygon area by shoelace formula with km labels on every projected boundary edge and a km² area label
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally calibrated flat-disk scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Search and select U.S. county-equivalents using 2026 Census Gazetteer internal-point coordinates; this is a searchable point index, not a rendered county-boundary layer
- View-centred scale bar, A–B labels and polygon perimeter use the same canonical ADS-B-calibrated distance function
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

The browser suite covers initial map loading, zoom and rotation, geographic search, single ADS-B-calibrated flat-disk A–B measurement, calibrated polygon perimeter and planar area, share-link restoration, the mobile tools drawer, and PNG export. CI runs it separately from the fast Node.js unit suite.

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
- A–B distance: the only reported distance is the base flat-disk chord multiplied by one bounded ADS-B route-feature correction fitted to observed ground-speed/time mileage. The same function supplies the ruler, map label, scale bar, polygon edge labels/perimeter and PNG export. The result is a calibrated map distance, not the path of a selected flight or a guarantee of a particular airline routing.

## Important limitations

- The map is a custom radial disk with a nonlinear latitude warp, not the standard azimuthal-equidistant formula. It is a mathematical map construction, not a claim about Earth's physical shape. The radial disk uses a fitted base scale and a smooth latitude-dependent coordinate warp. The A–B route-mileage estimate uses a separate nearest-route model calibrated to observed ADS-B mileage; it is not a universal physical distance law. The supported-subset holdout and leave-one-route-out errors indicate how well it generalizes within the sampled route-feature and chord-length domain.
- The A–B empirical route-mileage estimate is displayed only inside the route-feature and chord-length support of the sampled airport pairs. Outside support the app withholds the numeric prediction and displays “Not validated”. The projected disk chord remains a separate Euclidean map-plane measurement; it is not a flown route mileage and must not be read as one. The estimator does not reconstruct a selected flight path or establish a shortest point-to-point distance.
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
