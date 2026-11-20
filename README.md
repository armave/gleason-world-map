# Flat Disk World Map

An interactive two-dimensional circular disk map with a transparent radial latitude convention, country and capital lookup, flat-plane measurement, and full-screen viewing.

## Flat-disk model

The app draws a **2D disk**, not a 3D globe or sphere.

Its default layout places 90°N at the center and 90°S at the outer rim, using this chosen display convention:

`r / R = (90° - latitude) / 180°`

Longitude determines the radial direction. This is a configurable mathematical layout applied to the latitude/longitude attributes in the source data. It should not be mistaken for independent evidence that the Earth physically has this shape.

The measurement tool draws and measures straight lines in the flat map plane. Its "map km" values use a nominal radius of 6,371 units to provide a consistent display scale. They are **not** geodesic measurements or independently surveyed physical distances.

## Features

- 2D circular flat-disk layout
- Search and select countries and capitals
- Flat-plane straight-line measurement
- Full-screen map mode with automatic canvas resizing
- Nominal scale indicator
- Toggle country outlines, grid, capital markers, capital names, and Antarctica
- Export the map as PNG
- Share links preserving zoom, pan, layer choices, and measurement endpoints
- Retriable data loading, browser cache fallback, and explicit retry button
- Polygon edge densification and even-odd rendering for polygon holes

## Run locally

Run a static web server from the repository root:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. First load requires internet access for the source datasets; successful downloads are cached in browser storage where available.

## Deploy with GitHub Pages

1. Open **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**.
4. Save.

Expected URL: `https://armave.github.io/gleason-world-map/`

## Data sources

- Country and Antarctica outlines: [Natural Earth 1:110m Admin 0](https://github.com/nvkelso/natural-earth-vector).
- Capital coordinates: [country-data](https://github.com/iliyaj/country-data), `data/country-capital.csv`.

## Important limitations

- Natural Earth 1:110m geometry is generalized rather than a high-resolution coastline survey.
- The radial latitude rule is a chosen flat-map convention. Other flat layouts can use different rules.
- Nominal map distances describe the selected drawing convention; they do not prove physical distances on an actual flat Earth.
- Seam-crossing and high-latitude polygon topology still deserves visual review against higher-resolution data.
