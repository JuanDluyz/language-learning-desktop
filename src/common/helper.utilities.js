export function normalizeText(value = '') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

export function cleanWordPunctuation(word = '') {
  return String(word ?? '')
    .replace(/^[.,?!;:"'()]+|[.,?!;:"'()]+$/g, '')
    .replace(/[^a-zA-Z0-9']/g, '')
    .trim();
}

export function shuffle(items = []) {
  return [...items].sort(() => Math.random() - 0.5);
}

export function parseJsonArrayStrings(value = '') {
  const text = String(value ?? '');
  const jsonMatch = text.match(/\[[\s\S]*\]/)?.[0];
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string' && item.trim()).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

/**
 * Sanitiza los turnos del historial de chat para motores LLM locales:
 * 1. Fusiona múltiples mensajes 'system' iniciales.
 * 2. Concatena mensajes consecutivos del mismo rol.
 * 3. Garantiza que el último mensaje sea del rol 'user'.
 */
export function sanitizeChatMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const rawMessages = messages.filter((m) => m && m.content && String(m.content).trim());
  if (rawMessages.length === 0) return [];

  // 1. Separar y fusionar mensajes system iniciales
  const systemContents = [];
  const conversation = [];

  for (const msg of rawMessages) {
    if (msg.role === 'system') {
      systemContents.push(msg.content.trim());
    } else {
      conversation.push({ role: msg.role, content: msg.content.trim() });
    }
  }

  const mergedSystem = systemContents.join('\n\n');

  // 2. Fusionar mensajes consecutivos del mismo rol
  const mergedConversation = [];
  for (const msg of conversation) {
    if (mergedConversation.length === 0) {
      mergedConversation.push({ ...msg });
    } else {
      const last = mergedConversation[mergedConversation.length - 1];
      if (last.role === msg.role) {
        last.content += `\n${msg.content}`;
      } else {
        mergedConversation.push({ ...msg });
      }
    }
  }

  // 3. Garantizar que el último mensaje sea 'user'
  if (mergedConversation.length > 0 && mergedConversation[mergedConversation.length - 1].role !== 'user') {
    // Elimina respuestas de assistant sobrantes al final
    while (mergedConversation.length > 0 && mergedConversation[mergedConversation.length - 1].role !== 'user') {
      mergedConversation.pop();
    }
  }

  const result = [];
  if (mergedSystem) {
    result.push({ role: 'system', content: mergedSystem });
  }

  return [...result, ...mergedConversation];
}

export function formatChatMessages(messages = []) {
  const sanitized = sanitizeChatMessages(messages);
  return sanitized
    .map(({ role, content }) => `${String(role).toUpperCase()}:\n${String(content ?? '')}`)
    .join('\n\n');
}

export function buildSentenceBatchPrompt({ level = 'B1', topic = 'General', remaining = 1 }) {
  return `Generate up to ${remaining} short English sentences for a transcription exercise. ` +
    `CEFR level: ${level}. Topic: ${topic}. Return only a valid JSON array of strings, with no markdown or explanation.`;
}
