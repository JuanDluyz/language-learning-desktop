import { LitElement, html } from 'lit';
import { AiSetupController } from './inference-config-view.controller.js';
import {
  iconChevronLeft,
  iconMoon,
  iconSun,
  iconPlay,
  iconClose,
  iconPlus,
  iconFolder,
  iconSettings,
  iconEdit,
  iconTrash
} from '../../common/ui-icons.constants.js';
import { store } from '../../store.js';
import { getSm2DifficultyInfo } from '../../common/srs.constants.js';
import './inference-config.view.css';

const LEVELS = [
  { code: 'A1', label: 'A1 - Principiante' },
  { code: 'A2', label: 'A2 - Básico' },
  { code: 'B1', label: 'B1 - Intermedio' },
  { code: 'B2', label: 'B2 - Intermedio Alto' },
  { code: 'C1', label: 'C1 - Avanzado' },
  { code: 'C2', label: 'C2 - Maestría' }
];

const TONES = [
  { code: 'Casual', label: 'Casual / Conversacional' },
  { code: 'Business', label: 'Corporativo / Profesional' },
  { code: 'Formal', label: 'Formal / Diplomático' },
  { code: 'Colloquial', label: 'Coloquial / Modismos' },
  { code: 'Academic', label: 'Académico / Técnico' }
];

const DEFAULT_TOPICS = [
  { code: 'Everyday Life', label: 'Vida Cotidiana' },
  { code: 'Travel', label: 'Viajes y Cultura' },
  { code: 'Business', label: 'Negocios y Trabajo' },
  { code: 'Technology', label: 'Tecnología' },
  { code: 'Random', label: 'Aleatorio' }
];

const CUSTOM_TOPICS_STORAGE_KEY = 'language_app_custom_topics';

