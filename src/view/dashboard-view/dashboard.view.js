import { LitElement, html } from 'lit';
import { store } from '../../store.js';
import { HomeController } from './dashboard-view.controller.js';
import {
  iconMoon,
  iconSun,
  iconSettings,
  iconPlus,
  iconMoreVertical,
  iconEdit,
  iconTrash,
  iconPlay,
  iconClose,
  iconSparkles
} from '../../common/ui-icons.constants.js';
import './dashboard.view.css';

export class HomeView extends LitElement {
  static properties = {
    groups: { type: Array },
    loading: { type: Boolean },
    error: { type: String },
    _state: { type: Object },
    activeDropdownId: { type: Number },
    dropdownPos: { type: Object },
    modalType: { type: String }, // 'group-create', 'group-edit', 'phrases-manage'
    selectedGroup: { type: Object },
    groupPhrases: { type: Array },
    inputText: { type: String },
    editingPhraseId: { type: Number },
    confirmDeleteGroup: { type: Object },
    confirmDeletePhraseId: { type: Number },
    groupType: { type: String },
    createInitialPhrasesText: { type: String },
    dynLevel: { type: String },
    dynTopic: { type: String },
    dynCount: { type: Number },
    dynTargetWords: { type: String },
    dynCustomPrompt: { type: String }
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.groups = [];
    this.loading = true;
    this.error = '';
    this._state = store.getState();
    this.activeDropdownId = null;
    this.dropdownPos = null;
    this.modalType = null;
    this.selectedGroup = null;
    this.groupPhrases = [];
    this.inputText = '';
    this.editingPhraseId = null;
    this.confirmDeleteGroup = null;
    this.confirmDeletePhraseId = null;
    this.groupType = 'dynamic_preset';
    this.createInitialPhrasesText = '';
    this.dynLevel = 'A2';
    this.dynTopic = 'Airport & Hotel Conversations';
    this.dynCount = 5;
    this.dynTargetWords = '';
    this.dynCustomPrompt = '';

    this.controller = new HomeController(this);

    this._unsubscribe = store.subscribe((state) => {
      this._state = { ...state };
      this.requestUpdate();
    });

    this._closeDropdownsOnClickOutside = (e) => {
      if (!e.target.closest('.dropdown-container') && !e.target.closest('.dropdown-menu')) {
        this.activeDropdownId = null;
        this.dropdownPos = null;
        this.requestUpdate();
      }
    };

    this._closeDropdownsOnScroll = () => {
      if (this.activeDropdownId !== null) {
        this.activeDropdownId = null;
        this.dropdownPos = null;
        this.requestUpdate();
      }
    };
  }

  getUserLevelDisplay() {
    const config = this._state?.config || store.getState().config || {};
    const level = config.level || 'B1';
    const score = Number(config.internal_level_score);
    if (!score || isNaN(score)) return level;
    
    let macroLevel = level;
    let base = 3.0;
    if (score < 2.0) { macroLevel = 'A1'; base = 1.0; }
    else if (score < 3.0) { macroLevel = 'A2'; base = 2.0; }
    else if (score < 4.0) { macroLevel = 'B1'; base = 3.0; }
    else if (score < 5.0) { macroLevel = 'B2'; base = 4.0; }
    else { macroLevel = 'C1'; base = 5.0; }

    const subNum = Math.floor(Math.min(0.99, Math.max(0, score - base)) * 10);
    return `${macroLevel} (${macroLevel}.${subNum})`;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.controller.init();
    window.addEventListener('click', this._closeDropdownsOnClickOutside);
    window.addEventListener('scroll', this._closeDropdownsOnScroll, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) this._unsubscribe();
    window.removeEventListener('click', this._closeDropdownsOnClickOutside);
    window.removeEventListener('scroll', this._closeDropdownsOnScroll, true);
  }

