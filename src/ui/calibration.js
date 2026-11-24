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
  geometryMetricFormula,
  layoutMode = 'gleason'
) {
  if (formulaElement && layoutMode === 'interrupted-petals') {
    formulaElement.innerHTML =
      'r = (90° − φ) × 111.12 km<br>' +
      's(φ) = 1 − 0.55 × (|φ| / 90°), φ < 0°<br>' +
      'λ_eff = λ_c + wrap(λ − λ_c) × s(φ)<br>' +
      'x = r · cos(λ_eff)<br>' +
      'y = −r · sin(λ_eff)<br>' +
      'Three southern lobes · one North-Polar centre';
  } else if (formulaElement) {
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

  if (statusElement && layoutMode === 'interrupted-petals') {
    statusElement.textContent = 'Northern latitudes retain the Pure Gleason disk. Southern longitudes are compressed independently about the South America (−60°), Africa / Indian (+25°), and Australia / Pacific (+140°) lobe centres. Cross-lobe routes use the shortest two-segment planar path joined at matching latitude along the relevant gore edges. Open gore wedges are excluded from geographic hit-testing.';
  } else if (statusElement) {
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

  if (geometryMetricFormula && layoutMode === 'interrupted-petals') {
    geometryMetricFormula.innerHTML =
      'D_same = hypot(Δx, Δy)<br>' +
      'D_cross = minφc [ hypot(PA, CutL(φc)) + hypot(CutR(φc), PB) ]<br>' +
      'A = ½ · |Σ(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)|<br>' +
      'Planar edge stitching · shoelace area in the active petal plane';
  } else if (geometryMetricFormula) {
    geometryMetricFormula.innerHTML =
      'D = √((x₂ − x₁)² + (y₂ − y₁)²)<br>' +
      'A = ½ · |Σ(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)|<br>' +
      'Straight Euclidean chords in the displayed map plane · planar shoelace area';
  }
}
