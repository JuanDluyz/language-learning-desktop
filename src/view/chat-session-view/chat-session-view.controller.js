import {
  buildSystemPrompt,
  buildEvaluationPrompt,
  buildWordDefinitionPrompt,
  buildWordExplanationPrompt,
  buildChatPayload,
  fetchModelAvailability,
  evaluateTranscriptionLocally
} from '../../service/chat-service/chat.service.js';
import { DEFAULT_PROMPTS, getEffectivePrompt } from '../../common/prompt-templates.constants.js';

export class ChatController {
  constructor(host) {
    this.host = host;
  }

  subscribeToStream() {
    if (!window.electronAPI?.onChatChunk) return;

    this.host.unsubscribe = [
      window.electronAPI.onChatChunk((data) => {
        if (!this.host?.isConnected) return;
        if (data.requestId === this.host.requestId) {
          this.host.response += data.chunk.replace(/\*/g, '');
          this.host.requestUpdate();
        }
      }),
      window.electronAPI.onChatFinished((data) => {
        if (!this.host?.isConnected) return;
        if (data.requestId !== this.host.requestId) return;
        const reply = (this.host.response || '').trim();
        const content = reply || 'No se recibió respuesta del tutor.';
        this.host.messages = [...this.host.messages, { role: 'assistant', content }];
        this.host.response = '';
        this.host.loading = false;
      }),
      window.electronAPI.onChatError((data) => {
        if (!this.host?.isConnected) return;
        if (data.requestId !== this.host.requestId) return;
        const errText = data.error || 'Ocurrió un error al procesar la solicitud.';
        this.host.messages = [...this.host.messages, { role: 'assistant', content: `[Error] ${errText}` }];
        this.host.response = '';
        this.host.loading = false;
      })
    ];
  }

  async loadModelStatus() {
    this.host.modelAvailable = await fetchModelAvailability();
  }

  async sendFreeChat() {
    const rawInput = (this.host.input || '').trim();
    const refs = this.host.referencedWords || [];

    if (!rawInput && refs.length === 0) return;

    let payloadText = '';
    let displayText = '';
    let customSys = null;

    if (refs.length > 0) {
      const refString = refs.join(', ');
      const chipPrefix = refs.map((r) => `@${r}`).join(' ');

      if (rawInput) {
        payloadText = `Sobre la palabra/expresión referenciada "${refString}" dentro del contexto de la frase "${this.host.phrase || ''}": ${rawInput}`;
        displayText = `${chipPrefix} ${rawInput}`;
      } else {
        payloadText = buildWordDefinitionPrompt(refString, this.host.phrase);
        displayText = chipPrefix;
        customSys = DEFAULT_PROMPTS.define_word_system;
        if (window.electronAPI?.getPrompts) {
          try {
            const dbPrompts = await window.electronAPI.getPrompts();
            customSys = getEffectivePrompt('define_word_system', dbPrompts) || DEFAULT_PROMPTS.define_word_system;
          } catch { }
        }
      }
    } else {
      payloadText = rawInput;
      displayText = rawInput;
    }

    if (payloadText) {
      this.host.referencedWords = [];
      this.send(payloadText, displayText, customSys);
    }
  }

  async evaluate() {
    if (!this.host.phrase) return;

    // Evaluación determinista rápida en JavaScript (0 ms)
    const localEval = evaluateTranscriptionLocally(this.host.phrase, this.host.userText);
    if (localEval.isHandled) {
      const uiUserMessage = {
        role: 'user',
        content: 'Evaluar frase',
        promptContent: `Evaluación de transcripción: "${this.host.userText || ''}"`
      };
      const assistantMessage = {
        role: 'assistant',
        content: localEval.feedback
      };
      this.host.messages = [...this.host.messages, uiUserMessage, assistantMessage];
      this.host.response = '';
      this.host.loading = false;
      this.host.requestUpdate();
      return;
    }

    let evalSys = DEFAULT_PROMPTS.eval_system;
    if (window.electronAPI?.getPrompts) {
      try {
        const dbPrompts = await window.electronAPI.getPrompts();
        evalSys = getEffectivePrompt('eval_system', dbPrompts) || DEFAULT_PROMPTS.eval_system;
      } catch { }
    }
    this.send(buildEvaluationPrompt(this.host.phrase, this.host.userText), 'Evaluar frase', evalSys);
  }

  async explainWord() {
    if (!this.host.selectedWord) return;
    let defineSys = DEFAULT_PROMPTS.define_word_system;
    if (window.electronAPI?.getPrompts) {
      try {
        const dbPrompts = await window.electronAPI.getPrompts();
        defineSys = getEffectivePrompt('define_word_system', dbPrompts) || DEFAULT_PROMPTS.define_word_system;
      } catch { }
    }
    this.send(
      buildWordDefinitionPrompt(this.host.selectedWord, this.host.phrase),
      `@${this.host.selectedWord}`,
      defineSys
    );
  }

  explainSelectedWord(word) {
    if (!word) return;
    this.host.selectedWord = word;
    this.explainWord();
  }

  send(content, displayContent = null, customSystemBase = null) {
    if (!content || this.host.loading || !this.host.modelAvailable || !window.electronAPI?.startChat) return;

    const baseSys = customSystemBase || this.host.defaultSystemPrompt;
    const systemPrompt = buildSystemPrompt(baseSys, this.host.level, this.host.phrase, this.host.tone);
    const { userMessage, messages } = buildChatPayload({
      systemPrompt,
      history: this.host.messages,
      userContent: content
    });

    const uiUserMessage = {
      ...userMessage,
      content: displayContent || content,
      promptContent: content
    };

    this.host.messages = [...this.host.messages, uiUserMessage];
    this.host.response = '';
    this.host.input = '';
    this.host.loading = true;
    this.host.requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.host.updateComplete.then(() => window.electronAPI.startChat(this.host.requestId, messages));
  }

  updateInput(event) {
    this.host.input = event.target.value;
  }

  updateWord(event) {
    this.host.selectedWord = event.target.value;
  }
}
