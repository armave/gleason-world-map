import { getPetalIndex } from '../core/interrupted-petals.js';

const PETAL_SEAMS = Object.freeze([-120,-20,80]);

function seamCrossing(firstLongitude, firstLatitude, secondLongitude, secondLatitude) {
 const low=Math.min(firstLongitude,secondLongitude),high=Math.max(firstLongitude,secondLongitude);
 if(Math.abs(secondLongitude-firstLongitude)<1e-12)return null;
 const candidates=[];
 for(const seam of PETAL_SEAMS){
  const start=Math.floor((low-seam)/360)-1,end=Math.ceil((high-seam)/360)+1;
  for(let turn=start;turn<=end;turn++){
   const boundary=seam+turn*360;
   if(boundary<low-1e-10||boundary>high+1e-10)continue;
   const t=(boundary-firstLongitude)/(secondLongitude-firstLongitude);
   const latitude=firstLatitude+(secondLatitude-firstLatitude)*t;
   if(t>0&&t<=1+1e-10&&latitude<0)candidates.push({longitude:boundary,latitude,t});
  }
 }
 candidates.sort((a,b)=>a.t-b.t);
 return candidates[0]||null;
}

// Natural Earth lines are unwrapped and densified. In petal mode every southern
// seam crossing terminates one Path2D subpath and begins another on the opposite
// gore edge, so no coastline is ever drawn as a bridge across an open wedge.
export function projectCoastlineLines(data,project,maxStepDegrees=1.5,{layoutMode='gleason'}={}){
 if(!Array.isArray(data?.coordinates)||typeof project!=='function')return [];
 const step=Number.isFinite(maxStepDegrees)&&maxStepDegrees>0?maxStepDegrees:1.5;
 const output=[];
 for(const line of data.coordinates){
  if(!Array.isArray(line)||line.length<2)continue;
  const first=line[0];
  if(!Array.isArray(first)||!Number.isFinite(first[0])||!Number.isFinite(first[1]))continue;
  let projectedLine=[];
  let previousCoordinate=null;
  const flush=()=>{
   if(projectedLine.length>=2)output.push(projectedLine);
   projectedLine=[];
  };
  const append=(longitude,latitude)=>{
   if(layoutMode==='interrupted-petals'&&previousCoordinate&&
      previousCoordinate.latitude<0&&latitude<0){
    const previousLobe=getPetalIndex(previousCoordinate.longitude);
    const nextLobe=getPetalIndex(longitude);
    if(previousLobe!==nextLobe){
     const crossing=seamCrossing(
      previousCoordinate.longitude,previousCoordinate.latitude,longitude,latitude
     );
     if(crossing){
      const before=project(crossing.longitude,crossing.latitude,previousLobe);
      if(Array.isArray(before)&&before.slice(0,2).every(Number.isFinite)){
       projectedLine.push(before.slice(0,2));
      }
      flush();
      const after=project(crossing.longitude,crossing.latitude,nextLobe);
      if(Array.isArray(after)&&after.slice(0,2).every(Number.isFinite)){
       projectedLine.push(after.slice(0,2));
      }
     }
    }
   }
   const lobe=layoutMode==='interrupted-petals'&&latitude<0
    ?getPetalIndex(longitude):undefined;
   const point=project(longitude,latitude,lobe);
   if(Array.isArray(point)&&point.slice(0,2).every(Number.isFinite)){
    projectedLine.push(point.slice(0,2));
   }else flush();
   previousCoordinate={longitude,latitude};
  };

  let longitude0=first[0],latitude0=first[1];
  append(longitude0,latitude0);
  for(let i=1;i<line.length;i++){
   const next=line[i];
   if(!Array.isArray(next)||!Number.isFinite(next[0])||!Number.isFinite(next[1]))continue;
   const rawDelta=next[0]-longitude0;
   const deltaLongitude=((rawDelta+540)%360)-180,deltaLatitude=next[1]-latitude0;
   const steps=Math.max(1,Math.ceil(Math.max(Math.abs(deltaLongitude),Math.abs(deltaLatitude))/step));
   if(steps>240){flush();longitude0=next[0];latitude0=next[1];previousCoordinate=null;continue;}
   for(let j=1;j<=steps;j++){
    append(longitude0+deltaLongitude*j/steps,latitude0+deltaLatitude*j/steps);
   }
   longitude0+=deltaLongitude;latitude0=next[1];
  }
  flush();
 }
 return output;
}

function appendProjectedLines(path,lines){
 for(const line of lines){
  path.moveTo(line[0][0],line[0][1]);
  for(let i=1;i<line.length;i++)path.lineTo(line[i][0],line[i][1]);
 }
}

function yieldToMainThread(){
 return new Promise(resolve=>{
  if(typeof globalThis.requestIdleCallback==='function')globalThis.requestIdleCallback(()=>resolve(),{timeout:80});
  else setTimeout(resolve,0);
 });
}

export function createCoastlinePath(data,project,PathConstructor=globalThis.Path2D,options={}){
 if(typeof PathConstructor!=='function')throw new Error('Path2D is required to build coastline geometry.');
 const path=new PathConstructor();
 appendProjectedLines(path,projectCoastlineLines(data,project,1.5,options));
 return path;
}

export async function createCoastlinePathAsync(
 data,project,PathConstructor=globalThis.Path2D,{batchSize=24,yieldControl=yieldToMainThread,layoutMode='gleason'}={}
){
 if(typeof PathConstructor!=='function')throw new Error('Path2D is required to build coastline geometry.');
 if(!Number.isInteger(batchSize)||batchSize<1)throw new Error('Coastline batch size must be a positive integer.');
 const path=new PathConstructor(),coordinates=data?.coordinates;
 if(!Array.isArray(coordinates)||typeof project!=='function')return path;
 for(let start=0;start<coordinates.length;start+=batchSize){
  const batch={coordinates:coordinates.slice(start,start+batchSize)};
  appendProjectedLines(path,projectCoastlineLines(batch,project,1.5,{layoutMode}));
  if(start+batchSize<coordinates.length)await yieldControl();
 }
 return path;
}

export function drawCoastlines(ctx,path,zoom=1,palette={}){
 if(!ctx||!path||!Number.isFinite(zoom)||zoom<=0)return;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
 ctx.strokeStyle=palette.coastHalo||'rgba(250,253,247,.94)';ctx.lineWidth=2.2/zoom;ctx.stroke(path);
 ctx.strokeStyle=palette.coastline||'#477486';ctx.lineWidth=.9/zoom;ctx.stroke(path);
 ctx.restore();
}
