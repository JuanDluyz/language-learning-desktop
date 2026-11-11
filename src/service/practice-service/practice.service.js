import { normalizeText, parseJsonArrayStrings, shuffle } from '../../common/helper.utilities.js';
import { DEFAULT_PROMPTS } from '../../common/prompt-templates.constants.js';

const FALLBACK_SENTENCES_BY_LEVEL = {
  A1: [
    "I work in a small office near the city park.",
    "She drinks a glass of fresh water every morning.",
    "They study English together in the school library.",
    "We eat lunch at a cozy cafe on Fridays.",
    "He plays soccer with his friends every weekend."
  ],
  A2: [
    "She takes the train to work every day at eight thirty.",
    "We visited a beautiful museum during our trip last week.",
    "He is going to buy a new laptop next month.",
    "I called my friend because I needed help with homework.",
    "They stayed at home yesterday because of the heavy rain."
  ],
  B1: [
    "I have lived in this city since I was a teenager.",
    "If it rains tomorrow, we will stay inside and watch movies.",
    "She is the doctor who helped my brother last year.",
    "We have already finished all the main tasks for today.",
    "He has been working on this design for three weeks."
  ],
  B2: [
    "If I had known about the traffic, I would have left earlier.",
    "They should have double-checked the flight details before leaving.",
    "Despite the difficult weather conditions, the team completed the climb.",
    "She would travel more often if she had more free time.",
    "He managed to finish the report although he was very tired."
  ],
  C1: [
    "Having analyzed the financial figures, the board approved the new strategy.",
    "Rarely have we witnessed such a remarkable display of teamwork.",
    "It was her innovative approach that solved the system architecture problem.",
    "Scarcely had the presentation started when the power went out.",
    "Only by working together can we overcome these complex market challenges."
  ]
};

function normalizeGroupPhrase(phrase) {
  return {
    id: phrase?.id ?? 0,
    original_text: phrase?.original_text || phrase?.text || '',
    audio_path: phrase?.audio_path || '',
    cefr_level: phrase?.cefr_level || 'B1',
    topic: phrase?.topic || null
  };
}

export function normalizeGroupPhrases(phrases = []) {
  return shuffle(phrases).map(normalizeGroupPhrase);
}

