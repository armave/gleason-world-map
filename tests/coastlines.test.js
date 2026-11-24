import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCoastlineLines,createCoastlinePath,createCoastlinePathAsync} from '../src/map/coastlines.js';
import {project} from '../src/core/dual-disk.js';

test('coastline crossing latitude zero is split into two disk subpaths',()=>{
 const input={coordinates:[[[10,10],[20,-10]]]};
 const result=projectCoastlineLines(input,project,1);
 assert.equal(result.length,2);
 assert.ok(result.every(line=>line.length>=2));
 assert.notDeepEqual(result[0].at(-1),result[1][0]);
 const northRim=project(0,15,'N'),southRim=project(0,15,'S');
 assert.deepEqual(result[0].at(-1),[northRim.x,northRim.y]);
 assert.deepEqual(result[1][0],[southRim.x,southRim.y]);
});
test('dateline coastline segments wrap longitude and remain within the selected disk',()=>{
 const result=projectCoastlineLines({coordinates:[[[179,20],[-179,20]]]},project,1);
 assert.equal(result.length,1);
 assert.ok(result[0].length>=3);
 assert.ok(result[0].every(point=>point.every(Number.isFinite)));
});
test('independent coastline and island lines remain separate subpaths',()=>{
 const result=projectCoastlineLines({coordinates:[[[0,20],[1,21]],[[20,-10],[21,-11],[22,-12]]]},project);
 assert.equal(result.length,2);
});
test('invalid lines are skipped without discarding valid island features',()=>{
 const result=projectCoastlineLines({coordinates:[[],[[NaN,0],[1,1]],[[0,0],[1,1]]]},project);
 assert.equal(result.length,1);
});
test('Path2D output preserves independent coastline subpaths',()=>{
 class PathMock{commands=[];moveTo(x,y){this.commands.push(['M',x,y]);}lineTo(x,y){this.commands.push(['L',x,y]);}}
 const path=createCoastlinePath({coordinates:[[[0,20],[1,21]],[[4,-10],[5,-11]]]},project,PathMock);
 assert.equal(path.commands.filter(command=>command[0]==='M').length,2);
});
test('async path builder yields between bounded batches',async()=>{
 class PathMock{commands=[];moveTo(x,y){this.commands.push(['M',x,y]);}lineTo(x,y){this.commands.push(['L',x,y]);}}
 const lines={coordinates:Array.from({length:5},(_,index)=>[[index,20],[index+1,21]])};
 let yields=0;
 const path=await createCoastlinePathAsync(lines,project,PathMock,{batchSize:2,yieldControl:async()=>{yields++;}});
 assert.equal(path.commands.filter(command=>command[0]==='M').length,5);
 assert.equal(yields,2);
});
