import test from 'node:test';
import assert from 'node:assert/strict';
import {createVintageTexturePatterns,createVintageTextureTiles} from '../src/map/vintage-texture.js';

class MockContext {
  constructor(){this.operations=[];}
  fillRect(...args){this.operations.push(['fillRect',...args]);}
  beginPath(){this.operations.push(['beginPath']);}
  moveTo(...args){this.operations.push(['moveTo',...args]);}
  lineTo(...args){this.operations.push(['lineTo',...args]);}
  quadraticCurveTo(...args){this.operations.push(['quadraticCurveTo',...args]);}
  stroke(){this.operations.push(['stroke']);}
  createPattern(source,repetition){return {source,repetition};}
}

function mockDocument(){
  const canvases=[];
  return {
    canvases,
    createElement(tag){
      assert.equal(tag,'canvas');
      const context=new MockContext();
      const canvas={width:0,height:0,getContext:()=>context,context};
      canvases.push(canvas);
      return canvas;
    }
  };
}

test('vintage texture tiles are deterministic, transparent and generated once per map session',()=>{
  const doc=mockDocument();
  const tiles=createVintageTextureTiles(doc);
  assert.deepEqual(Object.keys(tiles).sort(),['land','paper','water']);
  assert.equal(doc.canvases.length,3);
  for(const tile of Object.values(tiles)){
    assert.equal(tile.width,128);
    assert.equal(tile.height,128);
    assert.ok(tile.context.operations.length>0);
  }
  assert.equal(tiles,createVintageTextureTiles(doc));
});

test('vintage texture patterns are context-owned repeat fills',()=>{
  const doc=mockDocument();
  const tiles=createVintageTextureTiles(doc);
  const context=new MockContext();
  const patterns=createVintageTexturePatterns(context,tiles);
  assert.deepEqual(Object.keys(patterns).sort(),['land','paper','water']);
  for(const [kind,pattern] of Object.entries(patterns)){
    assert.equal(pattern.source,tiles[kind]);
    assert.equal(pattern.repetition,'repeat');
  }
});

test('texture helpers fail safely when canvas creation is unavailable',()=>{
  assert.equal(createVintageTextureTiles(null),null);
  assert.equal(createVintageTexturePatterns(null,{}),null);
});
