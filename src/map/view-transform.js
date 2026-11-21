export function screenUprightRotation(localAngleRadians=0,mapAngleRadians=0){return localAngleRadians-mapAngleRadians;}
export function uprightTextAngle(angleRadians=0){const halfPi=Math.PI/2,period=Math.PI;return ((angleRadians+halfPi)%period+period)%period-halfPi;}
export function screenReadingDirection(longitudeRadians,mapAngleRadians=0){const rightward=-Math.sin(longitudeRadians-mapAngleRadians);if(Math.abs(rightward)>1e-9)return Math.sign(rightward);return Math.cos(longitudeRadians-mapAngleRadians)>=0?-1:1;}
export function normalizeRotationDegrees(value){const normalized=((value%360)+360)%360;return normalized>180?normalized-360:normalized;}
export function shortestRotationDelta(from,to){return normalizeRotationDegrees(normalizeRotationDegrees(to)-normalizeRotationDegrees(from));}
export function rotatePoint(x,y,angleRadians=0){const c=Math.cos(angleRadians),s=Math.sin(angleRadians);return {x:x*c-y*s,y:x*s+y*c};}
export function unrotatePoint(x,y,angleRadians=0){return rotatePoint(x,y,-angleRadians);}
export function worldToScreenPoint(x,y,zoom,panX,panY,width,height,angleRadians=0){const p=rotatePoint(x,y,angleRadians);return {x:width/2+panX+p.x*zoom,y:height/2+panY+p.y*zoom};}
export function screenToWorldPoint(sx,sy,zoom,panX,panY,width,height,angleRadians=0){if(!Number.isFinite(zoom)||zoom===0)throw new RangeError('Zoom must be a finite non-zero number.');return unrotatePoint((sx-width/2-panX)/zoom,(sy-height/2-panY)/zoom,angleRadians);}
export function panForWorldCenterPoint(x,y,zoom,angleRadians=0){const p=rotatePoint(x,y,angleRadians);return {panX:-p.x*zoom,panY:-p.y*zoom};}


/** Scale screen pan offsets with the projected disk when its radius changes. */
export function scalePanForDiskResize(panX,panY,previousRadius,nextRadius){
 if(![panX,panY,previousRadius,nextRadius].every(Number.isFinite)||
    previousRadius<=0||nextRadius<=0)return {panX,panY};
 const ratio=nextRadius/previousRadius;
 return {panX:panX*ratio,panY:panY*ratio};
}
