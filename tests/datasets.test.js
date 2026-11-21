import test from 'node:test';import assert from 'node:assert/strict';import {parseCSV,COUNTRY_URL,COUNTRY_FALLBACK_URL,COUNTRY_URLS,MAP_QUALITY_OPTIONS} from '../src/data/datasets.js';
test('CSV parser handles escaped quotes and filters invalid rows',()=>{const r=parseCSV('iso,city,latitude,longitude\nARM,Yerevan,40.1792,44.4991\nAAA,"Port ""Alpha""",1,2\nBAD,Invalid,n/a,3\n');assert.equal(r.length,2);assert.deepEqual(r[0],{iso:'ARM',city:'Yerevan',lat:40.1792,lon:44.4991});assert.equal(r[1].city,'Port "Alpha"');});
test('CSV parser accepts alternate header fields',()=>{assert.deepEqual(parseCSV('alpha3code,capitalcity,lat,lon\nFRA,Paris,48.8566,2.3522\n'),[{iso:'FRA',city:'Paris',lat:48.8566,lon:2.3522}]);});

test('initial country boundaries use the lighter 1:50m dataset with 1:110m fallback',()=>{assert.match(COUNTRY_URL,/ne_50m_admin_0_countries\.geojson$/);assert.match(COUNTRY_FALLBACK_URL,/ne_110m_admin_0_countries\.geojson$/);});

test('map quality options map to the expected Natural Earth scales',()=>{assert.match(COUNTRY_URLS.low,/ne_110m_admin_0_countries\\.geojson$/);assert.match(COUNTRY_URLS.medium,/ne_50m_admin_0_countries\\.geojson$/);assert.match(COUNTRY_URLS.high,/ne_10m_admin_0_countries\\.geojson$/);assert.equal(MAP_QUALITY_OPTIONS.high.scale,'1:10m');});
