import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createGroup,
  createPhrase,
  deleteGroup,
  getDuePhrasesByGroup,
  getGroups,
  getPhrasesByGroup,
  updateGroup
} from '../../src/service/database-service/database.service.js';
import { createDatabaseFixture } from './helpers/database-fixture.js';

let disposeDatabase;

before(async () => {
  disposeDatabase = await createDatabaseFixture();
});

after(async () => {
  await disposeDatabase?.();
});

test('group and phrase CRUD persists data and group deletion removes its phrases', () => {
  const name = `integration-${randomUUID()}`;
  const groupId = createGroup(name, 'static');
  const phraseId = createPhrase(groupId, 'We practice English every morning.', 'A1');

  let group = getGroups().find((item) => item.id === groupId);
  assert.ok(group);
  assert.equal(group.name, name);
  assert.equal(group.phrase_count, 1);
  assert.equal(group.new_count, 1);

  let [phrase] = getPhrasesByGroup(groupId);
  assert.equal(phrase.id, phraseId);
  assert.equal(phrase.original_text, 'We practice English every morning.');
  assert.equal(phrase.anki_state, 'new');

  updateGroup(groupId, `${name}-renamed`);
  group = getGroups().find((item) => item.id === groupId);
  assert.equal(group.name, `${name}-renamed`);

  deleteGroup(groupId);
  assert.equal(getGroups().some((item) => item.id === groupId), false);
  assert.deepEqual(getPhrasesByGroup(groupId), []);
});

test('group daily limit persists and getDuePhrasesByGroup caps phrases according to SM-2 priority', () => {
  const name = `daily-limit-${randomUUID()}`;
  const groupId = createGroup(name, 'vocabulary', null, 2);

  createPhrase(groupId, 'apple');
  createPhrase(groupId, 'banana');
  createPhrase(groupId, 'cherry');
  createPhrase(groupId, 'date');

  let group = getGroups().find((item) => item.id === groupId);
  assert.equal(group.daily_limit, 2);

  // Consulta por defecto: debe limitar a daily_limit = 2
  const duePhrases = getDuePhrasesByGroup(groupId);
  assert.equal(duePhrases.length, 2);

  // Modificar límite a 3
  updateGroup(groupId, name, 'vocabulary', null, 3);
  group = getGroups().find((item) => item.id === groupId);
  assert.equal(group.daily_limit, 3);

  const duePhrasesUpdated = getDuePhrasesByGroup(groupId);
  assert.equal(duePhrasesUpdated.length, 3);

  deleteGroup(groupId);
});
