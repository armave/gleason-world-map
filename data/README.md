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

The browser loads only the selected country-quality file, the small capital JSON, and the compact U.S. county-equivalent search index. It decompresses the selected boundaries with the native browser `DecompressionStream` API. Normal HTTP caching is used for repeat visits.


## U.S. county-equivalent label points

`us-counties.json` contains 3,222 five-digit GEOID records from the U.S. Census Bureau's 2026 National Counties Gazetteer. Each row stores GEOID, USPS state/territory code, Census name, and Gazetteer internal-point latitude/longitude. These are local county search records used only for search results. They are not rendered as county boundaries on the map. The Gazetteer file covers the 50 states, the District of Columbia, and Puerto Rico; the separately published Island Areas are not included. The source is a U.S. government public-domain dataset.

Source ZIP: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip

To regenerate the compact file from the extracted Census text file, run `node scripts/vendor-county-labels.mjs --source-file 2026_Gaz_counties_national.txt`.


## Coastlines and islands

`coastlines-50m.json` contains 1:50m Natural Earth physical coastlines as compact MultiLineString geometry. It is separate from country boundaries so coastlines and island shorelines can be emphasized without making every international border equally heavy. The linework is generated from the same pinned Natural Earth commit recorded in `data/metadata.json`; Natural Earth data is public domain.

The app bundles this file locally and builds the projected coastline path once per canvas resize. When 1:10m high-quality country boundaries are selected and the view reaches close regional detail, the medium-resolution coastline overlay is suppressed so it does not conflict with the more detailed country outlines.

Run `npm run vendor:data` to regenerate the coastline file and its checksum alongside the boundary and capital datasets.
