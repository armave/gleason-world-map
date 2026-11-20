# Flat Disk World Map

An interactive two-dimensional circular disk map with WGS84 ellipsoidal ground-distance measurement, configurable radial latitude spacing, searchable geographic reference data, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.

## Flat-disk layout

The app draws a **2D disk**, not a 3D globe or sphere.

Its radial reference is the WGS84 meridional surface distance from the North Pole. The pole-to-pole meridional distance is approximately **20,003.9 km**. The radial equation is:

`r / R = (Dₙ(latitude) / 20,003.9 km)^p`

where `Dₙ` is the WGS84 surface distance southward from 90°N. At the default `p = 1`, the disk radius is therefore equal to real meridional ground distance from the North Pole. The exponent can be adjusted from 0.50 to 2.00 for visual comparison; values other than `p = 1` intentionally change radial spacing and should not be treated as a true-to-distance radial scale. The live table shows actual meridional ground distance and the resulting **projected radius (km-equivalent)**. Only at `p = 1` is that projected radius equal to the ground distance.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. All coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same convention.

All coastlines, grid rings, clicks, capitals, and measurement endpoints use the same longitude orientation and radial calibration.

Country area and custom polygon area are calculated using GeographicLib's ellipsoidal PolygonArea method. The area tool draws each edge as a shortest WGS84 geodesic, and reports area in m² or km² and perimeter in m or km. The selected-country area is calculated from the country boundary rings; 1:10m Natural Earth geometry is still a cartographic dataset, not a cadastral survey.

The projection diagnostic reports local north–south, east–west, and area scale factors at the selected point. These values quantify the distortion of the displayed disk relative to the WGS84 ellipsoid; they do not change the geodesic distance and area readouts.

Two-point measurements use the shortest surface geodesic on the **WGS84 reference ellipsoid** through GeographicLib's Karney inverse/direct algorithms, which converge for near-antipodal point pairs. If the GeographicLib browser script is unavailable, the app falls back to Vincenty for pairs where it converges. For a near-antipodal pair, it shows “Unavailable” rather than presenting a less accurate approximation as a real-world measurement. The dashed connecting line is sampled along that geodesic and projected onto the disk; its displayed length is not measured in drawing pixels. Results are shown in metres below 1 km and kilometres for longer distances.

The scale bar is also grounded in WGS84: it recalculates the real ground distance represented by a horizontal screen segment near the current view centre. Geodesic calculations use [GeographicLib's JavaScript implementation](https://geographiclib.sourceforge.io/JavaScript/doc), loaded from the published version 2.2.0 browser bundle on jsDelivr with a Subresource Integrity hash (MIT/X11 license). It is a **local** scale indicator, not a claim that the whole disk has one uniform scale. Panning, zooming, or changing the radial exponent can change the local scale.

This is a configurable two-dimensional map convention applied to latitude/longitude reference data. It should not be mistaken for independent evidence of a physical model of the Earth.

## Historical Gleason overlay · 1892

The optional overlay loads the Boston Public Library's scan of Alexander Gleason's *New Standard Map of the World* (1892), held by the Norman B. Leventhal Map & Education Center and served through Digital Commonwealth's IIIF image service.

- Toggle the historical scan on or off.
- Adjust opacity to compare the engraved map with the digital reference layers.
- Adjust crop centre X/Y, crop diameter, overlay scale, and fine rotation to register the printed disk.
- Reset alignment or reload the scan.
- Shared URLs retain the radial exponent and historical overlay settings.

The scan supports control-point registration: pick a geographic location on the vector map, then click the same location in the scan preview. At least three non-collinear points are required; 4–8 or more well-distributed points are recommended. With control points present, the app warps the scanned image using a piecewise-affine triangulation into the selected WGS84-based disk projection. This is a practical manual registration, not a surveyed historical georeference; accuracy depends on the points selected and the distortions/printing errors in the original plate.

The crop starts from the published scan proportions: the full sheet is approximately 4,773 × 6,794 pixels, and the printed disk is about 3,610 pixels across. The initial 75.6% crop diameter is therefore an informed starting point, not automatic georeferencing. Fine adjustment may still be needed. The historical scan is never geometrically warped: when p ≠ 1, the modern vector map intentionally departs from the 1892 print, allowing the user to compare alternative radial conventions against the original.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: `commonwealth:7h149v867`. The catalogue reports **no known copyright restrictions**. The image is loaded on demand; first use requires access to the archive's IIIF image service.

## Features

- 2D circular flat-disk layout with WGS84 ellipsoidal geodesy
- Adjustable equal, compressed, expanded, and custom radial latitude spacing
- Live latitude-to-radius calibration table
- Gleason longitude orientation: Greenwich right, 90°E up
- Search and select countries and capitals
- WGS84 ellipsoidal surface-distance measurement in metres and kilometres
- WGS84 polygon area and perimeter measurement in m²/km²
- WGS84 geodesic area calculation for the selected country from its boundary geometry
- Local radial, tangential, and areal projection-distortion factors
- Manual historical-scan georeferencing using user-picked geographic/image control points
- View-centred local ground scale bar, recalculated for pan, zoom, and radial calibration
- Geodesic measurement path projected onto the flat disk
- Full-screen map mode with automatic canvas resizing
- WGS84 local scale indicator
- Toggle country outlines, grid, capital markers, capital names, and Antarctica
- Optional 1892 scan overlay with opacity, crop, scale, and rotation controls
- Export the map as PNG
- Share URLs preserving zoom, pan, layers, calibration exponent, overlay settings, and measurement endpoints
- Retriable data loading, browser cache fallback, and explicit retry button
- Polygon edge densification and even-odd rendering for polygon holes

## Run locally

Run a static web server from the repository root:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. First load requires internet access for the source datasets; the historical scan is loaded only when its overlay is enabled.

## Deploy with GitHub Pages

1. Open **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**.
4. Save.

Expected URL: `https://armave.github.io/gleason-world-map/`

## Geographic data sources

- Country and Antarctica outlines: [Natural Earth 1:10m Admin 0](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/), with automatic 1:110m fallback if the detailed file cannot be fetched. Natural Earth describes 1:10m as its most detailed vector scale for country/region mapping.
- Capital coordinates: [country-data](https://github.com/iliyaj/country-data), `data/country-capital.csv`.
- Historical scan: [Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z), item `commonwealth:7h149v867`.

## Important limitations

- Natural Earth 1:10m geometry is substantially more detailed than 1:110m but remains generalized cartographic data, not a cadastral or survey-grade boundary source. The browser falls back to 1:110m only when the high-resolution data cannot be fetched.
- The `p = 1` radial setting follows WGS84 meridional ground distance from the North Pole. Other exponents deliberately distort radial spacing for visual comparison. The distortion panel reports local radial, tangential, and area scale factors so that remaining projection error is explicit.
- The flat-disk projection does not preserve every direction, distance, or area globally. The on-map scale bar is local; two-point readouts remain WGS84 surface geodesics regardless of projection settings.
- The historical scan is a printed sheet, not a pre-surveyed or automatically georeferenced overlay. Manual control-point registration improves its fit, but the historical engraving itself may contain cartographic generalization, compilation error, plate distortion, or print deformation. Treat it as a comparison layer, not ground truth.
- A planar disk cannot preserve all global distances, angles, shapes, and areas simultaneously. WGS84 geodesic measurements remain the authoritative physical-distance/area readings; the disk is a visual projection and its local distortion factors must be considered.
- Seam-crossing and high-latitude polygon topology still deserves visual review against higher-resolution data.
