import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IPC_CHANNELS } from './common/ipc-channels.constants.js';
import { askLLM, configureModelDirectories, getAvailableModels, getAvailableModelsDetails, getHardwareRecommendation, getUserModelsDirectory, initializeOrWarmupModel, streamChat, unloadModel, validateGgufModel } from './common/local-llm.adapter.js';
import { validateApiKey, CLOUD_PROVIDERS } from './common/cloud-llm.adapter.js';
import { readAudio, synthesizeSpeech, pruneOrphanAudioFiles } from './service/practice-service/audio.service.js';
import { generateAdaptiveSessionFromDatabase } from './service/practice-service/adaptive-session.service.js';
import {
    cleanupAnkiImports,
    closeAnkiImport,
    getAnkiDeckFields,
    getAnkiDeckPhrases,
    openAnkiImport,
    previewAnkiDeck
} from './service/anki-import-service/anki-import.service.js';
import {
    cleanupAllDynamicSessions,
    cleanupDynamicSession,
    closeDatabase,
    getGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    importGroupWithPhrases,
    getPhraseByGroup,
    getPhrasesByGroup,
    getDuePhrasesByGroup,
    createPhrase,
    updatePhrase,
    updatePhraseSrs,
    deletePhrase,
    getStaticPhraseTexts,
    initializeDatabase,
    saveDynamicAsStatic,
    saveDynamicPhrase,
    startDynamicSession,
    updateAudioPath,
    getDbConfig,
    saveDbConfig,
    getDbPrompts,
    saveDbPrompt,
    resetDbPrompt,
    getDbTopics,
    createDbTopic,
    updateDbTopic,
    deleteDbTopic,
    getDatabaseStats,
    updateInternalLevelScore,
    getVocabularyPhrases,
    getAllActiveAudioPaths
} from './service/database-service/database.service.js';

import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const appRoot = path.join(projectRoot, 'dist');
let dataRoot = projectRoot;
let audioDirectory = path.join(projectRoot, 'public', 'audio');

/**
 * Formatea un número de bytes en una cadena legible (ej: "1.45 GB", "450 MB")
 */
function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

let activeCopyAbortController = null;

/**
 * Copia y activa un modelo .gguf de alto rendimiento (buffers de 8MB),
 * emitiendo el progreso con tamaño de archivo exacto y eliminando archivos si ocurre un error o se cancela.
 */
