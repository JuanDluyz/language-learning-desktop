import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { getLlama, getLlamaGpuTypes, LlamaChatSession, readGgufFileInfo, GemmaChatWrapper, Gemma4ChatWrapper } from 'node-llama-cpp';
import { DEFAULT_PROMPTS, getEffectivePrompt } from './prompt-templates.constants.js';
import { sanitizeChatMessages } from './helper.utilities.js';
import { getDbConfig, getDbPrompts, saveDbConfig } from '../service/database-service/database.service.js';
import { askCloudLLM, streamCloudChat } from './cloud-llm.adapter.js';

const SUPPORTED_ARCHITECTURES = [
  'llama', 'gemma', 'gemma2', 'gemma3', 'gemma4', 'qwen2', 'qwen2.5', 'mistral', 'phi', 'phi3', 'starcoder', 'command-r'
];

export async function validateGgufModel(sourceFilePath) {
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error('El archivo especificado no existe.');
  }

  let info;
  try {
    info = await readGgufFileInfo(sourceFilePath);
  } catch (err) {
    throw new Error(`El archivo no es un GGUF válido o está corrupto: ${err.message}`);
  }

  const arch = (info?.metadata?.general?.architecture || '').toLowerCase();
  const filename = path.basename(sourceFilePath).toLowerCase();

  // 1. Verificar si la arquitectura está soportada por el motor local
  if (arch && !SUPPORTED_ARCHITECTURES.includes(arch)) {
    throw new Error(`Modelo no compatible: La arquitectura '${arch}' no es soportada por la versión actual del motor local. Por favor utiliza un modelo con arquitectura llama, gemma, gemma3 o qwen2.`);
  }

  // 2. Verificar si es un modelo Vision-Language / Multimodal (VL)
  if (filename.includes('-vl-') || filename.includes('vision') || filename.includes('multimodal')) {
    throw new Error(`Modelo no compatible: '${path.basename(sourceFilePath)}' es un modelo Vision-Language (-VL-). La app requiere un modelo de texto puro (Instruct/Chat) para la generación y tutoría.`);
  }

  // 3. Advertencia / bloqueo de modelos Thinking / Razonamiento
  if (filename.includes('thinking') || filename.includes('-qwq-') || filename.includes('-r1-')) {
    throw new Error(`Modelo no compatible: Los modelos de razonamiento (Thinking / R1) no son compatibles con las respuestas cortas de la app. Utiliza un modelo con ajuste -Instruct o -Chat.`);
  }

  return {
    valid: true,
    architecture: arch || 'desconocida',
    name: info?.metadata?.general?.name || path.basename(sourceFilePath)
  };
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let modelsDirectories = [path.join(projectRoot, 'models')];
let userModelsDirectory = modelsDirectories[0];

let loadedLlama = null;
let loadedModel = null;
let loadedModelPath = undefined;
let forceCpuMode = false;
let activeSessionIsGpu = false;

export function getAvailableModels() {
  const modelNames = new Set();
  for (const directory of modelsDirectories) {
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
        modelNames.add(entry.name);
      }
    }
  }
  return [...modelNames].sort();
}

export function configureModelDirectories({ bundledModelsDirectory, userModelsDirectory: writableModelsDirectory }) {
  userModelsDirectory = writableModelsDirectory;
  modelsDirectories = [...new Set([writableModelsDirectory, bundledModelsDirectory].filter(Boolean))];
}

export function getUserModelsDirectory() {
  return userModelsDirectory;
}

function getModelPath(fileName) {
  for (const directory of modelsDirectories) {
    const modelPath = path.join(directory, fileName);
    if (fs.existsSync(modelPath)) return modelPath;
  }
  return null;
}

export async function getAvailableModelsDetails() {
  const files = getAvailableModels();
  const detailedList = [];

  for (const fileName of files) {
    const filePath = getModelPath(fileName);
    try {
      const validation = await validateGgufModel(filePath);
      detailedList.push({
        fileName,
        compatible: true,
        architecture: validation.architecture,
        reason: null
      });
    } catch (err) {
      detailedList.push({
        fileName,
        compatible: false,
        architecture: 'incompatible',
        reason: err.message
      });
    }
  }

  return detailedList;
}

