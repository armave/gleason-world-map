# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar radial disk with a nonlinear latitude warp, an observed-flight-path calibration pipeline gated by independent route validation, anisotropic planar polar distance measurements, planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


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

The active observed-path fit uses a regularized-power latitude warp with exponent **1.30** and epsilon **0.005**, an integrated 12-circle profile with inner factor **1.00**, outer factor **0.50** and exponent **a = 1.0328125**, plus a smooth periodic longitude shear. The local radial multiplier is m(q) = 0.5 + 0.5(1 − q)^a and its integral is I(q) = 0.5q + 0.5[1 − (1 − q)^(a + 1)]/(a + 1). The integral mean is μ = 0.7459646426. With the fitted base scale **R_base = 7,793.2338 km**, the physical disk radius is **R_disk = μ·πR_base = 18,263.5762 km**. The 12 reference rings sample the same continuous profile at equally spaced base fractions; their local multipliers (rounded to 0.01×) are **1.00, 0.95, 0.91, 0.86, 0.81, 0.77, 0.72, 0.68, 0.63, 0.59, 0.54, 0.50**. Longitude is transformed by λ′ = λ + 4q(1 − q)F(λ), where F(λ) = a₁sinλ + b₁(1 − cosλ) + a₂sin2λ + b₂(1 − cos2λ), with coefficients (a₁, b₁, a₂, b₂) = (0.3000, −0.2164, 0.0192, 0.1200). This angular shear is periodic, returns to zero at the North Pole and Ice Wall, and has a conservative minimum angular stretch of **0.3947**, preventing longitude foldover. Each latitude parallel remains a circle, while meridians and coastline shapes are smoothly deformed. The forward and inverse display transform drives the map, map clicks, labels, cities and endpoint selection. Direct distances integrate the straight segment in the unchanged visible disk using 64 equal planar steps. Each midpoint decomposes the step into radial dr and tangential r·dθ components; only the tangential component is weighted by w(r)=1/(1+c₁(r/R_eq)²+c₂(r/R_eq)⁴). The active c₁ and c₂ coefficients are stored with the path-fit parameters. The A–B value, red connector pill, scale bar, polygon edges/perimeter and PNG metadata all use this canonical metric.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. The empirically fitted longitude shear moves intermediate meridians smoothly while leaving the North Pole and Antarctic rim unchanged. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same shared transform.

The deployed visible transform is the **last accepted regional flat-disk fit**, from **148 qualifying observed flights across 26 training airport pairs**, with **36 observed flights across 6 independent holdout pairs**. Its original regional validation reported **5.57%** projected-path training MAPE, **4.39%** independent holdout MAPE and **6.98%** maximum holdout-route error. These scores do **not** establish whole-disk accuracy: that snapshot had no qualifying routes south of 45°S. The stricter global release gate now requires independent southern training and holdout routes south of both 45°S and 60°S, with adequate projected paths after fitting. Until a candidate passes those gates and the error limits, the last accepted coefficients remain active and the southern disk is explicitly extrapolated. The latest candidate and its rejection details are published in [the visual-path calibration report](data/flight-path-calibration-summary.json).

The earlier ADS-B route-feature distance-correction model remains research history. The runtime direct-measurement function now uses the anisotropic planar polar metric; the ADS-B path fitter jointly estimates the two nonnegative tangential coefficients with the radial and longitude-warp parameters, while retaining independent holdout and southern-coverage gates.

## A–B distance and planar area measurements

The map has one distance source of truth. For every pair of endpoints, the canonical direct distance is the 64-step anisotropic planar polar integral along the straight projected segment:

```text
A' = project(A.longitude, A.latitude)
B' = project(B.longitude, B.latitude)
Δx = (B'.x − A'.x) / 64
Δy = (B'.y − A'.y) / 64
At midpoint (xᵢ,yᵢ): rᵢ = hypot(xᵢ,yᵢ)
drᵢ = (xᵢΔx + yᵢΔy) / rᵢ
tᵢ = (xᵢΔy − yᵢΔx) / rᵢ
w(r) = 1 / [1 + c₁(r/R_eq)² + c₂(r/R_eq)⁴]
D(A,B) = Σᵢ₌₀⁶³ sqrt(drᵢ² + [w(rᵢ)tᵢ]²)
```

The endpoints use the existing forward radial warp, integrated 12-circle profile and periodic longitude shear. Distance then integrates the straight segment in that unchanged plane. The initial c₁/c₂ defaults are 0.08/0.20, giving w(12,865 km) close to 0.49 when R_eq is about 8,945.06 km. Radial travel is not scaled. **Known constraint:** because c₁,c₂≥0, w(r) is positive and ds≥|dr| at every sample. On the unchanged Santiago–Canberra projected segment, the 64-step radial variation alone is approximately 16,539 km, already well above the requested 11,907 km upper limit for an 11,340 km benchmark. No allowed c₁/c₂ pair can bring that route within ±5% without changing the projection or allowing radial scaling.

The same `measureDistanceMeters()` function powers the A–B value, the on-map connector label, local scale-bar sampling, each polygon edge label, polygon perimeter and PNG metadata. ADS-B ground-speed/time mileage is not used as an endpoint-distance correction.

