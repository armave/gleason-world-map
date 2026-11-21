import {rad,clamp,radialFraction,project as projectFlatDisk,unproject as unprojectFlatDisk,flatDiskLinePath,flatDiskDistanceMeters,flatDiskPolygonMetrics,flatDiskFeatureAreaM2} from './core/flat-disk.js';
import {measureDirectDistance,RESTRICTED_PARALLEL_LATITUDE} from './core/measurement-engine.js';
import {norm,fmtCoord,lonName,formatDistance,formatArea} from './core/format.js';
import {isoFor,nameFor,hashColor as hashColorForPalette,centroidOfFeature} from './data/geojson.js';
import {HISTORICAL_SCAN_URL,MAP_QUALITY_OPTIONS,loadCountryDataset,loadCapitalDataset,loadCountyDataset,loadCoastlineDataset,loadAntarcticAddDataset} from './data/datasets.js';
import {createFeaturePath} from './map/feature-paths.js';
import {createAntarcticSurfacePaths} from './map/antarctic-surfaces.js';
import {FLIGHT_CALIBRATION} from './core/flight-calibration-parameters.js';
import {drawIceWall as renderIceWall} from './map/ice-wall.js';
import {drawOceanLabels} from './map/ocean-labels.js';
import {createCoastlinePath,drawCoastlines as renderCoastlines} from './map/coastlines.js';
import {drawRegisteredHistoricalScan as renderRegisteredHistoricalScan,triangulateControlPoints} from './map/registration.js';
import {renderRadialCalibration} from './ui/calibration.js';
import {selectNonOverlappingLabels,shouldShowCapitalLabels,shouldShowCountryLabels,CAPITAL_LABEL_MAX_SCALE_KM,COUNTRY_LABEL_MAX_SCALE_KM,COUNTRY_LABEL_MIN_SCALE_KM} from './map/labels.js';
import {createProjectedMeasurementSegments,createProjectedSegmentLabels,measurementStrokeStyle} from './map/measurements.js';
import {rotatePoint,unrotatePoint,screenToWorldPoint,worldToScreenPoint,panForWorldCenterPoint,normalizeRotationDegrees,shortestRotationDelta,screenUprightRotation} from './map/view-transform.js';
import {buildSearchIndex,findSearchMatches} from './data/search-index.js';

