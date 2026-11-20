# Flat Disk World Map

An interactive Gleason-style north-polar circular map with WGS84 ellipsoidal ground-distance and area tools, searchable geographic reference data, a continuous Antarctic ice-wall rim, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.

## Map layout and calibration

The app draws a two-dimensional circular disk. Its geographic layout follows the north-polar azimuthal-equidistant arrangement used by Gleason's 1892 sheet: the North Pole is at the centre, the meridians radiate outward, and parallels form circles.

The radial coordinate is calibrated to the **WGS84 ellipsoidal meridional distance from the North Pole**. Let D_N(phi) be the WGS84 distance along a meridian from 90°N to latitude phi. Then:

r = D_N(phi)
x = r cos(lambda)
y = -r sin(lambda)

The pole-to-pole meridional distance is approximately **20,003.93 km**. There is no adjustable radial exponent: the disk radius always equals the WGS84 meridian distance from the North Pole. Thus, radial distances from the centre along every meridian are true on the WGS84 ellipsoid.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. Coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same orientation.

This is a flat map projection, not a claim that the physical Earth is a flat plane. The Boston Public Library's Leventhal Map & Education Center describes Gleason's sheet as a polar azimuthal projection. An azimuthal-equidistant map preserves distances from its centre; it does not make every off-centre straight-line measurement correct, nor does it preserve area everywhere. The app therefore separates projected layout from WGS84 surface measurements and reports local scale distortion rather than treating the disk as uniformly scaled.

## WGS84 distances and areas

Two-point measurements use the shortest surface geodesic on the **WGS84 reference ellipsoid**. GeographicLib's JavaScript implementation uses Karney's algorithms for robust inverse/direct geodesic calculations, including near-antipodal pairs. If the external browser library is unavailable, the app falls back to Vincenty's ellipsoidal inverse/direct methods where they converge. If Vincenty's inverse method cannot converge, the distance is marked unavailable rather than substituting a spherical distance. The dashed line is sampled along the geodesic and projected onto the disk; its displayed length is not measured in screen pixels. Results are shown in metres below 1 km and kilometres for longer distances.

The custom area tool calculates ellipsoidal polygon area and perimeter using GeographicLib's WGS84 PolygonArea implementation. Each edge is treated as the shorter WGS84 geodesic between successive vertices. Selected-country areas are calculated from Natural Earth boundary rings with ellipsoidal polygon area, subtracting holes and summing polygon parts. Natural Earth geometry is generalized cartographic data, not cadastral or survey-grade boundary data.

The scale bar recalculates the WGS84 ground distance represented by a horizontal screen segment near the current view centre. It is a **local** scale indicator, not a claim that the entire disk has one uniform scale. Panning or zooming changes the local screen scale.

## Local projection distortion

Because the radial coordinate is the meridian distance from the North Pole, the north–south radial scale is 1. The local east–west scale can differ from the WGS84 ellipsoid. At latitude phi, let N(phi) be the WGS84 prime-vertical radius of curvature and r = D_N(phi). The local tangential map stretch is:

k_EW = r / (N(phi) × abs(cos(phi)))

The distance decoder is its reciprocal, 1/k_EW, and the local map-area stretch is also k_EW, because the radial scale is 1. At the South Pole, longitude converges and the east–west ground radius tends to zero; the local tangential stretch tends to infinity.

The distortion panel reports radial scale, east–west map stretch, the east–west distance decoder, and map-area stretch. These diagnostics describe the local projection scale and do not replace the ellipsoidal geodesic and polygon-area tools.

## Antarctica / Ice Wall

The Antarctica feature is drawn as a land band between its mapped coastline and the circular disk rim. Natural Earth's Antarctic polygon closes its southern edge with a longitude sweep from 180° to −180° at 90°S. In this disk convention, that coordinate edge represents the complete circumference of the projected rim. The Antarctic path builder preserves the full 360° sweep instead of normalizing it to a zero-length antimeridian crossing. The actual Antarctic land polygon is filled, its ice texture is clipped to that polygon, and the outer rim receives a continuous outline.

