import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RADIAL_DISTANCE_CIRCLE_COUNT,
  RADIAL_DISTANCE_VISUAL_CIRCLES,
  radialDistanceCorrectionFactor,
  visualRadialFractionFromBaseFraction,
  baseRadialFractionFromVisualFraction
} from '../src/core/visual-radial-calibration.js';

test('the 12 shared reference circles follow the continuous radial warp', () => {
  const circles = RADIAL_DISTANCE_VISUAL_CIRCLES;
  assert.equal(circles.length, RADIAL_DISTANCE_CIRCLE_COUNT);
  assert.ok(Object.isFrozen(circles));
  assert.equal(circles[0].visualFraction, 0);
  assert.equal(circles.at(-1).visualFraction, 1);

  for (const [index, circle] of circles.entries()) {
    const expectedBaseFraction = index / (RADIAL_DISTANCE_CIRCLE_COUNT - 1);
    assert.equal(circle.circle, index + 1);
    assert.ok(Math.abs(circle.baseFraction - expectedBaseFraction) < 1e-12);
    assert.ok(Math.abs(
      circle.visualFraction -
      visualRadialFractionFromBaseFraction(expectedBaseFraction)
    ) < 1e-12);
    assert.ok(Math.abs(
      circle.factor - radialDistanceCorrectionFactor(expectedBaseFraction)
    ) <= 0.005);
    assert.ok(Math.abs(
      baseRadialFractionFromVisualFraction(circle.visualFraction) -
      expectedBaseFraction
    ) < 1e-12);
    assert.ok(Object.isFrozen(circle));

    if (index > 0) {
      assert.ok(circle.visualFraction > circles[index - 1].visualFraction);
    }
  }
});
