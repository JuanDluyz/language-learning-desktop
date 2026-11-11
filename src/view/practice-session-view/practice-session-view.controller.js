// practice/practice.controller.js
import { normalizeGroupPhrases } from '../../service/practice-service/practice.service.js';
import { calculateSrsUpdate } from '../../common/srs.constants.js';
import { saveAppConfig } from '../../service/system-preferences-service/system-preferences.service.js';
import { normalizeText } from '../../common/helper.utilities.js';

export class PracticeController {
  constructor(host) {
    this.host = host; // Referencia a PracticeView
    this._disposed = false;
    this._activeSessionId = 0;
  }

  init() {
    this._disposed = false;
  }

  dispose() {
    this._disposed = true;
    this._activeSessionId += 1;
    if (this.host.mode === 'dynamic' && this.host.dynamicSessionId) {
      window.electronAPI?.cleanupDynamicSession?.(this.host.dynamicSessionId);
    }
  }

  isOperationActive(sessionId) {
    return !this._disposed && Boolean(this.host?.isConnected) && this._activeSessionId === sessionId;
  }

  _resetSessionState() {
    this.host.masteredPhraseIds = new Set();
    this.host.sessionCompleted = false;
    this.host.transcription = '';
    this.host.feedback = '';
    const textarea = this.host.querySelector?.('#InputText');
    if (textarea) textarea.value = '';
  }

  _normalizePhrases(phrases, prefix = 'phrase') {
    return (phrases || []).map((p, idx) => ({
      ...p,
      id: p.id || `${prefix}-${idx}`
    }));
  }

  getPendingPhrases() {
    if (!this.host.phrases?.length) return [];
    return this.host.phrases.filter(p => !this.host.masteredPhraseIds?.has(p.id));
  }

  async startSession() {
    const currentSession = ++this._activeSessionId;
    this.host.loading = true;
    this.host.feedback = '';
    this._resetSessionState();

    try {
      if (this.host.mode === 'group') {
        const phrases = window.electronAPI?.getDuePhrases
          ? await window.electronAPI.getDuePhrases(this.host.groupId)
          : await window.electronAPI?.getPhrases(this.host.groupId);

        if (!this.isOperationActive(currentSession)) return;

        if (!Array.isArray(phrases)) {
          throw new Error('La base de datos no devolvió una lista de frases.');
        }

        this.host.phrases = this._normalizePhrases(normalizeGroupPhrases(phrases), 'phrase');
        if (!this.host.phrases.length) throw new Error('No hay frases en este grupo.');

        this.host.currentIndex = Math.floor(Math.random() * this.host.phrases.length);
        await this.loadCurrentPhrase(currentSession);
      } else {
        await this.startDynamicSession(currentSession);
      }
    } catch (error) {
      if (!this.isOperationActive(currentSession)) return;
      this.host.feedback = error.message || 'No se pudo iniciar la sesión.';
      this.host.loading = false;
    }
  }

  async loadCurrentPhrase(currentSession = ++this._activeSessionId) {
    if (!this.isOperationActive(currentSession)) return;

    this.host.loading = true;
    this.host.transcription = '';
    this.host.feedback = '';
    const textarea = this.host.querySelector?.('#InputText');
    if (textarea) textarea.value = '';
    this.host.currentPhrase = this.host.phrases[this.host.currentIndex];
    this.host.lastSelectedWordIndexes = [];
    this.host.closeContextMenu?.();
    this.host.showOriginalText = !!this.host.autoRevealPhrase;
    this.host.currentAudioWordIndex = -1;
    this.host.audioUrl = '';

    try {
      if (!this.host.currentPhrase || !this.host.currentPhrase.original_text) {
        throw new Error('La frase actual no es válida.');
      }

      const audio = await window.electronAPI.synthesizeSpeech(
        this.host.currentPhrase.original_text,
        this.host.currentPhrase.id,
        this.host.currentPhrase.audio_path,
        true
      );

      // Si el componente fue desmontado o la sesión cambió mientras se sintetizaba
      if (!this.isOperationActive(currentSession)) return;

      this.host.audioUrl = audio?.audioUrl || '';

      if (this.host.mode === 'dynamic') {
        this.host.dynamicRecord = {
          id: `${this.host.dynamicSessionId}-${this.host.currentIndex}`,
          session_id: this.host.dynamicSessionId,
          original_text: this.host.currentPhrase.original_text,
          timestamp: new Date().toISOString(),
          audio_path: `public/audio/${audio.filename}`,
          cefr_level: this.host.currentPhrase.cefr_level || this.host.sessionOptions.level,
          topic: this.host.sessionOptions.topic
        };
        await window.electronAPI.saveDynamicPhrase(this.host.dynamicRecord);
      }
    } catch (error) {
      if (!this.isOperationActive(currentSession)) return;
      this.host.feedback = `No se pudo preparar el audio: ${error.message || 'error desconocido.'}`;
    } finally {
      if (this.isOperationActive(currentSession)) {
        this.host.loading = false;
      }
    }
  }

