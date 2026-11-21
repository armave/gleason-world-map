export const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const rad = d => d*Math.PI/180;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const fmtCoord = (lat,lon) => `${Math.abs(lat).toFixed(2)}°${lat>=0?'N':'S'}, ${Math.abs(lon).toFixed(2)}°${lon>=0?'E':'W'}`;
export const lonName = d => d===0?'0° / 360°':`${d}°`;
export function formatDistance(meters){
 if(!Number.isFinite(meters)||meters<0)return '—';
 if(meters<1000)return `${meters.toLocaleString('en-US',{maximumFractionDigits:meters<100?1:0})} m`;
 return `${(meters/1000).toLocaleString('en-US',{maximumFractionDigits:1})} km`;
}
export function formatArea(areaM2){
 if(!Number.isFinite(areaM2)||areaM2<0)return 'Unavailable';
 if(areaM2<1e6)return `${areaM2.toLocaleString('en-US',{maximumFractionDigits:0})} m²`;
 return `${(areaM2/1e6).toLocaleString('en-US',{maximumFractionDigits:2})} km²`;
}
export function scaleFactorText(value){
 if(!Number.isFinite(value))return '∞';
 if(value===0)return '0.000×';
 return `${value.toFixed(value>=10?2:3)}×`;
}
