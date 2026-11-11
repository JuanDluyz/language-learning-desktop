import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { Decompress } from 'fzstd';
import yauzl from 'yauzl';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const COLLECTION_ENTRIES = new Set([
  'collection.anki2',
  'collection.anki21',
  'collection.anki21b'
]);
const MAX_PACKAGE_SIZE = 1024 * 1024 * 1024;
const MAX_COLLECTION_SIZE = 1024 * 1024 * 1024;
const importSessions = new Map();

function openArchive(filePath) {
  return yauzl.openPromise(filePath, {
    autoClose: false,
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true
  });
}

function findCollectionEntry(archive) {
  return new Promise((resolve, reject) => {
    const onEntry = (entry) => {
      const name = path.posix.basename(entry.fileName).toLowerCase();
      if (COLLECTION_ENTRIES.has(name)) {
        resolve(entry);
        return;
      }
      archive.readEntry();
    };
    const onError = (error) => reject(error);
    const onEnd = () => reject(new Error('El paquete no contiene una base de datos de Anki compatible.'));

    archive.on('entry', onEntry);
    archive.once('error', onError);
    archive.once('end', onEnd);
    archive.readEntry();
  });
}

function createZstdDecoder() {
  const decoder = new Decompress();
  let outputSize = 0;
  let transform;
  const pushOutput = (data) => {
    outputSize += data.byteLength;
    if (outputSize > MAX_COLLECTION_SIZE) {
      throw new Error('La base de datos descomprimida supera el tamaño máximo permitido.');
    }
    transform.push(Buffer.from(data));
  };
  transform = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        decoder.ondata = pushOutput;
        decoder.push(chunk);
        callback();
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        decoder.ondata = pushOutput;
        decoder.push(new Uint8Array(0), true);
        callback();
      } catch (error) {
        callback(error);
      }
    }
  });
  return transform;
}

function openEntryStream(archive, entry) {
  return new Promise((resolve, reject) => {
    archive.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

async function extractCollectionDatabase(filePath, directory) {
  const archive = await openArchive(filePath);
  try {
    const entry = await findCollectionEntry(archive);
    if (entry.uncompressedSize > MAX_COLLECTION_SIZE) {
      throw new Error('La base de datos del paquete supera el tamaño máximo permitido.');
    }

    const databasePath = path.join(directory, 'collection.sqlite');
    const source = await openEntryStream(archive, entry);
    const streams = [source];
    if (path.posix.basename(entry.fileName).toLowerCase() === 'collection.anki21b') {
      streams.push(createZstdDecoder());
    }
    streams.push(fs.createWriteStream(databasePath, { flags: 'wx' }));
    await pipeline(...streams);
    return databasePath;
  } finally {
    archive.close();
  }
}

function readJsonObject(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('El contenido no es un objeto.');
    }
    return parsed;
  } catch (error) {
    console.warn(`[Anki Import] No se pudieron leer los ${label} de Anki; se inferirán desde las tarjetas:`, error.message);
    return {};
  }
}

function inferModels(database, models) {
  const inferredCounts = new Map();
  for (const row of database.prepare('SELECT mid, flds FROM notes').iterate()) {
    const fieldCount = String(row.flds || '').split('\x1f').length;
    inferredCounts.set(String(row.mid), Math.max(inferredCounts.get(String(row.mid)) || 0, fieldCount));
  }

  for (const [modelId, fieldCount] of inferredCounts) {
    const model = models[modelId] || {};
    const existingFields = Array.isArray(model.flds) ? model.flds : [];
    const fieldsByOrder = new Map(
      existingFields
        .filter((field) => field
          && typeof field === 'object'
          && Number.isInteger(Number(field.ord))
          && Number(field.ord) >= 0)
        .map((field) => [Number(field.ord), field])
    );
    for (let index = 0; index < fieldCount; index += 1) {
      if (!fieldsByOrder.has(index) || !String(fieldsByOrder.get(index).name || '').trim()) {
        fieldsByOrder.set(index, { ord: index, name: `Campo ${index + 1}` });
      }
    }
    models[modelId] = {
      ...model,
      flds: [...fieldsByOrder.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, field]) => field)
    };
  }
  return models;
}

