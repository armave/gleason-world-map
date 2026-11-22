import {DISK_RADIUS_KM,radialDistanceFromNorthKm} from '../core/flat-disk.js';
import {FLIGHT_PATH_CALIBRATION} from '../core/flight-path-calibration-parameters.js';
import {isGloballyValidatedFlightPathCalibration} from '../core/flight-path-calibration-status.js';
import FLIGHT_PATH_CALIBRATION_SUMMARY from '../../data/flight-path-calibration-summary.json';
import {
 ACTIVE_VISUAL_LONGITUDE_WARP,
 maximumLongitudeWarpDisplacementRadians,
 minimumLongitudeWarpStretch
} from '../core/visual-longitude-calibration.js';
import {
 RADIAL_DISTANCE_PROFILE_MEAN,
 RADIAL_DISTANCE_PROFILE_EXPONENT,
 RADIAL_DISTANCE_VISUAL_CIRCLES,
 RADIAL_DISTANCE_INNER_FACTOR,
 RADIAL_DISTANCE_OUTER_FACTOR
} from '../core/visual-radial-calibration.js';

export function renderRadialCalibration(radialRows,visualRows,formulaElement,statusElement){
 const pending=FLIGHT_PATH_CALIBRATION.sourceDatasetVersion===0||
  !isGloballyValidatedFlightPathCalibration(FLIGHT_PATH_CALIBRATION_SUMMARY);
 const baseScale=FLIGHT_PATH_CALIBRATION.radialScaleKm.toLocaleString('en-US',{maximumFractionDigits:3});
 const exponent=FLIGHT_PATH_CALIBRATION.radialWarp.exponent.toFixed(3);
 const epsilon=FLIGHT_PATH_CALIBRATION.radialWarp.epsilon.toFixed(3);
 const profileExponent=RADIAL_DISTANCE_PROFILE_EXPONENT.toFixed(3);
 const profileMean=RADIAL_DISTANCE_PROFILE_MEAN.toFixed(6);
 const inner=RADIAL_DISTANCE_INNER_FACTOR.toFixed(2);
 const outer=RADIAL_DISTANCE_OUTER_FACTOR.toFixed(2);
 const longitudeWarp=ACTIVE_VISUAL_LONGITUDE_WARP;
 const angularShift=maximumLongitudeWarpDisplacementRadians(longitudeWarp)*180/Math.PI;
 const minimumAngularStretch=minimumLongitudeWarpStretch(longitudeWarp).toFixed(3);
 if(formulaElement){
  const scaleLabel=pending?'last approved scale retained':'accepted ADS-B path-fit scale';
  formulaElement.innerHTML='R_base = '+baseScale+' km ('+scaleLabel+')<br>'+
   'φ = latitude · π / 180<br>'+
   't = (π/2 − φ) / π<br>'+
   'q = ((t + ε)^p − ε^p) / ((1 + ε)^p − ε^p)<br>'+
   'p = '+exponent+' · ε = '+epsilon+'<br>'+
   'm(q) = '+outer+' + ('+inner+' − '+outer+') · (1 − q)^a<br>'+
   'a = '+profileExponent+' · mean(m) = '+profileMean+'<br>'+
   'I(q) = '+outer+'q + ('+inner+' − '+outer+') · [1 − (1 − q)^(a + 1)] / (a + 1)<br>'+
   'qᵥ = I(q) / mean(m)<br>'+
   'R_disk = πR_base · mean(m)<br>'+
   'r = πR_base · I(q) = R_disk · qᵥ<br>'+
   'g(q) = 4q(1 − q)<br>'+
   'λ′ = λ + g(q)[a₁sinλ + b₁(1 − cosλ) + a₂sin2λ + b₂(1 − cos2λ)]<br>'+
   'a₁ = '+longitudeWarp.firstSine.toFixed(4)+' · b₁ = '+longitudeWarp.firstCosine.toFixed(4)+'<br>'+
   'a₂ = '+longitudeWarp.secondSine.toFixed(4)+' · b₂ = '+longitudeWarp.secondCosine.toFixed(4)+'<br>'+
   'max |λ′ − λ| = '+angularShift.toFixed(2)+'° · min dλ′/dλ = '+minimumAngularStretch+'<br>'+
   'x = r · cos(λ′) · y = −r · sin(λ′)<br>'+
   'Flat-disk radius = πR_base · mean(m)';
 }
 if(statusElement){
  statusElement.textContent=pending
   ? 'The latest observed-path candidate has not passed the global validation gates, including independent southern coverage. The last approved flat-disk scale and latitude warp remain active; southern and polar geometry remains extrapolated, and the endpoint-based ADS-B mileage estimate is shown separately.'
   : 'Latest accepted visible-map fit: '+FLIGHT_PATH_CALIBRATION.trainingRouteCount+
    ' training airport pairs and '+FLIGHT_PATH_CALIBRATION.holdoutRouteCount+
    ' independent holdout pairs. The scale, latitude warp, 12-circle radial spacing and smooth longitude shear were fitted against projected ADS-B paths and observed ground-speed/time mileage. The shear returns to zero at the pole and Ice Wall; deep-southern rings remain an extrapolation where this archive has no routes.';
 }

 const rows=[90,60,30,0,-30,-60,-90].map(lat=>{
  const radiusKm=radialDistanceFromNorthKm(lat);
  const label=lat===0?'0°':Math.abs(lat)+'°'+(lat>0?'N':'S');
  const colatitude=(90-lat).toFixed(0)+'°';
  const radius=radiusKm.toLocaleString('en-US',{maximumFractionDigits:2})+' km';
  return '<tr><td>'+label+'</td><td>'+colatitude+'</td><td>'+radius+'</td></tr>';
 });
 radialRows.innerHTML=rows.join('');

 if(visualRows){
  const circleRows=RADIAL_DISTANCE_VISUAL_CIRCLES.map(({circle,distanceMultiplier,visualFraction})=>{
   const radialFactor=distanceMultiplier.toFixed(2)+'×';
   const visualRadiusPercent=(visualFraction*100).toFixed(1)+'%';
   const visualRadiusKm=(DISK_RADIUS_KM*visualFraction)
    .toLocaleString('en-US',{maximumFractionDigits:0})+' km';
   return '<tr><td>'+circle+'</td><td>'+radialFactor+'</td><td>'+visualRadiusPercent+'</td><td>'+visualRadiusKm+'</td></tr>';
  });
  visualRows.innerHTML=circleRows.join('');
 }
}
