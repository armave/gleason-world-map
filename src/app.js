import {rad,clamp,radialFraction,meridionalDistanceFromNorthKm,wrapLongitude,project as projectWgs84,unproject as unprojectWgs84,geodesicInverse,geodesicDirect,geodesicLinePath as createGeodesicLinePath,wgs84PolygonMetrics,featureGeodesicAreaM2} from './core/wgs84.js';
import {norm,fmtCoord,lonName,formatDistance,formatArea} from './core/format.js';
import {isoFor,nameFor,hashColor as hashColorForPalette,centroidOfFeature} from './data/geojson.js';
import {HISTORICAL_SCAN_URL,MAP_QUALITY_OPTIONS,loadCountryDataset,loadCapitalDataset,loadCountyDataset} from './data/datasets.js';
import {createFeaturePath} from './map/feature-paths.js';
import {drawIceWall as renderIceWall} from './map/ice-wall.js';
import {drawRegisteredHistoricalScan as renderRegisteredHistoricalScan,triangulateControlPoints} from './map/registration.js';
import {renderRadialCalibration,renderDistortionPanel} from './ui/calibration.js';
import {selectNonOverlappingLabels,shouldShowCapitalLabels,shouldShowCountryLabels,CAPITAL_LABEL_MAX_SCALE_KM,COUNTRY_LABEL_MAX_SCALE_KM,COUNTRY_LABEL_MIN_SCALE_KM} from './map/labels.js';
import {createMeasurementSegments,createProjectedMeasurementSegments,measurementStrokeStyle} from './map/measurements.js';

(() => {
'use strict';

let historicalImage = null, historicalLoading = false, historicalFailed = false;
// The BPL scan is 4,773 × 6,794 px; the printed disk is about 3,610 px wide.
const historical = {enabled:false,opacity:45,centerX:50,centerY:50,diameter:75.6,scale:100,rotation:0};
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
let features = [], countries = [], capitals = [], counties = [], pathRecords = [], antarcticaFeature = null, antarcticaPath = null, capitalByIso = new Map(), countryByIso = new Map();
let labelCollisionBoxes = [];
let baseR = 300, width = 800, height = 650, dpr = 1;
const MIN_ZOOM=1,MAX_ZOOM_SEARCH=20000,MAX_SCALE_BAR_READING_KM=50,SCALE_BAR_HEADROOM=.82,SCALE_BAR_MAX_WIDTH_PX=190;
let zoom = 1, panX = 0, panY = 0, mode = 'explore', points = [], areaPoints = [], areaFinished = false, selected = null, hoveredCountry = null, hoveredCapital = null;
let pointerDown = null, didDrag = false, searchResults = [];
let boundaryScaleLabel='Natural Earth 1:50m';
const QUALITY_STORAGE_KEY='gleason-map:quality:v1';
function readMapQuality(){try{const value=localStorage.getItem(QUALITY_STORAGE_KEY);return Object.hasOwn(MAP_QUALITY_OPTIONS,value)?value:'medium';}catch{return 'medium';}}
let mapQuality=readMapQuality(),loadGeneration=0;
let distortionAnchor = {lat:0,lon:0,label:'Equator / Greenwich'};
let registrationPoints = [], registrationPickActive = false, pendingRegistrationGeo = null;
const layers = {countries:true,countryNames:true,grid:true,capitals:true,capitalNames:true,antarctica:true};
const colors = ['#cdb889','#b8c6a9','#d8cba9','#b8c2b0','#d4b995','#c1c9b8','#d9c6a1'];
const hashColor=key=>hashColorForPalette(key,colors);
const project=(lon,lat)=>projectWgs84(lon,lat,baseR);
const unproject=(x,y)=>unprojectWgs84(x,y,baseR);
const geodesicLinePath=(a,b)=>createGeodesicLinePath(a,b,project);
function setDistortionAnchor(point,label){
 if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return;
 distortionAnchor={lat:clamp(point.lat,-90,90),lon:wrapLongitude(point.lon),label:label||fmtCoord(point.lat,point.lon)};
 updateDistortion();
}
function updateDistortion(){renderDistortionPanel({place:$('distortionPlace'),radial:$('distortionRadial'),eastWest:$('distortionEastWest'),decoder:$('distortionDecoder'),area:$('distortionArea')},distortionAnchor);}
const makePath=(feature,preserveAntarcticRim=false)=>createFeaturePath(feature,project,preserveAntarcticRim);
function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);baseR=Math.min(width,height)*.405;pathRecords=countries.map(c=>({country:c,path:makePath(c.feature)}));antarcticaPath=antarcticaFeature?makePath(antarcticaFeature,true):null;draw();}
function drawDiskBase(){ctx.beginPath();ctx.arc(0,0,baseR,0,Math.PI*2);ctx.fillStyle='#eee7d6';ctx.fill();ctx.strokeStyle='#91aab4';ctx.lineWidth=1.5/zoom;ctx.stroke();}
function drawGrid(){ctx.save();
  const latitudes=[60,30,0,-30,-60];ctx.lineWidth=0.65/zoom;ctx.strokeStyle='#9ba9a8';ctx.setLineDash([3/zoom,4/zoom]);for(const lat of latitudes){const r=baseR*radialFraction(lat);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}ctx.setLineDash([]);
  for(let d=0;d<360;d+=15){const [x,y]=project(d,-90);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(x,y);ctx.strokeStyle=d%30===0?'#9ba8a5':'#c0c5b7';ctx.lineWidth=(d%30===0?.72:.42)/zoom;ctx.stroke();}
  ctx.beginPath();ctx.arc(0,0,2.4/zoom,0,Math.PI*2);ctx.fillStyle='#485c60';ctx.fill();ctx.restore();}
