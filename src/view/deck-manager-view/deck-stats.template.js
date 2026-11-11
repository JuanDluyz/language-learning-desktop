import { html } from 'lit';

export function renderStatsView(context) {
  const stats = context.stats || {};
  const srs = stats.srs || { mastered: 0, review: 0, learning: 0, total: 0 };
  const levelCounts = stats.levelCounts || { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  const subLevelStr = stats.subLevelStr || 'B1.0';
  const progressPercent = stats.progressPercent || 0;
  const nextLevel = stats.nextLevel || 'B2';
  const macroLevel = stats.macroLevel || 'B1';
  const score = stats.score || 3.0;

  const totalSrs = Math.max(1, srs.total);
  const masteredPct = Math.round((srs.mastered / totalSrs) * 100);
  const reviewPct = Math.round((srs.review / totalSrs) * 100);
  const learningPct = Math.max(0, 100 - masteredPct - reviewPct);

  const maxLevelCount = Math.max(1, ...Object.values(levelCounts));

  return html`
    <div class="gm-stats-wrapper">
      <!-- Hero: Nivel Sutil e Input Comprensible -->
      <div class="gm-stats-hero">
        <div class="gm-stats-hero-header">
          <h2 class="gm-stats-hero-title">
            <span>Nivel Adaptativo (Teoría SLA de Krashen)</span>
          </h2>
          <span class="gm-level-badge">Nivel Interno: ${subLevelStr} (Score: ${score.toFixed(2)})</span>
        </div>

        <p style="margin: 0; font-size: 0.84rem; color: var(--text-soft); line-height: 1.4;">
          Progreso sutil administrado automáticamente según tus respuestas en el sistema de repetición espaciada (SRS) y precisión de transcripción.
        </p>

        <div class="gm-level-track">
          <div class="gm-level-labels">
            <span>Macro Nivel: ${macroLevel}</span>
            <span>${progressPercent}% completado hacia ${nextLevel}</span>
          </div>
          <div class="gm-level-bar-bg">
            <div class="gm-level-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
      </div>

      <!-- KPI Grid -->
      <div class="gm-stats-grid">
        <div class="gm-stat-card">
          <span class="gm-stat-label">Carpetas / Grupos</span>
          <span class="gm-stat-value">${stats.totalGroups || 0}</span>
          <span class="gm-stat-desc">Grupos activos en base de datos</span>
        </div>
        <div class="gm-stat-card">
          <span class="gm-stat-label">Frases Estáticas</span>
          <span class="gm-stat-value">${stats.totalStaticPhrases || 0}</span>
          <span class="gm-stat-desc">Frases creadas y precargadas</span>
        </div>
        <div class="gm-stat-card">
          <span class="gm-stat-label">Frases Dinámicas IA</span>
          <span class="gm-stat-value">${stats.totalDynamicPhrases || 0}</span>
          <span class="gm-stat-desc">Frases generadas guardadas</span>
        </div>
        <div class="gm-stat-card">
          <span class="gm-stat-label">Ratio Input Comprensible</span>
          <span class="gm-stat-value">80% / 20%</span>
          <span class="gm-stat-desc">80% conocido (i) + 20% desafío (i+1)</span>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="gm-charts-row">
        <!-- Gráfico SRS -->
        <div class="gm-chart-card">
          <h3 class="gm-chart-title">Distribución de Memoria y Repetición (SRS)</h3>
          
          <div class="gm-srs-stacked-bar">
            <div class="gm-srs-segment mastered" style="width: ${masteredPct}%;" title="Dominadas: ${srs.mastered}"></div>
            <div class="gm-srs-segment review" style="width: ${reviewPct}%;" title="En Repaso: ${srs.review}"></div>
            <div class="gm-srs-segment learning" style="width: ${learningPct}%;" title="Aprendiendo: ${srs.learning}"></div>
          </div>

          <div class="gm-legend-row">
            <div class="gm-legend-item">
              <span class="gm-legend-dot mastered"></span>
              <span>Dominadas (${srs.mastered})</span>
            </div>
            <div class="gm-legend-item">
              <span class="gm-legend-dot review"></span>
              <span>En Repaso (${srs.review})</span>
            </div>
            <div class="gm-legend-item">
              <span class="gm-legend-dot learning"></span>
              <span>Aprendiendo (${srs.learning})</span>
            </div>
          </div>
        </div>

        <!-- Gráfico por Niveles MCER -->
        <div class="gm-chart-card">
          <h3 class="gm-chart-title">Distribución de Contenido por Nivel MCER</h3>
          
          <div class="gm-level-bar-chart">
            ${['A1', 'A2', 'B1', 'B2', 'C1'].map((lvl) => {
              const count = levelCounts[lvl] || 0;
              const barHeight = Math.max(4, Math.round((count / maxLevelCount) * 100));
              return html`
                <div class="gm-bar-col">
                  <span style="font-size: 0.7rem; color: var(--text-muted);">${count}</span>
                  <div class="gm-bar-fill-vertical" style="height: ${barHeight}%;"></div>
                  <span class="gm-bar-label">${lvl}</span>
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    </div>
  `;
}
