const { contextBridge, ipcRenderer, webUtils } = require('electron');

const IPC_CHANNELS = Object.freeze({
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
});

// Función auxiliar reutilizable para limpiar código (DRY)
const createIpcListener = (channel) => (callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // IA y Streaming de Chat
  askLLM: (prompt, options) => ipcRenderer.invoke(IPC_CHANNELS.AI_ASK, typeof prompt === 'object' ? prompt : { prompt, options }),
  unloadModel: () => ipcRenderer.invoke(IPC_CHANNELS.AI_UNLOAD_MODEL),
  addModelFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.AI_ADD_MODEL, filePath),
  pickModelFile: () => ipcRenderer.invoke(IPC_CHANNELS.AI_PICK_MODEL_FILE),
  changeModel: (modelName) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHANGE_MODEL, modelName),
  cancelModelImport: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_MODEL_IMPORT),
  validateApiKey: (provider, apiKey, model) => ipcRenderer.invoke(IPC_CHANNELS.AI_VALIDATE_KEY, { provider, apiKey, model }),
  onModelProgress: createIpcListener(IPC_CHANNELS.AI_MODEL_PROGRESS),
  startChat: (requestId, messages) => ipcRenderer.send(IPC_CHANNELS.CHAT_START, { requestId, messages }),
  onChatChunk: createIpcListener(IPC_CHANNELS.CHAT_CHUNK),
  onChatFinished: createIpcListener(IPC_CHANNELS.CHAT_FINISHED),
  onChatError: createIpcListener(IPC_CHANNELS.CHAT_ERROR),

  // Audio y Base de Datos / Contenido
  synthesizeSpeech: (text, phraseId, audioPath, forceResynthesize, options) => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_SYNTHESIZE, { text, phraseId, audioPath, forceResynthesize, options }),
  getGroups: () => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_GROUPS),
  createGroup: (name, type, dynamicConfig, dailyLimit) => 
    ipcRenderer.invoke(IPC_CHANNELS.DB_CREATE_GROUP, typeof name === 'object' ? name : { name, type, dynamicConfig, dailyLimit }),
  updateGroup: (id, name, type, dynamicConfig, dailyLimit) => 
    ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_GROUP, typeof id === 'object' ? id : { id, name, type, dynamicConfig, dailyLimit }),
  deleteGroup: (id) => ipcRenderer.invoke(IPC_CHANNELS.DB_DELETE_GROUP, id),
  importGroup: (groupName, phrases, groupType, dynamicConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_IMPORT_GROUP, { groupName, phrases, groupType, dynamicConfig }),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openAnkiPackage: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.ANKI_OPEN_PACKAGE, filePath),
  getAnkiDeckFields: (sessionId, deckId) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANKI_GET_DECK_FIELDS, { sessionId, deckId }),
  getAnkiDeckPhrases: (sessionId, deckId, fieldName) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANKI_GET_PHRASES, { sessionId, deckId, fieldName }),
  previewAnkiDeck: (sessionId, deckId, fieldName) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANKI_PREVIEW_DECK, { sessionId, deckId, fieldName }),
  importAnkiDeck: (sessionId, deckId, fieldName, groupName, phrases, groupType = 'static', dynamicConfig = null) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANKI_IMPORT_DECK, { sessionId, deckId, fieldName, groupName, phrases, groupType, dynamicConfig }),
  closeAnkiImport: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.ANKI_CLOSE_IMPORT, sessionId),
  getPhrase: (groupId) => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_PHRASE, groupId),
  getPhrases: (groupId) => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_PHRASES, groupId),
  getDuePhrases: (groupId, limit) => 
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_DUE_PHRASES, typeof groupId === 'object' ? groupId : { groupId, limit }),
  getVocabularyPhrases: (options) => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_VOCABULARY_PHRASES, options),
  createPhrase: (groupId, text, cefrLevel, exerciseType, exerciseMetadata) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_CREATE_PHRASE, typeof groupId === 'object' ? groupId : { groupId, text, cefrLevel, exerciseType, exerciseMetadata }),
  updatePhrase: (id, text, cefrLevel, exerciseType, exerciseMetadata) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_PHRASE, typeof id === 'object' ? id : { id, text, cefrLevel, exerciseType, exerciseMetadata }),
  updatePhraseSrs: (id, grade) => ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_PHRASE_SRS, { id, grade }),
  deletePhrase: (id) => ipcRenderer.invoke(IPC_CHANNELS.DB_DELETE_PHRASE, id),
  getStaticTexts: () => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_STATIC_TEXTS),
  getDatabaseStats: () => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_STATS),
  updateLevelScore: (delta) => ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_LEVEL_SCORE, delta),

  // Prompts y Temas de Estudio (SQLite)
  getPrompts: () => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_PROMPTS),
  savePrompt: (key, customText) => ipcRenderer.invoke(IPC_CHANNELS.DB_SAVE_PROMPT, { key, customText }),
  resetPrompt: (key) => ipcRenderer.invoke(IPC_CHANNELS.DB_RESET_PROMPT, key),
  getTopics: () => ipcRenderer.invoke(IPC_CHANNELS.DB_GET_TOPICS),
  createTopic: (topicData) => ipcRenderer.invoke(IPC_CHANNELS.DB_CREATE_TOPIC, topicData),
  updateTopic: (topicData) => ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_TOPIC, topicData),
  deleteTopic: (id) => ipcRenderer.invoke(IPC_CHANNELS.DB_DELETE_TOPIC, id),

  // Estado y Configuración General (SQLite)
  getAppStatus: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_STATUS),
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_CONFIG),
  saveConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.APP_SAVE_CONFIG, config),

  // Sesiones Dinámicas de Práctica
  startDynamicSession: () => ipcRenderer.invoke(IPC_CHANNELS.DYNAMIC_START),
  generateAdaptiveSession: (sessionConfig, sessionId) => ipcRenderer.invoke(IPC_CHANNELS.DYNAMIC_GENERATE_ADAPTIVE, { sessionConfig, sessionId }),
  saveDynamicPhrase: (phrase) => ipcRenderer.invoke(IPC_CHANNELS.DYNAMIC_SAVE, phrase),
  saveDynamicAsStatic: (phrase) => ipcRenderer.invoke(IPC_CHANNELS.DYNAMIC_SAVE_STATIC, phrase),
  cleanupDynamicSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.DYNAMIC_CLEANUP, sessionId)
});