function drawAnnotations(){
  ctx.save();ctx.setLineDash([]);ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`${10/Math.max(.85,zoom*.7)}px ui-sans-serif,system-ui`;
  const ringLabels=[['60°N',60],['30°N',30],['EQUATOR',0],['30°S',-30],['60°S',-60]];
  ctx.textAlign='center';ctx.textBaseline='middle';
  const labelAngle=rad(225);
  for(const [label,lat] of ringLabels){const r=baseR*radialFraction(lat);const x=r*Math.sin(labelAngle),y=-r*Math.cos(labelAngle);ctx.fillStyle='#405a62';ctx.fillText(label,x,y);}
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${9/Math.max(.85,zoom*.6)}px ui-sans-serif,system-ui`;
  for(let d=0;d<360;d+=15){const a=rad(d),r=baseR*1.035;const x=r*Math.cos(a),y=-r*Math.sin(a);ctx.fillStyle='#405a62';ctx.fillText(lonName(d),x,y);}
  ctx.save();ctx.translate(-baseR*.84,-baseR*.84);ctx.strokeStyle='#586c70';ctx.fillStyle='#586c70';ctx.lineWidth=1.2/zoom;ctx.beginPath();ctx.moveTo(0,-15/zoom);ctx.lineTo(4/zoom,0);ctx.lineTo(0,15/zoom);ctx.lineTo(-4/zoom,0);ctx.closePath();ctx.fill();ctx.font=`bold ${10/zoom}px Georgia`;ctx.textAlign='center';ctx.fillText('N',0,-21/zoom);ctx.restore();ctx.restore();
}
function drawCountries(){for(const rec of pathRecords){const c=rec.country;ctx.fillStyle=hashColor(c.iso);ctx.globalAlpha=.93;ctx.fill(rec.path,'evenodd');ctx.globalAlpha=1;ctx.strokeStyle='#68746f';ctx.lineWidth=.62/zoom;ctx.stroke(rec.path);}
 if(hoveredCountry){const rec=pathRecords.find(x=>x.country===hoveredCountry);if(rec){ctx.fillStyle='#d18b57';ctx.globalAlpha=.30;ctx.fill(rec.path,'evenodd');ctx.globalAlpha=1;ctx.strokeStyle='#8c482b';ctx.lineWidth=2/zoom;ctx.stroke(rec.path);}}
 if(selected&&selected.type==='country'){const rec=pathRecords.find(x=>x.country===selected.country);if(rec){ctx.strokeStyle='#a44d2b';ctx.lineWidth=2.6/zoom;ctx.stroke(rec.path);}}
}
function drawIceWall(){renderIceWall(ctx,antarcticaPath,baseR,zoom);}
function drawCapitals(){
 if(!layers.capitals)return;
 const labelOn=layers.capitalNames&&(shouldShowCapitalLabels(scaleBarReadingKm())||(selected&&selected.type==='capital')),candidates=[];
 for(const p of capitals){
  const [x,y]=project(p.lon,p.lat),active=selected&&selected.type==='capital'&&selected.capital===p;
  ctx.beginPath();ctx.arc(x,y,(active?4.4:2.1)/zoom,0,Math.PI*2);
  ctx.fillStyle=active?'#a8492f':'#314f59';ctx.fill();ctx.strokeStyle='#fff9e9';ctx.lineWidth=.7/zoom;ctx.stroke();
  if(labelOn){
   const sx=width/2+panX+x*zoom,sy=height/2+panY+y*zoom;
   if(sx<-12||sx>width+12||sy<-12||sy>height+12)continue;
   const labelFontSize=Math.min(16,10+2*Math.log2(Math.max(1,zoom)));
   ctx.font=`600 ${labelFontSize/zoom}px ui-sans-serif,system-ui`;
   const text=p.city,tw=ctx.measureText(text).width*zoom;
   candidates.push({point:p,x,y,text,selected:!!active,labelFontSize,centerDistance:Math.hypot(sx-width/2,sy-height/2),
    box:{left:sx+4,top:sy-labelFontSize/2,right:sx+4+tw,bottom:sy+labelFontSize/2}});
  }
 }
 if(labelOn){
  candidates.sort((a,b)=>Number(b.selected)-Number(a.selected)||a.centerDistance-b.centerDistance||a.text.length-b.text.length);
  const visible=selectNonOverlappingLabels(candidates);labelCollisionBoxes=visible.map(item=>item.box);
  ctx.textAlign='left';ctx.textBaseline='middle';
  for(const item of visible){ctx.font=`600 ${item.labelFontSize/zoom}px ui-sans-serif,system-ui`;ctx.lineWidth=2.4/zoom;ctx.strokeStyle='rgba(255,250,238,.92)';ctx.strokeText(item.text,item.x+4/zoom,item.y-3/zoom);ctx.fillStyle='#243a43';ctx.fillText(item.text,item.x+4/zoom,item.y-3/zoom);}
 }else labelCollisionBoxes=[];
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
  const sx=width/2+panX+x*zoom,sy=height/2+panY+y*zoom;
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
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const item of visible){
  ctx.font=`600 ${item.screenFontSize/zoom}px Georgia,serif`;
  ctx.lineJoin='round';ctx.lineWidth=3.2/zoom;
  ctx.strokeStyle='rgba(255,250,238,.96)';ctx.strokeText(item.text,item.x,item.y);
  ctx.fillStyle=item.selected?'#994d30':'#6e563b';ctx.fillText(item.text,item.x,item.y);
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
function drawMeasure(){
 if(points.length===2){
  const segments=createProjectedMeasurementSegments(points,project);
  if(segments.length){
   ctx.beginPath();segments[0].forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
   strokeMeasurementConnector('distance');
  }
 }
 points.forEach((p,i)=>{const [x,y]=project(p.lon,p.lat);ctx.beginPath();ctx.arc(x,y,6/zoom,0,Math.PI*2);ctx.fillStyle=i===0?'#b35b36':'#3c7189';ctx.fill();ctx.strokeStyle='#fffdf6';ctx.lineWidth=1.8/zoom;ctx.stroke();ctx.font=`bold ${8/zoom}px ui-sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(i===0?'A':'B',x,y+.3/zoom);});
}
function drawArea(){
 if(!areaPoints.length)return;
 ctx.save();
 const closed=areaFinished&&areaPoints.length>=3;
 const segments=createMeasurementSegments(areaPoints,geodesicLinePath,closed);
 if(segments.length){
  ctx.beginPath();
  const first=project(areaPoints[0].lon,areaPoints[0].lat);ctx.moveTo(first[0],first[1]);
  for(const segment of segments)segment.slice(1).forEach(([x,y])=>ctx.lineTo(x,y));
  if(closed){ctx.closePath();ctx.fillStyle='rgba(79,126,143,.18)';ctx.fill();}
  strokeMeasurementConnector('area');
 }
 areaPoints.forEach((point,i)=>{const [x,y]=project(point.lon,point.lat);ctx.beginPath();ctx.arc(x,y,5/zoom,0,Math.PI*2);ctx.fillStyle='#4f7e8f';ctx.fill();ctx.strokeStyle='#fffdf6';ctx.lineWidth=1.4/zoom;ctx.stroke();ctx.fillStyle='#fff';ctx.font=`bold ${7/zoom}px ui-sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),x,y);});
 ctx.restore();
}
function updateAreaMeasurement(){
 $('areaVertexCount').textContent=`${areaPoints.length} vertices`;
 if(areaFinished&&areaPoints.length>=3){const result=wgs84PolygonMetrics(areaPoints);if(result){$('areaValue').textContent=formatArea(result.areaM2);$('areaPerimeter').textContent=`WGS84 geodesic perimeter · ${formatDistance(result.perimeterM)}`;$('areaHelp').textContent='Area and perimeter are calculated on the WGS84 ellipsoid; polygon edges are shortest geodesics between vertices.';}else{$('areaValue').textContent='Unavailable';$('areaPerimeter').textContent='GeographicLib polygon-area engine unavailable';}}
 else{$('areaValue').textContent='—';$('areaPerimeter').textContent='Area not calculated';$('areaHelp').textContent=areaPoints.length?'Add more vertices; dashed geodesic connectors join each successive point. Finish the polygon to close it and calculate area and perimeter.':'Choose Area, then click at least three points on the disk. Dashed geodesic connectors join successive vertices; Finish closes the outline and calculates ellipsoidal area and perimeter.';}
}
function finishArea(){if(areaPoints.length<3){$('areaHelp').textContent='An area needs at least three distinct vertices.';return;}areaFinished=true;updateAreaMeasurement();draw();updateStatus();}
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
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#f0e9d9';ctx.fillRect(0,0,width,height);
 labelCollisionBoxes=[];ctx.save();ctx.translate(width/2+panX,height/2+panY);ctx.scale(zoom,zoom);drawDiskBase();
 // Clip every geographic layer to the circular map boundary.
 ctx.save();ctx.beginPath();ctx.arc(0,0,baseR,0,Math.PI*2);ctx.clip();
 if(layers.grid)drawGrid();
 if(layers.antarctica)drawIceWall();
 if(layers.countries)drawCountries();
 drawHistoricalOverlay();
 drawCapitals();drawCountryLabels();drawMeasure();drawArea();
 ctx.restore();
 if(layers.grid)drawAnnotations();
 ctx.restore();
 drawScaleBar();updateViewReadout();
}
function updateViewReadout(){
 const readout=$('zoomReadout');if(!readout)return;
 readout.textContent=`${Math.round(zoom*100)}%`;
 const localScale=scaleBarReadingKm(),scaleText=Number.isFinite(localScale)?formatDistance(localScale*1000):'unavailable';
 const cap=layers.capitalNames?(shouldShowCapitalLabels(localScale)?'capital names visible':`capital names at ${CAPITAL_LABEL_MAX_SCALE_KM.toLocaleString()} km`):'capital names off';
 const countryNames=!layers.countryNames?'country names off':shouldShowCountryLabels(localScale)?'country names visible':localScale>COUNTRY_LABEL_MAX_SCALE_KM?`country names at ${COUNTRY_LABEL_MAX_SCALE_KM.toLocaleString()} km`:`country names hidden below ${COUNTRY_LABEL_MIN_SCALE_KM} km`;
 readout.title=`Zoom ${Math.round(zoom*100)}% · local scale ${scaleText} · zoom-in limit ${MAX_SCALE_BAR_READING_KM} km · ${cap} · ${countryNames}`;
}
function findCountryAt(x,y){if(!layers.countries)return null;for(let i=pathRecords.length-1;i>=0;i--){const rec=pathRecords[i];if(ctx.isPointInPath(rec.path,x,y,'evenodd'))return rec.country;}return null;}
function findCapitalAt(x,y,tol=8){if(!layers.capitals)return null;let best=null,bd=Infinity;for(const p of capitals){const [cx,cy]=project(p.lon,p.lat);const d=Math.hypot(cx-x,cy-y);if(d<tol/zoom&&d<bd){best=p;bd=d;}}return best;}
function mapCoords(e){const rect=canvas.getBoundingClientRect();const sx=e.clientX-rect.left,sy=e.clientY-rect.top;return {x:(sx-width/2-panX)/zoom,y:(sy-height/2-panY)/zoom,sx,sy};}
function updateStatus(){if(mode==='measure'){if(points.length===0)$('status').textContent='Distance mode · Choose point A';else if(points.length===1)$('status').textContent='Distance mode · Choose point B';else $('status').textContent='Geodesic distance complete';}else if(mode==='area'){$('status').textContent=`Area mode · ${areaPoints.length} vertices · ${areaFinished?'polygon finished':'add boundary points'}`;}else{$('status').textContent=hoveredCountry?`Country: ${hoveredCountry.name}`:hoveredCapital?`Capital: ${hoveredCapital.city}`:`Explore mode · ${countries.length} countries/areas · ${capitals.length} capital points`;}}
function showCountry(c){const cap=capitalByIso.get(c.iso)||null;selected={type:'country',country:c,capital:cap};$('selectionName').textContent=c.name;$('selectionKind').textContent=`Country / territory · ${boundaryScaleLabel} boundary`;$('selectionMetaTitle').textContent='Capital';$('selectionCapital').textContent=cap?cap.city:'Not listed';$('selectionCoords').textContent=cap?fmtCoord(cap.lat,cap.lon):'—';const area=featureGeodesicAreaM2(c.feature);$('selectionFactTitle').textContent='WGS84 area from boundary geometry';$('selectionFactValue').textContent=area==null?'Unavailable':formatArea(area);$('selectionButtons').style.display=cap?'flex':'none';$('setA').disabled=!cap;$('setB').disabled=!cap||points.length===0;setDistortionAnchor(c.center,c.name);draw();}
function showCapital(p){const c=countryByIso.get(p.iso);selected={type:'capital',capital:p,country:c||null};$('selectionName').textContent=p.city;$('selectionKind').textContent=`Capital of ${p.countryName||c?.name||'country'}`;$('selectionMetaTitle').textContent='Capital';$('selectionCapital').textContent=p.city;$('selectionCoords').textContent=fmtCoord(p.lat,p.lon);$('selectionFactTitle').textContent='WGS84 area from boundary geometry';$('selectionFactValue').textContent=c?formatArea(featureGeodesicAreaM2(c.feature)):'—';$('selectionButtons').style.display='flex';$('setA').disabled=false;$('setB').disabled=points.length===0;setDistortionAnchor(p,p.city);draw();}
const US_STATE_NAMES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',PR:'Puerto Rico',AS:'American Samoa',GU:'Guam',MP:'Northern Mariana Islands',VI:'U.S. Virgin Islands'};
function showCounty(county){
 selected={type:'county',county};$('selectionName').textContent=county.name;
 $('selectionKind').textContent=`U.S. county-equivalent search result · 2026 Census Gazetteer · ${US_STATE_NAMES[county.stateCode]||county.stateCode}`;
 $('selectionMetaTitle').textContent='State';$('selectionCapital').textContent=US_STATE_NAMES[county.stateCode]||county.stateCode;
 $('selectionCoords').textContent=fmtCoord(county.lat,county.lon);
 $('selectionFactTitle').textContent='Census GEOID';$('selectionFactValue').textContent=county.geoid;
 $('selectionButtons').style.display='none';setDistortionAnchor({lat:county.lat,lon:county.lon},county.name);draw();
}
function setPoint(index,p){const obj={lat:p.lat,lon:p.lon,name:p.name||fmtCoord(p.lat,p.lon)};if(index===0||points.length===0){points=[obj];}else if(points.length===1){points.push(obj);}else{points[1]=obj;}mode='measure';setModeUI();setDistortionAnchor(obj,obj.name);updateMeasurement();draw();updateStatus();}
function updateMeasurement(){$('setB').disabled=!(selected&&selected.capital&&points.length>0);const box=$('endpointRows');box.innerHTML='';for(let i=0;i<2;i++){ const p=points[i];const row=document.createElement('div');row.className='point-row';const badge=document.createElement('span');badge.className=`point-badge ${i===0?'a':'b'}`;badge.textContent=i?'B':'A';const name=document.createElement('span');name.textContent=p?p.name:'Not set';const coord=document.createElement('span');coord.className='muted';coord.textContent=p?fmtCoord(p.lat,p.lon):'';row.append(badge,name,coord);box.append(row);}
 if(points.length===2){const result=geodesicInverse(points[0],points[1]);$('distanceValue').textContent=Number.isFinite(result.distanceMeters)?formatDistance(result.distanceMeters):'Unavailable';$('distanceSub').textContent=result.approximate?'Accurate near-antipodal distance unavailable · GeographicLib could not be loaded':'Shortest surface geodesic · WGS84 reference ellipsoid';$('measureHelp').textContent=result.approximate?'This pair is nearly antipodal. Reload with the GeographicLib script available to calculate its accurate WGS84 geodesic.':'Measurement complete. The solid A–B connector is the direct line across the flat disk; the numeric distance remains the WGS84 shortest surface distance.';}else{$('distanceValue').textContent='—';$('distanceSub').textContent='WGS84 ellipsoidal surface distance';$('measureHelp').textContent=points.length===1?'Point A set. Click a second point to set B.':'Choose two places on the disk, or select a capital and assign it to A or B.';}}
function setModeUI(){ $('exploreMode').classList.toggle('active',mode==='explore');$('measureMode').classList.toggle('active',mode==='measure');$('areaMode').classList.toggle('active',mode==='area'); }
function focusGeo(lat,lon,desiredZoom){const [x,y]=project(lon,lat);zoom=clampZoom(desiredZoom||zoom,{x,y});panX=-x*zoom;panY=-y*zoom;draw();}
function selectResult(item){
 $('suggestions').classList.remove('open');
 $('search').value=item.type==='capital'?item.obj.city+', '+(item.obj.countryName||''):item.type==='county'?item.obj.name+', '+item.obj.stateCode:item.obj.name;
 if(item.type==='capital'){
  const anchor=project(item.obj.lon,item.obj.lat),labelZoom=zoomForScaleBarDistance(CAPITAL_LABEL_MAX_SCALE_KM,{x:anchor[0],y:anchor[1]});
  showCapital(item.obj);focusGeo(item.obj.lat,item.obj.lon,Math.max(zoom,labelZoom));
 }
 else if(item.type==='county'){showCounty(item.obj);focusGeo(item.obj.lat,item.obj.lon,Math.max(zoom,3.2));}
 else{
  showCountry(item.obj);const center=item.obj.center,anchor=project(center.lon,center.lat);
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
 if(mode==='area'){if(areaFinished){areaPoints=[];areaFinished=false;}const p=cap?{lat:cap.lat,lon:cap.lon,name:cap.city}:q;areaPoints.push(p);setDistortionAnchor(p,p.name||fmtCoord(p.lat,p.lon));updateAreaMeasurement();draw();updateStatus();return;}
 if(cap){showCapital(cap);return;}const c=findCountryAt(x,y);if(c){showCountry(c);return;}
 $('selectionName').textContent='Map location';$('selectionKind').textContent='Clicked geographic position';$('selectionMetaTitle').textContent='Location';$('selectionCapital').textContent='—';$('selectionCoords').textContent=fmtCoord(q.lat,q.lon);$('selectionFactTitle').textContent='Details';$('selectionFactValue').textContent='—';$('selectionButtons').style.display='none';selected={type:'coordinate',position:q};setDistortionAnchor(q,'Map location');
}
function drawSearchResults(q){const box=$('suggestions');box.innerHTML='';if(!q){box.classList.remove('open');return;}const n=norm(q);const results=[];for(const c of countries){if(norm(c.name).includes(n)){results.push({type:'country',obj:c,rank:norm(c.name)===n?0:1});}}for(const p of capitals){if(norm(p.city).includes(n)||norm(p.countryName).includes(n)){results.push({type:'capital',obj:p,rank:norm(p.city)===n?0:1});}}for(const county of counties){if(norm(county.name).includes(n)||norm(county.stateCode).includes(n)||norm(US_STATE_NAMES[county.stateCode]||'').includes(n)){results.push({type:'county',obj:county,rank:norm(county.name)===n?0:1});}}const typePriority={capital:0,country:1,county:2};results.sort((a,b)=>a.rank-b.rank||typePriority[a.type]-typePriority[b.type]||(a.obj.stateCode||'').localeCompare(b.obj.stateCode||'')||(a.obj.city||a.obj.name).localeCompare(b.obj.city||b.obj.name));const top=results.slice(0,10);if(!top.length){const d=document.createElement('div');d.className='suggestion';d.textContent='No matching country, capital or U.S. county';box.append(d);}else{top.forEach(item=>{const el=document.createElement('div');el.className='suggestion';const left=document.createElement('b');const right=document.createElement('small');if(item.type==='capital'){left.textContent=item.obj.city;right.textContent=`CAPITAL · ${item.obj.countryName}`;}else if(item.type==='county'){left.textContent=item.obj.name;right.textContent=`COUNTY · ${item.obj.stateCode}`;}else{left.textContent=item.obj.name;right.textContent='COUNTRY';}el.append(left,right);el.addEventListener('click',()=>selectResult(item));box.append(el);});}box.classList.add('open');}
function restoreSharedState(){
 const q=new URLSearchParams(window.location.search),z=Number(q.get('z'));
 if(q.has('z')&&Number.isFinite(z))zoom=clamp(z,MIN_ZOOM,MAX_ZOOM_SEARCH);

 const hist=q.get('hist');if(hist){const v=hist.split(',').map(Number);if(v.length===6&&v.every(Number.isFinite)){historical.enabled=v[0]===1;historical.opacity=clamp(v[1],5,90);historical.centerX=clamp(v[2],20,80);historical.centerY=clamp(v[3],15,85);historical.diameter=clamp(v[4],55,90);historical.scale=clamp(v[5],80,120);}}
 const hr=Number(q.get('hr'));if(q.has('hr')&&Number.isFinite(hr))historical.rotation=clamp(hr,-5,5);
 const px=Number(q.get('px')),py=Number(q.get('py'));
 if(q.has('px')&&q.has('py')&&Number.isFinite(px)&&Number.isFinite(py)){panX=clamp(px,-4,4)*baseR;panY=clamp(py,-4,4)*baseR;}
 const restoredCenter={x:-panX/zoom,y:-panY/zoom},restoredZoom=clampZoom(zoom,restoredCenter),restoredRatio=restoredZoom/zoom;
 panX*=restoredRatio;panY*=restoredRatio;zoom=restoredZoom;
 const bits=q.get('ly');if(bits&&bits.length>=5){layers.countries=bits[0]==='1';layers.grid=bits[1]==='1';layers.capitals=bits[2]==='1';layers.capitalNames=bits[3]==='1';layers.antarctica=bits[4]==='1';if(bits.length>=6)layers.countryNames=bits[5]==='1';}
 const readPoint=(key,name)=>{const raw=q.get(key);if(!raw)return null;const v=raw.split(',').map(Number);return v.length===2&&v.every(Number.isFinite)&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180?{lat:v[0],lon:v[1],name}:null;};
 const a=readPoint('a','Shared point A'),b=readPoint('b','Shared point B');points=a?(b?[a,b]:[a]):[];
 const poly=q.get('ap');if(poly){areaPoints=poly.split(';').map(v=>v.split(',').map(Number)).filter(v=>v.length===2&&v.every(Number.isFinite)&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180).map(v=>({lat:v[0],lon:v[1]}));areaFinished=areaPoints.length>=3;}
 const tie=q.get('gc');if(tie){registrationPoints=tie.split(';').map(v=>v.split(',').map(Number)).filter(v=>v.length===4&&v.every(Number.isFinite)&&v[0]>=0&&v[0]<=1&&v[1]>=0&&v[1]<=1&&Math.abs(v[2])<=90&&Math.abs(v[3])<=180).map(v=>({u:v[0],v:v[1],lat:v[2],lon:v[3]})).slice(0,30);}
 if(areaPoints.length)mode='area';else if(points.length)mode='measure';
 for(const [id,key] of [['layerCountries','countries'],['layerGrid','grid'],['layerCapitals','capitals'],['layerCapitalNames','capitalNames'],['layerAntarctica','antarctica'],['layerCountryNames','countryNames']])$(id).checked=layers[key];
 syncRadialControls();syncHistoricalControls();$('historicalEnabled').checked=historical.enabled;if(historical.enabled)loadHistoricalScan();
 setModeUI();updateMeasurement();updateAreaMeasurement();updateRegistrationUI();updateDistortion();
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
 const count=registrationPoints.length;
 if(pendingRegistrationGeo)$('registrationStatus').textContent=`Map point ready: ${fmtCoord(pendingRegistrationGeo.lat,pendingRegistrationGeo.lon)}. Click its matching location in the scan.`;
 else if(count>=3){const tri=triangulateControlPoints(registrationPoints.map(p=>({x:p.u,y:p.v})));$('registrationStatus').textContent=tri.length?`${count} control points · registered with ${tri.length} affine triangles`:'Control points are collinear; add points across the scan.';}
 else $('registrationStatus').textContent=`${count} control points · add at least 3 non-collinear points to register the scan`;
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
function scaleAnchorWorld(){return constrainScaleAnchor({x:-panX/zoom,y:-panY/zoom});}
function scaleBarReferencePixels(anchor=scaleAnchorWorld(),scaleZoom=zoom){
 const radius=Math.hypot(anchor.x,anchor.y);
 const available=Math.max(0,(baseR*.96-radius)*1.8*scaleZoom);
 return Math.min(SCALE_BAR_MAX_WIDTH_PX,width*.34,available);
}
function groundDistanceForScalePixels(px,anchor,scaleZoom=zoom){
 if(!Number.isFinite(px)||px<=0||!Number.isFinite(scaleZoom)||scaleZoom<=0)return Infinity;
 const half=px/(2*scaleZoom);
 const a=unproject(anchor.x-half,anchor.y),b=unproject(anchor.x+half,anchor.y);
 const distance=geodesicInverse(a,b).distanceMeters;
 return Number.isFinite(distance)?distance/1000:Infinity;
}
function scaleBarReadingKm(anchor=scaleAnchorWorld(),scaleZoom=zoom){
 const safeAnchor=constrainScaleAnchor(anchor),pixels=scaleBarReferencePixels(safeAnchor,scaleZoom);
 if(pixels<24)return Infinity;
 return niceScaleFloor(groundDistanceForScalePixels(pixels,safeAnchor,scaleZoom)*SCALE_BAR_HEADROOM);
}
function zoomForScaleBarDistance(targetRawKm,anchor){
 const safeAnchor=constrainScaleAnchor(anchor);
 const distanceAt=scaleZoom=>{
  const pixels=scaleBarReferencePixels(safeAnchor,scaleZoom);
  return pixels<24?Infinity:groundDistanceForScalePixels(pixels,safeAnchor,scaleZoom);
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
 const center={x:-panX/zoom,y:-panY/zoom};
 zoom=clampZoom(nextZoom,center);
 panX=-center.x*zoom;panY=-center.y*zoom;draw();
}
function drawScaleBar(){
 if(!baseR||!zoom)return;
 const anchor=scaleAnchorWorld();
 const maxPx=scaleBarReferencePixels(anchor,zoom);
 if(maxPx<24)return;
 const maxKm=groundDistanceForScalePixels(maxPx,anchor),targetKm=niceScaleFloor(maxKm*.82);
 if(!targetKm)return;
 let low=0,high=maxPx;
 for(let i=0;i<36;i++){const mid=(low+high)/2;if(groundDistanceForScalePixels(mid,anchor)<targetKm)low=mid;else high=mid;}
 const barPx=(low+high)/2,x=16,y=height-22,label=`${formatDistance(targetKm*1000)} · local`;
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
 url.searchParams.set('z',zoom.toFixed(3));url.searchParams.set('px',(panX/baseR).toFixed(4));url.searchParams.set('py',(panY/baseR).toFixed(4));
 url.searchParams.set('ly',[layers.countries,layers.grid,layers.capitals,layers.capitalNames,layers.antarctica,layers.countryNames].map(v=>v?'1':'0').join(''));
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
 setMapLoading(true,'Loading local country boundaries, capital coordinates and county search data…');
 try{
  mapQuality=readMapQuality();$('mapQuality').value=mapQuality;
  $('status').textContent='Loading '+MAP_QUALITY_OPTIONS[mapQuality].label.toLowerCase()+' country boundaries and geographic labels…';
  const [geoData,capRaw,countyRaw]=await Promise.all([
   (async()=>{try{return {data:await loadCountryDataset(mapQuality),fallback:false};}
    catch(boundaryError){if(mapQuality==='low')throw boundaryError;console.warn('Requested bundled boundary quality unavailable; falling back to low:',boundaryError);return {data:await loadCountryDataset('low'),fallback:true};}})(),
   loadCapitalDataset(),
   loadCountyDataset().catch(error=>{console.warn('County search data unavailable:',error);return [];})
  ]);
  if(generation!==loadGeneration)return;
  features=geoData.data.features||[];
  if(!features.length)throw new Error('The bundled country boundary dataset contains no features.');
  antarcticaFeature=features.find(f=>isoFor(f)==='ATA'||norm(nameFor(f))==='antarctica')||null;
  const usable=features.filter(f=>isoFor(f)!=='ATA'&&norm(nameFor(f))!=='antarctica');
  countries=usable.map(f=>({feature:f,iso:isoFor(f),name:nameFor(f),center:centroidOfFeature(f)})).filter(c=>c.iso&&c.name);
  capitals=capRaw.map(p=>{const c=countries.find(country=>country.iso===p.iso);return {...p,countryName:c?c.name:'',country:c||null};});
  counties=countyRaw;
  if(!countries.length||!capitals.length)throw new Error('One or more bundled geographic datasets did not contain usable records.');
  countryByIso.clear();capitalByIso.clear();countries.forEach(c=>countryByIso.set(c.iso,c));
  capitals.forEach(p=>{if(!capitalByIso.has(p.iso))capitalByIso.set(p.iso,p);});
  restoreSharedState();resize();draw();
  boundaryScaleLabel=geoData.fallback?'Natural Earth '+MAP_QUALITY_OPTIONS.low.scale+' fallback':'Natural Earth '+MAP_QUALITY_OPTIONS[mapQuality].scale;
  updateStatus();$('status').textContent+=' · bundled local data';
  if(geoData.fallback)$('status').textContent+=' · lower quality substituted';
  updateDistortion();updateAreaMeasurement();updateRegistrationUI();
  setMapLoading(false);
 }catch(err){if(generation!==loadGeneration)return;showLoadError(err);}
}
$('mapQuality').addEventListener('change',e=>{const next=Object.hasOwn(MAP_QUALITY_OPTIONS,e.target.value)?e.target.value:'medium';mapQuality=next;try{localStorage.setItem(QUALITY_STORAGE_KEY,next);}catch(error){console.info('Map quality preference could not be saved:',error);}load();});
const mobileToolsToggle=$('mobileToolsToggle');
const toolsPanel=$('toolsPanel');
function setMobileToolsOpen(open){
 document.body.classList.toggle('mobile-tools-open',open);
 mobileToolsToggle.setAttribute('aria-expanded',String(open));
 mobileToolsToggle.textContent=open?'Close map tools':'Open map tools';
}
mobileToolsToggle.addEventListener('click',()=>setMobileToolsOpen(!document.body.classList.contains('mobile-tools-open')));
const mobileToolsQuery=window.matchMedia('(min-width: 761px)');
mobileToolsQuery.addEventListener?.('change',event=>{if(event.matches)setMobileToolsOpen(false);});
$('search').addEventListener('input',e=>drawSearchResults(e.target.value));$('search').addEventListener('focus',e=>{if(e.target.value)drawSearchResults(e.target.value);});$('search').addEventListener('keydown',e=>{if(e.key==='Escape')$('suggestions').classList.remove('open');if(e.key==='Enter'){const first=$('suggestions').querySelector('.suggestion');if(first)first.click();}});document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))$('suggestions').classList.remove('open');});
$('exploreMode').addEventListener('click',()=>{mode='explore';setModeUI();updateStatus();});$('measureMode').addEventListener('click',()=>{mode='measure';setModeUI();updateStatus();});$('areaMode').addEventListener('click',()=>{mode='area';areaFinished=false;setModeUI();updateAreaMeasurement();updateStatus();});$('setA').addEventListener('click',()=>assignSelection(0));$('setB').addEventListener('click',()=>assignSelection(1));$('clearMeasure').addEventListener('click',()=>{points=[];updateMeasurement();draw();updateStatus();});
$('finishArea').addEventListener('click',finishArea);
$('undoArea').addEventListener('click',()=>{areaPoints.pop();areaFinished=false;updateAreaMeasurement();draw();updateStatus();});
$('clearArea').addEventListener('click',()=>{areaPoints=[];areaFinished=false;updateAreaMeasurement();draw();updateStatus();});
$('pickRegistrationPoint').addEventListener('click',()=>{registrationPickActive=true;pendingRegistrationGeo=null;$('registrationStatus').textContent='Click the matching geographic point on the map.';$('pickRegistrationPoint').textContent='Waiting for map point…';});
$('undoRegistrationPoint').addEventListener('click',()=>{registrationPoints.pop();updateRegistrationUI();draw();});
$('clearRegistrationPoints').addEventListener('click',()=>{registrationPoints=[];pendingRegistrationGeo=null;updateRegistrationUI();draw();});
$('historicalPicker').addEventListener('click',e=>{if(!pendingRegistrationGeo){$('registrationStatus').textContent='First click “Pick map point” and choose a location on the map.';return;}if(!historicalImage)return;const rect=e.currentTarget.getBoundingClientRect(),u=clamp((e.clientX-rect.left)/rect.width,0,1),v=clamp((e.clientY-rect.top)/rect.height,0,1);registrationPoints.push({u,v,lat:pendingRegistrationGeo.lat,lon:pendingRegistrationGeo.lon});pendingRegistrationGeo=null;$('pickRegistrationPoint').textContent='Pick map point';updateRegistrationUI();draw();});
$('exportPNG').addEventListener('click',exportPNG);$('shareMap').addEventListener('click',copyShareLink);
$('historicalEnabled').addEventListener('change',e=>{historical.enabled=e.target.checked;if(historical.enabled)loadHistoricalScan();draw();});
[['historicalOpacity','opacity'],['historicalCenterX','centerX'],['historicalCenterY','centerY'],['historicalDiameter','diameter'],['historicalScale','scale'],['historicalRotation','rotation']].forEach(([id,key])=>$(id).addEventListener('input',e=>{historical[key]=Number(e.target.value);syncHistoricalControls();draw();}));
$('resetHistorical').addEventListener('click',()=>{Object.assign(historical,{opacity:45,centerX:50,centerY:50,diameter:75.6,scale:100,rotation:0});syncHistoricalControls();draw();});
$('retryHistorical').addEventListener('click',()=>loadHistoricalScan(true));
[['layerCountries','countries'],['layerGrid','grid'],['layerCapitals','capitals'],['layerCapitalNames','capitalNames'],['layerAntarctica','antarctica'],['layerCountryNames','countryNames']].forEach(([id,key])=>$(id).addEventListener('change',e=>{layers[key]=e.target.checked;draw();}));
$('resetView').addEventListener('click',()=>{zoom=1;panX=0;panY=0;draw();});$('zoomIn').addEventListener('click',()=>setZoomAtViewCenter(zoom*1.25));$('zoomOut').addEventListener('click',()=>setZoomAtViewCenter(zoom/1.25));
function setFullscreenButton(){const btn=$('fullscreenMap');if(btn)btn.textContent=document.fullscreenElement?'Exit full screen':'Full screen';}
async function toggleFullscreen(){try{if(!document.fullscreenElement){if($('mapCard').requestFullscreen)await $('mapCard').requestFullscreen();else if($('mapCard').webkitRequestFullscreen)$('mapCard').webkitRequestFullscreen();}else{await document.exitFullscreen();}}catch(err){$('status').textContent='Full-screen mode is unavailable in this browser.';}}
$('fullscreenMap').addEventListener('click',toggleFullscreen);document.addEventListener('fullscreenchange',()=>{setFullscreenButton();requestAnimationFrame(resize);});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;const lx=(sx-width/2-panX)/zoom,ly=(sy-height/2-panY)/zoom;let nz=zoom*(e.deltaY<0?1.12:.89);for(let i=0;i<3;i++){const anchor={x:lx+(width/2-sx)/nz,y:ly+(height/2-sy)/nz},safe=clampZoom(nz,anchor);if(Math.abs(safe-nz)<1e-6)break;nz=safe;}panX=sx-width/2-lx*nz;panY=sy-height/2-ly*nz;zoom=nz;draw();},{passive:false});
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointerDown={x:e.clientX,y:e.clientY,px:panX,py:panY};didDrag=false;});canvas.addEventListener('pointermove',e=>{if(pointerDown){const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y;if(Math.hypot(dx,dy)>4)didDrag=true;if(didDrag){panX=pointerDown.px+dx;panY=pointerDown.py+dy;canvas.classList.add('dragging');draw();}return;}const {x,y}=mapCoords(e);const cap=findCapitalAt(x,y,9);const country=cap?null:findCountryAt(x,y);if(country!==hoveredCountry||cap!==hoveredCapital){hoveredCountry=country;hoveredCapital=cap;draw();updateStatus();}});
canvas.addEventListener('pointerup',e=>{if(pointerDown&&!didDrag){const {x,y}=mapCoords(e);onMapClick(x,y);}pointerDown=null;canvas.classList.remove('dragging');});canvas.addEventListener('pointercancel',()=>{pointerDown=null;canvas.classList.remove('dragging');});
$('retryMapLoading').addEventListener('click',load);
window.addEventListener('resize',resize);
resize();draw();
setMapLoading(true,'Loading local country boundaries, capital coordinates and county search data…');
load();
})();
