import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../src/dual-disk-app.js',import.meta.url),'utf8');

test('default framing includes both complete, touching disks',()=>{
 assert.match(app,/\(width - 42\) \/ \(4 \* R\)/);
 assert.match(app,/\(height - 42\) \/ \(2 \* R\)/);
 assert.match(app,/drawDiskBackground\('N'\)/);
 assert.match(app,/drawDiskBackground\('S'\)/);
});
test('both hemispheric layers use the shared projection and hinge-clipped geometry',()=>{
 assert.match(app,/import \{[\s\S]*?project, unproject/);
 assert.match(app,/createFeaturePath\(feature,project/);
 assert.match(app,/createCoastlinePathAsync\(coastlineData,project/);
 assert.match(app,/projectGeoJSONRingParts\(ring,project\)/);
});