async function copyAndActivateModel(sourceFilePath, senderWindow = null) {
    if (!sourceFilePath || typeof sourceFilePath !== 'string') {
        throw new Error('Ruta de archivo no válida.');
    }
    if (!sourceFilePath.toLowerCase().endsWith('.gguf')) {
        throw new Error('El archivo seleccionado debe ser en formato .gguf');
    }
    if (!fs.existsSync(sourceFilePath)) {
        throw new Error('El archivo especificado no existe en el sistema.');
    }

    // 0. Validación previa de compatibilidad (lectura instantánea de cabecera GGUF)
    await validateGgufModel(sourceFilePath);

    const modelsDir = getUserModelsDirectory();
    fs.mkdirSync(modelsDir, { recursive: true });

    const fileName = path.basename(sourceFilePath);
    const destPath = path.join(modelsDir, fileName);

    activeCopyAbortController = new AbortController();
    const { signal } = activeCopyAbortController;

    const sendProgress = (percent, copiedBytes = 0, totalBytes = 0, stage = 'copying') => {
        const targetWindow = senderWindow || (BrowserWindow.getAllWindows().length > 0 ? BrowserWindow.getAllWindows()[0] : null);
        if (targetWindow && !targetWindow.isDestroyed()) {
            try {
                targetWindow.webContents.send(IPC_CHANNELS.AI_MODEL_PROGRESS, {
                    percent,
                    fileName,
                    copiedBytes,
                    totalBytes,
                    stage,
                    copiedFormatted: formatBytes(copiedBytes),
                    totalFormatted: formatBytes(totalBytes)
                });
            } catch (err) {
                console.error('Error enviando progreso IPC:', err);
            }
        }
    };

    // 1. Descargar modelo anterior de memoria
    sendProgress(2, 0, 0, 'copying');
    unloadModel();

    // 2. Copia optimizada de alto rendimiento con buffer de 8MB
    if (path.resolve(sourceFilePath) !== path.resolve(destPath)) {
        const stat = fs.statSync(sourceFilePath);
        const totalSize = stat.size;
        let copiedSize = 0;
        let lastReportedPercent = 2;

        sendProgress(2, 0, totalSize, 'copying');

        const CHUNK_BUFFER = 8 * 1024 * 1024; // 8MB para máxima velocidad
        const readStream = fs.createReadStream(sourceFilePath, { highWaterMark: CHUNK_BUFFER });
        const writeStream = fs.createWriteStream(destPath, { highWaterMark: CHUNK_BUFFER });

        const progressTransform = new Transform({
            transform(chunk, _encoding, callback) {
                copiedSize += chunk.length;
                const percent = Math.min(95, Math.round(2 + (copiedSize / totalSize) * 93));
                if (percent - lastReportedPercent >= 1 || percent >= 95) {
                    lastReportedPercent = percent;
                    sendProgress(percent, copiedSize, totalSize, 'copying');
                }
                callback(null, chunk);
            }
        });

        try {
            await pipeline(readStream, progressTransform, writeStream, { signal });
        } catch (copyError) {
            if (fs.existsSync(destPath) && path.resolve(sourceFilePath) !== path.resolve(destPath)) {
                try { fs.rmSync(destPath, { force: true }); } catch {}
            }
            activeCopyAbortController = null;
            if (copyError.name === 'AbortError' || signal.aborted) {
                return { canceled: true, message: 'Copia del archivo cancelada por el usuario.' };
            }
            throw new Error(`Error al copiar archivo de modelo: ${copyError.message}`);
        }
    }

    if (signal.aborted) {
        if (fs.existsSync(destPath) && path.resolve(sourceFilePath) !== path.resolve(destPath)) {
            try { fs.rmSync(destPath, { force: true }); } catch {}
        }
        activeCopyAbortController = null;
        return { canceled: true, message: 'Operación cancelada por el usuario.' };
    }

    // 3. Guardar configuración y precargar modelo en RAM/VRAM
    const finalStat = fs.existsSync(destPath) ? fs.statSync(destPath) : null;
    const finalSize = finalStat ? finalStat.size : 0;
    sendProgress(96, finalSize, finalSize, 'warmup');
    saveDbConfig({ selected_model: fileName, llm_execution_mode: 'local' });

    try {
        await initializeOrWarmupModel();
    } catch (loadErr) {
        if (fs.existsSync(destPath) && path.resolve(sourceFilePath) !== path.resolve(destPath)) {
            try { fs.rmSync(destPath, { force: true }); } catch {}
        }
        activeCopyAbortController = null;
        throw new Error(`El modelo se copió pero no se pudo cargar en memoria RAM/VRAM: ${loadErr.message}`);
    }

    activeCopyAbortController = null;
    sendProgress(100, finalSize, finalSize, 'ready');

    const availableModels = getAvailableModels();
    return {
        success: true,
        fileName,
        selectedModel: fileName,
        availableModels,
        engineStatus: 'Modelo disponible',
        modelAvailable: true
    };
}

