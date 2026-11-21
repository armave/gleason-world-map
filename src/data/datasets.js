import { norm } from '../core/format.js';
export const HISTORICAL_SCAN_URL = 'https://iiif.digitalcommonwealth.org/commonwealth:7h149v867/full/,2048/0/default.jpg';

export const COUNTRY_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
export const COUNTRY_FALLBACK_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
export const CAPITAL_URL='https://raw.githubusercontent.com/iliyaj/country-data/main/data/country-capital.csv';
export function parseCSV(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
  else if(ch==='"'&&field==='')quoted=true;
  else if(ch===','){row.push(field);field='';}
  else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
  else field+=ch;
 }
 if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
 if(rows.length<2)return [];
 const headers=rows.shift().map(h=>norm(h).replace(/ /g,''));
 const pick=names=>names.map(n=>headers.indexOf(n)).find(i=>i>=0);
 const ix={iso:pick(['iso','isoa3','alpha3code','countrycode','countryiso']),city:pick(['city','capital','capitalcity']),lat:pick(['lat','latitude']),lon:pick(['lon','lng','longitude'])};
 if(Object.values(ix).some(i=>i===undefined))throw new Error('Capital CSV is missing required columns (ISO, city, latitude, longitude).');
 const out=[];
 for(const r of rows){const iso=String(r[ix.iso]||'').trim().toUpperCase(),city=String(r[ix.city]||'').trim(),lat=Number(r[ix.lat]),lon=Number(r[ix.lon]);
  if(!iso||!city||!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)continue;
  out.push({iso,city,lat,lon});
 }
 return out;
}
export function validateDatasetText(text,key){
 if(key.startsWith('countries')){const data=JSON.parse(text);if(!Array.isArray(data.features)||!data.features.length)throw new Error('Country boundary data has no GeoJSON features.');}
 else if(key==='capitals'&&!parseCSV(text).length)throw new Error('Capital coordinate data contains no valid rows.');
}
export async function fetchTextCached(url,key){
 const cacheKey='gleason-map:'+key+':v2';let lastError=null;
 for(let attempt=0;attempt<2;attempt++){
  try{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),key==='countries-50m'?30000:15000);let response;try{response=await fetch(url,{signal:controller.signal});}finally{clearTimeout(timeout);}if(!response.ok)throw new Error(`HTTP ${response.status} while loading ${key}`);
   const text=await response.text();if(!text||text.length<20)throw new Error(`The ${key} dataset was empty.`);
   validateDatasetText(text,key);
   // Large boundary files can exceed browser storage quotas; keep them in memory only.
   if(text.length<=1_500_000){try{localStorage.setItem(cacheKey,text);}catch(storageError){console.info('Dataset loaded without persistent cache:',storageError);}}
   return {text,stale:false};
  }catch(err){lastError=err;if(attempt===0)await new Promise(resolve=>setTimeout(resolve,450));}
 }
 try{const cached=localStorage.getItem(cacheKey);if(cached&&cached.length>20){validateDatasetText(cached,key);return {text:cached,stale:true};}}catch(storageError){console.warn('Cached dataset unavailable:',storageError);}
 throw lastError||new Error(`Unable to load ${key}.`);
}
