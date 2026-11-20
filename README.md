# Flat Disk World Map

An interactive two-dimensional circular disk map with configurable radial latitude spacing, searchable geographic reference data, straight-line disk measurement, full-screen viewing, and an adjustable comparison overlay of Alexander Gleason's 1892 map.

## Flat-disk layout

The app draws a **2D disk**, not a 3D globe or sphere.

Its default layout places 90°N at the centre and 90°S at the outer rim, using the equal-radial-spacing convention:

`r / R = ((90° - latitude) / 180°)^p`

The default is `p = 1`, which places latitude bands at equal radial intervals. The radial exponent can be adjusted from 0.50 to 2.00 using the presets or custom slider. The live table shows the radius assigned to each latitude for the selected setting.

**Longitude orientation follows the printed Gleason sheet:** Greenwich (0°) points right, 90°E points up, and eastward longitudes progress counter-clockwise. All coastlines, latitude rings, longitude labels, map clicks, capitals, and measurement endpoints use the same convention.

All coastlines, grid rings, clicks, and flat-plane measurements follow the selected radial exponent. Measurements are straight-line distances in the displayed disk plane, expressed as nominal map units using the 6,371-unit reference radius. They are **not** great-circle or independently surveyed physical distances.

This is a configurable two-dimensional map convention applied to latitude/longitude reference data. It should not be mistaken for independent evidence of a physical model of the Earth.

## Historical Gleason overlay · 1892

The optional overlay loads the Boston Public Library's scan of Alexander Gleason's *New Standard Map of the World* (1892), held by the Norman B. Leventhal Map & Education Center and served through Digital Commonwealth's IIIF image service.

- Toggle the historical scan on or off.
- Adjust opacity to compare the engraved map with the digital reference layers.
- Adjust crop centre X/Y, crop diameter, overlay scale, and fine rotation to register the printed disk.
- Reset alignment or reload the scan.
- Shared URLs retain the radial exponent and historical overlay settings.

The crop starts from the published scan proportions: the full sheet is approximately 4,773 × 6,794 pixels, and the printed disk is about 3,610 pixels across. The initial 75.6% crop diameter is therefore an informed starting point, not automatic georeferencing. Fine adjustment may still be needed. The historical scan is never geometrically warped: when p ≠ 1, the modern vector map intentionally departs from the 1892 print, allowing the user to compare alternative radial conventions against the original.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: `commonwealth:7h149v867`. The catalogue reports **no known copyright restrictions**. The image is loaded on demand; first use requires access to the archive's IIIF image service.

## Features

- 2D circular flat-disk layout
- Adjustable equal, compressed, expanded, and custom radial latitude spacing
- Live latitude-to-radius calibration table
- Gleason longitude orientation: Greenwich right, 90°E up
- Search and select countries and capitals
- Flat-plane straight-line measurement
- Full-screen map mode with automatic canvas resizing
- Nominal scale indicator
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

- Country and Antarctica outlines: [Natural Earth 1:110m Admin 0](https://github.com/nvkelso/natural-earth-vector).
- Capital coordinates: [country-data](https://github.com/iliyaj/country-data), `data/country-capital.csv`.
- Historical scan: [Boston Public Library / Digital Commonwealth](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z), item `commonwealth:7h149v867`.

## Important limitations

- Natural Earth 1:110m geometry is generalized, not a high-resolution coastline survey.
- Radial exponent settings are alternate drawing conventions; `p = 1` is the equal-radial-spacing default used for the historical comparison.
- The historical scan is a printed sheet, not an automatically georeferenced overlay. Crop and alignment controls are manual; use it for visual comparison rather than as a surveyed reference.
- Nominal map distances describe the selected drawing convention. They do not independently establish physical distances.
- Seam-crossing and high-latitude polygon topology still deserves visual review against higher-resolution data.