(() => {
'use strict';

let historicalImage = null, historicalLoading = false, historicalFailed = false;
// The BPL scan is 4,773 × 6,794 px; the printed disk is about 3,610 px wide.
const historical = {enabled:false,opacity:45,centerX:50,centerY:50,diameter:75.6,scale:100,rotation:0};
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
let features = [], countries = [], capitals = [], counties = [], searchIndex = [], pathRecords = [], antarcticaFeature = null, antarcticaCountry = null, antarcticaPath = null, antarcticAddData = null, antarcticSurfacePaths = null, coastlineData = null, coastlinePath = null, landMaskPath = null, geometryBaseR = NaN, capitalByIso = new Map(), countryByIso = new Map();
let labelCollisionBoxes = [];
let baseR = 300, width = 800, height = 650, dpr = 1;
const MIN_ZOOM=1,MAX_ZOOM_SEARCH=20000,MAX_SCALE_BAR_READING_KM=50,SCALE_BAR_HEADROOM=.82,SCALE_BAR_MAX_WIDTH_PX=190;
const MAX_REGISTRATION_POINTS=30;
let zoom = 1, panX = 0, panY = 0, rotationDegrees = 0, rotationAnimationFrame = null, rotationAnimationTarget = 0, mode = 'explore', points = [], areaPoints = [], areaFinished = false, selected = null, hoveredCountry = null, hoveredCapital = null;
let pointerDown = null, didDrag = false, searchResults = [];
let boundaryScaleLabel='Natural Earth 1:50m';
const QUALITY_STORAGE_KEY='gleason-map:quality:v1',STYLE_STORAGE_KEY='gleason-map:style:v1';
const VISUAL_STYLES=Object.freeze({
 vintage:{canvas:'#f0e9d9',water:'#dcecf1',rim:'#91aab4',grid:'#9ba9a8',gridMinor:'#c0c5b7',equator:'#526f78',labels:'#405a62',outline:'#68746f',coastline:'#477486',coastHalo:'rgba(250,253,247,.94)',oceanLabel:'#355f70',seaLabel:'#4c6b76',labelHalo:'rgba(245,250,250,.96)',countryColors:['#cdb889','#b8c6a9','#d8cba9','#b8c2b0','#d4b995','#c1c9b8','#d9c6a1']},
 atlas:{canvas:'#edf2ec',water:'#b9d8e8',rim:'#557f91',grid:'#6f94a1',gridMinor:'#9db9c2',equator:'#315f73',labels:'#284f61',outline:'#456b72',coastline:'#315f73',coastHalo:'rgba(246,251,249,.96)',oceanLabel:'#244f66',seaLabel:'#3c6474',labelHalo:'rgba(241,248,248,.97)',countryColors:['#d7c8a2','#a8c7ab','#e3d29e','#aac3d0','#d9b99b','#b6c6a5','#e2c6a9']},
 clean:{canvas:'#f4f7f8',water:'#e4f0f6',rim:'#a1bdca',grid:'#b3c4cb',gridMinor:'#d3dfe3',equator:'#638795',labels:'#3f6170',outline:'#8b9ea7',coastline:'#6c8997',coastHalo:'rgba(255,255,255,.98)',oceanLabel:'#496a78',seaLabel:'#6a8792',labelHalo:'rgba(248,252,253,.98)',countryColors:['#d7e0d9','#e4e8d7','#d8e3e9','#eee1d0','#d6e0e8','#dce6d8','#e7ddd0']}
});
function readMapQuality(){try{const value=localStorage.getItem(QUALITY_STORAGE_KEY);return Object.hasOwn(MAP_QUALITY_OPTIONS,value)?value:'medium';}catch{return 'medium';}}
function readVisualStyle(){try{const value=localStorage.getItem(STYLE_STORAGE_KEY);return Object.hasOwn(VISUAL_STYLES,value)?value:'atlas';}catch{return 'atlas';}}
let mapQuality=readMapQuality(),visualStyle=readVisualStyle(),visualPalette=VISUAL_STYLES[visualStyle],loadGeneration=0;
document.documentElement.dataset.mapStyle=visualStyle;
let registrationPoints = [], registrationPickActive = false, pendingRegistrationGeo = null;
const layers = {countries:true,countryNames:true,grid:true,capitals:true,capitalNames:true,antarctica:true,oceanLabels:true,coastlines:true};
let colors=visualPalette.countryColors;
const hashColor=key=>hashColorForPalette(key,colors);
function applyVisualStyle(value,save=true){if(!Object.hasOwn(VISUAL_STYLES,value))value='vintage';visualStyle=value;visualPalette=VISUAL_STYLES[value];colors=visualPalette.countryColors;document.documentElement.dataset.mapStyle=value;const control=$('mapStyle');if(control)control.value=value;if(save){try{localStorage.setItem(STYLE_STORAGE_KEY,value);}catch(error){console.info('Map style preference could not be saved:',error);}}}
function rotationRadians(){return rad(rotationDegrees);}
function normalizeRotation(value){return normalizeRotationDegrees(value);}
function syncRotationReadout(){const output=$('mapRotationValue');if(output)output.textContent=Math.round(rotationDegrees)+'°';}
function syncRotationControls(sliderValue=rotationDegrees){const input=$('mapRotation');if(input)input.value=String(Math.round(sliderValue));syncRotationReadout();}
function cancelRotationAnimation(){if(rotationAnimationFrame!==null){cancelAnimationFrame(rotationAnimationFrame);rotationAnimationFrame=null;}}
function setRotation(value,redraw=true){if(!Number.isFinite(value))return;cancelRotationAnimation();rotationDegrees=normalizeRotation(value);rotationAnimationTarget=rotationDegrees;syncRotationControls();if(redraw)draw();}
function animateRotation(value){
 if(!Number.isFinite(value))return;
 rotationAnimationTarget=normalizeRotation(value);
 syncRotationControls(rotationAnimationTarget);
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){setRotation(rotationAnimationTarget);return;}
 if(rotationAnimationFrame!==null)return;
 let lastFrameTime=null;
 const animateFrame=now=>{
  if(lastFrameTime===null)lastFrameTime=now;
  const elapsed=Math.min(50,Math.max(0,now-lastFrameTime));
  lastFrameTime=now;
  const delta=shortestRotationDelta(rotationDegrees,rotationAnimationTarget);
  if(Math.abs(delta)<.08){
   rotationDegrees=rotationAnimationTarget;rotationAnimationFrame=null;syncRotationControls();draw();return;
  }
  const progress=1-Math.exp(-elapsed/95);
  rotationDegrees=normalizeRotation(rotationDegrees+delta*progress);
  syncRotationReadout();draw();
  rotationAnimationFrame=requestAnimationFrame(animateFrame);
 };
 rotationAnimationFrame=requestAnimationFrame(animateFrame);
}
function worldToScreen(x,y){return worldToScreenPoint(x,y,zoom,panX,panY,width,height,rotationRadians());}
function boxesOverlap(a,b,gap=0){return a.left<b.right+gap&&a.right+gap>b.left&&a.top<b.bottom+gap&&a.bottom+gap>b.top;}
function reserveScreenUiCollisionBoxes(){
 // Compass and scale bar are fixed to the viewport, so geographic labels must leave them clear.
 labelCollisionBoxes.push(
  {left:2,top:2,right:62,bottom:62},
  {left:2,top:Math.max(0,height-54),right:Math.min(width,230),bottom:height-1}
 );
 const canvasRect=canvas.getBoundingClientRect(),dockRect=$('mapToolsStack').getBoundingClientRect();
 if(dockRect.width>0&&dockRect.height>0){
  const box={left:dockRect.left-canvasRect.left,top:dockRect.top-canvasRect.top,right:dockRect.right-canvasRect.left,bottom:dockRect.bottom-canvasRect.top};
  if(box.right>0&&box.left<width&&box.bottom>0&&box.top<height)labelCollisionBoxes.push(box);
 }
}
function drawUprightMapText(text,x,y,{reserve=true,avoidReserved=false}={}){
 const screen=worldToScreen(x,y);
 if(!Number.isFinite(screen.x)||!Number.isFinite(screen.y))return false;
 const metrics=ctx.measureText(text),fontSize=Number.parseFloat(ctx.font)||9;
 const widthPx=metrics.width*zoom,heightPx=fontSize*zoom;
 const box={left:screen.x-widthPx/2-3,top:screen.y-heightPx/2-2,right:screen.x+widthPx/2+3,bottom:screen.y+heightPx/2+2};
 if(box.left<1||box.top<1||box.right>width-1||box.bottom>height-1)return false;
 if(avoidReserved&&labelCollisionBoxes.some(other=>boxesOverlap(box,other,3)))return false;
 if(reserve)labelCollisionBoxes.push(box);
 ctx.save();ctx.translate(x,y);ctx.rotate(screenUprightRotation(0,rotationRadians()));ctx.fillText(text,0,0);ctx.restore();
 return true;
}
function screenToWorld(sx,sy){return screenToWorldPoint(sx,sy,zoom,panX,panY,width,height,rotationRadians());}
const project=(lon,lat)=>projectFlatDisk(lon,lat,baseR);
const unproject=(x,y)=>unprojectFlatDisk(x,y,baseR);
const makePath=(feature,preserveAntarcticRim=false)=>createFeaturePath(feature,project,preserveAntarcticRim);
function resize(){
 const rect=canvas.getBoundingClientRect();
 width=rect.width;height=rect.height;
 dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);
 const nextBaseR=Math.min(width,height)*.405;
 if(!Number.isFinite(geometryBaseR)||Math.abs(nextBaseR-geometryBaseR)>1e-6){
  baseR=nextBaseR;
  pathRecords=countries.map(country=>({country,path:makePath(country.feature)}));
  antarcticaPath=antarcticaFeature?makePath(antarcticaFeature,true):null;
  antarcticSurfacePaths=antarcticAddData?createAntarcticSurfacePaths(antarcticAddData,project):null;
  landMaskPath=new Path2D();
  for(const record of pathRecords)landMaskPath.addPath(record.path);
  if(antarcticaPath)landMaskPath.addPath(antarcticaPath);
  coastlinePath=coastlineData?createCoastlinePath(coastlineData,project):null;
  geometryBaseR=baseR;
 }else baseR=nextBaseR;
 draw();
}
function drawDiskBase(){ctx.beginPath();ctx.arc(0,0,baseR,0,Math.PI*2);ctx.fillStyle=visualPalette.water;ctx.fill();ctx.strokeStyle=visualPalette.rim;ctx.lineWidth=1.5/zoom;ctx.stroke();}
function drawGrid(){ctx.save();const latitudes=[75,60,45,30,15,0,-15,-30,-45,-60,-75];for(const lat of latitudes){if(lat===RESTRICTED_PARALLEL_LATITUDE)continue;const r=baseR*radialFraction(lat);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.strokeStyle=lat===0?visualPalette.equator:visualPalette.grid;ctx.lineWidth=(lat===0?1.55:.65)/zoom;ctx.setLineDash(lat===0?[]:[3/zoom,4/zoom]);ctx.stroke();}ctx.setLineDash([]);for(let d=0;d<360;d+=15){const [x,y]=project(d,-90);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(x,y);ctx.strokeStyle=d%30===0?visualPalette.grid:visualPalette.gridMinor;ctx.lineWidth=(d%30===0?.82:.42)/zoom;ctx.stroke();}ctx.beginPath();ctx.arc(0,0,2.4/zoom,0,Math.PI*2);ctx.fillStyle=visualPalette.labels;ctx.fill();ctx.restore();}
function drawCompassRose(){
 const cx=31,cy=31,r=14,angle=rotationRadians();
 ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.translate(cx,cy);
 ctx.beginPath();ctx.arc(0,0,r*1.72,0,Math.PI*2);ctx.fillStyle='rgba(255,253,246,.92)';ctx.fill();
 ctx.strokeStyle=visualPalette.labels;ctx.lineWidth=1;ctx.stroke();
 ctx.rotate(angle);ctx.beginPath();
 for(let i=0;i<16;i++){const a=-Math.PI/2+i*Math.PI/8,rr=i%2===0?r:r*.32,x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
 ctx.closePath();ctx.fillStyle='rgba(255,253,246,.78)';ctx.fill();ctx.strokeStyle=visualPalette.labels;ctx.lineWidth=1.15;ctx.stroke();
 ctx.beginPath();ctx.moveTo(0,-r*.9);ctx.lineTo(0,r*.9);ctx.moveTo(-r*.9,0);ctx.lineTo(r*.9,0);ctx.stroke();
 ctx.fillStyle=visualPalette.labels;ctx.font='700 8px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';
 for(const [label,x,y] of [['N',0,-r*1.38],['S',0,r*1.38],['W',-r*1.38,0],['E',r*1.38,0]]){
  ctx.save();ctx.translate(x,y);ctx.rotate(-angle);ctx.fillText(label,0,0);ctx.restore();
 }
 ctx.restore();
}
function drawAnnotations(){
 ctx.save();ctx.setLineDash([]);ctx.textAlign='center';ctx.textBaseline='middle';const ringLabels=[75,60,45,30,15,0,-15,-30,-45,-60,-75],labelAngle=rad(225);
 for(const lat of ringLabels){const r=baseR*radialFraction(lat),x=r*Math.sin(labelAngle),y=-r*Math.cos(labelAngle),label=lat===0?'EQUATOR':`${Math.abs(lat)}°${lat>0?'N':'S'}`;ctx.font=`${lat===0?'700':'600'} ${(lat===0?9.5:8.5)/Math.max(.85,zoom*.65)}px ui-sans-serif,system-ui`;ctx.fillStyle=visualPalette.labels;drawUprightMapText(label,x,y,{avoidReserved:true});}
 for(let d=0;d<360;d+=5){const a=rad(d),r1=baseR*(d%15===0?1.012:1.004),r2=baseR*1.022;ctx.strokeStyle=visualPalette.labels;ctx.lineWidth=(d%15===0?1:.55)/zoom;ctx.beginPath();ctx.moveTo(r1*Math.cos(a),-r1*Math.sin(a));ctx.lineTo(r2*Math.cos(a),-r2*Math.sin(a));ctx.stroke();if(d%15===0){const rt=baseR*1.055;ctx.fillStyle=visualPalette.labels;ctx.font=`600 ${9/Math.max(.85,zoom*.6)}px ui-sans-serif,system-ui`;drawUprightMapText(lonName(d),rt*Math.cos(a),-rt*Math.sin(a),{avoidReserved:true});}}
 ctx.restore();
}
function drawCountries(){for(const rec of pathRecords){const c=rec.country;ctx.fillStyle=hashColor(c.iso);ctx.globalAlpha=.93;ctx.fill(rec.path,'evenodd');ctx.globalAlpha=1;ctx.strokeStyle=visualPalette.outline;ctx.lineWidth=.62/zoom;ctx.stroke(rec.path);}
 if(hoveredCountry){const rec=pathRecords.find(x=>x.country===hoveredCountry);if(rec){ctx.fillStyle='#d18b57';ctx.globalAlpha=.30;ctx.fill(rec.path,'evenodd');ctx.globalAlpha=1;ctx.strokeStyle='#8c482b';ctx.lineWidth=2/zoom;ctx.stroke(rec.path);}}
 if(selected&&selected.type==='country'){const rec=pathRecords.find(x=>x.country===selected.country);if(rec){ctx.strokeStyle='#a44d2b';ctx.lineWidth=2.6/zoom;ctx.stroke(rec.path);}}
}
function drawCoastlinesLayer(){if(!layers.coastlines||!coastlinePath)return;const localScale=scaleBarReadingKm();if(mapQuality==='high'&&localScale<=500)return;renderCoastlines(ctx,coastlinePath,zoom,visualPalette);}
function drawIceWall(){
 renderIceWall(ctx,antarcticaPath,baseR,zoom,rotationRadians(),antarcticSurfacePaths);
 if(selected?.type==='country'&&selected.country?.iso==='ATA'&&antarcticaPath){
  ctx.save();ctx.strokeStyle='#a44d2b';ctx.lineWidth=2.6/zoom;ctx.stroke(antarcticaPath);ctx.restore();
 }
}
function drawRestrictedParallel(){
 const radius=baseR*radialFraction(RESTRICTED_PARALLEL_LATITUDE);
 if(!Number.isFinite(radius)||radius<=0)return;
 ctx.save();
 ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);
 ctx.strokeStyle='rgba(255,250,238,.98)';ctx.lineWidth=4.6/zoom;ctx.setLineDash([]);ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);
 ctx.strokeStyle='#a63f38';ctx.lineWidth=2.2/zoom;ctx.setLineDash([8/zoom,5/zoom]);ctx.stroke();
 ctx.setLineDash([]);
 for(let degree=0;degree<360;degree+=10){
  const angle=rad(degree),inner=radius-4/zoom,outer=radius+4/zoom;
  ctx.beginPath();ctx.moveTo(inner*Math.cos(angle),-inner*Math.sin(angle));
  ctx.lineTo(outer*Math.cos(angle),-outer*Math.sin(angle));
  ctx.strokeStyle='rgba(142,53,46,.72)';ctx.lineWidth=1/zoom;ctx.stroke();
 }
 // Opposing callouts identify the 60°S restricted-line reference.
 const label='60°S · RESTRICTED LINE';
 ctx.font='800 '+(10/zoom)+'px ui-sans-serif,system-ui';
 for(const degree of [45,225]){
  const angle=rad(degree),x=radius*Math.cos(angle),y=-radius*Math.sin(angle);
  drawMeasurementLabelAtMap(x,y,label,'restricted');
 }
 ctx.restore();
}
function drawCapitals(){
 if(!layers.capitals)return;
 const labelOn=layers.capitalNames&&(shouldShowCapitalLabels(scaleBarReadingKm())||(selected&&selected.type==='capital')),candidates=[];
 for(const p of capitals){
  const [x,y]=project(p.lon,p.lat),active=selected&&selected.type==='capital'&&selected.capital===p;
  ctx.beginPath();ctx.arc(x,y,(active?4.4:2.1)/zoom,0,Math.PI*2);
  ctx.fillStyle=active?'#a8492f':'#314f59';ctx.fill();ctx.strokeStyle='#fff9e9';ctx.lineWidth=.7/zoom;ctx.stroke();
  if(labelOn){
   const screen=worldToScreen(x,y),sx=screen.x,sy=screen.y;
   if(sx<-12||sx>width+12||sy<-12||sy>height+12)continue;
   const labelFontSize=Math.min(16,10+2*Math.log2(Math.max(1,zoom)));
   ctx.font=`600 ${labelFontSize/zoom}px ui-sans-serif,system-ui`;
   const text=p.city,tw=ctx.measureText(text).width*zoom,labelX=x+4/zoom,labelY=y-3/zoom,labelScreen=worldToScreen(labelX,labelY);
   candidates.push({point:p,x,y,labelX,labelY,text,selected:!!active,labelFontSize,centerDistance:Math.hypot(sx-width/2,sy-height/2),
    box:{left:labelScreen.x-2,top:labelScreen.y-labelFontSize/2-2,right:labelScreen.x+tw+2,bottom:labelScreen.y+labelFontSize/2+2}});
  }
 }
 if(labelOn){
  candidates.sort((a,b)=>Number(b.selected)-Number(a.selected)||a.centerDistance-b.centerDistance||a.text.length-b.text.length);
  const visible=selectNonOverlappingLabels(candidates,labelCollisionBoxes,4);labelCollisionBoxes.push(...visible.map(item=>item.box));
  ctx.textAlign='left';ctx.textBaseline='middle';
  for(const item of visible){ctx.save();ctx.translate(item.labelX,item.labelY);ctx.rotate(screenUprightRotation(0,rotationRadians()));ctx.font=`600 ${item.labelFontSize/zoom}px ui-sans-serif,system-ui`;ctx.lineWidth=2.4/zoom;ctx.strokeStyle='rgba(255,250,238,.92)';ctx.strokeText(item.text,0,0);ctx.fillStyle='#243a43';ctx.fillText(item.text,0,0);ctx.restore();}
 }
}
function drawCountryLabels(){
 const showCountryLabels=shouldShowCountryLabels(scaleBarReadingKm());
 const selectedCountry=selected&&selected.type==='country'?selected.country:null;
 if(!layers.countryNames||(!showCountryLabels&&!selectedCountry)||!countries.length)return;
 const screenFontSize=Math.min(13,9.5+Math.max(0,zoom-1)*.65);
 ctx.font=`600 ${screenFontSize/zoom}px Georgia,serif`;
 const candidates=[];
 for(const country of countries){
  if(!showCountryLabels&&country!==selectedCountry)continue;
  const anchor=country.center;
  if(!anchor||!Number.isFinite(anchor.lat)||!Number.isFinite(anchor.lon))continue;
  const [x,y]=project(anchor.lon,anchor.lat);
  if(Math.hypot(x,y)>baseR*.995)continue;
  const screen=worldToScreen(x,y),sx=screen.x,sy=screen.y;
  if(sx<-100||sx>width+100||sy<-22||sy>height+22)continue;
  const text=String(country.name||'').toLocaleUpperCase();
  if(!text)continue;
  const textWidth=ctx.measureText(text).width*zoom;
  if(textWidth>170&&zoom<1.45)continue;
  const widthPx=textWidth+8,heightPx=screenFontSize+5;
  const active=selected&&selected.type==='country'&&selected.country===country;
  const population=Number(country.feature?.properties?.POP_EST)||0;
  candidates.push({country,x,y,text,selected:!!active,screenFontSize,population,
   centerDistance:Math.hypot(sx-width/2,sy-height/2),
   box:{left:sx-widthPx/2,top:sy-heightPx/2,right:sx+widthPx/2,bottom:sy+heightPx/2}});
 }
 candidates.sort((a,b)=>Number(b.selected)-Number(a.selected)||b.population-a.population||a.centerDistance-b.centerDistance);
 const visible=selectNonOverlappingLabels(candidates,labelCollisionBoxes,5);
 labelCollisionBoxes.push(...visible.map(item=>item.box));
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const item of visible){
  ctx.save();ctx.translate(item.x,item.y);ctx.rotate(screenUprightRotation(0,rotationRadians()));
  ctx.font=`600 ${item.screenFontSize/zoom}px Georgia,serif`;
  ctx.lineJoin='round';ctx.lineWidth=3.2/zoom;
  ctx.strokeStyle='rgba(255,250,238,.96)';ctx.strokeText(item.text,0,0);
  ctx.fillStyle=item.selected?'#994d30':'#6e563b';ctx.fillText(item.text,0,0);
  ctx.restore();
 }
}
function strokeMeasurementConnector(tool){
 const style=measurementStrokeStyle(tool,zoom);
 ctx.save();
 ctx.lineCap='round';ctx.lineJoin='round';
 ctx.setLineDash(style.dash);ctx.lineDashOffset=0;
 // A parchment halo preserves visibility over land, water, and the historical scan.
 ctx.strokeStyle=style.halo;ctx.lineWidth=style.haloWidth;ctx.stroke();
 ctx.strokeStyle=style.color;ctx.lineWidth=style.lineWidth;ctx.stroke();
 ctx.restore();
}
function formatMeasurementKilometres(meters){
 if(!Number.isFinite(meters)||meters<0)return '—';
 return `${(meters/1000).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})} km`;
}
function formatMeasurementSquareKilometres(areaM2){
 if(!Number.isFinite(areaM2)||areaM2<0)return '—';
 return `${(areaM2/1e6).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} km²`;
}
function drawMeasurementLabelAtMap(x,y,text,kind='distance'){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!text)return;
 const screen=worldToScreen(x,y);
 if(!Number.isFinite(screen.x)||!Number.isFinite(screen.y))return;
 ctx.save();
 // Measurement tags follow their map anchor but stay screen-upright and zoom-invariant.
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.font='700 11px ui-sans-serif,system-ui,sans-serif';
 const paddingX=8,boxHeight=20,boxWidth=ctx.measureText(text).width+paddingX*2;
 let labelX=screen.x,labelY=screen.y;
 const mapCenterX=width/2+panX,mapCenterY=height/2+panY;
 const dx=labelX-mapCenterX,dy=labelY-mapCenterY,radialDistance=Math.hypot(dx,dy);
 const radialLimit=Math.max(0,baseR*zoom-Math.hypot(boxWidth/2,boxHeight/2)-3);
 if(radialDistance>radialLimit&&radialDistance>0){
  const factor=radialLimit/radialDistance;
  labelX=mapCenterX+dx*factor;labelY=mapCenterY+dy*factor;
 }
 if(labelX+boxWidth/2<0||labelX-boxWidth/2>width||
    labelY+boxHeight/2<0||labelY-boxHeight/2>height){ctx.restore();return;}
 const isArea=kind==='area';
 if(kind==='restricted'){
  // Keep the callout attached to its map coordinate, but constrain its text
  // to the readable half-plane so rotation never leaves it vertical/upside-down.
  const angle=rotationRadians();
  let readableAngle=((angle+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2;
  ctx.translate(labelX,labelY);ctx.rotate(readableAngle);labelX=0;labelY=0;
 }
 ctx.fillStyle='rgba(255,250,238,.96)';
 ctx.strokeStyle=isArea?'#3f7285':'#b45c39';
 ctx.lineWidth=1;
 ctx.fillRect(labelX-boxWidth/2,labelY-boxHeight/2,boxWidth,boxHeight);
 ctx.strokeRect(labelX-boxWidth/2,labelY-boxHeight/2,boxWidth,boxHeight);
 ctx.fillStyle=isArea?'#315d6c':'#87452e';
 ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText(text,labelX,labelY+.5);
 ctx.restore();
}
function projectedPolygonLabelAnchor(vertices){
 const projected=vertices.map(point=>project(point.lon,point.lat));
 if(projected.length<3||projected.some(point=>!point.every(Number.isFinite)))return null;
 let twiceArea=0,centroidX=0,centroidY=0,meanX=0,meanY=0;
 for(let i=0;i<projected.length;i++){
  const a=projected[i],b=projected[(i+1)%projected.length];
  const cross=a[0]*b[1]-b[0]*a[1];
  twiceArea+=cross;
  centroidX+=(a[0]+b[0])*cross;
  centroidY+=(a[1]+b[1])*cross;
  meanX+=a[0];meanY+=a[1];
 }
 if(Math.abs(twiceArea)>1e-9)return {x:centroidX/(3*twiceArea),y:centroidY/(3*twiceArea)};
 return {x:meanX/projected.length,y:meanY/projected.length};
}
function drawMeasure(){
 if(points.length===2){
  // Draw and measure one straight projected A–B segment in the flat-disk plane.
  const path=flatDiskLinePath(points[0],points[1],project);
  if(path.length===2){
   ctx.beginPath();ctx.moveTo(path[0][0],path[0][1]);ctx.lineTo(path[1][0],path[1][1]);
   strokeMeasurementConnector('distance');
   const measurement=measureDirectDistance(points[0],points[1]);
   const label=formatMeasurementKilometres(measurement.distanceMeters);
   drawMeasurementLabelAtMap(
    (path[0][0]+path[1][0])/2,(path[0][1]+path[1][1])/2,label,'distance'
   );
  }
 }
 points.forEach((p,i)=>{const [x,y]=project(p.lon,p.lat);ctx.beginPath();ctx.arc(x,y,6/zoom,0,Math.PI*2);ctx.fillStyle=i===0?'#b35b36':'#3c7189';ctx.fill();ctx.strokeStyle='#fffdf6';ctx.lineWidth=1.8/zoom;ctx.stroke();ctx.font=`bold ${8/zoom}px ui-sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';drawUprightMapText(i===0?'A':'B',x,y+.3/zoom);});
}
function drawArea(){
 if(!areaPoints.length)return;
 ctx.save();
 const closed=areaFinished&&areaPoints.length>=3;
 const segments=createProjectedMeasurementSegments(areaPoints,project,closed);
 if(segments.length){
  ctx.beginPath();
  const first=project(areaPoints[0].lon,areaPoints[0].lat);ctx.moveTo(first[0],first[1]);
  for(const segment of segments)ctx.lineTo(segment[1][0],segment[1][1]);
  if(closed){ctx.closePath();ctx.fillStyle='rgba(79,126,143,.18)';ctx.fill();}
  strokeMeasurementConnector('area');
 }
 areaPoints.forEach((point,i)=>{const [x,y]=project(point.lon,point.lat);ctx.beginPath();ctx.arc(x,y,5/zoom,0,Math.PI*2);ctx.fillStyle='#4f7e8f';ctx.fill();ctx.strokeStyle='#fffdf6';ctx.lineWidth=1.4/zoom;ctx.stroke();ctx.fillStyle='#fff';ctx.font=`bold ${7/zoom}px ui-sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';drawUprightMapText(String(i+1),x,y);});
 // Each edge label uses the same projected-plane kilometres as the polygon perimeter.
 const edgeLabels=createProjectedSegmentLabels(areaPoints,project,flatDiskDistanceMeters,closed);
 edgeLabels.forEach(label=>drawMeasurementLabelAtMap(
  label.x,label.y,formatMeasurementKilometres(label.meters),'area'
 ));
 if(closed){
  const metrics=flatDiskPolygonMetrics(areaPoints,project,baseR);
  const anchor=projectedPolygonLabelAnchor(areaPoints);
  if(metrics&&anchor)drawMeasurementLabelAtMap(anchor.x,anchor.y,formatMeasurementSquareKilometres(metrics.areaM2),'area');
 }
 ctx.restore();
}
function syncMeasurementActionButtons(){
 $('clearMeasure').disabled=points.length===0;
 $('finishArea').disabled=areaPoints.length<3||areaFinished;
 $('undoArea').disabled=areaPoints.length===0;
 $('clearArea').disabled=areaPoints.length===0;
 $('finishArea').classList.toggle('is-complete',areaFinished);
 $('finishArea').querySelector('.button-label').textContent=areaFinished?'Finished':'Finish';
}
function updateAreaMeasurement(){
 $('areaVertexCount').textContent=areaPoints.length+' vertices';
 if(areaFinished&&areaPoints.length>=3){
  const result=flatDiskPolygonMetrics(areaPoints,project,baseR);
  if(result){
   $('areaValue').textContent=formatArea(result.areaM2);
   $('areaPerimeter').textContent='Planar perimeter · '+formatDistance(result.perimeterM);
   $('areaHelp').textContent='Planar area and perimeter on the flat disk. Edges may cross 60°S.';
  }else{
   $('areaValue').textContent='Unavailable';
   $('areaPerimeter').textContent='Invalid polygon · check for crossing edges';
   $('areaHelp').textContent='Check that polygon edges do not self-intersect and that at least three valid vertices are set.';
  }
 }else{
  $('areaValue').textContent='—';
  $('areaPerimeter').textContent='Area not calculated';
  $('areaHelp').textContent=areaPoints.length
   ?'Add vertices, then finish to calculate planar area and perimeter.'
   :'Click at least three points, then finish to calculate area and perimeter.';
 }
 syncMeasurementActionButtons();
}
function finishArea(){
 if(areaPoints.length<3){$('areaHelp').textContent='An area needs at least three distinct vertices.';return;}
 areaFinished=true;updateAreaMeasurement();draw();updateStatus();
}
function drawHistoricalOverlay(){
 if(!historical.enabled||!historicalImage||!historicalImage.complete||!historicalImage.naturalWidth)return;
 if(registrationPoints.length>=3&&drawRegisteredHistoricalScan())return;
 const iw=historicalImage.naturalWidth,ih=historicalImage.naturalHeight,minSide=Math.min(iw,ih);
 const cropSize=Math.min(minSide,minSide*historical.diameter/100);
 const sx=clamp(iw*historical.centerX/100-cropSize/2,0,iw-cropSize);
 const sy=clamp(ih*historical.centerY/100-cropSize/2,0,ih-cropSize);
 const destRadius=baseR*historical.scale/100;
 ctx.save();ctx.beginPath();ctx.arc(0,0,baseR,0,Math.PI*2);ctx.clip();ctx.rotate(rad(historical.rotation));ctx.globalAlpha=historical.opacity/100;
 ctx.drawImage(historicalImage,sx,sy,cropSize,cropSize,-destRadius,-destRadius,destRadius*2,destRadius*2);ctx.restore();
}
function draw(){
 if(!width||!height)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle=visualPalette.canvas;ctx.fillRect(0,0,width,height);
 labelCollisionBoxes=[];reserveScreenUiCollisionBoxes();ctx.save();ctx.translate(width/2+panX,height/2+panY);ctx.scale(zoom,zoom);ctx.rotate(rotationRadians());drawDiskBase();
 // Draw geographic geometry first; labels are placed afterward against a shared collision map.
 ctx.save();ctx.beginPath();ctx.arc(0,0,baseR,0,Math.PI*2);ctx.clip();
 if(layers.grid)drawGrid();
 if(layers.countries)drawCountries();
 drawCoastlinesLayer();
 if(layers.antarctica)drawIceWall();
 drawHistoricalOverlay();drawRestrictedParallel();
 ctx.restore();
 if(layers.grid)drawAnnotations();
 ctx.save();ctx.beginPath();ctx.arc(0,0,baseR,0,Math.PI*2);ctx.clip();
 drawCapitals();drawCountryLabels();
 if(layers.oceanLabels){
  const oceanBoxes=drawOceanLabels(ctx,project,baseR,zoom,scaleBarReadingKm(),{
   width,height,panX,panY,rotation:rotationRadians(),palette:visualPalette,reservedBoxes:labelCollisionBoxes,selectNonOverlappingLabels,
   isLand:(x,y)=>landMaskPath?ctx.isPointInPath(landMaskPath,x,y,'evenodd'):pathRecords.some(rec=>ctx.isPointInPath(rec.path,x,y,'evenodd'))
  });
  labelCollisionBoxes.push(...oceanBoxes);
 }
 drawMeasure();drawArea();
 ctx.restore();
 ctx.restore();
 drawCompassRose();
 drawScaleBar();updateViewReadout();
}
function updateViewReadout(){
 const readout=$('zoomReadout');if(!readout)return;
 readout.textContent=`${Math.round(zoom*100)}%`;
 const localScale=scaleBarReadingKm(),scaleText=Number.isFinite(localScale)?formatDistance(localScale*1000):'unavailable';
 const cap=layers.capitalNames?(shouldShowCapitalLabels(localScale)?'capital names visible':`capital names at ${CAPITAL_LABEL_MAX_SCALE_KM.toLocaleString()} km`):'capital names off';
 const countryNames=!layers.countryNames?'country names off':shouldShowCountryLabels(localScale)?'country names visible':localScale>COUNTRY_LABEL_MAX_SCALE_KM?`country names at ${COUNTRY_LABEL_MAX_SCALE_KM.toLocaleString()} km`:`country names hidden below ${COUNTRY_LABEL_MIN_SCALE_KM} km`;
 readout.title=`Zoom ${Math.round(zoom*100)}% · orientation ${Math.round(rotationDegrees)}° · local flat-disk scale ${scaleText} · zoom-in limit ${MAX_SCALE_BAR_READING_KM} km · ${cap} · ${countryNames}`;
}
function findCountryAt(x,y){
 if(layers.antarctica&&antarcticaCountry&&antarcticaPath&&ctx.isPointInPath(antarcticaPath,x,y,'evenodd'))return antarcticaCountry;
 if(!layers.countries)return null;
 for(let i=pathRecords.length-1;i>=0;i--){const rec=pathRecords[i];if(ctx.isPointInPath(rec.path,x,y,'evenodd'))return rec.country;}
 return null;
}
function findCapitalAt(x,y,tol=8){if(!layers.capitals)return null;let best=null,bd=Infinity;for(const p of capitals){const [cx,cy]=project(p.lon,p.lat);const d=Math.hypot(cx-x,cy-y);if(d<tol/zoom&&d<bd){best=p;bd=d;}}return best;}
function mapCoords(e){const rect=canvas.getBoundingClientRect();const sx=e.clientX-rect.left,sy=e.clientY-rect.top;const point=screenToWorld(sx,sy);return {x:point.x,y:point.y,sx,sy};}
function updateStatus(){if(mode==='measure'){if(points.length===0)$('status').textContent='Distance mode · Choose point A';else if(points.length===1)$('status').textContent='Distance mode · Choose point B';else $('status').textContent='Direct-line distance complete';}else if(mode==='area'){$('status').textContent='Area mode · '+areaPoints.length+' vertices · '+(areaFinished?'polygon finished':'add boundary points');}else{$('status').textContent=hoveredCountry?'Country: '+hoveredCountry.name:hoveredCapital?'Capital: '+hoveredCapital.city:'Explore mode · '+(countries.length+(antarcticaCountry?1:0))+' countries/areas · '+capitals.length+' capital points';}}
function showCountry(c){const cap=capitalByIso.get(c.iso)||null;selected={type:'country',country:c,capital:cap};$('selectionName').textContent=c.name;$('selectionKind').textContent=`Country / territory · ${boundaryScaleLabel} boundary`;$('selectionMetaTitle').textContent='Capital';$('selectionCapital').textContent=cap?cap.city:'Not listed';$('selectionCoords').textContent=cap?fmtCoord(cap.lat,cap.lon):'—';const area=flatDiskFeatureAreaM2(c.feature,project,baseR,{preserveAntarcticRim:c.iso==='ATA'||c.name==='Antarctica'});$('selectionFactTitle').textContent='Flat-disk planar area from projected boundary';$('selectionFactValue').textContent=area==null?'Unavailable':formatArea(area);$('selectionButtons').style.display=cap?'flex':'none';$('setA').disabled=!cap;$('setB').disabled=!cap||points.length===0;draw();}
function showCapital(p){const c=countryByIso.get(p.iso);selected={type:'capital',capital:p,country:c||null};$('selectionName').textContent=p.city;$('selectionKind').textContent=`Capital of ${p.countryName||c?.name||'country'}`;$('selectionMetaTitle').textContent='Capital';$('selectionCapital').textContent=p.city;$('selectionCoords').textContent=fmtCoord(p.lat,p.lon);$('selectionFactTitle').textContent='Flat-disk planar area from projected boundary';const area=c?flatDiskFeatureAreaM2(c.feature,project,baseR,{preserveAntarcticRim:c.iso==='ATA'||c.name==='Antarctica'}):null;$('selectionFactValue').textContent=area==null?'—':formatArea(area);$('selectionButtons').style.display='flex';$('setA').disabled=false;$('setB').disabled=points.length===0;draw();}
const US_STATE_NAMES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',PR:'Puerto Rico',AS:'American Samoa',GU:'Guam',MP:'Northern Mariana Islands',VI:'U.S. Virgin Islands'};
function showCounty(county){
 selected={type:'county',county};$('selectionName').textContent=county.name;
 $('selectionKind').textContent=`U.S. county-equivalent search result · 2026 Census Gazetteer · ${US_STATE_NAMES[county.stateCode]||county.stateCode}`;
 $('selectionMetaTitle').textContent='State';$('selectionCapital').textContent=US_STATE_NAMES[county.stateCode]||county.stateCode;
 $('selectionCoords').textContent=fmtCoord(county.lat,county.lon);
 $('selectionFactTitle').textContent='Census GEOID';$('selectionFactValue').textContent=county.geoid;
 $('selectionButtons').style.display='none';draw();
}
function syncCoordinateInputs(){
 const fields=[['coordALat',0,'lat'],['coordALon',0,'lon'],['coordBLat',1,'lat'],['coordBLon',1,'lon']];
 for(const [id,index,key] of fields){
  const field=$(id);if(!field)continue;
  const point=points[index];field.value=point?Number(point[key]).toFixed(5):'';
 }
}
function applyCoordinateEndpoint(index){
 const prefix=index===0?'coordA':'coordB';
 const lat=Number($(prefix+'Lat').value),lon=Number($(prefix+'Lon').value);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180){
  $('status').textContent='Enter a valid latitude (−90 to 90) and longitude (−180 to 180).';
  return false;
 }
 return setPoint(index,{lat,lon,name:'Manual coordinates'});
}
function setPoint(index,p){
 const obj={lat:p.lat,lon:p.lon,name:p.name||fmtCoord(p.lat,p.lon)};
 if(index===0||points.length===0){points=[obj];}
 else if(points.length===1){points.push(obj);}
 else{points[1]=obj;}
 mode='measure';setModeUI();syncCoordinateInputs();updateMeasurement();draw();updateStatus();return true;
}
function updateMeasurement(){
 $('setB').disabled=!(selected&&selected.capital&&points.length>0);
 syncCoordinateInputs();
 const box=$('endpointRows');box.innerHTML='';
 for(let i=0;i<2;i++){
  const p=points[i],row=document.createElement('div');row.className='point-row';
  const badge=document.createElement('span');badge.className='point-badge '+(i===0?'a':'b');badge.textContent=i?'B':'A';
  const name=document.createElement('span');name.textContent=p?p.name:'Not set';
  const coord=document.createElement('span');coord.className='muted';coord.textContent=p?fmtCoord(p.lat,p.lon):'';
  row.append(badge,name,coord);box.append(row);
 }
 if(points.length===2){
  const measurement=measureDirectDistance(points[0],points[1]);
  $('rawDistanceValue').textContent=Number.isFinite(measurement.chordDistanceMeters)
   ?formatDistance(measurement.chordDistanceMeters):'Unavailable';
  $('rawDistanceSub').textContent='Uncorrected Euclidean chord';
  $('distanceValue').textContent=Number.isFinite(measurement.calibratedDistanceMeters)
   ?formatDistance(measurement.calibratedDistanceMeters):'Unavailable';
  const factor=measurement.calibrationFactor;
  const correction=measurement.correctionPercent;
  $('distanceSub').textContent=Number.isFinite(factor)
   ?'×'+factor.toFixed(3)+' factor · '+(correction>=0?'+':'')+correction.toFixed(1)+'% vs chord'
   :'Flight-mileage model unavailable';

  $('measureHelp').textContent='The connector and its map label show the ADS-B flight-mileage estimate. The raw Euclidean chord is retained as a secondary flat-disk reference; the estimate is based on historical ground-speed and timestamp samples and is not a shortest-path distance.';
  const calibration=measurement.calibration;
  const support=$('calibrationSupport'),routes=$('calibrationRoutes');
  const status=calibration?.status;
  support.textContent=status==='bounded-extrapolation'
   ?'Bounded extrapolation · the route fit does not cover this endpoint geometry.'
   :status==='extrapolated'
    ?'Extrapolated · endpoint geometry is outside or weakly supported by sampled routes.'
    :'Within sampled route-feature range.';
  routes.textContent='Nearest reference routes: '+(calibration?.neighbourRouteIds?.join(', ')||'not available');
 }else{
  $('calibrationSupport').textContent='Calibration support appears after both endpoints are set.';
  $('calibrationRoutes').textContent='Nearest reference routes: —';
  $('rawDistanceValue').textContent='—';
  $('rawDistanceSub').textContent='Uncorrected Euclidean chord';
  $('distanceValue').textContent='—';
  $('distanceSub').textContent='Raw chord × local flight-mileage factor';
  $('measureHelp').textContent=points.length===1
   ?'Point A set. Click anywhere on the disk to set point B.'
   :'Choose two places anywhere on the disk, or select a capital and assign it to A or B.';
 }
 syncMeasurementActionButtons();
}
function clearMeasurementDrawings(){
 points=[];areaPoints=[];areaFinished=false;
 updateMeasurement();updateAreaMeasurement();draw();
}
function setModeUI(){
 const buttons=[['exploreMode','explore'],['measureMode','measure'],['areaMode','area']];
 for(const [id,value] of buttons){
  const active=mode===value,button=$(id);
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
  button.dataset.active=String(active);
 }
 $('measurementTools').dataset.activeMode=mode;
 const showDetails=mode==='measure'||mode==='area';
 $('measurementDetails').hidden=!showDetails;
 $('toggleMeasurementDetails').hidden=!showDetails;
 $('toggleMeasurementDetails').setAttribute('aria-expanded',String(showDetails));
 $('toggleMeasurementDetails').textContent=showDetails?'Less':'Details';
 $('distanceDetails').hidden=mode!=='measure';
 $('areaDetails').hidden=mode!=='area';
}
function focusGeo(lat,lon,desiredZoom){const [x,y]=project(lon,lat);zoom=clampZoom(desiredZoom||zoom,{x,y});const offset=panForWorldCenterPoint(x,y,zoom,rotationRadians());panX=offset.panX;panY=offset.panY;draw();}
function selectResult(item){
 $('suggestions').classList.remove('open');
 $('search').value=item.type==='capital'?item.obj.city+', '+(item.obj.countryName||''):item.type==='county'?item.obj.name+', '+item.obj.stateCode:item.obj.name;
 if(item.type==='capital'){
  const anchor=project(item.obj.lon,item.obj.lat),labelZoom=zoomForScaleBarDistance(CAPITAL_LABEL_MAX_SCALE_KM,{x:anchor[0],y:anchor[1]});
  showCapital(item.obj);focusGeo(item.obj.lat,item.obj.lon,Math.max(zoom,labelZoom));
 }
 else if(item.type==='county'){showCounty(item.obj);focusGeo(item.obj.lat,item.obj.lon,Math.max(zoom,3.2));}
 else{
  showCountry(item.obj);
  if(item.obj.iso==='ATA'){
   // Keep the complete circumferential ice-wall band in view instead of zooming to one polar point.
   focusGeo(90,0,MIN_ZOOM);
   return;
  }
  const center=item.obj.center,anchor=project(center.lon,center.lat);
  const labelZoom=zoomForScaleBarDistance(COUNTRY_LABEL_MAX_SCALE_KM,{x:anchor[0],y:anchor[1]});
  focusGeo(center.lat,center.lon,Math.max(zoom,labelZoom));
 }
}
function assignSelection(idx){if(!selected)return;let p;if(selected.type==='capital')p=selected.capital;else p=selected.capital;if(!p)return;setPoint(idx,{lat:p.lat,lon:p.lon,name:`${p.city} (${selected.country?.name||p.countryName||''})`});}
function onMapClick(x,y){
 if(Math.hypot(x,y)>baseR*1.012)return;
 const q=unproject(x,y);
 if(registrationPickActive){const snap=findCapitalAt(x,y,10);const p=snap?{lat:snap.lat,lon:snap.lon}:q;registrationPickActive=false;pendingRegistrationGeo=p;$('registrationStatus').textContent=`Map point selected: ${fmtCoord(p.lat,p.lon)}${snap?' · snapped to '+snap.city:''}. Now click the same feature in the scan preview.`;$('pickRegistrationPoint').textContent='Pick another map point';return;}
 const cap=findCapitalAt(x,y,10);
 if(mode==='measure'){if(points.length>=2)points=[];const p=cap?{lat:cap.lat,lon:cap.lon,name:`${cap.city} (${cap.countryName||''})`}:q;setPoint(points.length===0?0:1,{...p,name:p.name||fmtCoord(p.lat,p.lon)});return;}
 if(mode==='area'){
  if(areaFinished){areaPoints=[];areaFinished=false;}
  const p=cap?{lat:cap.lat,lon:cap.lon,name:cap.city}:q;
  areaPoints.push(p);updateAreaMeasurement();draw();updateStatus();return;
 }
 if(cap){showCapital(cap);return;}const c=findCountryAt(x,y);if(c){showCountry(c);return;}
 $('selectionName').textContent='Map location';$('selectionKind').textContent='Clicked geographic position';$('selectionMetaTitle').textContent='Location';$('selectionCapital').textContent='—';$('selectionCoords').textContent=fmtCoord(q.lat,q.lon);$('selectionFactTitle').textContent='Details';$('selectionFactValue').textContent='—';$('selectionButtons').style.display='none';selected={type:'coordinate',position:q};
}
function drawSearchResults(q){
 const box=$('suggestions');box.innerHTML='';
 if(!String(q||'').trim()){box.classList.remove('open');return;}
 const top=findSearchMatches(searchIndex,q,10);
 if(!top.length){
  const empty=document.createElement('div');empty.className='suggestion';
  empty.textContent='No matching country, capital or U.S. county';
  box.append(empty);
 }else{
  top.forEach(item=>{
   const element=document.createElement('div');element.className='suggestion';
   const left=document.createElement('b'),right=document.createElement('small');
   if(item.type==='capital'){left.textContent=item.obj.city;right.textContent=`CAPITAL · ${item.obj.countryName}`;}
   else if(item.type==='county'){left.textContent=item.obj.name;right.textContent=`COUNTY · ${item.obj.stateCode}`;}
   else{left.textContent=item.obj.name;right.textContent=item.obj.iso==='ATA'?'ANTARCTICA · ICE WALL':'COUNTRY / TERRITORY';}
   element.append(left,right);element.addEventListener('click',()=>selectResult(item));box.append(element);
  });
 }
 box.classList.add('open');
}
function restoreSharedState(){
 const q=new URLSearchParams(window.location.search),z=Number(q.get('z'));
 const requestedStyle=q.get('style');if(requestedStyle&&Object.hasOwn(VISUAL_STYLES,requestedStyle))applyVisualStyle(requestedStyle,false);
 const requestedRotation=Number(q.get('r'));if(q.has('r')&&Number.isFinite(requestedRotation))rotationDegrees=normalizeRotation(requestedRotation);
 rotationAnimationTarget=rotationDegrees;
 if(q.has('z')&&Number.isFinite(z))zoom=clamp(z,MIN_ZOOM,MAX_ZOOM_SEARCH);

 const hist=q.get('hist');if(hist){const v=hist.split(',').map(Number);if(v.length===6&&v.every(Number.isFinite)){historical.enabled=v[0]===1;historical.opacity=clamp(v[1],5,90);historical.centerX=clamp(v[2],20,80);historical.centerY=clamp(v[3],15,85);historical.diameter=clamp(v[4],55,90);historical.scale=clamp(v[5],80,120);}}
 const hr=Number(q.get('hr'));if(q.has('hr')&&Number.isFinite(hr))historical.rotation=clamp(hr,-5,5);
 const px=Number(q.get('px')),py=Number(q.get('py'));
 if(q.has('px')&&q.has('py')&&Number.isFinite(px)&&Number.isFinite(py)){panX=clamp(px,-4,4)*baseR;panY=clamp(py,-4,4)*baseR;}
 const restoredCenter=unrotatePoint(-panX/zoom,-panY/zoom,rotationRadians()),restoredZoom=clampZoom(zoom,restoredCenter),restoredRatio=restoredZoom/zoom;
 panX*=restoredRatio;panY*=restoredRatio;zoom=restoredZoom;
 const bits=q.get('ly');if(bits&&bits.length>=5){layers.countries=bits[0]==='1';layers.grid=bits[1]==='1';layers.capitals=bits[2]==='1';layers.capitalNames=bits[3]==='1';layers.antarctica=bits[4]==='1';if(bits.length>=6)layers.countryNames=bits[5]==='1';if(bits.length>=7)layers.oceanLabels=bits[6]==='1';if(bits.length>=8)layers.coastlines=bits[7]==='1';}
 const readPoint=(key,name)=>{const raw=q.get(key);if(!raw)return null;const v=raw.split(',').map(Number);return v.length===2&&v.every(Number.isFinite)&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180?{lat:v[0],lon:v[1],name}:null;};
 const a=readPoint('a','Shared point A'),b=readPoint('b','Shared point B');
 points=a?(b?[a,b]:[a]):[];
 const poly=q.get('ap');if(poly){areaPoints=poly.split(';').map(v=>v.split(',').map(Number)).filter(v=>v.length===2&&v.every(Number.isFinite)&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180).map(v=>({lat:v[0],lon:v[1]}));areaFinished=areaPoints.length>=3;}
  const tie=q.get('gc');if(tie){registrationPoints=tie.split(';').map(v=>v.split(',').map(Number)).filter(v=>v.length===4&&v.every(Number.isFinite)&&v[0]>=0&&v[0]<=1&&v[1]>=0&&v[1]<=1&&Math.abs(v[2])<=90&&Math.abs(v[3])<=180).map(v=>({u:v[0],v:v[1],lat:v[2],lon:v[3]})).slice(0,MAX_REGISTRATION_POINTS);}
 if(areaPoints.length)mode='area';else if(points.length)mode='measure';
 for(const [id,key] of [['layerCountries','countries'],['layerGrid','grid'],['layerCapitals','capitals'],['layerCapitalNames','capitalNames'],['layerAntarctica','antarctica'],['layerCountryNames','countryNames'],['layerOceanLabels','oceanLabels'],['layerCoastlines','coastlines']])$(id).checked=layers[key];
 $('mapStyle').value=visualStyle;syncRotationControls();
 syncRadialControls();syncHistoricalControls();$('historicalEnabled').checked=historical.enabled;if(historical.enabled)loadHistoricalScan();
 setModeUI();updateMeasurement();updateAreaMeasurement();updateRegistrationUI();
}
function syncRadialControls(){renderRadialCalibration($('radialRows'));}
function syncHistoricalControls(){
 const specs=[['historicalOpacity','opacity','%'],['historicalCenterX','centerX','%'],['historicalCenterY','centerY','%'],['historicalDiameter','diameter','%'],['historicalScale','scale','%'],['historicalRotation','rotation','°']];
 for(const [id,key,unit] of specs){$(id).value=historical[key];$(id+'Value').textContent=unit==='°'?Number(historical[key]).toFixed(1)+unit:Math.round(historical[key]*10)/10+unit;}
}
function renderHistoricalPicker(){
 const picker=$('historicalPicker');
 if(!historicalImage||!historicalImage.complete||!historicalImage.naturalWidth){picker.width=0;picker.height=0;return;}
 const maxWidth=760,scale=Math.min(1,maxWidth/historicalImage.naturalWidth);
 picker.width=Math.round(historicalImage.naturalWidth*scale);picker.height=Math.round(historicalImage.naturalHeight*scale);
 const pctx=picker.getContext('2d');pctx.clearRect(0,0,picker.width,picker.height);pctx.drawImage(historicalImage,0,0,picker.width,picker.height);
 registrationPoints.forEach((p,i)=>{const x=p.u*picker.width,y=p.v*picker.height;pctx.beginPath();pctx.arc(x,y,8,0,Math.PI*2);pctx.fillStyle='#c04d2e';pctx.fill();pctx.strokeStyle='#fff';pctx.lineWidth=2;pctx.stroke();pctx.fillStyle='#fff';pctx.font='bold 10px sans-serif';pctx.textAlign='center';pctx.textBaseline='middle';pctx.fillText(String(i+1),x,y);});
}
function updateRegistrationUI(){
 const count=registrationPoints.length,button=$('pickRegistrationPoint');
 button.disabled=count>=MAX_REGISTRATION_POINTS;
 if(count>=MAX_REGISTRATION_POINTS){
  pendingRegistrationGeo=null;registrationPickActive=false;
  button.textContent='Control-point limit reached';
  $('registrationStatus').textContent=`${count} control points · maximum reached; undo or clear points to add more`;
 }else if(pendingRegistrationGeo){
  button.textContent='Pick another map point';
  $('registrationStatus').textContent=`Map point ready: ${fmtCoord(pendingRegistrationGeo.lat,pendingRegistrationGeo.lon)}. Click its matching location in the scan.`;
 }else{
  button.textContent='Pick map point';
  if(count>=3){const tri=triangulateControlPoints(registrationPoints.map(p=>({x:p.u,y:p.v})));$('registrationStatus').textContent=tri.length?`${count} control points · registered with ${tri.length} affine triangles · maximum ${MAX_REGISTRATION_POINTS}`:'Control points are collinear; add points across the scan.';}
  else $('registrationStatus').textContent=`${count} control points · add at least 3 non-collinear points (maximum ${MAX_REGISTRATION_POINTS})`;
 }
 renderHistoricalPicker();
}
function drawRegisteredHistoricalScan(){renderRegisteredHistoricalScan(ctx,registrationPoints,historicalImage,historical,project);}
function loadHistoricalScan(force=false){
 if(historicalLoading||(!force&&historicalImage&&!historicalFailed))return;
 historicalLoading=true;historicalFailed=false;$('historicalStatus').textContent='Loading the Boston Public Library scan…';
 const img=new Image();img.crossOrigin='anonymous';
 img.onload=()=>{historicalImage=img;historicalLoading=false;historicalFailed=false;$('historicalStatus').textContent=`Scan loaded: ${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px. Add control points to georeference it against the vector map.`;renderHistoricalPicker();updateRegistrationUI();draw();};
 img.onerror=()=>{historicalLoading=false;historicalFailed=true;$('historicalStatus').textContent='The archive image could not be loaded in this browser. Open the source record to view the scan; retry later if the archive is unavailable.';draw();};
 img.src=HISTORICAL_SCAN_URL+(force?'?reload='+Date.now():'');
}
function niceScaleFloor(value){
 if(!Number.isFinite(value)||value<=0)return 0;
 const power=Math.pow(10,Math.floor(Math.log10(value))),fraction=value/power;
 return (fraction>=5?5:fraction>=2?2:1)*power;
}
function constrainScaleAnchor(anchor){
 let x=Number.isFinite(anchor?.x)?anchor.x:0,y=Number.isFinite(anchor?.y)?anchor.y:0;
 const rho=Math.hypot(x,y),limit=baseR*.85;
 if(rho>limit&&rho>0){x*=limit/rho;y*=limit/rho;}
 return {x,y};
}
function scaleAnchorWorld(){return constrainScaleAnchor(unrotatePoint(-panX/zoom,-panY/zoom,rotationRadians()));}
function scaleBarReferencePixels(anchor=scaleAnchorWorld(),scaleZoom=zoom){
 const radius=Math.hypot(anchor.x,anchor.y);
 const available=Math.max(0,(baseR*.96-radius)*1.8*scaleZoom);
 return Math.min(SCALE_BAR_MAX_WIDTH_PX,width*.34,available);
}
function flatDiskDistanceForScalePixels(px,anchor,scaleZoom=zoom){
 if(!Number.isFinite(px)||px<=0||!Number.isFinite(scaleZoom)||scaleZoom<=0||!Number.isFinite(baseR)||baseR<=0)return Infinity;
 // Calibrate the horizontal screen direction at the current view anchor using the same flat-disk metric as A–B.
 const halfWorld=unrotatePoint(px/(2*scaleZoom),0,rotationRadians());
 const first=unproject(anchor.x-halfWorld.x,anchor.y-halfWorld.y);
 const second=unproject(anchor.x+halfWorld.x,anchor.y+halfWorld.y);
 const measurement=measureDirectDistance(first,second);
 // measureDirectDistance applies the ADS-B flight-mileage model to the same straight projected chord.
 return Number.isFinite(measurement.distanceMeters)?measurement.distanceMeters/1000:Infinity;
}
function scaleBarReadingKm(anchor=scaleAnchorWorld(),scaleZoom=zoom){
 const safeAnchor=constrainScaleAnchor(anchor),pixels=scaleBarReferencePixels(safeAnchor,scaleZoom);
 if(pixels<24)return Infinity;
 return niceScaleFloor(flatDiskDistanceForScalePixels(pixels,safeAnchor,scaleZoom)*SCALE_BAR_HEADROOM);
}
function zoomForScaleBarDistance(targetRawKm,anchor){
 const safeAnchor=constrainScaleAnchor(anchor);
 const distanceAt=scaleZoom=>{
  const pixels=scaleBarReferencePixels(safeAnchor,scaleZoom);
  return pixels<24?Infinity:flatDiskDistanceForScalePixels(pixels,safeAnchor,scaleZoom);
 };
 let low=MIN_ZOOM,high=MAX_ZOOM_SEARCH;
 if(distanceAt(low)<=targetRawKm)return MIN_ZOOM;
 if(distanceAt(high)>targetRawKm)return high;
 for(let i=0;i<48;i++){
  const mid=(low+high)/2;
  if(distanceAt(mid)>targetRawKm)low=mid;else high=mid;
 }
 return high;
}
function maxZoomForAnchor(anchor=scaleAnchorWorld()){
 // Leave enough headroom for the scale bar's 0.82 rounding factor to still read 50 km.
 return zoomForScaleBarDistance(MAX_SCALE_BAR_READING_KM/SCALE_BAR_HEADROOM*1.025,anchor);
}
function clampZoom(value,anchor=scaleAnchorWorld()){
 return clamp(value,MIN_ZOOM,maxZoomForAnchor(anchor));
}
function setZoomAtViewCenter(nextZoom){
 const center=unrotatePoint(-panX/zoom,-panY/zoom,rotationRadians());
 zoom=clampZoom(nextZoom,center);
 const offset=rotatePoint(center.x,center.y,rotationRadians());panX=-offset.x*zoom;panY=-offset.y*zoom;draw();
}
function drawScaleBar(){
 if(!baseR||!zoom)return;
 const anchor=scaleAnchorWorld();
 const maxPx=scaleBarReferencePixels(anchor,zoom);
 if(maxPx<24)return;
 const maxKm=flatDiskDistanceForScalePixels(maxPx,anchor),targetKm=niceScaleFloor(maxKm*.82);
 if(!targetKm)return;
 let low=0,high=maxPx;
 for(let i=0;i<36;i++){const mid=(low+high)/2;if(flatDiskDistanceForScalePixels(mid,anchor)<targetKm)low=mid;else high=mid;}
 const barPx=(low+high)/2,x=16,y=height-22,label=formatDistance(targetKm*1000);
 ctx.save();ctx.font='11px ui-sans-serif,system-ui';ctx.textAlign='left';ctx.textBaseline='middle';
 const boxWidth=Math.max(86,barPx+14,ctx.measureText(label).width+14);
 ctx.fillStyle='rgba(251,248,239,.92)';ctx.strokeStyle='#c9c0ad';ctx.lineWidth=1;ctx.fillRect(x-7,y-29,boxWidth,43);ctx.strokeRect(x-7,y-29,boxWidth,43);
 ctx.strokeStyle='#294653';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+barPx,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.moveTo(x+barPx,y-5);ctx.lineTo(x+barPx,y+5);ctx.stroke();
 ctx.fillStyle='#294653';ctx.fillText(label,x,y-14);ctx.restore();
}
function exportPNG(){
 draw();if(!canvas.toBlob){$('status').textContent='PNG export is not supported in this browser.';return;}
 canvas.toBlob(blob=>{if(!blob){$('status').textContent='Could not create PNG.';return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='gleason-world-map.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent='PNG exported.';},'image/png');
}
async function copyShareLink(){
 const url=new URL(window.location.href);url.search='';
 url.searchParams.set('z',zoom.toFixed(3));url.searchParams.set('px',(panX/baseR).toFixed(4));url.searchParams.set('py',(panY/baseR).toFixed(4));url.searchParams.set('r',rotationDegrees.toFixed(1));url.searchParams.set('style',visualStyle);
 url.searchParams.set('ly',[layers.countries,layers.grid,layers.capitals,layers.capitalNames,layers.antarctica,layers.countryNames,layers.oceanLabels,layers.coastlines].map(v=>v?'1':'0').join(''));
  url.searchParams.set('flat','1');
 url.searchParams.set('hist',[historical.enabled?1:0,historical.opacity,historical.centerX,historical.centerY,historical.diameter,historical.scale].join(','));url.searchParams.set('hr',historical.rotation.toFixed(1));
 if(points[0])url.searchParams.set('a',`${points[0].lat.toFixed(5)},${points[0].lon.toFixed(5)}`);
 if(points[1])url.searchParams.set('b',`${points[1].lat.toFixed(5)},${points[1].lon.toFixed(5)}`);
 if(areaPoints.length)url.searchParams.set('ap',areaPoints.map(p=>`${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';'));
 if(registrationPoints.length)url.searchParams.set('gc',registrationPoints.map(p=>`${p.u.toFixed(6)},${p.v.toFixed(6)},${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(';'));
 try{await navigator.clipboard.writeText(url.toString());$('status').textContent='Share link copied to clipboard.';}
 catch(err){const field=document.createElement('textarea');field.value=url.toString();field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();const copied=document.execCommand('copy');field.remove();$('status').textContent=copied?'Share link copied to clipboard.':'Copy the URL from your browser address bar.';}
}
function setMapLoading(active,message='Loading local geographic data…'){
 const overlay=$('mapLoading'),spinner=$('mapLoadingSpinner'),title=$('mapLoadingTitle'),copy=$('mapLoadingMessage'),retry=$('retryMapLoading');
 if(!overlay)return;
 overlay.hidden=!active;overlay.classList.remove('is-error');overlay.setAttribute('aria-hidden',String(!active));
 $('mapViewport').setAttribute('aria-busy',String(active));
 if(active){spinner.hidden=false;retry.hidden=true;title.textContent='Preparing map';copy.textContent=message;}
}
function showLoadError(err){
 console.error(err);$('status').textContent='Could not load geographic data';
 const overlay=$('mapLoading');
 overlay.hidden=false;overlay.classList.add('is-error');overlay.setAttribute('aria-hidden','false');
 $('mapViewport').setAttribute('aria-busy','false');
 $('mapLoadingSpinner').hidden=true;
 $('mapLoadingTitle').textContent='Map data could not be loaded';
 $('mapLoadingMessage').textContent=err?.message||'The local geographic data could not be loaded.';
 $('retryMapLoading').hidden=false;
}
async function load(){
 const generation=++loadGeneration;
 setMapLoading(true,'Loading local country boundaries, coastlines, capital coordinates and county search data…');
 try{
  mapQuality=readMapQuality();$('mapQuality').value=mapQuality;
  $('status').textContent='Loading '+MAP_QUALITY_OPTIONS[mapQuality].label.toLowerCase()+' country boundaries and geographic labels…';
  const [geoData,capRaw,countyRaw,coastlineRaw,antarcticAddRaw]=await Promise.all([
   (async()=>{try{return {data:await loadCountryDataset(mapQuality),fallback:false};}
    catch(boundaryError){if(mapQuality==='low')throw boundaryError;console.warn('Requested bundled boundary quality unavailable; falling back to low:',boundaryError);return {data:await loadCountryDataset('low'),fallback:true};}})(),
   loadCapitalDataset(),
   loadCountyDataset().catch(error=>{console.warn('County search data unavailable:',error);return []; }),
   loadCoastlineDataset().catch(error=>{console.warn('Coastline data unavailable; country outlines remain available:',error);return null;}),
   loadAntarcticAddDataset().catch(error=>{console.warn('Antarctic Digital Database unavailable; Natural Earth outline remains active:',error);return null;})
  ]);
  if(generation!==loadGeneration)return;
  features=geoData.data.features||[];
  antarcticAddData=antarcticAddRaw;
  if(!features.length)throw new Error('The bundled country boundary dataset contains no features.');
  antarcticaFeature=features.find(f=>isoFor(f)==='ATA'||norm(nameFor(f))==='antarctica')||null;
  const usable=features.filter(f=>isoFor(f)!=='ATA'&&norm(nameFor(f))!=='antarctica');
  countries=usable.map(f=>({feature:f,iso:isoFor(f),name:nameFor(f),center:centroidOfFeature(f)})).filter(c=>c.iso&&c.name);
  antarcticaCountry=antarcticaFeature?{feature:antarcticaFeature,iso:'ATA',name:nameFor(antarcticaFeature)||'Antarctica',center:centroidOfFeature(antarcticaFeature)}:null;
  capitals=capRaw.map(p=>{const c=countries.find(country=>country.iso===p.iso);return {...p,countryName:c?c.name:'',country:c||null};});
  counties=countyRaw;coastlineData=coastlineRaw;
  searchIndex=buildSearchIndex({countries,capitals,counties,stateNames:US_STATE_NAMES,antarctica:antarcticaCountry});
  geometryBaseR=NaN;
  if(!countries.length||!capitals.length)throw new Error('One or more bundled geographic datasets did not contain usable records.');
  countryByIso.clear();capitalByIso.clear();countries.forEach(c=>countryByIso.set(c.iso,c));
  capitals.forEach(p=>{if(!capitalByIso.has(p.iso))capitalByIso.set(p.iso,p);});
  restoreSharedState();resize();draw();
  boundaryScaleLabel=geoData.fallback?'Natural Earth '+MAP_QUALITY_OPTIONS.low.scale+' fallback':'Natural Earth '+MAP_QUALITY_OPTIONS[mapQuality].scale;
  updateStatus();$('status').textContent+=' · bundled local data';
  if(geoData.fallback)$('status').textContent+=' · lower quality substituted';
  updateAreaMeasurement();updateRegistrationUI();
  setMapLoading(false);
 }catch(err){if(generation!==loadGeneration)return;showLoadError(err);}
}
$('mapQuality').addEventListener('change',e=>{const next=Object.hasOwn(MAP_QUALITY_OPTIONS,e.target.value)?e.target.value:'medium';mapQuality=next;try{localStorage.setItem(QUALITY_STORAGE_KEY,next);}catch(error){console.info('Map quality preference could not be saved:',error);}load();});
$('mapStyle').addEventListener('change',e=>{applyVisualStyle(e.target.value);draw();});$('mapRotation').addEventListener('input',e=>animateRotation(Number(e.target.value)));$('rotateLeft').addEventListener('click',()=>animateRotation(rotationAnimationTarget-15));$('rotateRight').addEventListener('click',()=>animateRotation(rotationAnimationTarget+15));$('resetRotation').addEventListener('click',()=>animateRotation(0));
const mobileToolsToggle=$('mobileToolsToggle');
const toolsPanel=$('toolsPanel');
const measurementDetails=$('measurementDetails');
const measurementDetailsToggle=$('toggleMeasurementDetails');
measurementDetailsToggle.addEventListener('click',()=>{
 const expanded=measurementDetails.hidden;
 measurementDetails.hidden=!expanded;
 measurementDetailsToggle.setAttribute('aria-expanded',String(expanded));
 measurementDetailsToggle.textContent=expanded?'Less':'Details';
});
function setMobileToolsOpen(open){
 document.body.classList.toggle('mobile-tools-open',open);
 mobileToolsToggle.setAttribute('aria-expanded',String(open));
 mobileToolsToggle.textContent=open?'Close map tools':'Open map tools';
}
mobileToolsToggle.addEventListener('click',()=>setMobileToolsOpen(!document.body.classList.contains('mobile-tools-open')));
const mobileToolsQuery=window.matchMedia('(min-width: 761px)');
mobileToolsQuery.addEventListener?.('change',event=>{if(event.matches)setMobileToolsOpen(false);});
$('search').addEventListener('input',e=>drawSearchResults(e.target.value));$('search').addEventListener('focus',e=>{if(e.target.value)drawSearchResults(e.target.value);});$('search').addEventListener('keydown',e=>{if(e.key==='Escape')$('suggestions').classList.remove('open');if(e.key==='Enter'){const first=$('suggestions').querySelector('.suggestion');if(first)first.click();}});document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))$('suggestions').classList.remove('open');});
$('exploreMode').addEventListener('click',()=>{if(mode!=='explore')clearMeasurementDrawings();mode='explore';setModeUI();updateStatus();});$('measureMode').addEventListener('click',()=>{if(mode!=='measure')clearMeasurementDrawings();mode='measure';setModeUI();updateStatus();});$('areaMode').addEventListener('click',()=>{if(mode!=='area')clearMeasurementDrawings();mode='area';setModeUI();updateAreaMeasurement();updateStatus();});$('setA').addEventListener('click',()=>assignSelection(0));$('setB').addEventListener('click',()=>assignSelection(1));
$('applyCoordsA').addEventListener('click',()=>applyCoordinateEndpoint(0));$('applyCoordsB').addEventListener('click',()=>applyCoordinateEndpoint(1));
$('clearMeasure').addEventListener('click',()=>{points=[];updateMeasurement();draw();updateStatus();});
$('finishArea').addEventListener('click',finishArea);
$('undoArea').addEventListener('click',()=>{areaPoints.pop();areaFinished=false;updateAreaMeasurement();draw();updateStatus();});
$('clearArea').addEventListener('click',()=>{areaPoints=[];areaFinished=false;updateAreaMeasurement();draw();updateStatus();});
$('pickRegistrationPoint').addEventListener('click',()=>{if(registrationPoints.length>=MAX_REGISTRATION_POINTS){updateRegistrationUI();return;}registrationPickActive=true;pendingRegistrationGeo=null;$('registrationStatus').textContent='Click the matching geographic point on the map.';$('pickRegistrationPoint').textContent='Waiting for map point…';});
$('undoRegistrationPoint').addEventListener('click',()=>{registrationPoints.pop();updateRegistrationUI();draw();});
$('clearRegistrationPoints').addEventListener('click',()=>{registrationPoints=[];pendingRegistrationGeo=null;updateRegistrationUI();draw();});
$('historicalPicker').addEventListener('click',e=>{if(!pendingRegistrationGeo){$('registrationStatus').textContent='First click “Pick map point” and choose a location on the map.';return;}if(!historicalImage)return;if(registrationPoints.length>=MAX_REGISTRATION_POINTS){pendingRegistrationGeo=null;updateRegistrationUI();return;}const rect=e.currentTarget.getBoundingClientRect(),u=clamp((e.clientX-rect.left)/rect.width,0,1),v=clamp((e.clientY-rect.top)/rect.height,0,1);registrationPoints.push({u,v,lat:pendingRegistrationGeo.lat,lon:pendingRegistrationGeo.lon});pendingRegistrationGeo=null;updateRegistrationUI();draw();});
$('exportPNG').addEventListener('click',exportPNG);$('shareMap').addEventListener('click',copyShareLink);
$('historicalEnabled').addEventListener('change',e=>{historical.enabled=e.target.checked;if(historical.enabled)loadHistoricalScan();draw();});
[['historicalOpacity','opacity'],['historicalCenterX','centerX'],['historicalCenterY','centerY'],['historicalDiameter','diameter'],['historicalScale','scale'],['historicalRotation','rotation']].forEach(([id,key])=>$(id).addEventListener('input',e=>{historical[key]=Number(e.target.value);syncHistoricalControls();draw();}));
$('resetHistorical').addEventListener('click',()=>{Object.assign(historical,{opacity:45,centerX:50,centerY:50,diameter:75.6,scale:100,rotation:0});syncHistoricalControls();draw();});
$('retryHistorical').addEventListener('click',()=>loadHistoricalScan(true));
[['layerCountries','countries'],['layerGrid','grid'],['layerCapitals','capitals'],['layerCapitalNames','capitalNames'],['layerAntarctica','antarctica'],['layerCountryNames','countryNames'],['layerOceanLabels','oceanLabels'],['layerCoastlines','coastlines']].forEach(([id,key])=>$(id).addEventListener('change',e=>{layers[key]=e.target.checked;draw();}));
$('resetView').addEventListener('click',()=>{zoom=1;panX=0;panY=0;animateRotation(0);draw();});$('zoomIn').addEventListener('click',()=>setZoomAtViewCenter(zoom*1.25));$('zoomOut').addEventListener('click',()=>setZoomAtViewCenter(zoom/1.25));
function setFullscreenButton(){const btn=$('fullscreenMap');if(btn)btn.textContent=document.fullscreenElement?'Exit full screen':'Full screen';}
async function toggleFullscreen(){try{if(!document.fullscreenElement){if($('mapCard').requestFullscreen)await $('mapCard').requestFullscreen();else if($('mapCard').webkitRequestFullscreen)$('mapCard').webkitRequestFullscreen();}else{await document.exitFullscreen();}}catch(err){$('status').textContent='Full-screen mode is unavailable in this browser.';}}
$('fullscreenMap').addEventListener('click',toggleFullscreen);document.addEventListener('fullscreenchange',()=>{setFullscreenButton();requestAnimationFrame(resize);});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top,p=screenToWorld(sx,sy),lx=p.x,ly=p.y;let nz=zoom*(e.deltaY<0?1.12:.89);for(let i=0;i<3;i++){const offset=unrotatePoint(width/2-sx,height/2-sy,rotationRadians()),anchor={x:lx+offset.x/nz,y:ly+offset.y/nz},safe=clampZoom(nz,anchor);if(Math.abs(safe-nz)<1e-6)break;nz=safe;}const rpoint=rotatePoint(lx,ly,rotationRadians());panX=sx-width/2-rpoint.x*nz;panY=sy-height/2-rpoint.y*nz;zoom=nz;draw();},{passive:false});
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointerDown={x:e.clientX,y:e.clientY,px:panX,py:panY,rotation:rotationDegrees,rotate:e.shiftKey};didDrag=false;});
canvas.addEventListener('pointermove',e=>{if(pointerDown){const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y;if(Math.hypot(dx,dy)>4)didDrag=true;if(didDrag){if(pointerDown.rotate){setRotation(pointerDown.rotation+dx*.5,false);canvas.classList.add('rotating');draw();}else{panX=pointerDown.px+dx;panY=pointerDown.py+dy;canvas.classList.add('dragging');draw();}}return;}const {x,y}=mapCoords(e);const cap=findCapitalAt(x,y,9);const country=cap?null:findCountryAt(x,y);if(country!==hoveredCountry||cap!==hoveredCapital){hoveredCountry=country;hoveredCapital=cap;draw();updateStatus();}});
canvas.addEventListener('pointerup',e=>{if(pointerDown&&!didDrag){const {x,y}=mapCoords(e);onMapClick(x,y);}pointerDown=null;canvas.classList.remove('dragging','rotating');});canvas.addEventListener('pointercancel',()=>{pointerDown=null;canvas.classList.remove('dragging','rotating');});
$('retryMapLoading').addEventListener('click',load);
window.addEventListener('resize',resize);
syncRotationControls();resize();draw();
setMapLoading(true,'Loading local country boundaries, coastlines, capital coordinates and county search data…');
load();
})();
