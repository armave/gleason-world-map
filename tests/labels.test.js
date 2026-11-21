import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPITAL_LABEL_MIN_ZOOM, COUNTY_BOUNDARY_MIN_ZOOM, COUNTY_LABEL_MIN_ZOOM, countyLabelText, selectNonOverlappingLabels, pointInCountyGeometry, countyAnchorForFeature } from '../src/map/labels.js';

test('place-name labels use zoom thresholds that retain a clean global view',()=>{
 assert.equal(CAPITAL_LABEL_MIN_ZOOM,1.25);
 assert.equal(COUNTY_BOUNDARY_MIN_ZOOM,2.25);
 assert.equal(COUNTY_LABEL_MIN_ZOOM,2.7);
});
test('county-equivalent suffixes are removed for compact map labels',()=>{
 assert.equal(countyLabelText('Los Angeles County'),'Los Angeles');
 assert.equal(countyLabelText('Orleans Parish'),'Orleans');
 assert.equal(countyLabelText('Anchorage Municipality'),'Anchorage');
 assert.equal(countyLabelText('Juneau City and Borough'),'Juneau');
});
test('screen-space label collisions are filtered and selected/reserved labels remain clear',()=>{
 const candidate=(text,left,top,width=24)=>({text,box:{left,top,right:left+width,bottom:top+10}});
 const a=candidate('Alpha',0,0),b=candidate('Beta',4,2),c=candidate('Gamma',48,0);
 assert.deepEqual(selectNonOverlappingLabels([a,b,c]),[a,c]);
 assert.deepEqual(selectNonOverlappingLabels([b,c],[a.box]),[c]);
});


test('Census internal points must be contained by their own county polygon',()=>{
 const feature={properties:{INTPTLAT:'34.2',INTPTLON:'-118.2'},geometry:{
  type:'Polygon',coordinates:[[[-119,33],[-117,33],[-117,35],[-119,35],[-119,33]]]
 }};
 assert.deepEqual(countyAnchorForFeature(feature),{lat:34.2,lon:-118.2});
 assert.equal(pointInCountyGeometry(-120,34,feature.geometry),false);
 assert.equal(countyAnchorForFeature({...feature,properties:{INTPTLAT:'36',INTPTLON:'-118.2'}}),null);
});

test('county point-in-polygon excludes holes and supports multipart counties',()=>{
 const geometry={type:'MultiPolygon',coordinates:[
  [[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]],
  [[[10,10],[12,10],[12,12],[10,12],[10,10]]]
 ]};
 assert.equal(pointInCountyGeometry(.5,.5,geometry),true);
 assert.equal(pointInCountyGeometry(2,2,geometry),false);
 assert.equal(pointInCountyGeometry(11,11,geometry),true);
});
