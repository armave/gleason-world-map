import {LitElement,html} from 'lit';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

export const PANEL_TAGS=Object.freeze([
  'map-find-panel',
  'map-measure-panel',
  'map-layers-panel',
  'map-selection-panel',
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
    this._unsubscribe?.();
    this._stateStore = store || null;
    this._unsubscribe = this._stateStore?.subscribe(() => this.requestUpdate()) || null;
    this.requestUpdate();
  }

  get stateStore() {
    return this._stateStore;
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    super.disconnectedCallback();
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
