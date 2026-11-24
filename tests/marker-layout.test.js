import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectNonOverlappingMarkers } from '../src/map/labels.js';
import { scalePanForDiskResize } from '../src/map/view-transform.js';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('capital markers declutter in screen space and keep a selected capital visible', () => {
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

test('pan offsets retain their disk-relative position after a geometry resize', () => {
  assert.deepEqual(scalePanForDiskResize(120, -60, 300, 450), {
    panX: 180,
    panY: -90
  });
  assert.deepEqual(scalePanForDiskResize(25, 40, 0, 400), {
    panX: 25,
    panY: 40
  });
});

test('capital drawing uses viewport-aware collision filtering and resize preserves pan', () => {
  assert.match(app, /scalePanForDiskResize\(panX,panY,geometryBaseR,nextBaseR\)/);
  assert.match(app, /selectNonOverlappingMarkers\(markerCandidates,labelCollisionBoxes,1\.25\)/);
  assert.match(app, /markerCandidates\.push\(marker\)/);
});

test('mobile Find and Measure dock is collapsed behind an accessible control', () => {
  assert.match(html, /id="mapToolsToggle"[^>]*aria-expanded="false"[^>]*aria-controls="mapToolsPanels"/);
  assert.match(html, /id="mapToolsPanels"/);
  assert.match(app, /mapToolsStack'\)\.classList\.toggle\('is-open'\)/);
  assert.match(styles, /\.map-tools-stack:not\(\.is-open\) \.map-tools-panels\{display:none\}/);
  assert.match(styles, /\.map-tools-toggle\{display:inline-flex;min-height:40px\}/);
});

test('mobile fullscreen keeps the map viewport tall and toolbars compact', () => {
  assert.match(styles, /\.map-card:fullscreen \.map-orientation\{display:flex;flex-wrap:nowrap/);
  assert.match(styles, /\.map-card:fullscreen \.map-actions button\{min-height:34px/);
  assert.match(styles, /\.map-card:fullscreen \.map-viewport,\.map-card:-webkit-full-screen \.map-viewport\{flex:1;min-height:0\}/);
});

test('the reset control explicitly fits the complete disk', () => {
  assert.match(html, /id="resetView"[^>]*title="Fit the complete disk and reset orientation">Fit disk/);
  assert.match(app, /\$\('resetView'\)\.addEventListener\('click',\(\)=>\{zoom=1;panX=0;panY=0/);
});
