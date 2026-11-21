export function drawIceWall(ctx,antarcticaPath,baseR,zoom){
 if(!antarcticaPath)return;
 ctx.save();
 ctx.fillStyle='#c7e0e8';ctx.fill(antarcticaPath,'evenodd');
 ctx.lineJoin='round';ctx.strokeStyle='#527f91';ctx.lineWidth=4.2/zoom;ctx.stroke(antarcticaPath);
 ctx.strokeStyle='#f6ffff';ctx.lineWidth=1.1/zoom;ctx.stroke(antarcticaPath);
 ctx.save();ctx.clip(antarcticaPath,'evenodd');ctx.strokeStyle='rgba(77,125,145,.24)';ctx.lineWidth=.72/zoom;
 for(let i=0;i<240;i++){
  const a=i*Math.PI*2/240;
  ctx.beginPath();ctx.moveTo(baseR*.78*Math.cos(a),-baseR*.78*Math.sin(a));
  ctx.lineTo(baseR*1.002*Math.cos(a),-baseR*1.002*Math.sin(a));ctx.stroke();
 }
 ctx.restore();
 ctx.beginPath();ctx.arc(0,0,baseR,0,Math.PI*2);ctx.strokeStyle='#426f82';ctx.lineWidth=2.3/zoom;ctx.stroke();
 ctx.fillStyle='#285565';ctx.font='700 '+(10/zoom)+'px ui-sans-serif,system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillText('ANTARCTICA · ICE WALL',0,-baseR*.94);
 ctx.save();ctx.translate(baseR*.94,0);ctx.rotate(Math.PI/2);ctx.fillText('ANTARCTICA · ICE WALL',0,0);ctx.restore();
 ctx.save();ctx.translate(0,baseR*.94);ctx.fillText('ANTARCTICA · ICE WALL',0,0);ctx.restore();
 ctx.save();ctx.translate(-baseR*.94,0);ctx.rotate(-Math.PI/2);ctx.fillText('ANTARCTICA · ICE WALL',0,0);ctx.restore();
 ctx.restore();
}
