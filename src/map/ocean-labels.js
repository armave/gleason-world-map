const OCEAN_LABELS = Object.freeze([
 {name:'ARCTIC OCEAN',lat:76,lon:0,type:'ocean'},
 {name:'NORTH PACIFIC OCEAN',lat:34,lon:205,type:'ocean'},
 {name:'SOUTH PACIFIC OCEAN',lat:-38,lon:225,type:'ocean'},
 {name:'NORTH ATLANTIC OCEAN',lat:28,lon:325,type:'ocean'},
 {name:'SOUTH ATLANTIC OCEAN',lat:-35,lon:345,type:'ocean'},
 {name:'INDIAN OCEAN',lat:-25,lon:82,type:'ocean'},
 {name:'SOUTHERN OCEAN',lat:-64,lon:135,type:'ocean'},
 {name:'BERING SEA',lat:58,lon:190,type:'sea'},
 {name:'SEA OF OKHOTSK',lat:52,lon:150,type:'sea'},
 {name:'SEA OF JAPAN',lat:39,lon:135,type:'sea'},
 {name:'PHILIPPINE SEA',lat:18,lon:145,type:'sea'},
 {name:'SOUTH CHINA SEA',lat:12,lon:113,type:'sea'},
 {name:'CORAL SEA',lat:-18,lon:153,type:'sea'},
 {name:'TASMAN SEA',lat:-40,lon:160,type:'sea'},
 {name:'ARABIAN SEA',lat:15,lon:63,type:'sea'},
 {name:'BAY OF BENGAL',lat:13,lon:88,type:'sea'},
 {name:'RED SEA',lat:20,lon:38,type:'sea'},
 {name:'MEDITERRANEAN SEA',lat:35,lon:20,type:'sea'},
 {name:'CARIBBEAN SEA',lat:15,lon:300,type:'sea'},
 {name:'GULF OF MEXICO',lat:25,lon:270,type:'sea'},
 {name:'WEDDELL SEA',lat:-72,lon:310,type:'sea'},
 {name:'ROSS SEA',lat:-73,lon:180,type:'sea'}
]);
export const SEA_LABEL_MAX_SCALE_KM=12000;

export function oceanLabelsForScale(localScaleKm){
 if(!Number.isFinite(localScaleKm)||localScaleKm<=0)return [];
 return OCEAN_LABELS.filter(label=>label.type==='ocean'||localScaleKm<=SEA_LABEL_MAX_SCALE_KM);
}

export function drawOceanLabels(ctx,project,baseR,zoom,localScaleKm){
 if(!ctx||typeof project!=='function'||!Number.isFinite(baseR)||baseR<=0||!Number.isFinite(zoom)||zoom<=0)return;
 const labels=oceanLabelsForScale(localScaleKm);
 ctx.save();
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 for(const label of labels){
  const [x,y]=project(label.lon,label.lat);
  if(!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x,y)>baseR*.99)continue;
  const ocean=label.type==='ocean';
  const size=(ocean?12:9)/zoom;
  ctx.font=`${ocean?'600':'500'} ${size}px Georgia,serif`;
  ctx.letterSpacing=ocean?'1.1px':'0.45px';
  ctx.strokeStyle='rgba(245,250,250,.94)';ctx.lineWidth=(ocean?3.2:2.5)/zoom;
  ctx.fillStyle=ocean?'#355f70':'#4c6b76';
  ctx.strokeText(label.name,x,y);ctx.fillText(label.name,x,y);
 }
 ctx.restore();
}
