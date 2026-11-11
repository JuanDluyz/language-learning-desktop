import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import {
  closeAnkiImport,
  getAnkiDeckFields,
  getAnkiDeckPhrases,
  normalizeAnkiField,
  openAnkiImport,
  previewAnkiDeck
} from '../../src/service/anki-import-service/anki-import.service.js';

const { zstdCompressSync } = createRequire(import.meta.url)('node:zlib');
const temporaryDirectories = [];

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

function makeZipEntry(fileName, contents) {
  const name = Buffer.from(fileName, 'utf8');
  const data = Buffer.from(contents);
  const crc = crc32(data);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);

  const localRecord = Buffer.concat([localHeader, name, data]);
  const centralRecord = Buffer.concat([centralHeader, name]);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralRecord.length, 12);
  endRecord.writeUInt32LE(localRecord.length, 16);
  return Buffer.concat([localRecord, centralRecord, endRecord]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createAnkiPackage({ colpkg = false, missingMetadata = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'language-local-anki-test-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'collection.anki2');
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE col (id INTEGER PRIMARY KEY, decks TEXT NOT NULL, models TEXT NOT NULL);
    CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER NOT NULL, flds TEXT NOT NULL);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL);
  `);
  database.prepare('INSERT INTO col (id, decks, models) VALUES (1, ?, ?)').run(
    missingMetadata ? '' : JSON.stringify({ 1: { name: 'Practice English' } }),
    missingMetadata ? '' : JSON.stringify({
      10: {
        flds: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 }
        ]
      }
    })
  );
  database.prepare('INSERT INTO notes (id, mid, flds) VALUES (?, 10, ?)').run(
    100,
    '<b>Hello &amp; welcome</b>\x1fHola'
  );
  database.prepare('INSERT INTO notes (id, mid, flds) VALUES (?, 10, ?)').run(
    101,
    '{{c1::Good morning::greeting}}\x1fBuenos días'
  );
  database.prepare('INSERT INTO cards (id, nid, did) VALUES (?, ?, 1)').run(1000, 100);
  database.prepare('INSERT INTO cards (id, nid, did) VALUES (?, ?, 1)').run(1001, 101);
  database.close();

  const packagePath = path.join(directory, colpkg ? 'practice.colpkg' : 'practice.apkg');
  const databaseContents = await fs.readFile(databasePath);
  const collection = colpkg ? zstdCompressSync(databaseContents) : databaseContents;
  const entryName = colpkg ? 'collection.anki21b' : 'collection.anki2';
  await fs.writeFile(packagePath, makeZipEntry(entryName, collection));
  return packagePath;
}

test('imports a selected deck field from an APKG package and previews sanitized text', async () => {
  const packagePath = await createAnkiPackage();
  const session = await openAnkiImport(packagePath);

  try {
    assert.equal(session.fileName, 'practice.apkg');
    assert.deepEqual(session.decks, [
      { id: '1', name: 'Practice English', cardCount: 2 }
    ]);
    assert.deepEqual(getAnkiDeckFields(session.sessionId, '1').fieldNames, ['Front', 'Back']);

    const preview = previewAnkiDeck(session.sessionId, '1', 'Front');
    assert.equal(preview.phraseCount, 2);
    assert.deepEqual(preview.phrases.map((phrase) => phrase.original_text), [
      'Hello & welcome',
      'Good morning'
    ]);
    assert.deepEqual(
      getAnkiDeckPhrases(session.sessionId, '1', 'Back').map((phrase) => phrase.original_text),
      ['Hola', 'Buenos días']
    );
  } finally {
    await closeAnkiImport(session.sessionId);
  }
});

test('normalizes cloze text, HTML entities, and Anki audio markers', () => {
  assert.equal(
    normalizeAnkiField('<p>Use {{c1::the word}} &quot;carefully&quot; [sound:audio.mp3]</p>'),
    'Use the word "carefully"'
  );
});

test('imports a Zstandard-compressed COLPKG collection', { skip: typeof zstdCompressSync !== 'function' }, async () => {
  const packagePath = await createAnkiPackage({ colpkg: true });
  const session = await openAnkiImport(packagePath);

  try {
    assert.equal(session.fileName, 'practice.colpkg');
    assert.equal(getAnkiDeckPhrases(session.sessionId, '1', 'Front').length, 2);
  } finally {
    await closeAnkiImport(session.sessionId);
  }
});

test('infers decks and field names when exported collection metadata is empty', async () => {
  const packagePath = await createAnkiPackage({ missingMetadata: true });
  const session = await openAnkiImport(packagePath);

  try {
    assert.deepEqual(session.decks, [
      { id: '1', name: 'Mazo 1', cardCount: 2 }
    ]);
    assert.deepEqual(getAnkiDeckFields(session.sessionId, '1').fieldNames, ['Campo 1', 'Campo 2']);
    assert.deepEqual(
      getAnkiDeckPhrases(session.sessionId, '1', 'Campo 1').map((phrase) => phrase.original_text),
      ['Hello & welcome', 'Good morning']
    );
  } finally {
    await closeAnkiImport(session.sessionId);
  }
});

test('rejects file extensions other than APKG and COLPKG', async () => {
  await assert.rejects(
    openAnkiImport(path.join(os.tmpdir(), 'not-an-anki.txt')),
    /\.apkg o \.colpkg/
  );
});
