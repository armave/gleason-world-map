import test from 'node:test';
import assert from 'node:assert/strict';
import {rotatePoint,unrotatePoint,worldToScreenPoint,screenToWorldPoint,panForWorldCenterPoint,normalizeRotationDegrees,shortestRotationDelta,screenUprightRotation,uprightTextAngle,screenReadingDirection} from '../src/map/view-transform.js';
test('rotation and inverse rotation round-trip projected map points',()=>{const p={x:123.4,y:-567.8},a=37*Math.PI/180,r=rotatePoint(p.x,p.y,a),q=unrotatePoint(r.x,r.y,a);assert.ok(Math.abs(q.x-p.x)<1e-9);assert.ok(Math.abs(q.y-p.y)<1e-9);});
test('screen and world transforms round-trip across pan, zoom and rotation',()=>{const s={zoom:2.75,panX:81,panY:-44,width:1200,height:760,angle:-123*Math.PI/180},p={x:-220.5,y:810.25};const a=worldToScreenPoint(p.x,p.y,s.zoom,s.panX,s.panY,s.width,s.height,s.angle),q=screenToWorldPoint(a.x,a.y,s.zoom,s.panX,s.panY,s.width,s.height,s.angle);assert.ok(Math.abs(q.x-p.x)<1e-9);assert.ok(Math.abs(q.y-p.y)<1e-9);});
test('cursor-anchored zoom preserves the world point beneath the pointer',()=>{const s={zoom:1.6,panX:-35,panY:64,width:900,height:700,angle:82*Math.PI/180},cursor={x:230,y:460},w=screenToWorldPoint(cursor.x,cursor.y,s.zoom,s.panX,s.panY,s.width,s.height,s.angle),z=3.2,r=rotatePoint(w.x,w.y,s.angle),px=cursor.x-s.width/2-r.x*z,py=cursor.y-s.height/2-r.y*z,q=screenToWorldPoint(cursor.x,cursor.y,z,px,py,s.width,s.height,s.angle);assert.ok(Math.abs(q.x-w.x)<1e-9);assert.ok(Math.abs(q.y-w.y)<1e-9);});
test('focusing a map point recentres it correctly at any orientation',()=>{for(const degrees of [-170,-45,0,92,180]){const angle=degrees*Math.PI/180,p={x:120.75,y:-88.2},z=3.4,pan=panForWorldCenterPoint(p.x,p.y,z,angle),screen=worldToScreenPoint(p.x,p.y,z,pan.panX,pan.panY,950,620,angle);assert.ok(Math.abs(screen.x-475)<1e-9);assert.ok(Math.abs(screen.y-310)<1e-9);}});
test('rotation targets take the shortest path across the -180/180 seam',()=>{assert.equal(shortestRotationDelta(170,-170),20);assert.equal(shortestRotationDelta(-170,170),-20);assert.equal(shortestRotationDelta(35,40),5);});
test('rotation normalization keeps the slider range centred on north-up',()=>{assert.equal(normalizeRotationDegrees(540),180);assert.equal(normalizeRotationDegrees(-540),180);assert.equal(normalizeRotationDegrees(360),0);});

test('map rotation does not invert text labels',()=>{for(const mapAngle of [-Math.PI,-Math.PI/2,0,Math.PI/2,Math.PI]){const local=screenUprightRotation(0,mapAngle);assert.ok(Math.abs(local+mapAngle)<1e-12);}});
test('curved cartographic labels keep their local tangent as the map rotates',()=>{const tangent=.37;for(const mapAngle of [-2.4,-1.2,0,1.8,Math.PI]){const local=screenUprightRotation(tangent,mapAngle);assert.ok(Math.abs(mapAngle+local-tangent)<1e-12);}});

test('curved labels advance left-to-right on screen at every map rotation',()=>{
 for(const mapAngle of [-Math.PI,-2.4,-Math.PI/2,-.3,0,.7,Math.PI/2,2.2,Math.PI]){
  for(let longitude=-Math.PI;longitude<=Math.PI+1e-9;longitude+=Math.PI/12){
   const direction=screenReadingDirection(longitude,mapAngle);
   const screenDx=direction*(-Math.sin(longitude-mapAngle));
   assert.ok(screenDx>=-1e-9,`label flow reversed at longitude ${longitude} and map angle ${mapAngle}`);
  }
 }
});
test('curved glyph tangents are normalized to the readable screen half-plane',()=>{
 for(const mapAngle of [-Math.PI,-2.4,-Math.PI/2,-.3,0,.7,Math.PI/2,2.2,Math.PI]){
  for(let longitude=-Math.PI;longitude<=Math.PI+1e-9;longitude+=Math.PI/12){
   const direction=screenReadingDirection(longitude,mapAngle);
   const localTangent=Math.atan2(-direction*Math.cos(longitude),-direction*Math.sin(longitude));
   const screenTangent=uprightTextAngle(localTangent+mapAngle);
   assert.ok(screenTangent>=-Math.PI/2-1e-9&&screenTangent<=Math.PI/2+1e-9);
  }
 }
});
