import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  createGroup,
  createPhrase,
  getVocabularyPhrases
} from '../../src/service/database-service/database.service.js';
import {
  buildAdaptiveSessionPlan,
  generateAdaptiveSession
} from '../../src/service/practice-service/adaptive-session.service.js';
import { createDatabaseFixture } from './helpers/database-fixture.js';

let disposeDatabase;

before(async () => {
  disposeDatabase = await createDatabaseFixture();
});

after(async () => {
  await disposeDatabase?.();
});

test('database vocabulary flows through adaptive planning and sentence generation', async () => {
  const groupId = createGroup('integration-adaptive', 'vocabulary');
  createPhrase(groupId, 'airport');
  createPhrase(groupId, 'reservation');
  const vocabularyItems = getVocabularyPhrases({ groupId });

  const plan = buildAdaptiveSessionPlan({
    sessionConfig: {
      level: 'C1',
      topic: 'Travel',
      count: 7,
      targetWords: 'airport'
    },
    userLevel: 'A1',
    vocabularyItems,
    random: () => 0
  });

  assert.equal(plan.sessionConfig.level, 'A2');
  assert.equal(plan.slots.length, 7);
  assert.equal(plan.baseCount, 6);
  assert.equal(plan.challengeCount, 1);
  assert.ok(plan.slots.every((slot) => ['A1', 'A2'].includes(slot.level)));
  assert.equal(plan.manualTargetAppliedCount, 1);
  assert.equal(plan.slots[0].promptType, 'review_word');
  assert.equal(plan.slots[0].sm2TargetWord, 'airport');
  assert.equal(plan.slots[0].vocabularyItem.original_text, 'airport');

  const responses = [
    'We visited the airport before our flight left early.',
    'We visited the quiet market before the train left early.',
    'We found a comfortable seat beside the window during lunch.',
    'She bought fresh oranges from a small market near home.',
    'They walked slowly through the station before their train arrived.',
    'Our guide explained the local customs during the long bus ride.',
    'We enjoyed dinner beside the harbor after visiting the museum.'
  ];
  let requestCount = 0;
  const phrases = await generateAdaptiveSession({
    sessionConfig: plan.sessionConfig,
    userLevel: 'A1',
    vocabularyItems,
    sessionPlan: plan,
    ask: async () => responses[requestCount++]
  });

  assert.equal(requestCount, plan.slots.length);
  assert.equal(phrases.length, plan.slots.length);
  assert.ok(phrases.every((phrase) => phrase.generation_source === 'llm'));
  assert.equal(phrases[0].vocabulary_id, vocabularyItems.find((item) => item.original_text === 'airport').id);
});

test('pure thematic practice without integrateVocabulary does not inject arbitrary vocabulary', () => {
  const groupId = createGroup('integration-thematic-free', 'vocabulary');
  createPhrase(groupId, 'screwdriver');
  createPhrase(groupId, 'wrench');
  const vocabularyItems = getVocabularyPhrases({ groupId });

  // Con integrateVocabulary: false (o no provisto) y sin targetWords manuales:
  const plan = buildAdaptiveSessionPlan({
    sessionConfig: {
      level: 'B1',
      topic: 'Restaurant & Dining',
      count: 5,
      integrateVocabulary: false
    },
    userLevel: 'B1',
    vocabularyItems,
    random: () => 0
  });

  assert.equal(plan.slots.length, 5);
  // Todos los slots base deben ser 'standard' (sin forzar screwdriver ni wrench)
  assert.ok(plan.slots.slice(0, plan.baseCount).every((slot) => slot.promptType === 'standard'));
  assert.ok(plan.slots.every((slot) => !slot.sm2TargetWord));
});

test('mode: vocab_drill focuses specifically on deck vocabulary items', () => {
  const groupId = createGroup('integration-drill', 'vocabulary');
  createPhrase(groupId, 'ubiquitous');
  createPhrase(groupId, 'resilient');
  const vocabularyItems = getVocabularyPhrases({ groupId });

  const plan = buildAdaptiveSessionPlan({
    sessionConfig: {
      mode: 'vocab_drill',
      groupId,
      level: 'B2',
      topic: 'Vocabulario: Advanced Adjectives',
      count: 2,
      integrateVocabulary: true
    },
    userLevel: 'B2',
    vocabularyItems,
    random: () => 0
  });

  assert.equal(plan.slots.length, 2);
  assert.ok(plan.slots.every((slot) => ['review_word', 'weak_word_review'].includes(slot.promptType)));
  const targetWords = plan.slots.map((s) => s.sm2TargetWord);
  assert.ok(targetWords.includes('ubiquitous') || targetWords.includes('resilient'));
});

test('useBatch: true resolves entire session plan in a single LLM call', async () => {
  const plan = buildAdaptiveSessionPlan({
    sessionConfig: {
      topic: 'Technology & AI',
      level: 'B1',
      count: 3,
      integrateVocabulary: false
    },
    userLevel: 'B1',
    vocabularyItems: []
  });

  let callCount = 0;
  const mockBatchOutput = [
    '1. Software developers build modern web applications using advanced tools.',
    '2. Many companies adopt automated testing to improve code quality.',
    '3. Cloud servers process large volumes of user data securely every day.'
  ].join('\n');

  const phrases = await generateAdaptiveSession({
    sessionConfig: plan.sessionConfig,
    userLevel: 'B1',
    vocabularyItems: [],
    sessionPlan: plan,
    useBatch: true,
    ask: async () => {
      callCount += 1;
      return mockBatchOutput;
    }
  });

  // Debe haber resuelto los 3 slots en EXACTAMENTE 1 sola llamada al modelo
  assert.equal(callCount, 1);
  assert.equal(phrases.length, 3);
  assert.ok(phrases.every((p) => p.generation_source === 'llm'));
  assert.equal(phrases[0].original_text, 'Software developers build modern web applications using advanced tools.');
  assert.equal(phrases[1].original_text, 'Many companies adopt automated testing to improve code quality.');
  assert.equal(phrases[2].original_text, 'Cloud servers process large volumes of user data securely every day.');
});
