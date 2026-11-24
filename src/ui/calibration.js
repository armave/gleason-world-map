import {
  DISK_RADIUS_KM,
  radialDistanceFromNorthKm,
  KILOMETRES_PER_DEGREE
} from '../core/flat-disk.js';

/**
 * Explain the fixed Gleason layout without presenting any empirical fit as
 * geometry. Latitude rings are equally spaced from the North Pole to the rim.
 */
export function renderRadialCalibration(
  radialRows,
  visualRows,
  formulaElement,
  statusElement,
  geometryMetricFormula
) {
  if (formulaElement) {
    formulaElement.innerHTML =
      'θ = 90° − φ<br>' +
      'r = θ × 60 nautical miles / degree<br>' +
      'r = θ × ' + KILOMETRES_PER_DEGREE.toFixed(2) + ' km<br>' +
      'R_disk = 180° × 111.12 km = ' +
      DISK_RADIUS_KM.toLocaleString('en-US', { maximumFractionDigits: 1 }) +
      ' km<br>' +
      'x = r · cos λ<br>' +
      'y = −r · sin λ';
  }

  if (statusElement) {
    statusElement.textContent =
      'Pure Gleason baseline: equal angular latitude steps produce equal radial ring spacing; ' +
      'meridians are straight rays from the North Pole. No fitted latitude warp, longitude ' +
      'shear, 12-circle profile or flight-path parameters are applied. This defines the ' +
      'historical drawing geometry; comparison with independent real-world references is ' +
      'a separate validation task.';
  }

  if (radialRows) {
    const latitudes = [
      90, 75, 60, 45, 30, 15, 0,
      -15, -30, -45, -60, -75, -90
    ];
    radialRows.innerHTML = latitudes.map(latitude => {
      const radius = radialDistanceFromNorthKm(latitude);
      const label = latitude === 0
        ? '0°'
        : Math.abs(latitude) + '°' + (latitude > 0 ? 'N' : 'S');
      const colatitude = (90 - latitude) + '°';
      return '<tr><td>' + label + '</td><td>' + colatitude +
        '</td><td>' + radius.toLocaleString('en-US', {
          maximumFractionDigits: 1
        }) + ' km</td></tr>';
    }).join('');
  }

  if (visualRows) visualRows.innerHTML = '';

  if (geometryMetricFormula) {
    geometryMetricFormula.innerHTML =
      'D = √((x₂ − x₁)² + (y₂ − y₁)²)<br>' +
      'A = ½ · |Σ(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)|<br>' +
      'Straight Euclidean chords in the displayed map plane · planar shoelace area';
  }
}
