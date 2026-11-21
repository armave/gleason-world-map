import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const featurePaths = await readFile(new URL('../src/map/feature-paths.js', import.meta.url), 'utf8');
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
  assert.match(app, /labelX=x\+4\/zoom,labelY=y-3\/zoom,labelScreen=worldToScreen/);
  assert.match(app, /box:\{left:labelScreen\.x-2,top:labelScreen\.y-labelFontSize\/2-2/);
  assert.match(app, /ctx\.rotate\(screenUprightRotation\(0,rotationRadians\(\)\)\)/);
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

test('ocean and Antarctic rim labels keep left-to-right reading direction through map rotation',()=>{
 assert.match(oceanLabels,/screenReadingDirection\(theta,viewport\.rotation\)/);
 assert.match(oceanLabels,/uprightTextAngle\(localTangent\+viewport\.rotation\)/);
 assert.match(oceanLabels,/screenTangent-viewport\.rotation/);
 assert.match(iceWall,/screenReadingDirection\(theta,mapRotation\)/);
 assert.match(iceWall,/uprightTextAngle\(localTangent\+mapRotation\)/);
});
test('coordinate annotations reserve collision space and the compass remains screen-anchored',()=>{
 assert.match(app,/function reserveScreenUiCollisionBoxes\(\)/);
 assert.match(app,/right:62,bottom:62/);
 assert.match(app,/dockRect\.left-canvasRect\.left/);
 assert.match(app,/function drawUprightMapText[\s\S]*?labelCollisionBoxes\.push\(box\)/);
 assert.match(app,/if\(layers\.grid\)drawAnnotations\(\);[\s\S]*?drawCapitals\(\);drawCountryLabels\(\)/);
 assert.match(app,/const cx=31,cy=31,r=14,angle=rotationRadians\(\)/);
});
test('switching measurement tools clears distance and area drawings',()=>{
 assert.match(app,/function clearMeasurementDrawings\(\)\{\s*points=\[\];areaPoints=\[\];areaFinished=false;\s*updateMeasurement\(\);updateAreaMeasurement\(\);draw\(\);/);
 assert.match(app,/if\(mode!=='explore'\)clearMeasurementDrawings\(\)/);
 assert.match(app,/if\(mode!=='measure'\)clearMeasurementDrawings\(\)/);
 assert.match(app,/if\(mode!=='area'\)clearMeasurementDrawings\(\)/);
});
test('measurement mode buttons expose a strong pressed state and actions reflect availability',()=>{
 assert.match(html,/id="exploreMode" class="active"[^>]*aria-pressed="true"/);
 assert.match(html,/id="measureMode"[^>]*aria-pressed="false"/);
 assert.match(app,/button\.setAttribute\('aria-pressed',String\(active\)\)/);
 assert.match(app,/measurementTools'\)\.dataset\.activeMode=mode/);
 assert.match(styles,/\.map-measure-tools \.map-measure-modes button\[aria-pressed="true"\]/);
 assert.match(styles,/button\[aria-pressed="false"\]:hover/);
 assert.match(app,/function syncMeasurementActionButtons\(\)/);
 assert.match(app,/\$\('finishArea'\)\.disabled=areaPoints\.length<3\|\|areaFinished/);
 assert.match(app,/\$\('undoArea'\)\.disabled=areaPoints\.length===0/);
});
test('water label land detection uses one prebuilt land mask including Antarctica',()=>{
 assert.match(app,/landMaskPath=new Path2D\(\)/);
 assert.match(app,/landMaskPath\.addPath\(antarcticaPath\)/);
 assert.match(app,/ctx\.isPointInPath\(landMaskPath,x,y,'evenodd'\)/);
});

test('visual presets are selectable, remembered and keep the flat-disk projection independent',()=>{
 assert.match(html,/id="mapStyle"/);assert.match(html,/1892 Vintage/);assert.match(html,/Classic Atlas/);assert.match(html,/Clean Explorer/);
 assert.match(app,/STYLE_STORAGE_KEY/);assert.match(app,/applyVisualStyle/);assert.match(app,/projectFlatDisk\(lon,lat,baseR\)/);assert.match(app,/measureDirectDistance/);assert.match(app,/flatDiskLinePath/);assert.doesNotMatch(app,/geodesicLinePath/);
});
test('country-area calculations share rendered rings and preserve the Antarctic rim', () => {
  assert.match(featurePaths, /projectGeoJSONRing/);
  assert.match(app, /preserveAntarcticRim:c\.iso==='ATA'\|\|c\.name==='Antarctica'/);
  assert.match(html, /<span>A–B line<\/span><strong>Straight projected segment<\/strong>/);
  assert.match(app, /measureDirectDistance\(points\[0\],points\[1\]\)/);
  assert.match(app, /Straight line on the flat-disk map/);
  assert.doesNotMatch(app, /Flat-disk chord · Antarctic band involved/);
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


test('distance connector is one straight projected segment measured in the map plane',()=>{
 assert.match(app,/const path=flatDiskLinePath\(points\[0\],points\[1\],project\)/);
 assert.match(app,/ctx\.lineTo\(path\[1\]\[0\],path\[1\]\[1\]\)/);
 assert.match(app,/measureDirectDistance\(points\[0\],points\[1\]\)/);
 assert.doesNotMatch(app,/geodesicLinePath/);
 assert.match(app,/strokeMeasurementConnector\('distance'\)/);
 assert.match(html,/Straight projected segment/);
});


test('distance and area drawings render km labels on their measurement geometry',()=>{
 assert.match(app,/function drawMeasurementLabelAtMap\(/);
 assert.match(app,/const label=formatMeasurementKilometres\(measurement\.distanceMeters\)/);
 assert.match(app,/formatMeasurementKilometres\(measurement\.distanceMeters\)/);
 assert.match(app,/drawMeasurementLabelAtMap\([\s\S]*?label,'distance'/);
 assert.match(app,/createProjectedSegmentLabels\(areaPoints,project,flatDiskDistanceMeters,closed\)/);
 assert.match(app,/edgeLabels\.forEach\(label=>drawMeasurementLabelAtMap/);
 assert.match(app,/drawMeasurementLabelAtMap\(anchor\.x,anchor\.y,formatMeasurementSquareKilometres\(metrics\.areaM2\),'area'\)/);
 assert.match(app,/function formatMeasurementSquareKilometres\(/);
 assert.match(app,/ctx\.setTransform\(dpr,0,0,dpr,0,0\)/);
});

test('Find is moved into the map frame directly above Measure',()=>{
 assert.match(html,/class="map-tools-stack" id="mapToolsStack"/);
 assert.match(html,/class="map-find-tools" id="findTools"/);
 assert.ok(html.indexOf('id="findTools"')<html.indexOf('id="measurementTools"'));
 assert.doesNotMatch(html.slice(html.indexOf('<aside id="toolsPanel">'),html.indexOf('</aside>')),/id="search"/);
 assert.match(app,/const canvasRect=canvas\.getBoundingClientRect\(\),dockRect=\$\('mapToolsStack'\)\.getBoundingClientRect\(\)/);
});
test('measurement buttons have prepended icons and Area mode stays compact',()=>{
 assert.match(html,/tool-icon[^>]*>⌖<\/span> Explore/);
 assert.match(html,/tool-icon[^>]*>↔<\/span> Distance/);
 assert.match(html,/tool-icon[^>]*>⬡<\/span> Area/);
 assert.match(html,/class="endpoint-actions area-actions"/);
 assert.match(app,/button-label/);
 assert.match(styles,/data-active-mode="explore"\] \.map-measure-readings/);
 assert.match(styles,/data-active-mode="area"\] \.map-measure-reading:first-child/);
});
test('compact measurement dock is embedded in the map viewport',()=>{
 const viewport=html.indexOf('class="map-viewport"');
 const find=html.indexOf('class="map-find-tools" id="findTools"');
 const dock=html.indexOf('class="map-measure-tools" id="measurementTools"');
 const loading=html.indexOf('id="mapLoading"');
 assert.ok(viewport>=0&&find>viewport&&dock>find&&loading>dock);
 assert.match(html,/class="map-tools-stack" id="mapToolsStack"/);
 assert.match(html,/id="toggleMeasurementDetails"/);
 assert.match(html,/id="exploreMode"/);
 assert.match(html,/id="measureMode"/);
 assert.match(html,/id="areaMode"/);
 assert.match(styles,/\.map-measure-tools\s*\{/);
 assert.match(html,/id="areaDetails" hidden/);
 assert.match(app,/\$\('distanceDetails'\)\.hidden=mode!=='measure'/);
 assert.match(app,/\$\('areaDetails'\)\.hidden=mode!=='area'/);
});

test('60°S callouts identify the restricted line and rotate with the map',()=>{
 assert.match(html,/60°S · Restricted Line/);
 assert.doesNotMatch(html,/metric transition/i);
 assert.match(app,/function drawRestrictedParallel\(\)/);
 assert.match(app,/ctx\.setLineDash\(\[8\/zoom,5\/zoom\]\)/);
 assert.match(app,/for\(const degree of \[45,225\]\)/);
 assert.match(app,/60°S · RESTRICTED LINE/);
 assert.doesNotMatch(app,/60°S · METRIC TRANSITION/);
 assert.match(app,/let readableAngle=\(\(angle\+Math\.PI\/2\)%Math\.PI\+Math\.PI\)%Math\.PI-Math\.PI\/2/);
 assert.match(app,/ctx\.translate\(labelX,labelY\);ctx\.rotate\(readableAngle\)/);
 assert.doesNotMatch(app,/segmentCrossesRestrictedParallel/);
 assert.doesNotMatch(app,/polylineCrossesRestrictedParallel/);
 assert.match(app,/measureDirectDistance\(points\[0\],points\[1\]\)/);
});


test('Antarctica remains separately rendered but can be selected and searched',()=>{
 assert.match(app,/antarcticaCountry=antarcticaFeature\?/);
 assert.match(app,/layers\.antarctica&&antarcticaCountry&&antarcticaPath&&ctx\.isPointInPath/);
 assert.match(app,/searchIndex=buildSearchIndex/);
 assert.match(app,/item\.obj\.iso==='ATA'\?'ANTARCTICA · ICE WALL'/);
});

test('registration-point triangulation is bounded in the UI and restored share links',()=>{
 assert.match(app,/MAX_REGISTRATION_POINTS=30/);
 assert.match(app,/registrationPoints\.length>=MAX_REGISTRATION_POINTS/);
 assert.match(app,/\.slice\(0,MAX_REGISTRATION_POINTS\)/);
 assert.match(html,/maximum 30 control points/);
});

test('map geometry is not reprojected when a resize leaves the disk radius unchanged',()=>{
 assert.match(app,/geometryBaseR=NaN/);
 assert.match(app,/Math\.abs\(nextBaseR-geometryBaseR\)>1e-6/);
 assert.match(app,/geometryBaseR=baseR/);
});

test('scale-bar calculations use the same direct projected metric as A–B measurements',()=>{
 assert.match(app,/measureDirectDistance uses the straight projected chord, matching A–B measurements/);
 assert.doesNotMatch(app,/WGS84 \/ flat-disk transition/);
 assert.doesNotMatch(app,/measurement\.restricted\?flatDiskDistanceMeters/);
});


test('searching for Antarctica returns to a whole-disk view so the full ice-wall band remains visible',()=>{
 assert.match(app,/if\(item\.obj\.iso==='ATA'\)\{\s*\/\/ Keep the complete circumferential ice-wall band in view[\s\S]*?focusGeo\(90,0,MIN_ZOOM\)/);
});
