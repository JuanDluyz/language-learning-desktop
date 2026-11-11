import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  createGroup,
  createPhrase,
  getPhrasesByGroup,
  updatePhraseSrs
} from '../../src/service/database-service/database.service.js';
import { createDatabaseFixture } from './helpers/database-fixture.js';

let disposeDatabase;

before(async () => {
  disposeDatabase = await createDatabaseFixture();
});

after(async () => {
  await disposeDatabase?.();
});

test('review grades update and persist SM-2 state; invalid grades leave it unchanged', () => {
  const groupId = createGroup('integration-srs', 'vocabulary');
  const phraseId = createPhrase(groupId, 'remember');

  const firstReview = updatePhraseSrs(phraseId, 4);
  assert.equal(firstReview.success, true);
  assert.equal(firstReview.srsData.repetition_count, 1);
  assert.equal(firstReview.srsData.interval, 1);
  assert.equal(firstReview.srsData.last_grade, 4);
  assert.equal(firstReview.srsData.repetition_state, 'review');
  assert.equal(firstReview.srsData.lapses, 0);

  let [phrase] = getPhrasesByGroup(groupId);
  assert.equal(phrase.repetition_count, 1);
  assert.equal(phrase.interval, 1);
  assert.equal(phrase.last_grade, 4);
  assert.equal(phrase.repetition_state, 'review');

  const lapse = updatePhraseSrs(phraseId, 1);
  assert.equal(lapse.srsData.repetition_count, 0);
  assert.equal(lapse.srsData.interval, 1);
  assert.equal(lapse.srsData.repetition_state, 'learning');
  assert.equal(lapse.srsData.lapses, 1);

  assert.throws(() => updatePhraseSrs(phraseId, 6), RangeError);
  [phrase] = getPhrasesByGroup(groupId);
  assert.equal(phrase.repetition_count, 0);
  assert.equal(phrase.last_grade, 1);
  assert.equal(phrase.lapses, 1);
});
