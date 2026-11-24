// Natural Earth coastlines contain line strings that may cross ±180°; unwrap each edge to its short dateline-safe continuation.
export function projectCoastlineLines(data,project,maxStepDegrees=1.5){
 if(!Array.isArray(data?.coordinates)||typeof project!=='function')return [];
 const step=Number.isFinite(maxStepDegrees)&&maxStepDegrees>0?maxStepDegrees:1.5;
 const output=[];
 for(const line of data.coordinates){
  if(!Array.isArray(line)||line.length<2)continue;
  const first=line[0];
  if(!Array.isArray(first)||!Number.isFinite(first[0])||!Number.isFinite(first[1]))continue;
  const points=[];
  let lon0=first[0],lat0=first[1],p0=project(lon0,lat0);
  if(!Array.isArray(p0)||!p0.slice(0,2).every(Number.isFinite))continue;
  points.push(p0.slice(0,2));
  for(let i=1;i<line.length;i++){
   const next=line[i];
   if(!Array.isArray(next)||!Number.isFinite(next[0])||!Number.isFinite(next[1]))continue;
   const rawDelta=next[0]-lon0;
   const dLon=((rawDelta+540)%360)-180,dLat=next[1]-lat0;
   const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dLon),Math.abs(dLat))/step));
   if(steps>240)continue;
   for(let j=1;j<=steps;j++){
    const p=project(lon0+dLon*j/steps,lat0+dLat*j/steps);
    if(Array.isArray(p)&&p.slice(0,2).every(Number.isFinite))points.push(p.slice(0,2));
   }
   lon0+=dLon;lat0=next[1];
  }
  if(points.length>=2)output.push(points);
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

export function createCoastlinePath(data,project,PathConstructor=globalThis.Path2D){
 if(typeof PathConstructor!=='function')throw new Error('Path2D is required to build coastline geometry.');
 const path=new PathConstructor();
 appendProjectedLines(path,projectCoastlineLines(data,project));
 return path;
}

export async function createCoastlinePathAsync(
 data,project,PathConstructor=globalThis.Path2D,{batchSize=24,yieldControl=yieldToMainThread}={}
){
 if(typeof PathConstructor!=='function')throw new Error('Path2D is required to build coastline geometry.');
 if(!Number.isInteger(batchSize)||batchSize<1)throw new Error('Coastline batch size must be a positive integer.');
 const path=new PathConstructor(),coordinates=data?.coordinates;
 if(!Array.isArray(coordinates)||typeof project!=='function')return path;
 for(let start=0;start<coordinates.length;start+=batchSize){
  const batch={coordinates:coordinates.slice(start,start+batchSize)};
  appendProjectedLines(path,projectCoastlineLines(batch,project));
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