function getConfiguredModel() {
  const config = getDbConfig();
  return typeof config.selected_model === 'string' && config.selected_model
    ? config.selected_model
    : null;
}

async function resolveModelPaths() {
  const modelsDetails = await getAvailableModelsDetails();
  const compatibleModels = modelsDetails.filter((m) => m.compatible).map((m) => m.fileName);

  if (compatibleModels.length === 0) {
    const firstIncompatible = modelsDetails.find((m) => !m.compatible);
    if (firstIncompatible) {
      throw new Error(`Los modelos presentes en la carpeta 'models/' no son compatibles. Detalle: ${firstIncompatible.reason}`);
    }
    throw new Error(`No se encontraron modelos .gguf en: ${modelsDirectories.join(', ')}`);
  }

  let configuredModel = getConfiguredModel();
  if (!configuredModel || !compatibleModels.includes(configuredModel)) {
    configuredModel = compatibleModels[0];
    try {
      saveDbConfig({ selected_model: configuredModel });
    } catch (e) {
      console.warn('[LLM Service] No se pudo guardar modelo configurado en DB:', e.message);
    }
  }

  return [getModelPath(configuredModel)];
}

/**
 * Calcula automáticamente el número óptimo de hilos de CPU:
 * balanceando el número de núcleos sin saturar el bus de memoria.
 */
function calculateCpuThreads() {
  const count = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus()?.length || 4;
  // Para 8 núcleos o más, reservar 2 hilos para el sistema y asignar el resto al cálculo matricial
  return Math.min(8, Math.max(1, count >= 6 ? count - 2 : count));
}

/**
 * Calcula automáticamente la recomendación de configuración idónea para este equipo y modelo
 */
export async function getHardwareRecommendation() {
  const cores = os.cpus()?.length || 4;
  const totalRamGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
  const threads = calculateCpuThreads();

  let gpuType = 'none';
  let useGpuRecommended = false;
  let gpuReason = `Inferencia por CPU adaptada a ${threads} hilos disponibles.`;

  try {
    const gpuTypes = await getLlamaGpuTypes();
    if (gpuTypes.includes('cuda')) {
      gpuType = 'cuda';
      useGpuRecommended = true;
      gpuReason = 'Tarjeta NVIDIA CUDA detectada. Aceleración GPU de máximo rendimiento activable.';
    } else if (gpuTypes.includes('metal')) {
      gpuType = 'metal';
      useGpuRecommended = true;
      gpuReason = 'Arquitectura Apple Metal detectada. Aceleración GPU recomendada.';
    } else if (gpuTypes.includes('vulkan')) {
      gpuType = 'vulkan';
      useGpuRecommended = true;
      gpuReason = 'Backend Vulkan disponible. La aceleración puede probarse con fallback automático a CPU.';
    }
  } catch {
    // Ignorar si falla la detección
  }

  const recommendedContextSize = totalRamGb >= 16 ? 4096 : 2048;

  return {
    cpuCores: cores,
    totalRamGb,
    recommendedThreads: threads,
    gpuType,
    useGpuRecommended,
    gpuReason,
    recommendedContextSize
  };
}

