import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { getDbPrompts } from '../../src/service/database-service/database.service.js';
import { buildAdaptiveSessionPlan, generateAdaptiveSession } from '../../src/service/practice-service/adaptive-session.service.js';
import {
  createRateLimitGuard,
  isRateLimitError,
  percentile,
  redactSecrets,
  summarize
} from '../../scripts/benchmarks/benchmark-utils.js';
import { summarizeApplicationResults, summarizeLlamaBenchResults } from '../../scripts/benchmarks/summarize-results.js';
import { createDatabaseFixture } from './helpers/database-fixture.js';

let disposeDatabase;

before(async () => {
  disposeDatabase = await createDatabaseFixture();
});

after(async () => {
  await disposeDatabase?.();
});

test('percentile interpolates and rejects invalid percentile values', () => {
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentile([1, 2, 3, 4], 95), 3.85);
  assert.throws(() => percentile([1], 101), RangeError);
});

test('summary reports sample dispersion and ignores non-finite values', () => {
  const result = summarize([1, 2, 3, Number.NaN]);
  assert.equal(result.count, 3);
  assert.equal(result.mean, 2);
  assert.equal(result.standardDeviation, 1);
  assert.equal(result.p50, 2);
  assert.equal(result.p95, 2.9);
});

test('evidence redaction drops secret fields and scrubs known credentials', () => {
  const output = redactSecrets({
    provider: 'groq',
    apiKey: 'secret-key',
    headers: { authorization: 'Bearer secret-key' },
    note: 'failed with secret-key'
  }, ['secret-key']);

  assert.deepEqual(output, {
    provider: 'groq',
    headers: {},
    note: 'failed with [REDACTED]'
  });
  assert.equal(JSON.stringify(output).includes('secret-key'), false);
});

test('rate-limit detection recognizes HTTP status and provider quota messages', () => {
  assert.equal(isRateLimitError({ status: 429, message: 'Too many requests' }), true);
  assert.equal(isRateLimitError(new Error('Quota exceeded for free tier requests')), true);
  assert.equal(isRateLimitError(new Error('Model unavailable')), false);
});

test('rate-limit guard prevents additional provider requests after quota rejection', async () => {
  const state = { detected: false };
  let requestCount = 0;
  const request = createRateLimitGuard(async () => {
    requestCount += 1;
    throw new Error('Provider returned HTTP 429: quota exceeded');
  }, state);

  await assert.rejects(request(), /429/);
  await assert.rejects(request(), /skipped after provider rate limit/);
  assert.equal(state.detected, true);
  assert.equal(requestCount, 1);
});
test('application summary separates session latency, request latency, retries and fallbacks', () => {
  const report = summarizeApplicationResults({
    provider: 'local',
    model: 'example.gguf',
    runs: [
      {
        phase: 'warmup',
        sessionDurationMs: 99,
        requestDurationsMs: [90],
        attempts: 1,
        llmSlots: 1,
        fallbackSlots: 0
      },
      {
        phase: 'measurement',
        sessionDurationMs: 100,
        requestDurationsMs: [40, 50],
        attempts: 3,
        llmSlots: 1,
        fallbackSlots: 1
      }
    ]
  });

  assert.equal(report.measuredSessionCount, 1);
  assert.equal(report.sessionDurationMs.median, 100);
  assert.deepEqual(report.requestDurationMs.count, 2);
  assert.equal(report.generatedByLlm, 1);
  assert.equal(report.generatedByFallback, 1);
  assert.equal(report.attempts, 3);
});

test('llama-bench summary uses raw throughput samples and separates test types', () => {
  const report = summarizeLlamaBenchResults([
    {
      model_filename: 'model.gguf',
      backends: 'CPU',
      n_prompt: 128,
      n_gen: 0,
      n_threads: 8,
      n_gpu_layers: 0,
      samples_ts: [20, 22, 24]
    },
    {
      model_filename: 'model.gguf',
      backends: 'CPU',
      n_prompt: 0,
      n_gen: 64,
      n_threads: 8,
      n_gpu_layers: 0,
      samples_ts: [10, 12, 14]
    }
  ]);

  assert.equal(report[0].testType, 'prompt-processing');
  assert.equal(report[0].tokensPerSecond.p50, 22);
  assert.equal(report[1].testType, 'text-generation');
  assert.equal(report[1].tokensPerSecond.p95, 13.8);
});

test('adaptive service attempts and fallback counts map to benchmark metrics', async () => {
  const sessionConfig = { topic: 'daily routines', level: 'B1', count: 1 };
  const sessionPlan = buildAdaptiveSessionPlan({ sessionConfig, userLevel: 'B1', vocabularyItems: [] });
  let requestCount = 0;
  const attemptContexts = [];
  const generated = await generateAdaptiveSession({
    sessionConfig,
    userLevel: 'B1',
    vocabularyItems: [],
    dbPrompts: getDbPrompts(),
    sessionPlan,
    ask: async (_prompt, _options, context) => {
      requestCount += 1;
      attemptContexts.push(context);
      return requestCount === 1
        ? 'Here is a short answer.'
        : 'She opens the window before breakfast every morning.';
    }
  });

  assert.equal(generated[0].generation_attempts, 2);
  assert.equal(generated[0].generation_source, 'llm');
  assert.deepEqual(attemptContexts, [
    { slotIndex: 0, attempt: 1 },
    { slotIndex: 0, attempt: 2 }
  ]);

  const fallback = await generateAdaptiveSession({
    sessionConfig,
    userLevel: 'B1',
    vocabularyItems: [],
    dbPrompts: getDbPrompts(),
    sessionPlan,
    ask: async () => 'Invalid.'
  });
  assert.equal(fallback[0].generation_attempts, 2);
  assert.equal(fallback[0].generation_source, 'fallback');

  const summary = summarizeApplicationResults({
    runs: [
      {
        phase: 'measurement',
        sessionDurationMs: 1,
        requestDurationsMs: [1, 1],
        attempts: generated[0].generation_attempts,
        llmSlots: Number(generated[0].generation_source === 'llm'),
        fallbackSlots: Number(generated[0].generation_source === 'fallback')
      },
      {
        phase: 'measurement',
        sessionDurationMs: 1,
        requestDurationsMs: [1, 1],
        attempts: fallback[0].generation_attempts,
        llmSlots: Number(fallback[0].generation_source === 'llm'),
        fallbackSlots: Number(fallback[0].generation_source === 'fallback')
      }
    ]
  });
  assert.equal(summary.attempts, 4);
  assert.equal(summary.generatedByLlm, 1);
  assert.equal(summary.generatedByFallback, 1);
});
