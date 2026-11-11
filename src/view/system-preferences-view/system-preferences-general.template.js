import { html } from 'lit';

export function renderGeneralTab(context) {
  return html`
    <div class="tab-page">
      <div class="page-header">
        <h2 class="page-title">General</h2>
        <p class="page-subtitle">Configura tu nivel actual de aprendizaje, idioma del sistema y opciones de evaluación.</p>
      </div>

      <div class="settings-cards-list">
        <!-- SettingCard 0: Nivel Actual del Usuario (MCER) -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Nivel Actual del Usuario (MCER)</h4>
            <p class="setting-desc">Selecciona tu nivel de competencia base (A1 a C1). Los ejercicios estáticos y la IA graduarán el contenido según la hipótesis del input comprensible ($i+1$).</p>
          </div>
          <div class="setting-control">
            <select
              class="custom-select"
              .value="${context.config.level || 'B1'}"
              @change="${(e) => context.handleLevelChange(e.target.value)}"
            >
              <option value="A1">A1 - Principiante Inicial</option>
              <option value="A2">A2 - Elemental</option>
              <option value="B1">B1 - Intermedio</option>
              <option value="B2">B2 - Intermedio Alto</option>
              <option value="C1">C1 - Avanzado</option>
            </select>
          </div>
        </div>

        <!-- SettingCard 2: UI Language -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Idioma de Interfaz</h4>
            <p class="setting-desc">Idioma principal para los textos, menús y botones de la aplicación.</p>
          </div>
          <div class="setting-control">
            <select class="custom-select" .value="${context.config.ui_language || 'Español'}" @change="${(e) => context.updateConfigField('ui_language', e.target.value)}">
              <option value="Español">Español</option>
              <option value="English">English</option>
            </select>
          </div>
        </div>

        <!-- SettingCard 3: Review Language -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Idioma de Revisión</h4>
            <p class="setting-desc">Idioma en el que el tutor IA evaluará y explicará tus transcripciones.</p>
          </div>
          <div class="setting-control">
            <select class="custom-select" .value="${context.config.review_language || 'Español'}" @change="${(e) => context.updateConfigField('review_language', e.target.value)}">
              <option value="Español">Español</option>
              <option value="English">English</option>
            </select>
          </div>
        </div>

        <!-- SettingCard 4: Auto Review Toggle -->
        <div class="SettingCard">
          <div class="setting-info">
            <h4 class="setting-title">Revisión automática al revelar</h4>
            <p class="setting-desc">Solicitar automáticamente la evaluación del LLM al pulsar 'Revelar Respuesta'.</p>
          </div>
          <div class="setting-control">
            <button
              type="button"
              class="ToggleSwitch ${context.config.auto_review !== false ? 'on' : 'off'}"
              @click="${() => context.updateConfigField('auto_review', !(context.config.auto_review !== false))}"
            >
              <span class="knob"></span>
            </button>
          </div>
        </div>
      </div>

      ${context.renderSaveButton()}
    </div>
  `;
}
