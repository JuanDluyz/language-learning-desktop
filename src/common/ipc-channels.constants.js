// src/common/ipc-channels.constants.js
export const IPC_CHANNELS = {
  AI_ASK: 'ai:ask',
  AI_UNLOAD_MODEL: 'ai:unload-model',
  AI_ADD_MODEL: 'ai:add-model',
  AI_PICK_MODEL_FILE: 'ai:pick-model-file',
  AI_CHANGE_MODEL: 'ai:change-model',
  AI_MODEL_PROGRESS: 'ai:model-progress',
  AI_CANCEL_MODEL_IMPORT: 'ai:cancel-model-import',
  AI_VALIDATE_KEY: 'ai:validate-key',
  
  DB_GET_GROUPS: 'db:get-groups',
  DB_CREATE_GROUP: 'db:create-group',
  DB_UPDATE_GROUP: 'db:update-group',
  DB_DELETE_GROUP: 'db:delete-group',
  DB_IMPORT_GROUP: 'db:import-group',
  ANKI_OPEN_PACKAGE: 'anki:open-package',
  ANKI_GET_DECK_FIELDS: 'anki:get-deck-fields',
  ANKI_GET_PHRASES: 'anki:get-phrases',
  ANKI_PREVIEW_DECK: 'anki:preview-deck',
  ANKI_IMPORT_DECK: 'anki:import-deck',
  ANKI_CLOSE_IMPORT: 'anki:close-import',
  
  DB_GET_PHRASE: 'db:get-phrase',
  DB_GET_PHRASES: 'db:get-phrases',
  DB_GET_DUE_PHRASES: 'db:get-due-phrases',
  DB_GET_VOCABULARY_PHRASES: 'db:get-vocabulary-phrases',
  DB_CREATE_PHRASE: 'db:create-phrase',
  DB_UPDATE_PHRASE: 'db:update-phrase',
  DB_UPDATE_PHRASE_SRS: 'db:update-phrase-srs',
  DB_DELETE_PHRASE: 'db:delete-phrase',
  DB_GET_STATIC_TEXTS: 'db:get-static-texts',
  DB_GET_STATS: 'db:get-stats',
  DB_UPDATE_LEVEL_SCORE: 'db:update-level-score',
  
  DB_GET_PROMPTS: 'db:get-prompts',
  DB_SAVE_PROMPT: 'db:save-prompt',
  DB_RESET_PROMPT: 'db:reset-prompt',

  DB_GET_TOPICS: 'db:get-topics',
  DB_CREATE_TOPIC: 'db:create-topic',
  DB_UPDATE_TOPIC: 'db:update-topic',
  DB_DELETE_TOPIC: 'db:delete-topic',

  APP_GET_CONFIG: 'app:get-config',
  APP_SAVE_CONFIG: 'app:save-config',
  APP_GET_STATUS: 'app:get-status',
  
  DYNAMIC_START: 'dynamic:start',
  DYNAMIC_GENERATE_ADAPTIVE: 'dynamic:generate-adaptive',
  DYNAMIC_SAVE: 'dynamic:save',
  DYNAMIC_SAVE_STATIC: 'dynamic:save-static',
  DYNAMIC_CLEANUP: 'dynamic:cleanup',
  
  AUDIO_SYNTHESIZE: 'audio:synthesize',
  
  CHAT_START: 'chat:start',
  CHAT_CHUNK: 'chat:chunk',
  CHAT_FINISHED: 'chat:finished',
  CHAT_ERROR: 'chat:error'
};