export function isValidGeneratedPhrase(text, topic, knownPhrases = [], maxWords = 16) {
  const normalizedText = normalizeText(text);
  const normalizedTopic = normalizeText(topic);
  const trimmedText = String(text || '').trim();
  const wordCount = trimmedText.split(/\s+/).filter(Boolean).length;

  if (!normalizedText || knownPhrases.has(normalizedText)) return false;
  if (normalizedText === normalizedTopic) return false;
  if (wordCount < 6 || wordCount > maxWords) return false;
  if (!/[.!?]["'”’)]?$/.test(trimmedText)) return false;
  if (/^(?:here (?:are|is)|these are|generate exactly|output only|sentence \d+|phrase \d+)/i.test(trimmedText)) return false;
  return true;
}

export function buildFallbackPhrase(topic = 'Aleatorio', index = 0, level = 'B1') {
  const lvlKey = String(level).toUpperCase().trim();
  const list = FALLBACK_SENTENCES_BY_LEVEL[lvlKey] || FALLBACK_SENTENCES_BY_LEVEL.B1;
  const itemIndex = Math.abs(Number(index) || 0) % list.length;
  return list[itemIndex];
}

function containsNormalizedTerm(text, term) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedTerm = normalizeText(term);
  return Boolean(normalizedTerm && normalizedText.includes(` ${normalizedTerm} `));
}

function buildTargetVocabularySentence(terms) {
  const quotedTerms = terms.map((term) => `"${term}"`);
  const joinedTerms = quotedTerms.length > 1
    ? `${quotedTerms.slice(0, -1).join(', ')} and ${quotedTerms[quotedTerms.length - 1]}`
    : quotedTerms[0];
  const noun = quotedTerms.length > 1 ? 'expressions' : 'expression';
  return `I practiced the ${noun} ${joinedTerms} aloud during my English lesson today.`;
}

function cleanGeneratedCandidate(text) {
  return String(text || '')
    .replace(/^(?:\d+[\.)]|[-*])\s*/, '')
    .replace(/^(?:phrase|sentence|english|response):\s*/i, '')
    .replace(/^['"`]|['"`]$/g, '')
    .trim();
}

function addVocabularyProgress(phrase, vocabularyItem) {
  return {
    ...phrase,
    vocabulary_id: vocabularyItem.id,
    ease_factor: vocabularyItem.ease_factor,
    interval: vocabularyItem.interval,
    repetition_count: vocabularyItem.repetition_count,
    repetition_state: vocabularyItem.repetition_state,
    lapses: vocabularyItem.lapses,
    due_date: vocabularyItem.due_date
  };
}

export async function generateDynamicPhrases({ sessionOptions, staticTexts = [], vocabularyItems = [], askLLM, targetCount = 5, random = Math.random }) {
  const {
    level = 'A1',
    topic = 'Aleatorio',
    tone = 'Casual',
    count = targetCount,
    targetWords: rawTargetWords = '',
    customPrompt = '',
    reinforceVocabulary = true
  } = sessionOptions || {};
  const normalizedCount = Math.min(20, Math.max(1, Number(count) || targetCount));
  const generatedPhrases = [];
  const known = new Set((staticTexts || []).map((text) => normalizeText(text)));
  const toneInstruction = tone ? ` Use a ${tone.toLowerCase()} tone/register appropriate for spoken English.` : '';
  const targetWords = String(rawTargetWords).split(/[\n,;]/).map((word) => word.trim()).filter(Boolean);
  const normalizedTargets = new Set(targetWords.map((word) => normalizeText(word)));

  const dueVocabulary = reinforceVocabulary
    ? vocabularyItems
      .filter((item) => !item.due_date || Date.parse(item.due_date) <= Date.now())
      .filter((item) => !normalizedTargets.has(normalizeText(item.original_text)))
      .sort((first, second) => Date.parse(first.due_date || 0) - Date.parse(second.due_date || 0))
    : [];

  const reinforcementSlots = new Map();
  for (let blockStart = 0; blockStart + 5 <= normalizedCount && dueVocabulary.length > 0; blockStart += 5) {
    const item = dueVocabulary.shift();
    const slot = blockStart + Math.min(4, Math.floor(random() * 5));
    reinforcementSlots.set(slot, item);
  }

  const lvlKey = String(level).toUpperCase().trim();
  const grammarRule = DEFAULT_PROMPTS[`grammar_${lvlKey}`] || DEFAULT_PROMPTS.grammar_A1;
  const systemPrompt = DEFAULT_PROMPTS.gen_batch_system;
  const generatedCount = normalizedCount;
  const reinforcementInstructions = [...reinforcementSlots.entries()]
    .map(([slot, item]) => `Sentence ${slot + 1} MUST naturally include the exact phrase "${item.original_text}".`)
    .join('\n');

  for (let attempt = 0; attempt < 3 && generatedPhrases.length < generatedCount; attempt += 1) {
    const remaining = generatedCount - generatedPhrases.length;
    const targetInstruction = targetWords.length
      ? `MANDATORY TARGET VOCABULARY: Naturally include every exact term across the generated sentences: ${targetWords.join(', ')}.\n`
      : '';
    const reinforcementInstruction = reinforcementInstructions
      ? `MANDATORY VOCABULARY REVIEW, embedded in complete sentences:\n${reinforcementInstructions}\n`
      : '';
    const customInstruction = customPrompt.trim()
      ? `ADDITIONAL USER INSTRUCTIONS:\n${customPrompt.trim()}\n`
      : '';
    const promptText =
      `Generate exactly ${remaining} distinct, natural English sentences about '${topic}' targeting CEFR level ${lvlKey}.${toneInstruction}\n\n` +
      `CONSTRAINTS:\n${grammarRule}\n` +
      targetInstruction + reinforcementInstruction + customInstruction +
      `STRICT LENGTH RULE: Each sentence MUST be a complete, natural sentence between 7 and 14 words max. Do NOT generate robotic 3-word fragments nor long multi-sentence paragraphs.\n` +
      `CRITICAL MANDATORY REQUIREMENT: Every sentence MUST be completely unique, using different subjects, verbs, and vocabulary. Absolutely DO NOT repeat or vary the exact same sentence template.\n\n` +
      `Format strictly as a numbered list from 1 to ${remaining}, one short sentence per line:\n` +
      `1. Sentence 1\n2. Sentence 2\n...\nOutput ONLY the numbered list.`;

    try {
      let rawResponse = '';
      if (typeof askLLM === 'function') {
        rawResponse = await askLLM(promptText, { systemPrompt, temperature: 0.75, maxTokens: Math.min(1500, Math.max(150, remaining * 35)) });
      }

      const response = typeof rawResponse === 'string' ? rawResponse : '';
      const candidates = parseJsonArrayStrings(response);
      const candidateLines = candidates.length > 0 ? candidates : response.split(/\r?\n/);
      for (const candidate of candidateLines) {
        const cleaned = cleanGeneratedCandidate(candidate);
        const slot = generatedPhrases.length;
        const requiredVocabulary = reinforcementSlots.get(slot);
        if (!isValidGeneratedPhrase(cleaned, topic, known) || slot >= generatedCount) continue;
        if (requiredVocabulary && !containsNormalizedTerm(cleaned, requiredVocabulary.original_text)) continue;

        const normalized = normalizeText(cleaned);
        known.add(normalized);
        generatedPhrases.push(cleaned);
      }
    } catch (err) {
      console.warn('[Dynamic Practice] Fallo en intento de generación con LLM:', err.message);
    }
  }

  // Fallback de alta calidad por nivel con oraciones naturales verdaderas
  let fallbackIdx = 0;
  while (generatedPhrases.length < generatedCount && fallbackIdx < 10) {
    const fallback = buildFallbackPhrase(topic, fallbackIdx, lvlKey);
    fallbackIdx += 1;
    const normalized = normalizeText(fallback);
    if (!known.has(normalized)) {
      known.add(normalized);
      generatedPhrases.push(fallback);
    }
  }

  const requiredTerms = [...new Set([
    ...targetWords,
    ...[...reinforcementSlots.values()].map((item) => item.original_text)
  ])];
  const missingTerms = requiredTerms.filter((term) => !generatedPhrases.some((phrase) => containsNormalizedTerm(phrase, term)));
  for (const term of missingTerms) {
    const replaceIndex = generatedPhrases.findIndex((phrase, index) => {
      return !reinforcementSlots.has(index) && !requiredTerms.some((requiredTerm) => containsNormalizedTerm(phrase, requiredTerm));
    });
    if (replaceIndex !== -1) {
      generatedPhrases[replaceIndex] = buildTargetVocabularySentence([term]);
      continue;
    }

    const mergeIndex = generatedPhrases.findIndex((_phrase, index) => !reinforcementSlots.has(index));
    if (mergeIndex === -1) continue;
    const existingTerms = requiredTerms.filter((requiredTerm) => containsNormalizedTerm(generatedPhrases[mergeIndex], requiredTerm));
    generatedPhrases[mergeIndex] = buildTargetVocabularySentence([...new Set([...existingTerms, term])]);
  }

  return generatedPhrases.slice(0, normalizedCount).map((text, index) => {
    const basePhrase = { id: 0, original_text: text, audio_path: '' };
    const vocabularyItem = reinforcementSlots.get(index);
    if (vocabularyItem) return addVocabularyProgress(basePhrase, vocabularyItem);

    const linkedVocabulary = vocabularyItems.find((item) => {
      const normalizedWord = normalizeText(item.original_text);
      return normalizedTargets.has(normalizedWord) && containsNormalizedTerm(text, item.original_text);
    });
    return linkedVocabulary ? addVocabularyProgress(basePhrase, linkedVocabulary) : basePhrase;
  });
}
