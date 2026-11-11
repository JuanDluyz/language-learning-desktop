// app.js
import { LitElement, html } from 'lit';
import { store } from '../store.js';
import './dashboard-view/dashboard.view.js';
import './practice-session-view/practice-session.view.js';
import './inference-config-view/inference-config.view.js';
import './chat-session-view/chat-session.view.js';
import './system-preferences-view/system-preferences.view.js';
import './deck-manager-view/deck-manager.view.js';
import './dashboard-view/dashboard.view.css';
import './practice-session-view/practice-session.view.css';
import './inference-config-view/inference-config.view.css';
import './chat-session-view/chat-session.view.css';
import './system-preferences-view/system-preferences.view.css';
import './deck-manager-view/deck-manager.view.css';
import '../common/global.css';

export class AppView extends LitElement {
  static properties = {
    _state: { type: Object }
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._state = store.getState();
    this._unsubscribe = store.subscribe((state) => {
      this._state = { ...state };
      // Sincroniza la clase dark-mode globalmente en el body y data-theme en documentElement
      const isDark = !!state.darkMode;
      document.body.classList.toggle('dark-mode', isDark);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      this.requestUpdate();
    });
  }

  async connectedCallback() {
    super.connectedCallback();
    await store.loadConfig();
    const state = store.getState();
    const isDark = !!state.darkMode;
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe();
  }

  render() {
    const { currentView, selectedGroup, practiceMode, sessionOptions } = this._state;

    switch (currentView) {
      case 'home':
        return html`
          <home-view
            @open-settings="${this._goToSettings}"
            @open-ai-setup="${this._goToAiSetup}"
            @start-practice="${this._handleStartPractice}"
          ></home-view>
        `;

      case 'ai-setup':
        return html`
          <ai-setup-view
            @cancel="${this._goToHome}"
            @start-ai-session="${this._handleStartAiSession}"
          ></ai-setup-view>
        `;

      case 'settings':
        return html`
          <settings-view
            .config="${this._state.config}"
            @go-home="${this._goToHome}"
          ></settings-view>
        `;

      case 'group-manager':
        return html`
          <group-manager-view
            @go-home="${this._goToHome}"
          ></group-manager-view>
        `;

      case 'practice':
      default:
        return html`
          <practice-view
            .groupId="${selectedGroup ?? 0}"
            .mode="${practiceMode ?? 'group'}"
            .sessionOptions="${sessionOptions ?? { level: 'A1', topic: 'Aleatorio', count: 5 }}"
            @go-home="${this._goToHome}"
          ></practice-view>
        `;
    }
  }


  // --- Handlers de navegación privados (Limpieza del render) ---

  _goToHome() {
    store.setState({ currentView: 'home' });
  }

  _goToSettings() {
    store.setState({ currentView: 'settings' });
  }

  _goToAiSetup() {
    store.setState({ currentView: 'ai-setup' });
  }

  _handleStartPractice(event) {
    store.setState({
      practiceMode: event.detail.mode,
      selectedGroup: event.detail.groupId || 0,
      currentView: 'practice'
    });
  }

  _handleStartAiSession(event) {
    store.setState({
      practiceMode: 'dynamic',
      sessionOptions: event.detail,
      currentView: 'practice'
    });
  }
}

customElements.define('app-view', AppView);