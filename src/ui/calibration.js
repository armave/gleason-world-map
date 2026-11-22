import {DISK_RADIUS_KM,radialDistanceFromNorthKm} from '../core/flat-disk.js';
import {
 RADIAL_DISTANCE_CIRCLE_COUNT,
 RADIAL_DISTANCE_CIRCLE_FACTORS,
 visualRadialFractionFromBaseFraction
} from '../core/visual-radial-calibration.js';

export function renderRadialCalibration(radialRows,visualRows){
 const rows=[90,60,30,0,-30,-60,-90].map(lat=>{
  const radiusKm=radialDistanceFromNorthKm(lat);
  const label=lat===0?'0°':Math.abs(lat)+'°'+(lat>0?'N':'S');
  const colatitude=(90-lat).toFixed(0)+'°';
  const radius=radiusKm.toLocaleString('en-US',{maximumFractionDigits:2})+' km';
  return '<tr><td>'+label+'</td><td>'+colatitude+'</td><td>'+radius+'</td></tr>';
 });
 radialRows.innerHTML=rows.join('');

 if(visualRows){
  const circleRows=Array.from({length:RADIAL_DISTANCE_CIRCLE_COUNT},(_,index)=>{
   const baseFraction=index/(RADIAL_DISTANCE_CIRCLE_COUNT-1);
   const visualFraction=visualRadialFractionFromBaseFraction(baseFraction);
   const factor=RADIAL_DISTANCE_CIRCLE_FACTORS[index].toFixed(2)+'×';
   const visualRadiusPercent=(visualFraction*100).toFixed(1)+'%';
   const visualRadiusKm=(DISK_RADIUS_KM*visualFraction)
    .toLocaleString('en-US',{maximumFractionDigits:0})+' km';
   return '<tr><td>'+(index+1)+'</td><td>'+factor+'</td><td>'+visualRadiusPercent+'</td><td>'+visualRadiusKm+'</td></tr>';
  });
  visualRows.innerHTML=circleRows.join('');
 }
}
