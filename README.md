# Scale-Calibrated Gleason World Map

An interactive North-Polar azimuthal-equidistant map with country outlines, capital-city search, map navigation, and great-circle distance measurement.

## Features

- Country outlines and country selection
- Searchable capital cities
- Two-endpoint distance measurement (map clicks or search results)
- Great-circle distance calculated on a sphere using the haversine-equivalent central-angle formula
- North-Polar azimuthal-equidistant map layout, latitude rings, and 15-degree meridians
- Zoom and pan controls

## Run locally

Open `index.html` in a modern browser. An internet connection is needed to load the geographic datasets.

## Deploy with GitHub Pages

1. Create a **public** GitHub repository named `gleason-world-map` (or another name you prefer) and initialize it with a README.
2. Upload the contents of this project to the repository root.
3. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. The included workflow deploys the site on each push to `main` or `master`.

The expected URL for a repository named `gleason-world-map` under the `armave` account is:

`https://armave.github.io/gleason-world-map/`

## Geographic data sources

- Country boundaries: [Natural Earth](https://www.naturalearthdata.com/) 1:110m administrative boundaries, distributed through [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector).
- Country capitals and coordinates: [country-data](https://github.com/iliyaj/country-data) `data/country-capital.csv`.

The browser fetches these data sources at runtime. The site itself does not proxy or host those datasets.

## Measurement note

Distances are calculated from the selected geographic coordinates on a sphere of radius 6,371 km. They are not measured as straight-line pixel distances on the projected map. The azimuthal-equidistant projection preserves radial distances from the North Pole but does not preserve all pairwise distances or areas.
