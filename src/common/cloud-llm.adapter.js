// src/common/cloud-llm.adapter.js
import { sanitizeChatMessages } from './helper.utilities.js';

export const CLOUD_PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recomendado - Rápido y económico)' },
      { id: 'gpt-4o', name: 'GPT-4o (Máxima capacidad)' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    defaultModel: 'gpt-4o-mini'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Recomendado - Ultra rápido)' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Última generación)' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Razonamiento profundo)' }
    ],
    defaultModel: 'gemini-1.5-flash'
  },
  groq: {
    id: 'groq',
    name: 'Groq (LPU Speed)',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B (Groq LPU - Alto Rendimiento)' },
      { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B (Groq LPU - Rápido)' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' }
    ],
    defaultModel: 'openai/gpt-oss-120b'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    models: [
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Recomendado - Rápido)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Máxima calidad)' }
    ],
    defaultModel: 'claude-3-5-haiku-20241022'
  }
};

/**
 * Valida una API Key realizando un ping de 1 token al proveedor seleccionado
 */
export async function validateApiKey({ provider, apiKey, model }) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return { valid: false, error: 'Por favor ingresa una API Key válida.' };
  }

  const selectedProvider = provider || 'openai';
  const selectedModel = model || CLOUD_PROVIDERS[selectedProvider]?.defaultModel || 'gpt-4o-mini';
  const cleanKey = apiKey.trim();

  try {
    if (selectedProvider === 'openai' || selectedProvider === 'groq') {
      const baseUrl = selectedProvider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        let msg = errorJson.error?.message || `Error ${response.status}: ${response.statusText}`;

        if (selectedProvider === 'groq') {
          try {
            const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
              headers: { 'Authorization': `Bearer ${cleanKey}` }
            });
            if (modelsRes.ok) {
              const modelsData = await modelsRes.json();
              const ids = (modelsData.data || []).map((m) => m.id);
              if (ids.length > 0) {
                msg += ` Modelos activos para tu clave: ${ids.join(', ')}`;
              } else {
                msg += ' Tu clave de Groq no tiene ningún modelo asignado en su proyecto.';
              }
            } else if (modelsRes.status === 401 || modelsRes.status === 403) {
              msg += ' Tu clave API no tiene permisos suficientes o la cuenta no está verificada en console.groq.com.';
            }
          } catch { }
        }

        return { valid: false, error: msg };
      }

      return { valid: true };
    }

    if (selectedProvider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${cleanKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 1 }
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const msg = errorJson.error?.message || `Error ${response.status}: ${response.statusText}`;
        return { valid: false, error: msg };
      }

      return { valid: true };
    }

    if (selectedProvider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': cleanKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        const msg = errorJson.error?.message || `Error ${response.status}: ${response.statusText}`;
        return { valid: false, error: msg };
      }

      return { valid: true };
    }

    return { valid: false, error: `Proveedor '${selectedProvider}' no reconocido.` };
  } catch (err) {
    return { valid: false, error: `Error de red al conectar con el servidor: ${err.message}` };
  }
}

/**
 * Inferencia de respuesta estructurada / prompt único en la nube
 */
export async function askCloudLLM(prompt, options = {}, config = {}) {
  const provider = config.cloud_provider || 'openai';
  const apiKey = (config.cloud_api_key || '').trim();
  const model = config.cloud_model || CLOUD_PROVIDERS[provider]?.defaultModel || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error(`Modo Cloud activo (${provider.toUpperCase()}), pero no se ha configurado una API Key en los Ajustes.`);
  }

  const systemPrompt = options.systemPrompt || undefined;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 300;

  if (provider === 'openai' || provider === 'groq') {
    const baseUrl = provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(`Error en API Cloud (${provider.toUpperCase()} ${response.status}): ${errJson.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const contents = [];

    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: `System Instruction: ${systemPrompt}` }] });
      contents.push({ role: 'model', parts: [{ text: 'Entendido.' }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(`Error en API Gemini (${response.status}): ${errJson.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  }

  if (provider === 'anthropic') {
    const messages = [{ role: 'user', content: prompt }];
    const bodyPayload = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    };
    if (systemPrompt) bodyPayload.system = systemPrompt;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(`Error en API Anthropic (${response.status}): ${errJson.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return (data.content?.[0]?.text || '').trim();
  }

  throw new Error(`Proveedor de IA Cloud no reconocido: '${provider}'`);
}

/**
 * Inferencia de chat en streaming desde la nube
 */
export async function streamCloudChat(messages, onChunk, config = {}) {
  const provider = config.cloud_provider || 'openai';
  const apiKey = (config.cloud_api_key || '').trim();
  const model = config.cloud_model || CLOUD_PROVIDERS[provider]?.defaultModel || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error(`Modo Cloud activo (${provider.toUpperCase()}), pero no se ha configurado una API Key en los Ajustes.`);
  }

  const sanitized = sanitizeChatMessages(messages);

  if (provider === 'openai' || provider === 'groq') {
    const baseUrl = provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: sanitized,
        temperature: 0.3,
        max_tokens: 400,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let extraHint = '';
      if (provider === 'groq') {
        try {
          const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            const ids = (modelsData.data || []).map((m) => m.id);
            if (ids.length > 0) {
              extraHint = ` Modelos disponibles para tu clave: ${ids.join(', ')}`;
            }
          }
        } catch { }
      }
      throw new Error(`Error Cloud (${provider.toUpperCase()} ${response.status}): ${errText}${extraHint}`);
    }

    await parseSseStream(response.body, (dataStr) => {
      if (dataStr === '[DONE]') return;
      try {
        const parsed = JSON.parse(dataStr);
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) onChunk(text);
      } catch { }
    });
    return;
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const contents = [];

    const systemMsg = sanitized.find((m) => m.role === 'system')?.content;
    if (systemMsg) {
      contents.push({ role: 'user', parts: [{ text: `System Instruction: ${systemMsg}` }] });
      contents.push({ role: 'model', parts: [{ text: 'Entendido.' }] });
    }

    for (const msg of sanitized.filter((m) => m.role !== 'system')) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: msg.content }] });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Error Gemini Cloud (${response.status}): ${errText}`);
    }

    await parseSseStream(response.body, (dataStr) => {
      try {
        const parsed = JSON.parse(dataStr);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onChunk(text);
      } catch { }
    });
    return;
  }

  if (provider === 'anthropic') {
    const systemMsg = sanitized.find((m) => m.role === 'system')?.content;
    const chatMsgs = sanitized.filter((m) => m.role !== 'system');

    const bodyPayload = {
      model,
      messages: chatMsgs,
      max_tokens: 400,
      temperature: 0.3,
      stream: true
    };
    if (systemMsg) bodyPayload.system = systemMsg;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Error Anthropic Cloud (${response.status}): ${errText}`);
    }

    await parseSseStream(response.body, (dataStr) => {
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onChunk(parsed.delta.text);
        }
      } catch { }
    });
    return;
  }

  throw new Error(`Proveedor Cloud no soportado para streaming: '${provider}'`);
}

/**
 * Parser de streams SSE para Node.js fetch (ReadableStream)
 */
async function parseSseStream(readableStream, onDataLine) {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data: ')) {
        onDataLine(trimmed.slice(6));
      } else if (trimmed.startsWith('data:')) {
        onDataLine(trimmed.slice(5).trim());
      }
    }
  }

  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data: ')) {
      onDataLine(trimmed.slice(6));
    }
  }
}
