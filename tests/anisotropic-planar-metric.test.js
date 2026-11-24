import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the active Gleason projection and measurement runtime do not import the retired anisotropic metric', async () => {
  const activePaths = [
    'src/app.js',
    'src/dual-disk-app.js',
    'src/core/dual-disk.js',
    'src/core/flat-disk.js',
    'src/core/measurement-engine.js',
    'src/map/feature-paths.js',
    'src/map/coastlines.js',
    'src/map/measurements.js',
    'src/data/geojson.js',
    'src/ui/calibration.js'
  ];
  for (const relativePath of activePaths) {
    const source = await readFile(join(root, relativePath), 'utf8');
    assert.doesNotMatch(source, /anisotropic-planar-metric|integrateAnisotropicPlanarSegment/);
    assert.doesNotMatch(source, /ACTIVE_PLANAR_METRIC_C[12]|DEFAULT_TANGENTIAL_SCALE_C[12]/);
    assert.doesNotMatch(source, /FLIGHT_PATH_CALIBRATION|FLIGHT_CALIBRATION/);
  }
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:js|mjs|cjs|ts)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test('source code defines or imports no spherical/geodesic distance routines', async () => {
  const paths = [
    ...await sourceFiles(join(root, 'src')),
    ...await sourceFiles(join(root, 'scripts')),
    ...await sourceFiles(join(root, 'tests'))
  ];
  const names = [
    ['haver', 'sine'].join(''),
    ['vin', 'centy'].join(''),
    ['great', 'Circle', 'Distance'].join(''),
    ['geodesic', 'Distance'].join(''),
    ['spherical', 'Distance'].join(''),
    ['ellipsoid', 'Distance'].join('')
  ];
  const declarationOrImportFor = name => new RegExp(
    `(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=|export\\s*\\{[^}]*\\b${name}\\b|import\\s+[^;]*\\b${name}\\b)`
  );
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    for (const name of names) {
      assert.doesNotMatch(source, declarationOrImportFor(name),
        `${path} must not define or export ${name}`);
    }
  }
});
