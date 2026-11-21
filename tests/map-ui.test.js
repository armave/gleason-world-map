import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const coastlines = await readFile(new URL('../src/map/coastlines.js', import.meta.url), 'utf8');
const iceWall = await readFile(new URL('../src/map/ice-wall.js', import.meta.url), 'utf8');
const oceanLabels = await readFile(new URL('../src/map/ocean-labels.js', import.meta.url), 'utf8');

test('map viewport starts with an accessible loading veil and retry control', () => {
  assert.match(html, /class="map-viewport" id="mapViewport" aria-busy="true"/);
  assert.match(html, /id="mapLoading" role="status" aria-live="polite"/);
  assert.match(html, /id="mapLoadingSpinner"/);
  assert.match(html, /id="mapLoadingMessage"/);
  assert.match(html, /id="retryMapLoading"[^>]*hidden/);
});

test('map layers expose country names and no U.S. county boundary overlay', () => {
  assert.match(html, /id="layerCountryNames" checked/);
  assert.match(html, /Country names \(16,000–500 km\)/);
  assert.doesNotMatch(html, /layerCountyNames|countyLayerStatus|U\.S\. county boundaries/);
  assert.match(app, /function drawCountryLabels\(\)/);
  assert.match(app, /drawCapitals\(\);drawCountryLabels\(\);/);
  assert.doesNotMatch(app, /drawCountyBoundaries|drawCountyLabels|loadCountyBoundaryDataset/);
});

test('loading veil is shown during startup/reload and replaced with an actionable error on failure', () => {
  assert.match(app, /setMapLoading\(true,/);
  assert.match(app, /setMapLoading\(false\)/);
  assert.match(app, /function showLoadError\(err\)/);
  assert.match(app, /retryMapLoading/);
  assert.match(app, /layers\.countryNames/);
});

test('zoom is capped at a 50 km local scale-bar reading for every input path', () => {
  assert.match(app, /MAX_SCALE_BAR_READING_KM=50/);
  assert.match(app, /function maxZoomForAnchor\(/);
  assert.match(app, /function clampZoom\(/);
  assert.match(app, /setZoomAtViewCenter\(zoom\*1\.25\)/);
  assert.match(app, /const restoredCenter=unrotatePoint\(-panX\/zoom,-panY\/zoom,rotationRadians\(\)\),restoredZoom=clampZoom\(zoom,restoredCenter\)/);
  assert.match(app, /safe=clampZoom\(nz,anchor\)/);
  assert.doesNotMatch(app, /const MIN_ZOOM=1,MAX_ZOOM=20000/);
});

test('capital labels grow in close-up views and collision boxes track their size', () => {
  assert.match(app, /labelFontSize=Math\.min\(16,10\+2\*Math\.log2\(Math\.max\(1,zoom\)\)\)/);
  assert.match(app, /const a=rotationRadians\(\),center=worldToScreen/);
  assert.match(app, /item\.labelFontSize\/zoom/);
  assert.match(html, /Capital names \(from 2,500 km\)/);
});

test('ocean surface is blue, ocean and sea names are a toggleable shareable layer, and ice wall is white',()=>{
 assert.match(app,/ctx\.fillStyle=visualPalette\.water/);
 assert.match(app,/if\(layers\.oceanLabels\)\{/);
 assert.match(app,/selectNonOverlappingLabels,\s*isLand:/);
 assert.match(app,/layers\.oceanLabels,layers\.coastlines\].map\(v=>v\?'1':'0'\)/);
 assert.match(html,/id="layerOceanLabels" checked/);
 assert.match(html,/Ocean &amp; sea names|Ocean & sea names/);
 assert.match(oceanLabels,/NORTH PACIFIC OCEAN/);
 assert.match(oceanLabels,/INDIAN OCEAN/);
 assert.match(oceanLabels,/MEDITERRANEAN SEA/);
 assert.match(oceanLabels,/SOUTH CHINA SEA/);
 assert.match(iceWall,/ctx\.fillStyle='#ffffff'/);
});

test('coastline and island shoreline layer is independent and shareable',()=>{
 assert.match(html,/id="layerCoastlines" checked/);
 assert.match(app,/layers\.coastlines/);
 assert.match(app,/drawCoastlinesLayer\(\)/);
 assert.match(app,/layers\.coastlines\].map\(v=>v\?'1':'0'\)/);
 assert.match(coastlines,/createCoastlinePath/);
});
test('ocean labels are curved, scale-aware, water-aware and collision-filtered',()=>{
 assert.match(oceanLabels,/NORTH SEA/);
 assert.match(oceanLabels,/MOZAMBIQUE CHANNEL/);
 assert.match(oceanLabels,/WEDDELL SEA/);
 assert.match(oceanLabels,/selectNonOverlappingLabels/);
 assert.match(oceanLabels,/isLand/);
 assert.match(oceanLabels,/glyph\.rotation/);
 assert.match(app,/labelCollisionBoxes\.push\(\.\.\.visible\.map/);
});

test('Antarctic ice wall has layered edges, strata, crevasses and repeated rim labels',()=>{
 assert.match(iceWall,/fillStyle='#ffffff'/);
 assert.match(iceWall,/ICE_RIDGE_COUNT=180/);
 assert.match(iceWall,/ICE_CREVASSE_COUNT=42/);
 assert.match(iceWall,/ICE_WALL_LABEL_COUNT=8/);
 assert.match(iceWall,/ctx\.clip\(antarcticaPath,'evenodd'\)/);
});

test('water label land detection uses one prebuilt land mask including Antarctica',()=>{
 assert.match(app,/landMaskPath=new Path2D\(\)/);
 assert.match(app,/landMaskPath\.addPath\(antarcticaPath\)/);
 assert.match(app,/ctx\.isPointInPath\(landMaskPath,x,y,'evenodd'\)/);
});

test('visual presets are selectable, remembered and keep the flat-disk projection independent',()=>{
 assert.match(html,/id="mapStyle"/);assert.match(html,/1892 Vintage/);assert.match(html,/Classic Atlas/);assert.match(html,/Clean Explorer/);
 assert.match(app,/STYLE_STORAGE_KEY/);assert.match(app,/applyVisualStyle/);assert.match(app,/projectFlatDisk\(lon,lat,baseR\)/);assert.match(app,/flatDiskDistanceMeters/);
});
test('map orientation is display-only, pointer-safe and included in share links',()=>{
 assert.match(html,/id="mapRotation"/);assert.match(html,/id="rotateLeft"/);assert.match(html,/id="rotateRight"/);
 assert.match(app,/ctx\.rotate\(rotationRadians\(\)\)/);assert.match(app,/screenToWorldPoint/);
 assert.match(app,/url\.searchParams\.set\('r',rotationDegrees\.toFixed\(1\)\)/);assert.match(app,/url\.searchParams\.set\('style',visualStyle\)/);
 assert.match(app,/pointerDown\.rotate/);assert.match(app,/panForWorldCenterPoint/);
});
test('latitude grid includes intermediate parallels, an emphasized equator, longitude ticks and compass rose',()=>{
 assert.match(app,/latitudes=\[75,60,45,30,15,0,-15,-30,-45,-60,-75\]/);assert.match(app,/visualPalette\.equator/);
 assert.match(app,/function drawCompassRose\(\)/);assert.match(app,/for\(let d=0;d<360;d\+=5\)/);
});
