export function isoFor(f){const p=f.properties||{};const candidates=[p.ISO_A3_EH,p.ISO_A3,p.ADM0_A3,p.SOV_A3];const v=candidates.find(x=>x&&String(x).toUpperCase()!=='-99')||'';return String(v).toUpperCase();}
export function nameFor(f){const p=f.properties||{};return p.ADMIN||p.NAME_EN||p.NAME||p.FORMAL_EN||'Unknown';}
export function hashColor(s,palette){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return palette[Math.abs(h)%palette.length];}
export function centroidOfFeature(feature) {
  const properties = feature?.properties || {};
  if (properties.LABEL_X != null && properties.LABEL_Y != null &&
      Number.isFinite(Number(properties.LABEL_X)) && Number.isFinite(Number(properties.LABEL_Y))) {
    return { lat: Number(properties.LABEL_Y), lon: Number(properties.LABEL_X) };
  }
  const geometry = feature?.geometry;
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] :
    geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  const coordinates = [];
  for (const polygon of polygons) {
    const outerRing = polygon?.[0];
    if (!Array.isArray(outerRing)) continue;
    for (const coordinate of outerRing) {
      if (Array.isArray(coordinate) && Number.isFinite(+coordinate[0]) &&
          Number.isFinite(+coordinate[1]) && +coordinate[0] >= -180 &&
          +coordinate[0] <= 180 && +coordinate[1] >= -90 && +coordinate[1] <= 90) {
        coordinates.push([+coordinate[0], +coordinate[1]]);
      }
    }
  }
  if (!coordinates.length) return { lat: 0, lon: 0 };
  const anchor = coordinates[0][0];
  let longitudeSum = 0, latitudeSum = 0;
  for (const [longitude, latitude] of coordinates) {
    const delta = ((longitude - anchor + 540) % 360) - 180;
    longitudeSum += anchor + delta;
    latitudeSum += latitude;
  }
  const longitude = longitudeSum / coordinates.length;
  return {
    lat: latitudeSum / coordinates.length,
    lon: ((longitude + 180) % 360 + 360) % 360 - 180
  };
}
