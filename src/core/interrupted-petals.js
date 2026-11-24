import { DISK_RADIUS_KM, project as projectGleason, unproject as unprojectGleason, wrapLongitude } from './flat-disk.js';

export const PETAL_COMPRESSION = 0.55;
export const PETALS = Object.freeze([
  Object.freeze({id:0,key:'south-america',name:'South America',center:-60,west:-120,east:-20}),
  Object.freeze({id:1,key:'africa-indian',name:'Africa / Indian',center:25,west:-20,east:80}),
  Object.freeze({id:2,key:'australia-pacific',name:'Australia / Pacific',center:140,west:80,east:240})
]);
export const PETAL_SEAMS = Object.freeze([
  Object.freeze({name:'South America / Africa',a:0,sideA:'east',b:1,sideB:'west'}),
  Object.freeze({name:'Africa / Australia',a:1,sideA:'east',b:2,sideB:'west'}),
  Object.freeze({name:'Australia / South America',a:2,sideA:'east',b:0,sideB:'west'})
]);
const DEG=Math.PI/180, RAD=180/Math.PI, KM_PER_DEGREE=111.12;
const wrapDegrees=value=>((value+180)%360+360)%360-180;

export function getPetalIndex(longitude){
 if(!Number.isFinite(longitude))return -1;
 const lon=wrapLongitude(longitude);
 if(lon>=-120&&lon< -20)return 0;
 if(lon>=-20&&lon<80)return 1;
 return 2;
}

function pointKm(longitude,latitude,petalIndex){
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||latitude< -90||latitude>90)return [NaN,NaN];
 const radius=(90-latitude)*KM_PER_DEGREE;
 if(latitude>=0){
  const angle=longitude*DEG;
  return [radius*Math.cos(angle),-radius*Math.sin(angle)];
 }
 const petal=PETALS[petalIndex];
 if(!petal)return [NaN,NaN];
 const compression=1-PETAL_COMPRESSION*(Math.abs(latitude)/90);
 const effective=petal.center+wrapDegrees(longitude-petal.center)*compression;
 const angle=effective*DEG;
 return [radius*Math.cos(angle),-radius*Math.sin(angle)];
}

export function projectPetalKm(longitude,latitude,petalIndex=getPetalIndex(longitude)){
 return pointKm(longitude,latitude,petalIndex);
}

export function projectInterruptedPetals(longitude,latitude,baseRadius=DISK_RADIUS_KM){
 if(!Number.isFinite(baseRadius)||baseRadius<=0||!Number.isFinite(latitude)||latitude< -90||latitude>90)return [NaN,NaN];
 if(latitude>=0)return projectGleason(longitude,latitude,baseRadius);
 const point=pointKm(longitude,latitude,getPetalIndex(longitude)),scale=baseRadius/DISK_RADIUS_KM;
 return [point[0]*scale,point[1]*scale];
}

export function projectInterruptedPetalInLobe(longitude,latitude,petalIndex,baseRadius=DISK_RADIUS_KM){
 if(!Number.isFinite(baseRadius)||baseRadius<=0||!Number.isFinite(latitude)||latitude< -90||latitude>90)return [NaN,NaN];
 if(latitude>=0)return projectGleason(longitude,latitude,baseRadius);
 const point=pointKm(longitude,latitude,petalIndex),scale=baseRadius/DISK_RADIUS_KM;
 return [point[0]*scale,point[1]*scale];
}

function longitudeBelongsToPetal(longitude,index){
 const lon=((longitude%360)+360)%360;
 if(index===0)return lon>=240&&lon<340;
 if(index===1)return lon>=340||lon<80;
 return lon>=80&&lon<240;
}

/** Invert the radial coordinate and the active lobe's linear angular compression; gores return NaNs. */
export function unprojectInterruptedPetals(x,y,baseRadius=DISK_RADIUS_KM){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(baseRadius)||baseRadius<=0)return {lat:NaN,lon:NaN};
 const rho=Math.hypot(x,y);
 if(rho>baseRadius*1.000001)return {lat:NaN,lon:NaN};
 const lat=90-Math.min(1,rho/baseRadius)*180;
 if(lat>=0)return unprojectGleason(x,y,baseRadius);
 const angle=Math.atan2(-y,x)*RAD;
 const compression=1-PETAL_COMPRESSION*(Math.abs(lat)/90);
 for(const petal of PETALS){
  const longitude=wrapLongitude(petal.center+wrapDegrees(angle-petal.center)/compression);
  if(!longitudeBelongsToPetal(longitude,petal.id))continue;
  const projected=projectInterruptedPetalInLobe(longitude,lat,petal.id,baseRadius);
  if(Math.hypot(projected[0]-x,projected[1]-y)<=Math.max(1e-7,baseRadius*1e-9)){
   return {lat,lon:longitude,petal:petal.key};
  }
 }
 return {lat:NaN,lon:NaN};
}

