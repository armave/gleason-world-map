#!/usr/bin/env node
// Build data/us-counties.json from the U.S. Census Bureau's public-domain 2026 Gazetteer.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args=process.argv.slice(2);
function option(name,fallback){
 const i=args.indexOf(name);if(i<0)return fallback;
 const value=args[i+1];if(!value||value.startsWith('--'))throw new Error(`${name} requires a value`);
 return resolve(value);
}
for(let i=0;i<args.length;i++){if(args[i]==='--source-file'||args[i]==='--output')i++;else throw new Error(`Unknown argument: ${args[i]}`);}
const sourceFile=option('--source-file','2026_Gaz_counties_national.txt');
const outputFile=option('--output','data/us-counties.json');
const bytes=await readFile(sourceFile);
const sourceText=bytes.toString('utf8');
const withoutBom=sourceText.charCodeAt(0)===0xfeff?sourceText.slice(1):sourceText;
const sourceLines=withoutBom.split(String.fromCharCode(10)).map(line=>line.endsWith(String.fromCharCode(13))?line.slice(0,-1):line);
const [header,...lines]=sourceLines;
const columns=header.split('|').map(value=>value.trim());
const index=Object.fromEntries(columns.map((name,i)=>[name,i]));
for(const field of ['USPS','GEOID','NAME','INTPTLAT','INTPTLONG'])if(index[field]===undefined)throw new Error(`Census source is missing the ${field} column`);
const seen=new Set(),counties=[];
for(const line of lines){
 if(!line.trim())continue;
 const row=line.split('|').map(value=>value.trim());
 const geoid=row[index.GEOID],stateCode=row[index.USPS],name=row[index.NAME];
 const lat=Number(row[index.INTPTLAT]),lon=Number(row[index.INTPTLONG]);
 if(!/^[0-9]{5}$/.test(geoid)||!/^[A-Z]{2}$/.test(stateCode)||!name||!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat>90||lon < -180||lon>180)continue;
 if(seen.has(geoid))throw new Error(`Duplicate Census GEOID: ${geoid}`);
 seen.add(geoid);counties.push([geoid,stateCode,name,lat,lon]);
}
counties.sort((a,b)=>a[0].localeCompare(b[0]));
if(counties.length!==3222)throw new Error(`Expected exactly 3,222 county-equivalent rows, got ${counties.length}`);
const output={schemaVersion:1,sourceYear:2026,source:'U.S. Census Bureau 2026 National Counties Gazetteer',
 sourceUrl:'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip',
 archiveSha256:'6a99ca00efbc0be5112e225d4102704c51d5ce3b16e3afd6e4159460595fd12a',
 inputSha256:createHash('sha256').update(bytes).digest('hex'),
 fields:['GEOID','USPS','NAME','INTPTLAT','INTPTLONG'],counties};
await writeFile(outputFile,JSON.stringify(output),'utf8');
console.log(`Wrote ${counties.length.toLocaleString()} county-equivalent label points to ${outputFile}`);
