# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar circular map with projected-plane distance and area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app draws a two-dimensional circular disk. Its geographic layout follows the north-polar azimuthal-equidistant arrangement used by Gleason's 1892 sheet: the North Pole is at the centre, the meridians radiate outward, and parallels form circles.

The disk uses the spherical azimuthal-equidistant calibration supplied for this project. Its base radius is **R = 6,371 km**. For latitude phi in radians and longitude lambda in radians:

theta = pi/2 - phi
r = R * theta
x = r cos(lambda)
y = -r sin(lambda)

The outer disk radius is **pi * R = 20,015.09 km**. Radial distances from the North Pole are true in this spherical model: north–south distance is simply the difference between the two radial coordinates. The south-pole rim corresponds to theta = pi.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

This is a flat map projection, not a claim that the physical Earth is a flat plane. The Boston Public Library's Leventhal Map & Education Center describes Gleason's sheet as a polar azimuthal projection. An azimuthal-equidistant map preserves distances from its centre; it does not make every off-centre straight-line measurement correct, nor does it preserve area everywhere. The app measures distances and areas directly in the projected disk coordinates, while reporting local scale distortion separately rather than treating the disk as uniformly scaled.

## Spherical distance and area calibration

All physical measurements use the same sphere of radius R = 6,371 km as the disk projection.

**Distances**

For two points at latitudes phi1, phi2 and longitudes lambda1, lambda2, the shortest spherical great-circle distance is:

d = R * arccos[sin(phi1)sin(phi2) + cos(phi1)cos(phi2)cos(lambda2 - lambda1)]

The implementation evaluates the equivalent haversine form for numerical stability near coincident and antipodal points. Distances are returned in metres or kilometres. Same-meridian distance is R * abs(phi2 - phi1); same-latitude east–west distance is R * cos(phi) * abs(lambda2 - lambda1), equivalent to R * sin(theta) * abs(delta-lambda).

The A–B connector is sampled along that spherical great-circle route and then projected into the disk. It is therefore not merely the straight chord between the two screen positions.

**Local distance and area correction**

The azimuthal-equidistant disk preserves radial scale, but its tangential map stretch increases with colatitude theta:

k(theta) = theta / sin(theta)
m(theta) = sin(theta) / theta = 1 / k(theta)

A local east–west map distance is multiplied by m(theta) to obtain spherical surface distance. Because radial scale is 1, the local map-area stretch is k(theta), and the same m(theta) is the local surface-area correction.

**Polygon and country area**

For a region represented in projected disk coordinates, true surface area is the weighted integral:

A_true = integral integral [sin(r/R) / (r/R)] dA_map

The engine evaluates this radial-Jacobian integral from each projected polygon boundary using an equivalent Green's-theorem line integral. This avoids dense raster sampling or quadratic-time triangulation, including for detailed Natural Earth boundaries. Interior rings are subtracted; separate MultiPolygon components are added.

The exact spherical area of a coordinate-grid sector between radial distances r1, r2 and longitude span delta-lambda is:

A = R^2 * abs(delta-lambda) * abs(cos(r1/R) - cos(r2/R))

For the complete disk (theta 0 to pi and longitude span 2pi), this gives 4*pi*R^2, approximately **510,064,472 km²**.

The perimeter of a user-drawn polygon follows its straight segments on the disk and integrates the corresponding anisotropic spherical line element along those edges. Self-intersecting user polygons are rejected instead of being assigned a misleading area.

**Calibration reference**

| Latitude | Radius r (km) | Stretch k(theta) | Decoder m(theta) |
|---|---:|---:|---:|
| 90°N | 0 | 1.00× | 1.000 |
| 60°N | 3,335.85 | 1.05× | 0.955 |
| 30°N | 6,671.70 | 1.21× | 0.827 |
| 0° | 10,007.54 | 1.57× | 0.637 |
| 30°S | 13,343.39 | 2.42× | 0.413 |
| 60°S | 16,679.24 | 5.24× | 0.191 |
| 90°S rim | 20,015.09 | tends to infinity | 0.000 |

The scale bar and distortion panel use this same spherical model. No GeographicLib or ellipsoidal WGS84 dependency is required for distance, area, perimeter, or scale-bar calculations.

## Local projection distortion

At each selected latitude, the radial scale is 1.000×. The east–west map stretch is k(theta) = theta/sin(theta); the east–west distance decoder and surface-area Jacobian are m(theta) = sin(theta)/theta. Map-area stretch is k(theta). At the North Pole the limiting factors are 1; at the South Pole, k tends to infinity and m tends to zero.

The distortion panel reports radial scale, east–west map stretch, the distance decoder, and map-area stretch using these exact spherical relationships.

## Antarctica / Ice Wall

The Antarctica feature is drawn as a white ice band between its mapped coastline and the circular disk rim. Natural Earth's Antarctic polygon closes its southern edge with a longitude sweep from 180° to −180° at 90°S. In this disk convention, that coordinate edge represents the complete circumference of the projected rim. The Antarctic path builder preserves the full 360° sweep instead of normalizing it to a zero-length antimeridian crossing. The Antarctic land polygon is filled white, its texture is clipped to that polygon, and the outer rim receives a continuous blue-white double edge. Concentric ice strata, gently irregular radial ridges, short crevasse marks, and repeated tangential rim lettering distinguish the ice wall from ordinary country boundaries.

