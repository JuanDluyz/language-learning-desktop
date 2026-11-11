import { normalizeText } from '../../common/helper.utilities.js';
import { DEFAULT_PROMPTS, getEffectivePrompt } from '../../common/prompt-templates.constants.js';
import { askLLM } from '../../common/local-llm.adapter.js';
import { getDatabaseStats, getDbPrompts, getDuePhrasesByGroup, getStaticPhraseTexts, getVocabularyPhrases, recordAdaptiveGenerationMetrics } from '../database-service/database.service.js';
import { buildFallbackPhrase, isValidGeneratedPhrase } from './practice.service.js';

import { buildAdaptiveSessionPlan } from '../../core/sla-engine-core/adaptive-engine.core.js';
export { buildAdaptiveSessionPlan };

function buildSlotPrompt(slot, sessionConfig, grammarRules, previousSentences = []) {
  const tone = sessionConfig.tone ? ` Use a ${sessionConfig.tone.toLowerCase()} conversational tone.` : '';
  let levelInstruction;
  let slotInstruction = '';

  if (sessionConfig.mode === 'vocab_drill' && slot.sm2TargetWord) {
    levelInstruction = `Generate one natural, clear English sentence demonstrating the correct contextual usage of the target word "${slot.sm2TargetWord}" for CEFR level ${slot.level}.${tone}`;
    slotInstruction = `The sentence must naturally incorporate the word "${slot.sm2TargetWord}" without changing its core form.`;
  } else {
    levelInstruction = `Generate one complete, natural English sentence about "${sessionConfig.topic}" for CEFR level ${slot.level}.${tone}`;
    if (slot.promptType === 'review_word' || slot.promptType === 'weak_word_review') {
      slotInstruction = `Naturally incorporate the exact target expression "${slot.sm2TargetWord}". Do not change its spelling or form.`;
    } else if (slot.promptType === 'mastered_anchor') {
      slotInstruction = `Use the familiar expression "${slot.sm2TargetWord}" as an anchor within the requested CEFR-level sentence.`;
    } else if (slot.promptType === 'challenge') {
      slotInstruction = 'Make the sentence a subtle challenge at this CEFR level, using appropriate grammar or nuanced phrasing.';
    }
  }

  const wordLimit = ['C1', 'C2'].includes(slot.level) ? 'between 8 and 18 words' : 'between 7 and 14 words';

  const diversityRules = [
    'LANGUAGE MANDATE: The entire sentence must be strictly 100% in natural English. If the topic is in Spanish (e.g. "carreras de caballos"), translate the concept to English (e.g. "horse racing") and NEVER output Spanish words.',
    'DIVERSITY CONSTRAINT: Vary the grammatical structure and subject. Avoid repetitive sentence starters (do not start with "I have seen" or "I remember" if already used). Avoid appending rhetorical tag questions (do not use ", aren\'t they?", ", wasn\'t it?", or ", didn\'t they?").'
  ];

  if (previousSentences.length > 0) {
    const previewList = previousSentences.slice(-3).map((s) => `"${s}"`).join(', ');
    diversityRules.push(`Previous sentences generated: ${previewList}. Use a distinctly different sentence pattern.`);
  }

  return [
    levelInstruction,
    slotInstruction,
    grammarRules,
    ...diversityRules,
    `Keep it ${wordLimit}. Output only the sentence, with no heading, number, or explanation.`,
    sessionConfig.customPrompt ? `Additional user instructions: ${sessionConfig.customPrompt}` : ''
  ].filter(Boolean).join('\n');
}

function cleanSentenceCandidate(candidate) {
  return String(candidate || '')
    .replace(/^(?:\d+[.)]|[-*])\s*/, '')
    .replace(/^['"`]|['"`]$/g, '')
    .trim();
}

function containsTargetWord(text, targetWord) {
  return ` ${normalizeText(text)} `.includes(` ${normalizeText(targetWord)} `);
}

function createTargetFallback(targetWord) {
  return `I practiced the expression "${targetWord}" aloud during my English lesson today.`;
}

function buildBatchSessionPrompt(plan) {
  const { sessionConfig } = plan;
  const topic = sessionConfig.topic || 'General';
  const count = plan.slots.length;

  const targetWords = plan.slots
    .map((s) => s.sm2TargetWord)
    .filter(Boolean);

  const targetsLine = targetWords.length > 0
    ? `Required target vocabulary to integrate: ${targetWords.join(', ')}.`
    : '';

  return [
    `Generate exactly ${count} natural spoken English practice sentences about "${topic}".`,
    targetsLine,
    `Rules:`,
    `- Output strictly a numbered list from 1 to ${count}, exactly one complete sentence per line.`,
    `- Length: 8 to 14 words per sentence. Natural conversational spoken rhythm.`,
    `- Variety: Use different subjects and sentence structures. Do not append rhetorical tag questions (no ", isn't it?", ", didn't they?").`,
    `- 100% in English. Output ONLY the numbered list. No greetings, intros, or explanations.`
  ].filter(Boolean).join('\n');
}

function parseBatchLines(rawResponse) {
  const text = String(rawResponse || '').trim();
  const lines = text.split(/\r?\n/);
  const candidates = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.endsWith(':')) continue;
    if (/^(?:here (?:are|is)|these are|certainly|below|sure|sentences?|phrase)/i.test(trimmed) && trimmed.length < 60 && !/[.!?]$/.test(trimmed)) continue;

    const cleaned = cleanSentenceCandidate(trimmed);
    if (cleaned && cleaned.split(/\s+/).length >= 5) {
      candidates.push(cleaned);
    }
  }
  return candidates;
}

