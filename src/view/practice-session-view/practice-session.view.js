import { LitElement, html } from 'lit';
import { PracticeController } from './practice-session-view.controller.js';
import { iconChevronLeft, iconChevronRight, iconPlay, iconPause, iconMessageSquare, iconMenu, iconVolume, iconSave, iconHome, iconCheckCircle, iconSparkles } from '../../common/ui-icons.constants.js';
import { cleanWordPunctuation } from '../../common/helper.utilities.js';
import { EDGE_NEURAL_VOICES, GTTS_ACCENTS } from '../../common/tts-voices.constants.js';
import { store } from '../../store.js';
import './practice-session.view.css';

const LOADING_PHRASES_DYNAMIC = [
  'Generando oraciones con IA local',
  'Adaptando el nivel de dificultad',
  'Construyendo contexto gramatical',
  'Sintetizando audio y pronunciación',
  'Preparando tu sesión personalizada'
];

const SRS_RATINGS = [
  { id: 1, label: 'Repetir', hint: 'No la recordé', description: 'Volver a repasar la frase', variant: 'repeat' },
  { id: 4, label: 'Bien', hint: 'Recordada', description: 'Recordada correctamente', variant: 'good' },
  { id: 5, label: 'Fácil', hint: 'Sin dudar', description: 'Recordada al instante sin esfuerzo', variant: 'easy' }
];

