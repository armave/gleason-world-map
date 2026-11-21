import {getLocalWgs84ScaleFactors,meridionalDistanceFromNorthKm} from '../core/wgs84.js';
import {scaleFactorText} from '../core/format.js';
export function renderRadialCalibration(radialRows){
 const rows=[90,60,30,0,-30,-60,-90].map(lat=>{
  const groundKm=meridionalDistanceFromNorthKm(lat);
  const label=lat===0?'0°':Math.abs(lat)+'°'+(lat>0?'N':'S');
  const km=groundKm.toLocaleString('en-US',{maximumFractionDigits:2})+' km';
  return '<tr><td>'+label+'</td><td>'+km+'</td><td>'+km+'</td></tr>';
 });
 radialRows.innerHTML=rows.join('');
}

export function renderDistortionPanel(elements,anchor){
 const f=getLocalWgs84ScaleFactors(anchor.lat);
 elements.place.textContent=anchor.label+' · '+anchor.lat.toFixed(2)+'°';
 elements.radial.textContent=scaleFactorText(f.northSouthScale);
 elements.eastWest.textContent=scaleFactorText(f.eastWestStretch);
 elements.decoder.textContent=scaleFactorText(f.eastWestDecoder);
 elements.area.textContent=scaleFactorText(f.areaStretch);
}
