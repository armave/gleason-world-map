export class MapController {
  #render;
  #frame = null;
  #disposed = false;

  constructor(renderFrame) {
    if (typeof renderFrame !== 'function') {
      throw new TypeError('MapController requires a render callback.');
    }
    this.#render = renderFrame;
  }

  scheduleDraw() {
    if (this.#disposed || this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      if (!this.#disposed) this.#render();
    });
  }

  drawNow() {
    if (!this.#disposed) this.#render();
  }

  dispose() {
    this.#disposed = true;
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
  }

  get pending() {
    return this.#frame !== null;
  }
}
