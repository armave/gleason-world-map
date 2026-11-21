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

The browser loads only the selected country-quality file, the small capital JSON, and the compact U.S. county-equivalent label index. It decompresses the selected boundaries with the native browser `DecompressionStream` API. Normal HTTP caching is used for repeat visits.


## U.S. county-equivalent label points

`us-counties.json` contains 3,222 five-digit GEOID records from the U.S. Census Bureau's 2026 National Counties Gazetteer. Each row stores GEOID, USPS state/territory code, Census name, and Gazetteer internal-point latitude/longitude. These are county search records and the offline fallback when the live boundary service is unavailable. They are not used to position map labels. For map rendering, the app loads official 2026 county-equivalent polygons and their matching internal points from the Census TIGERweb Counties layer described below. The Gazetteer file covers the 50 states, the District of Columbia, and Puerto Rico; the separately published Island Areas are not included. The source is a U.S. government public-domain dataset.

Source ZIP: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip

To regenerate the compact file from the extracted Census text file, run `node scripts/vendor-county-labels.mjs --source-file 2026_Gaz_counties_national.txt`.


## U.S. county-equivalent map polygons

County outlines and map-label anchor points are loaded from the U.S. Census Bureau's TIGERweb REST service, **TIGERweb/tigerWMS_ACS2026, MapServer layer 82 (Counties)**. The service identifies this layer as the January 1, 2026 vintage and supports GeoJSON feature queries. The app requests GEOID, state FIPS, county name, Census internal-point coordinates, and polygon geometry in longitude/latitude; geometry is generalized to a 0.002-degree maximum allowable offset for display performance.

Service layer: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2026/MapServer/82

Labels use the internal point supplied with the same feature and are checked against that feature's polygon, including holes and multipart geometry. The label's full text box must also fit inside the polygon at the current zoom; otherwise the label is suppressed. County polygons are cached by the browser's normal HTTP cache. If the Census service is unavailable, county search remains available from the bundled Gazetteer records, but county map labels and outlines are hidden rather than drawn at unverified positions.
