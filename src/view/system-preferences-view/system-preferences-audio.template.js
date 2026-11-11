import { html } from 'lit';
import { EDGE_NEURAL_VOICES } from '../../common/tts-voices.constants.js';

export function renderAudioTab(context) {
  return html`
    <div class="tab-page">
      <div class="page-header">
        <h2 class="page-title">Audio y Sonido</h2>
        <p class="page-subtitle">Configura el motor de voz, acentos, velocidad de síntesis y dispositivo de salida.</p>
      </div>

      <div class="settings-cards-list">
        <!-- SettingCard 1: Output Audio -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Salida de audio</h4>
            <p class="setting-desc">Selecciona el altavoz o salida de audio para la reproducción de voz.</p>
          </div>
          <div class="setting-control">
            <select class="custom-select" .value="${context.config.audio_device || 'default'}" @change="${(e) => context.updateConfigField('audio_device', e.target.value)}">
              <option value="default">Predeterminado del sistema</option>
              <option value="speakers">Altavoces Internos</option>
              <option value="headphones">Auriculares / Headset</option>
            </select>
          </div>
        </div>

        <!-- SettingCard 2: Motor TTS -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Motor de Síntesis de Voz (TTS)</h4>
            <p class="setting-desc">Elige entre las voces neuronales avanzadas de Microsoft Edge o el motor básico gTTS.</p>
          </div>
          <div class="setting-control">
            <select class="custom-select" .value="${context.config.tts_engine || 'edge-tts'}" @change="${(e) => context.updateConfigField('tts_engine', e.target.value)}">
              <option value="edge-tts">Microsoft Edge Neural TTS (Voces Neuronales)</option>
              <option value="gtts">Google Translate TTS (Básico)</option>
            </select>
          </div>
        </div>

        <!-- SettingCard 3: Voz / Acento Seleccionado -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Voz / Acento Seleccionado</h4>
            <p class="setting-desc">Selecciona la voz exacta para la lectura de frases en inglés.</p>
          </div>
          <div class="setting-control vertical-control">
            ${(context.config.tts_engine || 'edge-tts') === 'edge-tts' ? html`
              <select class="custom-select" .value="${context.config.tts_voice || 'en-US-AvaNeural'}" @change="${(e) => context.updateConfigField('tts_voice', e.target.value)}">
                ${EDGE_NEURAL_VOICES.map((v) => html`
                  <option value="${v.code}">${v.label}</option>
                `)}
              </select>
            ` : html`
              <select class="custom-select" .value="${context.config.audio_accent || 'en-us'}" @change="${(e) => context.updateConfigField('audio_accent', e.target.value)}">
                <option value="en-us">en-us (Inglés EE.UU. gTTS)</option>
                <option value="en-uk">en-uk (Inglés Reino Unido gTTS)</option>
                <option value="en-au">en-au (Inglés Australiano gTTS)</option>
                <option value="en-ca">en-ca (Inglés Canadiense gTTS)</option>
                <option value="en-in">en-in (Inglés Hindú gTTS)</option>
              </select>
            `}
            <button
              type="button"
              class="btn-save-preset"
              style="margin-top: 8px; font-size: 0.8rem; padding: 6px 14px; cursor: pointer;"
              ?disabled="${context.isTestingVoice}"
              @click="${() => context.testVoice()}"
            >
              ${context.isTestingVoice ? 'Generando muestra de audio...' : 'Probar Voz Seleccionada'}
            </button>
          </div>
        </div>

        <!-- SettingCard 4: Velocidad de Lectura -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Velocidad de Lectura</h4>
            <p class="setting-desc">Ajusta el ritmo de pronunciación para facilitar la práctica auditiva.</p>
          </div>
          <div class="setting-control">
            <select class="custom-select" .value="${context.config.audio_speed || 'normal'}" @change="${(e) => context.updateConfigField('audio_speed', e.target.value)}">
              <option value="normal">Normal (1.0x)</option>
              <option value="slow">Lento (0.85x - Mejor comprensión)</option>
            </select>
          </div>
        </div>
      </div>

      ${context.renderSaveButton()}
    </div>
  `;
}
