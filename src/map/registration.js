function circumcircleContains(p,a,b,c){
 const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(d)<1e-9)return false;
 const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y;
 const ux=(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/d,uy=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d;
 return (ux-p.x)**2+(uy-p.y)**2<=(ux-a.x)**2+(uy-a.y)**2+1e-6;
}
export function triangulateControlPoints(points2d){
 if(points2d.length<3)return [];
 const xs=points2d.map(p=>p.x),ys=points2d.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const span=Math.max(maxX-minX,maxY-minY,1),cx=(minX+maxX)/2,cy=(minY+maxY)/2,n=points2d.length;
 const pts=[...points2d,{x:cx-30*span,y:cy+20*span},{x:cx,y:cy-30*span},{x:cx+30*span,y:cy+20*span}];let triangles=[[n,n+1,n+2]];
 for(let i=0;i<n;i++){
  const bad=triangles.filter(t=>circumcircleContains(pts[i],pts[t[0]],pts[t[1]],pts[t[2]])),edges=[];
  for(const t of bad)for(const edge of [[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]]){const key=edge[0]<edge[1]?edge.join(':'):[edge[1],edge[0]].join(':'),found=edges.findIndex(e=>e.key===key);if(found>=0)edges.splice(found,1);else edges.push({key,edge});}
  const badSet=new Set(bad);triangles=triangles.filter(t=>!badSet.has(t));for(const e of edges)triangles.push([e.edge[0],e.edge[1],i]);
 }
 return triangles.filter(t=>t.every(i=>i<n));
}
export function affineFromTriangles(src,dst){
 const [p0,p1,p2]=src,[q0,q1,q2]=dst,dx1=p1.x-p0.x,dy1=p1.y-p0.y,dx2=p2.x-p0.x,dy2=p2.y-p0.y,det=dx1*dy2-dx2*dy1;
 if(Math.abs(det)<1e-9)return null;
 const X1=q1.x-q0.x,X2=q2.x-q0.x,Y1=q1.y-q0.y,Y2=q2.y-q0.y;
 const a=(X1*dy2-X2*dy1)/det,c=(X2*dx1-X1*dx2)/det,e=q0.x-a*p0.x-c*p0.y,b=(Y1*dy2-Y2*dy1)/det,d=(Y2*dx1-Y1*dx2)/det,f=q0.y-b*p0.x-d*p0.y;
 return {a,b,c,d,e,f};
}
export function drawRegisteredHistoricalScan(ctx,registrationPoints,historicalImage,historical,project){
 if(registrationPoints.length<3||!historicalImage)return false;
 const iw=historicalImage.naturalWidth,ih=historicalImage.naturalHeight,src=registrationPoints.map(p=>({x:p.u*iw,y:p.v*ih})),dst=registrationPoints.map(p=>{const [x,y]=project(p.lon,p.lat);return {x,y};}),triangles=triangulateControlPoints(src);
 if(!triangles.length)return false;
 ctx.save();ctx.globalAlpha=historical.opacity/100;
 for(const tri of triangles){const s=tri.map(i=>src[i]),d=tri.map(i=>dst[i]),m=affineFromTriangles(s,d);if(!m)continue;ctx.save();ctx.beginPath();ctx.moveTo(d[0].x,d[0].y);ctx.lineTo(d[1].x,d[1].y);ctx.lineTo(d[2].x,d[2].y);ctx.closePath();ctx.clip();ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);ctx.drawImage(historicalImage,0,0);ctx.restore();}
 ctx.restore();return true;
}
