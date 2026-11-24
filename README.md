# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive 2D reconstruction of the circular north-polar layout used in Alexander Gleason's *New Standard Map of the World* (1892). The active map geometry is intentionally kept simple and explicit: equally spaced latitude parallels, straight radial meridians, and a continuous circular outer rim.

## Pure Gleason geometric baseline

The map is a drawing plane, not a 3D globe. Its baseline follows the historical sheet's stated convention that one degree of latitude represents 60 nautical miles.

For latitude \(\phi\) and longitude \(\lambda\):

```text
theta = 90 degrees - phi
r = theta * 60 nautical miles per degree
r = theta * 111.12 km
x = r * cos(lambda)
y = -r * sin(lambda)
```

The North Pole is at the centre. The equator is halfway from the centre to the outer rim. Equal changes in latitude produce equal changes in radius, so the parallels are concentric and evenly spaced. Meridians are straight rays. Greenwich (0°) points right; 90°E points up; eastward longitude proceeds counter-clockwise.

The drawing scale sets the 180° North-Pole-to-rim radius to **20,001.6 km**. This is the map's planar coordinate scale derived from the stated 60-nautical-mile-per-degree convention. It is not a claim that every direction or region on the historical map matches independently measured ground distances. An independent empirical distance-calibration candidate is being developed separately from this baseline. It does not enter the active map until it passes independent holdout and topology checks. The older ADS-B fit remains archived because flown mileage is not a direct endpoint measurement.

### What is deliberately absent

The active projection does not apply a fitted latitude warp, longitude shear, 12-circle radial profile, ADS-B-derived coefficients, anisotropic distance weights, spherical geometry, ellipsoidal geometry, or geodesic distance formulas. The pure Gleason geometry remains the comparison baseline. A separate research candidate may deform the map only after traceable physical length observations and independent validation are available.

A–B distance and polygon perimeter use ordinary Euclidean lengths in the displayed 2D plane. Polygon area uses the planar shoelace formula. These measurements describe the drawing plane; they must not be presented as independently validated ground distances or surface areas.

### Recalibration policy

Future corrections must be introduced as isolated, reviewable layers rather than hidden inside the base projection. Each proposed change should identify its source observations, control points, uncertainty, fitting method, and independent holdout results. A change must not be promoted merely because it makes a few selected routes or coastlines look better. The original Gleason baseline remains available as the unchanged comparison layer.

The 1892 source scan is available through the [Boston Public Library / Digital Commonwealth catalogue](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). For historical context, see the [New Standard Map background](https://www.newstandardmap.com/about/) and the [Norman B. Leventhal Map & Education Center catalogue](https://collections.leventhalmap.org/).

## Features

- Circular north-polar disk with evenly spaced latitude parallels and straight radial meridians
- Separate Natural Earth country boundaries, physical coastlines and island shorelines
- Continuous Antarctic outer rim with optional white ice-wall styling
- Search and select countries and capitals
- U.S. county-equivalent search using Census Gazetteer internal-point coordinates
- A–B straight-line measurement in the visible map plane
- Planar polygon area and Euclidean perimeter measurements
- Locally sampled map-plane scale bar
- Optional 1892 historical scan overlay with opacity, crop and manual control-point registration
- Pan, zoom, rotate and full-screen map viewing
- Share URLs that preserve view, layers, measurement endpoints, polygon vertices and historical registration points
- PNG export

## Technology and project structure

The interface uses Lit web components and Vite. The map is rendered with Canvas 2D. Projection and measurement code is kept in the core modules and is independent of the UI framework.

```text
index.html                  page shell and Lit panel templates
styles.css                  application and map styling
vite.config.js              Vite build configuration
src/
  main.js                   Vite entry point
  app.js                    map initialization and interactions
  app/
    state.js                observable immutable application state
    map-controller.js       redraw scheduler
  components/
    panels.js               declarative Lit UI panels
  core/                     projection and planar measurements
  data/                     geographic data validation and loading
  map/                      Canvas drawing, coastlines, labels, Ice Wall
  ui/                       specialized UI renderers
data/                       bundled map and reference datasets
scripts/                    data vendors and archived research utilities
tests/                      unit, regression and UI source checks
e2e/                        Playwright browser tests
.github/workflows/          test and GitHub Pages deployment workflows
```

## Run locally

Use Node.js 20.19+ or 22.12+.

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Build and preview the production app:

```bash
npm run build
npm run preview
```

Run the unit and regression tests:

```bash
npm test
```

Run the browser tests:

```bash
npx playwright install chromium
npm run test:e2e
```

The browser suite exercises map loading, zoom and rotation, geographic search, measurements, polygon area, share-link restoration, mobile tools and PNG export.

## Geographic data sources

Country and Antarctica boundaries at multiple Natural Earth scales are bundled under `data/countries/`. Physical coastlines and island shorelines are stored separately. Data are pinned to the upstream source revisions recorded in `data/metadata.json`.

Capital coordinates are stored in `data/capitals.json`. U.S. county-equivalent search points use 2026 Census Gazetteer internal-point coordinates. Antarctic land, ice shelf and related surfaces use the SCAR Antarctic Digital Database v7.13 bundle when available.

- Historical map scan: Alexander Gleason, *New Standard Map of the World* (1892), Boston Public Library / Digital Commonwealth, item [commonwealth:7h149v867](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z)
- Antarctic surface data: SCAR Antarctic Digital Database v7.13, British Antarctic Survey / UK Polar Data Centre, [DOI 10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb](https://doi.org/10.5285/1c81cf24-576f-43df-be72-a5c7dbb51ffb), CC BY 4.0
- Natural Earth vector data: public domain
- Capital data source and license information: `data/capital-data-LICENSE.txt`

To refresh the vendored Natural Earth and related geography files, use `npm run vendor:data`. To rebuild the SCAR Antarctic bundle, use `npm run vendor:antarctica`.

## Deploy with GitHub Pages

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The deployment workflow builds the app and publishes the `dist/` directory on pushes to `main`.

Expected URL: https://armave.github.io/gleason-world-map/