export class PracticeView extends LitElement {
  static properties = {
    mode: { type: String },
    groupId: { type: Number },
    sessionOptions: { type: Object },
    phrases: { type: Array },
    currentIndex: { type: Number },
    currentPhrase: { type: Object },
    audioUrl: { type: String },
    transcription: { type: String },
    feedback: { type: String },
    sessionNotice: { type: String },
    loading: { type: Boolean },
    isPlaying: { type: Boolean },
    showOriginalText: { type: Boolean },
    showChat: { type: Boolean },
    loadingPhraseIndex: { type: Number },
    showOptionsMenu: { type: Boolean },
    config: { type: Object },
    masteredPhraseIds: { type: Object },
    sessionCompleted: { type: Boolean },
    autoRevealPhrase: { type: Boolean },
    currentAudioWordIndex: { type: Number },
    contextMenu: { type: Object },
    contextAudioBusy: { type: Boolean }
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.mode = 'group';
    this.groupId = 0;
    this.sessionOptions = { level: 'A1', topic: 'Everyday Life', count: 5 };
    this.phrases = [];
    this.currentIndex = 0;
    this.currentPhrase = null;
    this.audioUrl = '';
    this.transcription = '';
    this.feedback = '';
    this.sessionNotice = '';
    this.loading = false;
    this.isPlaying = false;
    this.showOriginalText = false;
    this.showChat = false;
    this.dynamicSessionId = '';
    this.dynamicRecord = null;
    this.loadingPhraseIndex = 0;
    this._loadingInterval = null;
    this._autoPlayTimeout = null;

    this.isDraggingWords = false;
    this.dragStartIndex = -1;
    this.dragCurrentIndex = -1;
    this.wordSelectionButton = null;
    this.lastSelectedWordIndexes = [];
    this.contextAudioBusy = false;

    this.showOptionsMenu = false;
    this.config = store.getState().config || {};
    this.masteredPhraseIds = new Set();
    this.sessionCompleted = false;

    this.autoRevealPhrase = localStorage.getItem('auto_reveal_phrase') === 'true';
    this.currentAudioWordIndex = -1;
    this._contextAudio = null;
    this.contextMenu = { visible: false, x: 0, y: 0, targetWord: '', targetIndex: null, selectedIndexes: [] };

    this.controller = new PracticeController(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleGlobalMouseUp = this._handleGlobalMouseUp.bind(this);
    this._handleDocumentClick = this._handleDocumentClick.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.controller.init();
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('mouseup', this._handleGlobalMouseUp);
    window.addEventListener('click', this._handleDocumentClick);
    this._unsubscribeStore = store.subscribe((state) => {
      if (state.config) this.config = { ...state.config };
    });
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (!this.isConnected) return;

    if (changedProperties.has('loading')) {
      if (this.loading) {
        this._clearAutoPlayTimeout();

        if (this.mode === 'dynamic') {
          if (!this._loadingInterval) {
            this.loadingPhraseIndex = 0;
            this._loadingInterval = setInterval(() => {
              if (!this.isConnected) {
                this._clearLoadingInterval();
                return;
              }
              this.loadingPhraseIndex = (this.loadingPhraseIndex + 1) % LOADING_PHRASES_DYNAMIC.length;
            }, 2200);
          }
        }
      } else {
        this._clearLoadingInterval();

        if (this.audioUrl && this.currentPhrase && !this.sessionCompleted) {
          this._clearAutoPlayTimeout();
          this._autoPlayTimeout = setTimeout(() => {
            if (!this.isConnected) return;
            const audio = this.querySelector('audio');
            if (audio && !this.loading) {
              audio.play().then(() => {
                this.isPlaying = true;
              }).catch(err => console.log('Autoplay request deferred:', err));
            }
          }, 50);
        }
      }
    }
    if (
      (changedProperties.has('groupId') && changedProperties.get('groupId') !== undefined) ||
      (changedProperties.has('mode') && changedProperties.get('mode') !== undefined)
    ) {
      if (this.isConnected) {
        this.controller.startSession();
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller.dispose();
    this._stopAndDestroyAudio();
    this.transcription = '';
    this.feedback = '';
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('mouseup', this._handleGlobalMouseUp);
    window.removeEventListener('click', this._handleDocumentClick);
    if (this._unsubscribeStore) this._unsubscribeStore();
    this._clearLoadingInterval();
    this._clearAutoPlayTimeout();
  }

  _stopAndDestroyAudio() {
    this._clearAutoPlayTimeout();
    this.isPlaying = false;
    this.currentAudioWordIndex = -1;

    const audioEl = this.querySelector('audio');
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.currentTime = 0;
        audioEl.removeAttribute('src');
        audioEl.load();
      } catch {}
    }

    if (this._contextAudio) {
      try {
        this._contextAudio.pause();
        this._contextAudio.currentTime = 0;
        this._contextAudio.removeAttribute('src');
        this._contextAudio.load();
      } catch {}
      this._contextAudio = null;
    }
    this.audioUrl = '';
  }

  _clearAutoPlayTimeout() {
    if (this._autoPlayTimeout) {
      clearTimeout(this._autoPlayTimeout);
      this._autoPlayTimeout = null;
    }
  }

  _clearLoadingInterval() {
    if (this._loadingInterval) {
      clearInterval(this._loadingInterval);
      this._loadingInterval = null;
    }
  }

  _handleDocumentClick(e) {
    if (this.showOptionsMenu) {
      const dropdown = this.querySelector('.practice-options-dropdown');
      const menuBtn = this.querySelector('.practice-menu-btn');
      if (dropdown && !dropdown.contains(e.target) && menuBtn && !menuBtn.contains(e.target)) {
        this.showOptionsMenu = false;
      }
    }

    if (this.contextMenu.visible) {
      const menu = this.querySelector('.flow-word-context-menu');
      if (menu && !menu.contains(e.target)) this.closeContextMenu();
    }
  }

  get activeConfig() {
    return this.config || store.getState().config || {};
  }

  get isEdgeTts() {
    return (this.activeConfig.tts_engine || 'edge-tts') === 'edge-tts';
  }

  get currentVoice() {
    return this.isEdgeTts
      ? (this.activeConfig.tts_voice || 'en-US-AvaNeural')
      : (this.activeConfig.audio_accent || 'en-us');
  }

  async handleVoiceChange(e) {
    await this.controller.changeVoice(e.target.value);
  }

  async handleSpeedChange(e) {
    await this.controller.changeSpeed(e.target.value);
  }

  handleAutoRevealChange(e) {
    this.autoRevealPhrase = e.target.checked;
    localStorage.setItem('auto_reveal_phrase', this.autoRevealPhrase ? 'true' : 'false');
    if (this.autoRevealPhrase && this.currentPhrase) {
      this.showOriginalText = true;
    }
  }

  handleAudioTimeUpdate(e) {
    const audio = e.target;
    if (!audio || !audio.duration || !this.currentPhrase?.original_text) return;
    const words = this.currentPhrase.original_text.trim().split(/\s+/);
    if (words.length === 0) return;

    const progress = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
    const wordIndex = Math.min(words.length - 1, Math.floor(progress * words.length));
    if (wordIndex !== this.currentAudioWordIndex) {
      this.currentAudioWordIndex = wordIndex;
      this.requestUpdate();
    }
  }

  handleAudioEnded() {
    this.isPlaying = false;
    this.currentAudioWordIndex = -1;
    this.requestUpdate();
  }

  _handleKeyDown(e) {
    if (this.loading) return;

    if (e.key === 'Enter' && !this.showOriginalText && this.currentPhrase) {
      e.preventDefault();
      this.handleRevisar();
    }
  }

  firstUpdated() {
    this.controller.startSession();
  }

  toggleAudioPlay() {
    const audio = this.querySelector('audio');
    if (!audio) return;
    if (this.isPlaying) {
      audio.pause();
      this.isPlaying = false;
    } else {
      audio.play().then(() => {
        this.isPlaying = true;
      }).catch(err => console.error("Audio error:", err));
    }
  }

  handleWordMouseDown(index, e) {
    if (e?.button !== 0 && e?.button !== 2) return;
    e.preventDefault();
    this.wordSelectionButton = e.button;
    this.isDraggingWords = true;
    this.dragStartIndex = index;
    this.dragCurrentIndex = index;
    this.lastSelectedWordIndexes = [];
    this.requestUpdate();
  }

  handleWordMouseEnter(index) {
    if (this.isDraggingWords) {
      this.dragCurrentIndex = index;
      this.requestUpdate();
    }
  }

  async _handleGlobalMouseUp(e) {
    if (e?.button !== this.wordSelectionButton) return;
    if (!this.isDraggingWords) return;
    this.isDraggingWords = false;

    const start = Math.min(this.dragStartIndex, this.dragCurrentIndex);
    const end = Math.max(this.dragStartIndex, this.dragCurrentIndex);
    this.lastSelectedWordIndexes = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    const selectionButton = this.wordSelectionButton;
    this.wordSelectionButton = null;

    if (selectionButton === 2) {
      this.dragStartIndex = -1;
      this.dragCurrentIndex = -1;
      this.requestUpdate();
      return;
    }

    const words = (this.currentPhrase?.original_text || '').split(/\s+/);
    if (words.length > 0 && start >= 0 && end < words.length) {
      const selectedWords = words
        .slice(start, end + 1)
        .map(w => cleanWordPunctuation(w))
        .filter(Boolean)
        .join(' ');

      if (selectedWords) {
        this.showChat = true;
        await this.updateComplete;
        const chat = this.querySelector('chat-view');
        if (chat && chat.addReference) {
          chat.addReference(selectedWords);
        }
      }
    }

    this.dragStartIndex = -1;
    this.dragCurrentIndex = -1;
    this.requestUpdate();
  }

  async handleSrsRate(rating) {
    await this.controller.ratePhrase(rating);
  }

  async handleRevisar() {
    await this.controller.evaluateTranscription();
  }

  async handleWordClick(index, event) {
    if (event && event.button !== 0) return;
    if (this.wordSelectionButton === 2) return;
    if (this.isDraggingWords || this.dragStartIndex !== -1) {
      this.dragStartIndex = -1;
      this.dragCurrentIndex = -1;
      this.isDraggingWords = false;
      return;
    }

    const words = (this.currentPhrase?.original_text || '').split(/\s+/);
    const word = cleanWordPunctuation(words[index] || '') || (words[index] || '').trim();
    if (!word) return;

    this.showChat = true;
    await this.updateComplete;
    const chat = this.querySelector('chat-view');
    if (chat && chat.addReference) {
      chat.addReference(word);
    }
  }

  closeContextMenu() {
    this.contextMenu = {
      ...this.contextMenu,
      visible: false,
      showGroups: false,
      groups: [],
      groupsLoading: false
    };
    this.requestUpdate();
  }

  openContextMenu(index, event) {
    event.preventDefault();
    event.stopPropagation();
    const selectedIndexes = this.lastSelectedWordIndexes.includes(index)
      ? this.lastSelectedWordIndexes
      : [index];
    const words = this.getSelectedWordsFromIndexes(selectedIndexes);
    const menuWidth = 230;
    const menuHeight = 210;

    this.contextMenu = {
      visible: true,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
      targetWord: words.join(' '),
      targetIndex: index,
      selectedIndexes,
      showGroups: false,
      groups: [],
      groupsLoading: false
    };
    this.requestUpdate();
  }

  getSelectedWordsFromIndexes(indexes = []) {
    const phraseText = this.currentPhrase?.original_text || '';
    if (!phraseText) return [];
    const words = phraseText.split(/\s+/);
    const unique = [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0 && index < words.length))];
    return unique.map((index) => cleanWordPunctuation(words[index]) || words[index]).filter(Boolean);
  }

  async openContextGroupPicker() {
    this.contextMenu = {
      ...this.contextMenu,
      showGroups: true,
      groupsLoading: true,
      groups: [],
      groupError: ''
    };
    try {
      const groups = await window.electronAPI.getGroups();
      this.contextMenu = {
        ...this.contextMenu,
        groups: (groups || []).filter((group) => group.type === 'static' || group.type === 'vocabulary'),
        groupsLoading: false
      };
    } catch (error) {
      console.error('No se pudieron cargar los grupos:', error);
      this.contextMenu = {
        ...this.contextMenu,
        groupsLoading: false,
        groupError: 'No se pudieron cargar los grupos.'
      };
    }
    this.requestUpdate();
  }

  async addContextWordsToGroup(group) {
    const words = this.getSelectedWordsFromIndexes(this.contextMenu.selectedIndexes || []);
    if (!group?.id || words.length === 0) return;

    try {
      const entries = group.type === 'vocabulary' ? words : [words.join(' ')];
      for (const entry of entries) {
        await window.electronAPI.createPhrase(group.id, entry);
      }
      this.sessionNotice = `Se agregó ${entries.length === 1 ? 'el término' : `${entries.length} términos`} a ${group.name}.`;
    } catch (error) {
      console.error('No se pudieron agregar las palabras al grupo:', error);
      this.sessionNotice = error.message || 'No se pudieron agregar las palabras al grupo.';
    }
    this.closeContextMenu();
  }

  async handleContextAction(action) {
    const indexes = this.contextMenu.selectedIndexes?.length ? this.contextMenu.selectedIndexes : [this.contextMenu.targetIndex];
    const words = this.getSelectedWordsFromIndexes(indexes);
    const text = words.join(' ');

    switch (action) {
      case 'audio': {
        if (this.contextAudioBusy || !text) return;
        this.contextAudioBusy = true;
        this.requestUpdate();
        try {
          const audio = await window.electronAPI.synthesizeSpeech(text, `context-${Date.now()}`, null, true);
          if (!this.isConnected) return;
          const sound = new Audio(audio.audioUrl);
          this._contextAudio = sound;
          await new Promise((resolve, reject) => {
            sound.addEventListener('ended', () => {
              this._contextAudio = null;
              resolve();
            }, { once: true });
            sound.addEventListener('error', () => {
              this._contextAudio = null;
              reject(new Error('No se pudo reproducir el audio.'));
            }, { once: true });
            sound.play().catch(reject);
          });
        } catch (error) {
          console.error('No se pudo reproducir el audio seleccionado:', error);
          this.sessionNotice = error.message || 'No se pudo reproducir el audio seleccionado.';
        } finally {
          this.contextAudioBusy = false;
          this.requestUpdate();
        }
        break;
      }
      case 'group': {
        await this.openContextGroupPicker();
        break;
      }
      case 'definition': {
        if (!text) return;
        this.showChat = true;
        await this.updateComplete;
        const chat = this.querySelector('chat-view');
        if (chat?.controller?.explainSelectedWord) {
          chat.controller.explainSelectedWord(text);
        } else {
          this.sessionNotice = 'No se pudo abrir el tutor para consultar la definición.';
        }
        this.closeContextMenu();
        break;
      }
      default:
        break;
    }
  }

  renderWordButtons(phraseText) {
    if (!phraseText) return '';
    const words = phraseText.split(/\s+/);
    const start = Math.min(this.dragStartIndex, this.dragCurrentIndex);
    const end = Math.max(this.dragStartIndex, this.dragCurrentIndex);

    return html`
      <div class="FlowLayout original_text_display">
        ${words.map((word, idx) => {
          const isSelected = (this.dragStartIndex !== -1 && idx >= start && idx <= end) ||
            this.lastSelectedWordIndexes.includes(idx);
          const isSpeaking = this.isPlaying && idx === this.currentAudioWordIndex;
          const isSpokenPast = this.isPlaying && this.currentAudioWordIndex >= 0 && idx < this.currentAudioWordIndex;
          const clean = cleanWordPunctuation(word);

          let audioClass = '';
          if (isSpeaking) audioClass = 'audio-active-word';
          else if (isSpokenPast) audioClass = 'audio-past-word';

          return html`
            <button
              type="button"
              class="FlowWordButton ${isSelected ? 'selected-drag' : ''} ${audioClass}"
              data-word-index="${idx}"
              @mousedown="${(e) => this.handleWordMouseDown(idx, e)}"
              @click="${(e) => this.handleWordClick(idx, e)}"
              @mouseenter="${() => this.handleWordMouseEnter(idx)}"
              @contextmenu="${(e) => this.openContextMenu(idx, e)}"
              title="Agregar a las referencias: ${clean || word}"
            >
              ${word}
            </button>
          `;
        })}
      </div>
    `;
  }

  renderSrsButtons() {
    if (!this.currentPhrase) return '';
    return html`
      <div class="srs-buttons-inline">
        ${SRS_RATINGS.map(item => html`
          <button
            type="button"
            class="srs-btn srs-btn-${item.variant}"
            title="${item.description}"
            aria-label="${item.label}: ${item.description}"
            @click="${() => this.handleSrsRate(item.id)}"
          >
            <div class="srs-btn-top">
              <span class="srs-btn-name">${item.label}</span>
            </div>
            <span class="srs-btn-description">${item.hint}</span>
          </button>
        `)}
      </div>
    `;
  }

  render() {
    const total = this.phrases.length;
    const masteredCount = this.masteredPhraseIds ? this.masteredPhraseIds.size : 0;
    const progressPercent = total ? Math.min(100, (masteredCount / total) * 100) : 0;
    const context = this;
    const config = this.config || store.getState().config || {};
    const isEdge = (config.tts_engine || 'edge-tts') === 'edge-tts';
    const contextActionText = this.contextMenu.selectedIndexes?.length > 1 ? this.getSelectedWordsFromIndexes(this.contextMenu.selectedIndexes).join(' ') : (this.contextMenu.targetWord || '');

    return html`
      <div class="practice-screen-wrapper">
        <!-- Encabezado Superior -->
        <header class="practice-header">
          <button type="button" class="back-circle-btn" @click="${() => context.controller.goHome()}" title="Volver al inicio">
            ${iconChevronLeft}
          </button>
          
          <div class="header-center-info">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <span class="phrase-indicator">${masteredCount} de ${total} dominadas</span>
          </div>

          <button type="button" class="chat-header-toggle-btn ${this.showChat ? 'active' : ''}" @click="${() => { this.showChat = !this.showChat; }}" title="${this.showChat ? 'Ocultar tutor IA' : 'Abrir tutor IA'}">
            ${iconMessageSquare}
          </button>
        </header>

        <div class="practice-container ${this.showChat ? 'has-chat' : 'no-chat'}">
          <!-- Columna 0: Spring Elástico Izquierdo (solo cuando hay chat) -->
          ${this.showChat ? html`<div class="practice-left-spring"></div>` : ''}

          <!-- Columna Principal de Práctica -->
          <main class="practice-main-col">
            <div class="fixed-top-space"></div>

            ${this.sessionNotice ? html`
              <div class="practice-session-notice" role="status">${this.sessionNotice}</div>
            ` : ''}

                ${this.contextMenu.visible ? html`
                  <div
                    class="flow-word-context-menu"
                    style="position: fixed; left: ${this.contextMenu.x}px; top: ${this.contextMenu.y}px; z-index: 4000;"
                  >
                    <button
                      type="button"
                      class="flow-word-context-item"
                      ?disabled="${this.contextAudioBusy}"
                      @click="${() => this.handleContextAction('audio')}"
                    >
                      ${this.contextAudioBusy ? 'Preparando o reproduciendo audio...' : 'Reproducir audio'}
                    </button>
                    <button type="button" class="flow-word-context-item" @click="${() => this.handleContextAction('group')}">
                      Agregar a un grupo
                    </button>
                    <button type="button" class="flow-word-context-item" @click="${() => this.handleContextAction('definition')}">
                      Definición
                    </button>
                    ${this.contextMenu.showGroups ? html`
                      <div class="flow-word-context-groups" aria-label="Grupos disponibles">
                        ${this.contextMenu.groupsLoading
                          ? html`<div class="flow-word-context-group-status">Cargando grupos...</div>`
                          : this.contextMenu.groupError
                            ? html`<div class="flow-word-context-group-status">${this.contextMenu.groupError}</div>`
                            : this.contextMenu.groups.length
                              ? this.contextMenu.groups.map((group) => html`
                                <button
                                  type="button"
                                  class="flow-word-context-item flow-word-context-group"
                                  @click="${() => this.addContextWordsToGroup(group)}"
                                >
                                  <span>${group.name}</span>
                                  <small>${group.type === 'vocabulary' ? 'Vocabulario' : 'Estático'}</small>
                                </button>
                              `)
                              : html`<div class="flow-word-context-group-status">No hay grupos estáticos o de vocabulario.</div>`}
                      </div>
                    ` : ''}
                    <div class="flow-word-context-preview">${contextActionText || 'Selecciona una palabra'}</div>
                  </div>
                ` : ''}

                ${this.sessionCompleted ? html`
              <div class="session-completed-card">
                <div class="completed-icon-wrapper">
                  ${iconCheckCircle}
                </div>
                <h3 class="completed-title">¡Sesión Completada!</h3>
                <p class="completed-desc">Has repasado y dominado todas las frases de esta sesión.</p>
                <div class="completed-actions">
                  <button type="button" class="completed-btn primary" @click="${() => context.controller.restartSession()}">
                    Repetir Sesión
                  </button>
                  <button type="button" class="completed-btn secondary" @click="${() => context.controller.goHome()}">
                    Finalizar Sesión
                  </button>
                </div>
              </div>
            ` : html`
              <!-- Acción Central: Reproductor de Audio o Skeleton Loader -->
              ${this.loading
                ? html`
                    <div class="loading_widget">
                      <div class="spinner"></div>
                      <p class="play-hint loading-text-container">
                        ${this.mode === 'dynamic' ? html`
                          <span class="loading-phrase">${LOADING_PHRASES_DYNAMIC[this.loadingPhraseIndex || 0]}</span><span class="loading-dots-animated"></span>
                        ` : html`
                          <span class="loading-phrase">Preparando audio...</span><span class="loading-dots-animated"></span>
                        `}
                      </p>
                    </div>
                  `
                : html`
                    <div class="play_widget">
                      <button type="button" class="play-audio-btn ${this.isPlaying ? 'playing' : ''}" @click="${() => this.toggleAudioPlay()}" title="Escuchar audio">
                        ${this.isPlaying ? iconPause : iconPlay}
                      </button>
                      <p class="play-hint">Escucha la frase</p>
                      ${this.audioUrl
                        ? html`
                            <audio
                              src="${this.audioUrl}"
                              @timeupdate="${(e) => this.handleAudioTimeUpdate(e)}"
                              @ended="${() => this.handleAudioEnded()}"
                            ></audio>
                          `
                        : ''}
                    </div>
                  `}

              <!-- Entrada de Transcripción Centrada -->
              <div class="input-section">
                <textarea
                  id="InputText"
                  class="InputText"
                  .value="${this.transcription}"
                  @input="${(e) => context.controller.updateTranscription(e)}"
                  placeholder="¡Listo! Reproduce el audio y transcribe."
                  ?disabled="${this.loading || !this.currentPhrase}"
                ></textarea>
              </div>

              <!-- Display Interactivo de la Frase Original (FlowLayout original_text_display) -->
              ${this.showOriginalText && this.currentPhrase?.original_text
                ? this.renderWordButtons(this.currentPhrase.original_text)
                : ''}
            `}
          </main>

          <!-- Columna 2: Sidebar Derecha de Tutor/Chat -->
          <aside class="practice-sidebar-col ${!this.showChat ? 'hidden-chat' : ''}">
            <chat-view
              .phrase="${this.currentPhrase?.original_text || ''}"
              .userText="${this.transcription}"
              .level="${this.currentPhrase?.cefr_level || this.sessionOptions?.level || 'B1'}"
              .tone="${this.sessionOptions?.tone || 'Casual'}"
              @close-chat="${() => { this.showChat = false; }}"
            ></chat-view>
          </aside>
        </div>

        <!-- Navegación Inferior de Ancho Completo -->
        <footer class="bottom-nav">
          <div class="footer-left-options">
            <button
              type="button"
              class="nav-btn nav-circle-btn practice-menu-btn ${this.showOptionsMenu ? 'active' : ''}"
              @click="${(e) => { e.stopPropagation(); this.showOptionsMenu = !this.showOptionsMenu; }}"
              title="Opciones de la sesión"
            >
              ${iconMenu}
            </button>

            ${this.showOptionsMenu ? html`
              <div class="practice-options-dropdown" @click="${(e) => e.stopPropagation()}">
                <div class="dropdown-header">
                  <span class="dropdown-title">Opciones de Práctica</span>
                </div>

                <div class="dropdown-group">
                  <label class="dropdown-label">Voz / Acento</label>
                  <select class="dropdown-select" .value="${this.currentVoice}" @change="${(e) => this.handleVoiceChange(e)}" ?disabled="${this.loading}">
                    ${isEdge ? EDGE_NEURAL_VOICES.map(v => html`
                      <option value="${v.code}" ?selected="${v.code === this.currentVoice}">${v.label}</option>
                    `) : GTTS_ACCENTS.map(v => html`
                      <option value="${v.code}" ?selected="${v.code === this.currentVoice}">${v.label}</option>
                    `)}
                  </select>
                </div>

                <div class="dropdown-group">
                  <label class="dropdown-label">Velocidad de audio</label>
                  <select class="dropdown-select" .value="${config.audio_speed || 'normal'}" @change="${(e) => this.handleSpeedChange(e)}" ?disabled="${this.loading}">
                    <option value="normal">Normal (1.0x)</option>
                    <option value="slow">Lento (0.85x)</option>
                  </select>
                </div>

                <div class="dropdown-group" style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                  <label class="dropdown-label" style="margin: 0; cursor: pointer;" for="toggle-auto-reveal">Mostrar frase al iniciar</label>
                  <input
                    id="toggle-auto-reveal"
                    type="checkbox"
                    style="cursor: pointer; accent-color: var(--primary-color);"
                    .checked="${this.autoRevealPhrase}"
                    @change="${(e) => this.handleAutoRevealChange(e)}"
                  />
                </div>

                <div class="dropdown-divider"></div>

                <button type="button" class="dropdown-action-btn" @click="${() => { this.showOptionsMenu = false; context.controller.retryAudio(); }}" ?disabled="${this.loading}">
                  <span class="action-icon">${iconVolume}</span>
                  <span>Re-generar Audio</span>
                </button>

                ${this.mode === 'dynamic' ? html`
                  <button type="button" class="dropdown-action-btn" @click="${() => { this.showOptionsMenu = false; context.controller.saveAsStatic(); }}" ?disabled="${this.loading}">
                    <span class="action-icon">${iconSave}</span>
                    <span>Guardar Frase Actual</span>
                  </button>
                ` : ''}

                <div class="dropdown-divider"></div>

                <button type="button" class="dropdown-action-btn danger" @click="${() => { this.showOptionsMenu = false; context.controller.goHome(); }}">
                  <span class="action-icon">${iconHome}</span>
                  <span>Finalizar Sesión</span>
                </button>
              </div>
            ` : ''}
          </div>

          <button type="button" class="nav-btn nav-circle-btn" @click="${() => { this.showOriginalText = !!this.autoRevealPhrase; context.controller.previousPhrase(); }}" ?disabled="${this.loading || !total}" title="Frase anterior">
            ${iconChevronLeft}
          </button>
          
          ${!this.showOriginalText ? html`
            <button type="button" class="PrimaryButton btn_evaluate" @click="${() => this.handleRevisar()}" ?disabled="${this.loading || !this.currentPhrase}">
              Revisar
            </button>
          ` : this.renderSrsButtons()}

          <button type="button" class="nav-btn nav-circle-btn" @click="${() => { this.showOriginalText = !!this.autoRevealPhrase; context.controller.nextPhrase(); }}" ?disabled="${this.loading || !total}" title="Frase siguiente">
            ${iconChevronRight}
          </button>
        </footer>
      </div>
    `;
  }

}

if (!customElements.get('practice-view')) {
  customElements.define('practice-view', PracticeView);
}