async function getOrLoadModel() {
  if (loadedModel && loadedLlama) {
    return { llama: loadedLlama, model: loadedModel };
  }

  const config = getDbConfig();
  let allowGpu = !forceCpuMode && config.use_gpu === true;

  if (allowGpu) {
    try {
      const gpuTypes = await getLlamaGpuTypes();
      // CUDA y Metal son estables en GPU. Vulkan en GPUs integradas (Intel Iris Xe) causa parpadeos negros por reset del driver.
      if (!gpuTypes.includes('cuda') && !gpuTypes.includes('metal') && !gpuTypes.includes('vulkan')) {
        console.info('[LLM Service] No hay un backend GPU compatible; usando CPU.');
        allowGpu = false;
      } else if (gpuTypes.includes('vulkan') && !gpuTypes.includes('cuda') && !gpuTypes.includes('metal')) {
        console.info('[LLM Service] Usando backend Vulkan; se conservará fallback a CPU si falla.');
      }
    } catch {
      allowGpu = false;
    }
  }

  const modelPaths = await resolveModelPaths();
  const loadErrors = [];

  const attempts = allowGpu
    ? [{ useGpu: true, gpuLayers: 'max' }, { useGpu: false, gpuLayers: 0 }]
    : [{ useGpu: false, gpuLayers: 0 }];

  for (const attempt of attempts) {
    try {
      const llama = await getLlama({
        gpu: attempt.useGpu ? 'auto' : false
      });

      for (const modelPath of modelPaths) {
        try {
          const model = await llama.loadModel({
            modelPath,
            gpuLayers: attempt.gpuLayers
          });
          loadedLlama = llama;
          loadedModel = model;
          loadedModelPath = modelPath;
          activeSessionIsGpu = attempt.useGpu;
          return { llama: loadedLlama, model: loadedModel };
        } catch (error) {
          loadErrors.push(`${path.basename(modelPath)} (${attempt.useGpu ? 'GPU' : 'CPU'}): ${error.message}`);
          if (attempt.useGpu) {
            console.warn(`[LLM Service] Fallo al cargar modelo en GPU (${error.message}). Activando fallback a CPU...`);
            forceCpuMode = true;
          }
        }
      }
    } catch (llamaError) {
      loadErrors.push(`Error de inicialización (${attempt.useGpu ? 'GPU' : 'CPU'}): ${llamaError.message}`);
      if (attempt.useGpu) {
        console.warn(`[LLM Service] Fallo de inicialización GPU (${llamaError.message}). Activando fallback a CPU...`);
        forceCpuMode = true;
      }
    }
  }

  loadedModel = null;
  loadedLlama = null;
  loadedModelPath = undefined;
  activeSessionIsGpu = false;
  throw new Error(`No se pudo cargar el modelo en memoria RAM/VRAM. Detalles: ${loadErrors.join(' | ')}`);
}

