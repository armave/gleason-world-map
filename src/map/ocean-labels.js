const OCEAN_LABELS=Object.freeze([
 {name:'ARCTIC OCEAN',lat:78,lon:-145,type:'ocean',maxScaleKm:18000,minScaleKm:600,priority:100,curve:false},
 {name:'NORTH PACIFIC OCEAN',lat:35,lon:-155,type:'ocean',maxScaleKm:18000,minScaleKm:600,priority:100},
 {name:'SOUTH PACIFIC OCEAN',lat:-37,lon:-135,type:'ocean',maxScaleKm:18000,minScaleKm:600,priority:100},
 {name:'NORTH ATLANTIC OCEAN',lat:31,lon:-40,type:'ocean',maxScaleKm:18000,minScaleKm:600,priority:100},
 {name:'SOUTH ATLANTIC OCEAN',lat:-32,lon:-10,type:'ocean',maxScaleKm:18000,minScaleKm:600,priority:100},
 {name:'INDIAN OCEAN',lat:-25,lon:82,type:'ocean',maxScaleKm:18000,minScaleKm:600,priority:100},
 {name:'SOUTHERN OCEAN',lat:-61,lon:135,type:'ocean',maxScaleKm:18000,minScaleKm:600,priority:100},

 {name:'BERING SEA',lat:58,lon:-175,type:'sea',maxScaleKm:11000,minScaleKm:250,priority:70},
 {name:'GULF OF ALASKA',lat:56,lon:-145,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:48},
 {name:'BAFFIN BAY',lat:73,lon:-68,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:48},
 {name:'HUDSON BAY',lat:60,lon:-86,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:55},
 {name:'LABRADOR SEA',lat:58,lon:-50,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:44},
 {name:'NORWEGIAN SEA',lat:68,lon:0,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:48},
 {name:'NORTH SEA',lat:56,lon:3,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:55},
 {name:'BALTIC SEA',lat:58,lon:20,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:45},
 {name:'MEDITERRANEAN SEA',lat:35,lon:18,type:'sea',maxScaleKm:11000,minScaleKm:250,priority:70},
 {name:'BLACK SEA',lat:43,lon:35,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:48},
 {name:'CARIBBEAN SEA',lat:15,lon:-75,type:'sea',maxScaleKm:11000,minScaleKm:250,priority:70},
 {name:'GULF OF MEXICO',lat:24,lon:-90,type:'sea',maxScaleKm:11000,minScaleKm:250,priority:65},
 {name:'GULF OF CALIFORNIA',lat:26,lon:-111,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:38},
 {name:'BAY OF BISCAY',lat:45,lon:-5,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:38},

 {name:'RED SEA',lat:20,lon:38,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:58},
 {name:'GULF OF ADEN',lat:12,lon:48,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:38},
 {name:'PERSIAN GULF',lat:26,lon:52,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:58},
 {name:'ARABIAN SEA',lat:15,lon:64,type:'sea',maxScaleKm:11000,minScaleKm:250,priority:65},
 {name:'BAY OF BENGAL',lat:13,lon:88,type:'sea',maxScaleKm:11000,minScaleKm:250,priority:65},
 {name:'ANDAMAN SEA',lat:10,lon:95,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:38},
 {name:'SOUTH CHINA SEA',lat:12,lon:114,type:'sea',maxScaleKm:11000,minScaleKm:250,priority:65},
 {name:'EAST CHINA SEA',lat:28,lon:126,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:48},
 {name:'YELLOW SEA',lat:36,lon:123,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:38},
 {name:'SEA OF JAPAN',lat:40,lon:135,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:55},
 {name:'SEA OF OKHOTSK',lat:53,lon:147,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:48},
 {name:'PHILIPPINE SEA',lat:18,lon:140,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:58},
 {name:'CELEBES SEA',lat:2,lon:123,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:35},
 {name:'SULU SEA',lat:8,lon:120,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:34},
 {name:'ARAFURA SEA',lat:-9,lon:135,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:36},
 {name:'CORAL SEA',lat:-18,lon:155,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:55},
 {name:'TASMAN SEA',lat:-40,lon:160,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:55},
 {name:'GREAT AUSTRALIAN BIGHT',lat:-35,lon:130,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:34},
 {name:'MOZAMBIQUE CHANNEL',lat:-18,lon:42,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:38},
 {name:'GULF OF GUINEA',lat:0,lon:0,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:42},

 {name:'WEDDELL SEA',lat:-72,lon:-38,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:55},
 {name:'ROSS SEA',lat:-73,lon:175,type:'sea',maxScaleKm:8500,minScaleKm:250,priority:55},
 {name:'AMUNDSEN SEA',lat:-72,lon:-115,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:36},
 {name:'BELLINGSHAUSEN SEA',lat:-69,lon:-80,type:'sea',maxScaleKm:4500,minScaleKm:250,priority:36},
 {name:'SCOTIA SEA',lat:-58,lon:-45,type:'sea',maxScaleKm:6500,minScaleKm:250,priority:42}
]);

const ANCHOR_OFFSETS=Object.freeze([
 [0,0],[0,-2],[0,2],[-3,0],[3,0],[-4,-3],[4,3],[-5,2],[5,-2]
]);
const DEG=Math.PI/180;

export function oceanLabelsForScale(localScaleKm){
 if(!Number.isFinite(localScaleKm)||localScaleKm<=0)return [];
 return OCEAN_LABELS.filter(label=>localScaleKm<=label.maxScaleKm&&localScaleKm>=label.minScaleKm);
}

