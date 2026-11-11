import { html } from 'lit';
import { CLOUD_PROVIDERS } from '../../common/cloud-llm.adapter.js';

export function renderModelTab(context) {
  const isCloudMode = context.config.llm_execution_mode === 'cloud';
  const selectedProviderId = context.config.cloud_provider || 'openai';
  const activeProvider = CLOUD_PROVIDERS[selectedProviderId] || CLOUD_PROVIDERS.openai;
  const providerModels = activeProvider.models || [];
  const selectedCloudModel = context.config.cloud_model || activeProvider.defaultModel;

  return html`
    <div class="tab-page">
      <div class="page-header">
        <h2 class="page-title">Modelo e Inferencia de IA</h2>
        <p class="page-subtitle">Configura el modo de ejecución: 100% Local (GGUF sin internet) o Cloud adaptativo (BYOK - Bring Your Own Key).</p>
      </div>

      <!-- Selector de Modo de Ejecución (Pills) -->
      <div class="execution-mode-selector" style="display: flex; gap: 8px; margin-bottom: 18px; background: var(--card-soft-bg); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color);">
        <button
          type="button"
          class="mode-pill-btn ${!isCloudMode ? 'active' : ''}"
          style="flex: 1; padding: 10px 14px; border-radius: 6px; border: none; font-size: 0.84rem; font-weight: 600; cursor: pointer; transition: all 0.2s; ${!isCloudMode ? 'background: var(--primary-color); color: var(--primary-btn-text);' : 'background: transparent; color: var(--text-muted);'}"
          @click="${() => context.updateConfigField('llm_execution_mode', 'local')}"
        >
          Modo Local (GGUF Offline)
        </button>
        <button
          type="button"
          class="mode-pill-btn ${isCloudMode ? 'active' : ''}"
          style="flex: 1; padding: 10px 14px; border-radius: 6px; border: none; font-size: 0.84rem; font-weight: 600; cursor: pointer; transition: all 0.2s; ${isCloudMode ? 'background: var(--primary-color); color: var(--primary-btn-text);' : 'background: transparent; color: var(--text-muted);'}"
          @click="${() => context.updateConfigField('llm_execution_mode', 'cloud')}"
        >
          Modo Cloud (BYOK - API Key)
        </button>
      </div>

      <div class="settings-cards-list">
        ${isCloudMode ? html`
          <!-- SettingCard: Proveedor Cloud -->
          <div class="SettingCard">
            <div class="setting-info">
              <h4 class="setting-title">Proveedor de IA Cloud</h4>
              <p class="setting-desc">Selecciona el servicio al que deseas delegar el procesamiento de lenguaje natural.</p>
            </div>
            <div class="setting-control">
              <select class="custom-select" .value="${selectedProviderId}" @change="${(e) => context.handleCloudProviderChange(e.target.value)}">
                ${Object.values(CLOUD_PROVIDERS).map((p) => html`
                  <option value="${p.id}" ?selected="${p.id === selectedProviderId}">${p.name}</option>
                `)}
              </select>
            </div>
          </div>

          <!-- SettingCard: Modelo Cloud -->
          <div class="SettingCard" style="flex-direction: column; align-items: stretch; gap: 8px;">
            <div class="setting-info">
              <h4 class="setting-title">Modelo Cloud Objetivo</h4>
              <p class="setting-desc">Selecciona un modelo predefinido o introduce un identificador personalizado permitido por tu cuenta.</p>
            </div>
            <div class="setting-control" style="display: flex; gap: 8px; align-items: center; width: 100%;">
              <select class="custom-select" style="flex: 1;" .value="${selectedCloudModel}" @change="${(e) => context.updateConfigField('cloud_model', e.target.value)}">
                ${providerModels.map((m) => html`
                  <option value="${m.id}" ?selected="${m.id === selectedCloudModel}">${m.name}</option>
                `)}
                ${!providerModels.some(m => m.id === selectedCloudModel) && selectedCloudModel ? html`
                  <option value="${selectedCloudModel}" selected>${selectedCloudModel} (Personalizado)</option>
                ` : ''}
              </select>
              <input
                type="text"
                class="custom-input font-mono"
                style="width: 220px; font-size: 0.8rem; padding: 6px 10px;"
                placeholder="ID de modelo (ej. openai/gpt-oss-120b)"
                .value="${selectedCloudModel}"
                @input="${(e) => context.updateConfigField('cloud_model', e.target.value.trim())}"
                title="Identificador exacto del modelo enviado en el API"
              />
            </div>
          </div>

          <!-- SettingCard: API Key con Validación -->
          <div class="SettingCard" style="flex-direction: column; align-items: stretch; gap: 12px;">
            <div class="setting-info" style="margin-bottom: 4px;">
              <h4 class="setting-title">API Key Personal (${activeProvider.name})</h4>
              <p class="setting-desc">Ingresa tu clave de acceso. Se guardará de forma encriptada localmente.</p>
            </div>
            
            <div style="display: flex; gap: 8px; align-items: center;">
              <div style="position: relative; flex: 1;">
                <input
                  type="${context.showApiKey ? 'text' : 'password'}"
                  class="custom-input font-mono"
                  style="width: 100%; padding-right: 40px; box-sizing: border-box;"
                  placeholder="sk-..."
                  .value="${context.config.cloud_api_key || ''}"
                  @input="${(e) => { context.updateConfigField('cloud_api_key', e.target.value); context.keyValidationResult = null; }}"
                />
                <button
                  type="button"
                  style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.76rem; font-weight: 500;"
                  @click="${() => { context.showApiKey = !context.showApiKey; context.requestUpdate(); }}"
                >
                  ${context.showApiKey ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>

              <button
                type="button"
                class="btn-primary-purple"
                style="padding: 8px 14px; font-size: 0.8rem; white-space: nowrap;"
                ?disabled="${context.isValidatingKey || !context.config.cloud_api_key}"
                @click="${() => context.validateCloudApiKey()}"
              >
                ${context.isValidatingKey ? 'Probando...' : 'Validar Key'}
              </button>
            </div>

            ${context.isValidatingKey ? html`
              <div style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--primary-color); margin-top: 4px;">
                <div class="minimal-spinner-small"></div>
                <span>Enviando petición de 1 token para probar clave con ${activeProvider.name}...</span>
              </div>
            ` : ''}

            ${context.keyValidationResult ? html`
              <div style="padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; display: flex; align-items: center; gap: 8px; ${context.keyValidationResult.valid ? 'background: var(--success-bg); border: 1px solid var(--success-color); color: var(--success-color);' : 'background: var(--danger-bg); border: 1px solid var(--danger-color); color: var(--danger-color);'}" >
                <span>${context.keyValidationResult.valid ? '✓' : '✕'}</span>
                <span>${context.keyValidationResult.valid ? 'API Key válida y conexión exitosa.' : context.keyValidationResult.error}</span>
              </div>
            ` : ''}
          </div>
        ` : html`
          <!-- MODO LOCAL (GGUF) -->
          ${!context.selectedModel ? html`
            <div style="background: var(--danger-bg); border: 1px solid var(--danger-color); color: var(--danger-color); padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; font-size: 0.88rem; display: flex; align-items: center; gap: 10px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: var(--danger-color);">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div>
                <strong style="color: var(--danger-color); font-weight: 600;">No hay ningún modelo LLM local seleccionado</strong>
                <p style="margin: 2px 0 0 0; opacity: 0.85; font-size: 0.8rem;">Selecciona un archivo .gguf de la lista o añade uno nuevo. También puedes cambiar al modo Cloud (BYOK) para usar una API Key.</p>
              </div>
            </div>
          ` : ''}

          <!-- SettingCard 1: Añadir Nuevo Modelo (.gguf) -->
          <div class="SettingCard">
            <div class="setting-info">
              <h4 class="setting-title">Añadir Nuevo Modelo Local</h4>
              <p class="setting-desc">Importa un archivo .gguf a la carpeta local de modelos desde tu explorador o arrastrando el archivo.</p>
            </div>
            <div class="setting-control">
              <button type="button" class="btn-add-model" @click="${() => context.openAddModelModal()}">
                + Añadir Modelo (.gguf)
              </button>
            </div>
          </div>

          <!-- SettingCard 2: Selector de Modelo Activo -->
          <div class="SettingCard">
            <div class="setting-info">
              <h4 class="setting-title">Modelo IA Cargado en Memoria</h4>
              <p class="setting-desc">Selecciona el modelo .gguf a ejecutar localmente. Al cambiar de modelo, se cargará en RAM/VRAM.</p>
            </div>
            <div class="setting-control vertical-control">
              <select class="custom-select" .value="${context.selectedModel}" ?disabled="${context.isChangingModel}" @change="${(e) => context.handleModelSelect(e.target.value)}">
                <option value="">-- Sin Modelo LLM Local --</option>
                ${context.availableModels.map((m) => {
                  const isActive = (m === context.selectedModel);
                  const detail = (context.modelsDetails || []).find((d) => d.fileName === m);
                  const isCompatible = detail ? detail.compatible : true;
                  const label = isCompatible
                    ? `${m}${isActive ? ' [Activo]' : ''}`
                    : `[Incompatible] ${m}`;
                  return html`
                    <option value="${m}" ?selected="${isActive}">
                      ${label}
                    </option>
                  `;
                })}
              </select>
              ${context.isChangingModel ? html`
                <div class="model-changing-indicator" style="margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 0.78rem; color: var(--primary-color);">
                  <div class="minimal-spinner-small"></div>
                  <span>Cargando e inicializando modelo en memoria RAM/VRAM...</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- SettingCard 3: GPU Acceleration ToggleSwitch -->
          <div class="SettingCard">
            <div class="setting-info">
              <h4 class="setting-title">Aceleración por Hardware GPU (VRAM Offloading)</h4>
              <p class="setting-desc">Delega la computación a la GPU dedicada. Si se desactiva, usará únicamente CPU multi-hilo.</p>
            </div>
            <div class="setting-control">
              <button
                type="button"
                class="ToggleSwitch ${context.config.use_gpu === true ? 'on' : 'off'}"
                @click="${() => context.updateConfigField('use_gpu', context.config.use_gpu !== true)}"
              >
                <span class="knob"></span>
              </button>
            </div>
          </div>
        `}
      </div>

      ${context.modelError ? html`
        <div class="lbl_model_error">
          <span>${context.modelError}</span>
        </div>
      ` : ''}

      ${context.renderSaveButton()}
    </div>
  `;
}

export function renderModelModals(context) {
  return html`
    <!-- Modal para Añadir Nuevo Modelo (.gguf) con Progreso Porcentual -->
    ${context.showAddModelModal ? html`
      <div class="settings-modal-overlay" style="z-index: 10005;" @click="${(e) => e.target.classList.contains('settings-modal-overlay') && context.closeAddModelModal()}">
        <div class="add-model-modal-card">
          <header class="modal-header">
            <h3>Añadir Nuevo Modelo IA (.gguf)</h3>
            <button type="button" class="close-modal-btn" @click="${() => context.closeAddModelModal()}" title="Cerrar / Cancelar importación">✕</button>
          </header>

          <div class="modal-body">
            ${context.isImportingModel ? html`
              <div class="import-progress-container">
                <div class="minimal-spinner"></div>
                <h4 class="progress-title">
                  ${context.importProgress >= 96
                    ? `Precargando tensores de ${context.importFileName || 'Modelo GGUF'} en RAM/VRAM...`
                    : `Copiando e importando ${context.importFileName || 'Modelo GGUF'}...`}
                </h4>
                
                <div class="progress-bar-bg" style="width: 100%; height: 8px; background: var(--card-soft-bg); border-radius: 4px; overflow: hidden; margin: 12px 0 8px 0; border: 1px solid var(--border-color);">
                  <div class="progress-bar-fill" style="width: ${context.importProgress}%; height: 100%; background: var(--primary-color); transition: width 0.15s ease;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted);">
                  <span>${context.importProgress}%</span>
                  <span>${context.importCopiedFormatted && context.importTotalFormatted ? `${context.importCopiedFormatted} / ${context.importTotalFormatted}` : ''}</span>
                </div>

                <p class="progress-subtitle" style="margin-top: 10px; font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
                  ${context.importProgress >= 96
                    ? 'Cargando weights en memoria RAM/VRAM. Por favor espera: la app no estará disponible hasta finalizar.'
                    : 'Copiando archivo a la carpeta de modelos local y verificando integridad...'}
                </p>

                <div style="margin-top: 18px; text-align: center;">
                  <button type="button" class="btn-modal-cancel" style="padding: 8px 18px; font-size: 0.82rem; cursor: pointer;" @click="${() => context.cancelModelImport()}">
                    Cancelar Importación
                  </button>
                </div>
              </div>
            ` : html`
              <!-- DropZone dentro del modal -->
              <div
                class="model-dropzone ${context.isDraggingOver ? 'drag-over' : ''}"
                @dragover="${(e) => { e.preventDefault(); context.isDraggingOver = true; context.requestUpdate(); }}"
                @dragleave="${(e) => { e.preventDefault(); context.isDraggingOver = false; context.requestUpdate(); }}"
                @drop="${(e) => context.handleDropModelFile(e)}"
              >
                <div class="dropzone-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <div class="dropzone-text">
                  <strong>Arrastra y suelta tu archivo .gguf aquí</strong>
                  <span>o haz clic en el botón de abajo para explorar tus archivos</span>
                </div>
              </div>

              <div class="modal-actions-center">
                <button type="button" class="btn-import-model-modal" @click="${() => context.handleImportModel()}">
                  Explorar Archivos (.gguf)
                </button>
              </div>
            `}

            ${context.modelError ? html`
              <div class="lbl_model_error" style="margin-top: 14px;">
                <span>${context.modelError}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Modal Bloqueante de Carga e Inicialización al Seleccionar Modelo -->
    ${context.isChangingModel ? html`
      <div class="settings-modal-overlay" style="z-index: 10006;" @click="${(e) => e.target.classList.contains('settings-modal-overlay') && context.cancelModelImport()}">
        <div class="add-model-modal-card" style="max-width: 460px; text-align: center; padding: 28px;">
          <header class="modal-header" style="justify-content: flex-end; margin-bottom: 8px;">
            <button type="button" class="close-modal-btn" @click="${() => context.cancelModelImport()}" title="Cancelar inicialización">✕</button>
          </header>
          <div class="minimal-spinner" style="margin: 0 auto 16px auto;"></div>
          <h3 style="margin-bottom: 10px; color: var(--text-color); font-size: 1.15rem;">Cargando e Inicializando LLM en Memoria</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 22px; line-height: 1.5;">
            Precargando tensores y verificando buffers en RAM/VRAM.<br>
            <strong style="color: var(--primary-color);">No podrás usar la app hasta que la carga en memoria finalice.</strong>
          </p>
          <button type="button" class="btn-modal-cancel" style="padding: 9px 22px; cursor: pointer;" @click="${() => context.cancelModelImport()}">
            Cancelar Inicialización
          </button>
        </div>
      </div>
    ` : ''}
  `;
}
