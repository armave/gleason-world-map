import test from 'node:test';
import assert from 'node:assert/strict';
import {createIceWallTexturePaths,ICE_RIDGE_COUNT,ICE_CREVASSE_COUNT} from '../src/map/ice-wall.js';
import {createCompassRoseLayout} from '../src/map/compass.js';
import { readFile } from 'node:fs/promises';

const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const templateMarkup = id => {
 const tag = '<template id="'+id+'">', start = htmlSource.indexOf(tag);
 const end = htmlSource.indexOf('</template>',start);
 return start<0||end<0?'':htmlSource.slice(start+tag.length,end);
};
const html = [
 ['<map-find-panel data-lit-panel></map-find-panel>','find-panel-template'],
 ['<map-measure-panel data-lit-panel></map-measure-panel>','measure-panel-template'],
 ['<map-layers-panel data-lit-panel></map-layers-panel>','layers-panel-template'],
 ['<map-selection-panel data-lit-panel></map-selection-panel>','selection-panel-template'],
 ['<map-calibration-panel data-lit-panel></map-calibration-panel>','calibration-panel-template'],
 ['<map-geometry-panel data-lit-panel></map-geometry-panel>','geometry-panel-template'],
 ['<map-historical-panel data-lit-panel></map-historical-panel>','historical-panel-template']
].reduce((source,[placeholder,id])=>source.replace(placeholder,templateMarkup(id)),htmlSource);
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const featurePaths = await readFile(new URL('../src/map/feature-paths.js', import.meta.url), 'utf8');
const calibrationUi = await readFile(new URL('../src/ui/calibration.js', import.meta.url), 'utf8');
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
  assert.match(app, /function drawCountryLabels\(allowLabels=true\)/);
  assert.match(app, /drawCapitals\(!interactionSimplified\);drawCountryLabels\(!interactionSimplified\);/);
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
 assert.match(app,/drawCoastlinesLayer\(interactionSimplified\)/);
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

test('Antarctic ice wall uses ADD surface classes plus layered rim texture',()=>{
 assert.match(iceWall,/fillStyle='#ffffff'/);
 assert.match(iceWall,/ICE_RIDGE_COUNT=180/);
 assert.match(iceWall,/ICE_CREVASSE_COUNT=42/);
 assert.match(iceWall,/ICE_WALL_LABEL_COUNT=8/);
 assert.match(iceWall,/drawAntarcticSurfaceOverlays/);
 assert.match(iceWall,/surfacePaths/);
 assert.match(iceWall,/ctx\.clip\(antarcticaPath,'evenodd'\)/);
 assert.match(html,/SCAR Antarctic Digital Database/);
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
 assert.match(app,/if\(layers\.grid\)drawAnnotations\(\);[\s\S]*?drawCapitals\(!interactionSimplified\);drawCountryLabels\(!interactionSimplified\)/);
 assert.match(app,/createCompassRoseLayout\(rotationRadians\(\)\)/);
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
  assert.doesNotMatch(html, /flightDistanceValue|flightDistanceSub|secondary-distance-reading/);
  assert.doesNotMatch(app, /endpointDistanceEstimateMeters|endpointDistanceCalibration|predictEndpointDistance/);
  assert.match(app, /measureDistanceMeters/);
  assert.match(app, /measureDirectDistance\(points\[0\],points\[1\]\)/);
  assert.match(app, /flatDiskPolygonMetrics\(areaPoints,project,baseR,measureDistanceMeters\)/);
  assert.doesNotMatch(app, /geodesicLinePath/);
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
  assert.match(app,/renderRadialCalibration\(\$\('radialRows'\),\$\('visualRadialRows'\),\$\('calibrationFormula'\),\$\('pathCalibrationStatus'\)\)/);
 assert.match(html,/id="calibrationFormula"/);assert.match(html,/id="pathCalibrationStatus"/);assert.match(html,/id="visualRadialRows"/);
 assert.match(app,/function drawCompassRose\(\)/);assert.match(app,/for\(let d=0;d<360;d\+=5\)/);
});


test('map draws the same 12 radial reference circles listed in the calibration panel',()=>{
 assert.match(app,/RADIAL_DISTANCE_VISUAL_CIRCLES/);
 assert.match(app,/for\(const circle of RADIAL_DISTANCE_VISUAL_CIRCLES\)/);
 assert.match(app,/baseR\*circle\.visualFraction/);
 assert.match(calibrationUi,/RADIAL_DISTANCE_VISUAL_CIRCLES\.map/);
 assert.match(calibrationUi,/distanceMultiplier\.toFixed\(2\)/);
 assert.match(html,/Display multiplier/);
  assert.match(html,/timestamped ADS-B path vertices/);
 assert.match(html,/One ADS-B-calibrated flat-disk distance formula/);
  assert.match(html,/continuous radial profile used by both the map and the path fitter/);
});

