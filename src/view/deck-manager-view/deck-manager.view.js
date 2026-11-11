import { LitElement, html } from 'lit';
import { GroupManagerController } from './deck-manager-view.controller.js';
import {
  iconChevronLeft,
  iconMoon,
  iconSun,
  iconPlus,
  iconEdit,
  iconTrash,
  iconClose,
  iconPlay,
  iconFolder,
  iconChart,
  iconMoreVertical,
  iconSearch,
  iconSparkles
} from '../../common/ui-icons.constants.js';
import { parseGroupFile } from '../../common/file-importer.utility.js';
import { getSm2DifficultyInfo } from '../../common/srs.constants.js';
import { store } from '../../store.js';
import { renderStatsView } from './deck-stats.template.js';
import { renderCrudModal, renderImportModal, renderDeleteConfirmationModals } from './deck-modals.template.js';
import './deck-manager.view.css';

export class GroupManagerView extends LitElement {
  static properties = {
    groups: { type: Array },
    selectedGroupId: { type: Number },
    phrases: { type: Array },
    loading: { type: Boolean },
    loadingPhrases: { type: Boolean },
    error: { type: String },
    searchGroupText: { type: String },
    searchPhraseText: { type: String },
    showSearchPhraseInput: { type: Boolean },
    modalType: { type: String }, // 'create-group', 'edit-group', 'create-phrase'
    groupType: { type: String }, // 'static' | 'dynamic_preset'
    modalInputText: { type: String },
    modalDailyLimit: { type: Number },
    dynLevel: { type: String },
    dynTopic: { type: String },
    dynCount: { type: Number },
    dynTargetWords: { type: String },
    dynCustomPrompt: { type: String },
    targetId: { type: Number },
    activeTab: { type: String }, // 'groups' | 'stats'
    stats: { type: Object },
    loadingStats: { type: Boolean },
    sidebarWidth: { type: Number },
    detailsWidth: { type: Number },
    selectedPhraseDetail: { type: Object },
    editPhraseText: { type: String },
    editPhraseLevel: { type: String },
    showGroupMenu: { type: Boolean },
    // Estado inline para preset dinámico
    showAdvancedPreset: { type: Boolean },
    isEditingPreset: { type: Boolean },
    inlinePresetName: { type: String },
    inlineLevel: { type: String },
    inlineTopic: { type: String },
    inlineCount: { type: Number },
    inlineTargetWords: { type: String },
    inlineCustomPrompt: { type: String },
    testingLLM: { type: Boolean },
    testPhrases: { type: Array },
    testError: { type: String },
    testCount: { type: Number },
    presetSavedNotice: { type: Boolean },
    showImportModal: { type: Boolean },
    importedDataPreview: { type: Object },
    importError: { type: String },
    importPhraseDrafts: { type: Array },
    showAllImportPhrases: { type: Boolean },
    loadingAllImportPhrases: { type: Boolean },
    ankiImportSession: { type: Object },
    ankiDeckFields: { type: Array },
    ankiSelectedDeckId: { type: String },
    ankiSelectedField: { type: String },
    ankiGroupName: { type: String },
    ankiLoading: { type: Boolean },
    ankiImporting: { type: Boolean },
    importGroupType: { type: String },
    confirmDeleteGroupTarget: { type: Object },
    confirmDeletePhraseTargetId: { type: Number },
    vocabDiffFilter: { type: String }
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.groups = [];
    this.selectedGroupId = null;
    this.phrases = [];
    this.loading = true;
    this.loadingPhrases = false;
    this.error = '';
    this.searchGroupText = '';
    this.searchPhraseText = '';
    this.showSearchPhraseInput = false;
    this.modalType = null;
    this.groupType = 'static';
    this.modalInputText = '';
    this.modalDailyLimit = 20;
    this.vocabDiffFilter = 'all';
    this.dynLevel = 'B1';
    this.dynTopic = 'Everyday Life';
    this.dynCount = 5;
    this.dynTargetWords = '';
    this.dynCustomPrompt = '';
    this.targetId = null;
    this.activeTab = 'groups';
    this.stats = null;
    this.loadingStats = false;
    this.sidebarWidth = 240;
    this.detailsWidth = 320;
    this.selectedPhraseDetail = null;
    this.editPhraseText = '';
    this.editPhraseLevel = 'B1';
    this.showGroupMenu = false;

    this.showAdvancedPreset = false;
    this.isEditingPreset = false;
    this.inlinePresetName = '';
    this.inlineLevel = 'B1';
    this.inlineTopic = 'Everyday Life';
    this.inlineCount = 5;
    this.inlineTargetWords = '';
    this.inlineCustomPrompt = '';
    this.testingLLM = false;
    this.testPhrases = [];
    this.testError = '';
    this.testCount = 3;
    this.presetSavedNotice = false;

    this.showImportModal = false;
    this.importedDataPreview = null;
    this.importError = '';
    this.importPhraseDrafts = null;
    this.showAllImportPhrases = false;
    this.loadingAllImportPhrases = false;
    this.ankiImportSession = null;
    this.ankiDeckFields = [];
    this.ankiSelectedDeckId = '';
    this.ankiSelectedField = '';
    this.ankiGroupName = '';
    this.ankiLoading = false;
    this.ankiImporting = false;
    this.importGroupType = 'static';

    this.controller = new GroupManagerController(this);
    this._state = store.getState();
    this._unsubscribe = store.subscribe((state) => {
      this._state = { ...state };
      this.requestUpdate();
    });
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.controller.loadGroups();
    this._onDocumentClick = () => {
      if (this.showGroupMenu) this.showGroupMenu = false;
    };
    window.addEventListener('click', this._onDocumentClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) this._unsubscribe();
    if (this._onDocumentClick) window.removeEventListener('click', this._onDocumentClick);
    this.disposeAnkiImportSession();
  }

  initInlinePresetEdit(group) {
    if (!group) return;
    let conf = {};
    try {
      conf = typeof group.dynamic_config === 'string' ? JSON.parse(group.dynamic_config) : (group.dynamic_config || {});
    } catch {}
    this.inlinePresetName = group.name || '';
    this.inlineLevel = conf.level || 'B1';
    this.inlineTopic = conf.topic || 'Everyday Life';
    this.inlineCount = conf.count || 5;
    this.inlineTargetWords = conf.target_words || '';
    this.inlineCustomPrompt = conf.custom_prompt || '';
    this.isEditingPreset = false;
    this.showAdvancedPreset = false;
    this.testPhrases = [];
    this.testError = '';
    this.testCount = 3;
    this.presetSavedNotice = false;
  }