### Planar polygon area and anisotropic perimeter

User-drawn polygon area is still computed by the shoelace formula in projected flat-disk coordinates:

```text
A = 1/2 × abs(sum(x_i × y_(i+1) - x_(i+1) × y_i))
```

Every polygon edge, including closure, obtains its perimeter contribution from the same anisotropic planar metric as A–B. The on-map edge labels and finished polygon perimeter therefore use the canonical metric on each straight projected edge. Selected-country areas continue to use the densified projected boundary rings, subtract interior holes and sum Polygon/MultiPolygon components. Antarctica's full 360° outer-rim edge is retained.

The scale bar samples two map coordinates at the current view anchor and measures them with the same canonical function. Canvas resizing does not change the metric.

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
- 1892 Vintage presentation with restrained parchment grain, engraved ocean contours, clipped land hatching, and an ornamental title cartouche; textures and ornament are decorative and do not alter geography or measurements
- Live A–B route register with endpoint names, coordinates, and the same canonical distance shown on the map; zoomed map annotations identify each endpoint without introducing another distance calculation
- Smooth ADS-B-calibrated radial disk with a finite-derivative latitude warp and integrated 12-circle radial-spacing profile; parameters promoted only after observed-path validation
- Separate Natural Earth physical coastlines and island shorelines, with dateline-safe projection
- Curved ocean and sea labels that fade by scale and avoid land and other labels
- Curved ocean and Antarctic rim labels keep their reading direction left-to-right at every map rotation, with glyph-level collision bounds
- Screen-anchored compass and UI-aware label placement prevent the map's labels from overlapping coordinate annotations and measurement controls
- White Antarctic ice-wall band with radial ridges, crevasse details and repeated rim lettering
- Greenwich-right, 90°E-up longitude orientation
- Smooth animated map rotation along the shortest angular path; geographic labels stay anchored to the disk while text remains screen-upright and readable
- Measurement mode buttons expose a clear selected state, while distance/area actions show enabled and disabled availability
- A–B distance: one 64-step anisotropic planar polar integral is the sole direct-distance source; A–B, the red connector label, scale bar, polygon edges/perimeter and PNG exports all use the same function
- The 60°S Restricted Line is a visual reference only and never changes the direct-line metric
- Planar polygon area by shoelace formula with km labels on every projected boundary edge and a km² area label
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally calibrated flat-disk scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Search and select U.S. county-equivalents using 2026 Census Gazetteer internal-point coordinates; this is a searchable point index, not a rendered county-boundary layer
- View-centred scale bar, A–B labels and polygon perimeter use the same anisotropic planar metric
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

The browser suite covers initial map loading, zoom and rotation, geographic search, anisotropic planar A–B measurements, polygon perimeter and planar area, endpoint-change regression checks, share-link restoration, the mobile tools drawer, and PNG export. CI runs it separately from the fast Node.js unit suite.

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
- A–B distance: the reported distance is a 64-step anisotropic planar integral along the straight projected connector. It matches the connector pill; observed aircraft route mileage is not applied as an endpoint multiplier.

## Important limitations

- The map is a custom radial disk with a nonlinear latitude warp. It remains a circular flat-disk construction with the North Pole at the centre and longitude-indexed positions around the Antarctic rim.
- The visible map geometry is empirically calibrated with observed flight-path data, but direct A–B measurements integrate each straight projected segment with an anisotropic planar polar metric. They are map-plane measurements, not flight paths, airline routes or independently surveyed ground distances.
- The active visible-map path-calibration snapshot has no independent training or holdout route endpoint south of 60°S. The Antarctic-rim geometry is therefore an extrapolation with limited empirical support. Direct A–B measurements use the anisotropic planar metric, without an additional flown-mileage multiplier.
- Antarctic candidate collection is still subject to exact airport-pair checks, full-detail endpoint verification, observed-only ground-speed/time coverage and independent training/holdout gates. Aircraft identifiers and airport aliases broaden discovery only; they do not count as evidence until a route has at least three quality-qualified flights.
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


## Experimental multi-anchor flat-disk candidate

A separate candidate fitting pipeline is available through `npm run fit:multi-anchor`. It adjusts a circular flat-disk drawing plane against independently sourced direct endpoint-to-endpoint distance observations, then checks independent holdout error and map foldover. It does not change the active production map or distance engine.

The observation input is intentionally not populated with ADS-B route mileage: flown track length is not direct straight-line endpoint distance. Start from `data/multi-anchor-distance-observations.template.json`, provide source-traceable measurements, and keep complete endpoint pairs disjoint between training and holdout. The minimum coverage, quality gates, and manual promotion procedure are documented in `docs/multi-anchor-flat-disk.md`.

The project currently has no qualifying independent direct-distance observation set for this candidate. Until such data is supplied and passes every holdout/topology gate, the existing production projection remains active.

The experimental fitter uses confidence-weighted robust optimization, geographic holdout-coverage gates (including unseen anchors), a regularized radial-basis deformation, a damped numerical inverse, and denser checks for foldover, displacement and rim preservation. Its automated tests include synthetic recovery and deliberately invalid topology cases. These synthetic cases verify software behavior only; they are not real-world calibration measurements.

