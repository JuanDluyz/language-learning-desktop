import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildWordDefinitionPrompt,
  evaluateTranscriptionLocally,
  expandContractions
} from '../../src/service/chat-service/chat.service.js';
import { DEFAULT_PROMPTS, PROMPT_METADATA } from '../../src/common/prompt-templates.constants.js';

test('buildWordDefinitionPrompt avoids redundant context when phrase is identical to selection', () => {
  const prompt = buildWordDefinitionPrompt('sad', 'sad');
  assert.ok(prompt.includes('Define la palabra "sad"'));
  assert.ok(!prompt.includes('Oración de contexto: "sad"'));
  assert.ok(prompt.includes('sin introducciones redundantes'));
});

test('buildWordDefinitionPrompt includes context when phrase is a distinct sentence', () => {
  const prompt = buildWordDefinitionPrompt('sad', 'I was feeling sad after the movie.');
  assert.ok(prompt.includes('Define la palabra "sad"'));
  assert.ok(prompt.includes('Oración de contexto: "I was feeling sad after the movie."'));
  assert.ok(prompt.includes('sin frases introductorias ni repetir la oración'));
});

test('unified prompts are registered in DEFAULT_PROMPTS and PROMPT_METADATA', () => {
  assert.ok(typeof DEFAULT_PROMPTS.eval_system === 'string');
  assert.ok(typeof DEFAULT_PROMPTS.explain_system === 'string');
  assert.ok(typeof DEFAULT_PROMPTS.define_word_system === 'string');

  const metaEval = PROMPT_METADATA.find(m => m.key === 'eval_system');
  const metaExplain = PROMPT_METADATA.find(m => m.key === 'explain_system');
  const metaDefine = PROMPT_METADATA.find(m => m.key === 'define_word_system');

  assert.ok(metaEval);
  assert.ok(metaExplain);
  assert.ok(metaDefine);
  assert.equal(metaEval.group_id, 'evaluation');
  assert.equal(metaExplain.group_id, 'explanation');
  assert.equal(metaDefine.group_id, 'explanation');
});

test('evaluateTranscriptionLocally handles exact match instantly without LLM', () => {
  const phrase = 'She drinks a glass of fresh water every morning.';
  const userText = 'she drinks a glass of fresh water every morning';
  const result = evaluateTranscriptionLocally(phrase, userText);

  assert.equal(result.isHandled, true);
  assert.equal(result.isCorrect, true);
  assert.ok(result.feedback.includes('Transcripción correcta'));
});

test('evaluateTranscriptionLocally handles English contraction equivalence', () => {
  const phrase = "I do not know where she lives.";
  const userText = "I don't know where she lives";
  const result = evaluateTranscriptionLocally(phrase, userText);

  assert.equal(result.isHandled, true);
  assert.equal(result.isCorrect, true);
  assert.ok(result.feedback.includes('contracciones'));
});

test('evaluateTranscriptionLocally detects single typo via Levenshtein', () => {
  const phrase = 'We visited a beautiful museum last week.';
  const userText = 'We visited a beutiful museum last week.';
  const result = evaluateTranscriptionLocally(phrase, userText);

  assert.equal(result.isHandled, true);
  assert.equal(result.isCorrect, false);
  assert.ok(result.feedback.includes('Error ortográfico'));
  assert.ok(result.feedback.includes('beutiful'));
  assert.ok(result.feedback.includes('beautiful'));
});

test('evaluateTranscriptionLocally detects single missing word', () => {
  const phrase = 'She takes the train to work every day.';
  const userText = 'She takes the train work every day.';
  const result = evaluateTranscriptionLocally(phrase, userText);

  assert.equal(result.isHandled, true);
  assert.equal(result.isCorrect, false);
  assert.ok(result.feedback.includes('Omitiste la palabra "to"'));
});
