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

The browser loads only the selected country-quality file, the small capital JSON, the compact U.S. county-equivalent label index, and the local compressed county-boundary file. It decompresses the selected boundaries with the native browser `DecompressionStream` API. Normal HTTP caching is used for repeat visits.


## U.S. county-equivalent label points

`us-counties.json` contains 3,222 five-digit GEOID records from the U.S. Census Bureau's 2026 National Counties Gazetteer. Each row stores GEOID, USPS state/territory code, Census name, and Gazetteer internal-point latitude/longitude. These are local county search records. They are not used to position map labels. The map uses the separate local polygon bundle described below. The Gazetteer file covers the 50 states, the District of Columbia, and Puerto Rico; the separately published Island Areas are not included. The source is a U.S. government public-domain dataset.

Source ZIP: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip

To regenerate the compact file from the extracted Census text file, run `node scripts/vendor-county-labels.mjs --source-file 2026_Gaz_counties_national.txt`.


## U.S. county-equivalent map polygons

County outlines and map-label anchor points are bundled in `us-counties-boundaries.geojson.gz`. Generate or refresh it with `npm run vendor:county-boundaries`. The script downloads the U.S. Census Bureau's TIGERweb REST service, **TIGERweb/tigerWMS_ACS2026, MapServer layer 82 (Counties)**, which identifies this layer as the January 1, 2026 vintage. It downloads all pages of GEOID, state FIPS, county name, Census internal-point coordinates, and Polygon/MultiPolygon geometry in longitude/latitude, with a 0.0002-degree generalization tolerance. The compressed bundle is committed to the repository and served locally.

Service layer: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2026/MapServer/82

Labels use the internal point supplied with the same feature and are checked against that feature's polygon, including holes and multipart geometry. The label's full text box must also fit inside the polygon at the current zoom; otherwise the label is suppressed. At runtime, both county geometry and Gazetteer search records are local repository files. The Census service is contacted only when running the vendor script, not by the deployed map.
