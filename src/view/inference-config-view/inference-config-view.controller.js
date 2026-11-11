import { validateSessionOptions } from '../../service/inference-config-service/inference-config.service.js';
import { store } from '../../store.js';

export class AiSetupController {
  constructor(host) {
    this.host = host;
  }

  setLevel(event) {
    this.host.level = event.target.value;
  }

  setTopic(event) {
    this.host.topic = event.target.value;
  }

  setCount(event) {
    this.host.count = Number(event.target.value);
  }

  startSession() {
    const validOptions = validateSessionOptions({
      level: this.host.level,
      topic: this.host.topic,
      tone: this.host.tone,
      count: this.host.count,
      targetWords: this.host.targetWords,
      customPrompt: this.host.customPrompt,
      integrateVocabulary: this.host.integrateVocabulary
    });

    this.host.dispatchEvent(new CustomEvent('start-ai-session', {
      detail: validOptions,
      bubbles: true,
      composed: true
    }));
  }

  cancel() {
    this.host.dispatchEvent(new CustomEvent('cancel', {
      bubbles: true,
      composed: true
    }));
  }

  async toggleTheme() {
    await store.toggleTheme();
  }
}
