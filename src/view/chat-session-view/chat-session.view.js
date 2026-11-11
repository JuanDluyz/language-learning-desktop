import { LitElement, html, css } from 'lit';
import { ChatController } from './chat-session-view.controller.js';
import { iconSend, iconMaximize, iconMinimize, iconClose, iconSparkles } from '../../common/ui-icons.constants.js';
import { DEFAULT_PROMPTS, getEffectivePrompt } from '../../common/prompt-templates.constants.js';

const defaultSystemPrompt = DEFAULT_PROMPTS.explain_system;

export class ChatView extends LitElement {
  static properties = {
    phrase: { type: String },
    userText: { type: String },
    level: { type: String },
    tone: { type: String },
    messages: { type: Array },
    input: { type: String },
    response: { type: String },
    loading: { type: Boolean },
    selectedWord: { type: String },
    modelAvailable: { type: Boolean },
    isExpanded: { type: Boolean },
    referencedWords: { type: Array }
  };

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .chat-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 100vh;
      padding: 16px;
      box-sizing: border-box;
      color: var(--text-color, #f0f0f0);
      background-color: var(--card-bg, #1e1e1e);
      border: none;
      border-left: 1px solid var(--border-color, #2a2a2a);
      border-radius: 0;
      box-shadow: none;
      transition: all 0.3s ease;
      overflow: hidden;
    }
    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color, #2a2a2a);
      flex-shrink: 0;
    }
    .chat-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .chat-title {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--primary-color, #a78bfa);
    }
    .chat-icon-btn {
      background: transparent;
      border: none;
      color: var(--text-soft, #a1a1aa);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s, background 0.2s;
    }
    .chat-icon-btn:hover {
      color: var(--text-color, #ffffff);
      background: var(--card-soft-bg, rgba(255, 255, 255, 0.1));
    }
    .chat-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 9998;
    }
    .chat-panel.chat-expanded-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90vw;
      max-width: 950px;
      height: 85vh;
      max-height: 700px;
      z-index: 9999;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
      padding: 16px 20px;
      border-radius: 14px;
      border: 1px solid var(--border-color, #2a2a2a);
    }
    .chat-panel.chat-expanded-modal .messages {
      flex: 1;
      min-height: 0;
      max-height: none;
    }
    .chat-panel.chat-expanded-modal .message {
      font-size: 0.85rem;
      padding: 10px 14px;
      line-height: 1.5;
    }
    .chat-panel.chat-expanded-modal textarea {
      height: 38px;
      min-height: 38px;
      font-size: 0.85rem;
      padding: 8px 12px;
      border-radius: 19px;
    }
    .chat-panel.chat-expanded-modal .btn-send-round {
      width: 38px;
      height: 38px;
    }
    .chat-panel.chat-expanded-modal .chat-title {
      font-size: 0.95rem;
    }
    .messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
      scrollbar-width: thin;
      scrollbar-color: var(--border-color) transparent;
    }
    .message {
      padding: 10px 14px;
      white-space: pre-wrap;
      border-radius: 10px;
      font-size: 0.9rem;
      line-height: 1.5;
      max-width: 90%;
    }
    .message.user {
      align-self: flex-end;
      background-color: var(--primary-color, #7c3aed);
      color: #ffffff;
      border-bottom-right-radius: 2px;
      box-shadow: 0 2px 10px rgba(124, 58, 237, 0.3);
    }
    .message.assistant {
      align-self: flex-start;
      background-color: var(--card-soft-bg, #262626);
      color: var(--text-color, #f0f0f0);
      border: 1px solid var(--border-color, #2a2a2a);
      border-bottom-left-radius: 2px;
    }
    .chat-reference-chips {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    .chat-ref-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 6px;
      background-color: var(--card-soft-bg, rgba(129, 140, 248, 0.12));
      border: 1px solid var(--primary-btn-border, rgba(129, 140, 248, 0.3));
      color: var(--primary-color);
      font-size: 0.75rem;
      font-weight: 500;
      user-select: none;
    }
    .chat-ref-chip .ref-badge {
      font-weight: 700;
      color: var(--primary-color, #818cf8);
      opacity: 0.9;
    }
    .chat-ref-chip .ref-text {
      font-family: inherit;
    }
    .chat-ref-chip .ref-remove-btn {
      background: transparent;
      border: none;
      color: var(--text-muted, #94a3b8);
      cursor: pointer;
      padding: 0 2px;
      font-size: 0.72rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      transition: color 0.15s, background 0.15s;
    }
    .chat-ref-chip .ref-remove-btn:hover {
      color: var(--text-color, #ffffff);
      background: var(--card-soft-bg, rgba(255, 255, 255, 0.15));
    }
    .chat-input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      margin-top: auto;
    }
    .chat-input-wrapper {
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background-color: var(--card-soft-bg, #262626);
      border: 1px solid var(--border-color, #2a2a2a);
      border-radius: 20px;
      min-height: 40px;
      box-sizing: border-box;
      transition: border-color 0.2s ease;
    }
    .chat-input-wrapper:focus-within {
      border-color: var(--primary-color, #7c3aed);
    }
    textarea {
      flex: 1;
      min-width: 100px;
      height: 24px;
      min-height: 24px;
      box-sizing: border-box;
      padding: 2px 0;
      color: var(--text-color, #f0f0f0);
      background: transparent;
      border: none;
      font-size: 0.86rem;
      font-family: inherit;
      resize: none;
      overflow: hidden !important;
      overflow-y: hidden !important;
      scrollbar-width: none !important;
    }
    textarea::-webkit-scrollbar {
      display: none;
    }
    textarea:focus {
      outline: none;
      border: none;
    }
    .btn-send-round {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background-color: var(--primary-color, #7c3aed);
      color: #ffffff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background-color 0.2s, transform 0.1s;
      box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
    }
    .btn-send-round:hover:not(:disabled) {
      background-color: var(--primary-hover, #6d28d9);
      transform: scale(1.05);
    }
    .btn-send-round:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
    }
    .status { color: var(--text-muted, #71717a); font-size: 0.82rem; margin: 4px 0; }

    /* Streaming Cursor */
    .streaming-cursor {
      display: inline-block;
      width: 2px;
      height: 1.1em;
      background-color: var(--primary-color, #a78bfa);
      margin-left: 3px;
      vertical-align: middle;
      animation: blink-cursor 0.8s infinite;
    }
    @keyframes blink-cursor {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* Thinking State Animations */
    .thinking-container {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-soft, #a1a1aa);
      font-size: 0.85rem;
      font-weight: 500;
    }
    .thinking-dots {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .thinking-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--primary-color, #a78bfa);
      animation: bounce-dot 1.4s infinite ease-in-out both;
    }
    .thinking-dot:nth-child(1) { animation-delay: -0.32s; }
    .thinking-dot:nth-child(2) { animation-delay: -0.16s; }
    .thinking-dot:nth-child(3) { animation-delay: 0s; }

    @keyframes bounce-dot {
      0%, 80%, 100% {
        transform: scale(0.6);
        opacity: 0.35;
      }
      40% {
        transform: scale(1.2);
        opacity: 1;
      }
    }

    .quick-actions-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .quick-action-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 14px;
      background: var(--card-soft-bg, #262626);
      border: 1px solid var(--border-color, #3f3f46);
      color: var(--text-soft, #a1a1aa);
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .quick-action-pill:hover:not(:disabled) {
      color: var(--primary-color);
      border-color: var(--primary-color);
      background: var(--card-soft-bg);
    }
    .quick-action-pill:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `;

  constructor() {
    super();
    this.phrase = '';
    this.userText = '';
    this.level = 'B1';
    this.tone = 'Casual';
    this.messages = [];
    this.input = '';
    this.response = '';
    this.loading = false;
    this.selectedWord = '';
    this.modelAvailable = false;
    this.isExpanded = false;
    this.referencedWords = [];
    this.unsubscribe = [];
    this.requestId = '';
    this.defaultSystemPrompt = defaultSystemPrompt;
    this.controller = new ChatController(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.controller.subscribeToStream();
    this.controller.loadModelStatus();
  }

  async firstUpdated() {
    if (window.electronAPI?.getPrompts) {
      try {
        const dbPrompts = await window.electronAPI.getPrompts();
        const effective = getEffectivePrompt('explain_system', dbPrompts);
        if (effective) this.defaultSystemPrompt = effective;
      } catch {}
    }
  }

  disconnectedCallback() {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    super.disconnectedCallback();
  }

  willUpdate(changed) {
    if (changed.has('phrase') && changed.get('phrase') !== undefined) {
      this.messages = [];
      this.response = '';
      this.input = '';
      this.selectedWord = '';
      this.referencedWords = [];
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('response') || changedProperties.has('loading') || changedProperties.has('messages')) {
      this.scrollToBottom();
    }
  }

  scrollToBottom() {
    this.updateComplete.then(() => {
      const messagesEl = this.shadowRoot?.querySelector('.messages');
      if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  }

  addReference(wordOrPhrase) {
    if (!wordOrPhrase) return;
    const clean = String(wordOrPhrase).trim();
    if (!clean) return;

    const existing = this.referencedWords || [];
    if (!existing.includes(clean)) {
      this.referencedWords = [...existing, clean];
    }
    this.requestUpdate();
    this.updateComplete.then(() => {
      const textarea = this.shadowRoot ? this.shadowRoot.querySelector('textarea') : this.querySelector('textarea');
      if (textarea) textarea.focus();
    });
  }

  removeReference(index) {
    const existing = this.referencedWords || [];
    this.referencedWords = existing.filter((_, idx) => idx !== index);
    this.requestUpdate();
  }

  clearReferences() {
    this.referencedWords = [];
    this.requestUpdate();
  }

  prefillInput(text) {
    this.input = text || '';
    this.requestUpdate();
    this.updateComplete.then(() => {
      const textarea = this.shadowRoot ? this.shadowRoot.querySelector('textarea') : this.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    });
  }

  handleCloseChat() {
    this.isExpanded = false;
    this.dispatchEvent(new CustomEvent('close-chat', { bubbles: true, composed: true }));
  }

  renderChatContent() {
    return html`
      <div class="messages">
        ${this.messages.filter((message) => message.role !== 'system').map((message) => html`
          <div class="message ${message.role}">${message.content}</div>
        `)}
        ${this.loading && this.response ? html`<div class="message assistant">${this.response}<span class="streaming-cursor"></span></div>` : ''}
        ${this.loading && !this.response ? html`
          <div class="message assistant" style="padding: 12px 14px;">
            <div class="thinking-container">
              <div class="thinking-dots">
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
              </div>
              <span>El tutor está pensando...</span>
            </div>
          </div>
        ` : ''}
      </div>

      ${!this.modelAvailable ? html`<p class="status">El tutor está deshabilitado porque no hay un modelo cargado.</p>` : ''}
      
      <div class="quick-actions-bar">
        <button type="button" class="quick-action-pill" @click="${() => this.controller.evaluate()}" ?disabled="${this.loading || !this.modelAvailable || !this.phrase}" title="Evaluar mi transcripción actual">
          <span>Evaluar frase</span>
        </button>
      </div>

      <div class="chat-input-row">
        <div class="chat-input-wrapper" @click="${(e) => {
          const ta = e.currentTarget.querySelector('textarea');
          if (ta && e.target !== ta) ta.focus();
        }}">
          ${this.referencedWords && this.referencedWords.length > 0 ? html`
            <div class="chat-reference-chips">
              ${this.referencedWords.map((word, idx) => html`
                <span class="chat-ref-chip">
                  <span class="ref-badge">@</span>
                  <span class="ref-text">${word}</span>
                  <button type="button" class="ref-remove-btn" @click="${(evt) => { evt.stopPropagation(); this.removeReference(idx); }}" title="Quitar referencia">✕</button>
                </span>
              `)}
            </div>
          ` : ''}
          <textarea
            .value="${this.input}"
            @input="${(event) => this.controller.updateInput(event)}"
            @keydown="${(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.controller.sendFreeChat(); } }}"
            placeholder="${this.referencedWords && this.referencedWords.length > 0 ? '' : 'Escribe una duda sobre la frase...'}"
            ?disabled="${this.loading || !this.modelAvailable || !this.phrase}"
          ></textarea>
        </div>

        <button type="button" class="btn-send-round" @click="${() => this.controller.sendFreeChat()}" ?disabled="${this.loading || !this.modelAvailable || (!this.input.trim() && (!this.referencedWords || this.referencedWords.length === 0))}" title="Enviar mensaje">
          ${iconSend}
        </button>
      </div>
    `;
  }

  render() {
    return html`
      ${this.isExpanded ? html`<div class="chat-modal-backdrop" @click="${() => { this.isExpanded = false; }}"></div>` : ''}
      <section class="chat-panel ${this.isExpanded ? 'chat-expanded-modal' : ''}">
        <div class="chat-header">
          <span class="chat-title">Tutor IA</span>
          <div class="chat-header-actions">
            <button type="button" class="chat-icon-btn" @click="${() => { this.isExpanded = !this.isExpanded; }}" title="${this.isExpanded ? 'Restaurar tamaño' : 'Expandir modal de chat'}">
              ${this.isExpanded ? iconMinimize : iconMaximize}
            </button>
            <button type="button" class="chat-icon-btn" @click="${() => this.handleCloseChat()}" title="Ocultar tutor IA">
              ${iconClose}
            </button>
          </div>
        </div>
        ${this.renderChatContent()}
      </section>
    `;
  }
}

customElements.define('chat-view', ChatView);


