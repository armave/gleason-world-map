const NESTED_STATE_KEYS = new Set(['view','layers','measurement','historical']);

function freezeSnapshot(state) {
  for (const key of NESTED_STATE_KEYS) {
    if (state[key] && typeof state[key] === 'object') Object.freeze(state[key]);
  }
  return Object.freeze(state);
}

export function createAppState(initialState = {}) {
  let snapshot = freezeSnapshot({
    mode:'explore',
    view:{zoom:1,panX:0,panY:0,rotationDegrees:0},
    mapQuality:'medium',
    visualStyle:'atlas',
    layers:{},
    selection:null,
    measurement:{distancePointCount:0,areaPointCount:0,areaFinished:false},
    historical:{},
    searchQuery:'',
    ...initialState
  });
  const listeners = new Set();

  function update(patch = {}, metadata = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('App state updates must be plain objects.');
    }
    const next = {...snapshot};
    for (const [key,value] of Object.entries(patch)) {
      if (NESTED_STATE_KEYS.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        next[key] = {...(snapshot[key] || {}),...value};
      } else {
        next[key] = value;
      }
    }
    const changed = Object.keys(patch).some(key => {
      if (NESTED_STATE_KEYS.has(key) && patch[key] && typeof patch[key] === 'object') {
        return Object.entries(patch[key]).some(([nestedKey,value]) => snapshot[key]?.[nestedKey] !== value);
      }
      return snapshot[key] !== patch[key];
    });
    if (!changed) return snapshot;
    snapshot = freezeSnapshot(next);
    for (const listener of [...listeners]) listener(snapshot,{...metadata,patch});
    return snapshot;
  }

  return Object.freeze({
    getState:() => snapshot,
    update,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('App state subscribers must be functions.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
