import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { DEFAULT_PROMPTS, PROMPT_METADATA } from '../../common/prompt-templates.constants.js';
import { LEVEL_100_PHRASES, LEVEL_50_WORDS, SLA_DEMO_GROUPS } from './database-seed.service.js';
import { calculateSuperMemo2 } from '../srs-service/supermemo2.service.js';

let database;

const SEED_TOPICS = [
  { code: 'Everyday Life', label_es: 'Vida Cotidiana', label_en: 'Everyday Life', category: 'general' },
  { code: 'Travel', label_es: 'Viajes y Cultura', label_en: 'Travel & Culture', category: 'general' },
  { code: 'Business', label_es: 'Negocios y Trabajo', label_en: 'Business & Work', category: 'academic' },
  { code: 'Technology', label_es: 'Tecnología', label_en: 'Technology', category: 'academic' },
  { code: 'Random', label_es: 'Aleatorio', label_en: 'Random', category: 'general' }
];

const seedGroups = [
  { id: 1, name: 'Saludos y aprendizaje' },
  { id: 2, name: 'Situaciones cotidianas' },
  { id: 3, name: 'Estudio y solicitudes' }
];

const seedPhrases = [
  { groupId: 1, text: 'Good morning, how are you?' },
  { groupId: 1, text: 'I am learning English every day.' },
  { groupId: 2, text: 'The train leaves at eight o clock.' },
  { groupId: 2, text: 'Please open the window.' },
  { groupId: 3, text: 'We are studying together in the library.' },
  { groupId: 3, text: 'I would like a glass of water.' }
];

const DEFAULT_DB_CONFIG = {
  selected_model: '',
  use_gpu: false,
  llm_execution_mode: 'local',
  cloud_provider: 'openai',
  cloud_api_key: '',
  cloud_model: 'gpt-4o-mini',
  level: 'B1',
  internal_level_score: 3.0,
  auto_review: true,
  review_language: 'Español',
  ui_language: 'Español',
  dark_mode: true,
  audio_device: 'default',
  audio_accent: 'en-us',
  audio_speed: 'normal',
  custom_prompts: {}
};

function serializeConfigValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseConfigValue(value) {
  if (value === undefined || value === null || value === '') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch {
    return value;
  }
}

function seedConfigDefaults() {
  const db = requireDatabase();
  const insert = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_DB_CONFIG)) {
      insert.run(key, serializeConfigValue(value));
    }
  });

  transaction();
}