function sanitizeOutput(rawText) {
  if (!rawText) return '';

  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  cleaned = cleaned.replace(/<channel:thought>[\s\S]*?<\/channel:thought>/gi, '');

  if (!cleaned.trim() && (/<think>/i.test(rawText) || /<thought>/i.test(rawText))) {
    cleaned = rawText.replace(/<\/?(?:think|thought|channel:thought)>/gi, '').trim();
  }

  cleaned = cleaned.replace(/^(?:\d+[\.\)]|\-|\*)\s*/, '');
  cleaned = cleaned.replace(/^(?:phrase|sentence|english|response):\s*/i, '');
  cleaned = cleaned.replace(/^['"`]|['"`]$/g, '');

  return cleaned.trim() || rawText.trim();
}

let generationQueue = Promise.resolve();

function runExclusive(task) {
  const res = generationQueue.then(() => task());
  generationQueue = res.catch(() => {});
  return res;
}

/**
 * Descarga explícita del modelo (Explicit Unload) y purga de memoria RAM/VRAM
 */
export function unloadModel(resetCpuFallback = true) {
  if (loadedModel) {
    try {
      loadedModel.dispose();
    } catch (e) {
      console.warn('[LLM Service] Error al liberar modelo:', e.message);
    }
  }
  loadedModel = null;
  loadedLlama = null;
  loadedModelPath = undefined;
  activeSessionIsGpu = false;
  if (resetCpuFallback) {
    forceCpuMode = false;
  }
  if (global.gc) {
    try { global.gc(); } catch {}
  }
}

/**
 * Ejecuta una acción de prompt con fallback automático a CPU en caso de fallos de Vulkan / GPU
 */
async function executePromptWithFallback(promptTask) {
  try {
    const { model } = await getOrLoadModel();
    return await promptTask(model);
  } catch (error) {
    const errMsg = error?.message || String(error);
    const isGpuIssue = activeSessionIsGpu || /vulkan|device lost|getFenceStatus|gpu|vram|out of memory/i.test(errMsg);

    if (isGpuIssue && !forceCpuMode) {
      console.warn(`[LLM Service] Detectado error de GPU/Vulkan durante inferencia: "${errMsg}". Reintentando automáticamente en modo CPU...`);
      forceCpuMode = true;
      unloadModel(false);
      const { model: cpuModel } = await getOrLoadModel();
      return await promptTask(cpuModel);
    } else {
      unloadModel(false);
      throw error;
    }
  }
}

/**
 * Inicializa y precarga en memoria RAM/VRAM el modelo activo de forma explícita.
 */
export async function initializeOrWarmupModel() {
  return runExclusive(async () => {
    unloadModel(true);
    await getOrLoadModel();
    return loadedModelPath ? path.basename(loadedModelPath) : null;
  });
}

export async function askLLM(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Escribe un mensaje antes de enviarlo.');
  }

  const config = getDbConfig();
  if (config.llm_execution_mode === 'cloud') {
    return askCloudLLM(prompt, options, config);
  }

  return runExclusive(async () => {
    try {
      return await executePromptWithFallback(async (model) => {
        const threads = calculateCpuThreads();
        const systemPrompt = options.systemPrompt || undefined;
        const contextSize = options.contextSize || 2048;

        const context = await model.createContext({
          contextSize,
          batchSize: 512,
          threads: { ideal: threads, min: Math.min(2, threads) },
          flashAttention: 'auto'
        });

        try {
          const session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt,
            autoDisposeSequence: true
          });

          const defaultStopTriggers = ['</s>', '<eos>', '<end_of_turn>', '<|end_of_text|>', '<|im_end|>'];
          const userStopTriggers = options.customStopTriggers || [];
          const customStopTriggers = Array.from(new Set([...defaultStopTriggers, ...userStopTriggers]));

          const promptOptions = {
            temperature: options.temperature ?? 0.7,
            maxTokens: options.maxTokens ?? 300,
            customStopTriggers,
            ...options
          };
          delete promptOptions.systemPrompt;
          delete promptOptions.contextSize;

          const rawResponse = await session.prompt(prompt.trim(), promptOptions);
          return sanitizeOutput(rawResponse);
        } finally {
          try { await context.dispose(); } catch {}
        }
      });
    } catch (error) {
      throw new Error(`Error en el motor local: ${error.message}`);
    }
  });
}

export class NodeLLMService {
  constructor() {
    this.modelsDir = userModelsDirectory;
  }

  isAvailable() {
    return loadedModel !== null;
  }

  getLoadedModelName() {
    return loadedModelPath ? path.basename(loadedModelPath) : null;
  }

  async generateStructuredResponse(prompt, options = {}) {
    return askLLM(prompt, options);
  }

  unloadModel(resetCpuFallback = false) {
    unloadModel(resetCpuFallback);
  }

  async generatePhrase(level = 'B1', topic = 'General') {
    const dbPrompts = getDbPrompts();
    const lvlKey = level.toUpperCase();
    const grammarRules = getEffectivePrompt(`grammar_${lvlKey}`, dbPrompts) || DEFAULT_PROMPTS.grammar_B1;
    const systemPrompt = getEffectivePrompt('gen_auditory_system', dbPrompts) || DEFAULT_PROMPTS.gen_auditory_system;

    const userPrompt = `Generate a single, natural English sentence about the topic '${topic}' targeting CEFR level ${lvlKey}.\n\n` +
      `MANDATORY CONSTRAINTS:\n${grammarRules}\n\nOutput ONLY the final sentence.`;

    return askLLM(userPrompt, { systemPrompt, temperature: 0.85, maxTokens: 120 });
  }

