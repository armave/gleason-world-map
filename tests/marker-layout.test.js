import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectNonOverlappingMarkers } from '../src/map/labels.js';

const app = await readFile(new URL('../src/dual-disk-app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('capital marker decluttering utility preserves selected points and avoids tool overlays', () => {
  const markers = [
    { id: 'nearby', screenX: 100, screenY: 100, radiusPx: 2.45, centerDistance: 0 },
    { id: 'selected', screenX: 102, screenY: 100, radiusPx: 4.75, selected: true, centerDistance: 2 },
    { id: 'separate', screenX: 140, screenY: 100, radiusPx: 2.45, centerDistance: 40 },
    { id: 'behind-tools', screenX: 200, screenY: 200, radiusPx: 2.45, centerDistance: 150 }
  ];
  const visible = selectNonOverlappingMarkers(markers, [
    { left: 194, top: 194, right: 206, bottom: 206 }
  ], 1.25);
  assert.deepEqual(visible.map(marker => marker.id), ['selected', 'separate']);
  assert.deepEqual(markers.map(marker => marker.id), ['nearby', 'selected', 'separate', 'behind-tools']);
});

test('capital markers with invalid screen coordinates are ignored', () => {
  const visible = selectNonOverlappingMarkers([
    { id: 'valid', screenX: 20, screenY: 30, radiusPx: 2.45 },
    { id: 'invalid-x', screenX: NaN, screenY: 30 },
    { id: 'invalid-y', screenX: 20, screenY: Infinity }
  ]);
  assert.deepEqual(visible.map(marker => marker.id), ['valid']);
});

test('every capital marker is placed through the shared dual-disk projection', () => {
  assert.match(app, /const point = project\(capital\.lat,capital\.lon\)/);
  assert.match(app, /function drawCapitals\(\)/);
  assert.match(app, /ctx\.arc\(point\.x, point\.y/);
});

test('default viewport fits both full circular disks side by side', () => {
  assert.match(app, /fitScale = Math\.min\(\(width - 42\) \/ \(4 \* R\), \(height - 42\) \/ \(2 \* R\)\)/);
  assert.match(app, /drawDiskBackground\('N'\)/);
  assert.match(app, /drawDiskBackground\('S'\)/);
  assert.match(html, /id="resetView"[^>]*title="Fit both disks and reset orientation">Fit both disks/);
});

test('mobile Find and Measure dock toggles the CSS is-open state accessibly', () => {
  assert.match(html, /id="mapToolsToggle"[^>]*aria-expanded="false"[^>]*aria-controls="mapToolsPanels"/);
  assert.match(html, /id="mapToolsPanels"/);
  assert.match(app, /const stack=\$\('mapToolsStack'\)/);
  assert.match(app, /stack\.classList\.toggle\('is-open',open\)/);
  assert.match(styles, /\.map-tools-stack:not\(\.is-open\) \.map-tools-panels\{display:none\}/);
  assert.match(styles, /\.map-tools-toggle\{display:inline-flex;min-height:40px\}/);
});

test('distance and area details become visible in their respective measurement modes', () => {
  assert.match(app, /\$\('measurementDetails'\)\.hidden=mode==='explore'/);
  assert.match(app, /\$\('distanceDetails'\)\.hidden=mode!=='measure'/);
  assert.match(app, /\$\('areaDetails'\)\.hidden=mode!=='area'/);
});

test('mobile fullscreen keeps the map viewport tall and toolbars compact', () => {
  assert.match(styles, /\.map-card:fullscreen \.map-orientation\{display:flex;flex-wrap:nowrap/);
  assert.match(styles, /\.map-card:fullscreen \.map-actions button\{min-height:34px/);
  assert.match(styles, /\.map-card:fullscreen \.map-viewport,\.map-card:-webkit-full-screen \.map-viewport\{flex:1;min-height:0\}/);
});
