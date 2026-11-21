# Bundled geographic data

These files are vendored into this repository so the deployed map does not need to contact external geographic-data hosts at runtime.

## Country boundaries

The compressed GeoJSON files in `countries/` contain Natural Earth Admin 0 country boundaries:

- `low.geojson.gz`: 1:110m, fastest and least detailed
- `medium.geojson.gz`: 1:50m, balanced default
- `high.geojson.gz`: 1:10m, most detailed

Natural Earth is public-domain data. The original source repository and exact pinned source commit are recorded in `metadata.json`. The vendor script retains the identifiers, country names, label coordinates, and original geometry used by the app. It does not simplify or alter the coordinate arrays.

## Capital coordinates

`capitals.json` contains ISO alpha-3 code, capital name, latitude, and longitude. It is generated from the pinned `country-capital.csv` in [iliyaj/country-data](https://github.com/iliyaj/country-data), whose README identifies REST Countries v3.1 as the underlying source. Its upstream MIT license is copied to `capital-data-LICENSE.txt`.

## Refreshing the data

Run from the repository root using Node.js 20 or newer:

```bash
npm run vendor:data
```

The script downloads from pinned Git commits, validates all three boundary sets and the capital list, writes compressed files, and records source commits and SHA-256 checksums in `metadata.json`.

The browser loads only the selected country-quality file and the small capital JSON. It decompresses the selected boundaries with the native browser `DecompressionStream` API. Normal HTTP caching is used for repeat visits.
