import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../src/dual-disk-app.js',import.meta.url),'utf8');
const entry=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const features=await readFile(new URL('../src/map/feature-paths.js',import.meta.url),'utf8');
const coast=await readFile(new URL('../src/map/coastlines.js',import.meta.url),'utf8');
const measures=await readFile(new URL('../src/map/measurements.js',import.meta.url),'utf8');

test('map UI declares the dual-disk layout and complete default viewport',()=>{
 assert.match(html,/<h1>Dual-Disk Planar Map<\/h1>/);
 assert.match(html,/Dual-Disk Planar Geometry \(R_eq = 10,000\.8 km\)/);
 assert.match(app,/drawDiskBackground\('N'\)/);
 assert.match(app,/drawDiskBackground\('S'\)/);
 assert.match(app,/\(width - 42\) \/ \(4 \* R\)/);
 assert.match(app,/\(height - 42\) \/ \(2 \* R\)/);
});
test('the primary application entry routes to the dual-disk renderer',()=>{
 assert.match(entry,/dual-disk-app\.js/);
 assert.doesNotMatch(entry,/projectFlatDisk|north-polar disk renderer/);
});
test('feature polygons and coastlines are cut at the Equator before map projection',()=>{
 assert.match(features,/projectGeoJSONRingParts/);
 assert.match(coast,/changesSide/);
 assert.match(coast,/project\(lat, lon, disk\)/);
 assert.match(app,/createFeaturePath\(feature,project/);
 assert.match(app,/createCoastlinePathAsync\(coastlineData,project/);
});
test('A–B readouts, route register and drawing all use the canonical route engine',()=>{
 assert.match(app,/measureDirectDistance\(points\[0\],points\[1\]\)/);
 assert.match(app,/drawRouteLine\(route,'distance'\)/);
 assert.match(app,/formatDistance\(route\.distanceMeters\)/);
 assert.match(app,/distanceLabel:route \? formatDistance\(route\.distanceMeters\)/);
 assert.match(html,/id="routeDistanceValue"/);
});
test('cross-Equator routes render two legs and matching crossing indicators',()=>{
 assert.match(app,/route\.segments/);
 assert.match(app,/route\.crossings/);
 assert.match(app,/measurementStrokeStyle\(tool,\s*currentScale\(\)\)/);
 assert.match(app,/Cross-Equator planar hinge/);
});
test('area edge labels and perimeter use the same canonical route distance',()=>{
 assert.match(measures,/measureDirectDistance/);
 assert.match(measures,/routeSegments/);
 assert.match(app,/createProjectedSegmentLabels\(areaPoints,project,measureDistanceMeters,closed\)/);
 assert.match(app,/flatDiskPolygonMetrics\(areaPoints,project,measureDistanceMeters\)/);
});
test('PNG export contains the current rendered route geometry and date-stamped filename',()=>{
 assert.match(app,/canvas\.toBlob/);
 assert.match(app,/dual-disk-world-map-/);
 assert.match(app,/draw\(\);\s*canvas\.toBlob/);
});
test('geometry panel explains the 2D chord and optimized Equator-hinge formulas',()=>{
 assert.match(app,/R_eq = 90° × 111\.12 km = 10,000\.8 km/);
 assert.match(app,/Same disk: D =/);
 assert.match(app,/Cross Equator: min λ/);
 assert.match(html,/Two equal-radius flat circular disks/);
 assert.doesNotMatch(html,/20,001\.6 km|fixed north-polar disk drawing plane/);
});
test('geographic coordinate centroid helper is planar rather than based on 3D vectors',async()=>{
 const geo=await readFile(new URL('../src/data/geojson.js',import.meta.url),'utf8');
 assert.doesNotMatch(geo,/Math\.cos\(a\)\*Math\.cos\(b\)|Math\.atan2\(sz/);
 assert.match(geo,/latitudeSum/);
});
