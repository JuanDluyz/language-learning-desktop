/**
 * Módulo Core: Reglas de Adquisición de Segundas Lenguas (SLA) y niveles Marco Común Europeo (CEFR)
 */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function normalizeCefrLevel(level, fallback = 'B1') {
  const normalized = String(level || fallback).toUpperCase().trim();
  return CEFR_LEVELS.includes(normalized) ? normalized : fallback;
}

export function calculateKrashenStep(learnerLevel, targetLevel) {
  const learnerIdx = CEFR_LEVELS.indexOf(normalizeCefrLevel(learnerLevel));
  const targetIdx = CEFR_LEVELS.indexOf(normalizeCefrLevel(targetLevel));
  
  // Regla Krashen i+1: El nivel objetivo no puede superar i+1
  if (targetIdx > learnerIdx + 1) {
    return CEFR_LEVELS[learnerIdx + 1];
  }
  return CEFR_LEVELS[targetIdx];
}
