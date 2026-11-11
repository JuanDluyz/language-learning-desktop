// src/service/chat-service/chat.service.js

const CONTRACTION_MAP = {
  "i'm": "i am",
  "you're": "you are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "we're": "we are",
  "they're": "they are",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "he'll": "he will",
  "she'll": "she will",
  "we'll": "we will",
  "they'll": "they will",
  "i'd": "i would",
  "he'd": "he would",
  "she'd": "she would",
  "we'd": "we would",
  "they'd": "they would",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "can't": "can not",
  "cannot": "can not",
  "won't": "will not",
  "wasn't": "was not",
  "weren't": "were not",
  "isn't": "is not",
  "aren't": "are not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "shouldn't": "should not",
  "couldn't": "could not",
  "wouldn't": "would not",
  "should've": "should have",
  "could've": "could have",
  "would've": "would have",
  "must've": "must have"
};

export function normalizeSentenceForEval(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/["“”«»]/g, '')
    .replace(/[.,/#!$%^&*;:{}=\-_~()?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandContractions(text) {
  const words = normalizeSentenceForEval(text).split(' ').filter(Boolean);
  return words.map((w) => CONTRACTION_MAP[w] || w).join(' ');
}

export function levenshteinDistance(s1, s2) {
  const a = String(s1 || '');
  const b = String(s2 || '');
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function evaluateTranscriptionLocally(phrase, userText) {
  const origClean = normalizeSentenceForEval(phrase);
  const userClean = normalizeSentenceForEval(userText);

  if (!origClean || !userClean) {
    return { isHandled: false };
  }

  // Coincidencia exacta (ignorando mayúsculas y signos)
  if (origClean === userClean) {
    return {
      isHandled: true,
      isCorrect: true,
      feedback: 'Transcripción correcta. Has reproducido la frase con total exactitud.'
    };
  }

  // Equivalencia de contracciones
  const origExpanded = expandContractions(phrase);
  const userExpanded = expandContractions(userText);
  if (origExpanded === userExpanded) {
    return {
      isHandled: true,
      isCorrect: true,
      feedback: 'Transcripción correcta. Se reconoce la equivalencia de contracciones empleada.'
    };
  }

  // Análisis determinista de discrepancia léxica simple
  const origWords = origClean.split(' ');
  const userWords = userClean.split(' ');

  // Mismo conteo de palabras: verificar si difiere una sola palabra
  if (origWords.length === userWords.length) {
    const diffs = [];
    for (let i = 0; i < origWords.length; i += 1) {
      if (origWords[i] !== userWords[i]) {
        diffs.push({ index: i, expected: origWords[i], actual: userWords[i] });
      }
    }

    if (diffs.length === 1) {
      const { expected, actual } = diffs[0];
      const dist = levenshteinDistance(expected, actual);
      if (dist <= 2) {
        return {
          isHandled: true,
          isCorrect: false,
          feedback: `Casi exacto. Error ortográfico en "${actual}" (forma esperada: "${expected}"). Frase correcta: "${phrase}".`
        };
      }
      return {
        isHandled: true,
        isCorrect: false,
        feedback: `Diferencia de una palabra: escribiste "${actual}", pero en el audio se dijo "${expected}". Frase correcta: "${phrase}".`
      };
    }
  }

  // Difiere por una sola palabra faltante
  if (origWords.length === userWords.length + 1) {
    let i = 0;
    let j = 0;
    const missing = [];
    while (i < origWords.length && j < userWords.length) {
      if (origWords[i] === userWords[j]) {
        i += 1;
        j += 1;
      } else {
        missing.push(origWords[i]);
        i += 1;
      }
    }
    while (i < origWords.length) {
      missing.push(origWords[i]);
      i += 1;
    }

    if (missing.length === 1) {
      return {
        isHandled: true,
        isCorrect: false,
        feedback: `Transcripción casi completa. Omitiste la palabra "${missing[0]}". Frase correcta: "${phrase}".`
      };
    }
  }

  return { isHandled: false };
}

export function buildSystemPrompt(defaultSystemPrompt, level, phrase, tone) {
  const base = defaultSystemPrompt || '';
  const toneInfo = tone ? `\nTono/registro objetivo de la sesión: ${tone}.` : '';
  return `${base}\n\nREGLA MANDATORIA DE IDIOMA: Responde SIEMPRE 100% EN ESPAÑOL. Queda estrictamente prohibido redactar explicaciones en inglés o usar encabezados como 'Overall Assessment'. Solo escribe en inglés las palabras o citas de la frase original.\nNivel de práctica: ${level || 'B1'}.${toneInfo}\nFrase actual en pantalla: "${phrase || ''}"`;
}

export function buildEvaluationPrompt(phrase, userText) {
  return `Compara la transcripción del usuario con la frase original y proporciona retroalimentación breve y pedagógica en español.

[DATOS]
- Frase original: "${phrase || ''}"
- Transcripción del usuario: "${userText || ''}"

PAUTAS:
1. Responde 100% en español (máximo 2 a 3 oraciones).
2. Señala con precisión si fue un error fonético/auditivo, ortográfico o gramatical.
3. Muestra la frase original correcta entre comillas.
4. Texto plano sin asteriscos ni markdown.`;
}

export function buildWordDefinitionPrompt(selection, phrase) {
  const cleanSelection = String(selection || '').trim();
  const isMultiWord = cleanSelection.includes(' ');
  const termType = isMultiWord ? 'expresión' : 'palabra';
  const cleanPhrase = String(phrase || '').trim();

  if (!cleanPhrase || cleanPhrase.toLowerCase() === cleanSelection.toLowerCase()) {
    return `Define la ${termType} "${cleanSelection}". Indica directamente su traducción principal al español, categoría gramatical y definición en máximo 2 oraciones, sin introducciones redundantes.`;
  }

  return `Define la ${termType} "${cleanSelection}". Oración de contexto: "${cleanPhrase}". Proporciona directamente su significado al español, categoría gramatical y sentido en esta oración en máximo 2 oraciones concisas, sin frases introductorias ni repetir la oración.`;
}

export const buildWordExplanationPrompt = buildWordDefinitionPrompt;

export function buildChatPayload({ systemPrompt, history = [], userContent }) {
  const userMessage = { role: 'user', content: userContent };
  const formattedHistory = (history || []).map((msg) => ({
    role: msg.role,
    content: msg.promptContent || msg.content
  }));
  const messages = [
    { role: 'system', content: systemPrompt },
    ...formattedHistory,
    userMessage
  ];
  return { userMessage, messages };
}

export async function fetchModelAvailability() {
  try {
    const status = await window.electronAPI?.getAppStatus?.();
    return Boolean(status?.modelAvailable);
  } catch {
    return false;
  }
}