  _startResizeSidebar(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = this.sidebarWidth;

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(180, Math.min(550, startWidth + (moveEvent.clientX - startX)));
      this.sidebarWidth = newWidth;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  _startResizeDetails(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = this.detailsWidth;

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(220, Math.min(600, startWidth + (startX - moveEvent.clientX)));
      this.detailsWidth = newWidth;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  selectPhraseForDetail(phrase) {
    this.selectedPhraseDetail = phrase;
    this.editPhraseText = phrase.original_text || '';
    this.editPhraseLevel = phrase.cefr_level || 'B1';
  }

  closePhraseDetail() {
    this.selectedPhraseDetail = null;
  }

  async appendDueVocabulary(target = 'inline') {
    try {
      const dueItems = await window.electronAPI.getVocabularyPhrases({ difficulty: 'hard', dueOnly: true });
      const property = target === 'inline' ? 'inlineTargetWords' : 'dynTargetWords';
      const currentWords = String(this[property] || '').split(/[\n,;]/).map((word) => word.trim()).filter(Boolean);
      const combined = new Map(currentWords.map((word) => [word.toLowerCase(), word]));
      for (const item of dueItems.slice(0, 5)) {
        combined.set(item.original_text.toLowerCase(), item.original_text);
      }
      if (dueItems.length === 0) {
        alert('No hay palabras difíciles pendientes de repaso.');
        return;
      }
      this[property] = [...combined.values()].join(', ');
    } catch (error) {
      console.error('No se pudo cargar el vocabulario pendiente:', error);
      alert('No se pudo cargar el vocabulario pendiente.');
    }
  }

  async savePhraseDetail() {
    if (!this.selectedPhraseDetail || !this.editPhraseText.trim()) return;
    await this.controller.updatePhrase(
      this.selectedPhraseDetail.id,
      this.editPhraseText.trim(),
      this.editPhraseLevel
    );
    this.closePhraseDetail();
  }

  async deletePhraseFromDetail() {
    if (!this.selectedPhraseDetail) return;
    if (!confirm('¿Eliminar esta frase?')) return;
    await this.controller.deletePhrase(this.selectedPhraseDetail.id);
    this.closePhraseDetail();
  }

  openCreateGroupModal() {
    this.modalType = 'create-group';
    this.groupType = 'dynamic_preset';
    this.modalInputText = 'Viajes y Aeropuertos';
    this.createInitialPhrasesText = '';
    this.modalDailyLimit = 20;
    this.dynLevel = 'A2';
    this.dynTopic = 'Airport & Hotel Conversations';
    this.dynCount = 5;
    this.dynTargetWords = '';
    this.dynCustomPrompt = '';
    this.targetId = null;
  }

  applyPreset(preset) {
    this.groupType = preset.type;
    this.modalInputText = preset.name;
    if (preset.type === 'dynamic_preset') {
      this.dynLevel = preset.level || 'B1';
      this.dynTopic = preset.topic || '';
      this.dynCount = preset.count || 5;
    } else {
      this.createInitialPhrasesText = preset.initialText || '';
    }
    this.requestUpdate();
  }

  openEditGroupModal(group, e) {
    if (e) e.stopPropagation();
    this.modalType = 'edit-group';
    this.modalInputText = group ? group.name : '';
    this.groupType = group ? (group.type || 'static') : 'static';
    this.modalDailyLimit = group?.daily_limit || 20;
    this.targetId = group ? group.id : null;

    if (group && group.dynamic_config) {
      try {
        const conf = typeof group.dynamic_config === 'string' ? JSON.parse(group.dynamic_config) : group.dynamic_config;
        this.dynLevel = conf.level || 'B1';
        this.dynTopic = conf.topic || 'Everyday Life';
        this.dynCount = conf.count || 5;
        this.dynTargetWords = conf.target_words || '';
        this.dynCustomPrompt = conf.custom_prompt || '';
      } catch {
        // fallback defaults
      }
    }
  }

  openAddPhraseModal() {
    this.modalType = 'create-phrase';
    this.modalInputText = '';
  }

  toggleSearchPhrase() {
    this.showSearchPhraseInput = !this.showSearchPhraseInput;
    if (this.showSearchPhraseInput) {
      this.updateComplete.then(() => {
        const el = this.querySelector('#gm-phrase-search-field');
        if (el) el.focus();
      });
    }
  }

  closeModal() {
    this.modalType = null;
    this.modalInputText = '';
    this.targetId = null;
  }

  openImportFileModal() {
    this.showImportModal = true;
    this.importGroupType = 'static';
    this.importedDataPreview = null;
    this.importError = '';
    this.importPhraseDrafts = null;
    this.showAllImportPhrases = false;
  }

  closeImportModal() {
    this.disposeAnkiImportSession();
    this.showImportModal = false;
    this.importGroupType = 'static';
    this.importedDataPreview = null;
    this.importError = '';
    this.importPhraseDrafts = null;
    this.showAllImportPhrases = false;
    this.loadingAllImportPhrases = false;
    this.ankiImportSession = null;
    this.ankiDeckFields = [];
    this.ankiSelectedDeckId = '';
    this.ankiSelectedField = '';
    this.ankiGroupName = '';
  }

  disposeAnkiImportSession() {
    const sessionId = this.ankiImportSession?.sessionId;
    if (sessionId) {
      window.electronAPI.closeAnkiImport(sessionId)
        .catch((error) => console.error('No se pudo cerrar la importación de Anki:', error));
    }
  }

  handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    this.processSelectedFile(file);
    e.target.value = '';
  }

  processSelectedFile(file) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'apkg' || extension === 'colpkg') {
      let filePath;
      try {
        filePath = window.electronAPI.getPathForFile(file);
      } catch (error) {
        this.importError = error.message || 'No se pudo acceder al archivo de Anki.';
        return;
      }
      this.loadAnkiPackage(filePath);
      return;
    }

