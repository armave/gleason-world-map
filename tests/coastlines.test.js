import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCoastlineLines,createCoastlinePath,createCoastlinePathAsync} from '../src/map/coastlines.js';

test('coastline segments crossing the antimeridian take the short way around the disk',()=>{
 const projected=projectCoastlineLines({coordinates:[[[179,0],[-179,0]]]},(lon,lat)=>[lon,lat],1);
 assert.equal(projected.length,1);
 assert.equal(projected[0].length,3);
 assert.deepEqual(projected[0],[[179,0],[180,0],[181,0]]);
});
test('disjoint coastline and island chains stay separate path subpaths',()=>{
 const lines={coordinates:[[[0,0],[1,1]],[[20,10],[21,11],[22,12]]]};
 const projected=projectCoastlineLines(lines,(lon,lat)=>[lon,lat]);
 assert.equal(projected.length,2);
 assert.deepEqual(projected[0],[[0,0],[1,1]]);
 assert.equal(projected[1].length,3);
});
test('invalid lines are skipped without discarding valid island features',()=>{
 const lines={coordinates:[[],[[NaN,0],[1,1]],[[0,0],[1,1]]]};
 const projected=projectCoastlineLines(lines,(lon,lat)=>[lon,lat]);
 assert.equal(projected.length,1);
});
test('Path2D output includes independent coastline paths',()=>{
 class PathMock{commands=[];moveTo(x,y){this.commands.push(['M',x,y]);}lineTo(x,y){this.commands.push(['L',x,y]);}}
 const path=createCoastlinePath({coordinates:[[[0,0],[1,1]],[[4,4],[5,5]]]},(lon,lat)=>[lon,lat],PathMock);
 assert.equal(path.commands.filter(c=>c[0]==='M').length,2);
 assert.equal(path.commands.filter(c=>c[0]==='L').length,2);
});

test('async coastline path builder yields between bounded batches',async()=>{
 class PathMock{commands=[];moveTo(x,y){this.commands.push(['M',x,y]);}lineTo(x,y){this.commands.push(['L',x,y]);}}
 const lines={coordinates:Array.from({length:5},(_,i)=>[[i,0],[i+1,1]])};
 let yields=0;
 const path=await createCoastlinePathAsync(lines,(lon,lat)=>[lon,lat],PathMock,{batchSize:2,yieldControl:async()=>{yields++;}});
 assert.equal(path.commands.filter(c=>c[0]==='M').length,5);
 assert.equal(yields,2);
});


test('interrupted petal coastlines split into separate subpaths at a southern gore seam', async () => {
  const { projectInterruptedPetalInLobe } = await import('../src/core/interrupted-petals.js');
  const { DISK_RADIUS_KM } = await import('../src/core/flat-disk.js');
  const line = { coordinates: [[[-25, -30], [-15, -30]]] };
  const projected = projectCoastlineLines(
    line,
    (lon, lat, petalIndex) => projectInterruptedPetalInLobe(lon, lat, petalIndex, DISK_RADIUS_KM),
    1.5,
    { layoutMode: 'interrupted-petals' }
  );
  assert.equal(projected.length, 2);
  assert.ok(projected.every(part => part.length >= 2));
  const goreGap = Math.hypot(
    projected[0].at(-1)[0] - projected[1][0][0],
    projected[0].at(-1)[1] - projected[1][0][1]
  );
  assert.ok(goreGap > 1000, 'the two petal edges remain separated by the open gore');
});
