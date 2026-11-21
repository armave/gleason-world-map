# Flat Disk World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive Gleason-style north-polar circular map with WGS84 direct-distance and planar-area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.


## Map layout and calibration

The app draws a two-dimensional circular disk. Its geographic layout follows the north-polar azimuthal-equidistant arrangement used by Gleason's 1892 sheet: the North Pole is at the centre, the meridians radiate outward, and parallels form circles.

The disk uses a fixed planar radial calibration with **R = 6,371 km** as its chosen radial scale constant. For latitude phi in radians and longitude lambda in radians:

theta = pi/2 - phi
r = R * theta
x = r cos(lambda)
y = -r sin(lambda)

The outer disk radius is **pi * R = 20,015.09 km**. These values define the X/Y coordinate scale on the flat disk; the south-pole rim corresponds to theta = pi.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

The Gleason disk remains the map's two-dimensional display layout. Its radial calibration determines where geographic coordinates appear on the disk; it is not used as a universal ground-distance conversion. A–B distance uses the shortest path on the WGS84 reference ellipsoid and then projects that path onto the disk. This is a geographic point-to-point measurement, not the length of an actual flight or other travelled route.

## Direct geographic distance and planar area measurements

The distance and area tools deliberately use different metrics because the disk is a map projection, not a globally distance-preserving plane.

**Direct A–B distance**

For two geographic points, the engine calculates the shortest inverse geodesic on the WGS84 reference ellipsoid (Vincenty's inverse method). The numeric readout reports this shortest direct surface distance. The visual A–B connector is deliberately different: it is always a straight dashed segment between the two projected map positions. That straight map chord is a direct A-to-B visual indicator, not the projected WGS84 geodesic, aircraft track, road journey, or other travelled route.

The calculation uses WGS84 ellipsoid parameters. If the iterative inverse does not converge for a nearly antipodal pair, the engine falls back to an authalic-sphere approximation; ordinary routes use the ellipsoidal result.

**Polygon area and perimeter**

User-drawn polygon area uses the ordinary shoelace formula in projected disk coordinates:

A = 1/2 * abs(sum(x_i * y_(i+1) - x_(i+1) * y_i))

Perimeter is the sum of Euclidean lengths of the same straight projected edges. The engine rejects self-intersecting user polygons instead of returning a misleading area.

Selected-country areas are calculated from the same densified projected boundary rings used to draw their outlines, subtracting interior holes and summing separate Polygon/MultiPolygon components. Antarctica's full 360° outer-rim edge is retained in its area calculation. Natural Earth geometry is generalized cartographic data, not cadastral or survey-grade boundary data.

**Planar sector area**

For two radii r1 and r2 and longitude span delta-lambda:

A = 1/2 * abs(r2^2 - r1^2) * abs(delta-lambda)

The complete disk area in this model is pi * (pi * R)^2. This is the mathematical area of the calibrated flat disk; it is not a spherical or ellipsoidal surface area.

The scale bar is locally calibrated with the WGS84 geodesic at the current view-centre anchor, in the displayed horizontal direction. Because map scale varies by position and direction in an azimuthal projection, the scale-bar reading is local rather than one uniform scale for the entire disk. Resizing the canvas does not change the underlying geographic distance or planar area results.

## Flight-route calibration and validation

The engine was checked against published shortest airport-to-airport great-circle references and separate recorded aircraft-track ranges. The examples span a southern Pacific route whose shortest path reaches about 61.8°S through to a New York–Singapore shortest path that approaches about 87.5°N. The engine column reports WGS84 inverse-geodesic distances from airport coordinates; published shortest-distance figures are rounded cross-checks, while recorded flight tracks are expected to be longer.

| Route | Published shortest-distance reference | Recorded aircraft-track range | Engine (WGS84) |
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
- With control points present, the image is warped using piecewise-affine triangles into the same R = 6,371 km flat-disk coordinate projection.

The historical scan is a printed sheet, not a surveyed or automatically georeferenced overlay. Manual registration improves the fit but cannot remove cartographic generalization, compilation error, plate distortion, or print deformation. Treat it as a historical comparison layer, not ground truth.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: commonwealth:7h149v867. The catalogue reports no known copyright restrictions. The image is loaded on demand; first use requires access to the archive's IIIF image service.

## Features

- Gleason-style 2D north-polar circular disk layout
- Fixed flat-disk radial calibration r = R * theta with R = 6,371 km and disk radius pi * R
- Separate Natural Earth physical coastlines and island shorelines, with dateline-safe projection
- Curved ocean and sea labels that fade by scale and avoid land and other labels
- White Antarctic ice-wall band with radial ridges, crevasse details and repeated rim lettering
- Greenwich-right, 90°E-up longitude orientation
- WGS84 shortest-surface A–B distance in metres and kilometres
- A–B is always shown with a straight dashed line between the projected endpoints
- Planar polygon area by shoelace formula and perimeter by straight-edge lengths
- Planar area for selected country boundaries using the same sampled projected rings as the drawn outlines, subtracting holes and summing multipart features
- A locally WGS84-calibrated scale bar at the current view centre
- Search and select countries, capitals, and U.S. county-equivalents
- U.S. county boundary geometry is loaded from the U.S. Census Bureau's 2026 TIGERweb Counties layer (January 1, 2026 vintage); labels use each polygon's Census internal point and are hidden when their label box would cross the county boundary
- Zoom-adaptive capital names (from 125% zoom) with collision-aware placement
- Official 2026 Census TIGERweb county-equivalent polygons and internal points (boundary lines from 225%, labels from 270% zoom)
- County labels are placed only when their full label box fits inside their own county polygon; county labels use warm serif styling, while capital labels use blue sans-serif text and point markers
- County search, selection, and shareable layer visibility
- View-centred scale bar calibrated to local WGS84 ground distance
- Direct A–B WGS84 surface-distance readout with a straight dashed map connector
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
    flat-disk.js            map projection, planar area and perimeter
    geodesic.js              WGS84 inverse/direct distances and projected geodesic paths
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
- A–B distance: the in-repository WGS84 inverse-geodesic engine in `src/core/geodesic.js`; display layout and planar area: `src/core/flat-disk.js`.

## Important limitations

- The radial disk calibration controls map placement; it is not a globally uniform conversion from projected X/Y coordinates to ground distance.
- A–B distance is a shortest WGS84 surface geodesic, not an actual flight, road, rail, or other travelled route. Real aircraft tracks can be materially longer and may avoid polar regions.
- Polygon areas and perimeters remain planar measurements in projected disk coordinates. They are not WGS84 ellipsoidal polygon areas or survey-grade ground measurements.
- The WGS84 inverse uses a spherical fallback only for nearly antipodal pairs where Vincenty's iterative inverse does not converge.
- The flat-disk measurement conventions describe a mathematical map layout; they are not evidence or a claim about the physical shape of the Earth. The Boston Public Library identifies the 1892 Gleason sheet as a polar azimuthal projection.
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