function boundaryLongitude(index,side){const petal=PETALS[index];return side==='west'?petal.west:petal.east;}
export function projectPetalBoundaryKm(index,side,latitude){
 if(!PETALS[index]||!Number.isFinite(latitude)||latitude>0||latitude< -90)return [NaN,NaN];
 return pointKm(boundaryLongitude(index,side),latitude,index);
}
function seamForPair(firstIndex,secondIndex){
 return PETAL_SEAMS.find(seam=>(seam.a===firstIndex&&seam.b===secondIndex)||(seam.a===secondIndex&&seam.b===firstIndex))||null;
}
function minimumLatitudeCut(cost){
 const steps=180;let bestIndex=0,bestValue=Infinity;
 for(let i=0;i<=steps;i++){const latitude=-90+i*90/steps,value=cost(latitude);if(value<bestValue){bestValue=value;bestIndex=i;}}
 let low=-90+Math.max(0,bestIndex-1)*90/steps,high=-90+Math.min(steps,bestIndex+1)*90/steps;
 const ratio=(Math.sqrt(5)-1)/2;
 let left=high-ratio*(high-low),right=low+ratio*(high-low),leftValue=cost(left),rightValue=cost(right);
 for(let i=0;i<56;i++){
  if(leftValue<=rightValue){high=right;right=left;rightValue=leftValue;left=high-ratio*(high-low);leftValue=cost(left);}
  else{low=left;left=right;leftValue=rightValue;right=low+ratio*(high-low);rightValue=cost(right);}
 }
 const latitude=(low+high)/2;
 return {latitude,value:cost(latitude)};
}

/** Canonical planar route: Euclidean chord or shortest zero-cost edge stitch between adjacent southern petals. */
export function measureInterruptedPetalRoute(first,second,baseRadius=DISK_RADIUS_KM){
 const valid=p=>p&&Number.isFinite(p.lat)&&p.lat>=-90&&p.lat<=90&&Number.isFinite(p.lon);
 if(!valid(first)||!valid(second)||!Number.isFinite(baseRadius)||baseRadius<=0)return {distanceMeters:null,metric:'unavailable',segments:[]};
 const firstIndex=first.lat<0?getPetalIndex(first.lon):-1,secondIndex=second.lat<0?getPetalIndex(second.lon):-1;
 const a=pointKm(first.lon,first.lat,firstIndex<0?0:firstIndex),b=pointKm(second.lon,second.lat,secondIndex<0?0:secondIndex);
 const scale=baseRadius/DISK_RADIUS_KM,toBase=p=>[p[0]*scale,p[1]*scale];
 if(firstIndex<0||secondIndex<0||firstIndex===secondIndex){
  return {distanceMeters:Math.hypot(b[0]-a[0],b[1]-a[1])*1000,metric:'euclidean-flat-petal-chord',
   segments:[[toBase(a),toBase(b)]],latCut:null,petalPair:firstIndex<0||secondIndex<0?null:[firstIndex,secondIndex]};
 }
 const seam=seamForPair(firstIndex,secondIndex);
 if(!seam)return {distanceMeters:null,metric:'unavailable',segments:[]};
 const firstIsA=firstIndex===seam.a;
 const firstPetal=firstIsA?seam.a:seam.b,firstSide=firstIsA?seam.sideA:seam.sideB;
 const secondPetal=firstIsA?seam.b:seam.a,secondSide=firstIsA?seam.sideB:seam.sideA;
 const cost=latitude=>{
  const left=projectPetalBoundaryKm(firstPetal,firstSide,latitude),right=projectPetalBoundaryKm(secondPetal,secondSide,latitude);
  return Math.hypot(a[0]-left[0],a[1]-left[1])+Math.hypot(b[0]-right[0],b[1]-right[1]);
 };
 const minimum=minimumLatitudeCut(cost),cutA=projectPetalBoundaryKm(firstPetal,firstSide,minimum.latitude),
  cutB=projectPetalBoundaryKm(secondPetal,secondSide,minimum.latitude);
 return {distanceMeters:minimum.value*1000,metric:'planar-gore-edge-stitch',
  segments:[[toBase(a),toBase(cutA)],[toBase(cutB),toBase(b)]],latCut:minimum.latitude,
  petalPair:[firstIndex,secondIndex],seam:seam.name};
}
export function measureInterruptedPetalDistanceMeters(first,second){
 return measureInterruptedPetalRoute(first,second).distanceMeters;
}