  async generatePhrasesBatch(level = 'B1', topic = 'General', count = 5) {
    const dbPrompts = getDbPrompts();
    const lvlKey = level.toUpperCase().trim();
    const grammarRules = getEffectivePrompt(`grammar_${lvlKey}`, dbPrompts) || DEFAULT_PROMPTS.grammar_B1;
    const systemPrompt = getEffectivePrompt('gen_batch_system', dbPrompts) || DEFAULT_PROMPTS.gen_batch_system;

    const userPrompt = `Generate exactly ${count} distinct, natural English sentences about '${topic}' for CEFR level ${lvlKey}.\n\n` +
      `CONSTRAINTS:\n${grammarRules}\n\n` +
      `Format strictly as a numbered list from 1 to ${count}, one short sentence per line:\n` +
      `1. Sentence 1\n2. Sentence 2\n...\nOutput ONLY the numbered list without any intro or commentary.`;

    const tokenBudget = Math.min(512, Math.max(100, count * 40));
    const rawResponse = await askLLM(userPrompt, { systemPrompt, temperature: 0.6, maxTokens: tokenBudget });

    const lines = (rawResponse || '').split(/\r?\n/);
    const phrases = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (/^(?:here (?:are|is)|sure|certainly|below|note|mandatory|requirements|sentence|phrase)/i.test(line) && line.endsWith(':')) continue;

      let cleaned = line.replace(/^(?:\d+[\.\)]|\-|\*)\s*/, '').trim();
      cleaned = cleaned.replace(/^(?:phrase|sentence|english):\s*/i, '').trim();
      cleaned = cleaned.replace(/^['"`]|['"`]$/g, '').trim();

      if (cleaned && cleaned.split(/\s+/).length >= 2 && !cleaned.endsWith(':')) {
        phrases.push(cleaned);
      }
    }
    return phrases;
  }
}

export async function streamChat(messages, onChunk) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('El chat necesita al menos un mensaje.');
  }

  const config = getDbConfig();
  if (config.llm_execution_mode === 'cloud') {
    return streamCloudChat(messages, onChunk, config);
  }

  return runExclusive(async () => {
    try {
      return await executePromptWithFallback(async (model) => {
        const sanitized = sanitizeChatMessages(messages);
        const systemMsg = sanitized.find((m) => m.role === 'system')?.content || undefined;
        const chatMsgs = sanitized.filter((m) => m.role !== 'system');
        if (chatMsgs.length === 0) {
          throw new Error('No hay mensajes de usuario en la conversación.');
        }

        const threads = calculateCpuThreads();
        const context = await model.createContext({
          contextSize: 2048,
          batchSize: 512,
          threads: { ideal: threads, min: Math.min(2, threads) },
          flashAttention: 'auto'
        });

        try {
          const session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt: systemMsg,
            autoDisposeSequence: true
          });

          const lastUserMsg = chatMsgs[chatMsgs.length - 1];
          const priorMsgs = chatMsgs.slice(0, -1);

          if (priorMsgs.length > 0) {
            const historyItems = [];
            let expectingUser = true;
            for (const item of priorMsgs) {
              if (expectingUser && item.role === 'user') {
                historyItems.push({ type: 'user', text: item.content });
                expectingUser = false;
              } else if (!expectingUser && item.role === 'assistant') {
                historyItems.push({ type: 'model', response: [item.content] });
                expectingUser = true;
              }
            }
            if (historyItems.length > 0 && historyItems[historyItems.length - 1].type === 'user') {
              historyItems.pop();
            }

            if (historyItems.length > 0) {
              try {
                session.setChatHistory(historyItems);
              } catch (err) {
                console.warn('[LLM Service] No se pudo establecer el historial del chat:', err.message);
              }
            }
          }

          return await session.prompt(lastUserMsg.content, {
            temperature: 0.3,
            maxTokens: 400,
            onTextChunk: (chunk) => onChunk(chunk)
          });
        } finally {
          try { await context.dispose(); } catch {}
        }
      });
    } catch (error) {
      throw new Error(`No se pudo generar la respuesta del chat: ${error.message}`);
    }
  });
}
