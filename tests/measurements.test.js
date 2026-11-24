import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createProjectedMeasurementSegments,createProjectedSegmentLabels,measurementStrokeStyle
} from '../src/map/measurements.js';
const point=(lat,lon)=>({lat,lon});

test('area edge segment drawing reuses same-disk chords and cross-Equator hinge legs',()=>{
 const same=[point(55,30),point(40,-10)];
 const across=[point(40,-10),point(-30,90)];
 assert.equal(createProjectedMeasurementSegments(same,null).length,1);
 assert.equal(createProjectedMeasurementSegments(across,null).length,2);
});
test('open and closed area chains use canonical route pieces for every edge',()=>{
 const points=[point(10,10),point(20,20),point(30,10)];
 assert.equal(createProjectedMeasurementSegments(points,null).length,2);
 const closed=createProjectedMeasurementSegments(points,null,true);
 assert.equal(closed.length,3);
});
test('segment labels report the same canonical distance as the direct engine',()=>{
 const points=[point(10,10),point(20,20),point(-10,100)];
 const labels=createProjectedSegmentLabels(points,null,null);
 assert.equal(labels.length,2);
 assert.ok(labels.every(label=>label.meters>0&&Number.isFinite(label.x)&&Number.isFinite(label.y)));
});
test('distance and area connector styles remain visually distinct and scale correctly',()=>{
 const distance=measurementStrokeStyle('distance',.02),area=measurementStrokeStyle('area',.02);
 assert.ok(distance.lineWidth>0&&distance.haloWidth>distance.lineWidth);
 assert.ok(area.lineWidth>0&&area.haloWidth>area.lineWidth);
 assert.notEqual(distance.color,area.color);
 assert.notDeepEqual(distance.dash,area.dash);
 assert.throws(()=>measurementStrokeStyle('unknown'),/Unknown measurement connector/);
});
