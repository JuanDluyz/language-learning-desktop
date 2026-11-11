// src/service/inference-config-service/inference-config.service.js

export function validateSessionOptions(options = {}) {
  const level = options.level || 'B1';
  const topic = options.topic || 'General';
  const tone = options.tone || 'Casual';
  const count = Math.max(1, Math.min(20, Number(options.count) || 5));
  const targetWords = String(options.targetWords || '').trim();
  const customPrompt = String(options.customPrompt || '').trim();
  const integrateVocabulary = Boolean(options.integrateVocabulary);
  const mode = options.mode || 'thematic';
  const groupId = options.groupId ? Number(options.groupId) : null;
  const groupName = options.groupName ? String(options.groupName) : '';
  return { level, topic, tone, count, targetWords, customPrompt, integrateVocabulary, mode, groupId, groupName };
}

export async function checkEngineAvailability() {
  try {
    const status = await window.electronAPI?.getAppStatus?.();
    return Boolean(status?.modelAvailable);
  } catch {
    return false;
  }
}