function migrateLegacyConfigFiles(databaseDirectory) {
  const legacyConfigPath = path.join(databaseDirectory, 'config.json');
  if (fs.existsSync(legacyConfigPath)) {
    try {
      const content = fs.readFileSync(legacyConfigPath, 'utf8');
      const jsonConfig = JSON.parse(content);
      if (jsonConfig && typeof jsonConfig === 'object') {
        saveDbConfig(jsonConfig);
      }
      fs.unlinkSync(legacyConfigPath);
    } catch (err) {
      console.error('Error al migrar config.json legacy:', err);
    }
  }

  const legacyDynamicPath = path.join(databaseDirectory, 'dynamic_data.json');
  const legacyDynamicPath2 = path.join(databaseDirectory, 'dynamic-phrases.json');
  
  [legacyDynamicPath, legacyDynamicPath2].forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const phrases = JSON.parse(content);
        if (Array.isArray(phrases)) {
          for (const phrase of phrases) {
            saveDynamicPhrase(phrase);
          }
        }
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Error al migrar ${filePath} legacy:`, err);
      }
    }
  });
}

export function initializeDatabase(databaseDirectory) {
  fs.mkdirSync(databaseDirectory, { recursive: true });
  database = new Database(path.join(databaseDirectory, 'database.sqlite'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'static',
      dynamic_config TEXT,
      daily_limit INTEGER DEFAULT 20
    );

    CREATE TABLE IF NOT EXISTS phrases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      audio_path TEXT,
      group_id INTEGER NOT NULL,
      cefr_level TEXT,
      topic TEXT,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS dynamic_phrases (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      original_text TEXT NOT NULL,
      audio_path TEXT,
      cefr_level TEXT,
      topic TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adaptive_generation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      cefr_level TEXT NOT NULL,
      generation_mode TEXT NOT NULL,
      used_fallback INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_adaptive_generation_logs_session
      ON adaptive_generation_logs (session_id, slot_index);

    CREATE TABLE IF NOT EXISTS app_prompts (
      key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      target_id TEXT,
      title_es TEXT NOT NULL,
      title_en TEXT NOT NULL,
      default_text TEXT NOT NULL,
      custom_text TEXT,
      is_custom INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      label_es TEXT NOT NULL,
      label_en TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      prompt_context TEXT,
      is_custom INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  migrateExistingPhrases();
  migrateExistingGroups();
  seedDatabase();
  seedExtraGroupsAndPhrases();
  seedConfigDefaults();
  seedPromptsAndTopics();
  migrateLegacyConfigFiles(databaseDirectory);
}

function migrateExistingGroups() {
  const columns = database.prepare('PRAGMA table_info(groups)').all().map((column) => column.name);
  if (!columns.includes('type')) database.exec("ALTER TABLE groups ADD COLUMN type TEXT DEFAULT 'static'");
  if (!columns.includes('dynamic_config')) database.exec('ALTER TABLE groups ADD COLUMN dynamic_config TEXT');
  if (!columns.includes('daily_limit')) database.exec('ALTER TABLE groups ADD COLUMN daily_limit INTEGER DEFAULT 20');
}

function migrateExistingPhrases() {
  const columns = database.prepare('PRAGMA table_info(phrases)').all().map((column) => column.name);
  if (!columns.includes('cefr_level')) database.exec('ALTER TABLE phrases ADD COLUMN cefr_level TEXT');
  if (!columns.includes('topic')) database.exec('ALTER TABLE phrases ADD COLUMN topic TEXT');
  if (!columns.includes('ease_factor')) database.exec('ALTER TABLE phrases ADD COLUMN ease_factor INTEGER DEFAULT 250');
  if (!columns.includes('interval')) database.exec('ALTER TABLE phrases ADD COLUMN interval INTEGER DEFAULT 0');
  if (!columns.includes('repetition_state')) database.exec('ALTER TABLE phrases ADD COLUMN repetition_state TEXT DEFAULT "learning"');
  if (!columns.includes('lapses')) database.exec('ALTER TABLE phrases ADD COLUMN lapses INTEGER DEFAULT 0');
  if (!columns.includes('repetition_count')) {
    database.exec('ALTER TABLE phrases ADD COLUMN repetition_count INTEGER DEFAULT 0');
    database.exec("UPDATE phrases SET repetition_count = CASE WHEN repetition_state = 'review' AND interval > 0 THEN 1 ELSE 0 END");
  }
  if (!columns.includes('last_grade')) database.exec('ALTER TABLE phrases ADD COLUMN last_grade INTEGER');
  if (!columns.includes('due_date')) database.exec('ALTER TABLE phrases ADD COLUMN due_date TEXT');
  if (!columns.includes('exercise_type')) database.exec('ALTER TABLE phrases ADD COLUMN exercise_type TEXT DEFAULT "dictation"');
  if (!columns.includes('exercise_metadata')) database.exec('ALTER TABLE phrases ADD COLUMN exercise_metadata TEXT');
}

function seedDatabase() {
  const db = requireDatabase();
  const seededRow = db.prepare("SELECT value FROM config WHERE key = 'has_seeded_initial_content'").get();
  if (seededRow && seededRow.value === 'true') {
    return;
  }

  const insertGroup = db.prepare("INSERT OR IGNORE INTO groups (id, name, type) VALUES (?, ?, 'static')");
  for (const group of seedGroups) insertGroup.run(group.id, group.name);

  const count = db.prepare('SELECT COUNT(*) AS count FROM phrases').get().count;
  if (count === 0) {
    const insertPhrase = db.prepare(`
      INSERT INTO phrases (original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_state, lapses, due_date)
      VALUES (?, ?, ?, ?, ?, ?, 250, 0, 'learning', 0, ?)
    `);
    const insertMany = db.transaction((phrases) => {
      for (const phrase of phrases) {
        insertPhrase.run(phrase.text, new Date().toISOString(), null, phrase.groupId, 'A1', null, new Date().toISOString());
      }
    });
    insertMany(seedPhrases);
  }

  seedExtraGroupsAndPhrases();

  db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('has_seeded_initial_content', 'true')").run();
}

function seedExtraGroupsAndPhrases() {
  const db = requireDatabase();
  const now = new Date().toISOString();

  // 1. Grupo 4: Banco de Frases por Nivel (A1-C1) (100 frases)
  let groupPhrases = db.prepare("SELECT id FROM groups WHERE name = 'Banco de Frases por Nivel (A1-C1)'").get();
  if (!groupPhrases) {
    const res = db.prepare("INSERT INTO groups (name, type) VALUES ('Banco de Frases por Nivel (A1-C1)', 'static')").run();
    groupPhrases = { id: res.lastInsertRowid };
  }

  const countP = db.prepare("SELECT COUNT(*) AS count FROM phrases WHERE group_id = ?").get(groupPhrases.id).count;
  if (countP === 0) {
    const insertPhrase = db.prepare(`
      INSERT INTO phrases (original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_state, lapses, due_date)
      VALUES (?, ?, NULL, ?, ?, 'General', 250, 0, 'learning', 0, ?)
    `);

    const txP = db.transaction((items) => {
      for (const item of items) {
        insertPhrase.run(item.text, now, groupPhrases.id, item.level, now);
      }
    });
    txP(LEVEL_100_PHRASES);
  }

  // 2. Grupo 5: Vocabulario y Expresiones Clave (A1-C1) (50 palabras/expresiones)
  let groupWords = db.prepare("SELECT id FROM groups WHERE name = 'Vocabulario y Expresiones Clave (A1-C1)'").get();
  if (!groupWords) {
    const res = db.prepare("INSERT INTO groups (name, type) VALUES ('Vocabulario y Expresiones Clave (A1-C1)', 'vocabulary')").run();
    groupWords = { id: res.lastInsertRowid };
  }
  db.prepare("UPDATE groups SET type = 'vocabulary' WHERE id = ?").run(groupWords.id);
  db.prepare("UPDATE phrases SET cefr_level = 'VOCAB' WHERE group_id = ?").run(groupWords.id);

  const countW = db.prepare("SELECT COUNT(*) AS count FROM phrases WHERE group_id = ?").get(groupWords.id).count;
  if (countW === 0) {
    const insertPhrase = db.prepare(`
      INSERT INTO phrases (original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_state, lapses, due_date)
      VALUES (?, ?, NULL, ?, 'VOCAB', 'Vocabulario', 250, 0, 'learning', 0, ?)
    `);

    const txW = db.transaction((items) => {
      for (const item of items) {
        insertPhrase.run(item.text, now, groupWords.id, now);
      }
    });
    txW(LEVEL_50_WORDS);
  }

  // 3. Grupos Demo SLA (Cloze i+1)
  if (Array.isArray(SLA_DEMO_GROUPS)) {
    for (const slaGroup of SLA_DEMO_GROUPS) {
      let group = db.prepare('SELECT id FROM groups WHERE name = ?').get(slaGroup.name);
      if (!group) {
        const res = db.prepare("INSERT INTO groups (name, type) VALUES (?, 'static')").run(slaGroup.name);
        group = { id: res.lastInsertRowid };
      }

      const countSla = db.prepare('SELECT COUNT(*) AS count FROM phrases WHERE group_id = ?').get(group.id).count;
      if (countSla === 0) {
        const insertSlaPhrase = db.prepare(`
          INSERT INTO phrases (original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_state, lapses, due_date, exercise_type, exercise_metadata)
          VALUES (?, ?, NULL, ?, ?, 'SLA Practice', 250, 0, 'learning', 0, ?, ?, ?)
        `);

        const txSla = db.transaction((phrases) => {
          for (const item of phrases) {
            const metadataStr = item.exercise_metadata ? JSON.stringify(item.exercise_metadata) : (item.metadata ? JSON.stringify(item.metadata) : null);
            insertSlaPhrase.run(
              item.text,
              now,
              group.id,
              item.level || 'B1',
              now,
              item.exercise_type || 'dictation',
              metadataStr
            );
          }
        });
        txSla(slaGroup.phrases);
      }
    }
  }

  // Eliminar grupos de demostración SLA descartados
  const removedGroups = ['[SLA] 2. Taller de Parafraseo e Ideas', '[SLA] 3. Micro-Roleplays de Viaje y Trabajo'];
  for (const name of removedGroups) {
    const group = db.prepare('SELECT id FROM groups WHERE name = ?').get(name);
    if (group) {
      db.prepare('DELETE FROM phrases WHERE group_id = ?').run(group.id);
      db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
    }
  }
}

function seedPromptsAndTopics() {
  const db = requireDatabase();
  const now = new Date().toISOString();

  // Seed & Update Prompts Defaults
  const insertPrompt = db.prepare(`
    INSERT INTO app_prompts (key, category, target_id, title_es, title_en, default_text, custom_text, is_custom, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?)
    ON CONFLICT(key) DO UPDATE SET
      default_text = excluded.default_text,
      title_es = excluded.title_es,
      title_en = excluded.title_en,
      category = excluded.category
  `);

  const promptTx = db.transaction(() => {
    // Migrar y limpiar claves obsoletas con sufijo idiomático duplicado
    const obsoleteKeys = ['eval_system_es', 'eval_system_en', 'explain_system_es', 'explain_system_en'];
    for (const obsKey of obsoleteKeys) {
      const canonical = obsKey.startsWith('eval_') ? 'eval_system' : 'explain_system';
      const existing = db.prepare('SELECT custom_text, is_custom FROM app_prompts WHERE key = ?').get(obsKey);
      if (existing && existing.is_custom === 1 && existing.custom_text) {
        db.prepare('UPDATE app_prompts SET custom_text = ?, is_custom = 1, updated_at = ? WHERE key = ? AND is_custom = 0')
          .run(existing.custom_text, now, canonical);
      }
      db.prepare('DELETE FROM app_prompts WHERE key = ?').run(obsKey);
    }

    for (const meta of PROMPT_METADATA) {
      const defaultText = DEFAULT_PROMPTS[meta.key] || '';
      let targetId = null;
      if (meta.key.startsWith('grammar_')) {
        targetId = meta.key.replace('grammar_', '');
      } else if (meta.key.endsWith('_es')) {
        targetId = 'es';
      } else if (meta.key.endsWith('_en')) {
        targetId = 'en';
      }
      insertPrompt.run(meta.key, meta.group_id, targetId, meta.title_es, meta.title_en, defaultText, now);
    }
  });
  promptTx();

  // Migración de legacy config.custom_prompts
  try {
    const configRow = db.prepare("SELECT value FROM config WHERE key = 'custom_prompts'").get();
    if (configRow && configRow.value) {
      const parsed = parseConfigValue(configRow.value);
      if (parsed && typeof parsed === 'object') {
        const updateStmt = db.prepare(`
          UPDATE app_prompts SET custom_text = ?, is_custom = 1, updated_at = ? WHERE key = ?
        `);
        for (const [key, customVal] of Object.entries(parsed)) {
          if (typeof customVal === 'string' && customVal.trim()) {
            updateStmt.run(customVal.trim(), now, key);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error al migrar legacy custom_prompts:', err);
  }

  // Seed Topics
  const insertTopic = db.prepare(`
    INSERT OR IGNORE INTO study_topics (code, label_es, label_en, category, prompt_context, is_custom, created_at)
    VALUES (?, ?, ?, ?, NULL, 0, ?)
  `);

  const topicTx = db.transaction(() => {
    for (const t of SEED_TOPICS) {
      insertTopic.run(t.code, t.label_es, t.label_en, t.category, now);
    }
  });
  topicTx();
}

function requireDatabase() {
  if (!database) throw new Error('La base de datos no está inicializada.');
  return database;
}

// --- CONFIGURACIÓN EN SQLITE ---

export function getDbConfig() {
  try {
    const rows = requireDatabase().prepare('SELECT key, value FROM config').all();
    const config = { ...DEFAULT_DB_CONFIG };

    for (const row of rows) {
      config[row.key] = parseConfigValue(row.value);
    }

    return config;
  } catch {
    return { ...DEFAULT_DB_CONFIG };
  }
}

export function saveDbConfig(newConfig) {
  if (!newConfig || typeof newConfig !== 'object') return { success: true };
  const db = requireDatabase();
  const stmt = db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const transaction = db.transaction((configObj) => {
    for (const [key, value] of Object.entries(configObj)) {
      stmt.run(key, serializeConfigValue(value));
    }
  });

  transaction(newConfig);
  return { success: true };
}

// --- TABLA Y FUNCIONES PARA GRUPOS Y FRASES ---

export function getGroups() {
  return requireDatabase().prepare(`
    SELECT 
      groups.id, 
      groups.name, 
      groups.type, 
      groups.dynamic_config, 
      COALESCE(groups.daily_limit, 20) AS daily_limit,
      COUNT(phrases.id) AS phrase_count,
      SUM(CASE WHEN phrases.id IS NOT NULL AND (phrases.repetition_count IS NULL OR phrases.repetition_count = 0) AND phrases.last_grade IS NULL THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN phrases.id IS NOT NULL AND (phrases.repetition_count > 0 OR phrases.last_grade IS NOT NULL) AND (phrases.due_date IS NULL OR phrases.due_date <= datetime('now')) THEN 1 ELSE 0 END) AS due_count,
      SUM(CASE WHEN phrases.id IS NOT NULL AND (phrases.repetition_count > 0 OR phrases.last_grade IS NOT NULL) AND phrases.due_date > datetime('now') THEN 1 ELSE 0 END) AS learning_count
    FROM groups
    LEFT JOIN phrases ON phrases.group_id = groups.id
    GROUP BY groups.id, groups.name, groups.type, groups.dynamic_config, groups.daily_limit
    ORDER BY groups.id
  `).all();
}

export function createGroup(name, type = 'static', dynamicConfig = null, dailyLimit = 20) {
  if (!name || !name.trim()) throw new Error('El nombre del grupo no puede estar vacío.');
  const serializedConfig = dynamicConfig ? (typeof dynamicConfig === 'string' ? dynamicConfig : JSON.stringify(dynamicConfig)) : null;
  const parsedLimit = Math.max(1, Math.min(200, Number(dailyLimit) || 20));
  const result = requireDatabase()
    .prepare('INSERT INTO groups (name, type, dynamic_config, daily_limit) VALUES (?, ?, ?, ?)')
    .run(name.trim(), type || 'static', serializedConfig, parsedLimit);
  return result.lastInsertRowid;
}

export function updateGroup(id, name, type = null, dynamicConfig = null, dailyLimit = null) {
  if (!name || !name.trim()) throw new Error('El nombre del grupo no puede estar vacío.');
  const db = requireDatabase();
  const updates = ['name = ?'];
  const params = [name.trim()];

  if (type !== null && type !== undefined) {
    updates.push('type = ?');
    params.push(type);
    const serializedConfig = dynamicConfig ? (typeof dynamicConfig === 'string' ? dynamicConfig : JSON.stringify(dynamicConfig)) : null;
    updates.push('dynamic_config = ?');
    params.push(serializedConfig);
  }

  if (dailyLimit !== null && dailyLimit !== undefined) {
    updates.push('daily_limit = ?');
    params.push(Math.max(1, Math.min(200, Number(dailyLimit) || 20)));
  }

  params.push(id);
  db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return { success: true };
}

export function deleteGroup(id, audioBaseDir = null) {
  const db = requireDatabase();
  const phrases = db.prepare('SELECT audio_path FROM phrases WHERE group_id = ? AND audio_path IS NOT NULL').all(id);
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM phrases WHERE group_id = ?').run(id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  });
  transaction();

  if (phrases.length > 0) {
    for (const phrase of phrases) {
      if (phrase.audio_path) {
        try {
          const candidates = [
            phrase.audio_path,
            audioBaseDir ? path.join(audioBaseDir, path.basename(phrase.audio_path)) : null
          ].filter(Boolean);
          for (const cand of candidates) {
            if (fs.existsSync(cand)) fs.rmSync(cand, { force: true });
          }
        } catch {}
      }
    }
  }

  return { success: true };
}

export function getPhraseByGroup(groupId) {
  return requireDatabase()
    .prepare(`SELECT id, original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_count, last_grade, repetition_state, lapses, due_date, exercise_type, exercise_metadata
      FROM phrases WHERE group_id = ? ORDER BY RANDOM() LIMIT 1`)
    .get(groupId);
}

export function getPhrasesByGroup(groupId) {
  const rows = requireDatabase()
    .prepare(`SELECT id, original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_count, last_grade, repetition_state, lapses, due_date, exercise_type, exercise_metadata
      FROM phrases WHERE group_id = ? ORDER BY id`)
    .all(groupId);

  const now = Date.now();
  return rows.map(phrase => {
    const isNew = (!phrase.repetition_count || phrase.repetition_count === 0) && phrase.last_grade === null;
    const isDue = !isNew && (!phrase.due_date || Date.parse(phrase.due_date) <= now);
    const ankiState = isNew ? 'new' : (isDue ? 'due' : 'learning');
    return { ...phrase, anki_state: ankiState };
  });
}

export function getDuePhrasesByGroup(groupId, explicitLimit = null) {
  const db = requireDatabase();
  const group = db.prepare('SELECT daily_limit FROM groups WHERE id = ?').get(groupId);
  const limit = explicitLimit ? Math.max(1, Number(explicitLimit)) : (group?.daily_limit || 20);

  const rows = db.prepare(`
    SELECT id, original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval,
           repetition_count, last_grade, repetition_state, lapses, due_date, exercise_type, exercise_metadata,
           CASE
             WHEN (due_date IS NOT NULL AND due_date <= datetime('now')) THEN 0
             WHEN (repetition_count IS NULL OR repetition_count = 0) AND last_grade IS NULL THEN 1
             ELSE 2
           END AS priority_rank
    FROM phrases
    WHERE group_id = ?
    ORDER BY priority_rank ASC, lapses DESC, ease_factor ASC, id ASC
    LIMIT ?
  `).all(groupId, limit);

  const now = Date.now();
  return rows.map((phrase) => {
    const isNew = (!phrase.repetition_count || phrase.repetition_count === 0) && phrase.last_grade === null;
    const isDue = !isNew && (!phrase.due_date || Date.parse(phrase.due_date) <= now);
    const ankiState = isNew ? 'new' : (isDue ? 'due' : 'learning');
    return { ...phrase, anki_state: ankiState };
  });
}

export function createPhrase(groupId, text, cefrLevel = 'B1', exerciseType = 'dictation', exerciseMetadata = null) {
  if (!text || !text.trim()) throw new Error('La frase no puede estar vacía.');
  const db = requireDatabase();
  const group = db.prepare('SELECT type FROM groups WHERE id = ?').get(groupId);

  let level = cefrLevel || 'B1';
  if (group && group.type === 'vocabulary') {
    if (text.trim().length > 35) {
      throw new Error('Las palabras de vocabulario no pueden superar los 35 caracteres.');
    }
    level = 'VOCAB';
  }

  const serializedMeta = exerciseMetadata ? (typeof exerciseMetadata === 'string' ? exerciseMetadata : JSON.stringify(exerciseMetadata)) : null;
  const result = db.prepare(`
    INSERT INTO phrases (original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_state, lapses, due_date, exercise_type, exercise_metadata)
    VALUES (?, ?, NULL, ?, ?, 'General', 250, 0, 'learning', 0, ?, ?, ?)
  `).run(text.trim(), new Date().toISOString(), groupId, level, new Date().toISOString(), exerciseType || 'dictation', serializedMeta);
  return result.lastInsertRowid;
}

export function updatePhrase(id, text, cefrLevel = null, exerciseType = null, exerciseMetadata = null) {
  if (!text || !text.trim()) throw new Error('La frase no puede estar vacía.');
  const db = requireDatabase();
  const phrase = db.prepare(`
    SELECT phrases.group_id, groups.type AS group_type
    FROM phrases
    LEFT JOIN groups ON groups.id = phrases.group_id
    WHERE phrases.id = ?
  `).get(id);

  if (phrase && phrase.group_type === 'vocabulary' && text.trim().length > 35) {
    throw new Error('Las palabras de vocabulario no pueden superar los 35 caracteres.');
  }
  if (phrase?.group_type === 'vocabulary') cefrLevel = 'VOCAB';

  const serializedMeta = exerciseMetadata !== null ? (typeof exerciseMetadata === 'string' ? exerciseMetadata : JSON.stringify(exerciseMetadata)) : null;

  if (cefrLevel || exerciseType || serializedMeta) {
    db.prepare('UPDATE phrases SET original_text = ?, cefr_level = COALESCE(?, cefr_level), exercise_type = COALESCE(?, exercise_type), exercise_metadata = COALESCE(?, exercise_metadata), timestamp = ? WHERE id = ?')
      .run(text.trim(), cefrLevel, exerciseType, serializedMeta, new Date().toISOString(), id);
  } else {
    db.prepare('UPDATE phrases SET original_text = ?, timestamp = ? WHERE id = ?').run(text.trim(), new Date().toISOString(), id);
  }
  return { success: true };
}

export function getVocabularyPhrases({ groupId = null, difficulty = 'all', dueOnly = false, limit = null } = {}) {
  const db = requireDatabase();
  let query = `
    SELECT phrases.id, phrases.original_text, phrases.timestamp, phrases.audio_path, phrases.group_id,
           phrases.cefr_level, phrases.topic, phrases.ease_factor, phrases.interval, phrases.repetition_count, phrases.last_grade, phrases.repetition_state,
           phrases.lapses, phrases.due_date, phrases.exercise_type, phrases.exercise_metadata,
           groups.name AS group_name
    FROM phrases
    INNER JOIN groups ON groups.id = phrases.group_id
    WHERE groups.type = 'vocabulary'
  `;
  const params = [];

  if (groupId) {
    query += ` AND phrases.group_id = ?`;
    params.push(groupId);
  }

  if (dueOnly) {
    query += ` AND (phrases.due_date IS NULL OR phrases.due_date <= ?)`;
    params.push(new Date().toISOString());
  }

  const orderBy = dueOnly
    ? ` ORDER BY COALESCE(phrases.due_date, '') ASC, phrases.interval ASC, phrases.id`
    : ` ORDER BY phrases.id`;
  
  let finalQuery = query + orderBy;
  if (limit && Number(limit) > 0) {
    finalQuery += ` LIMIT ?`;
    params.push(Number(limit));
  }

  const rows = db.prepare(finalQuery).all(...params);

  if (difficulty === 'all') return rows;

  return rows.filter((row) => {
    const lapses = row.lapses || 0;
    const ease = row.ease_factor ?? 250;
    const interval = row.interval ?? 0;
    let diff = 'medium';
    if (lapses > 0 || ease < 210 || (row.repetition_state === 'learning' && interval === 0)) {
      diff = 'hard';
    } else if (interval >= 7 || ease >= 260) {
      diff = 'easy';
    }
    return diff === difficulty;
  });
}

export function importGroupWithPhrases(groupName, phrasesArray, groupType = 'static', dynamicConfig = null) {
  if (!groupName || !groupName.trim()) throw new Error('El nombre del grupo no puede estar vacío.');
  if (!Array.isArray(phrasesArray) || phrasesArray.length === 0) throw new Error('El archivo no contiene frases válidas.');

  const db = requireDatabase();
  const serializedConfig = dynamicConfig ? (typeof dynamicConfig === 'string' ? dynamicConfig : JSON.stringify(dynamicConfig)) : null;

  const insertGroup = db.prepare('INSERT INTO groups (name, type, dynamic_config) VALUES (?, ?, ?)');
  const insertPhrase = db.prepare(`
    INSERT INTO phrases (original_text, timestamp, audio_path, group_id, cefr_level, topic, ease_factor, interval, repetition_state, lapses, due_date, exercise_type, exercise_metadata)
    VALUES (?, ?, NULL, ?, ?, ?, 250, 0, 'learning', 0, ?, ?, ?)
  `);

  let newGroupId = null;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    const res = insertGroup.run(groupName.trim(), groupType || 'static', serializedConfig);
    newGroupId = res.lastInsertRowid;

    for (const item of phrasesArray) {
      let text = typeof item === 'string' ? item : (item.text || item.original_text || '');
      if (!text || !text.trim()) continue;

      text = text.trim();
      let level = item.cefr_level || item.level || 'B1';

      if (groupType === 'vocabulary') {
        if (text.length > 35) {
          throw new Error(`El término "${text}" supera el límite de 35 caracteres.`);
        }
        level = 'VOCAB';
      }

      const topic = item.topic || 'General';
      const exType = item.exercise_type || 'dictation';
      const exMeta = item.exercise_metadata ? (typeof item.exercise_metadata === 'string' ? item.exercise_metadata : JSON.stringify(item.exercise_metadata)) : null;

      insertPhrase.run(text, now, newGroupId, level, topic, now, exType, exMeta);
    }
  });

  transaction();
  return { groupId: newGroupId, phraseCount: phrasesArray.length };
}

export function updatePhraseSrs(id, grade) {
  if (!id) return { success: false };
  const db = requireDatabase();
  const transaction = db.transaction((phraseId, userGrade) => {
    const current = db.prepare(`
      SELECT ease_factor, interval, repetition_count, lapses
      FROM phrases WHERE id = ?
    `).get(phraseId);
    if (!current) return { success: false };

    const update = calculateSuperMemo2({
      grade: userGrade,
      repetitionCount: current.repetition_count,
      easeFactor: (current.ease_factor ?? 250) / 100,
      interval: current.interval,
      lapses: current.lapses
    });
    const srsData = {
      ease_factor: Math.round(update.easeFactor * 100),
      interval: update.interval,
      repetition_count: update.repetitionCount,
      last_grade: update.lastGrade,
      repetition_state: update.repetitionState,
      lapses: update.lapses,
      due_date: update.dueDate
    };

    db.prepare(`
      UPDATE phrases
      SET ease_factor = ?, interval = ?, repetition_count = ?, last_grade = ?, repetition_state = ?, lapses = ?, due_date = ?
      WHERE id = ?
    `).run(
      srsData.ease_factor,
      srsData.interval,
      srsData.repetition_count,
      srsData.last_grade,
      srsData.repetition_state,
      srsData.lapses,
      srsData.due_date,
      phraseId
    );
    return { success: true, srsData };
  });

  return transaction(id, grade);
}

export function deletePhrase(id, audioBaseDir = null) {
  const db = requireDatabase();
  const phrase = db.prepare('SELECT audio_path FROM phrases WHERE id = ?').get(id);
  db.prepare('DELETE FROM phrases WHERE id = ?').run(id);

  if (phrase?.audio_path) {
    try {
      const candidates = [
        phrase.audio_path,
        audioBaseDir ? path.join(audioBaseDir, path.basename(phrase.audio_path)) : null
      ].filter(Boolean);
      for (const cand of candidates) {
        if (fs.existsSync(cand)) fs.rmSync(cand, { force: true });
      }
    } catch {}
  }

  return { success: true };
}

export function getAllActiveAudioPaths() {
  try {
    const db = requireDatabase();
    const phraseRows = db.prepare('SELECT audio_path FROM phrases WHERE audio_path IS NOT NULL').all();
    const dynamicRows = db.prepare('SELECT audio_path FROM dynamic_phrases WHERE audio_path IS NOT NULL').all();
    return [...phraseRows.map((r) => r.audio_path), ...dynamicRows.map((r) => r.audio_path)];
  } catch {
    return [];
  }
}

export function getStaticPhraseTexts() {
  return requireDatabase().prepare('SELECT original_text FROM phrases').all().map((row) => row.original_text);
}

export function updateAudioPath(id, audioPath) {
  requireDatabase()
    .prepare('UPDATE phrases SET audio_path = ?, timestamp = ? WHERE id = ?')
    .run(audioPath, new Date().toISOString(), id);
}

// --- FUNCIONES DE SESIONES DINÁMICAS (EN TABLA DYNAMIC_PHRASES SQLITE) ---

export function startDynamicSession() {
  return randomUUID();
}

export function recordAdaptiveGenerationMetrics(sessionId, metrics = []) {
  if (!Array.isArray(metrics) || metrics.length === 0) return { success: true, count: 0 };
  const db = requireDatabase();
  const resolvedSessionId = sessionId || randomUUID();
  const createdAt = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO adaptive_generation_logs
      (session_id, slot_index, cefr_level, generation_mode, used_fallback, attempt_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction((items) => {
    for (const item of items) {
      insert.run(
        resolvedSessionId,
        item.slot_index,
        item.cefr_level,
        item.generation_mode,
        item.used_fallback ? 1 : 0,
        item.attempt_count || 0,
        createdAt
      );
    }
  });
  transaction(metrics);
  return { success: true, sessionId: resolvedSessionId, count: metrics.length };
}

export function getAdaptiveGenerationStats() {
  const row = requireDatabase().prepare(`
    SELECT COUNT(DISTINCT session_id) AS sessions,
           COUNT(*) AS generated,
           COALESCE(SUM(used_fallback), 0) AS fallback_count,
           COALESCE(SUM(CASE WHEN attempt_count > 1 THEN 1 ELSE 0 END), 0) AS retried_count,
           COALESCE(SUM(attempt_count), 0) AS total_attempts
    FROM adaptive_generation_logs
  `).get();
  return {
    ...row,
    fallback_rate: row.generated ? row.fallback_count / row.generated : 0
  };
}

export function saveDynamicPhrase(phrase) {
  if (!phrase) return;
  const db = requireDatabase();
  const stmt = db.prepare(`
    INSERT INTO dynamic_phrases (id, session_id, original_text, audio_path, cefr_level, topic, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      original_text = excluded.original_text,
      audio_path = excluded.audio_path,
      cefr_level = excluded.cefr_level,
      topic = excluded.topic,
      timestamp = excluded.timestamp
  `);

  stmt.run(
    phrase.id || randomUUID(),
    phrase.session_id || '',
    phrase.original_text || '',
    phrase.audio_path || null,
    phrase.cefr_level || null,
    phrase.topic || null,
    phrase.timestamp || new Date().toISOString()
  );
}

export function saveDynamicAsStatic(phrase) {
  const db = requireDatabase();
  db.prepare('INSERT OR IGNORE INTO groups (id, name) VALUES (?, ?)').run(4, 'Frases dinámicas guardadas');
  const result = db.prepare(`
    INSERT INTO phrases (original_text, timestamp, audio_path, group_id, cefr_level, topic)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(phrase.original_text, new Date().toISOString(), phrase.audio_path, 4, phrase.cefr_level || null, phrase.topic || 'dinámico');

  if (phrase.id) {
    db.prepare('DELETE FROM dynamic_phrases WHERE id = ?').run(phrase.id);
  }
  return result.lastInsertRowid;
}

export function cleanupDynamicSession(sessionId, projectRoot) {
  const db = requireDatabase();
  const rows = db.prepare('SELECT audio_path FROM dynamic_phrases WHERE session_id = ?').all(sessionId);
  for (const row of rows) {
    if (row.audio_path) {
      const audioPath = path.join(projectRoot, row.audio_path);
      if (fs.existsSync(audioPath)) fs.rmSync(audioPath, { force: true });
    }
  }
  db.prepare('DELETE FROM dynamic_phrases WHERE session_id = ?').run(sessionId);
}

export function cleanupAllDynamicSessions(projectRoot) {
  const db = requireDatabase();
  const rows = db.prepare('SELECT audio_path FROM dynamic_phrases').all();
  for (const row of rows) {
    if (row.audio_path) {
      const audioPath = path.join(projectRoot, row.audio_path);
      if (fs.existsSync(audioPath)) fs.rmSync(audioPath, { force: true });
    }
  }
  db.prepare('DELETE FROM dynamic_phrases').run();
}

// --- PROMPTS EN SQLITE ---

export function getDbPrompts() {
  try {
    const db = requireDatabase();
    const rows = db.prepare('SELECT * FROM app_prompts ORDER BY category ASC, key ASC').all();
    return rows;
  } catch {
    return [];
  }
}

export function saveDbPrompt({ key, customText }) {
  const db = requireDatabase();
  const now = new Date().toISOString();
  if (customText === null || customText === undefined || customText.trim() === '') {
    db.prepare('UPDATE app_prompts SET custom_text = NULL, is_custom = 0, updated_at = ? WHERE key = ?').run(now, key);
  } else {
    db.prepare('UPDATE app_prompts SET custom_text = ?, is_custom = 1, updated_at = ? WHERE key = ?').run(customText.trim(), now, key);
  }
  return getDbPrompts();
}

export function resetDbPrompt(key) {
  const db = requireDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE app_prompts SET custom_text = NULL, is_custom = 0, updated_at = ? WHERE key = ?').run(now, key);
  return getDbPrompts();
}

// --- TEMAS DE ESTUDIO EN SQLITE ---

export function getDbTopics() {
  try {
    const db = requireDatabase();
    const rows = db.prepare('SELECT * FROM study_topics ORDER BY is_custom ASC, id ASC').all();
    return rows;
  } catch {
    return [];
  }
}

export function createDbTopic(topicData) {
  const db = requireDatabase();
  const now = new Date().toISOString();
  const rawCode = typeof topicData === 'string' ? topicData : (topicData.code || topicData.label || topicData.name || '');
  const code = rawCode.trim();
  if (!code) return getDbTopics();

  const label_es = (typeof topicData === 'object' && topicData.label_es ? topicData.label_es : code).trim();
  const label_en = (typeof topicData === 'object' && topicData.label_en ? topicData.label_en : code).trim();
  const category = (typeof topicData === 'object' && topicData.category) ? topicData.category : 'custom';
  const prompt_context = (typeof topicData === 'object' && topicData.prompt_context) ? topicData.prompt_context : null;

  db.prepare(`
    INSERT INTO study_topics (code, label_es, label_en, category, prompt_context, is_custom, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(code) DO UPDATE SET label_es = excluded.label_es, label_en = excluded.label_en, prompt_context = excluded.prompt_context
  `).run(code, label_es, label_en, category, prompt_context, now);

  return getDbTopics();
}

export function updateDbTopic({ id, code, label_es, label_en, prompt_context }) {
  const db = requireDatabase();
  const targetId = Number(id);
  if (!targetId) return getDbTopics();

  const updates = [];
  const params = [];

  if (code && typeof code === 'string' && code.trim()) {
    updates.push('code = ?');
    params.push(code.trim());
  }
  if (label_es && typeof label_es === 'string' && label_es.trim()) {
    updates.push('label_es = ?');
    params.push(label_es.trim());
  }
  if (label_en && typeof label_en === 'string' && label_en.trim()) {
    updates.push('label_en = ?');
    params.push(label_en.trim());
  }
  if (prompt_context !== undefined) {
    updates.push('prompt_context = ?');
    params.push(prompt_context ? prompt_context.trim() : null);
  }

  if (updates.length > 0) {
    params.push(targetId);
    db.prepare(`UPDATE study_topics SET ${updates.join(', ')} WHERE id = ? AND is_custom = 1`).run(...params);
  }

  return getDbTopics();
}

export function deleteDbTopic(idOrCode) {
  const db = requireDatabase();
  if (typeof idOrCode === 'number') {
    db.prepare('DELETE FROM study_topics WHERE id = ? AND is_custom = 1').run(idOrCode);
  } else {
    db.prepare('DELETE FROM study_topics WHERE code = ? AND is_custom = 1').run(idOrCode);
  }
  return getDbTopics();
}

export function getLevelBaseScore(level) {
  const lvl = String(level || 'B1').toUpperCase().trim();
  switch (lvl) {
    case 'A1': return 1.0;
    case 'A2': return 2.0;
    case 'B1': return 3.0;
    case 'B2': return 4.0;
    case 'C1': return 5.0;
    default: return 3.0;
  }
}

export function calculateSubLevelInfo(scoreVal) {
  const score = Math.max(1.0, Math.min(5.99, Number(scoreVal) || 3.0));
  let macroLevel = 'B1';
  let nextLevel = 'B2';
  let levelBase = 3.0;

  if (score < 2.0) {
    macroLevel = 'A1';
    nextLevel = 'A2';
    levelBase = 1.0;
  } else if (score < 3.0) {
    macroLevel = 'A2';
    nextLevel = 'B1';
    levelBase = 2.0;
  } else if (score < 4.0) {
    macroLevel = 'B1';
    nextLevel = 'B2';
    levelBase = 3.0;
  } else if (score < 5.0) {
    macroLevel = 'B2';
    nextLevel = 'C1';
    levelBase = 4.0;
  } else {
    macroLevel = 'C1';
    nextLevel = 'C2';
    levelBase = 5.0;
  }

  const offset = Math.min(0.99, Math.max(0, score - levelBase));
  const subLevelNum = Math.floor(offset * 10);
  const subLevelStr = `${macroLevel}.${subLevelNum}`;
  const progressPercent = Math.min(100, Math.max(0, Math.round(offset * 100)));

  return {
    macroLevel,
    nextLevel,
    subLevelStr,
    progressPercent,
    score: Math.round(score * 100) / 100
  };
}

export function getDatabaseStats() {
  const db = requireDatabase();
  const config = getDbConfig();

  const totalGroups = db.prepare('SELECT COUNT(*) AS count FROM groups').get().count;
  const totalStaticPhrases = db.prepare('SELECT COUNT(*) AS count FROM phrases').get().count;
  const totalDynamicPhrases = db.prepare('SELECT COUNT(*) AS count FROM dynamic_phrases').get().count;

  // SRS breakdown
  const srsMastered = db.prepare('SELECT COUNT(*) AS count FROM phrases WHERE interval >= 21').get().count;
  const srsReview = db.prepare('SELECT COUNT(*) AS count FROM phrases WHERE interval > 0 AND interval < 21').get().count;
  const srsLearning = db.prepare('SELECT COUNT(*) AS count FROM phrases WHERE interval = 0 OR interval IS NULL').get().count;

  // Level breakdown from phrases table
  const rawLevelCounts = db.prepare(`
    SELECT COALESCE(cefr_level, 'B1') AS level, COUNT(*) AS count 
    FROM phrases 
    GROUP BY COALESCE(cefr_level, 'B1')
  `).all();

  const levelMap = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  for (const row of rawLevelCounts) {
    const key = (row.level || 'B1').toUpperCase();
    if (levelMap[key] !== undefined) levelMap[key] = row.count;
    else levelMap['B1'] += row.count;
  }

  const rawScore = Number(config.internal_level_score) || getLevelBaseScore(config.level || 'B1');
  const levelDetails = calculateSubLevelInfo(rawScore);

  return {
    totalGroups,
    totalStaticPhrases,
    totalDynamicPhrases,
    srs: {
      mastered: srsMastered,
      review: srsReview,
      learning: srsLearning,
      total: totalStaticPhrases
    },
    levelCounts: levelMap,
    ...levelDetails
  };
}

export function updateInternalLevelScore(delta) {
  const config = getDbConfig();
  let currentScore = Number(config.internal_level_score);
  if (isNaN(currentScore) || currentScore <= 0) {
    currentScore = getLevelBaseScore(config.level || 'B1');
  }
  const newScore = Math.max(1.0, Math.min(5.0, currentScore + Number(delta)));
  const info = calculateSubLevelInfo(newScore);
  
  saveDbConfig({ 
    internal_level_score: newScore,
    level: info.macroLevel 
  });

  return getDatabaseStats();
}

export function closeDatabase() {
  if (database) {
    database.close();
    database = undefined;
  }
}