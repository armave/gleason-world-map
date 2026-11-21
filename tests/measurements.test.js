import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasurementSegments,measurementStrokeStyle} from '../src/map/measurements.js';

const point=(lat,lon)=>({lat,lon});
const fakeGeodesic=(a,b)=>[[a.lon,a.lat],[(a.lon+b.lon)/2,(a.lat+b.lat)/2],[b.lon,b.lat]];

test('distance connector creates a single geodesic between A and B',()=>{
 const points=[point(10,20),point(30,50)];
 const segments=createMeasurementSegments(points,fakeGeodesic);
 assert.equal(segments.length,1);
 assert.deepEqual(segments[0][0],[20,10]);
 assert.deepEqual(segments[0].at(-1),[50,30]);
});

test('area connector links every successive point and stays open while drawing',()=>{
 const points=[point(0,0),point(0,2),point(2,2),point(2,0)];
 const segments=createMeasurementSegments(points,fakeGeodesic);
 assert.equal(segments.length,3);
 assert.deepEqual(segments[0].at(-1),segments[1][0]);
 assert.deepEqual(segments[1].at(-1),segments[2][0]);
});

test('finished area adds one closing geodesic from the last vertex to the first',()=>{
 const points=[point(0,0),point(0,2),point(2,2)];
 const segments=createMeasurementSegments(points,fakeGeodesic,true);
 assert.equal(segments.length,3);
 assert.deepEqual(segments[2][0],[2,2]);
 assert.deepEqual(segments[2].at(-1),[0,0]);
});

test('distance and area connectors both use scaled, visible dashed strokes',()=>{
 for(const tool of ['distance','area']){
  const style=measurementStrokeStyle(tool,2);
  assert.ok(style.lineWidth>0);
  assert.ok(style.haloWidth>style.lineWidth);
  assert.equal(style.dash.length,2);
  assert.ok(style.dash.every(value=>value>0));
 }
 assert.notEqual(measurementStrokeStyle('distance').color,measurementStrokeStyle('area').color);
 assert.throws(()=>measurementStrokeStyle('unknown'),/Unknown measurement connector/);
});