The Antarctic layer can be toggled independently. Its shape follows the selected Natural Earth boundary scale and its cartographic generalization; it is not a survey of the ice-shelf edge or a measurement of sea-ice extent.

## Historical Gleason overlay · 1892

The optional overlay loads the Boston Public Library scan of Alexander Gleason's *New Standard Map of the World* (1892), held by the Norman B. Leventhal Map & Education Center and served through Digital Commonwealth's IIIF image service.

- Toggle the historical scan on or off.
- Adjust opacity, crop centre X/Y, crop diameter, overlay scale, and fine rotation for fallback alignment.
- For control-point registration, pick a geographic location on the vector map and then the same point in the scan preview.
- At least three non-collinear points are required; 8–12 or more well-distributed points around the disk are recommended.
- With control points present, the image is warped using piecewise-affine triangles into the same WGS84-calibrated disk projection.

The historical scan is a printed sheet, not a surveyed or automatically georeferenced overlay. Manual registration improves the fit but cannot remove cartographic generalization, compilation error, plate distortion, or print deformation. Treat it as a historical comparison layer, not ground truth.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: commonwealth:7h149v867. The catalogue reports no known copyright restrictions. The image is loaded on demand; first use requires access to the archive's IIIF image service.

## Features

- Gleason-style 2D north-polar circular disk layout
- Fixed WGS84 meridional radial calibration from the North Pole
- Greenwich-right, 90°E-up longitude orientation
- WGS84 ellipsoidal surface-distance measurements in metres and kilometres
- WGS84 ellipsoidal custom polygon area and perimeter
- WGS84 ellipsoidal area for selected country boundaries
- Local radial, tangential, distance-decoder, and area-distortion diagnostics
- Continuous Antarctic land band / ice-wall rim with pole-aware GeoJSON closure
- Search and select countries and capitals
- View-centred local WGS84 ground scale bar
- Geodesic measurement path projected onto the disk
- Manual historical-scan registration using geographic/image control points
- Full-screen map mode with automatic canvas resizing
- Toggle country outlines, grid, capital markers, capital names, and Antarctica
- Optional 1892 scan overlay with opacity, crop, scale, and rotation controls
- Export the map as PNG
- Share URLs preserving zoom, pan, layers, overlay settings, endpoints, area vertices, and historical registration points
- Retriable data loading, browser cache fallback, and explicit retry button

## Run locally

Run a static web server from the repository root:

    python -m http.server 8000

Then open http://localhost:8000. First load requires internet access for the source datasets; the historical scan is loaded only when its overlay is enabled.

## Deploy with GitHub Pages

1. Open **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**.
4. Save.

Expected URL: https://armave.github.io/gleason-world-map/

## Geographic data sources

- Country and Antarctica outlines: Natural Earth 1:10m Admin 0, with automatic 1:110m fallback if the detailed file cannot be fetched.
- Capital coordinates: country-data, data/country-capital.csv.
- Historical scan: Boston Public Library / Digital Commonwealth, item commonwealth:7h149v867.
- Ellipsoidal geodesic calculations: GeographicLib JavaScript.

## Important limitations

- A flat map cannot preserve all global distances, angles, shapes, and areas simultaneously. This is inherent to map projection; consult the distortion panel and use the WGS84 surface measurement tools for ground distances and areas.
- True radial scale applies to distances from the North Pole along meridians. A straight segment between arbitrary off-centre points is not generally their surface distance; use the WGS84 geodesic measurement.
- The map projection is a cartographic representation and does not establish that the physical Earth is flat. The Boston Public Library identifies the 1892 Gleason sheet as a polar azimuthal projection.
- Natural Earth 1:10m geometry is generalized cartographic data, not a cadastral or survey-grade boundary source. The browser falls back to 1:110m only when the high-resolution data cannot be fetched.
- The historical scan is not ground truth; manual control-point registration improves visual fit but cannot remove errors in the original engraving.
- Seam-crossing and high-latitude polygon topology should still be reviewed against the source geometry.