test('direct A/B coordinate entry and calibration route support are available',()=>{
 assert.match(html,/id="coordALat"/);
 assert.match(html,/id="coordALon"/);
 assert.match(html,/id="coordBLat"/);
 assert.match(html,/id="coordBLon"/);
 assert.match(html,/id="applyCoordsA"/);
 assert.match(html,/id="applyCoordsB"/);
 assert.match(html,/id="calibrationSupport"/);
 assert.match(html,/id="calibrationRoutes"/);
 assert.match(app,/function applyCoordinateEndpoint\(index\)/);
 assert.match(app,/calibration\.neighbourRouteIds/);
 assert.match(app,/loadAntarcticAddDataset\(\)\.then/);
 assert.match(app,/Natural Earth outline remains active/);
});

test('PNG exports include date, measurement and model/source metadata',()=>{
 assert.match(app,/function exportPNG\(\)/);
 assert.match(app,/outputCtx\.fillText\('GLEASON-STYLE FLAT-DISK MAP/);
 assert.match(app,/Visible map · ADS-B projected-path fit/);
 assert.match(app,/ADS-B projected-path fit pending/);
 assert.match(app,/SCAR Antarctic Digital Database v7\.13/);
 assert.match(app,/FLIGHT_PATH_CALIBRATION\.schemaVersion/);
 assert.match(app,/FLIGHT_PATH_CALIBRATION\.trainingRouteCount/);
});

test('distance connector is one straight projected segment measured in the map plane',()=>{
 assert.match(app,/const path=flatDiskLinePath\(points\[0\],points\[1\],project\)/);
 assert.match(app,/ctx\.lineTo\(path\[1\]\[0\],path\[1\]\[1\]\)/);
 assert.match(app,/measureDirectDistance\(points\[0\],points\[1\]\)/);
 assert.doesNotMatch(app,/geodesicLinePath/);
 assert.match(app,/strokeMeasurementConnector\('distance'\)/);
 assert.match(html,/Straight projected segment/);
});


test('A–B, scale bar, polygon edges and PNG use one calibrated distance function',()=>{
 assert.match(html,/<span>Distance A–B<\/span>/);
 assert.match(html,/One ADS-B-calibrated flat-disk distance formula/);
 assert.doesNotMatch(html,/flightDistanceValue|flightDistanceSub|secondary-distance-reading|Projected flat-disk chord/);
 assert.match(html,/id="visualRadialRows"/);
 assert.match(html,/1\.00×[\s\S]*0\.50×/);
 assert.match(app,/measureDistanceMeters\(first,second\)/);
 assert.match(app,/createProjectedSegmentLabels\(areaPoints,project,measureDistanceMeters,closed\)/);
 assert.match(app,/flatDiskPolygonMetrics\(areaPoints,project,baseR,measureDistanceMeters\)/);
 assert.match(app,/const distanceMeters=measureDistanceMeters\(first,second\)/);
 assert.match(app,/A–B distance '\+formatDistance\(measurement\.distanceMeters\)/);
 assert.match(app,/const label=formatMeasurementKilometres\(measurement\.distanceMeters\)/);
 assert.doesNotMatch(app,/flatDiskDistanceMeters|endpointDistanceEstimateMeters|endpointDistanceCalibration|flightDistanceValue/);
 assert.doesNotMatch(app,/greatCircleDistanceMeters|great-circle|spherical/);
});
test('distance and area drawings render km labels on their measurement geometry',()=>{
 assert.match(app,/function drawMeasurementLabelAtMap\(/);
 assert.match(app,/const label=formatMeasurementKilometres\(measurement\.distanceMeters\)/);
 assert.match(app,/distanceValue'\)\.textContent=Number\.isFinite\(measurement\.distanceMeters\)/);
 assert.match(app,/distanceValue'\)\.textContent=Number\.isFinite\(measurement\.distanceMeters\)/);
 assert.match(app,/drawMeasurementLabelAtMap\([\s\S]*?label,'distance'/);
 assert.match(app,/createProjectedSegmentLabels\(areaPoints,project,measureDistanceMeters,closed\)/);
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
 assert.match(app,/geometryBaseR=projectionBaseR/);
});

test('scale-bar calculations use the same direct projected metric as A–B measurements',()=>{
 assert.match(app,/The scale bar uses the same canonical calibrated metric as A–B and area edges/);
 assert.doesNotMatch(app,/WGS84 \/ flat-disk transition/);
 assert.doesNotMatch(app,/measurement\.restricted\?flatDiskDistanceMeters/);
});


test('searching for Antarctica returns to a whole-disk view so the full ice-wall band remains visible',()=>{
 assert.match(app,/if\(item\.obj\.iso==='ATA'\)\{\s*\/\/ Keep the complete circumferential ice-wall band in view[\s\S]*?focusGeo\(90,0,MIN_ZOOM\)/);
});


test('pointer, hover and wheel interactions coalesce expensive work to animation frames',()=>{
 assert.match(app,/function scheduleDraw\(\)/);
 assert.match(app,/function updateHoverAt\(clientX,clientY\)/);
 assert.match(app,/pendingHoverPoint=\{clientX:e\.clientX,clientY:e\.clientY\}/);
 assert.match(app,/zoom=nz;scheduleDraw\(\)/);
 const pointer=app.match(/canvas\.addEventListener\('pointermove',[\s\S]*?\n\}\);/);
 assert.ok(pointer);
 assert.match(pointer[0],/requestAnimationFrame/);
 assert.match(pointer[0],/scheduleDraw\(\)/);
 assert.doesNotMatch(pointer[0],/draw\(\)/);
});

test('scale-bar measurement uses the same geometric chord metric as A–B',()=>{
 const scaleMetric=app.slice(app.indexOf('function flatDiskDistanceForScalePixels'),app.indexOf('function scaleBarReadingKm'));
 assert.match(scaleMetric,/measureDistanceMeters\(first,second\)/);
 assert.doesNotMatch(scaleMetric,/flatDiskDistanceMeters/);
});
test('scale-bar measurement is calculated once per frame and uses a pixel-accurate search',()=>{
 assert.match(app,/const scaleLayout=calculateScaleBarLayout\(\)/);
 assert.match(app,/frameScaleBarReadingKm=scaleLayout\?\.targetKm\?\?Infinity/);
 assert.match(app,/shouldShowCapitalLabels\(frameScaleBarReadingKm\)/);
 assert.match(app,/shouldShowCountryLabels\(frameScaleBarReadingKm\)/);
 assert.match(app,/drawOceanLabels\(ctx,project,baseR,zoom,frameScaleBarReadingKm/);
 assert.doesNotMatch(app,/for\(let i=0;i<36;i\+\+\)\{const mid=\(low\+high\)\/2;if\(flatDiskDistanceForScalePixels/);
});

test('base map becomes interactive before optional county, coastline and Antarctic detail loads',()=>{
 const loader=app.slice(app.indexOf('async function load()'),app.indexOf("$('mapQuality').addEventListener"));
 assert.match(loader,/const \[geoData,capRaw\]=await Promise\.all/);
 assert.match(loader,/setMapLoading\(false\)/);
 assert.match(loader,/loadCountyDataset\(\)\.then/);
 assert.match(loader,/loadCoastlineDataset\(\)\.then/);
 assert.match(loader,/loadAntarcticAddDataset\(\)\.then/);
 assert.match(loader,/runWhenIdle\(\(\)=>/);
});

test('Antarctic ice-wall detail is grouped into reusable paths and built on resize',()=>{
 assert.match(app,/createIceWallTexturePaths\(baseR\)/);
 assert.match(app,/simplified\?null:antarcticSurfacePaths,simplified\?null:iceWallTexturePaths/);
 assert.match(iceWall,/export function createIceWallTexturePaths/);
 assert.match(iceWall,/texturePaths\.accentRidges/);
});


test('Antarctic texture builder combines ridges and crevasses into three reusable paths',()=>{
 class MockPath {
  constructor(){this.commands=[];}
  moveTo(x,y){this.commands.push(['M',x,y]);}
  lineTo(x,y){this.commands.push(['L',x,y]);}
 }
 const paths=createIceWallTexturePaths(300,MockPath);
 assert.ok(paths);
 assert.equal(Object.keys(paths).length,3);
 const moveCount=path=>path.commands.filter(command=>command[0]==='M').length;
 assert.equal(moveCount(paths.ridges),ICE_RIDGE_COUNT-Math.ceil(ICE_RIDGE_COUNT/4));
 assert.equal(moveCount(paths.accentRidges),Math.ceil(ICE_RIDGE_COUNT/4));
 assert.equal(moveCount(paths.crevasses),ICE_CREVASSE_COUNT);
});

test('map gestures use a lightweight preview and redraw full detail when settled',()=>{
 assert.match(app,/interactionSimplified=Boolean\(\(pointerDown&&didDrag\)\|\|wheelZoomActive\|\|rotationAnimationFrame!==null\)/);
 assert.match(app,/function drawCoastlinesLayer\(simplified=false\)\{if\(simplified\|\|/);
 assert.match(app,/function drawIceWall\(simplified=false\)/);
 assert.match(app,/drawCapitals\(!interactionSimplified\);drawCountryLabels\(!interactionSimplified\);/);
 assert.match(app,/if\(layers\.oceanLabels\)\{\s*if\(!interactionSimplified\)/);
 assert.match(app,/wheelZoomActive=true/);
 assert.match(app,/canvas\.addEventListener\('pointerup'[\s\S]*?scheduleDraw\(\)/);
});

test('large coastline and Antarctic surface paths are built in yielding batches',()=>{
 assert.match(app,/createCoastlinePathAsync\(source,/);
 assert.match(app,/createAntarcticSurfacePathsAsync\(source,/);
});


test('resize rebuilds deferred detail paths with a stable projection snapshot',()=>{
 assert.match(app,/const fixedProject=\(lon,lat\)=>projectFlatDisk\(lon,lat,projectionBaseR\)/);
 assert.match(app,/const makeResizedPath=.*fixedProject/);
 assert.match(app,/geometryBaseR!==projectionBaseR/);
 assert.doesNotMatch(app,/createCoastlinePath\(coastlineData,project\)|createAntarcticSurfacePaths\(antarcticAddData,project\)/);
 assert.match(app,/createCoastlinePathAsync\(source,buildProject\)/);
 assert.match(app,/createAntarcticSurfacePathsAsync\(source,buildProject\)/);
});


test('static country fills are cached while country outlines remain zoom-crisp',()=>{
 assert.match(app,/function buildCountryLayerCache\(\)/);
 assert.match(app,/ctx\.drawImage\(countryLayerCanvas,-baseR,-baseR,baseR\*2,baseR\*2\)/);
 assert.match(app,/ctx\.lineWidth=\.62\/zoom;ctx\.stroke\(countryOutlinesPath\)/);
 assert.match(app,/countryLayerStyle===visualStyle/);
 assert.match(app,/buildCountryLayerCache\(\);/);
});

test('compass cardinal labels stay screen-fixed while the needle follows map rotation',()=>{
 const northUp=createCompassRoseLayout(0);
 const rotated=createCompassRoseLayout(Math.PI/12);
 assert.deepEqual(rotated.cardinalLabels,northUp.cardinalLabels);
 assert.equal(northUp.needleRotation,0);
 assert.equal(rotated.needleRotation,Math.PI/12);
 assert.equal(northUp.radius,17.5);
 assert.ok(northUp.outerRadius>northUp.radius*1.7);
 assert.match(app,/ctx\.save\(\);ctx\.rotate\(rose\.needleRotation\)/);
 assert.match(app,/ctx\.restore\(\);\s*\/\/ A small hub/);
 assert.match(app,/for\(const mark of rose\.cardinalLabels\)ctx\.fillText\(mark\.label,mark\.x,mark\.y\)/);
});

test('compass labels remain upright and independent of needle rotation',()=>{
 const compassLayout=createCompassRoseLayout(0.3);
 assert.deepEqual(compassLayout.cardinalLabels.map(mark=>mark.label),['N','E','S','W']);
 assert.ok(compassLayout.cardinalLabels.every(mark=>Number.isFinite(mark.x)&&Number.isFinite(mark.y)));
 assert.match(app,/function drawCompassRose\(\)/);
 assert.match(app,/ctx\.save\(\);ctx\.rotate\(rose\.needleRotation\)/);
 assert.match(app,/for\(const mark of rose\.cardinalLabels\)ctx\.fillText\(mark\.label,mark\.x,mark\.y\)/);
});


test('Lit panels mount from templates into light DOM and preserve selectors',()=>{
 assert.ok(htmlSource.includes('<map-find-panel data-lit-panel></map-find-panel>'));
 assert.ok(htmlSource.includes('<map-measure-panel data-lit-panel></map-measure-panel>'));
 assert.ok(htmlSource.includes('<template id="find-panel-template">'));
 assert.ok(htmlSource.includes('<template id="historical-panel-template">'));
 assert.ok(app.includes('await Promise.all(PANEL_TAGS.map'));
 assert.ok(app.includes('map-panel-event'));
 assert.ok(app.includes('createAppState'));
 assert.ok(app.includes('new MapController'));
});
