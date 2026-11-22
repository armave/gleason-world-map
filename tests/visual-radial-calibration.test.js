import test from 'node:test';
import { FLIGHT_PATH_CALIBRATION } from '../src/core/flight-path-calibration-parameters.js';
import assert from 'node:assert/strict';
import {
  RADIAL_DISTANCE_CIRCLE_COUNT,
  RADIAL_DISTANCE_CIRCLE_FACTORS,
  RADIAL_DISTANCE_CIRCLE_STEP,
  RADIAL_DISTANCE_PROFILE_MEAN,
  RADIAL_DISTANCE_PROFILE_EXPONENT,
  RADIAL_DISTANCE_VISUAL_CIRCLES,
  radialDistanceCorrectionFactor,
  integratedRadialDistanceMultiplier,
  visualRadialFractionFromBaseFraction,
  baseRadialFractionFromVisualFraction,
  visualRadialSpacingScale
} from '../src/core/visual-radial-calibration.js';

test('the 12 circle distance multipliers sample the active fitted taper', () => {
  assert.equal(RADIAL_DISTANCE_CIRCLE_COUNT, 12);
  assert.equal(RADIAL_DISTANCE_PROFILE_EXPONENT,
    FLIGHT_PATH_CALIBRATION.radialProfile.exponent);
  assert.ok(Math.abs(
    RADIAL_DISTANCE_PROFILE_MEAN -
    (0.5 + 0.5 / (RADIAL_DISTANCE_PROFILE_EXPONENT + 1))
  ) < 1e-15);
  assert.ok(Math.abs(RADIAL_DISTANCE_CIRCLE_STEP - 0.5 / 11) < 1e-15);

  assert.equal(RADIAL_DISTANCE_CIRCLE_FACTORS[0], 1);
  assert.equal(RADIAL_DISTANCE_CIRCLE_FACTORS.at(-1), 0.5);
  for (let index = 1; index < RADIAL_DISTANCE_CIRCLE_FACTORS.length; index++) {
    assert.ok(RADIAL_DISTANCE_CIRCLE_FACTORS[index] <
      RADIAL_DISTANCE_CIRCLE_FACTORS[index - 1]);
  }
  for (let index = 0; index < RADIAL_DISTANCE_CIRCLE_FACTORS.length; index++) {
    const expected = radialDistanceCorrectionFactor(index / 11);
    assert.ok(Math.abs(RADIAL_DISTANCE_CIRCLE_FACTORS[index] - expected) < 1e-15);
  }
});

test('the 12 shared reference circles use the same multipliers and projected radii', () => {
  const circles = RADIAL_DISTANCE_VISUAL_CIRCLES;
  assert.equal(circles.length, RADIAL_DISTANCE_CIRCLE_COUNT);
  assert.ok(Object.isFrozen(circles));
  assert.equal(circles[0].visualFraction, 0);
  assert.equal(circles.at(-1).visualFraction, 1);

  for (const [index, circle] of circles.entries()) {
    const expectedBaseFraction = index / (RADIAL_DISTANCE_CIRCLE_COUNT - 1);
    const expectedMultiplier = radialDistanceCorrectionFactor(expectedBaseFraction);
    assert.equal(circle.circle, index + 1);
    assert.ok(Math.abs(circle.baseFraction - expectedBaseFraction) < 1e-12);
    assert.ok(Math.abs(circle.distanceMultiplier - expectedMultiplier) < 1e-12);
    assert.ok(Math.abs(
      circle.visualFraction -
      visualRadialFractionFromBaseFraction(expectedBaseFraction)
    ) < 1e-12);
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

test('each ring interval uses the exact integral of the fitted local multiplier', () => {
  const circles = RADIAL_DISTANCE_VISUAL_CIRCLES;
  for (let index = 0; index < circles.length - 1; index++) {
    const first = circles[index];
    const second = circles[index + 1];
    const baseGap = second.baseFraction - first.baseFraction;
    const visualGap = second.visualFraction - first.visualFraction;
    const integratedGap = (
      integratedRadialDistanceMultiplier(second.baseFraction) -
      integratedRadialDistanceMultiplier(first.baseFraction)
    ) / RADIAL_DISTANCE_PROFILE_MEAN;
    assert.ok(Math.abs(visualGap - integratedGap) < 1e-12);
    assert.ok(Math.abs(visualGap / baseGap -
      integratedGap / baseGap) < 1e-12);
  }
});

test('the active local radial scale is the fitted positive multiplier normalized to keep the rim fixed', () => {
  for (const q of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const expected = radialDistanceCorrectionFactor(q) / RADIAL_DISTANCE_PROFILE_MEAN;
    assert.ok(Math.abs(visualRadialSpacingScale(q) - expected) < 1e-12);
  }

  const h = 1e-6;
  for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const derivative = (
      visualRadialFractionFromBaseFraction(q + h) -
      visualRadialFractionFromBaseFraction(q - h)
    ) / (2 * h);
    assert.ok(Math.abs(derivative - visualRadialSpacingScale(q)) < 1e-9);
  }
});

test('integrated multiplier profile keeps both disk anchors fixed and monotonic', () => {
  assert.equal(visualRadialFractionFromBaseFraction(0), 0);
  assert.equal(visualRadialFractionFromBaseFraction(1), 1);
  assert.equal(integratedRadialDistanceMultiplier(0), 0);
  assert.equal(integratedRadialDistanceMultiplier(1), RADIAL_DISTANCE_PROFILE_MEAN);

  let previous = 0;
  for (let index = 0; index <= 1000; index++) {
    const q = index / 1000;
    const visual = visualRadialFractionFromBaseFraction(q);
    assert.ok(visual >= previous);
    assert.ok(visual >= 0 && visual <= 1);
    previous = visual;
  }
});


test('the active 12-circle profile exponent is explicit and has a positive smooth radial scale', () => {
  assert.ok(RADIAL_DISTANCE_PROFILE_EXPONENT > 0);
  assert.ok(RADIAL_DISTANCE_PROFILE_MEAN > 0);
  assert.equal(RADIAL_DISTANCE_VISUAL_CIRCLES.length, 12);
  for (let index = 1; index < RADIAL_DISTANCE_CIRCLE_FACTORS.length; index++) {
    assert.ok(RADIAL_DISTANCE_CIRCLE_FACTORS[index] < RADIAL_DISTANCE_CIRCLE_FACTORS[index - 1]);
    assert.ok(RADIAL_DISTANCE_CIRCLE_FACTORS[index] > 0);
  }
});


test('candidate profiles share the exact integrated transform and invert back to base radius', () => {
  for (const exponent of [0.7, 0.85, 1, 1.15, 1.3]) {
    const profile = {innerFactor:1, outerFactor:0.5, exponent};
    const mean = 0.5 + 0.5 / (exponent + 1);
    assert.ok(Math.abs(integratedRadialDistanceMultiplier(1, profile) - mean) < 1e-12);
    assert.equal(visualRadialFractionFromBaseFraction(0, profile), 0);
    assert.equal(visualRadialFractionFromBaseFraction(1, profile), 1);
    for (const q of [0.05,0.2,0.5,0.8,0.95]) {
      const visual = visualRadialFractionFromBaseFraction(q, profile);
      assert.ok(visual > 0 && visual < 1);
      assert.ok(Math.abs(baseRadialFractionFromVisualFraction(visual, profile) - q) < 1e-10);
      assert.ok(radialDistanceCorrectionFactor(q, profile) > 0);
    }
  }
});