The Antarctic layer can be toggled independently. Its shape follows the selected Natural Earth boundary scale and its cartographic generalization; it is not a survey of the ice-shelf edge or a measurement of sea-ice extent.

## Historical Gleason overlay · 1892

The optional overlay loads the Boston Public Library scan of Alexander Gleason's *New Standard Map of the World* (1892), held by the Norman B. Leventhal Map & Education Center and served through Digital Commonwealth's IIIF image service.

- Toggle the historical scan on or off.
- Adjust opacity, crop centre X/Y, crop diameter, overlay scale, and fine rotation for fallback alignment.
- For control-point registration, pick a geographic location on the vector map and then the same point in the scan preview.
- At least three non-collinear points are required; 8–12 or more well-distributed points around the disk are recommended.
- With control points present, the image is warped using piecewise-affine triangles into the same R = 6,371 km spherical disk projection.

The historical scan is a printed sheet, not a surveyed or automatically georeferenced overlay. Manual registration improves the fit but cannot remove cartographic generalization, compilation error, plate distortion, or print deformation. Treat it as a historical comparison layer, not ground truth.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: commonwealth:7h149v867. The catalogue reports no known copyright restrictions. The image is loaded on demand; first use requires access to the archive's IIIF image service.

## Features

- Gleason-style 2D north-polar circular disk layout
- Fixed spherical radial calibration r = R * theta with R = 6,371 km and disk radius pi * R
- Separate Natural Earth physical coastlines and island shorelines, with dateline-safe projection
- Curved ocean and sea labels that fade by scale and avoid land and other labels
- White Antarctic ice-wall band with radial ridges, crevasse details and repeated rim lettering
- Greenwich-right, 90°E-up longitude orientation
- Spherical great-circle distance measurements in metres and kilometres
- Distance A–B follows a sampled spherical great-circle route projected onto the disk
- Spherical polygon surface area and perimeter, decoded with the radial Jacobian sin(theta)/theta
- Spherical surface area for selected country boundaries, including holes and multipart features
- Local radial, tangential, distance-decoder, and area-distortion diagnostics
- Search and select countries, capitals, and U.S. county-equivalents
- U.S. county boundary geometry is loaded from the U.S. Census Bureau's 2026 TIGERweb Counties layer (January 1, 2026 vintage); labels use each polygon's Census internal point and are hidden when their label box would cross the county boundary
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Official 2026 Census TIGERweb county-equivalent polygons and internal points (boundary lines from 225%, labels from 270% zoom)
- County labels are placed only when their full label box fits inside their own county polygon; county labels use warm serif styling, while capital labels use blue sans-serif text and point markers
- County search, selection, and shareable layer visibility
- View-centred local spherical ground scale bar
- Great-circle A–B route and spherical surface distance
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
  us-counties.json          U.S. Census 2024 county-equivalent label points
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
    gleason-sphere.js       spherical projection, great-circle distance, area Jacobian and perimeter
    format.js               coordinates, units, and search formatting
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
    calibration.js          radial table and distortion panel
scripts/
  vendor-geodata.mjs        reproducible pinned-source data import
  vendor-county-labels.mjs  reproducible Census county-label data import
tests/
  gleason-sphere.test.js    spherical projection, distances, scale factors and area regressions
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
- Flat-disk distance and polygon measurements: the in-repository projected-plane engine in `src/core/flat-disk.js`.

## Important limitations

- A flat map cannot preserve all global distances, angles, shapes, and areas simultaneously. This is inherent to map projection; the displayed measurements use the explicitly defined R = 6,371 km spherical model.
- The model is spherical, not ellipsoidal WGS84. Results are exact for the stated sphere and formulas, but are not ellipsoidal geodesics or survey-grade ground measurements.
- The map projection is a cartographic representation and does not establish that the physical Earth is flat. The Boston Public Library identifies the 1892 Gleason sheet as a polar azimuthal projection.
- Natural Earth 1:10m geometry is generalized cartographic data, not a cadastral or survey-grade boundary source. The browser falls back to 1:110m only when the high-resolution data cannot be fetched.
- The historical scan is not ground truth; manual control-point registration improves visual fit but cannot remove errors in the original engraving.
- Seam-crossing and high-latitude polygon topology should still be reviewed against the source geometry.


## Zoom-adaptive place labels

Capital markers remain available at every zoom level. Their names appear from 125% zoom, with screen-space collision filtering so nearby capitals do not overwrite one another. The selected capital label receives priority.

The optional “U.S. county names” layer uses the U.S. Census Bureau's 2024 National Counties Gazetteer internal points. It covers U.S. counties and county-equivalents in the 50 states, the District of Columbia, and Puerto Rico, including Alaska boroughs/census areas and Puerto Rico municipios. The 2026 Census national file does not include the separately published Island Areas (American Samoa, Guam, the Northern Mariana Islands, and the U.S. Virgin Islands). Names appear from 270% zoom, after which labels are collision-filtered against capital labels and one another. This is a label-point layer, not county boundary geometry; the app does not imply that county polygons are available worldwide.

The compact data file is generated from the Census Bureau's public-domain 2026 Gazetteer. Download and extract `2026_Gaz_counties_national.zip` from [the Census Gazetteer archive](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip), then run:

```bash
node scripts/vendor-county-labels.mjs --source-file 2026_Gaz_counties_national.txt
```

Older share links containing the original five-layer visibility code remain compatible; county names default to on unless the new sixth layer bit is present.