// Diccionario de IPC Handlers (Backend ultralimpio con protección anti-crash)
const invokeHandlers = {
    [IPC_CHANNELS.AI_ASK]: (_event, payload) => {
        if (typeof payload === 'object' && payload !== null && payload.prompt) {
            return askLLM(payload.prompt, payload.options || {});
        }
        return askLLM(payload);
    },
    [IPC_CHANNELS.AI_UNLOAD_MODEL]: () => unloadModel(),
    [IPC_CHANNELS.AI_CANCEL_MODEL_IMPORT]: async () => {
        try {
            if (activeCopyAbortController) {
                activeCopyAbortController.abort();
                activeCopyAbortController = null;
            }
            unloadModel();
            return { success: true, canceled: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },
    [IPC_CHANNELS.AI_ADD_MODEL]: async (event, filePath) => {
        try {
            const window = event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
            return await copyAndActivateModel(filePath, window);
        } catch (err) {
            console.error('Error en AI_ADD_MODEL:', err);
            return { success: false, error: err.message };
        }
    },
    [IPC_CHANNELS.AI_PICK_MODEL_FILE]: async (event) => {
        try {
            const window = event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
            const result = await dialog.showOpenDialog(window, {
                title: 'Seleccionar Modelo LLM (.gguf)',
                filters: [{ name: 'Archivos GGUF', extensions: ['gguf'] }],
                properties: ['openFile']
            });

            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                return { canceled: true };
            }

            return await copyAndActivateModel(result.filePaths[0], window);
        } catch (err) {
            console.error('Error en AI_PICK_MODEL_FILE:', err);
            return { success: false, error: err.message };
        }
    },
    [IPC_CHANNELS.AI_CHANGE_MODEL]: async (_event, modelName) => {
        try {
            saveDbConfig({ selected_model: modelName || '', llm_execution_mode: 'local' });
            if (modelName) {
                await initializeOrWarmupModel();
            } else {
                unloadModel();
            }
            const availableModels = getAvailableModels();
            return {
                success: true,
                selectedModel: modelName,
                availableModels,
                engineStatus: modelName ? 'Modelo disponible' : 'Modelo no cargado',
                modelAvailable: Boolean(modelName && availableModels.includes(modelName))
            };
        } catch (err) {
            console.error('Error en AI_CHANGE_MODEL:', err);
            unloadModel();
            saveDbConfig({ selected_model: '' });
            return { success: false, error: err.message };
        }
    },
    [IPC_CHANNELS.DB_GET_GROUPS]: () => getGroups(),
    [IPC_CHANNELS.DB_CREATE_GROUP]: (_event, payload) => {
        const { name, type, dynamicConfig, dailyLimit } = typeof payload === 'object' ? payload : { name: payload };
        return createGroup(name, type, dynamicConfig, dailyLimit);
    },
    [IPC_CHANNELS.DB_UPDATE_GROUP]: (_event, payload) => {
        const { id, name, type, dynamicConfig, dailyLimit } = typeof payload === 'object' ? payload : { id: payload.id, name: payload.name };
        return updateGroup(id, name, type, dynamicConfig, dailyLimit);
    },
    [IPC_CHANNELS.DB_DELETE_GROUP]: (_event, id) => deleteGroup(id, audioDirectory),
    [IPC_CHANNELS.DB_IMPORT_GROUP]: (_event, { groupName, phrases, groupType, dynamicConfig }) =>
        importGroupWithPhrases(groupName, phrases, groupType, dynamicConfig),
    [IPC_CHANNELS.ANKI_OPEN_PACKAGE]: async (event, filePath) => {
        let selectedPath = filePath;
        if (!selectedPath) {
            const window = event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
            const result = await dialog.showOpenDialog(window, {
                title: 'Seleccionar paquete de Anki',
                filters: [{ name: 'Paquetes de Anki', extensions: ['apkg', 'colpkg'] }],
                properties: ['openFile']
            });
            if (result.canceled || result.filePaths.length === 0) return { canceled: true };
            [selectedPath] = result.filePaths;
        }
        return openAnkiImport(selectedPath);
    },
    [IPC_CHANNELS.ANKI_GET_DECK_FIELDS]: (_event, { sessionId, deckId }) =>
        getAnkiDeckFields(sessionId, deckId),
    [IPC_CHANNELS.ANKI_GET_PHRASES]: (_event, { sessionId, deckId, fieldName }) =>
        getAnkiDeckPhrases(sessionId, deckId, fieldName),
    [IPC_CHANNELS.ANKI_PREVIEW_DECK]: (_event, { sessionId, deckId, fieldName }) =>
        previewAnkiDeck(sessionId, deckId, fieldName),
    [IPC_CHANNELS.ANKI_IMPORT_DECK]: async (_event, { sessionId, deckId, fieldName, groupName, phrases: editedPhrases, groupType = 'static', dynamicConfig = null }) => {
        const phrases = editedPhrases == null
            ? getAnkiDeckPhrases(sessionId, deckId, fieldName)
            : editedPhrases;
        if (!Array.isArray(phrases) || phrases.length === 0) {
            throw new Error('No quedan frases para importar.');
        }
        const result = importGroupWithPhrases(groupName, phrases, groupType || 'static', dynamicConfig);
        await closeAnkiImport(sessionId);
        return { ...result, phraseCount: phrases.length };
    },
    [IPC_CHANNELS.ANKI_CLOSE_IMPORT]: (_event, sessionId) => closeAnkiImport(sessionId),
    [IPC_CHANNELS.DB_GET_PHRASE]: (_event, groupId) => getPhraseByGroup(groupId),
    [IPC_CHANNELS.DB_GET_PHRASES]: (_event, groupId) => getPhrasesByGroup(groupId),
    [IPC_CHANNELS.DB_GET_DUE_PHRASES]: (_event, payload) => {
        const { groupId, limit } = typeof payload === 'object' && payload !== null ? payload : { groupId: payload };
        return getDuePhrasesByGroup(groupId, limit);
    },
    [IPC_CHANNELS.DB_GET_VOCABULARY_PHRASES]: (_event, options) => getVocabularyPhrases(options),
    [IPC_CHANNELS.DB_CREATE_PHRASE]: (_event, { groupId, text, cefrLevel, exerciseType, exerciseMetadata }) =>
        createPhrase(groupId, text, cefrLevel, exerciseType, exerciseMetadata),
    [IPC_CHANNELS.DB_UPDATE_PHRASE]: (_event, { id, text, cefrLevel, exerciseType, exerciseMetadata }) =>
        updatePhrase(id, text, cefrLevel, exerciseType, exerciseMetadata),
    [IPC_CHANNELS.DB_UPDATE_PHRASE_SRS]: (_event, { id, grade }) => updatePhraseSrs(id, grade),
    [IPC_CHANNELS.DB_DELETE_PHRASE]: (_event, id) => deletePhrase(id, audioDirectory),
    [IPC_CHANNELS.DB_GET_STATIC_TEXTS]: () => getStaticPhraseTexts(),
    [IPC_CHANNELS.DB_GET_STATS]: () => getDatabaseStats(),
    [IPC_CHANNELS.DB_UPDATE_LEVEL_SCORE]: (_event, delta) => updateInternalLevelScore(delta),
    [IPC_CHANNELS.DB_GET_PROMPTS]: () => getDbPrompts(),
    [IPC_CHANNELS.DB_SAVE_PROMPT]: (_event, { key, customText }) => saveDbPrompt({ key, customText }),
    [IPC_CHANNELS.DB_RESET_PROMPT]: (_event, key) => resetDbPrompt(key),
    [IPC_CHANNELS.DB_GET_TOPICS]: () => getDbTopics(),
    [IPC_CHANNELS.DB_CREATE_TOPIC]: (_event, topicData) => createDbTopic(topicData),
    [IPC_CHANNELS.DB_UPDATE_TOPIC]: (_event, topicData) => updateDbTopic(topicData),
    [IPC_CHANNELS.DB_DELETE_TOPIC]: (_event, idOrCode) => deleteDbTopic(idOrCode),
    [IPC_CHANNELS.AI_VALIDATE_KEY]: async (_event, { provider, apiKey, model }) => {
        return await validateApiKey({ provider, apiKey, model });
    },
    [IPC_CHANNELS.APP_GET_CONFIG]: () => getDbConfig(),
    [IPC_CHANNELS.APP_SAVE_CONFIG]: (_event, config) => {
        const currentConfig = getDbConfig();
        if (config && (
            (config.selected_model && config.selected_model !== currentConfig.selected_model) ||
            (typeof config.use_gpu === 'boolean' && config.use_gpu !== currentConfig.use_gpu)
        )) {
            unloadModel(true);
        }
        return saveDbConfig(config);
    },
    [IPC_CHANNELS.APP_GET_STATUS]: async () => {
        let config = getDbConfig();
        const executionMode = config.llm_execution_mode || 'local';

        if (executionMode === 'cloud') {
            const providerInfo = CLOUD_PROVIDERS[config.cloud_provider] || CLOUD_PROVIDERS.openai;
            const modelName = config.cloud_model || providerInfo.defaultModel;
            const hasKey = Boolean(config.cloud_api_key && config.cloud_api_key.trim());

            return {
                executionMode: 'cloud',
                cloudProvider: config.cloud_provider || 'openai',
                cloudModel: modelName,
                selectedModel: `${providerInfo.name} (${modelName})`,
                availableModels: [],
                modelsDetails: [],
                engineStatus: hasKey ? `Cloud: ${providerInfo.name}` : 'API Key no configurada',
                modelAvailable: hasKey,
                recommendation: await getHardwareRecommendation()
            };
        }

        const modelsDetails = await getAvailableModelsDetails();
        const availableModels = modelsDetails.map((m) => m.fileName);
        const compatibleModels = modelsDetails.filter((m) => m.compatible).map((m) => m.fileName);

        if ((!config.selected_model || !compatibleModels.includes(config.selected_model)) && compatibleModels.length > 0) {
            config.selected_model = compatibleModels[0];
            try {
                saveDbConfig({ selected_model: compatibleModels[0] });
            } catch (err) {
                console.warn('[IPC Status] No se pudo auto-guardar modelo en DB:', err.message);
            }
        }

        const recommendation = await getHardwareRecommendation();
        const hasModel = Boolean(config.selected_model && compatibleModels.includes(config.selected_model));
        return {
            executionMode: 'local',
            selectedModel: config.selected_model || '',
            availableModels,
            modelsDetails,
            engineStatus: hasModel ? 'Modelo local disponible' : 'Modelo no cargado',
            modelAvailable: hasModel,
            recommendation
        };
    },
    [IPC_CHANNELS.DYNAMIC_START]: () => startDynamicSession(),
    [IPC_CHANNELS.DYNAMIC_GENERATE_ADAPTIVE]: (_event, { sessionConfig, sessionId }) => generateAdaptiveSessionFromDatabase(sessionConfig, sessionId),
    [IPC_CHANNELS.DYNAMIC_SAVE]: (_event, phrase) => saveDynamicPhrase(phrase),
    [IPC_CHANNELS.DYNAMIC_SAVE_STATIC]: (_event, phrase) => saveDynamicAsStatic(phrase),
    [IPC_CHANNELS.DYNAMIC_CLEANUP]: (_event, sessionId) => cleanupDynamicSession(sessionId, projectRoot),
    [IPC_CHANNELS.AUDIO_SYNTHESIZE]: async (_event, { text, phraseId, audioPath, forceResynthesize, options }) => {
        const config = getDbConfig();
        if (audioPath && !forceResynthesize) {
            const existingPath = path.isAbsolute(audioPath)
                ? audioPath
                : path.resolve(dataRoot, audioPath.replace(/\\/g, path.sep));
            if (fs.existsSync(existingPath)) {
                return { filename: path.basename(existingPath), audioUrl: await readAudio(existingPath) };
            }
        }
        const audio = await synthesizeSpeech(text, audioDirectory, {
            engine: options?.engine || config.tts_engine || 'edge-tts',
            voice: options?.voice || config.tts_voice || 'en-US-AvaNeural',
            accent: options?.accent || config.audio_accent || 'en-us',
            speed: options?.speed || config.audio_speed || 'normal'
        });
        if (phraseId) updateAudioPath(phraseId, path.join('public', 'audio', audio.filename));
        return audio;
    }
};

// Registro automático de handlers
for (const [channel, handler] of Object.entries(invokeHandlers)) {
    ipcMain.handle(channel, handler);
}

// Handler de chat (streaming)
ipcMain.on(IPC_CHANNELS.CHAT_START, async (event, { requestId, messages }) => {
    try {
        await streamChat(messages, (chunk) => {
            event.sender.send(IPC_CHANNELS.CHAT_CHUNK, { requestId, chunk });
        });
        event.sender.send(IPC_CHANNELS.CHAT_FINISHED, { requestId });
    } catch (error) {
        event.sender.send(IPC_CHANNELS.CHAT_ERROR, { requestId, error: error.message });
    }
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Restriccion de navegacion no autorizada
    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol !== 'file:' && !navigationUrl.startsWith('http://localhost:') && !navigationUrl.startsWith('http://127.0.0.1:')) {
            event.preventDefault();
            shell.openExternal(navigationUrl);
        }
    });

    // Control de apertura de ventanas externas
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Abre la aplicacion maximizada por defecto
    mainWindow.maximize();
    mainWindow.loadFile(path.join(appRoot, 'index.html'));
}

