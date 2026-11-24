import {
  EQUATOR_RADIUS_KM,
  KILOMETRES_PER_DEGREE,
  radialDistanceFromNorthKm
} from '../core/dual-disk.js';

/** Render the exact dual-disk planar convention and its latitude-ring dimensions. */
export function renderRadialCalibration(
  radialRows, visualRows, formulaElement, statusElement, geometryMetricFormula
) {
  if (formulaElement) {
    formulaElement.innerHTML =
      'R_eq = 90° × 111.12 km = ' + EQUATOR_RADIUS_KM.toLocaleString('en-US') + ' km<br>' +
      'N: r = (90° − φ) × ' + KILOMETRES_PER_DEGREE + ' km<br>' +
      'S: r = (90° + φ) × ' + KILOMETRES_PER_DEGREE + ' km<br>' +
      'N: x = −R_eq + r · cos λ; y = r · sin λ<br>' +
      'S: x = +R_eq − r · cos λ; y = r · sin λ';
  }
  if (statusElement) {
    statusElement.textContent =
      'Two equal-radius flat disks are centred on the North and South Poles. ' +
      'The Equator is each disk rim, Greenwich meets at the hinge point (0,0), ' +
      'and all map layers use the same 2D projection.';
  }
  if (radialRows) {
    const latitudes=[90,75,60,45,30,15,0,-15,-30,-45,-60,-75,-90];
    radialRows.innerHTML=latitudes.map(latitude=>{
      const disk=latitude>=0?'N':'S';
      const radius=radialDistanceFromNorthKm(latitude);
      const label=latitude===0?'0°':Math.abs(latitude)+'°'+(latitude>0?'N':'S');
      return '<tr><td>'+label+'</td><td>'+disk+'</td><td>'+
        radius.toLocaleString('en-US',{maximumFractionDigits:1})+' km</td></tr>';
    }).join('');
  }
  if (visualRows) visualRows.innerHTML='';
  if (geometryMetricFormula) {
    geometryMetricFormula.innerHTML =
      'Same disk: D = √((x₂ − x₁)² + (y₂ − y₁)²)<br>' +
      'Cross Equator: min λ [ |A − E_N(λ)| + |E_S(λ) − B| ]<br>' +
      'Area: clipped planar shoelace · Perimeter: canonical route lengths';
  }
}