  toggleDropdown(groupId, event) {
    event.stopPropagation();
    if (this.activeDropdownId === groupId) {
      this.activeDropdownId = null;
      this.dropdownPos = null;
    } else {
      const btn = event.currentTarget;
      const rect = btn.getBoundingClientRect();
      this.activeDropdownId = groupId;
      this.dropdownPos = {
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right)
      };
    }
    this.requestUpdate();
  }

  openCreateGroupModal() {
    this.modalType = 'group-create';
    this.groupType = 'dynamic_preset';
    this.inputText = 'Viajes y Aeropuertos';
    this.createInitialPhrasesText = '';
    this.dynLevel = 'A2';
    this.dynTopic = 'Airport & Hotel Conversations';
    this.dynCount = 5;
    this.dynTargetWords = '';
    this.dynCustomPrompt = '';
    this.selectedGroup = null;
  }

  applyPreset(preset) {
    this.groupType = preset.type;
    this.inputText = preset.name;
    if (preset.type === 'dynamic_preset') {
      this.dynLevel = preset.level || 'B1';
      this.dynTopic = preset.topic || '';
      this.dynCount = preset.count || 5;
    } else {
      this.createInitialPhrasesText = preset.initialText || '';
    }
    this.requestUpdate();
  }

  openEditGroupModal(group) {
    this.modalType = 'group-edit';
    this.selectedGroup = group;
    this.inputText = group ? group.name : '';
    this.groupType = group ? (group.type || 'static') : 'static';
    this.activeDropdownId = null;
    this.dropdownPos = null;
    if (group && group.dynamic_config) {
      try {
        const conf = typeof group.dynamic_config === 'string' ? JSON.parse(group.dynamic_config) : group.dynamic_config;
        this.dynLevel = conf.level || 'B1';
        this.dynTopic = conf.topic || '';
        this.dynCount = conf.count || 5;
        this.dynTargetWords = conf.target_words || '';
        this.dynCustomPrompt = conf.custom_prompt || '';
      } catch {}
    }
  }

  async openPhrasesModal(group) {
    this.modalType = 'phrases-manage';
    this.selectedGroup = group;
    this.inputText = '';
    this.editingPhraseId = null;
    this.activeDropdownId = null;
    this.dropdownPos = null;
    this.groupPhrases = await this.controller.getPhrases(group.id);
  }

  closeModal() {
    this.modalType = null;
    this.selectedGroup = null;
    this.inputText = '';
    this.editingPhraseId = null;
    this.activeDropdownId = null;
    this.dropdownPos = null;
  }

  async handleSaveGroup() {
    if (!this.inputText.trim()) return;
    if (this.modalType === 'group-create') {
      const dynamicConfig = this.groupType === 'dynamic_preset' ? {
        level: this.dynLevel,
        topic: this.dynTopic,
        count: Number(this.dynCount),
        target_words: (this.dynTargetWords || '').trim(),
        custom_prompt: (this.dynCustomPrompt || '').trim()
      } : null;

      const initialPhrases = (this.groupType !== 'dynamic_preset' && this.createInitialPhrasesText)
        ? this.createInitialPhrasesText.split('\n').map(s => s.trim()).filter(Boolean)
        : [];

      await this.controller.createGroup(this.inputText.trim(), this.groupType, dynamicConfig, initialPhrases);
    } else if (this.modalType === 'group-edit' && this.selectedGroup) {
      const dynamicConfig = this.groupType === 'dynamic_preset' ? {
        level: this.dynLevel,
        topic: this.dynTopic,
        count: Number(this.dynCount),
        target_words: (this.dynTargetWords || '').trim(),
        custom_prompt: (this.dynCustomPrompt || '').trim()
      } : null;

      await this.controller.updateGroup(this.selectedGroup.id, this.inputText.trim(), this.groupType, dynamicConfig);
    }
    this.closeModal();
  }

  async handleSavePhrase() {
    if (!this.inputText.trim() || !this.selectedGroup) return;
    if (this.editingPhraseId) {
      await this.controller.updatePhrase(this.editingPhraseId, this.inputText.trim());
    } else {
      await this.controller.createPhrase(this.selectedGroup.id, this.inputText.trim());
    }
    this.inputText = '';
    this.editingPhraseId = null;
    this.groupPhrases = await this.controller.getPhrases(this.selectedGroup.id);
  }

  startEditPhrase(phrase) {
    this.editingPhraseId = phrase.id;
    this.inputText = phrase.original_text;
  }

  async handleDeletePhrase(phraseId) {
    this.confirmDeletePhraseId = phraseId;
  }

  async confirmExecuteDeletePhrase() {
    if (!this.confirmDeletePhraseId) return;
    const phraseId = this.confirmDeletePhraseId;
    this.confirmDeletePhraseId = null;
    await this.controller.deletePhrase(phraseId);
    if (this.selectedGroup) {
      this.groupPhrases = await this.controller.getPhrases(this.selectedGroup.id);
    }
  }

  handleRowClick(group, event) {
    if (event.target.closest('.dropdown-container')) {
      return;
    }
    this.controller.startGroup(group);
  }

  render() {
    const state = this._state;
    const cleanModelName = (state.status?.selectedModel || '').replace('.gguf', '');
    const context = this;

    return html`
      <main class="home-screen">
        <header class="home-header">
          <div><h1 class="logo-label">AI Listening Practice</h1></div>
          <div class="header-actions">
            <button type="button" class="utility-button" title="Cambiar tema" @click="${() => context.controller.toggleTheme()}">
              ${state.darkMode ? iconMoon : iconSun}
            </button>
            <button type="button" class="utility-button" title="Configuración" @click="${() => context.controller.goToSettings()}">
              ${iconSettings}
            </button>
          </div>
        </header>

        <div class="center-scroll">
          <div class="center-widget">
            <div class="card">
              <div class="card-header">
                <span class="card-title">Grupos de frases</span>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="btn-small btn-vocab" @click="${() => this.controller.goToGroupManager()}" title="Gestionar Vocabulario">
                    ${iconEdit}
                  </button>
                  <button type="button" class="btn-small btn-add-group" @click="${() => this.openCreateGroupModal()}" title="Nuevo Grupo">
                    ${iconPlus}
                  </button>
                </div>
              </div>
              
              <div class="table-header-container">
                <span class="table-header">NOMBRE</span>
                <span class="table-header">FRASES</span>
                <span class="table-header" style="text-align: right;"></span>
              </div>

              <div class="groups-scroll-area">
                ${this.loading && (!this.groups || this.groups.length === 0)
                  ? html`
                      <table class="groups-table">
                        <tbody>
                          <tr class="clickable-row" style="opacity: 0.5;">
                            <td class="group-name-cell"><span class="group-name-text">Cargando grupos...</span></td>
                            <td class="group-count-cell">...</td>
                            <td></td>
                          </tr>
                          <tr class="clickable-row" style="opacity: 0.3;">
                            <td class="group-name-cell"><span class="group-name-text">Obteniendo datos...</span></td>
                            <td class="group-count-cell">...</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    `
                  : html`
                    <table class="groups-table">
                      <tbody>
                        ${this.groups.length === 0 
                          ? html`<tr><td colspan="3" class="home-empty">No hay grupos guardados.</td></tr>`
                          : this.groups.map((group) => html`
                            <tr
                              class="clickable-row ${this.activeDropdownId === group.id ? 'dropdown-active' : ''}"
                              @click="${(e) => this.handleRowClick(group, e)}"
                              title="Hacer clic para practicar este grupo"
                            >
                              <td class="group-name-cell">
                                <span class="group-name-text">${group.name}</span>
                                <span class="badge-group-type ${group.type === 'dynamic_preset' ? 'dynamic' : group.type === 'vocabulary' ? 'vocab' : 'static'}">
                                  • ${group.type === 'dynamic_preset' ? 'IA' : group.type === 'vocabulary' ? 'Vocabulario' : 'Estático'}
                                </span>
                              </td>
                              <td class="group-count-cell">
                                ${group.type === 'dynamic_preset' 
                                  ? html`<span class="group-dash-text">-</span>` 
                                  : html`
                                    <div class="group-count-numbers" title="${group.due_count || 0} pendientes hoy, ${group.learning_count || 0} revisadas">
                                      <span class="num-due ${(group.due_count || 0) === 0 ? 'zero' : ''}">${group.due_count || 0}</span>
                                      <span class="num-divider">/</span>
                                      <span class="num-learning ${(group.learning_count || 0) === 0 ? 'zero' : ''}">${group.learning_count || 0}</span>
                                    </div>
                                  `}
                              </td>
                              <td style="text-align: right;">
                                <div class="dropdown-container ${this.activeDropdownId === group.id ? 'active' : ''}">
                                  <button
                                    type="button"
                                    class="dropdown-trigger-btn"
                                    @click="${(e) => this.toggleDropdown(group.id, e)}"
                                    title="Opciones de grupo"
                                  >
                                    ${iconMoreVertical}
                                  </button>

                                  ${this.activeDropdownId === group.id && this.dropdownPos
                                    ? html`
                                        <div
                                          class="dropdown-menu fixed-dropdown"
                                          style="position: fixed; top: ${this.dropdownPos.top}px; right: ${this.dropdownPos.right}px; z-index: 999999;"
                                        >
                                          ${group.type !== 'dynamic_preset' ? html`
                                            <button type="button" class="dropdown-item" @click="${(e) => { e.stopPropagation(); this.openPhrasesModal(group); }}">
                                              ${iconPlus} <span>Gestionar Frases</span>
                                            </button>
                                          ` : ''}
                                          <button type="button" class="dropdown-item" @click="${(e) => { e.stopPropagation(); this.openEditGroupModal(group); }}">
                                            ${iconEdit} <span>Editar Nombre</span>
                                          </button>
                                          <button type="button" class="dropdown-item danger" @click="${(e) => { e.stopPropagation(); this.activeDropdownId = null; this.dropdownPos = null; this.confirmDeleteGroup = group; }}">
                                            ${iconTrash} <span>Eliminar Grupo</span>
                                          </button>
                                        </div>
                                      `
                                    : ''}
                                </div>
                              </td>
                            </tr>
                          `)}
                      </tbody>
                    </table>
                  `}
              </div>
            </div>

            ${state.isLlmChecked && !state.isLlmAvailable ? html`
              <div class="no-llm-widget" style="background: var(--danger-bg); border: 1px solid var(--danger-color); color: var(--danger-color); padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: var(--danger-color);">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>No hay ningún modelo LLM seleccionado. Las funciones generativas de IA están deshabilitadas.</span>
                </div>
                <button type="button" class="link-button" style="color: var(--primary-color); font-weight: 600; text-decoration: underline; background: transparent; border: none; cursor: pointer; white-space: nowrap;" @click="${() => context.controller.goToSettings()}">Ir a Configuración</button>
              </div>
            ` : ''}

            <button 
              type="button" 
              class="btn-primary-ai ${state.isLlmChecked && !state.isLlmAvailable ? 'disabled-ai' : ''}" 
              ?disabled="${state.isLlmChecked && !state.isLlmAvailable}"
              @click="${() => context.controller.onAiSetupClicked()}"
            >
              Configurar Sesión con IA
            </button>

            ${this.error ? html`<p class="home-error">${this.error}</p>` : ''}
          </div>
        </div>

        <footer class="status-bar">
          <div class="status-bar-content">
            ${state.isLlmAvailable 
              ? html`
                  <span class="status-item">
                    <span class="status-label">Model:</span>
                    <span class="status-val font-mono">${cleanModelName}</span>
                  </span>
                  <span class="status-divider">|</span>
                  <span class="status-item">
                    <span class="status-label">Backend:</span>
                    <span class="status-val font-mono">llama.cpp</span>
                  </span>
                  <span class="status-divider">|</span>
                  <span class="status-item status-online">
                    <span class="status-dot"></span>
                    <span class="status-text">${state.status?.engineStatus || 'Modelo disponible'}</span>
                  </span>
                `
              : html`
                  <span class="status-item status-offline">
                    <span class="status-dot offline"></span>
                    <span class="status-text">Modo: Sin LLM (Práctica estática activa)</span>
                  </span>
                `
            }
            <span class="status-divider">|</span>
            <span class="status-item">
              <span class="status-label">Nivel Actual:</span>
              <span class="status-val font-mono" style="color: var(--primary-color); font-weight: 600;">${this.getUserLevelDisplay()}</span>
            </span>
          </div>
        </footer>

        <!-- Modal CRUD Grupos / Frases -->
        ${this.modalType
          ? html`
              <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && this.closeModal()}">
                <div class="home-modal-card" style="max-width: 480px;">
                  <header class="modal-header">
                    <h3>
                      ${this.modalType === 'group-create' ? 'Crear Nuevo Grupo' : ''}
                      ${this.modalType === 'group-edit' ? 'Editar Grupo' : ''}
                      ${this.modalType === 'phrases-manage' ? `Frases de "${this.selectedGroup?.name}"` : ''}
                    </h3>
                    <button type="button" class="close-modal-btn" @click="${() => this.closeModal()}">${iconClose}</button>
                  </header>

                  <div class="modal-body">
                    ${this.modalType === 'group-create' || this.modalType === 'group-edit'
                      ? html`
                          ${this.modalType === 'group-create' ? html`
                            <div class="preset-templates-container">
                              <span class="preset-label">Plantillas rápidas:</span>
                              <div class="preset-chips">
                                <button type="button" class="preset-chip ${this.inputText === 'Viajes y Aeropuertos' ? 'active' : ''}" @click="${() => this.applyPreset({ type: 'dynamic_preset', name: 'Viajes y Aeropuertos', level: 'A2', topic: 'Airport & Hotel Conversations', count: 5 })}">Viajes</button>
                                <button type="button" class="preset-chip ${this.inputText === 'Inglés de Negocios' ? 'active' : ''}" @click="${() => this.applyPreset({ type: 'dynamic_preset', name: 'Inglés de Negocios', level: 'B1', topic: 'Business Meetings & Office', count: 5 })}">Negocios</button>
                                <button type="button" class="preset-chip ${this.inputText === 'Vida Cotidiana' ? 'active' : ''}" @click="${() => this.applyPreset({ type: 'dynamic_preset', name: 'Vida Cotidiana', level: 'A1', topic: 'Daily Routines & Family', count: 5 })}">Cotidiano</button>
                                <button type="button" class="preset-chip ${this.inputText === 'Entrevista Laboral' ? 'active' : ''}" @click="${() => this.applyPreset({ type: 'dynamic_preset', name: 'Entrevista Laboral', level: 'B2', topic: 'Job Interview Q&A', count: 5 })}">Entrevista</button>
                                <button type="button" class="preset-chip ${this.groupType === 'static' ? 'active' : ''}" @click="${() => this.applyPreset({ type: 'static', name: 'Mi Vocabulario', initialText: '' })}">Manual</button>
                              </div>
                            </div>

                            <div class="group-type-tabs">
                              <button type="button" class="group-tab ${this.groupType === 'dynamic_preset' ? 'active' : ''}" @click="${() => { this.groupType = 'dynamic_preset'; }}">
                                Inteligente (IA)
                              </button>
                              <button type="button" class="group-tab ${this.groupType === 'static' ? 'active' : ''}" @click="${() => { this.groupType = 'static'; }}">
                                Lista Manual
                              </button>
                              <button type="button" class="group-tab ${this.groupType === 'vocabulary' ? 'active' : ''}" @click="${() => { this.groupType = 'vocabulary'; }}">
                                Vocabulario (SM-2)
                              </button>
                            </div>
                          ` : ''}

                          <div class="form-group">
                            <label class="form-label">Nombre del grupo:</label>
                            <input
                              type="text"
                              class="modal-input"
                              .value="${this.inputText}"
                              @input="${(e) => { this.inputText = e.target.value; }}"
                              placeholder="Ej. Vocabulario de Viajes..."
                            />
                          </div>

                          ${this.groupType === 'dynamic_preset' ? html`
                            <div class="form-row-2">
                              <div class="form-group">
                                <label class="form-label">Nivel MCER:</label>
                                <div class="level-pills">
                                  ${['A1', 'A2', 'B1', 'B2', 'C1'].map(lvl => html`
                                    <button type="button" class="level-pill ${this.dynLevel === lvl ? 'active' : ''}" @click="${() => { this.dynLevel = lvl; }}">${lvl}</button>
                                  `)}
                                </div>
                              </div>
                              <div class="form-group">
                                <label class="form-label">Frases / Sesión:</label>
                                <div class="count-pills">
                                  ${[3, 5, 10].map(cnt => html`
                                    <button type="button" class="count-pill ${Number(this.dynCount) === cnt ? 'active' : ''}" @click="${() => { this.dynCount = cnt; }}">${cnt}</button>
                                  `)}
                                </div>
                              </div>
                            </div>

                            <div class="form-group">
                              <label class="form-label">Tema o Contexto:</label>
                              <input type="text" class="modal-input" .value="${this.dynTopic}" @input="${(e) => { this.dynTopic = e.target.value; }}" placeholder="Ej. Airport, Hotel, Restaurant..." />
                            </div>

                            <div class="form-group">
                              <label class="form-label">Palabras Clave Opcionales:</label>
                              <input type="text" class="modal-input" .value="${this.dynTargetWords}" @input="${(e) => { this.dynTargetWords = e.target.value; }}" placeholder="Ej. book, reservation, flight..." />
                            </div>
                          ` : html`
                            ${this.modalType === 'group-create' ? html`
                              <div class="form-group">
                                <label class="form-label">Frases o Palabras Iniciales (Opcional):</label>
                                <textarea
                                  class="modal-input modal-textarea"
                                  .value="${this.createInitialPhrasesText}"
                                  @input="${(e) => { this.createInitialPhrasesText = e.target.value; }}"
                                  placeholder="Escribe o pega varias oraciones en inglés (una por línea):&#10;We checked in at the airport.&#10;Where is gate number 5?"
                                  rows="3"
                                ></textarea>
                                <span class="form-help">Se importarán automáticamente al guardar el grupo.</span>
                              </div>
                            ` : ''}
                          `}

                          <div class="modal-actions" style="margin-top: 12px;">
                            <button type="button" class="btn-modal-save" @click="${() => this.handleSaveGroup()}">
                              ${this.modalType === 'group-create' ? 'Crear Grupo' : 'Guardar'}
                            </button>
                            <button type="button" class="btn-modal-cancel" @click="${() => this.closeModal()}">Cancelar</button>
                          </div>
                        `
                      : html`
                          <div class="phrase-add-row">
                            <input
                              type="text"
                              class="modal-input"
                              .value="${this.inputText}"
                              @input="${(e) => { this.inputText = e.target.value; }}"
                              placeholder="${this.editingPhraseId ? 'Editar frase en inglés...' : 'Escribir nueva frase en inglés...'}"
                            />
                            <button type="button" class="btn-modal-save" @click="${() => this.handleSavePhrase()}">
                              ${this.editingPhraseId ? 'Actualizar' : 'Agregar'}
                            </button>
                          </div>

                          <div class="phrases-list-area">
                            ${this.groupPhrases.length === 0
                              ? html`<p class="home-empty">No hay frases guardadas en este grupo.</p>`
                              : html`
                                  <ul class="phrases-ul">
                                    ${this.groupPhrases.map((phrase) => html`
                                      <li class="phrase-item">
                                        <span class="phrase-text">${phrase.original_text}</span>
                                        <div class="phrase-item-actions">
                                          <button type="button" class="icon-action-btn" title="Editar" @click="${() => this.startEditPhrase(phrase)}">${iconEdit}</button>
                                          <button type="button" class="icon-action-btn danger" title="Eliminar" @click="${() => this.handleDeletePhrase(phrase.id)}">${iconTrash}</button>
                                        </div>
                                      </li>
                                    `)}
                                  </ul>
                                `}
                          </div>
                        `}
                  </div>
                </div>
              </div>
            ` : ''}

        <!-- Modal Confirmación Eliminar Grupo -->
        ${this.confirmDeleteGroup ? html`
          <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && (this.confirmDeleteGroup = null)}">
            <div class="home-modal-card" style="max-width: 380px; text-align: center;">
              <div style="margin-bottom: 10px; color: var(--danger-color); display: flex; justify-content: center;">${iconTrash}</div>
              <h3 style="margin: 0 0 6px 0; font-size: 1rem; color: var(--text-color);">¿Eliminar Grupo?</h3>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 16px 0; line-height: 1.4;">
                ¿Estás seguro de eliminar el grupo <strong>"${this.confirmDeleteGroup.name}"</strong> y todas sus frases? Esta acción no se puede deshacer.
              </p>
              <div class="modal-actions" style="justify-content: center; gap: 10px;">
                <button
                  type="button"
                  class="btn-modal-save"
                  style="background: var(--danger-color); border: none; padding: 8px 18px; color: var(--primary-btn-text);"
                  @click="${async () => {
                    const id = this.confirmDeleteGroup.id;
                    this.confirmDeleteGroup = null;
                    await this.controller.deleteGroup(id);
                  }}"
                >
                  Sí, Eliminar
                </button>
                <button type="button" class="btn-modal-cancel" @click="${() => (this.confirmDeleteGroup = null)}">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Modal Confirmación Eliminar Frase -->
        ${this.confirmDeletePhraseId ? html`
          <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && (this.confirmDeletePhraseId = null)}">
            <div class="home-modal-card" style="max-width: 360px; text-align: center;">
              <div style="margin-bottom: 10px; color: var(--danger-color); display: flex; justify-content: center;">${iconTrash}</div>
              <h3 style="margin: 0 0 6px 0; font-size: 0.95rem; color: var(--text-color);">¿Eliminar Frase?</h3>
              <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0 0 16px 0;">
                Esta frase se borrará del grupo actual.
              </p>
              <div class="modal-actions" style="justify-content: center; gap: 10px;">
                <button
                  type="button"
                  class="btn-modal-save"
                  style="background: var(--danger-color); border: none; padding: 7px 16px; color: var(--primary-btn-text);"
                  @click="${() => this.confirmExecuteDeletePhrase()}"
                >
                  Eliminar
                </button>
                <button type="button" class="btn-modal-cancel" @click="${() => (this.confirmDeletePhraseId = null)}">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ` : ''}
      </main>
    `;
  }
}

if (!customElements.get('home-view')) {
  customElements.define('home-view', HomeView);
}