function loadStoredCustomTopics() {
  try {
    const raw = localStorage.getItem(CUSTOM_TOPICS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredCustomTopic(topicObj) {
  const existing = loadStoredCustomTopics();
  if (!existing.some(t => t.code.toLowerCase() === topicObj.code.toLowerCase())) {
    existing.push(topicObj);
    localStorage.setItem(CUSTOM_TOPICS_STORAGE_KEY, JSON.stringify(existing));
  }
}

export class AiSetupView extends LitElement {
  static properties = {
    level: { type: String },
    topic: { type: String },
    tone: { type: String },
    count: { type: Number },
    targetWords: { type: String },
    customPrompt: { type: String },
    integrateVocabulary: { type: Boolean },
    showAdvanced: { type: Boolean },
    showSavePresetModal: { type: Boolean },
    presetNameInput: { type: String },
    customTopics: { type: Array },
    newTopicText: { type: String },
    showManageTopicsModal: { type: Boolean },
    editingTopicId: { type: Number },
    editingTopicText: { type: String },
    showVocabModal: { type: Boolean },
    vocabItems: { type: Array },
    vocabDifficultyFilter: { type: String },
    loadingVocab: { type: Boolean },
    selectedVocabWords: { type: Array }
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.level = 'B1';
    this.topic = 'Everyday Life';
    this.tone = 'Casual';
    this.count = 5;
    this.targetWords = '';
    this.customPrompt = '';
    this.integrateVocabulary = false;
    this.showAdvanced = false;
    this.showSavePresetModal = false;
    this.presetNameInput = '';
    this.customTopics = [];
    this.newTopicText = '';
    this.showManageTopicsModal = false;
    this.editingTopicId = null;
    this.editingTopicText = '';
    this.showVocabModal = false;
    this.vocabItems = [];
    this.vocabDifficultyFilter = 'all';
    this.loadingVocab = false;
    this.selectedVocabWords = [];

    this.controller = new AiSetupController(this);
    this._state = store.getState();
    this._unsubscribe = store.subscribe((state) => {
      this._state = { ...state };
      this.requestUpdate();
    });
  }

  async openVocabPickerModal() {
    this.showVocabModal = true;
    this.selectedVocabWords = this.targetWords ? this.targetWords.split(',').map(s => s.trim()).filter(Boolean) : [];
    await this.loadVocabItems();
  }

  async loadVocabItems() {
    this.loadingVocab = true;
    try {
      if (window.electronAPI?.getVocabularyPhrases) {
        this.vocabItems = await window.electronAPI.getVocabularyPhrases({ difficulty: this.vocabDifficultyFilter });
      } else {
        this.vocabItems = [];
      }
    } catch (err) {
      console.error('Error cargando vocabulario:', err);
      this.vocabItems = [];
    } finally {
      this.loadingVocab = false;
    }
  }

  async changeVocabFilter(diff) {
    this.vocabDifficultyFilter = diff;
    await this.loadVocabItems();
  }

  toggleVocabWordSelection(word) {
    if (this.selectedVocabWords.includes(word)) {
      this.selectedVocabWords = this.selectedVocabWords.filter(w => w !== word);
    } else {
      this.selectedVocabWords = [...this.selectedVocabWords, word];
    }
  }

  addHardVocabWords() {
    const hardWords = this.vocabItems.map(item => item.original_text);
    const combined = new Set([...this.selectedVocabWords, ...hardWords]);
    this.selectedVocabWords = Array.from(combined);
  }

  confirmVocabSelection() {
    this.targetWords = this.selectedVocabWords.join(', ');
    this.showVocabModal = false;
  }

  async firstUpdated() {
    await this.loadTopicsFromDb();
  }

  async loadTopicsFromDb() {
    if (window.electronAPI?.getTopics) {
      try {
        const topics = await window.electronAPI.getTopics();
        if (Array.isArray(topics) && topics.length > 0) {
          this.customTopics = topics.map(t => ({
            id: t.id,
            code: t.code,
            label: t.label_es || t.label_en || t.code,
            isCustom: t.is_custom === 1
          }));
        }
      } catch {
        // Fallback to DEFAULT_TOPICS
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) this._unsubscribe();
  }

  get allTopics() {
    if (this.customTopics && this.customTopics.length > 0) {
      return this.customTopics;
    }
    return DEFAULT_TOPICS;
  }

  async handleAddCustomTopic() {
    const text = this.newTopicText.trim();
    if (!text) return;

    if (window.electronAPI?.createTopic) {
      const updatedTopics = await window.electronAPI.createTopic({ code: text, label_es: text, label_en: text });
      if (Array.isArray(updatedTopics)) {
        this.customTopics = updatedTopics.map(t => ({
          id: t.id,
          code: t.code,
          label: t.label_es || t.label_en || t.code,
          isCustom: t.is_custom === 1
        }));
      }
    } else {
      const topicObj = { code: text, label: text };
      saveStoredCustomTopic(topicObj);
      this.customTopics = [...DEFAULT_TOPICS, ...loadStoredCustomTopics()];
    }

    this.topic = text;
    this.newTopicText = '';
    this.requestUpdate();
  }

  openManageTopicsModal() {
    this.editingTopicId = null;
    this.editingTopicText = '';
    this.showManageTopicsModal = true;
  }

  closeManageTopicsModal() {
    this.showManageTopicsModal = false;
    this.editingTopicId = null;
    this.editingTopicText = '';
  }

  startEditTopic(item) {
    this.editingTopicId = item.id || item.code;
    this.editingTopicText = item.label || item.code;
  }

  cancelEditTopic() {
    this.editingTopicId = null;
    this.editingTopicText = '';
  }

  async saveEditTopic(item) {
    const newText = this.editingTopicText.trim();
    if (!newText) return;

    if (window.electronAPI?.updateTopic && item.id) {
      const updatedTopics = await window.electronAPI.updateTopic({
        id: item.id,
        code: newText,
        label_es: newText,
        label_en: newText
      });
      if (Array.isArray(updatedTopics)) {
        this.customTopics = updatedTopics.map(t => ({
          id: t.id,
          code: t.code,
          label: t.label_es || t.label_en || t.code,
          isCustom: t.is_custom === 1
        }));
      }
      if (this.topic === item.code) {
        this.topic = newText;
      }
    }
    this.cancelEditTopic();
  }

  async handleDeleteTopic(item) {
    if (window.electronAPI?.deleteTopic) {
      const targetIdOrCode = item.id || item.code;
      const updatedTopics = await window.electronAPI.deleteTopic(targetIdOrCode);
      if (Array.isArray(updatedTopics)) {
        this.customTopics = updatedTopics.map(t => ({
          id: t.id,
          code: t.code,
          label: t.label_es || t.label_en || t.code,
          isCustom: t.is_custom === 1
        }));
      }
      if (this.topic === item.code) {
        this.topic = this.allTopics[0]?.code || 'Everyday Life';
      }
    }
  }

  openSavePresetModal() {
    this.presetNameInput = `${this.topic} (${this.level})`;
    this.showSavePresetModal = true;
  }

  closeSavePresetModal() {
    this.showSavePresetModal = false;
    this.presetNameInput = '';
  }

  async handleSavePreset() {
    const name = this.presetNameInput.trim() || `${this.topic} (${this.level})`;
    const dynamicConfig = {
      level: this.level,
      topic: this.topic,
      tone: this.tone,
      count: Number(this.count),
      target_words: this.targetWords.trim(),
      custom_prompt: this.customPrompt.trim()
    };

    try {
      if (window.electronAPI?.createGroup) {
        await window.electronAPI.createGroup(name, 'dynamic_preset', dynamicConfig);
        alert(`¡Grupo Dinámico "${name}" guardado exitosamente!`);
      }
    } catch (err) {
      console.error('Error al guardar preset:', err);
      alert('Ocurrió un error al guardar el preset.');
    } finally {
      this.closeSavePresetModal();
    }
  }

  render() {
    const state = this._state || store.getState();

    return html`
      <div class="ai-setup-screen">
        <!-- Header Principal -->
        <header class="ai-setup-header">
          <div class="ai-setup-header-left">
            <button type="button" class="back-circle-btn" @click="${() => this.controller.cancel()}" title="Volver al Inicio">
              ${iconChevronLeft}
            </button>
            <h1 class="ai-setup-header-title">Configurar Sesión con IA</h1>
          </div>
          <div class="ai-setup-header-right">
            <button type="button" class="utility-button" title="Cambiar tema" @click="${() => this.controller.toggleTheme()}">
              ${state.darkMode ? iconMoon : iconSun}
            </button>
          </div>
        </header>

        <!-- Contenido Central Scroll -->
        <div class="ai-setup-content-scroll">
          <main class="ai-setup-card">
            ${!state.isLlmAvailable ? html`
              <div style="background: var(--danger-bg); border: 1px solid var(--danger-color); color: var(--danger-color); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.88rem; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: var(--danger-color);">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <div>
                    <strong style="color: var(--danger-color); font-weight: 600;">No hay ningún modelo LLM seleccionado</strong>
                    <p style="margin: 2px 0 0 0; opacity: 0.85; font-size: 0.8rem;">Debes seleccionar un modelo .gguf en Configuración antes de generar frases con IA.</p>
                  </div>
                </div>
                <button type="button" class="btn-primary-purple" style="background: var(--primary-color); color: var(--primary-btn-text); border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600; white-space: nowrap;" @click="${() => this.controller.goToSettings()}">Ir a Configuración</button>
              </div>
            ` : ''}
            <form class="form_layout" @submit="${(e) => e.preventDefault()}">
              <!-- SECCIÓN 1: SELECCIÓN DE NIVEL (MCER Dropdown) -->
              <div class="form-field">
                <label class="section-label" for="level-select">Nivel de Dificultad (MCER):</label>
                <select
                  id="level-select"
                  class="custom-select"
                  .value="${this.level}"
                  @change="${(e) => { this.level = e.target.value; }}"
                >
                  ${LEVELS.map((item) => html`
                    <option value="${item.code}">${item.label}</option>
                  `)}
                </select>
              </div>

              <!-- SECCIÓN 1B: SELECCIÓN DE TONO / REGISTRO -->
              <div class="form-field">
                <label class="section-label" for="tone-select">Tono / Registro Lingüístico:</label>
                <select
                  id="tone-select"
                  class="custom-select"
                  .value="${this.tone}"
                  @change="${(e) => { this.tone = e.target.value; }}"
                >
                  ${TONES.map((item) => html`
                    <option value="${item.code}">${item.label}</option>
                  `)}
                </select>
              </div>

              <!-- SECCIÓN 2: SELECCIÓN DE TEMA (Dropdown, Tema Personalizado y Gestión) -->
              <div class="topic-row-container">
                <div class="form-field topic-select-col">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <label class="section-label" for="topic-select" style="margin: 0;">Tema Principal:</label>
                    <button
                      type="button"
                      class="btn-manage-topics"
                      @click="${() => this.openManageTopicsModal()}"
                      title="Gestionar, editar o eliminar temas"
                    >
                      ${iconSettings} <span>Gestionar Temas</span>
                    </button>
                  </div>
                  <select
                    id="topic-select"
                    class="custom-select"
                    .value="${this.topic}"
                    @change="${(e) => { this.topic = e.target.value; }}"
                  >
                    ${this.allTopics.map((item) => html`
                      <option value="${item.code}">${item.label}</option>
                    `)}
                  </select>
                </div>

                <div class="topic-vertical-divider"></div>

                <div class="form-field custom-topic-add-row">
                  <label class="section-label" for="custom-topic-input">Nuevo Tema:</label>
                  <div class="custom-input-wrapper">
                    <input
                      id="custom-topic-input"
                      type="text"
                      class="form-control"
                      placeholder="Tema personalizado..."
                      .value="${this.newTopicText}"
                      @input="${(e) => { this.newTopicText = e.target.value; }}"
                      @keydown="${(e) => { if (e.key === 'Enter') this.handleAddCustomTopic(); }}"
                    />
                    <button
                      type="button"
                      class="btn-round-add"
                      @click="${() => this.handleAddCustomTopic()}"
                      title="Guardar tema personalizado"
                    >
                      ${iconPlus}
                    </button>
                  </div>
                </div>
              </div>

              <!-- SECCIÓN 3: CANTIDAD DE FRASES (Compact Stepper) -->
              <div class="form-field">
                <div class="count-stepper-field">
                  <label class="section-label" style="margin-bottom: 0;">Cantidad de frases:</label>
                  <div class="compact-stepper">
                    <button
                      type="button"
                      class="stepper-btn"
                      @click="${() => { this.count = Math.max(1, this.count - 1); }}"
                      ?disabled="${this.count <= 1}"
                    >-</button>
                    <span class="stepper-count font-mono">${this.count} frases</span>
                    <button
                      type="button"
                      class="stepper-btn"
                      @click="${() => { this.count = Math.min(20, this.count + 1); }}"
                      ?disabled="${this.count >= 20}"
                    >+</button>
                  </div>
                </div>
              </div>

              <!-- DESPLIEGUE CONFIGURACIÓN AVANZADA (ACORDEÓN) -->
              <button
                type="button"
                class="btn-toggle-advanced ${this.showAdvanced ? 'open' : ''}"
                @click="${() => { this.showAdvanced = !this.showAdvanced; }}"
              >
                <span>${this.showAdvanced ? 'Ocultar Filtros Avanzados' : 'Filtros y Prompt Personalizado'}</span>
                <svg class="arrow-icon ${this.showAdvanced ? 'open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              ${this.showAdvanced ? html`
                <div class="advanced-section">
                  <!-- TOGGLE INTEGRACIÓN DE VOCABULARIO SM-2 -->
                  <div class="form-field" style="margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px;">
                      <div>
                        <span style="font-size: 0.84rem; font-weight: 600; color: var(--text-color); display: block;">Integrar Vocabulario de mis Mazos (SM-2)</span>
                        <span style="font-size: 0.74rem; color: var(--text-muted); display: block; margin-top: 2px;">Inyecta palabras pendientes de repaso de tus mazos para reforzar la retención espaciada.</span>
                      </div>
                      <label style="position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; margin: 0; flex-shrink: 0;">
                        <input
                          type="checkbox"
                          style="opacity: 0; width: 0; height: 0;"
                          .checked="${this.integrateVocabulary}"
                          @change="${(e) => { this.integrateVocabulary = e.target.checked; }}"
                        />
                        <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.integrateVocabulary ? 'var(--primary-color)' : 'var(--border-color)'}; transition: .2s; border-radius: 22px;">
                          <span style="position: absolute; content: ''; height: 16px; width: 16px; left: ${this.integrateVocabulary ? '21px' : '3px'}; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%;"></span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div class="form-field">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                      <label for="target_words_input" class="section-label-sub" style="margin: 0;">Vocabulario / Palabras clave obligatorias:</label>
                      <button
                        type="button"
                        class="vocab-picker-button"
                        @click="${() => this.openVocabPickerModal()}"
                      >
                        ${iconFolder} <span>Elegir del vocabulario</span>
                      </button>
                    </div>
                    <input
                      id="target_words_input"
                      type="text"
                      class="form-control"
                      placeholder="Ej. achieved, managed, led, successful"
                      .value="${this.targetWords}"
                      @input="${(e) => { this.targetWords = e.target.value; }}"
                    />
                  </div>

                  <div class="form-field">
                    <label for="custom_prompt_input" class="section-label-sub">Instrucciones Especiales para la IA (Prompt):</label>
                    <textarea
                      id="custom_prompt_input"
                      class="form-control"
                      style="height: 68px; resize: vertical;"
                      placeholder="Ej. Generar oraciones formales en pasado simple para ambiente laboral..."
                      .value="${this.customPrompt}"
                      @input="${(e) => { this.customPrompt = e.target.value; }}"
                    ></textarea>
                  </div>
                </div>
              ` : ''}

              <!-- BOTONERA DE ACCIÓN -->
              <div class="setup-actions-row">
                <button type="button" class="PrimaryButton" style="height: 36px; padding: 0 20px; font-size: 0.85rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" @click="${() => this.controller.startSession()}">
                  ${iconPlay} Comenzar Práctica
                </button>
                <button type="button" class="btn-save-preset" style="height: 36px; padding: 0 16px; font-size: 0.85rem; border-radius: 6px;" @click="${() => this.openSavePresetModal()}">
                  Guardar como Grupo Dinámico
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>

      <!-- Modal para Nombre de Preset -->
      ${this.showSavePresetModal ? html`
        <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && this.closeSavePresetModal()}">
          <div class="home-modal-card">
            <header class="modal-header">
              <h3>Guardar Preset Dinámico IA</h3>
              <button type="button" class="close-modal-btn" @click="${() => this.closeSavePresetModal()}">${iconClose}</button>
            </header>

            <div class="modal-body">
              <label style="font-size: 0.78rem; color: var(--text-muted); display: block;">Nombre del Grupo Dinámico:</label>
              <input
                type="text"
                class="modal-input"
                .value="${this.presetNameInput}"
                @input="${(e) => { this.presetNameInput = e.target.value; }}"
                @keydown="${(e) => { if (e.key === 'Enter') this.handleSavePreset(); }}"
                placeholder="Ej. Pasado Simple (B1)..."
                autoFocus
              />
              
              <div style="font-size: 0.78rem; color: var(--text-muted); background: var(--card-soft-bg, #1a1a1a); padding: 10px; border-radius: 6px; line-height: 1.4;">
                Se guardará esta plantilla con Nivel: <strong>${this.level}</strong>, Tema: <strong>${this.topic}</strong> y <strong>${this.count} frases</strong> para lanzarla directamente desde el Inicio.
              </div>

              <div class="modal-actions" style="margin-top: 14px;">
                <button type="button" class="btn-modal-save" @click="${() => this.handleSavePreset()}">Guardar Grupo Dinámico</button>
                <button type="button" class="btn-modal-cancel" @click="${() => this.closeSavePresetModal()}">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Modal para Escoger Palabras (SM-2) -->
      ${this.showVocabModal ? html`
        <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && (this.showVocabModal = false)}">
          <div class="home-modal-card" style="max-width: 520px; max-height: 85vh; display: flex; flex-direction: column;">
            <header class="modal-header">
              <h3>Elegir palabras de vocabulario</h3>
              <button type="button" class="close-modal-btn" @click="${() => (this.showVocabModal = false)}">${iconClose}</button>
            </header>

            <div class="modal-body" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
              <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0;">
                Selecciona palabras de tus grupos de vocabulario para que la IA las incorpore obligatoriamente en esta práctica.
              </p>

              <!-- Filtros SM-2 -->
              <div class="vocab-filter-wrap">
                <span class="vocab-filter-label">Dificultad SM-2</span>
                <div class="vocab-filter-controls">
                  <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDifficultyFilter === 'all'}" @click="${() => this.changeVocabFilter('all')}">Todas</button>
                  <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDifficultyFilter === 'hard'}" @click="${() => this.changeVocabFilter('hard')}"><span class="vocab-difficulty-mark hard"></span>Difíciles</button>
                  <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDifficultyFilter === 'medium'}" @click="${() => this.changeVocabFilter('medium')}"><span class="vocab-difficulty-mark medium"></span>Medias</button>
                  <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDifficultyFilter === 'easy'}" @click="${() => this.changeVocabFilter('easy')}"><span class="vocab-difficulty-mark easy"></span>Fáciles</button>
                </div>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Seleccionadas: <strong style="color: var(--success-color);">${this.selectedVocabWords.length}</strong></span>
                <button type="button" class="btn-small vocab-add-filtered" @click="${() => this.addHardVocabWords()}">
                  ${iconPlus}<span>Añadir todas las filtradas</span>
                </button>
              </div>

              <!-- Lista de palabras -->
              <div style="max-height: 240px; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px;">
                ${this.loadingVocab ? html`
                  <span style="font-size: 0.78rem; color: var(--text-muted);">Cargando vocabulario...</span>
                ` : this.vocabItems.length === 0 ? html`
                  <span style="font-size: 0.78rem; color: var(--text-muted);">No hay palabras de vocabulario guardadas en tus grupos. Crea un grupo de tipo "Vocabulario" en la sección Gestión de Base de Datos.</span>
                ` : this.vocabItems.map(item => {
                  const isSelected = this.selectedVocabWords.includes(item.original_text);
                  const diffInfo = getSm2DifficultyInfo(item);
                  return html`
                    <button
                      type="button"
                      class="vocab-word-chip ${isSelected ? 'selected' : ''}"
                      aria-pressed="${isSelected}"
                      @click="${() => this.toggleVocabWordSelection(item.original_text)}"
                    >
                      <span class="vocab-selection-mark" aria-hidden="true"></span>
                      <span>${item.original_text}</span>
                      <span class="vocab-difficulty-mark ${diffInfo.code}" title="Dificultad SM-2: ${diffInfo.label}"></span>
                    </button>
                  `;
                })}
              </div>

              <div class="modal-actions" style="margin-top: 10px;">
                <button type="button" class="btn-modal-save" @click="${() => this.confirmVocabSelection()}">Usar Seleccionadas (${this.selectedVocabWords.length})</button>
                <button type="button" class="btn-modal-cancel" @click="${() => (this.showVocabModal = false)}">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Modal de Gestión de Temas (Editar / Eliminar) -->
      ${this.showManageTopicsModal ? html`
        <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && this.closeManageTopicsModal()}">
          <div class="home-modal-card" style="max-width: 480px; max-height: 85vh; display: flex; flex-direction: column;">
            <header class="modal-header">
              <h3>Gestión de Temas de Estudio</h3>
              <button type="button" class="close-modal-btn" @click="${() => this.closeManageTopicsModal()}">${iconClose}</button>
            </header>

            <div class="modal-body" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
              <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0;">
                Administra los temas disponibles para sesiones adaptativas. Puedes editar el nombre o eliminar los temas personalizados creados.
              </p>

              <div class="topics-manage-list">
                ${this.allTopics.map((item) => {
                  const isEditing = this.editingTopicId === (item.id || item.code);
                  return html`
                    <div class="topic-manage-item ${item.isCustom ? 'custom' : 'system'}">
                      <div class="topic-item-main">
                        ${isEditing ? html`
                          <div style="display: flex; gap: 6px; width: 100%; align-items: center;">
                            <input
                              type="text"
                              class="modal-input"
                              style="flex: 1; padding: 4px 8px; font-size: 0.8rem;"
                              .value="${this.editingTopicText}"
                              @input="${(e) => { this.editingTopicText = e.target.value; }}"
                              @keydown="${(e) => {
                                if (e.key === 'Enter') this.saveEditTopic(item);
                                if (e.key === 'Escape') this.cancelEditTopic();
                              }}"
                              autoFocus
                            />
                            <button
                              type="button"
                              class="topic-action-btn primary"
                              @click="${() => this.saveEditTopic(item)}"
                              title="Guardar cambios"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              class="topic-action-btn"
                              @click="${() => this.cancelEditTopic()}"
                              title="Cancelar edición"
                            >
                              Cancelar
                            </button>
                          </div>
                        ` : html`
                          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                              <span class="topic-item-name">${item.label}</span>
                              <span class="topic-item-badge ${item.isCustom ? 'badge-custom' : 'badge-system'}">
                                ${item.isCustom ? 'Personalizado' : 'Sistema'}
                              </span>
                            </div>
                            <div class="topic-item-actions">
                              ${item.isCustom ? html`
                                <button
                                  type="button"
                                  class="icon-action-btn"
                                  title="Editar nombre del tema"
                                  @click="${() => this.startEditTopic(item)}"
                                >
                                  ${iconEdit}
                                </button>
                                <button
                                  type="button"
                                  class="icon-action-btn danger"
                                  title="Eliminar tema"
                                  @click="${() => this.handleDeleteTopic(item)}"
                                >
                                  ${iconTrash}
                                </button>
                              ` : html`
                                <span style="font-size: 0.7rem; color: var(--text-muted); font-style: italic;">Predeterminado</span>
                              `}
                            </div>
                          </div>
                        `}
                      </div>
                    </div>
                  `;
                })}
              </div>

              <div class="modal-actions" style="margin-top: 10px;">
                <button type="button" class="btn-modal-cancel" @click="${() => this.closeManageTopicsModal()}">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }
}

if (!customElements.get('ai-setup-view')) {
  customElements.define('ai-setup-view', AiSetupView);
}