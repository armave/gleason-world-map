# Dual-Disk Planar World Map

[View Online](https://armave.github.io/gleason-world-map/)

An interactive, entirely two-dimensional map composed of two equal-radius circular disks hinged at the Equator. The Northern Disk is centred on the North Pole; the Southern Disk is centred on the South Pole. The application uses one projection function for geographic features, map annotations, measurement endpoints, area outlines, route connectors and exports.

## Dual-disk geometry

The Equator radius is fixed by the requested planar scale:

\[
R_{eq}=90\times111.12=10{,}000.8\ \text{km}
\]

For latitude \(\phi\) and longitude \(\lambda\), project(lat, lon) returns { x, y, disk }, with coordinates in kilometres.

Northern Disk, for \(\phi\ge0\), centred at \((-R_{eq},0)\):

\[
r_N=(90-\phi)\times111.12
\]
\[
x_N=-R_{eq}+r_N\cos\lambda,\qquad y_N=r_N\sin\lambda
\]

Southern Disk, for \(\phi<0\), centred at \((+R_{eq},0)\):

\[
r_S=(90+\phi)\times111.12
\]
\[
x_S=+R_{eq}-r_S\cos\lambda,\qquad y_S=r_S\sin\lambda
\]

The two disks have the same radius. The North Pole and South Pole are their respective centres. At Greenwich, the two Equator rim points coincide at the hinge point \((0,0)\). Longitude orientation in the Southern Disk is mirrored in x, as specified.

## Planar distance engine

For endpoints on the same disk, distance is the Euclidean chord:

\[
D=\sqrt{(x_B-x_A)^2+(y_B-y_A)^2}
\]

For endpoints on opposite disks, the engine searches the matching Equator longitude \(\lambda_{eq}\) that minimizes the sum of the two planar legs:

\[
D=\min_{\lambda_{eq}\in[-180^\circ,180^\circ]}
\left(
\lVert A-E_N(\lambda_{eq})\rVert+
\lVert E_S(\lambda_{eq})-B\rVert
\right)
\]

The minimizer is found with 72 coarse intervals followed by golden-section refinement. The output contains the canonical distance, one or two straight route segments, both seam markers and the selected crossing longitude. The distance readout, connector pill, Route Register, area-edge labels and PNG rendering use this same route result.

## Equator clipping and map layers

GeoJSON polygon rings are clipped into separate Northern and Southern fragments at latitude zero before projection. Coastline polylines that cross the Equator are split at an interpolated crossing and the crossing point is projected separately onto each disk. The renderer uses the common projection for country borders, islands, coastlines, Antarctica, latitude rings, meridian lines, capital markers, country/capital labels, route endpoints and area vertices.

The initial viewport fits the complete side-by-side bounds: four Equator radii wide and two radii high. Pan, zoom and rotation are display transforms applied after projection.

## Benchmark compatibility note

The geometry above is a precise specification, but it does not make all five requested approximate real-world distance targets mathematically compatible with the specified Euclidean rules. Tests preserve the exact output rather than apply hidden scale factors or route-specific corrections:

| Route | Dual-disk planar result | Requested reference |
|---|---:|---:|
| Moscow–Bamako | 6,525.8 km | ~6,320 km |
| Montevideo–Pretoria | 8,946.8 km | ~7,580 km |
| Santiago–Canberra | 11,627.3 km | ~11,340 km |
| Windhoek–Canberra | 12,416.5 km | ~12,250 km |
| Washington, D.C.–Canberra | 18,092.0 km | ~15,960 km |

Three examples fall within 5% of the supplied reference; Montevideo–Pretoria and Washington–Canberra do not. In particular, Montevideo–Pretoria is a same-disk route, so the requested same-disk Euclidean chord cannot be adjusted by changing the Equator optimizer. Passing all five targets would require changing at least one of the stated projection or distance rules. The application does not claim these planar values are independently verified ground distances.

## Data and implementation

The interface uses Lit web components and Vite; the map is drawn on Canvas 2D.

- Country boundaries and coastlines: Natural Earth
- Capital coordinates: bundled country/capital reference dataset
- U.S. county-equivalent search points: 2026 U.S. Census Gazetteer
- Antarctic boundary: bundled Natural Earth Antarctica feature; its border is drawn on the Southern Disk

The retired multi-anchor fitting experiment is isolated in src/core/legacy-flat-disk.js and is not imported by the map renderer or active distance engine.

## Run locally

Use Node.js 20.19+ or 22.12+.

    npm install
    npm run dev
    npm test
    npm run build

For browser tests:

    npx playwright install chromium
    npm run test:e2e

## Project structure

    src/
      app.js                      entry shim
      dual-disk-app.js            dual-disk canvas renderer and interactions
      core/
        dual-disk.js              single projection, clipping, planar areas and route geometry
        measurement-engine.js     canonical distance API
        flat-disk.js              public re-exports of the dual-disk core
        legacy-flat-disk.js       isolated research baseline only
      data/                       bundled map and reference datasets
      map/
        coastlines.js              Equator-split coastline projection
        feature-paths.js           Equator-clipped polygon paths
        measurements.js            canonical route segments and edge labels
      ui/
        calibration.js             dual-disk geometry panel
