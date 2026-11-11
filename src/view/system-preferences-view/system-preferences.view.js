import { LitElement, html } from 'lit';
import { PROMPT_GROUPS, PROMPT_METADATA, DEFAULT_PROMPTS, getEffectivePrompt } from '../../common/prompt-templates.constants.js';
import { fetchAppConfig, saveAppConfig, fetchAppStatus } from '../../service/system-preferences-service/system-preferences.service.js';
import { EDGE_NEURAL_VOICES } from '../../common/tts-voices.constants.js';
import { CLOUD_PROVIDERS } from '../../common/cloud-llm.adapter.js';
import { store } from '../../store.js';
import { renderGeneralTab } from './system-preferences-general.template.js';
import { renderAudioTab } from './system-preferences-audio.template.js';
import { renderModelTab, renderModelModals } from './system-preferences-model.template.js';
import { renderPromptsTab } from './system-preferences-prompts.template.js';
import './system-preferences.view.css';

export class SettingsView extends LitElement {
  static properties = {
    activeTab: { type: String }, // 'general', 'model', 'prompts'
    config: { type: Object },
    availableModels: { type: Array },
    selectedModel: { type: String },
    appStatus: { type: Object },
    selectedCategory: { type: String }, // 'all', 'generation', 'evaluation', 'explanation'
    selectedPromptKey: { type: String },
    promptText: { type: String },
    statusMessage: { type: String },
    modelError: { type: String },
    copyProgress: { type: Number },
    isCopying: { type: Boolean },
    isDraggingOver: { type: Boolean },
    showAddModelModal: { type: Boolean },
    isImportingModel: { type: Boolean },
    importProgress: { type: Number },
    importFileName: { type: String },
    importCopiedFormatted: { type: String },
    importTotalFormatted: { type: String },
    isTestingVoice: { type: Boolean },
    modelsDetails: { type: Array },
    isValidatingKey: { type: Boolean },
    keyValidationResult: { type: Object },
    showApiKey: { type: Boolean },
    isChangingModel: { type: Boolean },
    hasUnsavedChanges: { type: Boolean },
    isSaving: { type: Boolean },
    saveSuccess: { type: Boolean },
    saveError: { type: String }
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.activeTab = 'general';
    this.config = JSON.parse(JSON.stringify(store.getState().config || {}));
    this.savedConfig = JSON.parse(JSON.stringify(this.config));
    this.hasUnsavedChanges = false;
    this.isSaving = false;
    this.saveSuccess = false;
    this.saveError = '';
    this.availableModels = [];
    this.selectedModel = '';
    this.appStatus = null;
    this.selectedCategory = 'all';
    this.selectedPromptKey = 'gen_auditory_system';
    this.promptText = '';
    this.statusMessage = '';
    this.modelError = '';
    this.copyProgress = 0;
    this.isCopying = false;
    this.isDraggingOver = false;
    this.showAddModelModal = false;
    this.isImportingModel = false;
    this.importProgress = 0;
    this.importFileName = '';
    this.importCopiedFormatted = '';
    this.importTotalFormatted = '';
    this.isTestingVoice = false;
    this.modelsDetails = [];
    this.dbPrompts = [];
    this.isValidatingKey = false;
    this.keyValidationResult = null;
    this.showApiKey = false;

    this.handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (this.activeTab === 'prompts') {
          e.preventDefault();
          this.saveCustomPrompt();
        } else {
          e.preventDefault();
          this.saveAllSettings();
        }
      }
    };
  }

  async firstUpdated() {
    try {
      const freshConfig = await fetchAppConfig();
      if (freshConfig && Object.keys(freshConfig).length > 0) {
        this.config = JSON.parse(JSON.stringify(freshConfig));
      }
    } catch (e) {
      console.warn('No se pudo refrescar la configuracion inicial:', e);
    }
    this.savedConfig = JSON.parse(JSON.stringify(this.config));
    this.hasUnsavedChanges = false;

    await this.loadModelsAndStatus();
    await this.loadDbPrompts();
    this.updatePromptEditor();
    window.addEventListener('keydown', this.handleKeyDown);

    if (window.electronAPI?.onModelProgress) {
      this._unsubscribeModelProgress = window.electronAPI.onModelProgress((data) => {
        if (data) {
          this.importProgress = data.percent || 0;
          if (data.fileName) this.importFileName = data.fileName;
          if (data.copiedFormatted) this.importCopiedFormatted = data.copiedFormatted;
          if (data.totalFormatted) this.importTotalFormatted = data.totalFormatted;
          this.requestUpdate();
        }
      });
    }
  }

  async loadDbPrompts() {
    if (window.electronAPI?.getPrompts) {
      try {
        this.dbPrompts = await window.electronAPI.getPrompts();
      } catch {
        this.dbPrompts = [];
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this._unsubscribeModelProgress) {
      this._unsubscribeModelProgress();
    }
    if (this._testAudio) {
      try {
        this._testAudio.pause();
        this._testAudio.currentTime = 0;
        this._testAudio.removeAttribute('src');
        this._testAudio.load();
      } catch {}
      this._testAudio = null;
    }
  }

  async loadModelsAndStatus() {
    try {
      const status = await fetchAppStatus();
      this.appStatus = status;
      this.availableModels = status?.availableModels || [];
      this.modelsDetails = status?.modelsDetails || [];
      this.selectedModel = status?.selectedModel || '';
      if (!this.hasUnsavedChanges) {
        this.config = { ...this.config, selected_model: this.selectedModel };
        this.savedConfig = JSON.parse(JSON.stringify(this.config));
      }
    } catch {
      this.availableModels = [];
      this.modelsDetails = [];
      this.selectedModel = '';
      if (!this.hasUnsavedChanges) {
        this.config = { ...this.config, selected_model: '' };
        this.savedConfig = JSON.parse(JSON.stringify(this.config));
      }
    }
  }

  checkIfChanged() {
    const fieldsToTrack = [
      'level',
      'ui_language',
      'review_language',
      'auto_review',
      'audio_device',
      'tts_engine',
      'tts_voice',
      'audio_accent',
      'audio_speed',
      'llm_execution_mode',
      'cloud_provider',
      'cloud_model',
      'cloud_api_key',
      'selected_model',
      'use_gpu'
    ];

    const current = this.config || {};
    const saved = this.savedConfig || {};

    const hasDiff = fieldsToTrack.some((f) => {
      const v1 = current[f] === undefined ? null : current[f];
      const v2 = saved[f] === undefined ? null : saved[f];
      return v1 !== v2;
    });

    this.hasUnsavedChanges = hasDiff;
  }

  updatePromptEditor() {
    const custom = this.config.custom_prompts || {};
    this.promptText = getEffectivePrompt(this.selectedPromptKey, custom);
  }

  handleTabChange(tab) {
    this.activeTab = tab;
    this.requestUpdate();
  }

  closeModal() {
    if (this.hasUnsavedChanges) {
      this.config = JSON.parse(JSON.stringify(this.savedConfig));
      this.hasUnsavedChanges = false;
    }
    const overlay = this.querySelector('.settings-modal-overlay');
    if (overlay) {
      overlay.classList.add('closing');
      setTimeout(() => {
        this.dispatchEvent(new CustomEvent('go-home', { bubbles: true, composed: true }));
      }, 180);
    } else {
      this.dispatchEvent(new CustomEvent('go-home', { bubbles: true, composed: true }));
    }
  }

  handleCategoryChange(catId) {
    this.selectedCategory = catId;
    const filtered = this.getFilteredPrompts();
    if (filtered.length > 0 && !filtered.some((p) => p.key === this.selectedPromptKey)) {
      this.selectedPromptKey = filtered[0].key;
      this.updatePromptEditor();
    }
  }

  getFilteredPrompts() {
    if (this.selectedCategory === 'all') return PROMPT_METADATA;
    return PROMPT_METADATA.filter((p) => p.group_id === this.selectedCategory);
  }

  handlePromptSelect(key) {
    this.selectedPromptKey = key;
    this.updatePromptEditor();
  }

  handlePromptTextChange(event) {
    this.promptText = event.target.value;
    this.requestUpdate();
  }

  handleEditorKeyDown(event) {
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      target.value = target.value.substring(0, start) + '    ' + target.value.substring(end);
      target.selectionStart = target.selectionEnd = start + 4;
      this.promptText = target.value;
      this.requestUpdate();
    }
  }

  async testVoice() {
    try {
      this.isTestingVoice = true;
      this.requestUpdate();
      const res = await window.electronAPI.synthesizeSpeech(
        'Hello! This is a test of the selected text to speech voice.',
        null,
        null,
        true,
        {
          engine: this.config.tts_engine,
          voice: this.config.tts_voice,
          accent: this.config.audio_accent,
          speed: this.config.audio_speed
        }
      );
      if (res?.audioUrl && this.isConnected) {
        if (this._testAudio) {
          try {
            this._testAudio.pause();
            this._testAudio.removeAttribute('src');
          } catch {}
        }
        const audio = new Audio(res.audioUrl);
        this._testAudio = audio;
        audio.addEventListener('ended', () => {
          this._testAudio = null;
        }, { once: true });
        await audio.play();
      }
    } catch (err) {
      console.error('Error al probar voz:', err);
    } finally {
      this.isTestingVoice = false;
      this.requestUpdate();
    }
  }

  updateConfigField(field, value) {
    this.config = { ...this.config, [field]: value };
    this.checkIfChanged();
    this.requestUpdate();
  }

  handleCloudProviderChange(providerId) {
    const provider = CLOUD_PROVIDERS[providerId] || CLOUD_PROVIDERS.openai;
    const defaultModel = provider.defaultModel;
    this.config = {
      ...this.config,
      cloud_provider: providerId,
      cloud_model: defaultModel
    };
    this.keyValidationResult = null;
    this.checkIfChanged();
    this.requestUpdate();
  }

  async validateCloudApiKey() {
    const provider = this.config.cloud_provider || 'openai';
    const apiKey = (this.config.cloud_api_key || '').trim();
    const model = this.config.cloud_model || CLOUD_PROVIDERS[provider]?.defaultModel || 'gpt-4o-mini';

    if (!apiKey) {
      this.keyValidationResult = { valid: false, error: 'Por favor ingresa una API Key.' };
      this.requestUpdate();
      return;
    }

    try {
      this.isValidatingKey = true;
      this.keyValidationResult = null;
      this.requestUpdate();

      const result = await window.electronAPI.validateApiKey(provider, apiKey, model);
      this.keyValidationResult = result;
    } catch (err) {
      this.keyValidationResult = { valid: false, error: err.message };
    } finally {
      this.isValidatingKey = false;
      this.requestUpdate();
    }
  }

  async saveAllSettings() {
    if (this.isSaving) return;
    try {
      this.isSaving = true;
      this.saveError = '';
      this.requestUpdate();

      // 1. Sincronizar nivel de usuario si cambió
      if (this.config.level !== this.savedConfig?.level && window.electronAPI?.updateLevelScore) {
        await window.electronAPI.updateLevelScore(0).catch(() => {});
      }

      // 2. Si cambió el modelo local y estamos en modo local, cargar o descargar
      const isLocal = (this.config.llm_execution_mode || 'local') === 'local';
      const prevModel = this.savedConfig?.selected_model || '';
      const newModel = this.config.selected_model || '';

      if (isLocal && newModel !== prevModel) {
        if (!newModel) {
          if (window.electronAPI?.unloadModel) {
            await window.electronAPI.unloadModel();
          }
          this.selectedModel = '';
        } else if (window.electronAPI?.changeModel) {
          this.isChangingModel = true;
          this.statusMessage = 'Inicializando y cargando modelo en memoria...';
          this.requestUpdate();
          const res = await window.electronAPI.changeModel(newModel);
          if (res?.success) {
            this.selectedModel = res.selectedModel;
            this.availableModels = res.availableModels || [];
            this.appStatus = res;
            store.setState({ isLlmAvailable: true, status: res });
          } else if (res?.error) {
            this.modelError = `Error al inicializar el modelo: ${res.error}`;
          }
          this.isChangingModel = false;
        }
      }

      // 3. Persistir en SQLite y Store global
      await saveAppConfig(this.config);
      await this.loadModelsAndStatus();

      // 4. Confirmación de guardado y animación
      this.savedConfig = JSON.parse(JSON.stringify(this.config));
      this.hasUnsavedChanges = false;
      this.saveSuccess = true;
      this.requestUpdate();

      setTimeout(() => {
        this.saveSuccess = false;
        this.requestUpdate();
      }, 2200);
    } catch (err) {
      console.error('Error al guardar ajustes:', err);
      this.saveError = err.message || 'Error al persistir la configuracion';
    } finally {
      this.isSaving = false;
      this.isChangingModel = false;
      this.requestUpdate();
    }
  }

  openAddModelModal() {
    this.showAddModelModal = true;
    this.modelError = '';
    this.importProgress = 0;
    this.importFileName = '';
    this.isImportingModel = false;
    this.requestUpdate();
  }

  async cancelModelImport() {
    try {
      if (window.electronAPI?.cancelModelImport) {
        await window.electronAPI.cancelModelImport();
      }
    } catch (err) {
      console.warn('Error al cancelar importación:', err);
    } finally {
      this.isImportingModel = false;
      this.isChangingModel = false;
      this.importProgress = 0;
      this.showAddModelModal = false;
      this.modelError = 'Operación cancelada por el usuario.';
      await this.loadModelsAndStatus();
    }
  }

  async closeAddModelModal() {
    if (this.isImportingModel) {
      await this.cancelModelImport();
      return;
    }
    this.showAddModelModal = false;
    this.modelError = '';
    this.requestUpdate();
  }

  handleModelSelect(modelName) {
    if (!modelName) {
      this.modelError = '';
      this.selectedModel = '';
      this.updateConfigField('selected_model', '');
      return;
    }

    const detail = (this.modelsDetails || []).find((d) => d.fileName === modelName);
    if (detail && !detail.compatible) {
      this.modelError = detail.reason || 'Este modelo es incompatible con el motor local.';
      this.requestUpdate();
      return;
    }

    this.modelError = '';
    this.selectedModel = modelName;
    this.updateConfigField('selected_model', modelName);
    this.updateConfigField('llm_execution_mode', 'local');
  }

  async handleImportModel() {
    try {
      this.modelError = '';
      if (!window.electronAPI?.pickModelFile) return;

      this.isImportingModel = true;
      this.importProgress = 0;
      this.requestUpdate();

      const res = await window.electronAPI.pickModelFile();

      if (res?.canceled) {
        this.isImportingModel = false;
        this.requestUpdate();
        return;
      }

      if (res?.success) {
        this.availableModels = res.availableModels || [];
        this.selectedModel = res.selectedModel || res.fileName;
        this.updateConfigField('selected_model', this.selectedModel);
        this.updateConfigField('llm_execution_mode', 'local');
        this.appStatus = res;
        this.isImportingModel = false;
        this.showAddModelModal = false;
        store.setState({ isLlmAvailable: true, status: res });
        this.showToast(`Modelo ${res.fileName} importado e inicializado en memoria.`);
      } else if (res?.error) {
        this.isImportingModel = false;
        this.modelError = `Error al importar modelo: ${res.error}`;
        this.requestUpdate();
      }
    } catch (err) {
      this.isImportingModel = false;
      this.modelError = `Error al importar modelo: ${err.message || 'Archivo no válido o corrupto.'}`;
      this.requestUpdate();
    }
  }

  async handleDropModelFile(event) {
    event.preventDefault();
    this.isDraggingOver = false;
    this.requestUpdate();

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const filePath = file.path;
    if (!filePath || !filePath.toLowerCase().endsWith('.gguf')) {
      this.modelError = 'Por favor arrastra un archivo válido en formato .gguf';
      return;
    }

    try {
      this.modelError = '';
      this.isImportingModel = true;
      this.importProgress = 0;
      this.importFileName = file.name;
      this.requestUpdate();

      const res = await window.electronAPI.addModelFile(filePath);

      if (res?.canceled) {
        this.isImportingModel = false;
        this.requestUpdate();
        return;
      }

      if (res?.success) {
        this.availableModels = res.availableModels || [];
        this.selectedModel = res.selectedModel || res.fileName;
        this.updateConfigField('selected_model', this.selectedModel);
        this.updateConfigField('llm_execution_mode', 'local');
        this.appStatus = res;
        this.isImportingModel = false;
        this.showAddModelModal = false;
        store.setState({ isLlmAvailable: true, status: res });
        this.showToast(`Modelo ${res.fileName} agregado e inicializado en memoria.`);
      } else if (res?.error) {
        this.isImportingModel = false;
        this.modelError = `Error al procesar modelo: ${res.error}`;
        this.requestUpdate();
      }
    } catch (err) {
      this.isImportingModel = false;
      this.modelError = `Error al procesar modelo: ${err.message || 'No se pudo copiar el archivo.'}`;
      this.requestUpdate();
    }
  }

  async saveCustomPrompt() {
    if (window.electronAPI?.savePrompt) {
      const defaultVal = DEFAULT_PROMPTS[this.selectedPromptKey] || '';
      const textToSave = (this.promptText.trim() === defaultVal.trim() || !this.promptText.trim()) ? null : this.promptText.trim();
      this.dbPrompts = await window.electronAPI.savePrompt(this.selectedPromptKey, textToSave);
    }
    this.updatePromptEditor();

    if (window.electronAPI?.unloadModel) {
      await window.electronAPI.unloadModel();
    }

    this.showToast('Prompt guardado exitosamente (Ctrl+S).');
  }

  async resetPromptToDefault() {
    if (window.electronAPI?.resetPrompt) {
      this.dbPrompts = await window.electronAPI.resetPrompt(this.selectedPromptKey);
    }
    this.updatePromptEditor();
    
    if (window.electronAPI?.unloadModel) {
      await window.electronAPI.unloadModel();
    }

    this.showToast('Prompt restaurado a la versión predeterminada.');
  }

  showToast(_msg) {
    // Toast deshabilitado a petición del usuario
  }

  getPromptStats() {
    const text = this.promptText || '';
    const lines = text ? text.split('\n').length : 0;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    return `${lines} líneas • ${words} palabras • ${chars} caracteres`;
  }

  getPromptStatusBadge() {
    const item = Array.isArray(this.dbPrompts) ? this.dbPrompts.find(p => p.key === this.selectedPromptKey) : null;
    const defaultVal = DEFAULT_PROMPTS[this.selectedPromptKey] || '';
    const activeText = item ? (item.custom_text || item.default_text || defaultVal) : defaultVal;

    if (this.promptText.trim() !== activeText.trim()) {
      return html`<span class="PromptStatusBadge unsaved">Modificado (sin guardar)</span>`;
    }
    if (item && item.is_custom === 1) {
      return html`<span class="PromptStatusBadge custom">Personalizado (DB)</span>`;
    }
    return html`<span class="PromptStatusBadge default">Original</span>`;
  }

  handleLevelChange(newLevel) {
    const levelScores = { A1: 1.0, A2: 2.0, B1: 3.0, B2: 4.0, C1: 5.0 };
    const baseScore = levelScores[newLevel] || 3.0;
    this.config = {
      ...this.config,
      level: newLevel,
      internal_level_score: baseScore
    };
    this.checkIfChanged();
    this.requestUpdate();
  }

  renderSaveButton() {
    let hintClass = 'save-status-hint';
    let hintText = 'Configuracion guardada';
    if (this.hasUnsavedChanges) {
      hintClass += ' has-changes';
      hintText = 'Cambios pendientes por guardar';
    } else if (this.saveSuccess) {
      hintClass += ' success';
      hintText = 'Ajustes guardados correctamente';
    }

    let btnClass = 'btn-save-settings';
    if (this.isSaving) btnClass += ' saving';
    else if (this.saveSuccess) btnClass += ' success';
    else if (this.hasUnsavedChanges) btnClass += ' has-changes';

    return html`
      <div class="tab-footer">
        <div class="${hintClass}">
          <span class="hint-dot"></span>
          <span>${hintText}</span>
        </div>

        <button
          type="button"
          class="${btnClass}"
          ?disabled="${this.isSaving}"
          @click="${() => this.saveAllSettings()}"
          title="${this.hasUnsavedChanges ? 'Guardar y aplicar todas las configuraciones' : 'Ajustes actualizados'}"
        >
          ${this.isSaving ? html`
            <span class="btn-save-spinner"></span>
            <span>Guardando...</span>
          ` : this.saveSuccess ? html`
            <span class="btn-save-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span>Guardado</span>
          ` : html`
            <span class="btn-save-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </span>
            <span>Guardar Ajustes</span>
          `}
        </button>
      </div>
    `;
  }

  renderTitleText() {
    if (this.activeTab === 'general') return 'Ajustes - General';
    if (this.activeTab === 'audio') return 'Ajustes - Audio y Sonido';
    if (this.activeTab === 'model') return 'Ajustes - Modelo IA';
    if (this.activeTab === 'prompts') return 'Ajustes - Prompts';
    return 'Ajustes';
  }

  render() {
    const customPrompts = this.config.custom_prompts || {};
    const selectedMeta = PROMPT_METADATA.find((m) => m.key === this.selectedPromptKey);
    const filteredPrompts = this.getFilteredPrompts();

    return html`
      <div class="settings-modal-overlay" @click="${(e) => e.target.classList.contains('settings-modal-overlay') && this.closeModal()}">
        <main class="settings-modal-container">
          <!-- ModalTitleBar (44px) -->
          <header class="ModalTitleBar">
            <span class="top_title_lbl">${this.renderTitleText()}</span>
            <button type="button" class="close_btn" @click="${() => this.closeModal()}" title="Cerrar ajustes">✕</button>
          </header>

          <!-- Cuerpo Modal (220px Sidebar + ContentStack) -->
          <div class="settings-modal-body">
            <!-- SettingsSidebar (220px Fijo) -->
            <aside class="SettingsSidebar">
              <span class="sidebar-header-label">AJUSTES</span>
              
              <button
                type="button"
                class="SidebarNavBtn ${this.activeTab === 'general' ? 'active' : ''}"
                @click="${() => this.handleTabChange('general')}"
              >
                General
              </button>

              <button
                type="button"
                class="SidebarNavBtn ${this.activeTab === 'audio' ? 'active' : ''}"
                @click="${() => this.handleTabChange('audio')}"
              >
                Audio y Sonido
              </button>

              <button
                type="button"
                class="SidebarNavBtn ${this.activeTab === 'model' ? 'active' : ''}"
                @click="${() => this.handleTabChange('model')}"
              >
                Modelo IA
              </button>

              <button
                type="button"
                class="SidebarNavBtn ${this.activeTab === 'prompts' ? 'active' : ''}"
                @click="${() => this.handleTabChange('prompts')}"
              >
                Prompts
              </button>
            </aside>

            <!-- ContentStack -->
            <section class="ContentStack">
              ${this.activeTab === 'general' ? renderGeneralTab(this) : ''}
              ${this.activeTab === 'audio' ? renderAudioTab(this) : ''}
              ${this.activeTab === 'model' ? renderModelTab(this) : ''}
              ${this.activeTab === 'prompts' ? renderPromptsTab(this, customPrompts, selectedMeta, filteredPrompts) : ''}
            </section>
          </div>

          </main>
      </div>

      ${renderModelModals(this)}
    `;
  }
}

if (!customElements.get('settings-view')) {
  customElements.define('settings-view', SettingsView);
}
