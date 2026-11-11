import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSrsUpdate, getEstimatedIntervalText } from '../../src/common/srs.constants.js';

test('estimated interval and persisted SRS update use the same normalized inputs', () => {
  const phrase = {
    repetition_count: 2,
    ease_factor: 250,
    interval: 4,
    lapses: 1
  };
  const update = calculateSrsUpdate(phrase, 4);

  assert.equal(getEstimatedIntervalText(phrase, 4), `${update.interval} d`);
});

test('SRS interval helpers normalize missing phrase values consistently', () => {
  const update = calculateSrsUpdate({}, 4);

  assert.equal(getEstimatedIntervalText({}, 4), `${update.interval} d`);
});
