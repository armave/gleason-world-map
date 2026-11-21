import test from 'node:test';
import assert from 'node:assert/strict';
import {MapController} from '../src/app/map-controller.js';

test('MapController coalesces invalidations into one animation frame',()=>{
  const request=globalThis.requestAnimationFrame;
  const cancel=globalThis.cancelAnimationFrame;
  const frames=new Map();
  let next=1,calls=0;
  globalThis.requestAnimationFrame=callback=>{
    const id=next++;
    frames.set(id,callback);
    return id;
  };
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  try {
    const controller=new MapController(()=>calls++);
    controller.scheduleDraw();
    controller.scheduleDraw();
    controller.scheduleDraw();
    assert.equal(frames.size,1);
    const [id,callback]=frames.entries().next().value;
    frames.delete(id);
    callback(16);
    assert.equal(calls,1);
    assert.equal(controller.pending,false);
    controller.dispose();
  } finally {
    globalThis.requestAnimationFrame=request;
    globalThis.cancelAnimationFrame=cancel;
  }
});

test('disposing cancels pending work and prevents later renders',()=>{
  const request=globalThis.requestAnimationFrame;
  const cancel=globalThis.cancelAnimationFrame;
  const frames=new Map();
  let next=1,cancelled=0,calls=0;
  globalThis.requestAnimationFrame=callback=>{
    const id=next++;
    frames.set(id,callback);
    return id;
  };
  globalThis.cancelAnimationFrame=id=>{
    if(frames.delete(id))cancelled++;
  };
  try {
    const controller=new MapController(()=>calls++);
    controller.scheduleDraw();
    controller.dispose();
    assert.equal(cancelled,1);
    assert.equal(calls,0);
    controller.scheduleDraw();
    assert.equal(frames.size,0);
  } finally {
    globalThis.requestAnimationFrame=request;
    globalThis.cancelAnimationFrame=cancel;
  }
});

test('renderer callback is required',()=>{
  assert.throws(()=>new MapController(null),TypeError);
});
