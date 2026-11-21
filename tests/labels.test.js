import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPITAL_LABEL_MIN_ZOOM, COUNTY_LABEL_MIN_ZOOM, countyLabelText, selectNonOverlappingLabels } from '../src/map/labels.js';

test('place-name labels use zoom thresholds that retain a clean global view',()=>{
 assert.equal(CAPITAL_LABEL_MIN_ZOOM,1.25);
 assert.equal(COUNTY_LABEL_MIN_ZOOM,2.7);
});
test('county-equivalent suffixes are removed for compact map labels',()=>{
 assert.equal(countyLabelText('Los Angeles County'),'Los Angeles');
 assert.equal(countyLabelText('Orleans Parish'),'Orleans');
 assert.equal(countyLabelText('Anchorage Municipality'),'Anchorage');
});
test('screen-space label collisions are filtered and selected/reserved labels remain clear',()=>{
 const candidate=(text,left,top,width=24)=>({text,box:{left,top,right:left+width,bottom:top+10}});
 const a=candidate('Alpha',0,0),b=candidate('Beta',4,2),c=candidate('Gamma',48,0);
 assert.deepEqual(selectNonOverlappingLabels([a,b,c]),[a,c]);
 assert.deepEqual(selectNonOverlappingLabels([b,c],[a.box]),[c]);
});
