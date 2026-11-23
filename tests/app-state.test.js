import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppState} from '../src/app/state.js';

test('state snapshots are immutable and nested state is merged',()=>{
  const state=createAppState({view:{zoom:2},layers:{grid:true,countries:true}});
  const before=state.getState();
  assert.ok(Object.isFrozen(before)&&Object.isFrozen(before.view));
  state.update({view:{rotationDegrees:45},layers:{grid:false}});
  assert.deepEqual(state.getState().view,{zoom:2,panX:0,panY:0,rotationDegrees:45});
  assert.deepEqual(state.getState().layers,{grid:false,countries:true});
  assert.equal(before.view.rotationDegrees,0);
});

test('measurement endpoint annotations are included in immutable snapshots',()=>{
  const state=createAppState();
  assert.deepEqual(state.getState().measurement.endpoints,[]);
  assert.equal(state.getState().measurement.distanceLabel,'');
  state.update({measurement:{
    endpoints:[{name:'Yerevan',coordinates:'40.18 N · 44.51 E'},{name:'Paris',coordinates:'48.86 N · 2.35 E'}],
    distanceLabel:'3,420 km'
  }});
  const measurement=state.getState().measurement;
  assert.equal(measurement.distanceLabel,'3,420 km');
  assert.equal(measurement.endpoints[0].name,'Yerevan');
  assert.ok(Object.isFrozen(measurement.endpoints));
  assert.ok(Object.isFrozen(measurement.endpoints[0]));
});

test('subscribers receive updates and can unsubscribe',()=>{
  const state=createAppState();
  const changes=[];
  const unsubscribe=state.subscribe((snapshot,meta)=>changes.push({snapshot,meta}));
  state.update({mode:'measure'},{source:'test'});
  assert.equal(changes.length,1);
  assert.equal(changes[0].snapshot.mode,'measure');
  assert.equal(changes[0].meta.source,'test');
  unsubscribe();
  state.update({mode:'area'});
  assert.equal(changes.length,1);
});

test('unchanged values do not notify and invalid patches throw',()=>{
  const state=createAppState();
  let calls=0;
  state.subscribe(()=>calls++);
  state.update({mode:'explore'});
  assert.equal(calls,0);
  assert.throws(()=>state.update([]),TypeError);
});