function unwrapRing(vertices,centerLongitude){
 const source=(vertices||[]).filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])&&+p[1]>=-90&&+p[1]<=90).map(p=>[+p[0],+p[1]]);
 if(source.length<3)return [];
 const points=[source[0].slice()];
 for(let i=1;i<source.length;i++){
  let longitude=source[i][0],previous=points[i-1][0];
  while(longitude-previous>180)longitude-=360;
  while(longitude-previous< -180)longitude+=360;
  points.push([longitude,source[i][1]]);
 }
 const mean=points.reduce((sum,p)=>sum+p[0],0)/points.length,shift=Math.round((centerLongitude-mean)/360)*360;
 return points.map(p=>[p[0]+shift,p[1]]);
}
function clipHalfPlane(points,axis,boundary,keepGreater){
 if(!points.length)return [];
 const output=[],inside=p=>keepGreater?p[axis]>=boundary:p[axis]<=boundary;
 for(let i=0;i<points.length;i++){
  const current=points[i],previous=points[(i+points.length-1)%points.length],
   currentInside=inside(current),previousInside=inside(previous);
  if(currentInside!==previousInside){
   const denominator=current[axis]-previous[axis],t=Math.abs(denominator)<1e-12?0:(boundary-previous[axis])/denominator;
   output.push([previous[0]+(current[0]-previous[0])*t,previous[1]+(current[1]-previous[1])*t]);
  }
  if(currentInside)output.push(current);
 }
 return output;
}
function densifyAndProject(ring,projectPoint,maxStepDegrees){
 if(ring.length<3)return [];
 const output=[];
 for(let i=0;i<ring.length;i++){
  const first=ring[i],second=ring[(i+1)%ring.length],steps=Math.max(1,Math.ceil(Math.max(Math.abs(second[0]-first[0]),Math.abs(second[1]-first[1]))/maxStepDegrees));
  for(let j=0;j<steps;j++){
   const t=j/steps,p=projectPoint(first[0]+(second[0]-first[0])*t,first[1]+(second[1]-first[1])*t);
   if(Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))output.push(p.slice(0,2));
  }
 }
 return output;
}

/** Split a geographic polygon ring into its north piece and three independently clipped southern lobe pieces. */
export function projectGeoJSONRingIntoPetals(vertices,baseRadius=DISK_RADIUS_KM,maxStepDegrees=2){
 if(!Array.isArray(vertices)||!Number.isFinite(baseRadius)||baseRadius<=0)return [];
 const mean=(vertices||[]).reduce((sum,p)=>sum+(+p?.[0]||0),0)/Math.max(1,vertices.length);
 const unwrapped=unwrapRing(vertices,mean);
 if(unwrapped.length<3)return [];
 const output=[],north=clipHalfPlane(unwrapped,1,0,true);
 if(north.length>=3){
  const projected=densifyAndProject(north,(lon,lat)=>projectInterruptedPetals(lon,lat,baseRadius),maxStepDegrees);
  if(projected.length>=3)output.push(projected);
 }
 const minLongitude=Math.min(...unwrapped.map(p=>p[0])),maxLongitude=Math.max(...unwrapped.map(p=>p[0]));
 const south=clipHalfPlane(unwrapped,1,0,false);
 for(const petal of PETALS){
  for(let turn=-3;turn<=3;turn++){
   const westBoundary=petal.west+turn*360,eastBoundary=petal.east+turn*360;
   if(eastBoundary<minLongitude||westBoundary>maxLongitude)continue;
   const west=clipHalfPlane(south,0,westBoundary,true),piece=clipHalfPlane(west,0,eastBoundary,false);
   if(piece.length<3)continue;
   const projected=densifyAndProject(piece,(lon,lat)=>projectInterruptedPetalInLobe(lon,lat,petal.id,baseRadius),maxStepDegrees);
   if(projected.length>=3)output.push(projected);
  }
 }
 return output;
}

/** Gore polygons are painted with the map's background colour; their edges form engraved seam borders. */
export function createInterruptedPetalGoreWedges(baseRadius=DISK_RADIUS_KM,samples=90){
 if(!Number.isFinite(baseRadius)||baseRadius<=0)return [];
 const scale=baseRadius/DISK_RADIUS_KM;
 return PETAL_SEAMS.map(seam=>{
  const edgeA=[],edgeB=[];
  for(let i=0;i<=samples;i++){const lat=-90*i/samples,p=projectPetalBoundaryKm(seam.a,seam.sideA,lat);edgeA.push([p[0]*scale,p[1]*scale]);}
  for(let i=samples;i>=0;i--){const lat=-90*i/samples,p=projectPetalBoundaryKm(seam.b,seam.sideB,lat);edgeB.push([p[0]*scale,p[1]*scale]);}
  return {name:seam.name,edgeA,edgeB,polygon:[...edgeA,...edgeB]};
 });
}