  async startDynamicSession(currentSession = ++this._activeSessionId) {
    this.host.loading = true;
    this.host.sessionNotice = '';
    this._resetSessionState();

    try {
      if (!this.host.dynamicSessionId) {
        const sid = await window.electronAPI.startDynamicSession();
        if (!this.isOperationActive(currentSession)) {
          if (sid) window.electronAPI?.cleanupDynamicSession?.(sid);
          return;
        }
        this.host.dynamicSessionId = sid;
      }

      const generationResult = await window.electronAPI.generateAdaptiveSession(
        this.host.sessionOptions,
        this.host.dynamicSessionId
      );

      // Si el usuario navegó a otra pantalla mientras el LLM procesaba
      if (!this.isOperationActive(currentSession)) {
        if (this.host.dynamicSessionId) {
          window.electronAPI?.cleanupDynamicSession?.(this.host.dynamicSessionId);
        }
        return;
      }

      const rawPhrases = generationResult?.phrases || generationResult;
      if (!Array.isArray(rawPhrases) || rawPhrases.length === 0) {
        throw new Error('El modelo no devolvió frases válidas.');
      }

      if (generationResult?.manualTargetOverflow > 0) {
        const omitted = generationResult.manualTargetOverflow;
        const applied = generationResult.manualTargetAppliedCount;
        this.host.sessionNotice = `La sesión admite ${applied} palabras manuales; se priorizaron las primeras ${applied} y ${omitted} quedaron fuera.`;
      }

      this.host.phrases = this._normalizePhrases(rawPhrases, 'dyn-phrase');
      this.host.currentIndex = Math.floor(Math.random() * this.host.phrases.length);
      await this.loadCurrentPhrase(currentSession);
    } catch (error) {
      if (!this.isOperationActive(currentSession)) return;
      this.host.feedback = error.message || 'No se pudo generar la frase.';
    } finally {
      if (this.isOperationActive(currentSession)) {
        this.host.loading = false;
      }
    }
  }

  previousPhrase() {
    const pending = this.getPendingPhrases();
    const list = pending.length > 0 ? pending : this.host.phrases;
    if (!list?.length) return;

    let currentPendingIdx = list.findIndex(p => p.id === this.host.currentPhrase?.id);
    if (currentPendingIdx === -1) currentPendingIdx = 0;

    const prevPendingIdx = (currentPendingIdx - 1 + list.length) % list.length;
    const prevPhrase = list[prevPendingIdx];
    const targetIdx = this.host.phrases.findIndex(p => p.id === prevPhrase.id);

    this.host.currentIndex = targetIdx >= 0 ? targetIdx : 0;
    this.loadCurrentPhrase();
  }

  nextPhrase() {
    const pending = this.getPendingPhrases();

    if (pending.length === 0) {
      this.host.sessionCompleted = true;
      this.host.requestUpdate();
      return;
    }

    let candidates = pending;
    if (pending.length > 1 && this.host.currentPhrase) {
      candidates = pending.filter(p => p.id !== this.host.currentPhrase.id);
    }

    const randomPhrase = candidates[Math.floor(Math.random() * candidates.length)];
    const nextIdx = this.host.phrases.findIndex(p => p.id === randomPhrase.id);

    this.host.currentIndex = nextIdx >= 0 ? nextIdx : 0;
    this.loadCurrentPhrase();
  }

