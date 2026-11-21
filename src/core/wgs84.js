export const rad=d=>d*Math.PI/180;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const wrapLongitude=lon=>((lon+540)%360)-180;
// WGS84 reference ellipsoid. Internal ground distances are measured in metres.
export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_B = WGS84_A * (1 - WGS84_F);
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);
export function meridionalArc(phi) {
 const e2=WGS84_E2,e4=e2*e2,e6=e4*e2;
 const a0=1-e2/4-3*e4/64-5*e6/256;
 const a2=3*e2/8+3*e4/32+45*e6/1024;
 const a4=15*e4/256+45*e6/1024;
 const a6=35*e6/3072;
 return WGS84_A*(a0*phi-a2*Math.sin(2*phi)+a4*Math.sin(4*phi)-a6*Math.sin(6*phi));
}
export const NORTH_POLE_ARC_M = meridionalArc(Math.PI/2);
export const POLE_TO_POLE_KM = 2*NORTH_POLE_ARC_M/1000;
export function meridionalDistanceFromNorthKm(lat) {
 return (NORTH_POLE_ARC_M-meridionalArc(rad(lat)))/1000;
}
export function latitudeFromMeridionalDistanceKm(distanceKm) {
 const target=NORTH_POLE_ARC_M-clamp(distanceKm,0,POLE_TO_POLE_KM)*1000;
 let low=-Math.PI/2,high=Math.PI/2;
 for(let i=0;i<48;i++){const mid=(low+high)/2;if(meridionalArc(mid)>target)high=mid;else low=mid;}
 return (low+high)*90/Math.PI;
}
// p=1 makes radial distance equal WGS84 meridional ground distance from 90°N.
export const radialFraction = lat => clamp(meridionalDistanceFromNorthKm(lat)/POLE_TO_POLE_KM,0,1);

