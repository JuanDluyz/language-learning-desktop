import { calculateSuperMemo2, INITIAL_EASE_FACTOR } from '../core/srs-engine-core/supermemo2-algorithm.core.js';

export const INITIAL_SRS = {
  ease_factor: Math.round(INITIAL_EASE_FACTOR * 100),
  interval: 0,
  repetition_count: 0,
  repetition_state: 'learning',
  lapses: 0,
  due_date: new Date().toISOString()
};

function calculateSrsEngineUpdate(phrase, grade) {
  const repetitionCount = (typeof phrase?.repetition_count === 'number' && phrase.repetition_count > 0)
    ? phrase.repetition_count
    : (phrase?.repetition_state === 'review' ? 1 : 0);
  const rawEase = phrase?.ease_factor ?? 250;
  const easeFactor = rawEase > 10 ? rawEase / 100 : rawEase;
  return calculateSuperMemo2({
    grade,
    repetitionCount,
    easeFactor,
    interval: phrase?.interval ?? 0,
    lapses: phrase?.lapses ?? 0
  });
}

export function getEstimatedIntervalText(phrase, grade) {
  const update = calculateSrsEngineUpdate(phrase, grade);
  return `${update.interval} d`;
}

export function calculateSrsUpdate(phrase, grade) {
  const update = calculateSrsEngineUpdate(phrase, grade);

  return {
    ease_factor: Math.round(update.easeFactor * 100),
    interval: update.interval,
    repetition_count: update.repetitionCount,
    repetition_state: update.repetitionState,
    lapses: update.lapses,
    due_date: update.dueDate
  };
}

/**
 * Clasifica la dificultad de un ítem/palabra según sus métricas de SuperMemo-2 (SM-2)
 * @param {Object} phrase
 * @returns {'easy' | 'medium' | 'hard'}
 */
export function getSm2Difficulty(phrase) {
  if (!phrase) return 'medium';
  const lapses = phrase.lapses || 0;
  const rawEase = phrase.ease_factor ?? 250;
  const ease = rawEase > 10 ? rawEase / 100 : rawEase;
  const interval = phrase.interval ?? 0;

  if (lapses > 0 || ease < 2.1 || (phrase.repetition_state === 'learning' && interval === 0)) {
    return 'hard';
  }
  if (interval >= 7 || ease >= 2.6) {
    return 'easy';
  }
  return 'medium';
}

/**
 * Obtiene la información visual formateada para insignias de dificultad SM-2
 * @param {Object} phrase
 */
export function getSm2DifficultyInfo(phrase) {
  const diff = getSm2Difficulty(phrase);
  switch (diff) {
    case 'easy':
      return {
        code: 'easy',
        label: 'Fácil (SM-2)',
        color: 'var(--success-color)',
        bg: 'var(--success-bg)',
        border: 'color-mix(in srgb, var(--success-color) 35%, var(--border-color))'
      };
    case 'medium':
      return {
        code: 'medium',
        label: 'Medio (SM-2)',
        color: 'var(--warning-color)',
        bg: 'var(--warning-bg)',
        border: 'color-mix(in srgb, var(--warning-color) 35%, var(--border-color))'
      };
    case 'hard':
      return {
        code: 'hard',
        label: 'Difícil (SM-2)',
        color: 'var(--danger-color)',
        bg: 'var(--danger-bg)',
        border: 'color-mix(in srgb, var(--danger-color) 35%, var(--border-color))'
      };
  }
}