function attachVocabularyState(phrase, item) {
  if (!item) return phrase;
  return {
    ...phrase,
    vocabulary_id: item.id,
    ease_factor: item.ease_factor,
    interval: item.interval,
    repetition_count: item.repetition_count,
    last_grade: item.last_grade,
    repetition_state: item.repetition_state,
    lapses: item.lapses,
    due_date: item.due_date
  };
}

export async function generateAdaptiveSession({
  sessionConfig = {},
  userLevel = 'B1',
  vocabularyItems = [],
  staticTexts = [],
  ask = askLLM,
  dbPrompts = getDbPrompts(),
  sessionPlan = null,
  now = new Date(),
  random = Math.random,
  useBatch = false
}) {
  const plan = sessionPlan || buildAdaptiveSessionPlan({ sessionConfig, userLevel, vocabularyItems, now, random });
  const knownSentences = new Set(staticTexts.map((text) => normalizeText(text)));
  const phrases = [];

  // Generación en lote unificada con resolución determinista rápida y parada temprana
  if (useBatch && plan.slots.length > 1) {
    try {
      const batchPrompt = buildBatchSessionPrompt(plan);
      const stopIndex = plan.slots.length + 1;
      const customStopTriggers = [`\n${stopIndex}.`, `\n${stopIndex} `, `${stopIndex}.`, '\n\n\n'];
      const rawBatchResponse = await ask(batchPrompt, {
        temperature: 0.65,
        maxTokens: Math.min(160, Math.max(60, plan.slots.length * 20)),
        customStopTriggers
      }, { batch: true, slotCount: plan.slots.length });

      const batchCandidates = parseBatchLines(rawBatchResponse);
      const batchPhrases = [];

      for (let i = 0; i < plan.slots.length; i++) {
        const slot = plan.slots[i];
        const maxWords = ['C1', 'C2'].includes(slot.level) ? 18 : 15;
        let selectedCandidate = '';

        if (batchCandidates[i]) {
          const candidate = batchCandidates[i];
          const isValid = isValidGeneratedPhrase(candidate, plan.sessionConfig.topic, knownSentences, maxWords)
            && (!slot.sm2TargetWord || containsTargetWord(candidate, slot.sm2TargetWord));
          if (isValid) {
            selectedCandidate = candidate;
          }
        }

        // Si el candidato del slot directo no fue válido, buscar un suplente válido en las líneas del lote
        if (!selectedCandidate && batchCandidates.length > plan.slots.length) {
          for (let c = plan.slots.length; c < batchCandidates.length; c++) {
            const extra = batchCandidates[c];
            if (isValidGeneratedPhrase(extra, plan.sessionConfig.topic, knownSentences, maxWords)
                && (!slot.sm2TargetWord || containsTargetWord(extra, slot.sm2TargetWord))) {
              selectedCandidate = extra;
              batchCandidates.splice(c, 1);
              break;
            }
          }
        }

        let generationSource = 'llm';
        if (!selectedCandidate) {
          // Asignación determinista inmediata sin llamadas redundantes al LLM
          selectedCandidate = slot.sm2TargetWord
            ? createTargetFallback(slot.sm2TargetWord)
            : buildFallbackPhrase(plan.sessionConfig.topic, slot.slotIndex, slot.level);
          generationSource = 'fallback';
        }

        knownSentences.add(normalizeText(selectedCandidate));
        const phrase = {
          id: 0,
          original_text: selectedCandidate,
          audio_path: '',
          cefr_level: slot.level,
          topic: plan.sessionConfig.topic,
          exercise_type: slot.promptType,
          tier_offset: slot.tierOffset,
          generation_attempts: 1,
          generation_source: generationSource
        };
        batchPhrases.push(attachVocabularyState(phrase, slot.vocabularyItem));
      }

      return batchPhrases;
    } catch (batchError) {
      console.warn('[Adaptive Session] Intento de lote falló, aplicando contingencia determinista rápida:', batchError.message);
      return plan.slots.map((slot) => {
        const fallbackText = slot.sm2TargetWord
          ? createTargetFallback(slot.sm2TargetWord)
          : buildFallbackPhrase(plan.sessionConfig.topic, slot.slotIndex, slot.level);
        const phrase = {
          id: 0,
          original_text: fallbackText,
          audio_path: '',
          cefr_level: slot.level,
          topic: plan.sessionConfig.topic,
          exercise_type: slot.promptType,
          tier_offset: slot.tierOffset,
          generation_attempts: 1,
          generation_source: 'fallback'
        };
        return attachVocabularyState(phrase, slot.vocabularyItem);
      });
    }
  }

  // Flujo alternativo para sesiones individuales (slot único o sin lote)
  for (const slot of plan.slots) {
    const grammarKey = `grammar_${slot.level}`;
    const grammarRules = getEffectivePrompt(grammarKey, dbPrompts)
      || DEFAULT_PROMPTS.grammar_C1
      || DEFAULT_PROMPTS.grammar_B1;
    const previousSentences = phrases.map((p) => p.original_text);
    const prompt = buildSlotPrompt(slot, plan.sessionConfig, grammarRules, previousSentences);
    const maxWords = ['C1', 'C2'].includes(slot.level) ? 18 : 15;
    let sentence = '';
    let attemptCount = 0;
    let generationSource = 'fallback';

    for (let attempt = 0; attempt < 2 && !sentence; attempt += 1) {
      try {
        attemptCount += 1;
        const rawResponse = await ask(
          attempt === 0 ? prompt : `${prompt}\nCorrect any previous formatting issue and return one valid sentence.`,
          { temperature: 0.7, maxTokens: 128 },
          { slotIndex: slot.slotIndex, attempt: attemptCount }
        );
        const candidates = String(rawResponse || '').split(/\r?\n/).map(cleanSentenceCandidate);
        sentence = candidates.find((candidate) =>
          isValidGeneratedPhrase(candidate, plan.sessionConfig.topic, knownSentences, maxWords)
          && (!slot.sm2TargetWord || containsTargetWord(candidate, slot.sm2TargetWord))
        ) || '';
        if (sentence) generationSource = 'llm';
      } catch (error) {
        console.warn('[Adaptive Session] Fallo al generar slot individual:', error.message);
      }
    }

    if (!sentence) {
      sentence = slot.sm2TargetWord
        ? createTargetFallback(slot.sm2TargetWord)
        : buildFallbackPhrase(plan.sessionConfig.topic, slot.slotIndex, slot.level);
    }
    knownSentences.add(normalizeText(sentence));

    const phrase = {
      id: 0,
      original_text: sentence,
      audio_path: '',
      cefr_level: slot.level,
      topic: plan.sessionConfig.topic,
      exercise_type: slot.promptType,
      tier_offset: slot.tierOffset,
      generation_attempts: attemptCount,
      generation_source: generationSource
    };
    phrases.push(attachVocabularyState(phrase, slot.vocabularyItem));
  }

  return phrases;
}