  async ratePhrase(rating) {
    if (!this.host.currentPhrase) return;

    const grade = Number(rating);
    const currentPhrase = this.host.currentPhrase;
    let newSrs = calculateSrsUpdate(currentPhrase, grade);

    const srsPhraseId = currentPhrase.vocabulary_id || (this.host.mode === 'group' ? currentPhrase.id : null);
    if (window.electronAPI?.updatePhraseSrs && srsPhraseId) {
      const result = await window.electronAPI.updatePhraseSrs(srsPhraseId, grade);
      if (result?.srsData) newSrs = result.srsData;
    }

    this.host.currentPhrase = { ...currentPhrase, ...newSrs };
    const idx = this.host.phrases.findIndex(p => p.id === this.host.currentPhrase.id);
    if (idx !== -1) this.host.phrases[idx] = { ...this.host.phrases[idx], ...newSrs };

    if (!this.host.masteredPhraseIds) this.host.masteredPhraseIds = new Set();

    const scoreDeltas = [-0.01, -0.005, 0, 0.005, 0.015, 0.03];
    const delta = scoreDeltas[grade] || 0;
    if (window.electronAPI?.updateLevelScore && delta !== 0) {
      try {
        await window.electronAPI.updateLevelScore(delta);
      } catch (err) {
        console.warn('[Level Score] Update deferred:', err);
      }
    }

    if (grade >= 3) {
      this.host.masteredPhraseIds.add(this.host.currentPhrase.id);
    } else {
      this.host.masteredPhraseIds.delete(this.host.currentPhrase.id);
    }

    this.host.showOriginalText = false;
    this.nextPhrase();
  }

  async changeVoice(newVoice) {
    const currentConfig = this.host.activeConfig;
    const updatedConfig = this.host.isEdgeTts
      ? { ...currentConfig, tts_voice: newVoice }
      : { ...currentConfig, audio_accent: newVoice };

    this.host.config = updatedConfig;
    await saveAppConfig(updatedConfig);
    await this.loadCurrentPhrase();
  }

  async changeSpeed(newSpeed) {
    const currentConfig = this.host.activeConfig;
    const updatedConfig = { ...currentConfig, audio_speed: newSpeed };

    this.host.config = updatedConfig;
    await saveAppConfig(updatedConfig);
    await this.loadCurrentPhrase();
  }

  async evaluateTranscription() {
    this.host.showOriginalText = true;
    if (this.host.transcription && this.host.transcription.trim().length > 0) {
      this.host.showChat = true;
      await this.host.updateComplete;
      const chat = this.host.querySelector('chat-view');
      if (chat?.controller) {
        chat.controller.evaluate();
      }
    }
  }

  async restartSession() {
    this._resetSessionState();
    if (this.host.phrases?.length) {
      this.host.currentIndex = Math.floor(Math.random() * this.host.phrases.length);
      await this.loadCurrentPhrase();
    } else {
      await this.startSession();
    }
  }

  updateTranscription(event) {
    this.host.transcription = event.target.value;
  }

  async retryAudio() {
    if (!this.host.currentPhrase || this.host.loading) return;
    await this.loadCurrentPhrase();
  }

  checkTranscription() {
    const expected = normalizeText(this.host.currentPhrase?.original_text || '');
    const actual = normalizeText(this.host.transcription);
    this.host.feedback = actual === expected ? 'Correcto.' : 'No coincide. Revisa la frase e inténtalo de nuevo.';
  }

  goHome() {
    this.dispose();
    this.host.transcription = '';
    this.host.feedback = '';
    const textarea = this.host.querySelector?.('#InputText');
    if (textarea) textarea.value = '';
    this.host.dispatchEvent(new CustomEvent('go-home', { bubbles: true, composed: true }));
  }

  async saveAsStatic() {
    if (!this.host.dynamicRecord) {
      this.host.feedback = 'Genera o reproduce una frase antes de guardarla.';
      return;
    }
    await window.electronAPI.saveDynamicAsStatic(this.host.dynamicRecord);
    this.host.dynamicRecord = null;
    this.host.feedback = 'Frase guardada como estática.';
  }
}
