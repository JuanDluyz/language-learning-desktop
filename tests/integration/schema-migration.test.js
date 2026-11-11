import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  closeDatabase,
  getGroups,
  getPhrasesByGroup,
  initializeDatabase
} from '../../src/service/database-service/database.service.js';

let databaseDirectory;

before(async () => {
  databaseDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'language-local-app-migration-'));
  const legacyDatabase = new Database(path.join(databaseDirectory, 'database.sqlite'));
  legacyDatabase.exec(`
    CREATE TABLE groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
    CREATE TABLE phrases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      audio_path TEXT,
      group_id INTEGER NOT NULL,
      repetition_state TEXT,
      interval INTEGER
    );
    CREATE TABLE config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    INSERT INTO groups (id, name) VALUES (42, 'legacy-group');
    INSERT INTO phrases (id, original_text, timestamp, group_id, repetition_state, interval)
      VALUES (99, 'legacy phrase', '2025-01-01T00:00:00.000Z', 42, 'review', 6);
    INSERT INTO config (key, value) VALUES ('has_seeded_initial_content', 'true');
  `);
  legacyDatabase.close();

  initializeDatabase(databaseDirectory);
});

after(async () => {
  closeDatabase();
  await fs.rm(databaseDirectory, { recursive: true, force: true });
});

test('legacy schema is migrated while existing groups and SM-2 state are preserved', () => {
  const group = getGroups().find((item) => item.id === 42);
  assert.ok(group);
  assert.equal(group.name, 'legacy-group');
  assert.equal(group.type, 'static');

  const [phrase] = getPhrasesByGroup(42);
  assert.equal(phrase.id, 99);
  assert.equal(phrase.original_text, 'legacy phrase');
  assert.equal(phrase.repetition_state, 'review');
  assert.equal(phrase.interval, 6);
  assert.equal(phrase.repetition_count, 1);
  assert.equal(phrase.ease_factor, 250);
  assert.equal(phrase.anki_state, 'due');
});
