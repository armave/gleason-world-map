const DEFAULT_LAYOUT = Object.freeze({ cx: 33, cy: 33, radius: 17.5 });

/**
 * Keep compass cardinal marks fixed to the screen while the needle follows
 * the map's actual canvas rotation. Canvas rotation is clockwise because
 * its positive Y axis points down.
 */
export function createCompassRoseLayout(rotationRadians, options = {}) {
  const cx = Number.isFinite(options.cx) ? options.cx : DEFAULT_LAYOUT.cx;
  const cy = Number.isFinite(options.cy) ? options.cy : DEFAULT_LAYOUT.cy;
  const radius = Number.isFinite(options.radius) && options.radius > 0
    ? options.radius
    : DEFAULT_LAYOUT.radius;

  return {
    cx,
    cy,
    radius,
    outerRadius: radius * 1.75,
    needleRotation: Number.isFinite(rotationRadians) ? rotationRadians : 0,
    cardinalLabels: [
      { label: 'N', x: 0, y: -radius * 1.43 },
      { label: 'E', x: radius * 1.43, y: 0 },
      { label: 'S', x: 0, y: radius * 1.43 },
      { label: 'W', x: -radius * 1.43, y: 0 }
    ]
  };
}
