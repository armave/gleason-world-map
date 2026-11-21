import {getLocalScaleFactors,radialDistanceFromNorthKm} from '../core/gleason-sphere.js';
import {scaleFactorText} from '../core/format.js';

export function renderRadialCalibration(radialRows){
 const rows=[90,60,30,0,-30,-60,-90].map(lat=>{
  const radiusKm=radialDistanceFromNorthKm(lat);
  const label=lat===0?'0°':Math.abs(lat)+'°'+(lat>0?'N':'S');
  const colatitude=(90-lat).toFixed(0)+'°';
  const radius=radiusKm.toLocaleString('en-US',{maximumFractionDigits:2})+' km';
  return '<tr><td>'+label+'</td><td>'+colatitude+'</td><td>'+radius+'</td></tr>';
 });
 radialRows.innerHTML=rows.join('');
}

export function renderDistortionPanel(elements,anchor){
 const f=getLocalScaleFactors(anchor.lat);
 elements.place.textContent=anchor.label+' · '+anchor.lat.toFixed(2)+'°';
 elements.radial.textContent=scaleFactorText(f.northSouthScale);
 elements.eastWest.textContent=scaleFactorText(f.eastWestStretch);
 elements.decoder.textContent=scaleFactorText(f.eastWestDecoder);
 elements.area.textContent=scaleFactorText(f.areaStretch);
}
