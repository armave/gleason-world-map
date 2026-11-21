export function normalizeRotationDegrees(value){const normalized=((value%360)+360)%360;return normalized>180?normalized-360:normalized;}
export function shortestRotationDelta(from,to){return normalizeRotationDegrees(normalizeRotationDegrees(to)-normalizeRotationDegrees(from));}
export function rotatePoint(x,y,angleRadians=0){const c=Math.cos(angleRadians),s=Math.sin(angleRadians);return {x:x*c-y*s,y:x*s+y*c};}
export function unrotatePoint(x,y,angleRadians=0){return rotatePoint(x,y,-angleRadians);}
export function worldToScreenPoint(x,y,zoom,panX,panY,width,height,angleRadians=0){const p=rotatePoint(x,y,angleRadians);return {x:width/2+panX+p.x*zoom,y:height/2+panY+p.y*zoom};}
export function screenToWorldPoint(sx,sy,zoom,panX,panY,width,height,angleRadians=0){if(!Number.isFinite(zoom)||zoom===0)throw new RangeError('Zoom must be a finite non-zero number.');return unrotatePoint((sx-width/2-panX)/zoom,(sy-height/2-panY)/zoom,angleRadians);}
export function panForWorldCenterPoint(x,y,zoom,angleRadians=0){const p=rotatePoint(x,y,angleRadians);return {panX:-p.x*zoom,panY:-p.y*zoom};}