function getCollectionMetadata(database) {
  const tables = new Set(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
  );
  if (!tables.has('col') || !tables.has('notes') || !tables.has('cards')) {
    throw new Error('La base de datos del paquete no tiene el formato de colección de Anki esperado.');
  }

  const collection = database.prepare('SELECT decks, models FROM col LIMIT 1').get();
  if (!collection) throw new Error('La colección de Anki está vacía o no es válida.');
  const decks = readJsonObject(collection.decks, 'mazos');
  const models = inferModels(database, readJsonObject(collection.models, 'modelos'));
  const cardCounts = database.prepare('SELECT did, COUNT(*) AS card_count FROM cards GROUP BY did').all();
  const availableDecks = cardCounts
    .map(({ did, card_count }) => {
      const deck = decks[String(did)] || {};
      return { id: String(did), name: String(deck.name || `Mazo ${did}`), cardCount: card_count };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (availableDecks.length === 0) {
    throw new Error('No se encontraron mazos con tarjetas importables en el paquete.');
  }

  return { decks: availableDecks, models };
}

function readSession(sessionId) {
  const session = importSessions.get(sessionId);
  if (!session) throw new Error('La sesión de importación de Anki expiró. Selecciona el archivo nuevamente.');
  return session;
}

function getDeckModels(session, deckId) {
  const deck = session.decks.find((item) => item.id === String(deckId));
  if (!deck) throw new Error('El mazo seleccionado no existe en el paquete.');

  const rows = session.database.prepare(`
    SELECT DISTINCT notes.mid
    FROM cards
    JOIN notes ON notes.id = cards.nid
    WHERE cards.did = ?
  `).all(String(deckId));
  const models = rows.map(({ mid }) => session.models[String(mid)]).filter(Boolean);
  if (models.length === 0) throw new Error('No se encontraron notas para el mazo seleccionado.');

  const fieldNames = [...new Set(models.flatMap((model) =>
    (Array.isArray(model.flds) ? model.flds : [])
      .slice()
      .sort((left, right) => Number(left.ord) - Number(right.ord))
      .map((field) => String(field.name || '').trim())
      .filter(Boolean)
  ))];
  if (fieldNames.length === 0) throw new Error('El mazo no contiene campos de nota importables.');

  const noteCount = session.database.prepare(`
    SELECT COUNT(DISTINCT notes.id) AS count
    FROM cards
    JOIN notes ON notes.id = cards.nid
    WHERE cards.did = ?
  `).get(String(deckId)).count;

  return { deck, fieldNames, noteCount };
}

export function normalizeAnkiField(value) {
  return String(value || '')
    .replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/gi, '$1')
    .replace(/\[sound:[^\]]+\]/gi, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(div|p|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => decodeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => decodeCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeCodePoint(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return ' ';
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return ' ';
  return String.fromCodePoint(codePoint);
}

function getDeckPhrases(session, deckId, fieldName) {
  const { fieldNames } = getDeckModels(session, deckId);
  if (!fieldNames.includes(fieldName)) throw new Error('El campo seleccionado no existe en el mazo.');

  const notes = session.database.prepare(`
    SELECT DISTINCT notes.id, notes.mid, notes.flds
    FROM cards
    JOIN notes ON notes.id = cards.nid
    WHERE cards.did = ?
    ORDER BY notes.id
  `).iterate(String(deckId));

  const phrases = [];
  for (const note of notes) {
    const model = session.models[String(note.mid)];
    const fields = (Array.isArray(model?.flds) ? model.flds : [])
      .slice()
      .sort((left, right) => Number(left.ord) - Number(right.ord));
    const fieldIndex = fields.findIndex((field) => String(field.name || '').trim() === fieldName);
    if (fieldIndex < 0) continue;
    const rawValue = String(note.flds || '').split('\x1f')[fieldIndex] || '';
    const text = normalizeAnkiField(rawValue);
    if (text) phrases.push({ original_text: text, cefr_level: 'B1', exercise_type: 'dictation' });
  }
  return phrases;
}

export async function openAnkiImport(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Selecciona un archivo de Anki para importar.');
  }

  const resolvedPath = path.resolve(filePath);
  const extension = path.extname(resolvedPath).toLowerCase();
  if (!['.apkg', '.colpkg'].includes(extension)) {
    throw new Error('El archivo debe tener extensión .apkg o .colpkg.');
  }

  const fileStat = await fsp.stat(resolvedPath);
  if (!fileStat.isFile()) throw new Error('La ruta seleccionada no es un archivo.');
  if (fileStat.size === 0 || fileStat.size > MAX_PACKAGE_SIZE) {
    throw new Error('El archivo está vacío o supera el tamaño máximo de 1 GB.');
  }

  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'language-local-anki-'));
  let database;
  try {
    const databasePath = await extractCollectionDatabase(resolvedPath, directory);
    database = new Database(databasePath, { readonly: true, fileMustExist: true });
    database.pragma('query_only = ON');
    const { decks, models } = getCollectionMetadata(database);
    const sessionId = randomUUID();
    importSessions.set(sessionId, {
      database,
      directory,
      fileName: path.basename(resolvedPath),
      decks,
      models
    });
    database = null;
    return {
      sessionId,
      fileName: path.basename(resolvedPath),
      decks
    };
  } catch (error) {
    database?.close();
    await fsp.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export function getAnkiDeckFields(sessionId, deckId) {
  const session = readSession(sessionId);
  const { deck, fieldNames, noteCount } = getDeckModels(session, deckId);
  return { deck, fieldNames, noteCount };
}

export function previewAnkiDeck(sessionId, deckId, fieldName) {
  const session = readSession(sessionId);
  const phrases = getDeckPhrases(session, deckId, fieldName);
  if (phrases.length === 0) throw new Error('El campo seleccionado no contiene texto importable.');
  return { phraseCount: phrases.length, phrases: phrases.slice(0, 5) };
}

export function getAnkiDeckPhrases(sessionId, deckId, fieldName) {
  const session = readSession(sessionId);
  const phrases = getDeckPhrases(session, deckId, fieldName);
  if (phrases.length === 0) throw new Error('El campo seleccionado no contiene texto importable.');
  return phrases;
}

export async function closeAnkiImport(sessionId) {
  const session = importSessions.get(sessionId);
  if (!session) return;
  importSessions.delete(sessionId);
  session.database.close();
  await fsp.rm(session.directory, { recursive: true, force: true });
}

export async function cleanupAnkiImports() {
  await Promise.all([...importSessions.keys()].map((sessionId) => closeAnkiImport(sessionId)));
}
