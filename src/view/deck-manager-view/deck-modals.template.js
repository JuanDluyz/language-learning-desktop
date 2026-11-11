import { html } from 'lit';
import { iconClose, iconFolder, iconTrash } from '../../common/ui-icons.constants.js';

export function renderCrudModal(context, selectedGroup) {
  if (!context.modalType) return '';

  return html`
    <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && context.closeModal()}">
      <div class="home-modal-card">
        <header class="modal-header">
          <h3>
            ${context.modalType === 'create-group' ? 'Crear Nuevo Grupo' : ''}
            ${context.modalType === 'edit-group' ? 'Editar Grupo' : ''}
            ${context.modalType === 'create-phrase' ? (selectedGroup?.type === 'vocabulary' ? 'Agregar Nueva Palabra' : 'Agregar Nueva Frase') : ''}
          </h3>
          <button type="button" class="close-modal-btn" @click="${() => context.closeModal()}">${iconClose}</button>
        </header>

        <div class="modal-body">
          ${context.modalType === 'create-group' || context.modalType === 'edit-group' ? html`
            ${context.modalType === 'create-group' ? html`
              <div class="preset-templates-container">
                <span class="preset-label">Plantillas rápidas:</span>
                <div class="preset-chips">
                  <button type="button" class="preset-chip ${context.modalInputText === 'Viajes y Aeropuertos' ? 'active' : ''}" @click="${() => context.applyPreset({ type: 'dynamic_preset', name: 'Viajes y Aeropuertos', level: 'A2', topic: 'Airport & Hotel Conversations', count: 5 })}">Viajes</button>
                  <button type="button" class="preset-chip ${context.modalInputText === 'Inglés de Negocios' ? 'active' : ''}" @click="${() => context.applyPreset({ type: 'dynamic_preset', name: 'Inglés de Negocios', level: 'B1', topic: 'Business Meetings & Office', count: 5 })}">Negocios</button>
                  <button type="button" class="preset-chip ${context.modalInputText === 'Vida Cotidiana' ? 'active' : ''}" @click="${() => context.applyPreset({ type: 'dynamic_preset', name: 'Vida Cotidiana', level: 'A1', topic: 'Daily Routines & Family', count: 5 })}">Cotidiano</button>
                  <button type="button" class="preset-chip ${context.modalInputText === 'Entrevista Laboral' ? 'active' : ''}" @click="${() => context.applyPreset({ type: 'dynamic_preset', name: 'Entrevista Laboral', level: 'B2', topic: 'Job Interview Q&A', count: 5 })}">Entrevista</button>
                  <button type="button" class="preset-chip ${context.groupType === 'static' ? 'active' : ''}" @click="${() => context.applyPreset({ type: 'static', name: 'Mi Vocabulario', initialText: '' })}">Manual</button>
                </div>
              </div>

              <div class="group-type-tabs">
                <button type="button" class="group-tab ${context.groupType === 'dynamic_preset' ? 'active' : ''}" @click="${() => { context.groupType = 'dynamic_preset'; }}">
                  Inteligente (IA)
                </button>
                <button type="button" class="group-tab ${context.groupType === 'static' ? 'active' : ''}" @click="${() => { context.groupType = 'static'; }}">
                  Lista Manual
                </button>
                <button type="button" class="group-tab ${context.groupType === 'vocabulary' ? 'active' : ''}" @click="${() => { context.groupType = 'vocabulary'; }}">
                  Vocabulario (SM-2)
                </button>
              </div>
            ` : ''}

            ${context.groupType === 'vocabulary' ? html`
              <div style="font-size: 0.76rem; color: var(--success-color); background: var(--success-bg); border: 1px solid color-mix(in srgb, var(--success-color) 25%, var(--border-color)); padding: 8px 10px; border-radius: 6px; margin-bottom: 8px;">
                Grupo de vocabulario: Términos o palabras cortas. La dificultad se determina dinámicamente con SuperMemo-2.
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label">Nombre del Grupo:</label>
              <input
                type="text"
                class="modal-input"
                .value="${context.modalInputText}"
                @input="${(e) => { context.modalInputText = e.target.value; }}"
                placeholder="Ej. Vocabulario de Trabajo..."
              />
            </div>

            ${context.groupType === 'dynamic_preset' ? html`
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Nivel MCER:</label>
                  <div class="level-pills">
                    ${['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => html`
                      <button type="button" class="level-pill ${context.dynLevel === l ? 'active' : ''}" @click="${() => { context.dynLevel = l; }}">${l}</button>
                    `)}
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Frases / Sesión:</label>
                  <div class="count-pills">
                    ${[3, 5, 10].map((cnt) => html`
                      <button type="button" class="count-pill ${Number(context.dynCount) === cnt ? 'active' : ''}" @click="${() => { context.dynCount = cnt; }}">${cnt}</button>
                    `)}
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Tema / Gramática:</label>
                <input type="text" class="modal-input" placeholder="Ej. Airport, Hotel, Business Meetings..." .value="${context.dynTopic}" @input="${(e) => { context.dynTopic = e.target.value; }}" />
              </div>

              <div class="form-group">
                <label class="form-label">Palabras Clave (opcionales):</label>
                <input type="text" class="modal-input" placeholder="Ej. achieved, managed, led" .value="${context.dynTargetWords}" @input="${(e) => { context.dynTargetWords = e.target.value; }}" />
                <button type="button" class="btn-small" style="margin-top: 4px;" @click="${() => context.appendDueVocabulary('modal')}">
                  + Añadir palabras difíciles pendientes
                </button>
              </div>
            ` : html`
              <div class="form-group">
                <label class="form-label">Límite diario de repaso (SM-2):</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input
                    type="number"
                    class="modal-input"
                    style="width: 100px;"
                    min="1"
                    max="100"
                    .value="${context.modalDailyLimit ?? 20}"
                    @input="${(e) => { context.modalDailyLimit = Math.max(1, Number(e.target.value) || 20); }}"
                  />
                  <span style="font-size: 0.76rem; color: var(--text-muted);">palabras o frases por sesión diaria</span>
                </div>
              </div>

              ${context.modalType === 'create-group' ? html`
                <div class="form-group">
                  <label class="form-label">Frases o Palabras Iniciales (Opcional):</label>
                  <textarea
                    class="modal-input modal-textarea"
                    .value="${context.createInitialPhrasesText}"
                    @input="${(e) => { context.createInitialPhrasesText = e.target.value; }}"
                    placeholder="Escribe o pega varias oraciones en inglés (una por línea):&#10;We checked in at the airport.&#10;Where is gate number 5?"
                    rows="3"
                  ></textarea>
                  <span class="form-help">Se importarán automáticamente al guardar el grupo.</span>
                </div>
              ` : ''}
            `}
          ` : html`
            <label style="font-size: 0.78rem; color: var(--text-muted); display: block;">
              ${selectedGroup?.type === 'vocabulary' ? 'Palabra o término (máx. 35 caracteres):' : 'Texto de la nueva frase:'}
            </label>
            <input
              type="text"
              class="modal-input"
              maxlength="${selectedGroup?.type === 'vocabulary' ? '35' : '1000'}"
              .value="${context.modalInputText}"
              @input="${(e) => { context.modalInputText = e.target.value; }}"
              @keydown="${(e) => { if (e.key === 'Enter') context.handleSaveModal(); }}"
              placeholder="${selectedGroup?.type === 'vocabulary' ? 'Ej. resilient, accomplish...' : 'Ej. How are you doing today?...'}"
              autoFocus
            />
            ${selectedGroup?.type === 'vocabulary' ? html`
              <div style="font-size: 0.72rem; text-align: right; color: ${context.modalInputText.length >= 35 ? 'var(--danger-color)' : 'var(--text-muted)'}; margin-top: 4px;">
                ${context.modalInputText.length} / 35 caracteres
              </div>
            ` : ''}
          `}

          <div class="modal-actions" style="margin-top: 14px;">
            <button type="button" class="btn-modal-save" @click="${() => context.handleSaveModal()}">Guardar</button>
            <button type="button" class="btn-modal-cancel" @click="${() => context.closeModal()}">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderImportModal(context) {
  if (!context.showImportModal) return '';

  return html`
    <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && context.closeImportModal()}">
      <div class="home-modal-card gm-import-modal-card">
        <header class="modal-header">
          <h3>Importar Grupo desde Archivo</h3>
          <button type="button" class="close-modal-btn" @click="${() => context.closeImportModal()}">${iconClose}</button>
        </header>

        <div class="modal-body">
          <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0 0 10px 0;">
            Importa listas de frases o paquetes de Anki. Para Anki, elige un mazo y el campo que se guardará como texto de práctica.
          </p>

          <!-- Dropzone / File Picker -->
          <label
            style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; background: var(--card-soft-bg);"
            @dragover="${(e) => e.preventDefault()}"
            @drop="${(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) context.processSelectedFile(file); }}"
          >
            <div style="color: var(--primary-color); display: flex; justify-content: center; margin-bottom: 4px;">${iconFolder}</div>
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-color);">Arrastra tu archivo aquí o haz clic</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">Formatos aceptados: .apkg, .colpkg, .json, .csv, .txt</span>
            <input type="file" accept=".apkg,.colpkg,.json,.csv,.txt" style="display: none;" @change="${(e) => context.handleFileSelect(e)}" />
          </label>

          ${context.ankiLoading ? html`
            <p style="font-size: 0.78rem; color: var(--text-muted);">Leyendo el paquete de Anki...</p>
          ` : ''}

          ${context.ankiImportSession ? html`
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
              <span style="font-size: 0.76rem; color: var(--text-muted);">
                Paquete: <strong style="color: var(--text-color);">${context.ankiImportSession.fileName}</strong>
              </span>
              <label style="font-size: 0.76rem; color: var(--text-muted);">Mazo que se importará</label>
              <select
                class="custom-select"
                .value="${context.ankiSelectedDeckId}"
                ?disabled="${context.ankiLoading}"
                @change="${(e) => context.selectAnkiDeck(e.target.value)}"
              >
                ${context.ankiImportSession.decks.map((deck) => html`
                  <option value="${deck.id}">${deck.name} (${deck.cardCount} tarjetas)</option>
                `)}
              </select>

              <label style="font-size: 0.76rem; color: var(--text-muted);">Campo que se importará como texto</label>
              <select
                class="custom-select"
                .value="${context.ankiSelectedField}"
                ?disabled="${context.ankiLoading || context.ankiDeckFields.length === 0}"
                @change="${(e) => context.selectAnkiField(e.target.value)}"
              >
                ${context.ankiDeckFields.map((field) => html`
                  <option value="${field}">${field}</option>
                `)}
              </select>
            </div>
          ` : ''}

          ${context.importError ? html`
            <div style="background: var(--danger-bg); border: 1px solid color-mix(in srgb, var(--danger-color) 30%, var(--border-color)); color: var(--danger-color); padding: 8px 12px; border-radius: 6px; font-size: 0.78rem; margin-top: 10px;">
              ${context.importError}
            </div>
          ` : ''}

          ${context.importedDataPreview ? html`
            <div class="gm-import-preview-box">
              <div class="form-group" style="margin-bottom: 8px;">
                <label class="form-label">Nombre del nuevo grupo:</label>
                <input
                  type="text"
                  class="modal-input"
                  .value="${context.importedDataPreview.groupName}"
                  @input="${(e) => { context.importedDataPreview = { ...context.importedDataPreview, groupName: e.target.value }; }}"
                />
              </div>

              <!-- Selector de Tipo de Grupo al importar -->
              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label">Tipo de Grupo resultante:</label>
                <div class="group-type-tabs" style="margin-bottom: 4px;">
                  <button
                    type="button"
                    class="group-tab ${context.importGroupType === 'static' ? 'active' : ''}"
                    @click="${() => { context.importGroupType = 'static'; }}"
                  >
                    Lista Manual
                  </button>
                  <button
                    type="button"
                    class="group-tab ${context.importGroupType === 'vocabulary' ? 'active' : ''}"
                    @click="${() => { context.importGroupType = 'vocabulary'; }}"
                  >
                    Vocabulario (SM-2)
                  </button>
                </div>
                ${context.importGroupType === 'vocabulary' ? html`
                  <span style="font-size: 0.72rem; color: var(--success-color);">
                    Los ítems de vocabulario están limitados a 35 caracteres y se evaluarán con dificultad SuperMemo-2.
                  </span>
                ` : ''}
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span class="gm-import-preview-count">
                  ${context.importablePhraseCount} frases listas para importar
                  ${context.importPhraseDrafts ? ` (${context.importPhraseDrafts.filter(p => p.pendingDelete).length} omitidas)` : ''}
                </span>
                <button
                  type="button"
                  class="gm-btn-secondary"
                  ?disabled="${context.loadingAllImportPhrases}"
                  @click="${() => context.toggleAllImportPhrases()}"
                >
                  ${context.loadingAllImportPhrases ? 'Cargando lista...' : (context.showAllImportPhrases ? 'Ver resumen corto' : 'Ver y editar todas')}
                </button>
              </div>

              ${context.showAllImportPhrases && context.importPhraseDrafts ? html`
                <div class="gm-import-phrases-editor-list">
                  ${context.importPhraseDrafts.map((phrase, idx) => html`
                    <div class="gm-import-phrase-editor-row ${phrase.pendingDelete ? 'pending-delete' : ''}">
                      <span class="gm-import-phrase-index">${idx + 1}</span>
                      <input
                        type="text"
                        class="gm-import-phrase-input"
                        .value="${phrase.original_text}"
                        ?disabled="${phrase.pendingDelete}"
                        @input="${(e) => context.updateImportPhrase(idx, e.target.value)}"
                      />
                      <button
                        type="button"
                        class="gm-import-phrase-action ${phrase.pendingDelete ? 'undo' : 'remove'}"
                        @click="${() => context.toggleImportPhraseDeletion(idx)}"
                      >
                        ${phrase.pendingDelete ? 'Deshacer' : 'Quitar al importar'}
                      </button>
                    </div>
                  `)}
                </div>
                <p class="gm-import-deletion-note">
                  Las frases marcadas se omitirán solo al crear el grupo. Puedes deshacer la selección antes de importar o cancelar para descartar los cambios.
                </p>
              ` : html`
                <div class="gm-import-phrase-samples">
                  ${context.importedDataPreview.phrases.slice(0, 5).map((p, idx) => html`
                    <div class="gm-import-phrase-sample">
                      <span>${idx + 1}. ${p.original_text}</span>
                      <span class="gm-badge-cefr">${p.exercise_type || 'dictation'}</span>
                    </div>
                  `)}
                  ${context.importedDataPreview.phrases.length > 5 ? html`
                    <span class="gm-import-more-phrases">y ${(context.importedDataPreview.phraseCount || context.importedDataPreview.phrases.length) - 5} frases más...</span>
                  ` : ''}
                </div>
              `}
            </div>
          ` : ''}

          <div class="modal-actions" style="margin-top: 12px;">
            <button
              type="button"
              class="btn-modal-save"
              ?disabled="${!context.importedDataPreview || !context.importablePhraseCount || context.ankiLoading || context.ankiImporting || context.loadingAllImportPhrases}"
              @click="${() => context.handleConfirmImport()}"
            >
              ${context.ankiImporting ? 'Importando...' : 'Importar y Crear Grupo'}
            </button>
            <button type="button" class="btn-modal-cancel" @click="${() => context.closeImportModal()}">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderDeleteConfirmationModals(context) {
  return html`
    <!-- Modal Confirmación Eliminar Grupo -->
    ${context.confirmDeleteGroupTarget ? html`
      <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && (context.confirmDeleteGroupTarget = null)}">
        <div class="home-modal-card" style="max-width: 380px; text-align: center;">
          <div style="margin-bottom: 10px; color: var(--danger-color); display: flex; justify-content: center;">${iconTrash}</div>
          <h3 style="margin: 0 0 6px 0; font-size: 1rem; color: var(--text-color);">¿Eliminar Grupo?</h3>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 16px 0; line-height: 1.4;">
            ¿Estás seguro de eliminar <strong>"${context.confirmDeleteGroupTarget.name}"</strong> y todas sus frases?
          </p>
          <div class="modal-actions" style="justify-content: center; gap: 10px;">
            <button
              type="button"
              class="btn-modal-save"
              style="background: var(--danger-color); border: none; padding: 8px 18px; color: var(--primary-btn-text);"
              @click="${() => context.confirmExecuteDeleteGroup()}"
            >
              Sí, Eliminar
            </button>
            <button type="button" class="btn-modal-cancel" @click="${() => (context.confirmDeleteGroupTarget = null)}">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Modal Confirmación Eliminar Frase -->
    ${context.confirmDeletePhraseTargetId ? html`
      <div class="home-modal-overlay" @click="${(e) => e.target.classList.contains('home-modal-overlay') && (context.confirmDeletePhraseTargetId = null)}">
        <div class="home-modal-card" style="max-width: 360px; text-align: center;">
          <div style="margin-bottom: 10px; color: var(--danger-color); display: flex; justify-content: center;">${iconTrash}</div>
          <h3 style="margin: 0 0 6px 0; font-size: 0.95rem; color: var(--text-color);">¿Eliminar Frase?</h3>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0 0 16px 0;">
            ¿Confirmas que deseas eliminar esta frase?
          </p>
          <div class="modal-actions" style="justify-content: center; gap: 10px;">
            <button
              type="button"
              class="btn-modal-save"
              style="background: var(--danger-color); border: none; padding: 7px 16px; color: var(--primary-btn-text);"
              @click="${() => context.confirmExecuteDeletePhrase()}"
            >
              Eliminar
            </button>
            <button type="button" class="btn-modal-cancel" @click="${() => (context.confirmDeletePhraseTargetId = null)}">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    ` : ''}
  `;
}
