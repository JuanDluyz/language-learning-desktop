/**
 * Modulo Core: Algoritmo SuperMemo-2 (SM-2) Puro
 * Calculo matematico determinista de intervalos y factores de facilidad mnemotecnicos.
 */

export const INITIAL_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;

function addDays(date, days) {
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + days);
  return dueDate.toISOString();
}

export function calculateSuperMemo2({
  grade,
  repetitionCount = 0,
  easeFactor = INITIAL_EASE_FACTOR,
  interval = 0,
  lapses = 0,
  now = new Date()
}) {
  const q = Number(grade);
  if (!Number.isInteger(q) || q < 0 || q > 5) {
    throw new RangeError('La calificacion SM-2 debe ser un entero entre 0 y 5.');
  }

  const previousRepetitions = Math.max(0, Math.trunc(Number(repetitionCount) || 0));
  let parsedEaseFactor = Number(easeFactor);
  if (parsedEaseFactor > 10) {
    parsedEaseFactor = parsedEaseFactor / 100;
  }
  const previousEaseFactor = Math.max(MIN_EASE_FACTOR, Number.isFinite(parsedEaseFactor) ? parsedEaseFactor : INITIAL_EASE_FACTOR);
  const previousInterval = Math.max(0, Number(interval) || 0);
  const easeDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const nextEaseFactor = Math.max(MIN_EASE_FACTOR, previousEaseFactor + easeDelta);

  let nextRepetitionCount;
  let nextInterval;
  let nextLapses = Math.max(0, Math.trunc(Number(lapses) || 0));

  if (q >= 3) {
    nextRepetitionCount = previousRepetitions + 1;
    if (previousRepetitions === 0) {
      nextInterval = 1;
    } else if (previousRepetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.max(1, Math.round(previousInterval * nextEaseFactor));
    }
  } else {
    nextRepetitionCount = 0;
    nextInterval = 1;
    nextLapses += 1;
  }

  return {
    repetitionCount: nextRepetitionCount,
    easeFactor: nextEaseFactor,
    interval: nextInterval,
    lapses: nextLapses,
    lastGrade: q,
    repetitionState: q >= 3 ? 'review' : 'learning',
    dueDate: addDays(now, nextInterval)
  };
}
