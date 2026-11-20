# Flat Disk World Map

An interactive two-dimensional circular world map, with a configurable radial latitude convention, Natural Earth reference outlines, searchable capitals, flat-canvas measurements, and a fullscreen view.

## Mapping model

The app renders a **2D flat disk**. It does not draw a globe, a sphere, perspective, or a 3D object.

The default radial convention places 90°N at the center and 90°S at the rim:

`r / R = (90° - latitude) / 180°`

This is a configurable cartographic convention applied to longitude/latitude data. The base geographic outlines and capital coordinates are still sourced from Natural Earth and country-data; changing the display model does not independently prove a physical model of Earth.

Distances shown by the measurement tool are straight-line distances between plotted points on the flat disk using the app's nominal radial scale. They are **not** great-circle distances and should not be interpreted as independently surveyed physical distances.

## Features

- 2D circular disk layout; no globe visualization
- Country selection and searchable capital-city locations
- Flat-canvas straight-line measurement between two selected coordinates
- Full-screen map mode, with automatic canvas resize on entry and exit
- Dynamic scale indicator labelled as a nominal map scale
- Independent layer toggles for country outlines, grid, capital markers, capital names, and Antarctica
- PNG export and shareable URLs preserving view, layer visibility, and measurement endpoints
- Dataset retry, browser cache fallback, and a retry action on load failure
- Projected polygon edge densification, longitude seam unwrapping, and even-odd polygon fills

## Run locally

Serve the repository root with a static web server:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in a modern browser. First load requires an internet connection for the source datasets; successful responses are cached in browser storage when available.

## Deploy with GitHub Pages

1. Open **Settings → Pages**.
2. Set **Build and deployment → Source** to **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**.
4. Save.

Expected site URL:

`https://armave.github.io/gleason-world-map/`

## Data sources

- Country and Antarctica boundary features: [Natural Earth 1:110m Admin 0](https://github.com/nvkelso/natural-earth-vector).
- Capital coordinates: [country-data](https://github.com/iliyaj/country-data), `data/country-capital.csv`.

## Known limitations

- Natural Earth 1:110m geometry is generalized; it is not a detailed coastline survey.
- This radial convention is a display choice. Other flat maps can use different latitude-to-radius rules.
- Polygon edge densification reduces coarse projected chords, but does not fully resolve every topology edge case. Seam-crossing polygons should be visually checked at high latitudes and around the dateline.
- Nominal scale values describe the selected map convention, not an independently measured Earth scale.
