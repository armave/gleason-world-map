import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createProjectedMeasurementSegments,
 createProjectedSegmentLabels,
 measurementStrokeStyle
} from '../src/map/measurements.js';

const point=(lat,lon)=>({lat,lon});
const project=(lon,lat)=>[lon*2,lat*3];

test('distance connector is one straight projected segment from A to B',()=>{
 const points=[point(-33.45,-70.67),point(-35.27,149.13)];
 const segments=createProjectedMeasurementSegments(points,project);
 assert.equal(segments.length,1);
 assert.equal(segments[0].length,2);
 assert.ok(Math.abs(segments[0][0][0]+141.34)<1e-9);
 assert.ok(Math.abs(segments[0][0][1]+100.35)<1e-9);
 assert.ok(Math.abs(segments[0][1][0]-298.26)<1e-9);
 assert.ok(Math.abs(segments[0][1][1]+105.81)<1e-9);
});

test('area connector supports open and closed straight-edge chains',()=>{
 const points=[point(0,0),point(0,2),point(2,2)];
 assert.equal(createProjectedMeasurementSegments(points,project).length,2);
 const closed=createProjectedMeasurementSegments(points,project,true);
 assert.equal(closed.length,3);
 assert.deepEqual(closed[2][0],[4,6]);
 assert.deepEqual(closed[2][1],[0,0]);
});

test('projected connector skips invalid points and projected endpoints',()=>{
 const points=[point(0,0),point(1,1)];
 assert.deepEqual(createProjectedMeasurementSegments(points,()=>[NaN,0]),[]);
 assert.deepEqual(createProjectedMeasurementSegments(points,null),[]);
 assert.deepEqual(createProjectedMeasurementSegments([point(0,0),null],project),[]);
});

test('distance connector is dashed; area retains its distinct dashed outline',()=>{
 const distance=measurementStrokeStyle('distance',2),area=measurementStrokeStyle('area',2);
 assert.ok(distance.lineWidth>0);
 assert.ok(distance.haloWidth>distance.lineWidth);
 assert.equal(distance.dash.length,2);
 assert.ok(distance.dash.every(value=>value>0));
 assert.ok(area.lineWidth>0);
 assert.ok(area.haloWidth>area.lineWidth);
 assert.equal(area.dash.length,2);
 assert.ok(area.dash.every(value=>value>0));
 assert.notEqual(distance.color,area.color);
 assert.notDeepEqual(distance.dash,area.dash);
 assert.throws(()=>measurementStrokeStyle('unknown'),/Unknown measurement connector/);
});


test('area edge labels use each straight projected edge midpoint and its supplied km metric',()=>{
 const points=[point(0,0),point(0,2),point(2,2)];
 const labels=createProjectedSegmentLabels(points,project,(a,b)=>Math.hypot(b.lon-a.lon,b.lat-a.lat)*1000);
 assert.equal(labels.length,2);
 assert.deepEqual([labels[0].x,labels[0].y],[2,0]);
 assert.equal(labels[0].meters,2000);
 assert.deepEqual([labels[1].x,labels[1].y],[4,3]);
 assert.equal(labels[1].meters,2000);
 const closed=createProjectedSegmentLabels(points,project,(a,b)=>Math.hypot(b.lon-a.lon,b.lat-a.lat)*1000,true);
 assert.equal(closed.length,3);
 assert.deepEqual([closed[2].x,closed[2].y],[2,3]);
 assert.ok(Math.abs(closed[2].meters-Math.sqrt(8)*1000)<1e-9);
});

test('edge labels skip invalid projected points and invalid distance results',()=>{
 const points=[point(0,0),point(1,1),point(2,2)];
 assert.deepEqual(createProjectedSegmentLabels(points,()=>[NaN,0],()=>100),[]);
 assert.deepEqual(createProjectedSegmentLabels(points,project,()=>null),[]);
 assert.deepEqual(createProjectedSegmentLabels(points,null,()=>100),[]);
});
