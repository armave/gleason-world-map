# Scale-Calibrated Gleason World Map

An interactive North-Polar azimuthal-equidistant map with searchable countries and capitals, geographic distance measurement, and an Antarctica coastline layer.

## Features

- Natural Earth country outlines with country selection and capital markers
- Searchable countries and capital cities
- Two-point great-circle measurement with a numerically stable haversine calculation
- North-Polar azimuthal-equidistant projection, latitude rings, and 15-degree meridians
- Dynamic scale bar showing **radial** distance scale
- Independent visibility controls for countries, grid, capitals, capital names, and the Antarctica / ice-wall layer
- PNG export and shareable URLs that preserve zoom, pan, layer visibility, and measurement points
- Geographic polygon paths densified before projection, with shortest-longitude handling at the antimeridian and even-odd polygon filling for holes
- Dataset fetch retries, browser storage cache, and cached-data fallback when the network is unavailable after a successful load

## Run locally

Serve the repository root with a local static web server, then open the displayed local URL. For example:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in a modern browser. The first load requires internet access to retrieve the geographic datasets. Successful responses are cached in browser storage where available; cached copies can be used on a later load if the data sources are temporarily unavailable.

## Deploy with GitHub Pages

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**, then save.
4. GitHub Pages will publish the root `index.html`.

For this repository, the expected site URL is:

`https://armave.github.io/gleason-world-map/`

## Geographic data sources

- Country boundaries: [Natural Earth](https://www.naturalearthdata.com/) 1:110m administrative boundaries, distributed through [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector).
- Antarctica boundary: the Antarctica feature from the same Natural Earth dataset.
- Capital coordinates: [country-data](https://github.com/iliyaj/country-data), `data/country-capital.csv`.

The app fetches these datasets at runtime from their public GitHub raw-file URLs and caches the text locally in the browser when storage is available.

## Projection and measurement notes

The map uses the North-Polar azimuthal-equidistant projection:

- Radial distance from the North Pole is represented at true scale.
- East-west scale distortion increases with angular distance from the North Pole.
- The scale bar therefore describes radial scale; it is not a universal local scale bar in every direction.
- Pairwise measurements are calculated from latitude and longitude on a sphere with mean radius **6,371 km**. They are not calculated from screen pixels and are not an ellipsoidal WGS84 geodesic.

Polygon rings are drawn using even-odd filling so interior holes are retained. The map densifies long geographic edges and unwraps longitude steps across the ±180° seam before projection. As with any generalized 1:110m dataset, small islands and detailed coastlines are simplified.