function overlaps(a,b,gap=0){
 return a.left<b.right+gap&&a.right+gap>b.left&&a.top<b.bottom+gap&&a.bottom+gap>b.top;
}

function makeCurvedCandidate(ctx,label,anchor,project,baseR,zoom,viewport,isLand){
 const ocean=label.type==='ocean',fontSize=ocean?12:9;
 ctx.font=`${ocean?'600':'500'} ${fontSize/zoom}px Georgia,serif`;
 const text=label.name,letterGap=(ocean?1.0:.55)/zoom;
 const advances=[...text].map(char=>ctx.measureText(char).width+letterGap);
 const totalWidth=advances.reduce((sum,v)=>sum+v,0)-letterGap;
 const center=project(anchor.lon,anchor.lat),radius=Math.hypot(center[0],center[1]);
 const curved=label.curve!==false;
 if(!Number.isFinite(radius)||radius<baseR*.01||(curved&&totalWidth/radius>1.35))return null;
 const theta=anchor.lon*DEG;
 const direction=(-Math.sin(theta))<-.001?-1:1;
 const glyphs=[];let cursor=-totalWidth/2;
 for(let i=0;i<text.length;i++){
  const char=text[i],width=advances[i]-letterGap;
  const offset=cursor+width/2,angle=theta+direction*offset/radius;
  const pos=curved?project(angle/DEG,anchor.lat):[center[0]+offset,center[1]];
  if(!pos||!pos.slice(0,2).every(Number.isFinite)||Math.hypot(pos[0],pos[1])>baseR*.985)return null;
  const sampleEvery=Math.max(1,Math.floor(text.length/4));
  if(isLand&&(i===0||i===text.length-1||i%sampleEvery===0)&&isLand(pos[0],pos[1]))return null;
  const rotation=curved?Math.atan2(-direction*Math.cos(angle),-direction*Math.sin(angle)):0;
  glyphs.push({char,x:pos[0],y:pos[1],rotation});
  cursor+=advances[i];
 }
 const tangent=curved?Math.atan2(-direction*Math.cos(theta),-direction*Math.sin(theta)):0;
 const screenTangent=tangent,boxWidth=Math.abs(totalWidth*zoom*Math.cos(screenTangent))+Math.abs(fontSize*1.45*Math.sin(screenTangent))+8;
 const boxHeight=Math.abs(totalWidth*zoom*Math.sin(screenTangent))+Math.abs(fontSize*1.45*Math.cos(screenTangent))+6;
 const cosine=Math.cos(viewport.rotation),sine=Math.sin(viewport.rotation);
 const screenX=viewport.width/2+viewport.panX+(center[0]*cosine-center[1]*sine)*zoom;
 const screenY=viewport.height/2+viewport.panY+(center[0]*sine+center[1]*cosine)*zoom;
 const box={left:screenX-boxWidth/2,top:screenY-boxHeight/2,right:screenX+boxWidth/2,bottom:screenY+boxHeight/2};
 if(box.right<0||box.left>viewport.width||box.bottom<0||box.top>viewport.height)return null;
 return {label,glyphs,box,fontSize,ocean};
}

export function drawOceanLabels(ctx,project,baseR,zoom,localScaleKm,options={}){
 if(!ctx||typeof project!=='function'||!Number.isFinite(baseR)||baseR<=0||!Number.isFinite(zoom)||zoom<=0)return [];
 const labels=oceanLabelsForScale(localScaleKm);
 const viewport={width:options.width??Infinity,height:options.height??Infinity,panX:options.panX??0,panY:options.panY??0,rotation:options.rotation??0};
 const occupied=[...(options.reservedBoxes||[])],isLand=options.isLand,selector=options.selectNonOverlappingLabels;
 const accepted=[];
 ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.setLineDash([]);
 for(const label of labels.sort((a,b)=>b.priority-a.priority)){
  const offsets=label.offsets||ANCHOR_OFFSETS;
  let candidate=null;
  for(const [dLon,dLat] of offsets){
   const lat=label.lat+dLat;if(lat<-89.5||lat>89.5)continue;
   const trial=makeCurvedCandidate(ctx,label,{lat,lon:label.lon+dLon},project,baseR,zoom,viewport,isLand);
   if(!trial)continue;
   const clear=typeof selector==='function'?selector([trial],occupied,5).length>0:!occupied.some(box=>overlaps(trial.box,box,5));
   if(clear){candidate=trial;break;}
  }
  if(!candidate)continue;
  ctx.font=`${candidate.ocean?'600':'500'} ${candidate.fontSize/zoom}px Georgia,serif`;
  const palette=options.palette||{};ctx.strokeStyle=palette.labelHalo||'rgba(245,250,250,.96)';ctx.lineWidth=(candidate.ocean?3.0:2.5)/zoom;
  ctx.fillStyle=candidate.ocean?(palette.oceanLabel||'#355f70'):(palette.seaLabel||'#4c6b76');
  for(const glyph of candidate.glyphs){
   if(!glyph.char.trim())continue;
   ctx.save();ctx.translate(glyph.x,glyph.y);ctx.rotate(glyph.rotation-viewport.rotation);
   ctx.strokeText(glyph.char,0,0);ctx.fillText(glyph.char,0,0);ctx.restore();
  }
  accepted.push(candidate);occupied.push(candidate.box);
 }
 ctx.restore();
 return accepted.map(item=>item.box);
}
