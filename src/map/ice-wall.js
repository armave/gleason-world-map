export const ICE_RIDGE_COUNT=180;
export const ICE_CREVASSE_COUNT=42;
export const ICE_WALL_LABEL_COUNT=8;

function pointOnDisk(radius,angle){
 return [radius*Math.cos(angle),-radius*Math.sin(angle)];
}

function drawRidge(ctx,baseR,angle,index,zoom){
 const start=baseR*(.755+.018*Math.sin(index*1.73));
 const end=baseR*.998;
 ctx.beginPath();
 for(let step=0;step<=8;step++){
  const t=step/8,r=start+(end-start)*t;
  const bend=.0028*Math.sin(t*Math.PI*2+index*.61)+.0012*Math.sin(t*Math.PI*5+index*.27);
  const [x,y]=pointOnDisk(r,angle+bend);
  if(step===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 }
 ctx.strokeStyle=index%4===0?'rgba(113,165,183,.38)':'rgba(157,194,207,.46)';
 ctx.lineWidth=(index%4===0?.9:.58)/zoom;ctx.stroke();
}

function drawCrevasse(ctx,baseR,angle,index,zoom){
 const start=baseR*(.84+.025*Math.sin(index*2.1)),end=baseR*(.965+.012*Math.cos(index*1.4));
 const bend=.0035*Math.sin(index*1.9);
 ctx.beginPath();
 for(let step=0;step<=4;step++){
  const t=step/4,r=start+(end-start)*t;
  const a=angle+bend+(step%2===0?-.0025:.0025);
  const [x,y]=pointOnDisk(r,a);
  if(step===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 }
 ctx.strokeStyle='rgba(91,145,163,.34)';ctx.lineWidth=.7/zoom;ctx.stroke();
}

function drawRimLabels(ctx,baseR,zoom,mapRotation=0){
 const text='ANTARCTIC ICE WALL';
 ctx.font=`700 ${8.5/zoom}px Georgia,serif`;
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 ctx.lineWidth=2.2/zoom;ctx.strokeStyle='rgba(255,255,255,.96)';ctx.fillStyle='#3e7183';
 for(let i=0;i<ICE_WALL_LABEL_COUNT;i++){
  const theta=(i+.15)*Math.PI*2/ICE_WALL_LABEL_COUNT;
  const [x,y]=pointOnDisk(baseR*.944,theta);
  let tangent=Math.atan2(-Math.cos(theta),-Math.sin(theta));
  if(tangent>Math.PI/2)tangent-=Math.PI;
  if(tangent< -Math.PI/2)tangent+=Math.PI;
  ctx.save();ctx.translate(x,y);ctx.rotate(tangent-mapRotation);
  ctx.strokeText(text,0,0);ctx.fillText(text,0,0);ctx.restore();
 }
}

export function drawIceWall(ctx,antarcticaPath,baseR,zoom,mapRotation=0){
 if(!ctx||!antarcticaPath||!Number.isFinite(baseR)||baseR<=0||!Number.isFinite(zoom)||zoom<=0)return;
 ctx.save();
 ctx.shadowColor='rgba(78,130,151,.2)';ctx.shadowBlur=3/zoom;
 ctx.fillStyle='#ffffff';ctx.fill(antarcticaPath,'evenodd');ctx.shadowBlur=0;
 ctx.lineJoin='round';ctx.strokeStyle='rgba(87,139,158,.28)';ctx.lineWidth=5.4/zoom;ctx.stroke(antarcticaPath);
 ctx.strokeStyle='#5a899b';ctx.lineWidth=2.0/zoom;ctx.stroke(antarcticaPath);
 ctx.strokeStyle='#f7ffff';ctx.lineWidth=.78/zoom;ctx.stroke(antarcticaPath);

 ctx.save();ctx.clip(antarcticaPath,'evenodd');
 for(const [radius,color,width] of [
  [.925,'rgba(154,190,203,.34)',.72],
  [.962,'rgba(129,174,190,.42)',.86],
  [.988,'rgba(255,255,255,.78)',.62]
 ]){
  ctx.beginPath();ctx.arc(0,0,baseR*radius,0,Math.PI*2);
  ctx.strokeStyle=color;ctx.lineWidth=width/zoom;ctx.stroke();
 }
 for(let i=0;i<ICE_RIDGE_COUNT;i++)drawRidge(ctx,baseR,i*Math.PI*2/ICE_RIDGE_COUNT,i,zoom);
 for(let i=0;i<ICE_CREVASSE_COUNT;i++)drawCrevasse(ctx,baseR,(i+.35)*Math.PI*2/ICE_CREVASSE_COUNT,i,zoom);
 ctx.restore();

 ctx.beginPath();ctx.arc(0,0,baseR*.999,0,Math.PI*2);
 ctx.strokeStyle='rgba(54,108,128,.34)';ctx.lineWidth=4.2/zoom;ctx.stroke();
 ctx.strokeStyle='#426f82';ctx.lineWidth=1.65/zoom;ctx.stroke();
 drawRimLabels(ctx,baseR,zoom,mapRotation);
 ctx.restore();
}
