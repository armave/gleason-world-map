function projectValue(project, lat, lon, disk) {
 const point = project(lat, lon, disk);
 return Array.isArray(point) ? point.slice(0, 2) : [point?.x, point?.y];
}
function diskAt(latitude) { return latitude >= 0 ? 'N' : 'S'; }
function unwrapNext(longitude, previous) {
 const raw = longitude - previous;
 return previous + ((raw + 540) % 360) - 180;
}
function denseSegment(start, end, project, disk, step) {
 const deltaLon = end[0] - start[0], deltaLat = end[1] - start[1];
 const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaLon), Math.abs(deltaLat)) / step));
 const points = [];
 for (let index = 0; index <= steps; index++) {
  const t = index / steps;
  points.push(projectValue(project, start[1] + deltaLat * t, start[0] + deltaLon * t, disk));
 }
 return points;
}

/** Project linework into continuous per-disk subpaths; each hinge crossing is duplicated on both rims. */
export function projectCoastlineLines(data, project, maxStepDegrees = 1.5) {
 if (!Array.isArray(data?.coordinates) || typeof project !== 'function') return [];
 const step = Number.isFinite(maxStepDegrees) && maxStepDegrees > 0 ? maxStepDegrees : 1.5;
 const output = [];
 for (const sourceLine of data.coordinates) {
  if (!Array.isArray(sourceLine) || sourceLine.length < 2) continue;
  const line = sourceLine.filter(point =>
   Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
   point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90
  );
  if (line.length < 2) continue;
  let previous = [line[0][0], line[0][1]];
  let disk = diskAt(previous[1]);
  let current = [projectValue(project, previous[1], previous[0], disk)];
  for (let index = 1; index < line.length; index++) {
   const next = [unwrapNext(line[index][0], previous[0]), line[index][1]];
   const changesSide = previous[1] * next[1] < 0;
   if (changesSide) {
    const t = -previous[1] / (next[1] - previous[1]);
    const hinge = [previous[0] + (next[0] - previous[0]) * t, 0];
    current.push(...denseSegment(previous, hinge, project, disk, step).slice(1));
    if (current.length >= 2) output.push(current);
    disk = diskAt(next[1]);
    current = [projectValue(project, 0, hinge[0], disk)];
    current.push(...denseSegment(hinge, next, project, disk, step).slice(1));
   } else {
    const nextDisk = Math.abs(next[1]) < 1e-10 ? disk : diskAt(next[1]);
    if (nextDisk !== disk) {
     if (current.length >= 2) output.push(current);
     disk = nextDisk;
     current = [projectValue(project, previous[1], previous[0], disk)];
    }
    current.push(...denseSegment(previous, next, project, disk, step).slice(1));
   }
   previous = next;
  }
  if (current.length >= 2) output.push(current);
 }
 return output.filter(line => line.length >= 2 && line.every(point => point.every(Number.isFinite)));
}

function appendProjectedLines(path, lines) {
 for (const line of lines) {
  path.moveTo(line[0][0], line[0][1]);
  for (let index = 1; index < line.length; index++) path.lineTo(line[index][0], line[index][1]);
 }
}
function yieldToMainThread() {
 return new Promise(resolve => {
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(() => resolve(), { timeout: 80 });
  else setTimeout(resolve, 0);
 });
}
export function createCoastlinePath(data, project, PathConstructor = globalThis.Path2D) {
 if (typeof PathConstructor !== 'function') throw new Error('Path2D is required to build coastline geometry.');
 const path = new PathConstructor();
 appendProjectedLines(path, projectCoastlineLines(data, project));
 return path;
}
export async function createCoastlinePathAsync(
 data, project, PathConstructor = globalThis.Path2D,
 { batchSize = 24, yieldControl = yieldToMainThread } = {}
) {
 if (typeof PathConstructor !== 'function') throw new Error('Path2D is required to build coastline geometry.');
 if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Coastline batch size must be a positive integer.');
 const path = new PathConstructor(), coordinates = data?.coordinates;
 if (!Array.isArray(coordinates) || typeof project !== 'function') return path;
 for (let start = 0; start < coordinates.length; start += batchSize) {
  const batch = { coordinates: coordinates.slice(start, start + batchSize) };
  appendProjectedLines(path, projectCoastlineLines(batch, project));
  if (start + batchSize < coordinates.length) await yieldControl();
 }
 return path;
}
export function drawCoastlines(ctx, path, zoom = 1, palette = {}) {
 if (!ctx || !path || !Number.isFinite(zoom) || zoom <= 0) return;
 ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
 ctx.strokeStyle = palette.coastHalo || 'rgba(250,253,247,.94)'; ctx.lineWidth = 2.2 / zoom; ctx.stroke(path);
 ctx.strokeStyle = palette.coastline || '#477486'; ctx.lineWidth = .9 / zoom; ctx.stroke(path);
 ctx.restore();
}
