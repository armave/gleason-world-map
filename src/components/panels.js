import {LitElement,html} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

export const PANEL_TAGS=Object.freeze([
  'map-find-panel',
  'map-measure-panel',
  'map-layers-panel',
  'map-selection-panel',
  'map-route-panel',
  'map-calibration-panel',
  'map-geometry-panel',
  'map-historical-panel'
]);

class TemplatePanel extends LitElement {
  createRenderRoot() {
    // Preserve the current global CSS and document selectors during migration.
    return this;
  }

  constructor() {
    super();
    this._stateStore = null;
    this._unsubscribe = null;
  }

  set stateStore(store) {
    if (this._stateStore === store) return;
    this._unsubscribe?.();
    this._stateStore = store || null;
    this._subscribeToStateStore();
  }

  get stateStore() {
    return this._stateStore;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._stateStore && !this._unsubscribe) this._subscribeToStateStore();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    super.disconnectedCallback();
  }

  _subscribeToStateStore() {
    this._unsubscribe = this._stateStore?.subscribe(snapshot => {
      // State changes must not re-render the static panel markup: doing so
      // would replace controls and detach the map controller's DOM listeners.
      this._syncState(snapshot);
    }) || null;
    this._syncState(this._stateStore?.getState?.() || {});
  }

  _syncState(snapshot = {}) {
    const mode = snapshot.mode || 'explore';
    this.dataset.activeMode = mode;
    this.querySelector('.lit-panel-content')?.setAttribute('data-active-mode', mode);
    if (this.localName !== 'map-route-panel') return;

    const measurement = snapshot.measurement || {};
    const endpoints = Array.isArray(measurement.endpoints) ? measurement.endpoints : [];
    const a = endpoints[0] || null;
    const b = endpoints[1] || null;
    const setText = (id, value) => {
      const element = this.querySelector('#' + id);
      if (element) element.textContent = value;
    };
    setText('routePointAName', a?.name || 'Not set');
    setText('routePointACoords', a?.coordinates || 'Waiting for endpoint A');
    setText('routePointBName', b?.name || 'Not set');
    setText('routePointBCoords', b?.coordinates || 'Waiting for endpoint B');
    setText('routeDistanceValue', measurement.distancePointCount === 2
      ? (measurement.distanceLabel || 'Unavailable')
      : '—');
    const status = measurement.distancePointCount === 2
      ? 'A and B are connected by the same canonical measurement shown on the map.'
      : measurement.distancePointCount === 1
        ? 'Endpoint A is set. Add a second point to complete the route annotation.'
        : 'Choose two points in Distance mode or assign capitals as A and B.';
    setText('routeRegisterStatus', status);
    this.dataset.routeComplete = String(measurement.distancePointCount === 2);
  }

  _relayPanelEvent(event) {
    const target = event.target?.closest?.('input,select,textarea,button');
    if (!target?.id) return;
    this.dispatchEvent(new CustomEvent('map-panel-event', {
      bubbles:true,
      composed:true,
      detail:{
        id:target.id,
        type:event.type,
        value:target.value,
        checked:target.checked,
        name:target.name || ''
      }
    }));
  }

  render() {
    const template = document.getElementById(this.constructor.templateId);
    const markup = template instanceof HTMLTemplateElement ? template.innerHTML : '';
    const state = this._stateStore?.getState?.() || {};
    return html`
      <div class="lit-panel-content"
           data-lit-component=${this.localName}
           data-active-mode=${state.mode || 'explore'}
           @click=${this._relayPanelEvent}
           @input=${this._relayPanelEvent}
           @change=${this._relayPanelEvent}>
        ${unsafeHTML(markup)}
      </div>
    `;
  }
}

const definitions = [
  ['map-find-panel','find-panel-template'],
  ['map-measure-panel','measure-panel-template'],
  ['map-layers-panel','layers-panel-template'],
  ['map-selection-panel','selection-panel-template'],
  ['map-route-panel','route-panel-template'],
  ['map-calibration-panel','calibration-panel-template'],
  ['map-geometry-panel','geometry-panel-template'],
  ['map-historical-panel','historical-panel-template']
];

for (const [tag,templateId] of definitions) {
  if (customElements.get(tag)) continue;
  const Panel = class extends TemplatePanel {};
  Object.defineProperty(Panel,'templateId',{value:templateId});
  customElements.define(tag,Panel);
}
