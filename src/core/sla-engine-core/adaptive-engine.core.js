/**
 * Modulo Core: Motor de Planificacion Adaptativa basado en la Teoria de Adquisicion de Segundas Lenguas (SLA)
 * Implementa la hipotesis del Input Comprensible (Krashen i+1) y balanceo de reactivos segun metricas SM-2.
 */

import { CEFR_LEVELS, normalizeCefrLevel } from './cefr-rules.core.js';
import { normalizeText } from '../../common/helper.utilities.js';

function isDue(item, now) {
  if (!item.due_date) return true;
  const dueTime = Date.parse(item.due_date);
  return !Number.isFinite(dueTime) || dueTime <= now.getTime();
}

function takeRandom(items, random) {
  if (items.length === 0) return null;
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items.splice(index, 1)[0];
}

function makeSlot(slotIndex, level, tierOffset, promptType, vocabularyItem = null, targetWord = null) {
  return {
    slotIndex,
    level,
    tierOffset,
    promptType,
    sm2TargetWord: targetWord || vocabularyItem?.original_text || null,
    vocabularyItem
  };
}

export function buildAdaptiveSessionPlan({
  sessionConfig = {},
  userLevel = 'B1',
  vocabularyItems = [],
  now = new Date(),
  random = Math.random
}) {
  const targetSessionLevel = normalizeCefrLevel(sessionConfig.level);
  const learnerLevel = normalizeCefrLevel(userLevel);
  const topic = String(sessionConfig.topic || 'Everyday Life').trim();
  const count = Math.max(1, Math.min(20, Math.trunc(Number(sessionConfig.count) || 5)));
  
  // Garantizar la Regla Krashen i+1: El nivel no debe dar saltos mayores a +1 respecto al nivel del usuario
  const learnerIdx = CEFR_LEVELS.indexOf(learnerLevel);
  const targetIdx = CEFR_LEVELS.indexOf(targetSessionLevel);
  const adjustedTargetIdx = targetIdx > learnerIdx + 1 ? learnerIdx + 1 : targetIdx;
  const sessionLevel = CEFR_LEVELS[adjustedTargetIdx];

  const sessionConfigNormalized = {
    ...sessionConfig,
    level: sessionLevel,
    topic,
    count
  };

  const tierOffset = Math.sign(CEFR_LEVELS.indexOf(sessionLevel) - learnerIdx);
  const tierName = tierOffset > 0 ? 'i+1' : tierOffset < 0 ? 'i-1' : 'i';
  const baseCount = Math.max(1, Math.min(count, Math.round(count * 0.8)));
  const slots = [];
  const manualTargetInput = String(sessionConfig.targetWords || '')
    .split(/[\n,;]/)
    .map((word) => word.trim())
    .filter(Boolean);
  const manualTargets = [...new Map(manualTargetInput.map((word) => [normalizeText(word), word])).values()];
  const manualTargetKeys = new Set(manualTargets.map(normalizeText));

  const isVocabDrill = sessionConfig.mode === 'vocab_drill';
  const shouldIntegrateVocab = sessionConfig.integrateVocabulary === true ||
    isVocabDrill ||
    manualTargets.length > 0;

  const effectiveVocabItems = shouldIntegrateVocab ? vocabularyItems : [];
  const selectableItems = effectiveVocabItems.filter((item) => !manualTargetKeys.has(normalizeText(item.original_text)));
  const dueItems = selectableItems.filter((item) => isDue(item, now));
  const weakDueItems = dueItems.filter((item) => [2, 3, 4].includes(item.last_grade));
  // Anclas master: incluir palabras con buena nota (>=4) o intervalos consolidados (>=7 dias)
  const masteredItems = selectableItems.filter((item) => (item.last_grade >= 4 || (item.interval || 0) >= 7) && !isDue(item, now));

  for (let slotIndex = 0; slotIndex < baseCount; slotIndex += 1) {
    let slot;
    if (isVocabDrill && selectableItems.length > 0) {
      const vocabItem = selectableItems[slotIndex % selectableItems.length];
      const isWeak = [2, 3, 4].includes(vocabItem.last_grade);
      slot = makeSlot(slotIndex, sessionLevel, tierName, isWeak ? 'weak_word_review' : 'review_word', vocabItem);
    } else if (tierOffset < 0) {
      const weakItem = takeRandom(weakDueItems, random);
      slot = weakItem
        ? makeSlot(slotIndex, sessionLevel, tierName, 'weak_word_review', weakItem)
        : makeSlot(slotIndex, sessionLevel, tierName, 'standard');
    } else if (tierOffset > 0) {
      const masteredItem = takeRandom(masteredItems, random);
      slot = masteredItem
        ? makeSlot(slotIndex, sessionLevel, tierName, 'mastered_anchor', masteredItem)
        : makeSlot(slotIndex, sessionLevel, tierName, 'standard');
    } else {
      const dueItem = takeRandom(dueItems, random);
      slot = dueItem
        ? makeSlot(slotIndex, sessionLevel, tierName, 'review_word', dueItem)
        : makeSlot(slotIndex, sessionLevel, tierName, 'standard');
    }
    slots.push(slot);
  }

  const challengeLevel = tierOffset < 0
    ? learnerLevel
    : tierOffset > 0
      ? sessionLevel
      : CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, learnerIdx + 1)];
  const challengeTier = tierOffset < 0 ? 'i' : 'i+1';
  for (let slotIndex = baseCount; slotIndex < count; slotIndex += 1) {
    if (isVocabDrill && selectableItems.length > 0) {
      const vocabItem = selectableItems[slotIndex % selectableItems.length];
      slots.push(makeSlot(slotIndex, challengeLevel, challengeTier, 'review_word', vocabItem));
    } else {
      slots.push(makeSlot(slotIndex, challengeLevel, challengeTier, 'challenge'));
    }
  }

  for (const [index, targetWord] of manualTargets.entries()) {
    if (index >= slots.length) break;
    const vocabularyItem = vocabularyItems.find((item) => normalizeText(item.original_text) === normalizeText(targetWord)) || null;
    slots[index] = makeSlot(index, slots[index].level, slots[index].tierOffset, 'review_word', vocabularyItem, targetWord);
  }

  return {
    sessionConfig: sessionConfigNormalized,
    userLevel: learnerLevel,
    tierOffset: tierName,
    baseCount,
    challengeCount: count - baseCount,
    manualTargetCount: manualTargets.length,
    manualTargetAppliedCount: Math.min(manualTargets.length, count),
    manualTargetOverflow: Math.max(0, manualTargets.length - count),
    slots
  };
}
