# Flat Disk World Map

An interactive polar azimuthal-equidistant disk map with spherical ground-distance and area tools, searchable geographic reference data, a continuous Antarctic ice-wall boundary, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.

## Mathematical model

The app uses the specified sphere with radius **R = 6,371 km**. It does not use the WGS84 reference ellipsoid.

Latitude φ and longitude λ are expressed in radians. Colatitude measured from the North Pole is:

θ = π/2 − φ, where 0 ≤ θ ≤ π

The polar disk coordinates are:

r = Rθ
x = Rθ cos(λ)
y = −Rθ sin(λ)

Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. The disk radius is:

R_disk = πR = 20,015.0868… km

Radial scale is exactly 1:1. The local tangential stretch and east–west distance decoder are:

k(θ) = θ / sin(θ)
m(θ) = sin(θ) / θ

with k(0) = m(0) = 1, k(π) tending to infinity, and m(π) tending to zero. In local coordinates, the flat-disk metric is ds_map² = dr² + r²dλ², while the spherical ground metric is ds_ground² = dr² + (m r)²dλ². The map-area stretch is k, since radial scale is 1 and tangential scale is k.

The calibration table shows θ, r, k, and m at standard latitude bands. There is no adjustable radial exponent: changing radial spacing would violate the selected model's 1:1 radial calibration.

## Distances and areas

Two-point measurements use the shortest great-circle distance on the sphere. The central angle is calculated with a stable haversine/atan2 inverse, and distance is d = Rγ. The dashed route is sampled with the spherical direct solution and then projected onto the disk. Results are displayed in metres below 1 km and kilometres for longer distances.

The local scale bar is also spherical: it converts the ends of a screen segment back to geographic coordinates and measures their great-circle distance. It is local to the current view centre, not a claim that the entire disk has one uniform scale.

Custom polygon area uses spherical excess on the R = 6,371 km sphere; each boundary edge is interpreted as the shorter great-circle arc. The perimeter is the sum of those spherical edge distances. Selected-country areas are calculated from Natural Earth boundary rings using spherical polygon area, subtracting holes and summing polygon parts. These are spherical measurements of generalized cartographic boundaries, not cadastral or survey-grade results.

This model is exact for the chosen sphere. It is not an ellipsoidal WGS84 measurement. The distinction is deliberate and is not silently blended with ellipsoid calculations.

## Antarctica / Ice Wall

The Antarctica feature is rendered as a land band between its mapped coastline and the disk's outer rim. Natural Earth's Antarctic polygon closes its southern edge with a longitude sweep from 180° to −180° at 90°S. In this disk convention, that edge represents the full circumference of the projected rim. The Antarctic path builder preserves that full 360° sweep instead of normalizing it to a zero-length antimeridian crossing; the Antarctic land polygon itself is filled, and the rim receives a continuous outline.

The Antarctic layer can be toggled independently. Its shape follows the Natural Earth boundary dataset and its cartographic generalization, not a surveyed ice-shelf or sea-ice limit.

## Geographic layers and historical overlay

- Country and Antarctica outlines: Natural Earth 1:10m Admin 0, with automatic 1:110m fallback if the detailed file cannot be fetched.
- Capital coordinates: country-data, data/country-capital.csv.
- Historical scan: Boston Public Library / Digital Commonwealth, item commonwealth:7h149v867.

The optional overlay loads the Boston Public Library scan of Alexander Gleason's *New Standard Map of the World* (1892), served through Digital Commonwealth's IIIF image service. Adjust opacity, crop centre, crop diameter, scale, and rotation for a manual fallback alignment. For control-point registration, pick a geographic location on the vector map and then the same location in the scan preview. At least three non-collinear points are required; 8–12 or more well-distributed points are recommended. With control points present, the image is warped using piecewise-affine triangles whose geographic targets use the same spherical disk projection.

The historical scan is a printed sheet, not a surveyed or automatically georeferenced overlay. Its engraving may contain cartographic generalization, compilation error, plate distortion, or print deformation. Treat it as a comparison layer, not ground truth.

## Features

- Polar azimuthal-equidistant disk using R = 6,371 km
- Exact 1:1 radial scale and fixed latitude-to-radius calibration table
- Gleason longitude orientation: Greenwich right, 90°E up
- Spherical great-circle distance measurement in metres and kilometres
- Spherical polygon area and great-circle perimeter measurement
- Spherical country-area calculation from boundary geometry
- Live radial, tangential, decoder, and area-distortion diagnostics
- Continuous Antarctic land band / ice-wall rim with pole-aware GeoJSON closure
- Search and select countries and capitals
- View-centred local spherical scale bar
- Great-circle measurement path projected onto the flat disk
- Manual historical-scan registration using user-picked geographic/image control points
- Full-screen map mode with automatic canvas resizing
- Toggle country outlines, grid, capital markers, capital names, and Antarctica
- Optional 1892 scan overlay with opacity, crop, scale, and rotation controls
- Export the map as PNG
- Share URLs preserving zoom, pan, layers, overlay settings, measurement endpoints, area vertices, and historical registration points
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

## Important limitations

- Natural Earth 1:10m geometry is generalized cartographic data, not a cadastral or survey-grade boundary source. The browser falls back to 1:110m only when the high-resolution data cannot be fetched.
- The model is a sphere with radius 6,371 km. It should not be described as an exact representation of the WGS84 ellipsoid.
- A flat disk cannot preserve every global distance, direction, angle, shape, and area simultaneously. Use the spherical measurement tools for the chosen sphere's surface values; use the k and m diagnostics to understand local map distortion.
- At the South Pole, longitude is not geographically unique. In this disk convention, longitude labels the direction of approach to the rim; every such projected point lies at radius πR.
- The historical scan is not ground truth; manual control-point registration improves visual fit but cannot remove errors in the original engraving.
- Seam-crossing and high-latitude polygon topology should still be visually reviewed against higher-resolution source data.
