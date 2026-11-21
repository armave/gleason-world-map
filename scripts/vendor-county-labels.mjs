#!/usr/bin/env node
// Build data/us-counties.json from the U.S. Census Bureau's public-domain 2024 Gazetteer.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const args=process.argv.slice(2);
function option(name,fallback){
 const i=args.indexOf(name);if(i<0)return fallback;
 const value=args[i+1];if(!value||value.startsWith('--'))throw new Error(`${name} requires a value`);
 return resolve(value);
}
for(let i=0;i<args.length;i++){if(args[i]==='--source-file'||args[i]==='--output')i++;else throw new Error(`Unknown argument: ${args[i]}`);}
const sourceFile=option('--source-file','2024_Gaz_counties_national.txt');
const outputFile=option('--output','data/us-counties.json');
const [header,...lines]=(await readFile(sourceFile,'utf8')).trim().split(/\r?\n/);
const columns=header.split('\t').map(value=>value.trim());
const index=Object.fromEntries(columns.map((name,i)=>[name,i]));
for(const field of ['USPS','GEOID','NAME','INTPTLAT','INTPTLONG'])if(index[field]===undefined)throw new Error(`Census source is missing the ${field} column`);
const seen=new Set(),counties=[];
for(const line of lines){
 if(!line.trim())continue;
 const row=line.split('\t').map(value=>value.trim());
 const geoid=row[index.GEOID],stateCode=row[index.USPS],name=row[index.NAME];
 const lat=Number(row[index.INTPTLAT]),lon=Number(row[index.INTPTLONG]);
 if(!/^\d{5}$/.test(geoid)||!/^[A-Z]{2}$/.test(stateCode)||!name||!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat>90||lon < -180||lon>180)continue;
 if(seen.has(geoid))throw new Error(`Duplicate Census GEOID: ${geoid}`);
 seen.add(geoid);counties.push([geoid,stateCode,name,lat,lon]);
}
counties.sort((a,b)=>a[0].localeCompare(b[0]));
if(counties.length<3000)throw new Error(`Expected at least 3,000 county-equivalent rows, got ${counties.length}`);
const output={schemaVersion:1,sourceYear:2024,source:'U.S. Census Bureau 2024 National Counties Gazetteer',
 sourceUrl:'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip',
 fields:['GEOID','USPS','NAME','INTPTLAT','INTPTLONG'],counties};
await writeFile(outputFile,JSON.stringify(output),'utf8');
console.log(`Wrote ${counties.length.toLocaleString()} county-equivalent label points to ${outputFile}`);
