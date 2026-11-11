import { html } from 'lit';
import { PROMPT_GROUPS } from '../../common/prompt-templates.constants.js';

export function renderPromptsTab(context, customPrompts, selectedMeta, filteredPrompts) {
  return html`
    <div class="tab-page prompts-page">
      <div class="page-header">
        <h2 class="page-title">Prompts</h2>
        <p class="page-subtitle">Personaliza las instrucciones del sistema para la generación, evaluación y tutoría de IA.</p>
      </div>

      <div class="category-pills">
        <button
          type="button"
          class="CategoryPillBtn ${context.selectedCategory === 'all' ? 'active' : ''}"
          @click="${() => context.handleCategoryChange('all')}"
        >
          Todos
        </button>
        ${PROMPT_GROUPS.map((g) => html`
          <button
            type="button"
            class="CategoryPillBtn ${context.selectedCategory === g.id ? 'active' : ''}"
            @click="${() => context.handleCategoryChange(g.id)}"
          >
            ${g.title_es}
          </button>
        `)}
      </div>

      <div class="prompt-header-row">
        <div class="prompt-select-box">
          <select class="custom-select" .value="${context.selectedPromptKey}" @change="${(e) => context.handlePromptSelect(e.target.value)}">
            ${filteredPrompts.map((meta) => {
              const isCustom = Array.isArray(context.dbPrompts) && context.dbPrompts.some((p) => p.key === meta.key && p.is_custom === 1);
              return html`
                <option value="${meta.key}">
                  ${meta.title_es} ${isCustom ? '★' : ''}
                </option>
              `;
            })}
          </select>
          ${context.getPromptStatusBadge()}
        </div>

        <span class="prompt_stats_lbl">${context.getPromptStats()}</span>
      </div>

      <p class="prompt-meta-description">${selectedMeta?.title_es || ''}</p>

      <textarea
        id="PromptCodeEditor"
        class="PromptCodeEditor"
        .value="${context.promptText}"
        @input="${(e) => context.handlePromptTextChange(e)}"
        @keydown="${(e) => context.handleEditorKeyDown(e)}"
        placeholder="Escribe aquí las instrucciones personalizadas del prompt..."
        spellcheck="false"
      ></textarea>

      <div class="prompt-actions-bar">
        <button type="button" class="btn-save-prompt" @click="${() => context.saveCustomPrompt()}">
          Guardar Personalización (Ctrl+S)
        </button>
        <button
          type="button"
          class="btn-reset-prompt"
          ?disabled="${!Array.isArray(context.dbPrompts) || !context.dbPrompts.some((p) => p.key === context.selectedPromptKey && p.is_custom === 1)}"
          @click="${() => context.resetPromptToDefault()}"
        >
          Restaurar Predeterminado
        </button>
      </div>

      ${context.renderSaveButton()}
    </div>
  `;
}
