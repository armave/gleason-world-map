import {
  EQUATOR_RADIUS_KM, project, unproject, projectGeoJSONRingParts,
  flatDiskPolygonMetrics, flatDiskFeatureAreaM2
} from './core/dual-disk.js';
import { measureDirectDistance, measureDistanceMeters } from './core/measurement-engine.js';
import { createFeaturePath } from './map/feature-paths.js';
import { createCoastlinePathAsync, drawCoastlines } from './map/coastlines.js';
import { createProjectedMeasurementSegments, createProjectedSegmentLabels, measurementStrokeStyle } from './map/measurements.js';
import { loadCountryDataset, loadCapitalDataset, loadCountyDataset, loadCoastlineDataset, MAP_QUALITY_OPTIONS } from './data/datasets.js';
import { isoFor, nameFor, centroidOfFeature } from './data/geojson.js';
import { buildSearchIndex, findSearchMatches } from './data/search-index.js';
import { formatDistance, formatArea, fmtCoord, lonName } from './core/format.js';
import { createAppState } from './app/state.js';
import { PANEL_TAGS } from './components/panels.js';

(async () => {
  'use strict';
  await Promise.all(PANEL_TAGS.map(tag => {
    const panel = document.querySelector(tag);
    return panel ? panel.updateComplete : Promise.resolve();
  }));

  const $ = id => document.getElementById(id);
  const canvas = $('map');
  const ctx = canvas.getContext('2d');
  const R = EQUATOR_RADIUS_KM;
  const DEG = Math.PI / 180;
  const DEFAULT_STYLE = 'vintage';
  const STYLE_KEY = 'dual-disk-map:style:v1';
  const QUALITY_KEY = 'dual-disk-map:quality:v1';
  const palettes = {
    vintage: { canvas:'#eadfc9', water:'#82a9ad', rim:'#718f91', grid:'#5f8585', minor:'#a8bdb0', equator:'#395f60', labels:'#3d4037', outline:'#7b6042', coast:'#315f62', halo:'rgba(243,233,208,.94)', land:['#d6b477','#a5b486','#dfc58f','#9cb3a0','#ca9c6e','#b4b98e','#d5a47a'] },
    atlas: { canvas:'#edf2ec', water:'#b9d8e8', rim:'#557f91', grid:'#6f94a1', minor:'#9db9c2', equator:'#315f73', labels:'#284f61', outline:'#456b72', coast:'#315f73', halo:'rgba(246,251,249,.96)', land:['#d7c8a2','#a8c7ab','#e3d29e','#aac3d0','#d9b99b','#b6c6a5','#e2c6a9'] },
    clean: { canvas:'#f4f7f8', water:'#e4f0f6', rim:'#a1bdca', grid:'#b3c4cb', minor:'#d3dfe3', equator:'#638795', labels:'#3f6170', outline:'#8b9ea7', coast:'#6c8997', halo:'rgba(255,255,255,.98)', land:['#d7e0d9','#e4e8d7','#d8e3e9','#eee1d0','#d6e0e8','#dce6d8','#e7ddd0'] }
  };
  let visualStyle = Object.keys(palettes).includes(localStorage.getItem(STYLE_KEY)) ? localStorage.getItem(STYLE_KEY) : DEFAULT_STYLE;
  let mapQuality = Object.hasOwn(MAP_QUALITY_OPTIONS, localStorage.getItem(QUALITY_KEY)) ? localStorage.getItem(QUALITY_KEY) : 'medium';
  let palette = palettes[visualStyle];
  let width = 800, height = 600, dpr = 1, fitScale = 1, zoom = 1, panX = 0, panY = 0, rotation = 0;
  let mode = 'explore', points = [], areaPoints = [], areaFinished = false, selected = null;
  let countryFeatures = [], pathRecords = [], antarcticaFeature = null, antarcticaPath = null;
  let capitals = [], counties = [], coastlineData = null, coastlinePath = null, searchIndex = [];
  let layers = { countries:true, grid:true, capitals:true, capitalNames:true, countryNames:true, antarctica:true, coastlines:true };
  let pointer = null, moved = false, loading = false, loadError = null;
  const appState = createAppState({
    mode, view:{zoom,panX,panY,rotationDegrees:0}, mapQuality, visualStyle, layers,
    measurement:{distancePointCount:0,areaPointCount:0,areaFinished:false,endpoints:[],distanceLabel:''}
  });
  for (const tag of PANEL_TAGS) {
    const panel = document.querySelector(tag);
    if (panel) panel.stateStore = appState;
  }

  function currentScale() { return fitScale * zoom; }
  function worldToScreen(x, y) {
    const scale = currentScale(), angle = rotation * DEG;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return {
      x: width / 2 + panX + (x * cosine - y * sine) * scale,
      y: height / 2 + panY + (x * sine + y * cosine) * scale
    };
  }
  function screenToWorld(x, y) {
    const scale = currentScale(), angle = rotation * DEG;
    const sx = (x - width / 2 - panX) / scale;
    const sy = (y - height / 2 - panY) / scale;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return { x:sx * cosine + sy * sine, y:-sx * sine + sy * cosine };
  }
  function validScreenPoint(point) {
    if (!point) return false;
    const north = Math.hypot(point.x + R, point.y);
    const south = Math.hypot(point.x - R, point.y);
    return Math.min(north, south) <= R * 1.015;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    fitScale = Math.min((width - 80) / (4 * R), (height - 80) / (2 * R));
    if (!Number.isFinite(fitScale) || fitScale <= 0) fitScale = 1;
    draw();
  }
  function withWorldTransform(callback) {
    const scale = currentScale();
    ctx.save();
    ctx.translate(width / 2 + panX, height / 2 + panY);
    ctx.rotate(rotation * DEG);
    ctx.scale(scale, scale);
    callback();
    ctx.restore();
  }
  function drawWorldText(text, x, y, options = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-rotation * DEG);
    ctx.scale(1 / currentScale(), 1 / currentScale());
    ctx.font = options.font || '600 10px Georgia,serif';
    ctx.textAlign = options.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = options.outline === false ? 0 : 3;
    ctx.strokeStyle = options.halo || 'rgba(255,250,238,.94)';
    if (options.outline !== false) ctx.strokeText(text, 0, 0);
    ctx.fillStyle = options.color || palette.labels;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  function traceLatitudeRing(disk, absoluteLatitude, stepDegrees = 2) {
    const latitude = disk === 'N' ? absoluteLatitude : -absoluteLatitude;
    ctx.beginPath();
    let started = false;
    for (let longitude = 0; longitude <= 360; longitude += stepDegrees) {
      const point = project(latitude, longitude, disk);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (!started) { ctx.moveTo(point.x, point.y); started = true; }
      else ctx.lineTo(point.x, point.y);
    }
    if (started) ctx.closePath();
  }
  function drawDiskBackground(disk) {
    traceLatitudeRing(disk, 0, 2);
    ctx.fillStyle = palette.water;
    ctx.fill();
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 58 / currentScale();
    ctx.stroke();
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 24 / currentScale();
    ctx.stroke();
  }
  function drawGrid() {
    if (!layers.grid) return;
    for (const disk of ['N','S']) {
      const pole = project(disk === 'N' ? 90 : -90, 0, disk);
      for (const lat of [75,60,45,30,15]) {
        traceLatitudeRing(disk, lat, 2);
        ctx.setLineDash([85 / currentScale(), 105 / currentScale()]);
        ctx.strokeStyle = palette.grid;
        ctx.lineWidth = 26 / currentScale();
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let longitude = 0; longitude < 360; longitude += 15) {
        const point = project(0, longitude, disk);
        ctx.beginPath();
        ctx.moveTo(pole.x, pole.y);
        ctx.lineTo(point.x, point.y);
        ctx.strokeStyle = longitude % 30 === 0 ? palette.grid : palette.minor;
        ctx.lineWidth = (longitude % 30 === 0 ? 34 : 17) / currentScale();
        ctx.stroke();
      }
      const poleText = disk === 'N' ? 'NORTH POLE' : 'SOUTH POLE';
      drawWorldText(poleText, pole.x, pole.y, { font:'700 13px Georgia,serif', color:palette.labels });
      for (const lat of [75,60,45,30,15]) {
        const labelLat = disk === 'N' ? lat : -lat;
        const labelPoint = project(labelLat, 155, disk);
        drawWorldText(Math.abs(lat) + '°' + disk, labelPoint.x, labelPoint.y, { font:'600 9px ui-sans-serif,system-ui' });
      }
      // Longitude ticks and labels are projected from the Equator on each disk.
      for (let longitude = 0; longitude < 360; longitude += 15) {
        const rimPoint = project(0, longitude, disk);
        const dx = rimPoint.x - pole.x, dy = rimPoint.y - pole.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length, uy = dy / length;
        const outer = { x:rimPoint.x + ux * 150, y:rimPoint.y + uy * 150 };
        ctx.beginPath();
        ctx.moveTo(rimPoint.x, rimPoint.y);
        ctx.lineTo(outer.x, outer.y);
        ctx.strokeStyle = palette.labels;
        ctx.lineWidth = (longitude % 30 === 0 ? 35 : 18) / currentScale();
        ctx.stroke();
        if (longitude % 30 === 0) {
          drawWorldText(lonName(longitude), rimPoint.x + ux * 390, rimPoint.y + uy * 390, {
            font:'600 9px ui-sans-serif,system-ui'
          });
        }
      }
    }
    ctx.setLineDash([]);
    const hinge = project(0,0,'N');
    ctx.beginPath(); ctx.arc(hinge.x,hinge.y,115/currentScale(),0,Math.PI*2);
    ctx.fillStyle = palette.labels; ctx.fill();
    drawWorldText('EQUATOR HINGE · 0°', 0, -430, { font:'700 9px ui-sans-serif,system-ui' });
  }
  function drawCountryBorders() {
    if (!layers.countries) return;
    for (const record of pathRecords) {
      if (record.feature === antarcticaFeature && !layers.antarctica) continue;
      const feature = record.feature;
      const colorIndex = Math.abs(Array.from(String(isoFor(feature))).reduce((sum,char)=>sum+char.charCodeAt(0),0)) % palette.land.length;
      ctx.fillStyle = feature === antarcticaFeature ? '#f9fbf7' : palette.land[colorIndex];
      ctx.globalAlpha = feature === antarcticaFeature ? .98 : .9;
      ctx.fill(record.path, 'evenodd');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = feature === antarcticaFeature ? '#d8e8ed' : palette.outline;
      ctx.lineWidth = (feature === antarcticaFeature ? 95 : 43) / currentScale();
      ctx.stroke(record.path);
    }
  }
  function drawIceWall() {
    if (!layers.antarctica || !antarcticaPath) return;
    ctx.save();
    ctx.strokeStyle = '#e8f4f6';
    ctx.lineWidth = 145 / currentScale();
    ctx.stroke(antarcticaPath);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 55 / currentScale();
    ctx.stroke(antarcticaPath);
    ctx.restore();
    // Label the Antarctic boundary around the Southern Pole, not the Equator rim.
    const iceWallLabel = project(-76, 0, 'S');
    drawWorldText('ANTARCTIC RIM / ICE WALL', iceWallLabel.x, iceWallLabel.y, {
      font:'700 10px Georgia,serif', color:'#315b6a', halo:'rgba(255,255,255,.98)'
    });
  }
  function drawCoastlinesLayer() {
    if (!layers.coastlines || !coastlinePath) return;
    drawCoastlines(ctx, coastlinePath, currentScale(), {
      coastline:palette.coast, coastHalo:palette.halo
    });
  }
  function drawCapitals() {
    if (!layers.capitals) return;
    const showLabels = layers.capitalNames && zoom >= 1.45;
    for (const capital of capitals) {
      const point = project(capital.lat, capital.lon);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 92 / currentScale(), 0, Math.PI * 2);
      ctx.fillStyle = selected?.type === 'capital' && selected.capital === capital ? '#a8492f' : '#314f59';
      ctx.fill();
      ctx.strokeStyle = '#fffdf6';
      ctx.lineWidth = 24 / currentScale();
      ctx.stroke();
      if (showLabels || (selected?.type === 'capital' && selected.capital === capital)) {
        drawWorldText(capital.city, point.x + 130 / currentScale(), point.y - 100 / currentScale(), {
          font:'600 10px ui-sans-serif,system-ui', align:'left'
        });
      }
    }
  }
  function drawCountryLabels() {
    if (!layers.countryNames || zoom < 1.2) return;
    for (const feature of countryFeatures) {
      const centre = centroidOfFeature(feature);
      if (!centre || !Number.isFinite(centre.lat) || !Number.isFinite(centre.lon)) continue;
      const point = project(centre.lat, centre.lon);
      if (Math.hypot(point.x - (point.disk === 'N' ? -R : R), point.y) > R * .94) continue;
      drawWorldText(String(nameFor(feature)).toLocaleUpperCase(), point.x, point.y, {
        font:'600 9px Georgia,serif', color:'#6e563b'
      });
    }
  }
  function drawRouteLine(route, tool = 'distance') {
    const style = measurementStrokeStyle(tool, currentScale());
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(style.dash);
    for (const segment of route.segments) {
      ctx.beginPath();
      ctx.moveTo(segment.start.x, segment.start.y);
      ctx.lineTo(segment.end.x, segment.end.y);
      ctx.strokeStyle = style.halo;
      ctx.lineWidth = style.haloWidth;
      ctx.stroke();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }
  function routeMidpoint(route) {
    const lengths = route.segments.map(segment => Math.hypot(
      segment.end.x - segment.start.x, segment.end.y - segment.start.y
    ));
    const total = lengths.reduce((sum,value)=>sum+value,0);
    if (!total) return route.segments[0]?.start || null;
    let remaining = total / 2;
    for (let index=0; index<route.segments.length; index++) {
      const segment = route.segments[index], length = lengths[index];
      if (remaining <= length || index === route.segments.length - 1) {
        const t = length ? remaining / length : 0;
        return {
          x:segment.start.x+(segment.end.x-segment.start.x)*t,
          y:segment.start.y+(segment.end.y-segment.start.y)*t
        };
      }
      remaining -= length;
    }
    return null;
  }
  function drawPill(text, point, color = '#7c3f2d') {
    if (!point) return;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(-rotation * DEG);
    ctx.scale(1/currentScale(),1/currentScale());
    ctx.font = '700 11px ui-sans-serif,system-ui';
    const widthPx = ctx.measureText(text).width + 18;
    ctx.fillStyle = 'rgba(255,253,246,.96)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-widthPx/2,-12,widthPx,24,8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text,0,.5);
    ctx.restore();
  }
  function drawMeasure() {
    if (points.length !== 2) return;
    const route = measureDirectDistance(points[0],points[1]);
    if (!Number.isFinite(route.distanceMeters)) return;
    drawRouteLine(route,'distance');
    if (route.crossings.length) {
      for (const crossing of route.crossings) {
        ctx.beginPath();
        ctx.arc(crossing.x,crossing.y,180/currentScale(),0,Math.PI*2);
        ctx.fillStyle = 'rgba(255,250,238,.96)'; ctx.fill();
        ctx.strokeStyle = '#9b5038'; ctx.lineWidth = 48/currentScale(); ctx.stroke();
      }
    }
    const midpoint = routeMidpoint(route);
    drawPill(formatDistance(route.distanceMeters),midpoint);
    points.forEach((point,index)=>{
      const projected = project(point.lat,point.lon);
      ctx.beginPath();
      ctx.arc(projected.x,projected.y,145/currentScale(),0,Math.PI*2);
      ctx.fillStyle = index===0 ? '#b35b36' : '#3c7189'; ctx.fill();
      ctx.strokeStyle = '#fffdf6'; ctx.lineWidth = 48/currentScale(); ctx.stroke();
      drawWorldText(index===0?'A':'B',projected.x,projected.y,{font:'700 10px ui-sans-serif,system-ui',color:'#ffffff',outline:false});
    });
  }
  function drawArea() {
    if (!areaPoints.length) return;
    const closed = areaFinished && areaPoints.length >= 3;
    if (closed) {
      const ring = areaPoints.map(point=>[point.lon,point.lat]);
      const parts = projectGeoJSONRingParts(ring,project);
      ctx.save();
      ctx.fillStyle = 'rgba(79,126,143,.18)';
      for (const part of parts) {
        ctx.beginPath();
        ctx.moveTo(part.points[0][0],part.points[0][1]);
        for (let index=1;index<part.points.length;index++) ctx.lineTo(part.points[index][0],part.points[index][1]);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    const segments = createProjectedMeasurementSegments(areaPoints,project,closed);
    for (const segment of segments) {
      ctx.beginPath();
      ctx.moveTo(segment[0][0],segment[0][1]);
      ctx.lineTo(segment[1][0],segment[1][1]);
      const style = measurementStrokeStyle('area',currentScale());
      ctx.strokeStyle = style.halo; ctx.lineWidth = style.haloWidth; ctx.setLineDash(style.dash); ctx.stroke();
      ctx.strokeStyle = style.color; ctx.lineWidth = style.lineWidth; ctx.stroke();
    }
    ctx.setLineDash([]);
    areaPoints.forEach((point,index)=>{
      const projected = project(point.lat,point.lon);
      ctx.beginPath(); ctx.arc(projected.x,projected.y,125/currentScale(),0,Math.PI*2);
      ctx.fillStyle='#4f7e8f'; ctx.fill();
      drawWorldText(String(index+1),projected.x,projected.y,{font:'700 9px ui-sans-serif,system-ui',color:'#fff',outline:false});
    });
    const labels = createProjectedSegmentLabels(areaPoints,project,measureDistanceMeters,closed);
    for (const label of labels) drawPill(formatDistance(label.meters),{x:label.x,y:label.y},'#315f73');
    if (closed) {
      const metrics = flatDiskPolygonMetrics(areaPoints,project,measureDistanceMeters);
      if (metrics) {
        const pointsForCentre = areaPoints.map(point=>project(point.lat,point.lon));
        const centre = pointsForCentre.reduce((sum,point)=>({x:sum.x+point.x/pointsForCentre.length,y:sum.y+point.y/pointsForCentre.length}),{x:0,y:0});
        drawPill(formatArea(metrics.areaM2),centre,'#315f73');
      }
    }
  }
  function niceScaleFloor(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const power = Math.pow(10,Math.floor(Math.log10(value)));
    const normalized = value/power;
    const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
    return step*power;
  }
  function drawScaleBar() {
    const targetKm = niceScaleFloor(Math.min(185,width*.23)/currentScale());
    if (!targetKm) return;
    const bar = targetKm*currentScale(), x=16, y=height-23;
    ctx.save();
    ctx.font='11px ui-sans-serif,system-ui';
    ctx.textAlign='left'; ctx.textBaseline='middle';
    const label=formatDistance(targetKm*1000);
    ctx.fillStyle='rgba(251,248,239,.93)';
    ctx.strokeStyle='#c9c0ad';
    ctx.fillRect(x-7,y-29,Math.max(90,bar+14),43);
    ctx.strokeRect(x-7,y-29,Math.max(90,bar+14),43);
    ctx.strokeStyle='#294653'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+bar,y); ctx.moveTo(x,y-5); ctx.lineTo(x,y+5); ctx.moveTo(x+bar,y-5); ctx.lineTo(x+bar,y+5); ctx.stroke();
    ctx.fillStyle='#294653'; ctx.fillText(label,x,y-14);
    ctx.restore();
  }
  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle=palette.canvas; ctx.fillRect(0,0,width,height);
    withWorldTransform(()=>{
      drawDiskBackground('N');
      drawDiskBackground('S');
      drawGrid();
      drawCountryBorders();
      drawCoastlinesLayer();
      drawIceWall();
      drawCountryLabels();
      drawCapitals();
      drawArea();
      drawMeasure();
    });
    drawScaleBar();
    $('zoomReadout').textContent=Math.round(zoom*100)+'%';
    $('map').setAttribute('aria-label','Interactive dual-disk planar world map');
  }
  function formatRouteSummary(route) {
    if (route.metric === 'dual-disk-equatorial-hinge') {
      return 'Cross-Equator planar hinge · crossing ' + route.crossingLongitudeDegrees.toFixed(2) + '°';
    }
    if (route.metric === 'dual-disk-euclidean-chord') return 'Same-disk 2D Euclidean chord';
    return 'Distance unavailable';
  }
  function publishState(reason='measurement') {
    const route = points.length===2 ? measureDirectDistance(points[0],points[1]) : null;
    appState.update({
      mode,
      view:{zoom,panX,panY,rotationDegrees:rotation},
      mapQuality,visualStyle,layers:{...layers},
      measurement:{
        distancePointCount:points.length,areaPointCount:areaPoints.length,areaFinished,
        endpoints:points.map(point=>({name:point.name||'Map location',coordinates:fmtCoord(point.lat,point.lon)})),
        distanceLabel:route ? formatDistance(route.distanceMeters) : ''
      }
    },{source:'dual-disk-map',reason});
  }
  function updateMeasurement() {
    $('distanceValue').textContent='—';
    $('distanceSub').textContent='Set two endpoints to calculate the canonical distance';
    if (points.length===2) {
      const route=measureDirectDistance(points[0],points[1]);
      $('distanceValue').textContent=formatDistance(route.distanceMeters);
      $('distanceSub').textContent=formatRouteSummary(route);
      $('measureHelp').textContent='A–B uses the canonical dual-disk 2D route. Same-disk routes use one Euclidean chord; cross-Equator routes use two chords joined by an optimized matching Equator-hinge longitude.';
      $('measurementMethod').textContent=route.metric==='dual-disk-equatorial-hinge'
        ? 'Cross-Equator route: two straight 2D segments via the minimizing hinge longitude.'
        : 'Same-disk route: one straight 2D Euclidean chord.';
      $('routeRegisterStatus').textContent='Both route legs and the distance readout use the same canonical planar route.';
    } else {
      $('measureHelp').textContent=points.length===1
        ? 'Point A is set. Choose the second location for B.'
        : 'Choose two locations anywhere on the Northern or Southern disk.';
      $('measurementMethod').textContent='Select two points, or enter endpoint coordinates.';
      $('routeRegisterStatus').textContent=points.length===1
        ? 'Endpoint A is set. Add B to complete the route.'
        : 'Choose two points in Distance mode or assign capitals as A and B.';
    }
    $('clearMeasure').disabled=points.length===0;
    $('applyCoordsB').disabled=points.length===0;
    $('endpointRows').innerHTML=['A','B'].map((letter,index)=>{
      const point=points[index];
      return '<div class="point-row"><span class="point-badge '+letter.toLowerCase()+'">'+letter+'</span><span>'+(point?.name|| (point?fmtCoord(point.lat,point.lon):'Not set'))+'</span><small>'+(point?fmtCoord(point.lat,point.lon):'')+'</small></div>';
    }).join('');
    publishState('measurement');
    updateSelectionButtons();
    draw();
  }
  function updateAreaMeasurement() {
    $('areaVertexCount').textContent=areaPoints.length+' vertices';
    $('finishArea').disabled=areaPoints.length<3||areaFinished;
    $('undoArea').disabled=areaPoints.length===0;
    $('clearArea').disabled=areaPoints.length===0;
    $('finishArea').querySelector('.button-label').textContent=areaFinished?'Finished':'Finish';
    if (areaFinished && areaPoints.length>=3) {
      const metrics=flatDiskPolygonMetrics(areaPoints,project,measureDistanceMeters);
      $('areaValue').textContent=metrics?formatArea(metrics.areaM2):'Unavailable';
      $('areaPerimeter').textContent=metrics?'Perimeter · '+formatDistance(metrics.perimeterM):'Invalid polygon';
      $('areaHelp').textContent=metrics?'Planar area is summed from the separately clipped north and south polygon fragments. Perimeter uses canonical planar route distances.':'Check the polygon vertices and try again.';
    } else {
      $('areaValue').textContent='—';
      $('areaPerimeter').textContent='Area not calculated';
      $('areaHelp').textContent='Add at least three vertices, then finish to calculate planar area and perimeter.';
    }
    publishState('area');
    draw();
  }
  function setMode(next) {
    mode=next;
    for(const [id,value] of [['exploreMode','explore'],['measureMode','measure'],['areaMode','area']]) {
      $(id).classList.toggle('active',mode===value);
      $(id).setAttribute('aria-pressed',String(mode===value));
    }
    $('measurementDetails').hidden=mode==='explore';
    $('areaDetails').hidden=mode!=='area';
    $('distanceDetails').hidden=mode!=='measure';
    $('measurementTools').dataset.activeMode=mode;
    publishState('mode');
  }
  function setPoint(index,point) {
    if(!point || !Number.isFinite(point.lat)||!Number.isFinite(point.lon)||point.lat<-90||point.lat>90||point.lon<-180||point.lon>180)return;
    points[index]={lat:point.lat,lon:point.lon,name:point.name||fmtCoord(point.lat,point.lon)};
    points=points.slice(0,2);
    updateMeasurement();
    updateSelectionButtons();
  }
  function updateSelectionButtons() {
    $('selectionButtons').style.display=selected?'flex':'none';
    $('setA').disabled=!selected || !selected.capital;
    $('setB').disabled=!selected || !selected.capital || points.length===0;
  }
  function selectCapital(capital) {
    const country=countryFeatures.find(feature=>isoFor(feature)===capital.iso);
    selected={type:'capital',capital,country};
    $('selectionName').textContent=capital.city;
    $('selectionKind').textContent='Capital of '+(capital.countryName||nameFor(country||{}));
    $('selectionMetaTitle').textContent='Capital';
    $('selectionCapital').textContent=capital.city;
    $('selectionCoords').textContent=fmtCoord(capital.lat,capital.lon);
    $('selectionFactTitle').textContent='Dual-disk planar area';
    const area=country?flatDiskFeatureAreaM2(country,project):null;
    $('selectionFactValue').textContent=area==null?'—':formatArea(area);
    $('selectionButtons').style.display='flex';
    updateSelectionButtons();
    draw();
  }
  function selectCountry(feature) {
    selected={type:'country',country:feature,capital:capitals.find(capital=>capital.iso===isoFor(feature))||null};
    $('selectionName').textContent=nameFor(feature);
    $('selectionKind').textContent='Country / territory';
    $('selectionMetaTitle').textContent='Capital';
    $('selectionCapital').textContent=selected.capital?.city||'Not listed';
    $('selectionCoords').textContent=selected.capital?fmtCoord(selected.capital.lat,selected.capital.lon):'—';
    $('selectionFactTitle').textContent='Dual-disk planar area';
    const area=flatDiskFeatureAreaM2(feature,project);
    $('selectionFactValue').textContent=area==null?'Unavailable':formatArea(area);
    $('selectionButtons').style.display=selected.capital?'flex':'none';
    updateSelectionButtons();
    draw();
  }
  function assignSelection(index) {
    if(!selected?.capital)return;
    setPoint(index,{lat:selected.capital.lat,lon:selected.capital.lon,name:selected.capital.city});
    setMode('measure');
  }
  function applyCoordinates(index) {
    const lat=Number($('coord'+(index===0?'A':'B')+'Lat').value);
    const lon=Number($('coord'+(index===0?'A':'B')+'Lon').value);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180) {
      $('measureHelp').textContent='Enter a valid latitude from −90° to 90° and longitude from −180° to 180°.';
      return;
    }
    setPoint(index,{lat,lon,name:'Manual coordinates'});
  }
  function findCapitalAt(world,tolerancePx=10) {
    let best=null,distance=Infinity;
    for(const capital of capitals) {
      const point=project(capital.lat,capital.lon);
      const screen=worldToScreen(point.x,point.y);
      const query=worldToScreen(world.x,world.y);
      const delta=Math.hypot(screen.x-query.x,screen.y-query.y);
      if(delta<tolerancePx && delta<distance) { best=capital;distance=delta; }
    }
    return best;
  }
  function clickMap(event) {
    const rect=canvas.getBoundingClientRect();
    const screen={x:event.clientX-rect.left,y:event.clientY-rect.top};
    const world=screenToWorld(screen.x,screen.y);
    if(!validScreenPoint(world))return;
    const coordinate=unproject(world.x,world.y);
    if(!Number.isFinite(coordinate.lat)||!Number.isFinite(coordinate.lon))return;
    const capital=findCapitalAt(world,12);
    if(mode==='measure') {
      const point=capital?{lat:capital.lat,lon:capital.lon,name:capital.city}:coordinate;
      setPoint(points.length===0?0:1,point);
      updateStatus();
      return;
    }
    if(mode==='area') {
      areaPoints.push({lat:coordinate.lat,lon:coordinate.lon});
      areaFinished=false;
      updateAreaMeasurement();
      updateStatus();
      return;
    }
    if(capital) { selectCapital(capital);return; }
    for(let index=pathRecords.length-1;index>=0;index--) {
      const record=pathRecords[index];
      if(record.feature===antarcticaFeature&&!layers.antarctica)continue;
      if(ctx.isPointInPath(record.path,world.x,world.y,'evenodd')) {
        selectCountry(record.feature);
        return;
      }
    }
    selected={type:'coordinate',capital:null};
    $('selectionName').textContent='Map location';
    $('selectionKind').textContent='Selected planar map coordinate';
    $('selectionMetaTitle').textContent='Location';
    $('selectionCapital').textContent='—';
    $('selectionCoords').textContent=fmtCoord(coordinate.lat,coordinate.lon);
    $('selectionFactTitle').textContent='Geometry';
    $('selectionFactValue').textContent=coordinate.disk+' disk';
    $('selectionButtons').style.display='none';
    draw();
  }
  function updateStatus() {
    if(mode==='measure') $('status').textContent=points.length===0?'Distance mode · choose A':points.length===1?'Distance mode · choose B':'Dual-disk route complete';
    else if(mode==='area') $('status').textContent='Area mode · '+areaPoints.length+' vertices';
    else $('status').textContent='Dual-disk base map ready · '+countryFeatures.length+' countries · '+capitals.length+' capitals';
  }
  function drawSearchResults(query) {
    const box=$('suggestions');
    box.innerHTML='';
    if(!String(query||'').trim()){box.classList.remove('open');return;}
    const matches=findSearchMatches(searchIndex,query,10);
    if(!matches.length) {
      const empty=document.createElement('div');empty.className='suggestion';empty.textContent='No matching country, capital or U.S. county';box.append(empty);
    } else {
      for(const match of matches) {
        const item=document.createElement('div');
        item.className='suggestion';
        const name=match.type==='capital'?match.obj.city:match.obj.name;
        const detail=match.type==='capital'?(match.obj.countryName||'Capital'):match.type==='county'?'County · '+match.obj.stateCode:'Country';
        item.innerHTML='<b></b><small></small>';
        item.querySelector('b').textContent=name;
        item.querySelector('small').textContent=detail;
        item.addEventListener('click',()=>{
          if(match.type==='capital')selectCapital(match.obj);
          else if(match.type==='country')selectCountry(match.obj.feature||match.obj);
          else {
            selected={type:'coordinate',capital:null};
            $('selectionName').textContent=match.obj.name;
            $('selectionKind').textContent='U.S. county-equivalent reference point';
            $('selectionCoords').textContent=fmtCoord(match.obj.lat,match.obj.lon);
            $('selectionMetaTitle').textContent='Location';
            $('selectionCapital').textContent='—';
            $('selectionFactTitle').textContent='Reference point';
            $('selectionFactValue').textContent='Census Gazetteer';
            $('selectionButtons').style.display='none';
            draw();
          }
          box.classList.remove('open');
          $('search').value=name;
          updateStatus();
        });
        box.append(item);
      }
    }
    box.classList.add('open');
  }
  function fitView() {
    zoom=1;panX=0;panY=0;rotation=0;
    resize();
    $('mapRotationValue').textContent='0°';
    $('mapRotation').value='0';
    publishState('fit-view');
  }
  function setZoom(next,anchor=null) {
    const oldScale=currentScale();
    const world=anchor?screenToWorld(anchor.x,anchor.y):null;
    zoom=Math.max(0.4,Math.min(25,next));
    if(world&&anchor) {
      const rotatedX=world.x*Math.cos(rotation*DEG)-world.y*Math.sin(rotation*DEG);
      const rotatedY=world.x*Math.sin(rotation*DEG)+world.y*Math.cos(rotation*DEG);
      const scale=currentScale();
      panX=anchor.x-width/2-rotatedX*scale;
      panY=anchor.y-height/2-rotatedY*scale;
    }
    draw();
    publishState('zoom');
  }
  function setRotation(next) {
    rotation=((next%360)+360)%360;
    if(rotation>180)rotation-=360;
    $('mapRotation').value=String(Math.round(rotation));
    $('mapRotationValue').textContent=Math.round(rotation)+'°';
    draw();
    publishState('rotation');
  }
  function drawGeometryPanel() {
    const title=document.querySelector('map-geometry-panel h2');
    if(title)title.textContent='Dual-Disk Planar Geometry (R_eq = 10,000.8 km)';
    const note=document.querySelector('map-geometry-panel .note');
    if(note)note.textContent='Two equal circular disks are hinged at the Equator. Northern and Southern coordinates use the same 2D projection source. Same-disk routes are Euclidean chords; Cross-Equator routes are two Euclidean chords joined at the minimizing matching Equator-rim longitude. Polygon rings and coastlines are clipped at latitude 0° before projection.';
    const boxes=document.querySelectorAll('map-geometry-panel .info-box strong');
    if(boxes.length>=4) {
      boxes[0].textContent='2D planar km';
      boxes[1].textContent='Euclidean chord / hinge';
      boxes[2].textContent='Planar shoelace';
      boxes[3].textContent='1 or 2 straight segments';
    }
    $('geometryMetricFormula').innerHTML=
      'R_eq = 90° × 111.12 km = 10,000.8 km<br>'+
      'N: x = −R_eq + (90° − φ)·111.12·cos λ; y = r·sin λ<br>'+
      'S: x = +R_eq − (90° + φ)·111.12·cos λ; y = r·sin λ<br>'+
      'Same disk: D = √((Δx)² + (Δy)²)<br>'+
      'Cross Equator: min λ [ |A − E_N(λ)| + |E_S(λ) − B| ]';
    $('calibrationFormula').innerHTML=
      'R_eq = 90 × 111.12 = 10,000.8 km<br>'+
      'Northern disk centre = (−R_eq, 0)<br>'+
      'Southern disk centre = (+R_eq, 0)<br>'+
      'N: r = (90 − φ) × 111.12 km<br>'+
      'S: r = (90 + φ) × 111.12 km<br>'+
      'Both: y = r × sin λ';
    $('pathCalibrationStatus').textContent='Each hemisphere is a separate flat disk. The Equator is each disk rim, and Greenwich (0°) marks their shared hinge point at (0,0).';
    const rows=[];
    for(let lat=90;lat>=-90;lat-=15) {
      const disk=lat>=0?'N':'S';
      const radius=(90-Math.abs(lat))*111.12;
      const label=lat===0?'0°':Math.abs(lat)+'°'+(lat>0?'N':'S');
      rows.push('<tr><td>'+label+'</td><td>'+disk+'</td><td>'+radius.toLocaleString('en-US',{maximumFractionDigits:1})+' km</td></tr>');
    }
    $('radialRows').innerHTML=rows.join('');
    const headers=document.querySelectorAll('map-calibration-panel thead th');
    if(headers.length===3){headers[1].textContent='Disk';headers[2].textContent='Radius from pole';}
  }
  function updateStyle(style) {
    visualStyle=Object.hasOwn(palettes,style)?style:DEFAULT_STYLE;
    palette=palettes[visualStyle];
    document.documentElement.dataset.mapStyle=visualStyle;
    $('mapStyle').value=visualStyle;
    try{localStorage.setItem(STYLE_KEY,visualStyle);}catch{}
    draw();
  }
  async function loadMap() {
    if(loading)return;
    loading=true;loadError=null;
    $('mapViewport').setAttribute('aria-busy','true');
    $('mapLoading').hidden=false;
    $('mapLoadingTitle').textContent='Preparing dual-disk map';
    $('mapLoadingMessage').textContent='Loading country outlines, coastlines, capitals and search reference points…';
    $('retryMapLoading').hidden=true;
    try {
      const [countryData,capitalData,countyData,coastData]=await Promise.all([
        loadCountryDataset(mapQuality),loadCapitalDataset(),loadCountyDataset(),loadCoastlineDataset()
      ]);
      const allFeatures=countryData.features;
      antarcticaFeature=allFeatures.find(feature=>isoFor(feature)==='ATA'||nameFor(feature).toLowerCase()==='antarctica')||null;
      countryFeatures=allFeatures.filter(feature=>feature!==antarcticaFeature);
      const countryObjects=countryFeatures.map(feature=>({feature,name:nameFor(feature),iso:isoFor(feature),center:centroidOfFeature(feature)}));
      capitals=capitalData;
      counties=countyData;
      pathRecords=allFeatures.map(feature=>({feature,path:createFeaturePath(feature,project,feature===antarcticaFeature)}));
      antarcticaPath=antarcticaFeature?pathRecords.find(record=>record.feature===antarcticaFeature)?.path:null;
      coastlineData=coastData;
      coastlinePath=await createCoastlinePathAsync(coastlineData,project,globalThis.Path2D,{batchSize:32});
      searchIndex=buildSearchIndex({
        countries:countryObjects,
        capitals,
        counties,
        antarctica:antarcticaFeature?{feature:antarcticaFeature,name:'Antarctica'}:null
      });
      $('mapLoading').hidden=true;
      $('mapViewport').setAttribute('aria-busy','false');
      $('status').textContent='Dual-disk base map ready · '+countryFeatures.length+' countries · '+capitals.length+' capitals';
      updateMeasurement();
      updateAreaMeasurement();
      draw();
    } catch(error) {
      loadError=error;
      $('mapLoadingTitle').textContent='Map data could not be loaded';
      $('mapLoadingMessage').textContent=error.message;
      $('retryMapLoading').hidden=false;
      $('mapViewport').setAttribute('aria-busy','false');
    } finally { loading=false; }
  }

  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    pointer={x:event.clientX,y:event.clientY,panX,panY,rotation,rotate:event.shiftKey};
    moved=false;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',event=>{
    if(!pointer)return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(Math.hypot(dx,dy)>3)moved=true;
    if(pointer.rotate) setRotation(pointer.rotation+dx*.35);
    else {panX=pointer.panX+dx;panY=pointer.panY+dy;draw();}
  });
  canvas.addEventListener('pointerup',event=>{
    if(!pointer)return;
    const wasMoved=moved;
    pointer=null;canvas.classList.remove('dragging');
    if(!wasMoved)clickMap(event);
    else publishState('pan');
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    const rect=canvas.getBoundingClientRect();
    setZoom(zoom*(event.deltaY<0?1.15:1/1.15),{x:event.clientX-rect.left,y:event.clientY-rect.top});
  },{passive:false});
  window.addEventListener('resize',resize);
  $('zoomIn').addEventListener('click',()=>setZoom(zoom*1.25));
  $('zoomOut').addEventListener('click',()=>setZoom(zoom/1.25));
  $('resetView').addEventListener('click',fitView);
  $('rotateLeft').addEventListener('click',()=>setRotation(rotation-15));
  $('rotateRight').addEventListener('click',()=>setRotation(rotation+15));
  $('resetRotation').addEventListener('click',()=>setRotation(0));
  $('mapRotation').addEventListener('input',event=>setRotation(Number(event.target.value)));
  $('exploreMode').addEventListener('click',()=>setMode('explore'));
  $('measureMode').addEventListener('click',()=>setMode('measure'));
  $('areaMode').addEventListener('click',()=>setMode('area'));
  $('clearMeasure').addEventListener('click',()=>{points=[];updateMeasurement();});
  $('applyCoordsA').addEventListener('click',()=>applyCoordinates(0));
  $('applyCoordsB').addEventListener('click',()=>applyCoordinates(1));
  $('finishArea').addEventListener('click',()=>{if(areaPoints.length>=3){areaFinished=true;updateAreaMeasurement();}});
  $('undoArea').addEventListener('click',()=>{areaPoints.pop();areaFinished=false;updateAreaMeasurement();});
  $('clearArea').addEventListener('click',()=>{areaPoints=[];areaFinished=false;updateAreaMeasurement();});
  $('setA').addEventListener('click',()=>assignSelection(0));
  $('setB').addEventListener('click',()=>assignSelection(1));
  $('mapStyle').value=visualStyle;
  $('mapStyle').addEventListener('change',event=>updateStyle(event.target.value));
  $('mapQuality').value=mapQuality;
  $('mapQuality').addEventListener('change',event=>{
    mapQuality=Object.hasOwn(MAP_QUALITY_OPTIONS,event.target.value)?event.target.value:'medium';
    try{localStorage.setItem(QUALITY_KEY,mapQuality);}catch{}
    loadMap();
  });
  const layerIds={layerCountries:'countries',layerGrid:'grid',layerCapitals:'capitals',
    layerCapitalNames:'capitalNames',layerCountryNames:'countryNames',layerAntarctica:'antarctica',
    layerCoastlines:'coastlines'};
  for(const [id,key] of Object.entries(layerIds)) {
    $(id).checked=layers[key];
    $(id).addEventListener('change',event=>{layers[key]=event.target.checked;publishState('layer');draw();});
  }
  $('search').addEventListener('input',event=>drawSearchResults(event.target.value));
  document.addEventListener('click',event=>{
    if(!event.target.closest('.search-wrap'))$('suggestions').classList.remove('open');
  });
  $('retryMapLoading').addEventListener('click',loadMap);
  $('fullscreenMap').addEventListener('click',async()=>{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await $('mapCard').requestFullscreen();
  });
  $('mapToolsToggle').addEventListener('click',()=>{
    const stack=$('mapToolsStack'),open=!stack.classList.contains('is-open');
    stack.classList.toggle('is-open',open);
    $('mapToolsToggle').setAttribute('aria-expanded',String(open));
  });
  $('mobileToolsToggle').addEventListener('click',()=>{
    const open=!document.body.classList.contains('mobile-tools-open');
    document.body.classList.toggle('mobile-tools-open',open);
    $('mobileToolsToggle').setAttribute('aria-expanded',String(open));
  });
  $('toggleMeasurementDetails').addEventListener('click',()=>{
    const details=$('measurementDetails'),expanded=details.hidden;
    details.hidden=!expanded;
    $('toggleMeasurementDetails').setAttribute('aria-expanded',String(expanded));
    $('toggleMeasurementDetails').textContent=expanded?'Less':'Details';
  });
  $('exportPNG').addEventListener('click',()=>{
    draw();
    canvas.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),anchor=document.createElement('a');
      anchor.href=url;
      anchor.download='dual-disk-world-map-'+new Date().toISOString().slice(0,10)+'.png';
      anchor.click();
      URL.revokeObjectURL(url);
    },'image/png');
  });
  $('shareMap').addEventListener('click',async()=>{
    const url=new URL(location.href);
    url.search='';
    url.searchParams.set('style',visualStyle);
    url.searchParams.set('quality',mapQuality);
    url.searchParams.set('r',rotation.toFixed(1));
    if(points[0])url.searchParams.set('a',points[0].lat+','+points[0].lon);
    if(points[1])url.searchParams.set('b',points[1].lat+','+points[1].lon);
    if(areaPoints.length)url.searchParams.set('ap',areaPoints.map(point=>point.lat+','+point.lon).join(';'));
    try { await navigator.clipboard.writeText(url.toString()); $('status').textContent='Share link copied.'; }
    catch { $('status').textContent=url.toString(); }
  });

  // Restore shareable route/view state before the first completed render.
  const query=new URLSearchParams(location.search);
  if(query.has('style'))updateStyle(query.get('style'));
  if(query.has('quality')&&Object.hasOwn(MAP_QUALITY_OPTIONS,query.get('quality'))) {
    mapQuality=query.get('quality');$('mapQuality').value=mapQuality;
  }
  if(query.has('r')) {
    const requestedRotation=Number(query.get('r'));
    rotation=Number.isFinite(requestedRotation)?Math.max(-180,Math.min(180,requestedRotation)):0;
    $('mapRotation').value=String(Math.round(rotation));
    $('mapRotationValue').textContent=Math.round(rotation)+'°';
  }
  const readPoint=(key,name)=>{
    const value=query.get(key);if(!value)return null;
    const pair=value.split(',').map(Number);
    return pair.length===2&&pair.every(Number.isFinite)&&Math.abs(pair[0])<=90&&Math.abs(pair[1])<=180
      ?{lat:pair[0],lon:pair[1],name}:null;
  };
  const a=readPoint('a','Shared point A'),b=readPoint('b','Shared point B');
  points=a?(b?[a,b]:[a]):[];
  const area=query.get('ap');
  if(area)areaPoints=area.split(';').map(value=>value.split(',').map(Number))
    .filter(pair=>pair.length===2&&pair.every(Number.isFinite)&&Math.abs(pair[0])<=90&&Math.abs(pair[1])<=180)
    .map(pair=>({lat:pair[0],lon:pair[1]}));
  if(areaPoints.length>=3){areaFinished=true;mode='area';}
  else if(points.length)mode='measure';
  setMode(mode);
  drawGeometryPanel();
  resize();
  await loadMap();
})().catch(error=>{
  console.error('Dual-disk map initialization failed:',error);
  const status=document.getElementById('status');
  if(status)status.textContent='Map initialization failed: '+error.message;
});
