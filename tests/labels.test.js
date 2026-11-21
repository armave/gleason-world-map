import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPITAL_LABEL_MAX_SCALE_KM,
  COUNTRY_LABEL_MAX_SCALE_KM,
  COUNTRY_LABEL_MIN_SCALE_KM,
  shouldShowCapitalLabels,
  shouldShowCountryLabels,
  selectNonOverlappingLabels
} from '../src/map/labels.js';

test('country names are shown at broad and regional scales, then hidden in close-up views',()=>{
 assert.equal(COUNTRY_LABEL_MAX_SCALE_KM,16000);
 assert.equal(COUNTRY_LABEL_MIN_SCALE_KM,500);
 assert.equal(shouldShowCountryLabels(16000),true);
 assert.equal(shouldShowCountryLabels(10000),true);
 assert.equal(shouldShowCountryLabels(501),true);
 assert.equal(shouldShowCountryLabels(500),false);
 assert.equal(shouldShowCountryLabels(250),false);
 assert.equal(shouldShowCountryLabels(20000),false);
});
test('capital names appear at a regional scale and remain available at closer scales',()=>{
 assert.equal(CAPITAL_LABEL_MAX_SCALE_KM,2500);
 assert.equal(shouldShowCapitalLabels(2500),true);
 assert.equal(shouldShowCapitalLabels(2000),true);
 assert.equal(shouldShowCapitalLabels(50),true);
 assert.equal(shouldShowCapitalLabels(3000),false);
 assert.equal(shouldShowCapitalLabels(Infinity),false);
});
test('screen-space label collisions are filtered and selected/reserved labels remain clear',()=>{
 const candidate=(text,left,top,width=24)=>({text,box:{left,top,right:left+width,bottom:top+10}});
 const a=candidate('Alpha',0,0),b=candidate('Beta',4,2),c=candidate('Gamma',48,0);
 assert.deepEqual(selectNonOverlappingLabels([a,b,c]),[a,c]);
 assert.deepEqual(selectNonOverlappingLabels([b,c],[a.box]),[c]);
});
