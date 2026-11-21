import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { centeredCanvasTransform } from '../src/map/canvas-transform.js';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('country-fill cache origin is centered in physical pixels at every DPR', () => {
  assert.deepEqual(centeredCanvasTransform(1, 300), [1, 0, 0, 1, 300, 300]);
  assert.deepEqual(centeredCanvasTransform(2, 300), [2, 0, 0, 2, 600, 600]);

  const radius = 240;
  const [scale, , , , translateX, translateY] = centeredCanvasTransform(2, radius);
  assert.deepEqual([
    -radius * scale + translateX,
    radius * scale + translateY
  ], [0, radius * 4]);
});

test('country-fill cache is invalidated when device pixel ratio changes', () => {
  assert.match(app, /countryLayerDpr=NaN/);
  assert.match(app, /countryLayerDpr!==dpr/);
  assert.match(app, /countryLayerDpr===dpr/);
  assert.match(app, /setTransform\(\.\.\.centeredCanvasTransform\(pixelRatio,baseR\)\)/);
});

test('cached country fills and live border paths share the same disk origin', () => {
  assert.match(app, /ctx\.drawImage\(countryLayerCanvas,-baseR,-baseR,baseR\*2,baseR\*2\)/);
  assert.match(app, /ctx\.stroke\(countryOutlinesPath\)/);
  assert.match(app, /layerCtx\.setTransform\(\.\.\.centeredCanvasTransform\(pixelRatio,baseR\)\)/);
});
