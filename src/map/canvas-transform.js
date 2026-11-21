/**
 * Canvas backing stores use physical pixels. Keep the translated origin in
 * the same physical-pixel coordinate system as the scaled map paths.
 */
export function centeredCanvasTransform(pixelRatio, radius) {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0 ||
      !Number.isFinite(radius) || radius < 0) {
    throw new RangeError('Canvas pixel ratio and radius must be valid.');
  }
  const offset = radius * pixelRatio;
  return [pixelRatio, 0, 0, pixelRatio, offset, offset];
}