app.whenReady().then(() => {
    const e2eDataRoot = process.env.LANGUAGE_APP_E2E_DATA_DIR;
    dataRoot = app.isPackaged
        ? app.getPath('userData')
        : e2eDataRoot
            ? path.resolve(e2eDataRoot)
            : projectRoot;
    audioDirectory = path.join(dataRoot, 'public', 'audio');
    configureModelDirectories({
        bundledModelsDirectory: app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(projectRoot, 'models'),
        userModelsDirectory: app.isPackaged ? path.join(dataRoot, 'models') : path.join(projectRoot, 'models')
    });
    const databaseDirectory = e2eDataRoot
        ? path.join(dataRoot, 'database')
        : app.isPackaged
            ? dataRoot
            : path.join(projectRoot, 'database');
    initializeDatabase(databaseDirectory);
    createWindow();
    if (process.env.LANGUAGE_APP_E2E_SKIP_MODEL_WARMUP !== '1') {
        initializeOrWarmupModel()
            .then((modelName) => console.info(`[LLM Service] Modelo precargado: ${modelName}`))
            .catch((error) => console.error('[LLM Service] No se pudo precargar el modelo:', error.message));
    }

    // Poda de archivos de audio huerfanos al iniciar (archivos de mas de 1 hora de antiguedad)
    pruneOrphanAudioFiles(audioDirectory, getAllActiveAudioPaths(), 60 * 60 * 1000)
        .then((res) => {
            if (res.deletedCount > 0) console.info(`[Audio Service] Purgados ${res.deletedCount} audios huerfanos.`);
        })
        .catch((err) => console.warn('[Audio Service] Poda inicial omitida:', err.message));
});

app.on('window-all-closed', () => {
    cleanupAllDynamicSessions(dataRoot);
    pruneOrphanAudioFiles(audioDirectory, getAllActiveAudioPaths(), 0)
        .catch((err) => console.warn('[Audio Service] Poda al cerrar omitida:', err.message));
    cleanupAnkiImports()
        .catch((error) => console.error('No se pudieron limpiar las importaciones de Anki:', error))
        .finally(() => closeDatabase());
    if (process.platform !== 'darwin') {
        app.quit();
    }
});