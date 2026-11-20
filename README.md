# Flat Disk World Map

An interactive two-dimensional circular disk map with configurable radial latitude spacing, searchable geographic reference data, straight-line disk measurement, full-screen viewing, and a comparison overlay of Alexander Gleason's 1892 map.

## Flat-disk model

The app draws a **2D disk**, not a 3D globe or sphere.

Its default layout places 90°N at the centre and 90°S at the outer rim, using the equal-radial-spacing convention:

`r / R = ((90° - latitude) / 180°)^p`

The default is `p = 1`, which places latitude bands at equal radial intervals, matching the evenly spaced latitude circles described for Gleason's 1892 layout. The exponent can be adjusted from 0.50 to 2.00 using presets or the custom slider. The displayed radius table updates with the selected setting.

All coastlines, latitude rings, map clicks, and measurement endpoints use the same selected radial rule. Measurements are straight-line distances in the displayed disk plane, expressed as nominal map units using the configured reference radius. They are **not** great-circle or independently surveyed physical distances.

This is a transparent configurable map convention applied to latitude/longitude reference data. It is not, by itself, evidence for a physical model of the Earth.

## Historical Gleason overlay

The optional overlay loads the 1892 map scan held by the Boston Public Library's Norman B. Leventhal Map & Education Center through the Digital Commonwealth IIIF image service.

- Toggle the historical scan on or off.
- Adjust opacity to compare the engraved coastlines and borders against the current digital layers.
- Adjust scan crop centre, crop diameter, overlay scale, and rotation to align the original circular disk with the modern drawing.
- Reset the overlay alignment or reload the scan.
- Shared links preserve the radial exponent and overlay settings.

The scan contains the original sheet around the circular map, so the crop defaults are starting values, not a claim of automatic registration. Fine adjustment may be required depending on source image dimensions and scan presentation.

Source record: [Gleason's New Standard Map of the World, 1892 — Boston Public Library](https://ark.digitalcommonwealth.org/ark:/50959/7h149v85z). Image identifier: `commonwealth:7h149v867`. The catalogue reports **no known copyright restrictions**. The scan is loaded on demand from the public IIIF image service.

## Features

- 2D circular flat-disk layout
- Adjustable linear, compressed, expanded, and custom radial latitude spacing
- Live latitude-to-radius calibration table
- Search and select countries and capitals
- Flat-plane straight-line measurement
- Full-screen map mode with automatic canvas resizing
- Nominal scale indicator
- Toggle country outlines, grid, capital markers, capital names, and Antarctica
- Optional historical 1892 Gleason scan overlay with manual crop and alignment controls
- Export the map as PNG
- Share links preserving zoom, pan, layers, calibration exponent, overlay settings, and measurement endpoints
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

## Other data sources

- Country and Antarctica outlines: [Natural Earth 1:110m Admin 0](https://github.com/nvkelso/natural-earth-vector).
- Capital coordinates: [country-data](https://github.com/iliyaj/country-data), `data/country-capital.csv`.

## Important limitations

- Natural Earth 1:110m geometry is generalized rather than a high-resolution coastline survey.
- Radial exponent settings are alternate drawing conventions; only `p = 1` is the equal-radial-spacing default used for the historical comparison.
- The historical scan is not automatically georeferenced. Its crop and alignment controls are manual; compare the scan against modern lines as an overlay, not as a precisely fitted survey.
- Nominal map distances describe the selected drawing convention; they do not establish physical distances on an actual flat Earth.
- Seam-crossing and high-latitude polygon topology still deserves visual review against higher-resolution data.
