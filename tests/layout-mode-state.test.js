import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppState } from '../src/app/state.js';

test('Pure Gleason remains the default layout mode', () => {
  const state = createAppState();
  assert.equal(state.getState().layoutMode, 'gleason');
});

test('layout mode is immutable state and can switch to interrupted petals', () => {
  const state = createAppState();
  const first = state.getState();
  const next = state.update({ layoutMode: 'interrupted-petals' });
  assert.equal(next.layoutMode, 'interrupted-petals');
  assert.equal(first.layoutMode, 'gleason');
  assert.ok(Object.isFrozen(next));
});

test('invalid layout modes fall back to Pure Gleason', () => {
  assert.equal(createAppState({ layoutMode: 'globe' }).getState().layoutMode, 'gleason');
  const state = createAppState();
  state.update({ layoutMode: 'not-a-layout' });
  assert.equal(state.getState().layoutMode, 'gleason');
});