    this.disposeAnkiImportSession();
    this.ankiImportSession = null;
    this.ankiDeckFields = [];
    this.ankiSelectedDeckId = '';
    this.ankiSelectedField = '';
    this.ankiGroupName = '';
    this.importedDataPreview = null;
    this.importPhraseDrafts = null;
    this.showAllImportPhrases = false;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const parsed = parseGroupFile(content, file.name);
        if (!parsed.phrases || parsed.phrases.length === 0) {
          throw new Error('No se encontraron frases en el archivo.');
        }
        this.importedDataPreview = parsed;
        this.importPhraseDrafts = parsed.phrases.map((phrase) => ({
          ...phrase,
          pendingDelete: false
        }));
        this.showAllImportPhrases = false;
        this.importError = '';
      } catch (err) {
        this.importError = err.message || 'Error al procesar el archivo.';
        this.importedDataPreview = null;
      }
    };
    reader.onerror = () => {
      this.importError = 'Error al leer el archivo desde el disco.';
    };
    reader.readAsText(file);
  }

  async loadAnkiPackage(filePath) {
    this.ankiLoading = true;
    this.importError = '';
    try {
      const session = await window.electronAPI.openAnkiPackage(filePath);
      if (session.canceled) return;
      if (this.ankiImportSession?.sessionId) {
        await window.electronAPI.closeAnkiImport(this.ankiImportSession.sessionId);
      }
      this.ankiImportSession = session;
      this.ankiSelectedDeckId = session.decks[0]?.id || '';
      this.importedDataPreview = null;
      this.importPhraseDrafts = null;
      this.showAllImportPhrases = false;
      await this.loadAnkiDeckFields();
    } catch (error) {
      this.importError = error.message || 'No se pudo leer el paquete de Anki.';
    } finally {
      this.ankiLoading = false;
    }
  }

  async loadAnkiDeckFields() {
    if (!this.ankiImportSession || !this.ankiSelectedDeckId) return;
    const result = await window.electronAPI.getAnkiDeckFields(
      this.ankiImportSession.sessionId,
      this.ankiSelectedDeckId
    );
    this.ankiDeckFields = result.fieldNames;
    this.ankiSelectedField = result.fieldNames[0] || '';
    this.ankiGroupName = result.deck.name;
    await this.refreshAnkiPreview();
  }

  async selectAnkiDeck(deckId) {
    this.ankiSelectedDeckId = deckId;
    this.importPhraseDrafts = null;
    this.showAllImportPhrases = false;
    this.importError = '';
    this.ankiLoading = true;
    try {
      await this.loadAnkiDeckFields();
    } catch (error) {
      this.importError = error.message || 'No se pudieron leer los campos del mazo.';
      this.importedDataPreview = null;
    } finally {
      this.ankiLoading = false;
    }
  }

  async selectAnkiField(fieldName) {
    this.ankiSelectedField = fieldName;
    this.importError = '';
    this.ankiLoading = true;
    try {
      this.importPhraseDrafts = null;
      this.showAllImportPhrases = false;
      await this.refreshAnkiPreview();
    } catch (error) {
      this.importError = error.message || 'No se pudo generar la vista previa del campo.';
      this.importedDataPreview = null;
    } finally {
      this.ankiLoading = false;
    }
  }

  async refreshAnkiPreview() {
    if (!this.ankiImportSession || !this.ankiSelectedDeckId || !this.ankiSelectedField) return;
    const preview = await window.electronAPI.previewAnkiDeck(
      this.ankiImportSession.sessionId,
      this.ankiSelectedDeckId,
      this.ankiSelectedField
    );
    this.importedDataPreview = {
      groupName: this.ankiGroupName,
      phrases: preview.phrases,
      phraseCount: preview.phraseCount
    };
  }

  async toggleAllImportPhrases() {
    if (this.showAllImportPhrases) {
      this.showAllImportPhrases = false;
      return;
    }
    this.loadingAllImportPhrases = true;
    this.importError = '';
    try {
      if (!this.importPhraseDrafts) {
        const phrases = this.ankiImportSession
          ? await window.electronAPI.getAnkiDeckPhrases(
            this.ankiImportSession.sessionId,
            this.ankiSelectedDeckId,
            this.ankiSelectedField
          )
          : this.importedDataPreview?.phrases || [];
        this.importPhraseDrafts = phrases.map((phrase) => ({
          ...phrase,
          pendingDelete: false
        }));
      }
      this.showAllImportPhrases = true;
    } catch (error) {
      this.importError = error.message || 'No se pudieron cargar todas las frases.';
    } finally {
      this.loadingAllImportPhrases = false;
    }
  }

  updateImportPhrase(index, text) {
    this.importPhraseDrafts = this.importPhraseDrafts.map((phrase, phraseIndex) =>
      phraseIndex === index ? { ...phrase, original_text: text } : phrase
    );
  }

  toggleImportPhraseDeletion(index) {
    this.importPhraseDrafts = this.importPhraseDrafts.map((phrase, phraseIndex) =>
      phraseIndex === index ? { ...phrase, pendingDelete: !phrase.pendingDelete } : phrase
    );
  }

  get importablePhraseCount() {
    if (this.importPhraseDrafts) {
      return this.importPhraseDrafts.filter((phrase) => !phrase.pendingDelete && phrase.original_text.trim()).length;
    }
    return this.importedDataPreview?.phraseCount || this.importedDataPreview?.phrases.length || 0;
  }

  async handleConfirmImport() {
    if (!this.importedDataPreview) return;
    const phrasesToImport = this.importPhraseDrafts
      ? this.importPhraseDrafts
        .filter((phrase) => !phrase.pendingDelete && phrase.original_text.trim())
        .map(({ pendingDelete, ...phrase }) => phrase)
      : null;
    if (phrasesToImport && phrasesToImport.length === 0) {
      this.importError = 'Debe quedar al menos una frase para crear el grupo.';
      return;
    }

    if (this.importGroupType === 'vocabulary') {
      const phrasesToCheck = phrasesToImport || this.importedDataPreview.phrases || [];
      const overLimit = phrasesToCheck.find(p => (p.original_text || p.text || '').trim().length > 35);
      if (overLimit) {
        const textPreview = (overLimit.original_text || overLimit.text || '').trim();
        this.importError = `El término "${textPreview.length > 25 ? textPreview.slice(0, 25) + '...' : textPreview}" supera el límite de 35 caracteres para grupos de vocabulario. Edítalo o selecciona "Lista Manual".`;
        return;
      }
    }

    this.ankiImporting = true;
    try {
      let result;
      if (this.ankiImportSession) {
        result = await window.electronAPI.importAnkiDeck(
          this.ankiImportSession.sessionId,
          this.ankiSelectedDeckId,
          this.ankiSelectedField,
          this.ankiGroupName,
          phrasesToImport,
          this.importGroupType || 'static'
        );
        this.ankiImportSession = null;
      } else {
        if (!window.electronAPI?.importGroup) {
          throw new Error('Función de importación no disponible.');
        }
        result = await window.electronAPI.importGroup(
          this.importedDataPreview.groupName,
          phrasesToImport || this.importedDataPreview.phrases,
          this.importGroupType || 'static',
          null
        );
      }
      this.closeImportModal();
      await this.controller.loadGroups();
      if (result.groupId) {
        const importedGroup = this.groups.find(g => g.id === result.groupId);
        if (importedGroup) this.controller.selectGroup(importedGroup);
      }
    } catch (err) {
      this.importError = err.message || 'No se pudo guardar el grupo importado.';
    } finally {
      this.ankiImporting = false;
    }
  }

  async handleSaveModal() {
    if (!this.modalInputText.trim()) return;
    if (this.modalType === 'create-group') {
      const dynamicConfig = this.groupType === 'dynamic_preset' ? {
        level: this.dynLevel,
        topic: this.dynTopic,
        count: Number(this.dynCount),
        target_words: this.dynTargetWords.trim(),
        custom_prompt: this.dynCustomPrompt.trim()
      } : null;

      const initialPhrases = (this.groupType !== 'dynamic_preset' && this.createInitialPhrasesText)
        ? this.createInitialPhrasesText.split('\n').map(s => s.trim()).filter(Boolean)
        : [];

      await this.controller.createGroup(this.modalInputText.trim(), this.groupType, dynamicConfig, initialPhrases, this.modalDailyLimit);
    } else if (this.modalType === 'edit-group' && this.targetId) {
      const dynamicConfig = this.groupType === 'dynamic_preset' ? {
        level: this.dynLevel,
        topic: this.dynTopic,
        count: Number(this.dynCount),
        target_words: this.dynTargetWords.trim(),
        custom_prompt: this.dynCustomPrompt.trim()
      } : null;

      await this.controller.updateGroup(this.targetId, this.modalInputText.trim(), this.groupType, dynamicConfig, this.modalDailyLimit);
    } else if (this.modalType === 'create-phrase' && this.selectedGroupId) {
      await this.controller.createPhrase(this.selectedGroupId, this.modalInputText.trim());
    }
    this.closeModal();
  }

  startVocabDrillSession(selectedGroup) {
    if (!selectedGroup) return;
    const limit = Math.min(selectedGroup.daily_limit || 20, Math.max(1, this.phrases.length));
    store.setState({
      practiceMode: 'dynamic',
      selectedGroup: selectedGroup.id,
      sessionOptions: {
        mode: 'vocab_drill',
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
        integrateVocabulary: true,
        topic: `Vocabulario: ${selectedGroup.name}`,
        level: 'B1',
        count: limit
      },
      currentView: 'practice'
    });
  }

  startStandardPractice(selectedGroup) {
    if (!selectedGroup) return;
    store.setState({
      practiceMode: 'group',
      selectedGroup: selectedGroup.id,
      currentView: 'practice'
    });
  }

  async handleSaveInlinePreset(selectedGroup) {
    if (!this.inlinePresetName.trim()) return;
    const newConfig = {
      level: this.inlineLevel,
      topic: this.inlineTopic.trim(),
      count: Number(this.inlineCount),
      target_words: this.inlineTargetWords.trim(),
      custom_prompt: this.inlineCustomPrompt.trim()
    };
    await this.controller.updateGroup(selectedGroup.id, this.inlinePresetName.trim(), 'dynamic_preset', newConfig);
    this.presetSavedNotice = true;
    setTimeout(() => { this.presetSavedNotice = false; }, 3000);
  }

  async runLLMTest(selectedGroup) {
    const countToGenerate = Math.max(1, Math.min(10, this.testCount || 3));
    this.testingLLM = true;
    this.testError = '';
    this.testPhrases = [];
    this.requestUpdate();

    const level = this.inlineLevel || 'B1';
    const topic = this.inlineTopic || 'General';
    const targetWords = this.inlineTargetWords || 'none';
    const customPrompt = this.inlineCustomPrompt || '';

    const prompt = `Generate exactly ${countToGenerate} distinct, natural English practice sentences for CEFR level ${level}.
Topic: ${topic}.
Target vocabulary/keywords: ${targetWords}.
STRICT LENGTH RULE: Each sentence MUST be short and concise, containing strictly between 6 and 14 words max.
${customPrompt ? 'Additional instructions: ' + customPrompt : ''}

CRITICAL MANDATORY INSTRUCTION: You MUST output exactly ${countToGenerate} numbered lines (from 1 to ${countToGenerate}). Do NOT stop at 2 sentences. Do NOT write any intro or conclusion.`;

    try {
      if (!window.electronAPI?.askLLM) {
        throw new Error('Servicio LLM no disponible.');
      }
      const response = await window.electronAPI.askLLM(prompt, { temperature: 0.7, maxTokens: Math.max(350, countToGenerate * 80) });
      let text = typeof response === 'string' ? response : (response?.text || response?.content || '');

      const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const extracted = [];
      const introPrefixes = ['here are', 'here is', 'here\'s', 'sure', 'certainly', 'below are', 'these are', 'note:'];

      for (const line of lines) {
        let clean = line.replace(/^(?:\d+[\.\)]|\-|\*|\[\d+\])\s*/, '').trim();
        clean = clean.replace(/^['"`]|['"`]$/g, '').trim();
        const lower = clean.toLowerCase();

        const isIntroHeader = introPrefixes.some(p => lower.startsWith(p));

        if (clean && clean.length > 3 && !isIntroHeader) {
          extracted.push(clean);
        }
      }

      if (extracted.length > 0) {
        this.testPhrases = extracted.slice(0, countToGenerate);
      } else {
        throw new Error('El modelo LLM no devolvió frases válidas. Intenta nuevamente.');
      }
    } catch (err) {
      console.error('Error probando LLM:', err);
      this.testError = err.message || 'No se pudo conectar con el modelo LLM. Verifica que un modelo esté activo en Configuración.';
    } finally {
      this.testingLLM = false;
      this.requestUpdate();
    }
  }

  async handleDeleteGroup(group, e) {
    if (e) e.stopPropagation();
    if (!group) return;
    this.confirmDeleteGroupTarget = group;
  }

  async confirmExecuteDeleteGroup() {
    if (!this.confirmDeleteGroupTarget) return;
    const group = this.confirmDeleteGroupTarget;
    this.confirmDeleteGroupTarget = null;
    await this.controller.deleteGroup(group.id);
  }

  async handleDeletePhrase(phraseId, e) {
    if (e) e.stopPropagation();
    this.confirmDeletePhraseTargetId = phraseId;
  }

  async confirmExecuteDeletePhrase() {
    if (!this.confirmDeletePhraseTargetId) return;
    const phraseId = this.confirmDeletePhraseTargetId;
    this.confirmDeletePhraseTargetId = null;
    await this.controller.deletePhrase(phraseId);
    if (this.selectedPhraseDetail?.id === phraseId) {
      this.closePhraseDetail();
    }
  }

  async deletePhraseFromDetail() {
    if (!this.selectedPhraseDetail) return;
    this.confirmDeletePhraseTargetId = this.selectedPhraseDetail.id;
  }

  renderDynamicPresetDetails(selectedGroup) {
    return html`
      <div class="gm-main-header">
        <div class="gm-group-header-info">
          <h2>
            <span>${selectedGroup.name}</span>
            <span class="badge-group-type dynamic">IA Dinámico</span>
          </h2>
          <p>Parámetros Editables de Generación Automática con IA</p>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="gm-menu-wrapper" style="position: relative;">
            <button
              type="button"
              class="gm-icon-btn ${this.showGroupMenu ? 'active' : ''}"
              title="Opciones del grupo"
              @click="${(e) => { e.stopPropagation(); this.showGroupMenu = !this.showGroupMenu; }}"
            >
              ${iconMoreVertical}
            </button>

            ${this.showGroupMenu ? html`
              <div class="gm-dropdown-menu" @click="${(e) => e.stopPropagation()}">
                <button type="button" class="gm-dropdown-item danger" @click="${(e) => { this.showGroupMenu = false; this.handleDeleteGroup(selectedGroup, e); }}">
                  ${iconTrash} <span>Eliminar Preset</span>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="gm-phrases-scroll-area">
        <div class="gm-preset-card">
          <!-- Formulario de Configuración Directamente Editable -->
          <div class="gm-preset-edit-form" style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 12px;">
              <div style="flex: 1;">
                <label class="gm-details-label" style="margin-bottom: 4px; display: block;">Nombre del Preset:</label>
                <input
                  type="text"
                  class="gm-search-input"
                  style="font-size: 0.95rem; font-weight: 600;"
                  .value="${this.inlinePresetName}"
                  @input="${(e) => { this.inlinePresetName = e.target.value; }}"
                />
              </div>
              <button
                type="button"
                class="PrimaryButton"
                style="height: 34px; padding: 0 20px; font-size: 0.82rem; white-space: nowrap;"
                @click="${() => this.handleSaveInlinePreset(selectedGroup)}"
              >
                Guardar Cambios
              </button>
            </div>

            ${this.presetSavedNotice ? html`
              <div style="background: var(--success-bg); border: 1px solid color-mix(in srgb, var(--success-color) 40%, var(--border-color)); color: var(--success-color); padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; animation: gmFadeIn 0.2s;">
                ✓ Parámetros guardados correctamente.
              </div>
            ` : ''}

            <!-- Grid de Campos Editables (gm-preset-grid) -->
            <div class="gm-preset-grid">
              <div class="gm-preset-item">
                <label class="gm-preset-label">NIVEL MCER</label>
                <select class="gm-details-select" style="margin-top: 4px;" .value="${this.inlineLevel}" @change="${(e) => { this.inlineLevel = e.target.value; }}">
                  ${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => html`<option value="${l}" ?selected="${this.inlineLevel === l}">${l}</option>`)}
                </select>
              </div>

              <div class="gm-preset-item">
                <label class="gm-preset-label">TEMA / GRAMÁTICA</label>
                <input
                  type="text"
                  class="gm-search-input"
                  style="margin-top: 4px;"
                  placeholder="Ej. Simple Past, Travel..."
                  .value="${this.inlineTopic}"
                  @input="${(e) => { this.inlineTopic = e.target.value; }}"
                />
              </div>

              <div class="gm-preset-item">
                <label class="gm-preset-label">CANTIDAD POR SESIÓN</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  class="gm-search-input"
                  style="margin-top: 4px;"
                  .value="${this.inlineCount}"
                  @input="${(e) => { this.inlineCount = e.target.value; }}"
                />
              </div>
            </div>

            <!-- Acordeón Editable de Opciones Avanzadas (gm-advanced-accordion) -->
            <div class="gm-advanced-accordion">
              <button
                type="button"
                class="gm-accordion-header"
                aria-controls="gm-advanced-preset-panel"
                aria-expanded="${this.showAdvancedPreset}"
                @click="${() => { this.showAdvancedPreset = !this.showAdvancedPreset; }}"
              >
                <span>Opciones Avanzadas (Palabras Clave y Prompt IA)</span>
                <span class="gm-accordion-arrow ${this.showAdvancedPreset ? 'open' : ''}">▼</span>
              </button>

              <div
                id="gm-advanced-preset-panel"
                class="gm-accordion-panel ${this.showAdvancedPreset ? 'open' : ''}"
                aria-hidden="${!this.showAdvancedPreset}"
                ?inert="${!this.showAdvancedPreset}"
              >
                <div class="gm-accordion-panel-inner">
                <div class="gm-accordion-content" style="display: flex; flex-direction: column; gap: 12px;">
                  <div>
                    <label class="gm-details-label" style="margin-bottom: 4px; display: block;">Palabras Clave / Vocabulario Objetivo:</label>
                    <input
                      type="text"
                      class="gm-search-input"
                      placeholder="Ej. achieved, managed, led, negotiation"
                      .value="${this.inlineTargetWords}"
                      @input="${(e) => { this.inlineTargetWords = e.target.value; }}"
                    />
                    <button type="button" class="btn-small" style="margin-top: 6px;" @click="${() => this.appendDueVocabulary('inline')}">
                      Añadir palabras difíciles pendientes
                    </button>
                  </div>

                  <div>
                    <label class="gm-details-label" style="margin-bottom: 4px; display: block;">Prompt e Instrucciones de IA:</label>
                    <textarea
                      class="gm-details-textarea"
                      style="height: 75px; resize: vertical;"
                      placeholder="Instrucciones adicionales para la IA..."
                      .value="${this.inlineCustomPrompt}"
                      @input="${(e) => { this.inlineCustomPrompt = e.target.value; }}"
                    ></textarea>
                  </div>
                </div>
                </div>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button
                type="button"
                class="PrimaryButton"
                style="height: 34px; padding: 0 20px; font-size: 0.82rem;"
                @click="${() => this.handleSaveInlinePreset(selectedGroup)}"
              >
                Guardar Cambios
              </button>
            </div>
          </div>

          <!-- Botón Probar Generación con IA y Resultado de Muestra (gm-test-llm-section) -->
          <div class="gm-test-llm-section">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
              <div>
                <h4 style="margin: 0; font-size: 0.88rem; font-weight: 600; color: var(--text-color);">Muestra de Generación IA</h4>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Prueba el resultado exacto que generará la IA con estos parámetros</span>
              </div>

              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <label style="font-size: 0.76rem; color: var(--text-muted); font-weight: 500; white-space: nowrap;">Cantidad a probar:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    class="gm-search-input"
                    style="width: 55px; text-align: center; height: 32px;"
                    .value="${this.testCount || 3}"
                    @input="${(e) => { this.testCount = Math.max(1, Math.min(10, parseInt(e.target.value) || 1)); }}"
                  />
                </div>

                <button
                  type="button"
                  class="PrimaryButton"
                  style="height: 32px; padding: 0 14px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;"
                  ?disabled="${this.testingLLM}"
                  @click="${() => this.runLLMTest(selectedGroup)}"
                >
                  ${iconSparkles} ${this.testingLLM ? 'Generando...' : 'Probar LLM'}
                </button>
              </div>
            </div>

            ${this.testError ? html`
              <div style="background: var(--danger-bg); border: 1px solid color-mix(in srgb, var(--danger-color) 30%, var(--border-color)); color: var(--danger-color); padding: 10px 12px; border-radius: 6px; font-size: 0.8rem; margin-top: 10px;">
                ${this.testError}
              </div>
            ` : ''}

            ${this.testingLLM ? html`
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                <div class="gm-test-phrase-card gm-test-phrase-loading">
                  <span class="gm-test-phrase-num loading">...</span>
                  <span class="gm-test-phrase-text">Generando ${this.testCount || 3} frases de muestra con el modelo LLM...</span>
                </div>
              </div>
            ` : ''}

            ${!this.testingLLM && this.testPhrases.length > 0 ? html`
              <div class="gm-test-phrases-list">
                ${this.testPhrases.map((phrase, idx) => html`
                  <div class="gm-test-phrase-card">
                    <span class="gm-test-phrase-num">${idx + 1}</span>
                    <span class="gm-test-phrase-text">${phrase}</span>
                  </div>
                `)}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderStatsView() {
    return renderStatsView(this);
  }

  render() {
    const state = this._state;
    const selectedGroup = this.groups.find(g => g.id === this.selectedGroupId);
    
    // Filtrar grupos por texto de búsqueda
    const filteredGroups = this.groups.filter(g =>
      g.name.toLowerCase().includes(this.searchGroupText.toLowerCase().trim())
    );

    // Filtrar frases por texto de búsqueda
    const filteredPhrases = this.phrases.filter(p =>
      p.original_text.toLowerCase().includes(this.searchPhraseText.toLowerCase().trim())
    );

    return html`
      <div class="gm-screen-wrapper">
        <!-- Header Principal (solo botones con iconos, tabs en gm-header-right) -->
        <header class="gm-header">
          <div class="gm-header-left">
            <button type="button" class="back-circle-btn" @click="${() => this.controller.goHome()}" title="Volver al Inicio">
              ${iconChevronLeft}
            </button>
            <h1 class="gm-title">Gestión de Base de Datos y Avance</h1>
          </div>
          <div class="gm-header-right">
            <div class="gm-header-tabs">
              <button
                type="button"
                class="gm-tab-btn ${this.activeTab === 'groups' ? 'active' : ''}"
                @click="${() => { this.activeTab = 'groups'; }}"
                title="Carpetas y Frases"
              >
                ${iconFolder}
              </button>
              <button
                type="button"
                class="gm-tab-btn ${this.activeTab === 'stats' ? 'active' : ''}"
                @click="${() => { this.activeTab = 'stats'; this.controller.loadStats(); }}"
                title="Estadísticas y Nivel (i+1)"
              >
                ${iconChart}
              </button>
            </div>
            <button type="button" class="utility-button" title="Cambiar tema" @click="${() => this.controller.toggleTheme()}">
              ${state.darkMode ? iconMoon : iconSun}
            </button>
          </div>
        </header>

        ${this.activeTab === 'stats' ? this.renderStatsView() : html`
          <div class="gm-split-layout">
            <!-- Panel Izquierdo: Grupos -->
            <aside class="gm-sidebar" style="width: ${this.sidebarWidth}px; min-width: ${this.sidebarWidth}px;">
              <div class="gm-sidebar-header">
                <div class="gm-sidebar-top-row">
                  <span class="gm-sidebar-title">GRUPOS (${this.groups.length})</span>
                  <div style="display: flex; gap: 4px;">
                    <button type="button" class="btn-small" title="Importar desde Archivo (.json, .csv, .txt)" @click="${() => this.openImportFileModal()}">
                      ${iconFolder}
                    </button>
                    <button type="button" class="btn-small btn-add-group" title="Nuevo Grupo" @click="${() => this.openCreateGroupModal()}">
                      ${iconPlus}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  class="gm-search-input"
                  placeholder="Buscar grupo..."
                  .value="${this.searchGroupText}"
                  @input="${(e) => { this.searchGroupText = e.target.value; }}"
                />
              </div>

              <div class="gm-groups-list">
                ${this.loading
                  ? html`<p style="padding: 16px; color: var(--text-muted);">Cargando...</p>`
                  : filteredGroups.length === 0
                    ? html`<p style="padding: 16px; color: var(--text-muted); font-size: 0.88rem;">Sin resultados</p>`
                    : filteredGroups.map(group => html`
                        <div
                          class="gm-group-item ${this.selectedGroupId === group.id ? 'active' : ''}"
                          @click="${() => { this.controller.selectGroup(group); this.initInlinePresetEdit(group); this.closePhraseDetail(); }}"
                        >
                          <div class="gm-group-info">
                            <span class="gm-group-name">${group.name}</span>
                            <span class="badge-group-type ${group.type === 'dynamic_preset' ? 'dynamic' : group.type === 'vocabulary' ? 'vocab' : 'static'}">
                              ${group.type === 'dynamic_preset' ? 'IA' : group.type === 'vocabulary' ? 'Vocab' : group.phrase_count}
                            </span>
                          </div>
                        </div>
                      `)}
              </div>
            </aside>

            <!-- Separador / Manija para redimensionar sidebar izquierdo -->
            <div class="gm-sidebar-resizer" @mousedown="${(e) => this._startResizeSidebar(e)}"></div>

            <!-- Panel Central: Frases o Preset Dinámico -->
            <main class="gm-main-content">
              ${selectedGroup
                ? selectedGroup.type === 'dynamic_preset'
                  ? this.renderDynamicPresetDetails(selectedGroup)
                  : html`
                      <div class="gm-main-header">
                        <div class="gm-group-header-info">
                          <h2>
                            <span>${selectedGroup.name}</span>
                            <span class="badge-group-type ${selectedGroup.type === 'vocabulary' ? 'vocab' : 'static'}">
                              ${selectedGroup.type === 'vocabulary' ? 'Vocabulario SM-2' : 'Estático'}
                            </span>
                          </h2>
                          <p>
                            ${this.phrases.length} ${selectedGroup.type === 'vocabulary' ? 'palabra' : 'frase'}${this.phrases.length === 1 ? '' : 's'}
                            ${selectedGroup.type === 'vocabulary' ? '(máx. 35 caracteres)' : 'guardada' + (this.phrases.length === 1 ? '' : 's')}
                            · Límite diario: <strong>${selectedGroup.daily_limit || 20}</strong> ítems/día
                          </p>
                        </div>

                        <div style="display: flex; align-items: center; gap: 8px;">
                          ${selectedGroup.type === 'vocabulary' && this.phrases.length > 0 ? html`
                            <button
                              type="button"
                              class="PrimaryButton"
                              style="height: 32px; padding: 0 12px; font-size: 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;"
                              @click="${() => this.startVocabDrillSession(selectedGroup)}"
                              title="Generar oraciones contextuales con IA usando las palabras de este mazo"
                            >
                              ${iconSparkles} <span>Entrenar con IA</span>
                            </button>
                          ` : ''}

                          ${this.phrases.length > 0 ? html`
                            <button
                              type="button"
                              class="PrimaryButton"
                              style="height: 32px; padding: 0 12px; font-size: 0.8rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;"
                              @click="${() => this.startStandardPractice(selectedGroup)}"
                              title="Practicar este mazo (límite diario de ${selectedGroup.daily_limit || 20})"
                            >
                              ${iconPlay} <span>Practicar (${Math.min(selectedGroup.daily_limit || 20, this.phrases.length)})</span>
                            </button>
                          ` : ''}

                          ${this.showSearchPhraseInput ? html`
                            <input
                              type="text"
                              id="gm-phrase-search-field"
                              class="gm-search-input"
                              style="max-width: 220px;"
                              placeholder="${selectedGroup.type === 'vocabulary' ? 'Buscar palabra...' : 'Buscar frase en inglés...'}"
                              .value="${this.searchPhraseText}"
                              @input="${(e) => { this.searchPhraseText = e.target.value; }}"
                            />
                          ` : ''}

                          <!-- Botón Hamburguesa 3 puntos -->
                          <div class="gm-menu-wrapper" style="position: relative;">
                            <button
                              type="button"
                              class="gm-icon-btn ${this.showGroupMenu ? 'active' : ''}"
                              title="Opciones del grupo"
                              @click="${(e) => { e.stopPropagation(); this.showGroupMenu = !this.showGroupMenu; }}"
                            >
                              ${iconMoreVertical}
                            </button>

                            ${this.showGroupMenu ? html`
                              <div class="gm-dropdown-menu" @click="${(e) => e.stopPropagation()}">
                                <button type="button" class="gm-dropdown-item" @click="${(e) => { this.showGroupMenu = false; this.openEditGroupModal(selectedGroup, e); }}">
                                  ${iconEdit} <span>Editar</span>
                                </button>
                                <button type="button" class="gm-dropdown-item" @click="${() => { this.showGroupMenu = false; this.openAddPhraseModal(); }}">
                                  ${iconPlus} <span>Agregar nuevo item</span>
                                </button>
                                <button type="button" class="gm-dropdown-item" @click="${() => { this.showGroupMenu = false; this.toggleSearchPhrase(); }}">
                                  ${iconSearch} <span>Buscar</span>
                                </button>
                                <button type="button" class="gm-dropdown-item danger" @click="${(e) => { this.showGroupMenu = false; this.handleDeleteGroup(selectedGroup, e); }}">
                                  ${iconTrash} <span>Eliminar</span>
                                </button>
                              </div>
                            ` : ''}
                          </div>
                        </div>
                      </div>

                      ${selectedGroup.type === 'vocabulary' ? html`
                        <div class="vocab-filter-wrap vocab-filter-bar">
                          <span class="vocab-filter-label">Estado Anki</span>
                          <div class="vocab-filter-controls">
                            <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDiffFilter === 'all'}" @click="${() => { this.vocabDiffFilter = 'all'; }}">Todas (${this.phrases.length})</button>
                            <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDiffFilter === 'new'}" @click="${() => { this.vocabDiffFilter = 'new'; }}"><span class="vocab-difficulty-mark" style="background: var(--primary-color);"></span>Nuevas</button>
                            <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDiffFilter === 'due'}" @click="${() => { this.vocabDiffFilter = 'due'; }}"><span class="vocab-difficulty-mark hard"></span>Pendientes</button>
                            <button type="button" class="vocab-filter-button" aria-pressed="${this.vocabDiffFilter === 'learning'}" @click="${() => { this.vocabDiffFilter = 'learning'; }}"><span class="vocab-difficulty-mark easy"></span>Aprendiendo</button>
                          </div>
                        </div>
                      ` : ''}

                      <!-- Lista de Frases -->
                      <div class="gm-phrases-scroll-area">
                        ${this.loadingPhrases
                          ? html`<p style="color: var(--text-muted);">Cargando frases...</p>`
                          : filteredPhrases.length === 0
                            ? html`
                                <div class="gm-empty-state">
                                  <p>No hay ${selectedGroup.type === 'vocabulary' ? 'palabras' : 'frases'} en este grupo.</p>
                                  <p style="font-size: 0.78rem;">Haz clic en el menú (⋮) y selecciona "Agregar nuevo item".</p>
                                </div>
                              `
                            : (() => {
                                let displayPhrases = filteredPhrases;
                                const getAnkiInfo = (phrase) => {
                                  const isNew = (!phrase.repetition_count || phrase.repetition_count === 0) && phrase.last_grade === null;
                                  if (isNew) return {
                                    code: 'new',
                                    label: 'Nueva',
                                    color: 'var(--primary-color)',
                                    bg: 'color-mix(in srgb, var(--primary-color) 15%, var(--card-bg))',
                                    border: 'color-mix(in srgb, var(--primary-color) 35%, var(--border-color))'
                                  };
                                  const isDue = (!phrase.due_date || Date.parse(phrase.due_date) <= Date.now());
                                  if (isDue) return {
                                    code: 'due',
                                    label: 'Pendiente',
                                    color: 'var(--danger-color)',
                                    bg: 'var(--danger-bg)',
                                    border: 'color-mix(in srgb, var(--danger-color) 35%, var(--border-color))'
                                  };
                                  return {
                                    code: 'learning',
                                    label: 'Aprendiendo',
                                    color: 'var(--success-color)',
                                    bg: 'var(--success-bg)',
                                    border: 'color-mix(in srgb, var(--success-color) 35%, var(--border-color))'
                                  };
                                };

                                if (selectedGroup.type === 'vocabulary' && this.vocabDiffFilter !== 'all') {
                                  displayPhrases = displayPhrases.filter(p => getAnkiInfo(p).code === this.vocabDiffFilter);
                                }
                                if (displayPhrases.length === 0) {
                                  return html`
                                    <div class="gm-empty-state">
                                      <p>No se encontraron palabras con el estado elegido.</p>
                                    </div>
                                  `;
                                }
                                return html`
                                  <table class="gm-phrases-table">
                                    <thead>
                                      <tr>
                                        <th>${selectedGroup.type === 'vocabulary' ? 'PALABRA / TÉRMINO' : 'FRASE EN INGLÉS'}</th>
                                        <th>${selectedGroup.type === 'vocabulary' ? 'ESTADO ANKI' : 'NIVEL'}</th>
                                        <th>REPASO SRS</th>
                                        <th style="text-align: right;">ACCIONES</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      ${displayPhrases.map(phrase => {
                                        const ankiInfo = selectedGroup.type === 'vocabulary' ? getAnkiInfo(phrase) : null;
                                        return html`
                                          <tr
                                            class="${this.selectedPhraseDetail?.id === phrase.id ? 'active' : ''}"
                                            @click="${() => this.selectPhraseForDetail(phrase)}"
                                          >
                                            <td class="gm-phrase-text-cell">${phrase.original_text}</td>
                                            <td>
                                              ${selectedGroup.type === 'vocabulary' ? html`
                                                <span class="gm-badge-sm2" style="background: ${ankiInfo.bg}; color: ${ankiInfo.color}; border: 1px solid ${ankiInfo.border}; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; white-space: nowrap;">
                                                  ${ankiInfo.label}
                                                </span>
                                              ` : html`
                                                <span class="gm-badge-cefr">${phrase.cefr_level || 'B1'}</span>
                                              `}
                                            </td>
                                            <td>
                                              <span class="gm-srs-status">
                                                ${phrase.repetition_state === 'review' ? `Int: ${phrase.interval}d` : 'Aprendizaje'}
                                              </span>
                                            </td>
                                            <td>
                                              <div class="gm-actions-cell">
                                                <button type="button" class="gm-icon-btn danger" title="Eliminar" @click="${(e) => this.handleDeletePhrase(phrase.id, e)}">
                                                  ${iconTrash}
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        `;
                                      })}
                                    </tbody>
                                  </table>
                                `;
                              })()}
                      </div>
                    `
                : html`
                    <div class="gm-empty-state">
                      <p>Selecciona un grupo a la izquierda o crea uno nuevo.</p>
                    </div>
                  `}
            </main>

            <!-- Separador y Panel Derecho: Edición de Frase Seleccionada (Sidebar Derecho Redimensionable) -->
            ${this.selectedPhraseDetail ? html`
              <div class="gm-details-resizer" @mousedown="${(e) => this._startResizeDetails(e)}"></div>

              <aside class="gm-details-sidebar" style="width: ${this.detailsWidth}px; min-width: ${this.detailsWidth}px;">
                <div class="gm-details-header">
                  <h3>${selectedGroup?.type === 'vocabulary' ? 'Editar Palabra' : 'Editar Frase'}</h3>
                  <button type="button" class="close-modal-btn" @click="${() => this.closePhraseDetail()}">${iconClose}</button>
                </div>
                <div class="gm-details-body">
                  <label class="gm-details-label">${selectedGroup?.type === 'vocabulary' ? 'Palabra (máx 35 caracteres):' : 'Frase en inglés:'}</label>
                  <textarea
                    class="gm-details-textarea"
                    maxlength="${selectedGroup?.type === 'vocabulary' ? '35' : '1000'}"
                    .value="${this.editPhraseText}"
                    @input="${(e) => { this.editPhraseText = e.target.value; }}"
                  ></textarea>

                  ${selectedGroup?.type === 'vocabulary' ? html`
                    <div style="font-size: 0.72rem; text-align: right; color: ${this.editPhraseText.length >= 35 ? 'var(--danger-color)' : 'var(--text-muted)'}; margin-top: -8px; margin-bottom: 8px;">
                      ${this.editPhraseText.length} / 35 caracteres
                    </div>
                  ` : html`
                    <label class="gm-details-label">Nivel MCER:</label>
                    <select
                      class="gm-details-select"
                      .value="${this.editPhraseLevel}"
                      @change="${(e) => { this.editPhraseLevel = e.target.value; }}"
                    >
                      ${['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(lvl => html`
                        <option value="${lvl}" ?selected="${this.editPhraseLevel === lvl}">${lvl}</option>
                      `)}
                    </select>
                  `}

                  ${selectedGroup?.type === 'vocabulary' ? (() => {
                    const phrase = this.selectedPhraseDetail;
                    const isNew = (!phrase.repetition_count || phrase.repetition_count === 0) && phrase.last_grade === null;
                    let ankiInfo = { label: 'Nueva', color: 'var(--primary-color)', bg: 'var(--primary-btn-bg)', border: 'var(--primary-btn-border)' };
                    if (!isNew) {
                      const isDue = (!phrase.due_date || Date.parse(phrase.due_date) <= Date.now());
                      ankiInfo = isDue 
                        ? { label: 'Pendiente hoy', color: 'var(--danger-color)', bg: 'var(--danger-bg)', border: 'var(--danger-color)' }
                        : { label: 'Aprendiendo / Revisada', color: 'var(--success-color)', bg: 'var(--success-bg)', border: 'var(--success-color)' };
                    }
                    return html`
                      <div style="background: ${ankiInfo.bg}; border: 1px solid ${ankiInfo.border}; color: ${ankiInfo.color}; padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; margin-bottom: 10px;">
                        Estado: ${ankiInfo.label}
                      </div>
                    `;
                  })() : ''}

                  <div class="gm-details-info-box">
                    <div>
                      <span class="gm-details-info-title">Estado SRS:</span>
                      <span>${this.selectedPhraseDetail.repetition_state === 'review' ? `Repaso (${this.selectedPhraseDetail.interval}d)` : 'Aprendizaje'}</span>
                    </div>
                    <div>
                      <span class="gm-details-info-title">Repeticiones exitosas (n):</span>
                      <span>${this.selectedPhraseDetail.repetition_count || 0}</span>
                    </div>
                    <div>
                      <span class="gm-details-info-title">Factor de facilidad (EF):</span>
                      <span>${((this.selectedPhraseDetail.ease_factor || 250) / 100).toFixed(2)}</span>
                    </div>
                    <div>
                      <span class="gm-details-info-title">Fallos (Lapses):</span>
                      <span>${this.selectedPhraseDetail.lapses || 0}</span>
                    </div>
                  </div>

                  <div class="gm-details-actions">
                    <button type="button" class="PrimaryButton" style="flex: 1; height: 34px; font-size: 0.82rem;" @click="${() => this.savePhraseDetail()}">
                      Guardar Cambios
                    </button>
                    <button type="button" class="gm-icon-btn danger" style="padding: 6px 12px; height: 34px;" title="Eliminar" @click="${() => this.deletePhraseFromDetail()}">
                      ${iconTrash}
                    </button>
                  </div>
                </div>
              </aside>
            ` : ''}
          </div>`}

        ${renderCrudModal(this, selectedGroup)}
        ${renderImportModal(this)}
        ${renderDeleteConfirmationModals(this)}
      </div>
    `;
  }
}

if (!customElements.get('group-manager-view')) {
  customElements.define('group-manager-view', GroupManagerView);
}