export async function generateAdaptiveSessionFromDatabase(sessionConfig = {}, sessionId) {
  const stats = getDatabaseStats();
  const vocabularyItems = sessionConfig.groupId
    ? getDuePhrasesByGroup(sessionConfig.groupId, sessionConfig.count || 20)
    : getVocabularyPhrases();
  const staticTexts = getStaticPhraseTexts();

  const normalizedConfig = {
    ...sessionConfig,
    topic: sessionConfig.topic || (sessionConfig.mode === 'vocab_drill' && sessionConfig.groupName ? `Vocabulario: ${sessionConfig.groupName}` : 'General')
  };

  const sessionPlan = buildAdaptiveSessionPlan({
    sessionConfig: normalizedConfig,
    userLevel: stats.macroLevel,
    vocabularyItems
  });

  const phrases = await generateAdaptiveSession({
    sessionConfig: normalizedConfig,
    userLevel: stats.macroLevel,
    vocabularyItems,
    staticTexts,
    dbPrompts: getDbPrompts(),
    sessionPlan,
    useBatch: sessionConfig.useBatch !== false
  });
  const generationMetrics = phrases.map((phrase, index) => ({
    slot_index: index,
    cefr_level: phrase.cefr_level,
    generation_mode: phrase.exercise_type,
    used_fallback: phrase.generation_source === 'fallback',
    attempt_count: phrase.generation_attempts
  }));
  recordAdaptiveGenerationMetrics(sessionId, generationMetrics);

  return {
    phrases,
    manualTargetAppliedCount: sessionPlan.manualTargetAppliedCount,
    manualTargetOverflow: sessionPlan.manualTargetOverflow
  };
}