export function project(lon,lat,baseR){const rho=baseR*clamp(radialFraction(lat),0,1);const l=rad(lon);return [rho*Math.cos(l),-rho*Math.sin(l)];}
export function unproject(x,y,baseR){
 const rho=Math.hypot(x,y),fraction=clamp(rho/baseR,0,1);
 const lat=latitudeFromMeridionalDistanceKm(fraction*POLE_TO_POLE_KM);
 const lon=rho<1e-7?0:Math.atan2(-y,x)*180/Math.PI;
 return {lat,lon};
}
function wrapRadians(value){return ((value+3*Math.PI)%(2*Math.PI))-Math.PI;}
// Vincenty's WGS84 inverse returns unavailable when its iteration does not converge.
export function vincentyInverse(a,b){
 const phi1=rad(a.lat),phi2=rad(b.lat),L=wrapRadians(rad(b.lon-a.lon));
 const U1=Math.atan((1-WGS84_F)*Math.tan(phi1)),U2=Math.atan((1-WGS84_F)*Math.tan(phi2));
 const sinU1=Math.sin(U1),cosU1=Math.cos(U1),sinU2=Math.sin(U2),cosU2=Math.cos(U2);
 let lambda=L,converged=false;
 for(let i=0;i<100;i++){
  const sinLambda=Math.sin(lambda),cosLambda=Math.cos(lambda);
  const sinSigma=Math.sqrt((cosU2*sinLambda)**2+(cosU1*sinU2-sinU1*cosU2*cosLambda)**2);
  if(sinSigma===0)return {distanceMeters:0,initialBearing:0};
  const cosSigma=sinU1*sinU2+cosU1*cosU2*cosLambda,sigma=Math.atan2(sinSigma,cosSigma);
  const sinAlpha=cosU1*cosU2*sinLambda/sinSigma,cosSqAlpha=1-sinAlpha*sinAlpha;
  const cos2SigmaM=cosSqAlpha>1e-15?cosSigma-2*sinU1*sinU2/cosSqAlpha:0;
  const C=WGS84_F/16*cosSqAlpha*(4+WGS84_F*(4-3*cosSqAlpha));
  const next=L+(1-C)*WGS84_F*sinAlpha*(sigma+C*sinSigma*(cos2SigmaM+C*cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)));
  if(Math.abs(next-lambda)<1e-12){lambda=next;converged=true;break;}
  lambda=next;
 }
 if(!converged)return {distanceMeters:NaN,initialBearing:NaN,approximate:true};
 const sinLambda=Math.sin(lambda),cosLambda=Math.cos(lambda);
 const sinSigma=Math.sqrt((cosU2*sinLambda)**2+(cosU1*sinU2-sinU1*cosU2*cosLambda)**2);
 const cosSigma=sinU1*sinU2+cosU1*cosU2*cosLambda,sigma=Math.atan2(sinSigma,cosSigma);
 const sinAlpha=cosU1*cosU2*sinLambda/sinSigma,cosSqAlpha=1-sinAlpha*sinAlpha;
 const cos2SigmaM=cosSqAlpha>1e-15?cosSigma-2*sinU1*sinU2/cosSqAlpha:0;
 const uSq=cosSqAlpha*(WGS84_A*WGS84_A-WGS84_B*WGS84_B)/(WGS84_B*WGS84_B);
 const A=1+uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
 const B=uSq/1024*(256+uSq*(-128+uSq*(74-47*uSq)));
 const deltaSigma=B*sinSigma*(cos2SigmaM+B/4*(cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)-B/6*cos2SigmaM*(-3+4*sinSigma*sinSigma)*(-3+4*cos2SigmaM*cos2SigmaM)));
 const distanceMeters=WGS84_B*A*(sigma-deltaSigma);
 const initialBearing=Math.atan2(cosU2*sinLambda,cosU1*sinU2-sinU1*cosU2*cosLambda);
 return {distanceMeters,initialBearing};
}
// GeographicLib's Karney direct/inverse solution is preferred for robust convergence.// Prefer GeographicLib's Karney solution for convergence across all point pairs.
// Vincenty remains a local fallback if the external library cannot be loaded.
export function geodesicInverse(a,b){
 const engine=globalThis.geodesic?.Geodesic?.WGS84;
 if(engine){const r=engine.Inverse(a.lat,a.lon,b.lat,b.lon);return {distanceMeters:r.s12,initialBearing:rad(r.azi1),approximate:false};}
 return vincentyInverse(a,b);
}
// Vincenty's direct solution, used as a fallback when GeographicLib is unavailable.
export function vincentyDirect(origin,bearing,distanceMeters){
 if(distanceMeters<=0)return {lat:origin.lat,lon:origin.lon};
 const alpha1=bearing,phi1=rad(origin.lat),lambda1=rad(origin.lon);
 const tanU1=(1-WGS84_F)*Math.tan(phi1),cosU1=1/Math.sqrt(1+tanU1*tanU1),sinU1=tanU1*cosU1;
 const sigma1=Math.atan2(tanU1,Math.cos(alpha1)),sinAlpha=cosU1*Math.sin(alpha1),cosSqAlpha=1-sinAlpha*sinAlpha;
 const uSq=cosSqAlpha*(WGS84_A*WGS84_A-WGS84_B*WGS84_B)/(WGS84_B*WGS84_B);
 const A=1+uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
 const B=uSq/1024*(256+uSq*(-128+uSq*(74-47*uSq)));
 let sigma=distanceMeters/(WGS84_B*A),converged=false;
 for(let i=0;i<100;i++){
  const twoSigmaM=2*sigma1+sigma,sinSigma=Math.sin(sigma),cosSigma=Math.cos(sigma);
  const cos2SigmaM=Math.cos(twoSigmaM);
  const deltaSigma=B*sinSigma*(cos2SigmaM+B/4*(cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)-B/6*cos2SigmaM*(-3+4*sinSigma*sinSigma)*(-3+4*cos2SigmaM*cos2SigmaM)));
  const next=distanceMeters/(WGS84_B*A)+deltaSigma;
  if(Math.abs(next-sigma)<1e-12){sigma=next;converged=true;break;}
  sigma=next;
 }
 if(!converged)return null;
 const sinSigma=Math.sin(sigma),cosSigma=Math.cos(sigma),twoSigmaM=2*sigma1+sigma,cos2SigmaM=Math.cos(twoSigmaM);
 const tmp=sinU1*sinSigma-cosU1*cosSigma*Math.cos(alpha1);
 const phi2=Math.atan2(sinU1*cosSigma+cosU1*sinSigma*Math.cos(alpha1),(1-WGS84_F)*Math.sqrt(sinAlpha*sinAlpha+tmp*tmp));
 const lambda=Math.atan2(sinSigma*Math.sin(alpha1),cosU1*cosSigma-sinU1*sinSigma*Math.cos(alpha1));
 const C=WGS84_F/16*cosSqAlpha*(4+WGS84_F*(4-3*cosSqAlpha));
 const L=lambda-(1-C)*WGS84_F*sinAlpha*(sigma+C*sinSigma*(cos2SigmaM+C*cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)));
 return {lat:phi2*180/Math.PI,lon:wrapRadians(lambda1+L)*180/Math.PI};
}
export function geodesicDirect(origin,bearing,distanceMeters){
 const engine=globalThis.geodesic?.Geodesic?.WGS84;
 if(engine){const r=engine.Direct(origin.lat,origin.lon,bearing*180/Math.PI,distanceMeters);return {lat:r.lat2,lon:r.lon2};}
 return vincentyDirect(origin,bearing,distanceMeters);
}
export function geodesicLinePath(a,b){
 const inverse=geodesicInverse(a,b),distance=inverse.distanceMeters;
 if(!Number.isFinite(distance))return [];
 if(distance<0.01)return [project(a.lon,a.lat)];
 const segments=Math.max(2,Math.min(240,Math.ceil(distance/250000))),path=[];
 for(let i=0;i<=segments;i++){
  const p=geodesicDirect(a,inverse.initialBearing,distance*i/segments);
  if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return [];
  path.push(project(p.lon,p.lat));
 }
 return path;
}
function formatDistance(meters){
 if(!Number.isFinite(meters)||meters<0)return '—';
 if(meters<1000)return `${meters.toLocaleString('en-US',{maximumFractionDigits:meters<100?1:0})} m`;
 return `${(meters/1000).toLocaleString('en-US',{maximumFractionDigits:1})} km`;
}
function formatArea(areaM2){
 if(!Number.isFinite(areaM2)||areaM2<0)return 'Unavailable';
 if(areaM2<1e6)return `${areaM2.toLocaleString('en-US',{maximumFractionDigits:0})} m²`;
 return `${(areaM2/1e6).toLocaleString('en-US',{maximumFractionDigits:2})} km²`;
}
export function wgs84PolygonMetrics(vertices){
 const geod=globalThis.geodesic?.Geodesic?.WGS84;
 if(!geod||typeof geod.Polygon!=='function'||vertices.length<3)return null;
 const polygon=geod.Polygon(false);
 vertices.forEach(p=>polygon.AddPoint(p.lat,p.lon));
 const result=polygon.Compute(false,true);
 return {areaM2:Math.abs(result.area),perimeterM:result.perimeter};
}
export function featureGeodesicAreaM2(feature){
 const g=feature?.geometry,geod=globalThis.geodesic?.Geodesic?.WGS84;
 if(!g||!geod||typeof geod.Polygon!=='function')return null;
 const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
 let total=0;
 for(const rings of polygons){
  if(!rings?.length)continue;
  let polygonArea=0;
  for(let r=0;r<rings.length;r++){
   const ring=rings[r];if(!ring||ring.length<4)continue;
   const polygon=geod.Polygon(false);
   for(const c of ring)if(Number.isFinite(+c[0])&&Number.isFinite(+c[1]))polygon.AddPoint(+c[1],+c[0]);
   const result=polygon.Compute(false,true);
   const area=Math.abs(result.area||0);
   polygonArea+=r===0?area:-area;
  }
  total+=Math.max(0,polygonArea);
 }
 return total;
}

export function getLocalWgs84ScaleFactors(lat){
 const phi=rad(lat),c=Math.abs(Math.cos(phi)),r=meridionalDistanceFromNorthKm(lat)*1000,N=WGS84_A/Math.sqrt(1-WGS84_E2*Math.sin(phi)*Math.sin(phi));
 const k=lat===90?1:(c<1e-12?Infinity:r/(N*c));
 return {northSouthScale:1,eastWestStretch:k,eastWestDecoder:Number.isFinite(k)&&k>0?1/k:0,areaStretch:k};
}
