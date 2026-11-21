import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(ROOT, 'data');
const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const CAPITAL_COMMIT = '2a34180a6573aaff977589b8b3644266c0a8c24f';
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/`;
const CAPITAL_BASE = `https://raw.githubusercontent.com/iliyaj/country-data/${CAPITAL_COMMIT}/`;
const DATASETS = { low:'ne_110m_admin_0_countries.geojson', medium:'ne_50m_admin_0_countries.geojson', high:'ne_10m_admin_0_countries.geojson' };
const COASTLINE_FILE = 'ne_50m_coastline.geojson';
const KEEP = ['ISO_A3_EH','ISO_A3','ADM0_A3','SOV_A3','ADMIN','NAME_EN','NAME','FORMAL_EN','LABEL_X','LABEL_Y'];

async function fetchText(url,label) {
  let lastError;
  for (let attempt=1; attempt<=3; attempt++) {
    try {
      const response=await fetch(url,{headers:{'user-agent':'gleason-world-map-data-vendor/1.0'}});
      if(!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
      return await response.text();
    } catch(error) {
      lastError=error;
      if(attempt<3) await new Promise(resolve=>setTimeout(resolve,attempt*1000));
    }
  }
  throw lastError;
}
function parseCSV(text) {
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) {
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(ch==='"') quoted=false;
      else field+=ch;
    } else if(ch==='"'&&field==='') quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=ch;
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  if(rows.length<2) throw new Error('Capital CSV is empty.');
  const headers=rows.shift().map(v=>v.trim().replace(/^\uFEFF/,'').toLowerCase().replace(/[^a-z0-9]/g,''));
  const pick=(...keys)=>keys.map(k=>headers.indexOf(k)).find(i=>i>=0);
  const ix={iso:pick('alpha3code','iso','isoa3','countrycode'),city:pick('capitalcity','capital','city'),lat:pick('latitude','lat'),lon:pick('longitude','lon','lng')};
  if(Object.values(ix).some(i=>i===undefined)) throw new Error('Unexpected capital CSV headers.');
  return rows.map(r=>({iso:String(r[ix.iso]??'').trim().toUpperCase(),city:String(r[ix.city]??'').trim(),lat:Number(r[ix.lat]),lon:Number(r[ix.lon])}))
    .filter(p=>p.iso&&p.city&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>=-90&&p.lat<=90&&p.lon>=-180&&p.lon<=180);
}
function compactFeature(feature) {
  if(!feature?.geometry||!['Polygon','MultiPolygon'].includes(feature.geometry.type)) return null;
  const p={};
  for(const key of KEEP) if(feature.properties?.[key]!==undefined&&feature.properties[key]!==null) p[key]=feature.properties[key];
  return {type:'Feature',properties:p,geometry:feature.geometry};
}
await mkdir(resolve(DATA_DIR,'countries'),{recursive:true});
const manifest={schemaVersion:1,generatedBy:'scripts/vendor-geodata.mjs',sources:{
 naturalEarth:{repository:'https://github.com/nvkelso/natural-earth-vector',commit:NE_COMMIT,dataset:'Admin 0 country boundaries at 1:10m, 1:50m and 1:110m plus 1:50m physical coastlines',license:'Public domain'},
 capitals:{repository:'https://github.com/iliyaj/country-data',commit:CAPITAL_COMMIT,file:'data/country-capital.csv',upstreamLicense:'MIT',underlyingDataSource:'REST Countries v3.1'}
},boundaryDatasets:{}};
for(const [quality,filename] of Object.entries(DATASETS)) {
 const source=JSON.parse(await fetchText(NE_BASE+filename,filename));
 if(source.type!=='FeatureCollection'||!Array.isArray(source.features)) throw new Error(`${filename}: invalid GeoJSON`);
 const features=source.features.map(compactFeature).filter(Boolean);
 const hasAntarctica=features.some(f=>{const p=f.properties;return [p.ISO_A3_EH,p.ISO_A3,p.ADM0_A3,p.SOV_A3].includes('ATA')||p.ADMIN==='Antarctica';});
 if(features.length<150||!hasAntarctica) throw new Error(`${filename}: validation failed (${features.length} features; Antarctica=${hasAntarctica})`);
 const json=Buffer.from(JSON.stringify({type:'FeatureCollection',name:`Natural Earth ${quality} country boundaries`,features}));
 const compressed=gzipSync(json,{level:9});
 await writeFile(resolve(DATA_DIR,'countries',quality+'.geojson.gz'),compressed);
 manifest.boundaryDatasets[quality]={sourceFile:filename,features:features.length,uncompressedBytes:json.length,compressedBytes:compressed.length,sha256:createHash('sha256').update(compressed).digest('hex')};
 console.log(`${quality}: ${features.length} features, ${json.length.toLocaleString()} B → ${compressed.length.toLocaleString()} B`);
}
const coastlineSource=JSON.parse(await fetchText(NE_BASE+COASTLINE_FILE,COASTLINE_FILE));
if(coastlineSource.type!=='FeatureCollection'||!Array.isArray(coastlineSource.features))throw new Error(`${COASTLINE_FILE}: invalid GeoJSON`);
const coastlineLines=coastlineSource.features.flatMap(feature=>{
 const geometry=feature?.geometry;
 return geometry?.type==='LineString'?[geometry.coordinates]:geometry?.type==='MultiLineString'?geometry.coordinates:[];
}).filter(line=>Array.isArray(line)&&line.length>=2).map(line=>line.map(([lon,lat])=>[Number(Number(lon).toFixed(4)),Number(Number(lat).toFixed(4))]));
const coastlinePoints=coastlineLines.reduce((sum,line)=>sum+line.length,0);
if(coastlineLines.length<1000||coastlinePoints<50000)throw new Error(`${COASTLINE_FILE}: coastline validation failed (${coastlineLines.length} lines, ${coastlinePoints} points)`);
const coastlineBytes=Buffer.from(JSON.stringify({type:'MultiLineString',coordinates:coastlineLines}));
await writeFile(resolve(DATA_DIR,'coastlines-50m.json'),coastlineBytes);
manifest.coastlines={sourceFile:COASTLINE_FILE,scale:'1:50m',lines:coastlineLines.length,points:coastlinePoints,bytes:coastlineBytes.length,sha256:createHash('sha256').update(coastlineBytes).digest('hex')};
console.log(`coastlines: ${coastlineLines.length} lines, ${coastlinePoints.toLocaleString()} points`);

const capitals=parseCSV(await fetchText(CAPITAL_BASE+'data/country-capital.csv','capital coordinates'));const capitals=parseCSV(await fetchText(CAPITAL_BASE+'data/country-capital.csv','capital coordinates'));
const yerevan=capitals.some(p=>p.iso==='ARM'&&p.city.toLowerCase()==='yerevan');
if(capitals.length<150||!yerevan) throw new Error(`Capital validation failed: rows=${capitals.length}, Yerevan=${yerevan}`);
await writeFile(resolve(DATA_DIR,'capitals.json'),JSON.stringify(capitals));
await writeFile(resolve(DATA_DIR,'capital-data-LICENSE.txt'),await fetchText(CAPITAL_BASE+'LICENSE','capital data license'));
manifest.capitals={records:capitals.length,file:'capitals.json'};
await writeFile(resolve(DATA_DIR,'metadata.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`capitals: ${capitals.length} records`);
console.log('Vendored geographic datasets successfully.');
