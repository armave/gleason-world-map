import test from 'node:test';
import assert from 'node:assert/strict';
import {oceanLabelsForScale,drawOceanLabels} from '../src/map/ocean-labels.js';

const project=(lon,lat)=>{
 const radius=(90-lat)/180*100,angle=lon*Math.PI/180;
 return [radius*Math.cos(angle),-radius*Math.sin(angle)];
};
function mockContext(){
 const calls={fill:0,stroke:0};
 return {calls,save(){},restore(){},setLineDash(){},measureText(char){return {width:char===' '?3:5};},
  translate(){},rotate(){},strokeText(){calls.stroke++;},fillText(){calls.fill++;}};
}

test('ocean labels lead at global scales and detailed seas phase in regionally',()=>{
 const broad=oceanLabelsForScale(15000),regional=oceanLabelsForScale(5000),local=oceanLabelsForScale(3000),close=oceanLabelsForScale(50);
 assert.ok(broad.some(x=>x.name==='NORTH PACIFIC OCEAN'));
 assert.ok(!broad.some(x=>x.name==='BALTIC SEA'));
 assert.ok(regional.some(x=>x.name==='NORTH SEA'));
 assert.ok(!regional.some(x=>x.name==='MOZAMBIQUE CHANNEL'));
 assert.ok(local.some(x=>x.name==='MOZAMBIQUE CHANNEL'));
 assert.deepEqual(close,[]);
});
test('curved ocean labels render in water and avoid occupied label boxes',()=>{
 const ctx=mockContext();
 const boxes=drawOceanLabels(ctx,project,100,1,8000,{width:500,height:500,isLand:()=>false});
 assert.ok(boxes.length>0);
 assert.ok(ctx.calls.fill>0);
 const blocked=drawOceanLabels(mockContext(),project,100,1,8000,{width:500,height:500,isLand:()=>true});
 assert.deepEqual(blocked,[]);
 const crowded=drawOceanLabels(mockContext(),project,100,1,8000,{width:500,height:500,reservedBoxes:[{left:-1000,top:-1000,right:1000,bottom:1000}]});
 assert.deepEqual(crowded,[]);
});
